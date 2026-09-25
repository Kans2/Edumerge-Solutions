const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../../config/env');

const signAccessToken = (user) => jwt.sign(
  {
    sub: String(user._id),
    role: user.role,
    dept: user.departmentId ? String(user.departmentId) : null,
    sec: user.student?.sectionId ? String(user.student.sectionId) : null,
  },
  env.JWT_ACCESS_SECRET,
  { expiresIn: env.JWT_ACCESS_EXPIRES }
);

const signRefreshToken = (user) => jwt.sign(
  { sub: String(user._id), typ: 'refresh' },
  env.JWT_REFRESH_SECRET,
  { expiresIn: env.JWT_REFRESH_EXPIRES }
);

const verifyAccess = (t) => jwt.verify(t, env.JWT_ACCESS_SECRET);
const verifyRefresh = (t) => jwt.verify(t, env.JWT_REFRESH_SECRET);
const hashToken = (t) => bcrypt.hash(t, 10);
const compareToken = (t, h) => bcrypt.compare(t, h);

const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

module.exports = {
  signAccessToken, signRefreshToken, verifyAccess, verifyRefresh,
  hashToken, compareToken, refreshCookieOptions,
};
