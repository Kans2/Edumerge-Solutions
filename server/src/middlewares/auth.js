const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const tokens = require('../modules/auth/tokenService');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized('Authentication required');

    let payload;
    try { payload = tokens.verifyAccess(token); }
    catch { throw ApiError.unauthorized('Session expired'); }

    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE') throw ApiError.unauthorized('Account not active');

    req.user = user;
    return next();
  } catch (err) { return next(err); }
}

module.exports = { authenticate };
