const ApiError = require('../utils/ApiError');

/** Parses req.body with Zod and exposes the typed result as req.validated. */
module.exports = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      field: i.path.join('.') || '(root)',
      message: i.message,
    }));
    return next(ApiError.validation('Please correct the highlighted fields', details));
  }
  req.validated = result.data;
  return next();
};
