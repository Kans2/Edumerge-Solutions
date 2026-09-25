const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const service = require('./correctionService');

const ctxOf = (req) => ({ ip: req.ip });

exports.raise = asyncHandler(async (req, res) =>
  created(res, await service.raiseCorrection(req.user, req.validated, ctxOf(req))));

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listCorrections(req.user, req.query);
  return ok(res, items, meta);
});

exports.review = asyncHandler(async (req, res) =>
  ok(res, await service.reviewCorrection(req.user, req.params.id, req.validated, ctxOf(req))));

exports.withdraw = asyncHandler(async (req, res) =>
  ok(res, await service.withdrawCorrection(req.user, req.params.id)));

exports.raiseLeave = asyncHandler(async (req, res) =>
  created(res, await service.raiseLeave(req.user, req.validated, ctxOf(req))));

exports.listLeaves = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listLeaves(req.user, req.query);
  return ok(res, items, meta);
});

exports.reviewLeave = asyncHandler(async (req, res) =>
  ok(res, await service.reviewLeave(req.user, req.params.id, req.validated, ctxOf(req))));
