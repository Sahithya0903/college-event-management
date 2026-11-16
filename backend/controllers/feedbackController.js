const Event = require('../models/Event');
const Registration = require('../models/Registration');
const Feedback = require('../models/Feedback');
const { HttpError, asyncHandler } = require('../middleware/error');

exports.create = asyncHandler(async (req, res) => {
  const { eventId, rating, comment } = req.body;
  const event = await Event.findById(eventId);
  if (!event) throw new HttpError(404, 'Event not found');

  const attended = await Registration.exists({ eventId, userId: req.user._id, status: 'attended' });
  if (!attended) throw new HttpError(403, 'You can only review events you registered for');
  if (event.liveStatus !== 'completed' && event.status !== 'completed') throw new HttpError(409, 'Feedback opens once the event has finished');

  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new HttpError(400, 'Rating must be 1 to 5');

  const feedback = await Feedback.findOneAndUpdate(
    { eventId, userId: req.user._id },
    { rating: n, comment: typeof comment === 'string' ? comment.trim().slice(0, 1000) : '' },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );
  res.status(201).json({ success: true, feedback });
});

exports.forEvent = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const [feedback, total, agg] = await Promise.all([
    Feedback.find({ eventId: req.params.eventId }).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('userId', 'name'),
    Feedback.countDocuments({ eventId: req.params.eventId }),
    Feedback.aggregate([{ $match: { eventId: new (require('mongoose').Types.ObjectId)(req.params.eventId) } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, feedback, total, page, pages: Math.ceil(total / limit), average: agg[0]?.avg || 0, count: agg[0]?.count || 0 });
});

exports.forOrganizerEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.eventId).select('organizerId');
  if (!event) throw new HttpError(404, 'Event not found');
  if (req.user.role !== 'admin' && String(event.organizerId) !== String(req.user._id)) {
    throw new HttpError(403, 'You can only view feedback for your own events');
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const [feedback, total, agg] = await Promise.all([
    Feedback.find({ eventId: event._id }).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('userId', 'name'),
    Feedback.countDocuments({ eventId: event._id }),
    Feedback.aggregate([{ $match: { eventId: event._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
  ]);
  res.json({ success: true, feedback, total, page, pages: Math.ceil(total / limit), average: agg[0]?.avg || 0, count: agg[0]?.count || 0 });
});
