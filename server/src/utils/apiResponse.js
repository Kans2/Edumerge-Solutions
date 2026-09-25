function ok(res, data = null, meta = null, statusCode = 200) {
  return res.status(statusCode).json({
    success: true, data, meta, error: null, traceId: res.req?.id || null,
  });
}
const created = (res, data, meta = null) => ok(res, data, meta, 201);
module.exports = { ok, created };
