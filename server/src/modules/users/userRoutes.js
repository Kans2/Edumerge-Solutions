const router = require('express').Router();
const { authenticate } = require('../../middlewares/auth');
const { requireCapability } = require('../../middlewares/rbac');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { CAPABILITIES: C, ROLE_CAPABILITIES, ROLES } = require('../../config/constants');

router.use(authenticate);

router.get('/', requireCapability(C.ADMIN_MANAGE, C.REPORT_VIEW_DEPT, C.REPORT_VIEW_ALL),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};
    if (req.query.role) filter.role = { $in: String(req.query.role).split(',') };
    if (req.query.sectionId) filter['student.sectionId'] = req.query.sectionId;
    if (req.query.departmentId) filter.departmentId = req.query.departmentId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { code: rx }];
    }
    // Non-global viewers stay inside their department
    if (!(req.user.capabilities || []).includes(C.ADMIN_MANAGE)
      && !(req.user.capabilities || []).includes(C.REPORT_VIEW_ALL)) {
      filter.departmentId = req.user.departmentId;
    }
    const [items, total] = await Promise.all([
      User.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);
    return ok(res, items, buildMeta(page, limit, total));
  }));

router.get('/faculty', asyncHandler(async (req, res) => {
  const filter = { role: { $in: [ROLES.FACULTY, ROLES.CLASS_ADVISOR, ROLES.HOD] }, status: 'ACTIVE' };
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  return ok(res, await User.find(filter).select('code name email role departmentId staff').sort({ name: 1 }).lean());
}));

router.post('/', requireCapability(C.ADMIN_MANAGE), asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  if (!password || password.length < 8) throw ApiError.badRequest('Password must be at least 8 characters');
  const user = await User.create({ ...rest, passwordHash: password, capabilities: ROLE_CAPABILITIES[rest.role] });
  return created(res, user.toSafeJSON());
}));

router.patch('/:id', requireCapability(C.ADMIN_MANAGE), asyncHandler(async (req, res) => {
  const { password, ...rest } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found');
  Object.assign(user, rest);
  if (password) user.passwordHash = password;
  if (rest.role) user.capabilities = ROLE_CAPABILITIES[rest.role];
  await user.save();
  return ok(res, user.toSafeJSON());
}));

module.exports = router;
