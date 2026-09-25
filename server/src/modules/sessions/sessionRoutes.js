const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const validate = require('../../middlewares/validate');
const { CAPABILITIES: C } = require('../../config/constants');
const v = require('../attendance/attendanceValidators');
const c = require('./sessionController');

router.use(authenticate);

router.get('/my-schedule', c.mySchedule);
router.get('/unmarked', c.unmarked);
router.get('/', c.list);

router.post('/', requireCapability(C.SESSION_MANAGE), validate(v.createSessionSchema), c.create);
router.post('/generate', requireCapability(C.ADMIN_MANAGE, C.SESSION_MANAGE),
  validate(v.generateSessionsSchema), c.generate);
router.patch('/:id/cancel', requireCapability(C.SESSION_MANAGE),
  validate(v.cancelSessionSchema), c.cancel);
router.patch('/:id/unlock', requireCapability(C.ATT_UNLOCK),
  validate(v.unlockSessionSchema), c.unlock);

module.exports = router;
