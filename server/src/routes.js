const router = require('express').Router();

router.use('/auth', require('./modules/auth/authRoutes'));
router.use('/users', require('./modules/users/userRoutes'));
router.use('/academics', require('./modules/academics/academicsRoutes'));
router.use('/sessions', require('./modules/sessions/sessionRoutes'));
router.use('/attendance', require('./modules/attendance/attendanceRoutes'));
router.use('/corrections', require('./modules/corrections/correctionRoutes'));
router.use('/reports', require('./modules/reports/reportRoutes'));
router.use('/exports', require('./modules/exports/exportRoutes'));
router.use('/dashboard', require('./modules/dashboard/dashboardRoutes'));
router.use('/notifications', require('./modules/notifications/notificationRoutes'));
router.use('/audit', require('./modules/audit/auditRoutes'));
router.use('/admin', require('./modules/admin/adminRoutes'));

router.get('/meta/constants', (req, res) => {
  const k = require('./config/constants');
  res.json({
    success: true,
    data: {
      roles: k.ROLES,
      attendanceStatuses: k.ATT_STATUS,
      attendanceStatusMeta: k.ATT_STATUS_META,
      sessionStatuses: k.SESSION_STATUS,
      sessionTypes: k.SESSION_TYPE,
      correctionStatuses: k.CORRECTION_STATUS,
      leaveTypes: k.LEAVE_TYPE,
      leaveStatuses: k.LEAVE_STATUS,
      riskBands: k.RISK_BAND,
      days: k.DAYS,
    },
    error: null,
  });
});

module.exports = router;
