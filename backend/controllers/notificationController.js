const Notification = require('../models/Notification');
const { HttpError, asyncHandler } = require('../middleware/error');

exports.list = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const filter = { userId: req.user._id };
  if (req.query.unread === 'true') filter.read = false;
  const [notifications, unreadCount, total] = await Promise.all([
    Notification.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    Notification.countDocuments({ userId: req.user._id, read: false }),
    Notification.countDocuments(filter),
  ]);
  res.json({ success: true, notifications, unreadCount, page, pages: Math.ceil(total / limit) });
});

exports.markRead = asyncHandler(async (req, res) => {
  const notif = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
  if (!notif) throw new HttpError(404, 'Notification not found');
  notif.read = true;
  await notif.save();
  res.json({ success: true, notification: notif });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.json({ success: true, message: 'All notifications marked as read' });
});

exports.remove = asyncHandler(async (req, res) => {
  const notif = await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
  if (!notif) throw new HttpError(404, 'Notification not found');
  res.json({ success: true, message: 'Notification deleted' });
});
