const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const validate = require('../../middlewares/validate');
const { CAPABILITIES: C } = require('../../config/constants');
const v = require('./correctionValidators');
const c = require('./correctionController');

router.use(authenticate);

router.get('/', c.list);
router.post('/', requireCapability(C.CORRECTION_RAISE), validate(v.raiseCorrectionSchema), c.raise);
router.patch('/:id/review', requireCapability(C.CORRECTION_APPROVE), validate(v.reviewSchema), c.review);
router.patch('/:id/withdraw', c.withdraw);

router.get('/leaves/all', c.listLeaves);
router.post('/leaves', requireCapability(C.LEAVE_RAISE, C.LEAVE_APPROVE), validate(v.raiseLeaveSchema), c.raiseLeave);
router.patch('/leaves/:id/review', requireCapability(C.LEAVE_APPROVE), validate(v.reviewSchema), c.reviewLeave);

module.exports = router;
