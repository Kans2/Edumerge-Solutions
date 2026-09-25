const rateLimit = require('express-rate-limit');

const msg = (m) => ({ success: false, error: { code: 'RATE_LIMIT_429', message: m } });

const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  message: msg('Too many requests. Please slow down.'),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5, skipSuccessfulRequests: true,
  standardHeaders: true, legacyHeaders: false,
  message: msg('Too many sign-in attempts. Try again in 15 minutes.'),
});

/** Exports build whole workbooks in memory, so they get their own budget. */
const exportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false,
  message: msg('Export limit reached. Please wait a few minutes.'),
});

module.exports = { standardLimiter, loginLimiter, exportLimiter };
