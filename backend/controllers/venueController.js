const Venue = require('../models/Venue');
const { HttpError, asyncHandler } = require('../middleware/error');

const pick = (b) => {
  const out = {};
  ['name', 'address', 'city'].forEach((k) => typeof b[k] === 'string' && (out[k] = b[k].trim()));
  if (b.capacity !== undefined && b.capacity !== '') out.capacity = Number(b.capacity);
  return out;
};

const canEdit = (user, venue) => user.role === 'admin' || String(venue.createdBy) === String(user._id);

exports.list = asyncHandler(async (req, res) => {
  const filter = req.query.city ? { city: new RegExp(String(req.query.city).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } : {};
  const venues = await Venue.find(filter).sort('name');
  res.json({ success: true, venues });
});

exports.create = asyncHandler(async (req, res) => {
  const venue = await Venue.create({ ...pick(req.body), createdBy: req.user._id });
  res.status(201).json({ success: true, venue });
});

exports.update = asyncHandler(async (req, res) => {
  const venue = await Venue.findById(req.params.id);
  if (!venue) throw new HttpError(404, 'Venue not found');
  if (!canEdit(req.user, venue)) throw new HttpError(403, 'You can only edit venues you created');
  Object.assign(venue, pick(req.body));
  await venue.save();
  res.json({ success: true, venue });
});

exports.remove = asyncHandler(async (req, res) => {
  const venue = await Venue.findById(req.params.id);
  if (!venue) throw new HttpError(404, 'Venue not found');
  if (!canEdit(req.user, venue)) throw new HttpError(403, 'You can only delete venues you created');
  await venue.deleteOne();
  res.json({ success: true, message: 'Venue deleted' });
});
