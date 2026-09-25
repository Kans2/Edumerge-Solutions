const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const { ROLES, CAPABILITIES: C, SESSION_STATUS } = require('../../config/constants');
const { ClassSession, AttendanceSummary, CorrectionRequest, LeaveRequest } = require('../../models');
const reportService = require('../reports/reportService');
const termService = require('../academics/termService');
const sessionService = require('../sessions/sessionService');
const attendanceService = require('../attendance/attendanceService');
const { toDateKey } = require('../../utils/dateUtils');

const has = (u, c) => (u.capabilities || []).includes(c);

router.use(authenticate);

/** One call that returns whatever the signed-in role actually needs. */
router.get('/', asyncHandler(async (req, res) => {
  const today = toDateKey(new Date());
  const user = req.user;

  if (user.role === ROLES.STUDENT) {
    const [attendance, todaySchedule, leaves] = await Promise.all([
      attendanceService.getStudentAttendance(user, 'me', {}),
      sessionService.getMySchedule(user, today),
      LeaveRequest.countDocuments({ studentId: user._id, status: 'PENDING' }),
    ]);
    return ok(res, {
      role: user.role,
      today: todaySchedule,
      overall: attendance.overall,
      subjects: attendance.subjects,
      threshold: attendance.threshold,
      pendingLeaves: leaves,
    });
  }

  const [schedule, unmarked, daily, pendingCorrections, pendingLeaves] = await Promise.all([
    sessionService.getMySchedule(user, today),
    sessionService.getUnmarkedSessions(user, { limit: 50 }),
    reportService.getDailyOverview(user, { date: today }).catch(() => null),
    CorrectionRequest.countDocuments({
      status: 'PENDING',
      ...(has(user, C.ATT_READ_ALL) ? {} : { departmentId: user.departmentId }),
    }),
    LeaveRequest.countDocuments({
      status: 'PENDING',
      ...(has(user, C.ATT_READ_ALL) ? {} : { departmentId: user.departmentId }),
    }),
  ]);

  let defaulters = null;
  if (has(user, C.REPORT_VIEW_DEPT) || has(user, C.REPORT_VIEW_ALL)) {
    const term = await termService.getCurrentTerm();
    if (term) {
      const threshold = term.policy?.minAttendancePercent || 75;
      const match = { termId: term._id, scope: 'OVERALL', percent: { $lt: threshold } };
      if (!has(user, C.REPORT_VIEW_ALL)) match.departmentId = user.departmentId;
      const bands = await AttendanceSummary.aggregate([
        { $match: match },
        { $group: { _id: '$riskBand', count: { $sum: 1 } } },
      ]);
      defaulters = {
        threshold,
        total: bands.reduce((s, b) => s + b.count, 0),
        byBand: Object.fromEntries(bands.map((b) => [b._id, b.count])),
      };
    }
  }

  return ok(res, {
    role: user.role,
    today: schedule,
    unmarked: { total: unmarked.total, byFaculty: unmarked.byFaculty.slice(0, 5) },
    daily,
    pendingCorrections,
    pendingLeaves,
    defaulters,
  });
}));

module.exports = router;
