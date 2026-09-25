const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./attendanceService');

const ctxOf = (req) => ({ ip: req.ip, traceId: req.id });

exports.roster = asyncHandler(async (req, res) =>
  ok(res, await service.getSessionRoster(req.user, req.params.sessionId)));

exports.mark = asyncHandler(async (req, res) =>
  ok(res, await service.markSession(req.user, req.params.sessionId, req.validated, ctxOf(req))));

exports.updateRecords = asyncHandler(async (req, res) =>
  ok(res, await service.updateRecords(req.user, req.params.sessionId, req.validated, ctxOf(req))));

exports.myAttendance = asyncHandler(async (req, res) =>
  ok(res, await service.getStudentAttendance(req.user, 'me', req.query)));

exports.studentAttendance = asyncHandler(async (req, res) =>
  ok(res, await service.getStudentAttendance(req.user, req.params.studentId, req.query)));

exports.myHistory = asyncHandler(async (req, res) =>
  ok(res, await service.getStudentHistory(req.user, 'me', req.query)));

exports.studentHistory = asyncHandler(async (req, res) =>
  ok(res, await service.getStudentHistory(req.user, req.params.studentId, req.query)));

exports.recompute = asyncHandler(async (req, res) =>
  ok(res, await service.recomputeOffering(req.params.offeringId, req.query.termId)));
