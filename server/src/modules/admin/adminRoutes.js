const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { CAPABILITIES: C } = require('../../config/constants');
const jobs = require('../../jobs');

router.use(authenticate, requireCapability(C.ADMIN_MANAGE));

router.post('/jobs/lock-sessions', asyncHandler(async (req, res) => ok(res, await jobs.lockJob())));
router.post('/jobs/recompute-summaries', asyncHandler(async (req, res) => ok(res, await jobs.summaryJob())));
router.post('/jobs/low-attendance-alerts', asyncHandler(async (req, res) => ok(res, await jobs.lowAttendanceJob())));
router.post('/jobs/generate-sessions', asyncHandler(async (req, res) => ok(res, await jobs.sessionGenJob(req.body))));

module.exports = router;
