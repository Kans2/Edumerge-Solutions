const router = require('express').Router();
const { z } = require('zod');
const { authenticate } = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { loginLimiter } = require('../../middlewares/rateLimit');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/apiResponse');
const service = require('./authService');
const tokens = require('./tokenService');

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8, 'New password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain a letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

router.post('/login', loginLimiter, validate(loginSchema), asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await service.login(req.validated);
  res.cookie('refreshToken', refreshToken, tokens.refreshCookieOptions());
  return ok(res, { user, accessToken });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await service.refresh(req.cookies?.refreshToken);
  res.cookie('refreshToken', refreshToken, tokens.refreshCookieOptions());
  return ok(res, { user, accessToken });
}));

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await service.logout(req.user._id);
  res.clearCookie('refreshToken', { path: '/' });
  return ok(res, { message: 'Signed out' });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => ok(res, req.user.toSafeJSON())));

router.post('/change-password', authenticate, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  await service.changePassword(req.user._id, req.validated);
  return ok(res, { message: 'Password updated' });
}));

module.exports = router;
