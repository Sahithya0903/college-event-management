const mongoose = require('mongoose');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const Payment = require('../models/Payment');
const Favorite = require('../models/Favorite');
const { HttpError, asyncHandler } = require('../middleware/error');
const { generateId } = require('../utils/generateId');
const { notify } = require('../utils/notify');
const { releaseRegistration } = require('../utils/registrationService');

const isId = (v) => mongoose.isValidObjectId(v);
const str = (v) => (typeof v === 'string' ? v.trim() : '');

exports.create = asyncHandler(async (req, res) => {
  const { eventId } = req.body;
  if (!isId(eventId)) throw new HttpError(400, 'Choose a valid event');

  const fullName = str(req.body.fullName) || req.user.name;
  const email = (str(req.body.email) || req.user.email).toLowerCase();
  const phone = str(req.body.phone) || req.user.phone;
  const organization = str(req.body.organization) || req.user.organization;
  const designation = str(req.body.designation);
  const address = str(req.body.address);
  const extra = str(req.body.extra);
  if (!phone) throw new HttpError(400, 'Enter a phone number');

  const event = await Event.findById(eventId);
  if (!event || event.status === 'draft') throw new HttpError(404, 'Event not found');

  const existing = await Registration.findOne({ eventId, userId: req.user._id });
  if (existing && !['cancelled', 'rejected'].includes(existing.status)) {
    throw new HttpError(409, 'You are already registered for this event');
  }
  if (!event.canRegister) {
    throw new HttpError(409, event.seatsLeft <= 0 ? 'This event is full' : 'Registration is not open for this event');
  }

  const requiresPayment = event.fee > 0;
  const payload = {
    status: requiresPayment ? 'pending' : 'confirmed',
    paymentStatus: requiresPayment ? 'pending' : 'not_required',
    fullName,
    email,
    phone,
    organization,
    designation,
    address,
    extra,
    registeredAt: new Date(),
  };

  let reg;
  if (existing) {
    Object.assign(existing, payload);
    reg = await existing.save();
  } else {
    reg = await Registration.create({ eventId, userId: req.user._id, registrationId: generateId('REG'), ...payload });
  }
  await Event.updateOne({ _id: eventId }, { $inc: { registeredCount: 1 } });

  await notify(req.user._id, {
    title: requiresPayment ? 'Registration pending payment' : 'Registration confirmed',
    message: requiresPayment
      ? `You're almost registered for "${event.title}". Complete payment of ₹${event.fee} to confirm your seat.`
      : `You're registered for "${event.title}". See you there!`,
    type: 'registration',
    eventId: event._id,
    link: `/registration.html?id=${reg._id}`,
  });

  res.status(201).json({ success: true, registration: reg, requiresPayment });
});

exports.myRegistrations = asyncHandler(async (req, res) => {
  const filter = { userId: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  const registrations = await Registration.find(filter)
    .sort('-registeredAt')
    .populate({ path: 'eventId', select: 'title startDate startTime venue location image fee status' });
  res.json({ success: true, registrations });
});

async function loadForOwnerOrStaff(id, user) {
  if (!isId(id)) throw new HttpError(404, 'Registration not found');
  const reg = await Registration.findById(id).populate({ path: 'eventId', select: '+paymentQr' });
  if (!reg) throw new HttpError(404, 'Registration not found');
  const isOwner = String(reg.userId) === String(user._id);
  const isStaff = user.role === 'admin' || (reg.eventId && String(reg.eventId.organizerId) === String(user._id));
  if (!isOwner && !isStaff) throw new HttpError(403, 'You do not have access to this registration');
  return { reg, isOwner, isStaff };
}

exports.getOne = asyncHandler(async (req, res) => {
  const { reg } = await loadForOwnerOrStaff(req.params.id, req.user);
  res.json({ success: true, registration: reg });
});

exports.cancel = asyncHandler(async (req, res) => {
  const { reg, isOwner, isStaff } = await loadForOwnerOrStaff(req.params.id, req.user);
  if (['cancelled', 'rejected'].includes(reg.status)) throw new HttpError(409, 'This registration is already cancelled');
  if (reg.status === 'attended') throw new HttpError(409, 'Attendance was already marked; this registration cannot be cancelled');
  await releaseRegistration(reg, 'cancelled');
  await Favorite.deleteOne({ userId: reg.userId, eventId: reg.eventId._id || reg.eventId });
  if (isStaff && !isOwner) {
    await notify(reg.userId, {
      title: 'Registration cancelled',
      message: `Your registration for "${reg.eventId.title}" was cancelled by the organizer.`,
      type: 'registration',
      eventId: reg.eventId._id,
    });
  }
  res.json({ success: true, registration: reg });
});

// Staff-only: approve / reject / mark no-show.
exports.setStatus = asyncHandler(async (req, res) => {
  const { reg, isStaff } = await loadForOwnerOrStaff(req.params.id, req.user);
  if (!isStaff) throw new HttpError(403, 'Only the organizer can change registration status');
  const { status } = req.body;
  if (!['confirmed', 'rejected', 'no_show'].includes(status)) throw new HttpError(400, 'Unsupported status');
  if (status === 'confirmed' && reg.eventId.fee > 0 && reg.paymentStatus !== 'paid') {
    throw new HttpError(409, 'Approve the participant payment proof before confirming this paid registration');
  }

  if (status === 'rejected') {
    await releaseRegistration(reg, 'rejected');
  } else {
    reg.status = status;
    await reg.save();
  }
  await notify(reg.userId, {
    title: status === 'rejected' ? 'Registration rejected' : 'Registration update',
    message: `Your registration for "${reg.eventId.title}" is now ${status.replace('_', ' ')}.`,
    type: 'registration',
    eventId: reg.eventId._id,
  });
  res.json({ success: true, registration: reg });
});

exports.forEvent = asyncHandler(async (req, res) => {
  const Event = require('../models/Event');
  const event = await Event.findById(req.params.eventId);
  if (!event) throw new HttpError(404, 'Event not found');
  if (req.user.role !== 'admin' && String(event.organizerId) !== String(req.user._id)) {
    throw new HttpError(403, 'You can only view participants for your own events');
  }
  const filter = { eventId: event._id };
  if (req.query.status) filter.status = req.query.status;
  const [registrations, payments] = await Promise.all([
    Registration.find(filter).sort('-registeredAt').populate('userId', 'name email'),
    Payment.find({ eventId: event._id }).sort('-createdAt').select('registrationId status providerReference createdAt'),
  ]);
  const latestPayment = new Map();
  for (const payment of payments) {
    const key = String(payment.registrationId);
    if (!latestPayment.has(key)) {
      latestPayment.set(key, {
        _id: payment._id,
        status: payment.status,
        providerReference: payment.providerReference,
        submittedAt: payment.createdAt,
      });
    }
  }
  const results = registrations.map((reg) => ({
    ...reg.toJSON(),
    payment: latestPayment.get(String(reg._id)) || null,
  }));
  res.json({ success: true, registrations: results, event: { id: event._id, title: event.title } });
});

// CSV export of participants for an event.
exports.exportEvent = asyncHandler(async (req, res) => {
  const Event = require('../models/Event');
  const event = await Event.findById(req.params.eventId);
  if (!event) throw new HttpError(404, 'Event not found');
  if (req.user.role !== 'admin' && String(event.organizerId) !== String(req.user._id)) {
    throw new HttpError(403, 'You can only export participants for your own events');
  }
  const registrations = await Registration.find({ eventId: event._id }).sort('registeredAt');
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['Registration ID', 'Name', 'Email', 'Phone', 'Organization', 'Status', 'Payment', 'Registered At'].join(','),
    ...registrations.map((r) =>
      [r.registrationId, r.fullName, r.email, r.phone, r.organization, r.status, r.paymentStatus, r.registeredAt.toISOString()].map(esc).join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${event.title.replace(/[^a-z0-9]+/gi, '_')}-participants.csv"`);
  res.send(rows.join('\n'));
});
