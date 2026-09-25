const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const validate = require('../../middlewares/validate');
const { CAPABILITIES: C } = require('../../config/constants');
const v = require('./attendanceValidators');
const c = require('./attendanceController');

router.use(authenticate);

router.get('/sessions/:sessionId/roster', c.roster);
router.post('/sessions/:sessionId/mark', requireCapability(C.ATT_MARK),
  validate(v.markSessionSchema), c.mark);
router.patch('/sessions/:sessionId/records',
  requireCapability(C.ATT_EDIT_OWN, C.ATT_EDIT_ANY), validate(v.updateRecordsSchema), c.updateRecords);

router.get('/me', c.myAttendance);
router.get('/me/history', c.myHistory);
router.get('/students/:studentId', c.studentAttendance);
router.get('/students/:studentId/history', c.studentHistory);

router.post('/offerings/:offeringId/recompute',
  requireCapability(C.ATT_EDIT_ANY, C.ADMIN_MANAGE), c.recompute);

module.exports = router;
