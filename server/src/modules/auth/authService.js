const { User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const tokens = require('./tokenService');

async function login({ email, password }) {
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  if (user.status !== 'ACTIVE') throw ApiError.forbidden('This account is not active');

  if (!(await user.comparePassword(password))) throw ApiError.unauthorized('Invalid email or password');

  const accessToken = tokens.signAccessToken(user);
  const refreshToken = tokens.signRefreshToken(user);
  user.refreshTokenHash = await tokens.hashToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  return { user: user.toSafeJSON(), accessToken, refreshToken };
}

/** Rotating refresh tokens with reuse detection. */
async function refresh(presented) {
  if (!presented) throw ApiError.unauthorized('No refresh token supplied');

  let payload;
  try { payload = tokens.verifyRefresh(presented); }
  catch { throw ApiError.unauthorized('Session expired, please sign in again'); }

  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user || !user.refreshTokenHash) throw ApiError.unauthorized('Session not recognised');

  if (!(await tokens.compareToken(presented, user.refreshTokenHash))) {
    user.refreshTokenHash = undefined;
    await user.save();
    throw ApiError.unauthorized('Refresh token reuse detected. Please sign in again.');
  }

  const accessToken = tokens.signAccessToken(user);
  const refreshToken = tokens.signRefreshToken(user);
  user.refreshTokenHash = await tokens.hashToken(refreshToken);
  await user.save();

  return { user: user.toSafeJSON(), accessToken, refreshToken };
}

const logout = (userId) => User.updateOne({ _id: userId }, { $unset: { refreshTokenHash: 1 } });

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');
  if (!(await user.comparePassword(currentPassword))) throw ApiError.badRequest('Current password is incorrect');
  user.passwordHash = newPassword;
  await user.save();
}

module.exports = { login, refresh, logout, changePassword };
