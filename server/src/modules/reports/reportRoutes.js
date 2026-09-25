const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const { CAPABILITIES: C } = require('../../config/constants');
const c = require('./reportController');

router.use(authenticate, requireCapability(C.REPORT_VIEW_DEPT, C.REPORT_VIEW_ALL, C.ATT_READ_SECTION));

router.get('/daily', c.daily);
router.get('/trend', c.trend);
router.get('/defaulters', c.defaulters);
router.get('/sections/:sectionId', c.section);
router.get('/departments', c.department);
router.patch('/summaries/:summaryId/condone', requireCapability(C.CONDONATION_GRANT), c.condone);

module.exports = router;
