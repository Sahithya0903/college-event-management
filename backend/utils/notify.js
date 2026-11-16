const Notification = require('../models/Notification');

exports.notify = (userId, { title, message, type = 'system', eventId, link } = {}) =>
  Notification.create({ userId, title, message, type, eventId, link }).catch((e) => console.error('notify failed:', e.message));

exports.notifyMany = (userIds, payload) => {
  const docs = [...new Set(userIds.map(String))].map((userId) => ({ userId, ...payload }));
  return docs.length ? Notification.insertMany(docs).catch((e) => console.error('notifyMany failed:', e.message)) : Promise.resolve();
};
