const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');

function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  if (err.name === 'ValidationError') {
    error = ApiError.validation('Validation failed', Object.values(err.errors).map((e) => ({
      field: e.path, message: e.message,
    })));
  } else if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid value for ${err.path}`);
  } else if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    error = ApiError.conflict(`A record with this ${field} already exists`, 'DUPLICATE_409');
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    error = ApiError.badRequest('File is too large');
  } else if (!(err instanceof ApiError)) {
    error = ApiError.internal(env.NODE_ENV === 'production' ? 'Something went wrong' : err.message);
  }

  logger[error.statusCode >= 500 ? 'error' : 'warn'](
    { err, traceId: req.id, path: req.originalUrl, userId: req.user?._id }, error.message
  );

  res.status(error.statusCode).json({
    success: false, data: null, meta: null,
    error: {
      code: error.code,
      message: error.message,
      details: error.details || undefined,
      stack: env.NODE_ENV === 'development' && error.statusCode >= 500 ? err.stack : undefined,
    },
    traceId: req.id,
  });
}

module.exports = { notFound, errorHandler };
