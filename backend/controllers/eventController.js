const mongoose = require('mongoose');
const Event = require('../models/Event');
const Category = require('../models/Category');
const Registration = require('../models/Registration');
const Attendance = require('../models/Attendance');
const Favorite = require('../models/Favorite');
const Feedback = require('../models/Feedback');
const Certificate = require('../models/Certificate');
const { HttpError, asyncHandler } = require('../middleware/error');
const { removeUploadedFile } = require('../middleware/uploadMiddleware');
const { notifyMany } = require('../utils/notify');
const { SEAT_STATUSES, releaseRegistration } = require('../utils/registrationService');

const isId = (v) => mongoose.isValidObjectId(v);
const rx = (s) => new RegExp(String(s).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const idOf = (v) => String(v && v._id ? v._id : v);
const canManage = (user, event) => !!user && (user.role === 'admin' || idOf(event.organizerId) === String(user._id));

const todayUtc = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

async function resolveCategory(value) {
  if (isId(value)) return Category.findById(value);
  return Category.findOne({ $or: [{ slug: String(value).toLowerCase() }, { name: rx(value) }] });
}

// ---------- body parsing ----------
function parseBody(b) {
  const out = {};
  ['title', 'description', 'venue', 'location', 'organizerName', 'contactEmail', 'contactPhone', 'startTime', 'endTime', 'certificateTitle', 'certificateMessage'].forEach((k) => {
    if (b[k] !== undefined) out[k] = String(b[k]).trim();
  });
  if (b.certificateLayout !== undefined) {
    if (!['classic', 'modern', 'minimal', 'custom'].includes(b.certificateLayout)) throw new HttpError(400, 'Choose a valid certificate layout');
    out.certificateLayout = b.certificateLayout;
  }
  if (b.certificateAccent !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(b.certificateAccent))) throw new HttpError(400, 'Choose a valid certificate accent color');
    out.certificateAccent = String(b.certificateAccent);
  }
  if (b.category !== undefined) out.category = b.category;
  ['startDate', 'endDate'].forEach((k) => {
    if (b[k] !== undefined && b[k] !== '') out[k] = new Date(b[k]);
  });
  if (b.registrationDeadline !== undefined) out.registrationDeadline = b.registrationDeadline ? new Date(b.registrationDeadline) : null;
  if (b.fee !== undefined && b.fee !== '') out.fee = Number(b.fee);
  if (b.capacity !== undefined && b.capacity !== '') out.capacity = Number(b.capacity);
  if (b.isCompetition !== undefined) out.isCompetition = ['true', '1'].includes(String(b.isCompetition).toLowerCase());
  if (b.highlights !== undefined) {
    const list = Array.isArray(b.highlights) ? b.highlights : String(b.highlights).split('\n');
    out.highlights = list.map((h) => String(h).trim()).filter(Boolean).slice(0, 12);
  }
  if (b.schedule !== undefined) {
    let list = b.schedule;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list || '[]');
      } catch {
        throw new HttpError(400, 'Schedule is not valid');
      }
    }
    out.schedule = (Array.isArray(list) ? list : [])
      .filter((s) => s && s.title)
      .slice(0, 30)
      .map((s) => ({ time: String(s.time || '').trim(), title: String(s.title).trim(), details: String(s.details || '').trim() }));
  }
  if (b.status !== undefined && Event.STATUSES.includes(b.status)) out.status = b.status;
  return out;
}

function assertDates(e) {
  if (isNaN(e.startDate) || isNaN(e.endDate)) throw new HttpError(400, 'Enter valid start and end dates');
  if (e.endDate < e.startDate) throw new HttpError(400, 'End date cannot be before the start date');
  if (+e.endDate === +e.startDate && e.endTime <= e.startTime) throw new HttpError(400, 'End time must be after the start time');
  if (e.registrationDeadline && e.registrationDeadline > e.endDate) throw new HttpError(400, 'Registration deadline must be on or before the event ends');
}

// ---------- shared: cancel an event ----------
async function cancelEventRegistrations(event, reason) {
  const regs = await Registration.find({ eventId: event._id, status: { $in: SEAT_STATUSES } });
  for (const reg of regs) await releaseRegistration(reg, 'cancelled');
  await notifyMany(regs.map((r) => r.userId), {
    title: 'Event cancelled',
    message: `"${event.title}" has been cancelled.${reason ? ` ${reason}` : ''} Any fee you paid will be refunded.`,
    type: 'event',
    eventId: event._id,
    link: `/event-details.html?id=${event._id}`,
  });
}

// ---------- handlers ----------
exports.list = asyncHandler(async (req, res) => {
  const { q, category, location, date, organizer, fee, sort = 'date', when = 'upcoming', status } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));

  const filter = { status: { $ne: 'draft' } };
  const and = [];

  if (q) and.push({ $or: [{ title: rx(q) }, { description: rx(q) }, { organizerName: rx(q) }] });
  if (location) and.push({ $or: [{ location: rx(location) }, { venue: rx(location) }] });
  if (organizer) filter.organizerName = rx(organizer);
  if (fee === 'free') filter.fee = 0;
  if (fee === 'paid') filter.fee = { $gt: 0 };
  if (status && Event.STATUSES.includes(status) && status !== 'draft') filter.status = status;

  if (category) {
    const cat = await resolveCategory(category);
    if (!cat) return res.json({ success: true, events: [], total: 0, page: 1, pages: 0 });
    filter.category = cat._id;
  }

  if (/^\d{4}-\d{2}$/.test(date || '')) {
    const start = new Date(`${date}-01T00:00:00Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    and.push({ startDate: { $lt: end }, endDate: { $gte: start } });
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    const day = new Date(`${date}T00:00:00Z`);
    and.push({ startDate: { $lte: day }, endDate: { $gte: day } });
  } else if (when === 'upcoming') {
    filter.endDate = { $gte: todayUtc() };
  } else if (when === 'past') {
    filter.endDate = { $lt: todayUtc() };
  }
  if (and.length) filter.$and = and;

  const sorts = {
    date: { startDate: 1, startTime: 1 },
    newest: { createdAt: -1 },
    popular: { registeredCount: -1, startDate: 1 },
    price_low: { fee: 1, startDate: 1 },
    price_high: { fee: -1, startDate: 1 },
  };
  const order = when === 'past' && sort === 'date' ? { startDate: -1 } : sorts[sort] || sorts.date;

  const [events, total] = await Promise.all([
    Event.find(filter).sort(order).skip((page - 1) * limit).limit(limit).populate('category', 'name slug icon'),
    Event.countDocuments(filter),
  ]);
  res.json({ success: true, events, total, page, pages: Math.ceil(total / limit) });
});

exports.mine = asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { organizerId: req.user._id };
  if (req.query.status && Event.STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.q) filter.title = rx(req.query.q);
  const events = await Event.find(filter).select('+paymentQr +rankingCertificateBackground +rankings +rankingsConfirmed').sort('-createdAt').populate('category', 'name slug icon').populate('organizerId', 'name');
  res.json({ success: true, events });
});

exports.getOne = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw new HttpError(404, 'Event not found');
  const event = await Event.findById(req.params.id).populate('category', 'name slug icon').populate('organizerId', 'name');
  if (!event || (event.status === 'draft' && !canManage(req.user, event))) throw new HttpError(404, 'Event not found');

  let myRegistration = null;
  let isFavorite = false;
  if (req.user) {
    [myRegistration, isFavorite] = await Promise.all([
      Registration.findOne({ eventId: event._id, userId: req.user._id }).select('registrationId status paymentStatus'),
      Favorite.exists({ eventId: event._id, userId: req.user._id }).then(Boolean),
    ]);
  }
  res.json({ success: true, event, myRegistration, isFavorite, canManage: canManage(req.user, event) });
});

exports.create = asyncHandler(async (req, res) => {
  const data = parseBody(req.body);
  const eventImage = req.files?.image?.[0];
  const certificateBackground = req.files?.certificateBackground?.[0];
  const paymentQr = req.files?.paymentQr?.[0];
  if (eventImage) data.image = `/uploads/events/${eventImage.filename}`;
  if (certificateBackground) data.certificateBackground = `/uploads/events/${certificateBackground.filename}`;
  if (paymentQr) data.paymentQr = `/uploads/events/${paymentQr.filename}`;
  if ((data.fee || 0) > 0 && !data.paymentQr) {
    if (eventImage) removeUploadedFile(data.image);
    if (certificateBackground) removeUploadedFile(data.certificateBackground);
    if (paymentQr) removeUploadedFile(data.paymentQr);
    throw new HttpError(400, 'Upload the organiser payment QR code for a paid event');
  }
  if (data.certificateLayout === 'custom' && !data.certificateBackground) {
    if (eventImage) removeUploadedFile(data.image);
    if (certificateBackground) removeUploadedFile(data.certificateBackground);
    if (paymentQr) removeUploadedFile(data.paymentQr);
    throw new HttpError(400, 'Upload a certificate background image when using the custom layout');
  }
  try {
    if (!data.category || !isId(data.category) || !(await Category.exists({ _id: data.category }))) throw new HttpError(400, 'Choose a valid category');
    const event = new Event({
      ...data,
      status: data.status || 'draft',
      organizerId: req.user._id,
      organizerName: data.organizerName || req.user.name,
      contactEmail: data.contactEmail || req.user.email,
      contactPhone: data.contactPhone || req.user.phone,
    });
    assertDates(event);
    await event.save();
    res.status(201).json({ success: true, event });
  } catch (err) {
    if (eventImage) removeUploadedFile(data.image);
    if (certificateBackground) removeUploadedFile(data.certificateBackground);
    if (paymentQr) removeUploadedFile(data.paymentQr);
    throw err;
  }
});

exports.update = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).select('+paymentQr +rankingCertificateBackground');
  if (!event) throw new HttpError(404, 'Event not found');
  if (!canManage(req.user, event)) throw new HttpError(403, 'You can only edit your own events');

  const data = parseBody(req.body);
  const eventImage = req.files?.image?.[0];
  const certificateImage = req.files?.certificateBackground?.[0];
  const paymentQrImage = req.files?.paymentQr?.[0];
  const newImage = eventImage ? `/uploads/events/${eventImage.filename}` : null;
  const newCertificateBackground = certificateImage ? `/uploads/events/${certificateImage.filename}` : null;
  const newPaymentQr = paymentQrImage ? `/uploads/events/${paymentQrImage.filename}` : null;

  try {
    if (data.category !== undefined && (!isId(data.category) || !(await Category.exists({ _id: data.category })))) throw new HttpError(400, 'Choose a valid category');
    if (data.capacity !== undefined && data.capacity < event.registeredCount) {
      throw new HttpError(400, `Capacity cannot be lower than the ${event.registeredCount} people already registered`);
    }

    const before = { venue: event.venue, location: event.location, date: +event.startDate, startTime: event.startTime, endTime: event.endTime, status: event.status };
    const originalImage = event.image;
    const originalCertificateBackground = event.certificateBackground;
    const originalPaymentQr = event.paymentQr;

    Object.assign(event, data);
    if (data.registrationDeadline === null) event.registrationDeadline = undefined;
    if (newImage) event.image = newImage;
    else if (req.body.removeImage === 'true') event.image = '';
    if (newCertificateBackground) event.certificateBackground = newCertificateBackground;
    else if (req.body.removeCertificateBackground === 'true') event.certificateBackground = '';
    if (newPaymentQr) event.paymentQr = newPaymentQr;
    else if (req.body.removePaymentQr === 'true') event.paymentQr = '';
    if (event.fee > 0 && !event.paymentQr) throw new HttpError(400, 'Upload the organiser payment QR code for a paid event');
    if (event.certificateLayout === 'custom' && !event.certificateBackground) {
      throw new HttpError(400, 'Upload a certificate background image when using the custom layout');
    }
    assertDates(event);

    await event.save();
    if (originalImage && originalImage !== event.image) removeUploadedFile(originalImage);
    if (originalCertificateBackground && originalCertificateBackground !== event.certificateBackground) removeUploadedFile(originalCertificateBackground);
    if (originalPaymentQr && originalPaymentQr !== event.paymentQr) removeUploadedFile(originalPaymentQr);

    if (event.status === 'cancelled' && before.status !== 'cancelled') {
      await cancelEventRegistrations(event, req.body.reason);
    } else if (event.status !== 'cancelled') {
      const changed = [];
      if (before.venue !== event.venue || before.location !== event.location) changed.push(`venue is now ${event.venue}, ${event.location}`);
      if (before.date !== +event.startDate || before.startTime !== event.startTime || before.endTime !== event.endTime) changed.push('date or time has changed');
      if (changed.length) {
        const regs = await Registration.find({ eventId: event._id, status: { $in: ['pending', 'confirmed'] } }).select('userId');
        await notifyMany(regs.map((r) => r.userId), {
          title: 'Event details changed',
          message: `Update for "${event.title}": ${changed.join(' and ')}.`,
          type: 'event',
          eventId: event._id,
          link: `/event-details.html?id=${event._id}`,
        });
      }
    }
    res.json({ success: true, event });
  } catch (err) {
    if (newImage) removeUploadedFile(newImage);
    if (newCertificateBackground) removeUploadedFile(newCertificateBackground);
    if (newPaymentQr) removeUploadedFile(newPaymentQr);
    throw err;
  }
});

exports.setStatus = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).select('+paymentQr +rankingCertificateBackground');
  if (!event) throw new HttpError(404, 'Event not found');
  if (!canManage(req.user, event)) throw new HttpError(403, 'You can only change your own events');
  const { status } = req.body;
  if (!Event.STATUSES.includes(status)) throw new HttpError(400, 'Unknown event status');
  const wasCancelled = event.status === 'cancelled';
  event.status = status;
  await event.save();
  if (status === 'cancelled' && !wasCancelled) await cancelEventRegistrations(event, req.body.reason);
  res.json({ success: true, event });
});

exports.remove = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id).select('+paymentQr +rankingCertificateBackground');
  if (!event) throw new HttpError(404, 'Event not found');
  if (!canManage(req.user, event)) throw new HttpError(403, 'You can only delete your own events');

  const active = await Registration.countDocuments({ eventId: event._id, status: { $in: SEAT_STATUSES } });
  if (active && event.status !== 'cancelled') {
    throw new HttpError(409, `${active} people are registered. Cancel the event first so they are notified and refunded`);
  }
  await Promise.all([
    Registration.deleteMany({ eventId: event._id }),
    Attendance.deleteMany({ eventId: event._id }),
    Favorite.deleteMany({ eventId: event._id }),
    Feedback.deleteMany({ eventId: event._id }),
    Certificate.deleteMany({ eventId: event._id }),
  ]);
  removeUploadedFile(event.image);
  removeUploadedFile(event.certificateBackground);
  removeUploadedFile(event.paymentQr);
  removeUploadedFile(event.rankingCertificateBackground);
  await event.deleteOne();
  res.json({ success: true, message: 'Event deleted' });
});

exports.canManage = canManage;
