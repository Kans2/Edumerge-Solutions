const { Notification } = require('../../models');
const { emitToUser } = require('../../sockets');
const mailer = require('./mailer');
const logger = require('../../config/logger');

async function notify({ userId, type, title, body, severity = 'INFO', link, channels = ['IN_APP'], email }) {
  const doc = await Notification.create({ userId, type, title, body, severity, link, channels });
  emitToUser(String(userId), 'notification:new', doc);
  if (channels.includes('EMAIL') && email) {
    mailer.send({ to: email, subject: title, text: body })
      .catch((err) => logger.warn({ err }, 'Notification email failed'));
  }
  return doc;
}

async function notifyMany(items = []) {
  if (!items.length) return [];
  const docs = await Notification.insertMany(items.map((i) => ({
    userId: i.userId, type: i.type, title: i.title, body: i.body,
    severity: i.severity || 'INFO', link: i.link, channels: i.channels || ['IN_APP'],
  })));
  docs.forEach((d) => emitToUser(String(d.userId), 'notification:new', d));
  return docs;
}

const listForUser = (userId, { unreadOnly = false, limit = 50 } = {}) =>
  Notification.find({ userId, ...(unreadOnly ? { isRead: false } : {}) })
    .sort({ createdAt: -1 }).limit(limit).lean();

const markRead = (userId, ids = []) =>
  Notification.updateMany(
    { userId, ...(ids.length ? { _id: { $in: ids } } : {}) },
    { $set: { isRead: true, readAt: new Date() } }
  );

module.exports = { notify, notifyMany, listForUser, markRead };
