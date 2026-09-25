const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const service = require('./auditService');

exports.search = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const { items, total } = await service.search(req.query, { limit, skip });
  return ok(res, items, buildMeta(page, limit, total));
});

exports.forEntity = asyncHandler(async (req, res) =>
  ok(res, await service.listFor(req.params.entityType, req.params.entityId)));
