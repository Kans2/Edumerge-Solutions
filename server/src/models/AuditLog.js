const mongoose = require('mongoose');

/** Append-only. Attendance data is regulatory, so every change is retained. */
const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, index: true },
  entityType: { type: String, index: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, index: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  actorName: { type: String, default: 'System' },
  actorRole: String,
  summary: String,
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
  meta: mongoose.Schema.Types.Mixed,
  ipAddress: String,
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

const block = function block(next) { next(new Error('Audit log entries are immutable')); };
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']
  .forEach((op) => auditLogSchema.pre(op, block));

module.exports = mongoose.model('AuditLog', auditLogSchema);
