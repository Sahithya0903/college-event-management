const mongoose = require('mongoose');
const User = require('../models/User');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');
const Feedback = require('../models/Feedback');
const { HttpError, asyncHandler } = require('../middleware/error');

const rx = (s) => new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

exports.dashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const [
    totalUsers,
    totalEvents,
    upcomingEvents,
    completedEvents,
    totalRegistrations,
    confirmedRegistrations,
    pendingRegistrations,
    revenueAgg,
    attendanceAgg,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Event.countDocuments(),
    Event.countDocuments({ startDate: { $gte: now }, status: { $nin: ['draft', 'cancelled'] } }),
    Event.countDocuments({ $or: [{ status: 'completed' }, { endDate: { $lt: now }, status: { $ne: 'cancelled' } }] }),
    Registration.countDocuments(),
    Registration.countDocuments({ status: 'confirmed' }),
    Registration.countDocuments({ status: 'pending' }),
    Payment.aggregate([{ $match: { status: 'successful' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Attendance.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const attendance = { present: 0, absent: 0 };
  attendanceAgg.forEach((a) => (attendance[a._id] = a.count));

  const recentPayments = await Payment.find({ status: 'successful' }).sort('-createdAt').limit(5).populate('eventId', 'title').populate('userId', 'name');

  res.json({
    success: true,
    stats: {
      totalUsers,
      totalEvents,
      upcomingEvents,
      completedEvents,
      totalRegistrations,
      confirmedRegistrations,
      pendingRegistrations,
      revenue: revenueAgg[0]?.total || 0,
      attendance,
    },
    recentPayments,
  });
});

exports.analytics = asyncHandler(async (req, res) => {
  const [eventsByStatus, registrationsByStatus, revenueByEvent, feedbackAvg] = await Promise.all([
    Event.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Registration.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Payment.aggregate([
      { $match: { status: 'successful' } },
      { $group: { _id: '$eventId', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'events', localField: '_id', foreignField: '_id', as: 'event' } },
      { $unwind: '$event' },
      { $project: { title: '$event.title', total: 1 } },
    ]),
    Feedback.aggregate([{ $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, eventsByStatus, registrationsByStatus, revenueByEvent, feedback: feedbackAvg[0] || { avg: 0, count: 0 } });
});

exports.listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.$or = [{ name: rx(req.query.q) }, { email: rx(req.query.q) }];
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const [users, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ success: true, users, total, page, pages: Math.ceil(total / limit) });
});

exports.updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  if (String(user._id) === String(req.user._id) && (req.body.status === 'blocked' || req.body.role)) {
    throw new HttpError(400, "You cannot change your own role or block yourself");
  }
  if (req.body.role && ['admin', 'organizer', 'user'].includes(req.body.role)) user.role = req.body.role;
  if (req.body.status && ['active', 'blocked'].includes(req.body.status)) user.status = req.body.status;
  await user.save();
  res.json({ success: true, user });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw new HttpError(400, 'You cannot delete your own account');
  const user = await User.findById(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  const owns = await Event.countDocuments({ organizerId: user._id });
  if (owns) throw new HttpError(409, `This user organizes ${owns} event(s). Reassign or delete those events first`);
  await user.deleteOne();
  res.json({ success: true, message: 'User deleted' });
});

// ---------- Admin: all registrations & all payments ----------
const csvEsc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function buildRegistrationFilter(q) {
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
  if (q.eventId && mongoose.isValidObjectId(q.eventId)) filter.eventId = q.eventId;
  if (q.q) {
    const r = rx(q.q);
    filter.$or = [{ fullName: r }, { email: r }, { phone: r }, { registrationId: r }];
  }
  return filter;
}

async function buildPaymentFilter(q) {
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.eventId && mongoose.isValidObjectId(q.eventId)) filter.eventId = q.eventId;
  if (q.q) {
    const r = rx(q.q);
    const users = await User.find({ $or: [{ name: r }, { email: r }] }).select('_id');
    filter.$or = [{ transactionId: r }, { userId: { $in: users.map((u) => u._id) } }];
  }
  return filter;
}

exports.listRegistrations = asyncHandler(async (req, res) => {
  const filter = await buildRegistrationFilter(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const [registrations, total] = await Promise.all([
    Registration.find(filter)
      .sort('-registeredAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('eventId', 'title fee startDate')
      .populate('userId', 'name email'),
    Registration.countDocuments(filter),
  ]);
  res.json({ success: true, registrations, total, page, pages: Math.ceil(total / limit) || 1 });
});

exports.exportRegistrations = asyncHandler(async (req, res) => {
  const filter = await buildRegistrationFilter(req.query);
  const regs = await Registration.find(filter).sort('-registeredAt').populate('eventId', 'title');
  const rows = [
    ['Registration ID', 'Event', 'Name', 'Email', 'Phone', 'Organization', 'Status', 'Payment', 'Registered At'].join(','),
    ...regs.map((r) =>
      [r.registrationId, r.eventId?.title, r.fullName, r.email, r.phone, r.organization, r.status, r.paymentStatus, r.registeredAt.toISOString()]
        .map(csvEsc)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
  res.send(rows.join('\n'));
});

exports.listPayments = asyncHandler(async (req, res) => {
  const filter = await buildPaymentFilter(req.query);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const [payments, total, sums] = await Promise.all([
    Payment.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('eventId', 'title')
      .populate('userId', 'name email')
      .populate('registrationId', 'registrationId'),
    Payment.countDocuments(filter),
    Payment.aggregate([{ $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);
  const summary = { successful: 0, pending: 0, submitted: 0, failed: 0, refunded: 0 };
  sums.forEach((s) => (summary[s._id] = s.total));
  res.json({ success: true, payments, total, page, pages: Math.ceil(total / limit) || 1, summary });
});

exports.exportPayments = asyncHandler(async (req, res) => {
  const filter = await buildPaymentFilter(req.query);
  const payments = await Payment.find(filter).sort('-createdAt').populate('eventId', 'title').populate('userId', 'name email');
  const rows = [
    ['Transaction ID', 'Event', 'User', 'Email', 'Amount', 'Currency', 'Method', 'Status', 'Date'].join(','),
    ...payments.map((p) =>
      [p.transactionId, p.eventId?.title, p.userId?.name, p.userId?.email, p.amount, p.currency, p.paymentMethod, p.status, p.createdAt.toISOString()]
        .map(csvEsc)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
  res.send(rows.join('\n'));
});
