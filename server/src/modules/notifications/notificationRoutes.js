const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./notificationService');

router.use(authenticate);
router.get('/', asyncHandler(async (req, res) =>
  ok(res, await service.listForUser(req.user._id, { unreadOnly: req.query.unreadOnly === 'true' }))));
router.patch('/read', asyncHandler(async (req, res) => {
  await service.markRead(req.user._id, req.body.ids || []);
  return ok(res, { updated: true });
}));

module.exports = router;
