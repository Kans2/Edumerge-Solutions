const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const { CAPABILITIES: C } = require('../../config/constants');
const c = require('./auditController');

router.use(authenticate, requireCapability(C.REPORT_VIEW_DEPT, C.REPORT_VIEW_ALL, C.ADMIN_MANAGE));
router.get('/', c.search);
router.get('/:entityType/:entityId', c.forEntity);

module.exports = router;
