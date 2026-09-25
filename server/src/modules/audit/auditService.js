const { AuditLog } = require('../../models');

async function record({ action, entityType, entityId, actor, summary, before, after, meta, ipAddress }) {
  return AuditLog.create({
    action, entityType, entityId,
    actorId: actor?._id || null,
    actorName: actor?.name || 'System',
    actorRole: actor?.role || 'SYSTEM',
    summary, before, after, meta, ipAddress,
  });
}

async function listFor(entityType, entityId, limit = 100) {
  return AuditLog.find({ entityType, entityId }).sort({ createdAt: -1 }).limit(limit).lean();
}

async function search(filter = {}, { limit = 100, skip = 0 } = {}) {
  const q = {};
  if (filter.action) q.action = { $in: String(filter.action).split(',') };
  if (filter.actorId) q.actorId = filter.actorId;
  if (filter.entityType) q.entityType = filter.entityType;
  if (filter.from || filter.to) {
    q.createdAt = {};
    if (filter.from) q.createdAt.$gte = new Date(filter.from);
    if (filter.to) q.createdAt.$lte = new Date(`${filter.to}T23:59:59.999Z`);
  }
  const [items, total] = await Promise.all([
    AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(q),
  ]);
  return { items, total };
}

module.exports = { record, listFor, search };
