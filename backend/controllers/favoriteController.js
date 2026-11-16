const Favorite = require('../models/Favorite');
const Event = require('../models/Event');
const { HttpError, asyncHandler } = require('../middleware/error');

exports.add = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.eventId);
  if (!event) throw new HttpError(404, 'Event not found');
  await Favorite.findOneAndUpdate(
    { userId: req.user._id, eventId: event._id },
    { userId: req.user._id, eventId: event._id },
    { upsert: true }
  );
  res.status(201).json({ success: true, favorited: true });
});

exports.remove = asyncHandler(async (req, res) => {
  await Favorite.deleteOne({ userId: req.user._id, eventId: req.params.eventId });
  res.json({ success: true, favorited: false });
});

exports.list = asyncHandler(async (req, res) => {
  const favorites = await Favorite.find({ userId: req.user._id }).sort('-createdAt').populate({
    path: 'eventId',
    select: 'title startDate startTime venue location image fee status registeredCount capacity',
  });
  res.json({ success: true, favorites: favorites.filter((f) => f.eventId) });
});
