const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./reportService');

exports.defaulters = asyncHandler(async (req, res) => {
  const { items, meta, summary } = await service.getDefaulters(req.user, req.query);
  return ok(res, { items, summary }, meta);
});

exports.section = asyncHandler(async (req, res) =>
  ok(res, await service.getSectionReport(req.user, req.params.sectionId, req.query)));

exports.department = asyncHandler(async (req, res) =>
  ok(res, await service.getDepartmentReport(req.user, req.query)));

exports.daily = asyncHandler(async (req, res) =>
  ok(res, await service.getDailyOverview(req.user, req.query)));

exports.trend = asyncHandler(async (req, res) =>
  ok(res, await service.getTrend(req.user, req.query)));

exports.condone = asyncHandler(async (req, res) =>
  ok(res, await service.grantCondonation(req.user, req.params.summaryId, req.body)));
