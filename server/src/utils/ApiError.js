class ApiError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || `ERR_${statusCode}`;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
  static badRequest(m, d) { return new ApiError(400, m, 'BAD_REQUEST_400', d); }
  static unauthorized(m = 'Authentication required') { return new ApiError(401, m, 'AUTH_401'); }
  static forbidden(m = 'You do not have permission to perform this action') { return new ApiError(403, m, 'FORBIDDEN_403'); }
  static notFound(m = 'Resource not found') { return new ApiError(404, m, 'NOT_FOUND_404'); }
  static conflict(m, c = 'CONFLICT_409') { return new ApiError(409, m, c); }
  static locked(m) { return new ApiError(409, m, 'SESSION_LOCKED_409'); }
  static validation(m, d) { return new ApiError(422, m, 'VALIDATION_422', d); }
  static internal(m = 'Something went wrong') { return new ApiError(500, m, 'INTERNAL_500'); }
}
module.exports = ApiError;
