const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const { exportLimiter } = require('../../middlewares/rateLimit');
const { CAPABILITIES: C } = require('../../config/constants');
const c = require('./exportController');

router.use(authenticate, requireCapability(C.EXPORT_RUN));

// Column catalogue + saved layouts
router.get('/columns', c.catalogue);
router.get('/templates', c.listTemplates);
router.post('/templates', requireCapability(C.EXPORT_RUN), c.saveTemplate);
router.delete('/templates/:id', c.deleteTemplate);

// Preview before downloading
router.get('/preview', c.preview);
router.post('/preview', c.preview);

// Downloads
router.get('/daily', exportLimiter, c.daily);
router.post('/daily', exportLimiter, c.daily);
router.get('/session/:sessionId', exportLimiter, (req, res, next) => {
  req.query.sessionId = req.params.sessionId; next();
}, c.session);
router.get('/summary', exportLimiter, c.summary);
router.get('/defaulters', exportLimiter, c.defaulters);
router.get('/monthly-register', exportLimiter, c.monthlyRegister);
router.post('/custom', exportLimiter, c.custom);

module.exports = router;
