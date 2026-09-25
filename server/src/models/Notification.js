const mongoose = require('mongoose');
const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: String,
  link: String,
  severity: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'INFO' },
  channels: { type: [String], default: ['IN_APP'] },
  isRead: { type: Boolean, default: false, index: true },
  readAt: Date,
}, { timestamps: { createdAt: true, updatedAt: false } });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
module.exports = mongoose.model('Notification', notificationSchema);
