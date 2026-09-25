const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const service = require('./sessionService');

const ctxOf = (req) => ({ ip: req.ip });

exports.mySchedule = asyncHandler(async (req, res) =>
  ok(res, await service.getMySchedule(req.user, req.query.date)));

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listSessions(req.user, req.query);
  return ok(res, items, meta);
});

exports.create = asyncHandler(async (req, res) =>
  created(res, await service.createAdhocSession(req.user, req.validated, ctxOf(req))));

exports.cancel = asyncHandler(async (req, res) =>
  ok(res, await service.cancelSession(req.user, req.params.id, req.validated.reason, ctxOf(req))));

exports.unlock = asyncHandler(async (req, res) =>
  ok(res, await service.unlockSession(req.user, req.params.id, req.validated.reason, ctxOf(req))));

exports.generate = asyncHandler(async (req, res) =>
  ok(res, await service.generateSessions({ ...req.validated, actor: req.user })));

exports.unmarked = asyncHandler(async (req, res) =>
  ok(res, await service.getUnmarkedSessions(req.user, req.query)));
