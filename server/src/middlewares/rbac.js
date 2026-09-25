const ApiError = require('../utils/ApiError');

/** Passes if the user holds ANY one of the listed capabilities. */
function requireCapability(...capabilities) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const held = req.user.capabilities || [];
    if (!capabilities.some((c) => held.includes(c))) {
      return next(ApiError.forbidden(`This action requires one of: ${capabilities.join(', ')}`));
    }
    return next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`This action is restricted to: ${roles.join(', ')}`));
    }
    return next();
  };
}

module.exports = { requireCapability, requireRole };
