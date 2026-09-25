const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/apiResponse');
const service = require('./exportService');
const { XLSX_MIME } = require('./excelBuilder');

/** Accepts columns as JSON in the body, or as a JSON/CSV string in the query. */
function parseColumns(req) {
  if (Array.isArray(req.body?.columns)) return req.body.columns;
  const raw = req.query.columns;
  if (!raw) return null;
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
}

function parseOptions(req) {
  const opts = { ...(req.body?.options || {}) };
  if (req.query.sheetName) opts.sheetName = req.query.sheetName;
  if (req.query.title) opts.title = req.query.title;
  if (req.query.includeSummaryRow !== undefined) opts.includeSummaryRow = req.query.includeSummaryRow !== 'false';
  if (req.query.includeFilterHeader !== undefined) opts.includeFilterHeader = req.query.includeFilterHeader !== 'false';
  if (req.query.threshold) opts.threshold = Number(req.query.threshold);
  return opts;
}

async function stream(req, res, reportType) {
  const result = await service.generateExcel(req.user, {
    reportType,
    query: { ...req.query, ...(req.body?.query || {}) },
    columns: parseColumns(req),
    templateId: req.query.templateId || req.body?.templateId || null,
    options: parseOptions(req),
  });

  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', result.buffer.length);
  res.setHeader('X-Row-Count', String(result.rowCount));
  res.setHeader('X-Columns', result.columns.map((c) => c.key).join(','));
  if (result.unknownColumns.length) res.setHeader('X-Unknown-Columns', result.unknownColumns.join(','));
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition,X-Row-Count,X-Columns,X-Unknown-Columns');
  return res.send(result.buffer);
}

exports.daily = asyncHandler((req, res) => stream(req, res, 'DAILY_ATTENDANCE'));
exports.session = asyncHandler((req, res) => stream(req, res, 'SESSION_ATTENDANCE'));
exports.summary = asyncHandler((req, res) => stream(req, res, 'STUDENT_SUMMARY'));
exports.defaulters = asyncHandler((req, res) => stream(req, res, 'DEFAULTERS'));
exports.monthlyRegister = asyncHandler((req, res) => stream(req, res, 'MONTHLY_REGISTER'));

/** Generic endpoint so the UI builder can post a full column spec. */
exports.custom = asyncHandler((req, res) => stream(req, res, req.body.reportType || req.query.reportType));

/** JSON preview of the exact rows/columns that would be written. */
exports.preview = asyncHandler(async (req, res) => {
  const reportType = req.query.reportType || req.body?.reportType || 'DAILY_ATTENDANCE';
  const query = { ...req.query, ...(req.body?.query || {}) };

  let built;
  if (reportType === 'SESSION_ATTENDANCE') built = await service.buildSessionRows(req.user, query.sessionId);
  else if (reportType === 'DEFAULTERS') built = await service.buildSummaryRows(req.user, query, { defaultersOnly: true });
  else if (reportType === 'DAILY_ATTENDANCE') built = await service.buildDailyRows(req.user, query);
  else built = await service.buildSummaryRows(req.user, query);

  const { resolveColumns } = require('./columnRegistry');
  const { columns, unknown } = resolveColumns({ reportType, requested: parseColumns(req) });

  const limit = Math.min(Number(req.query.limit) || 25, 200);
  const preview = built.rows.slice(0, limit).map((row, index) => {
    const out = {};
    columns.forEach((c) => { out[c.header] = c.resolve(row, { index }); });
    return out;
  });

  return ok(res, {
    reportType,
    columns: columns.map((c) => ({ key: c.key, header: c.header, width: c.width })),
    unknownColumns: unknown,
    totalRows: built.rows.length,
    previewRows: preview,
    context: built.context,
  });
});

exports.catalogue = asyncHandler(async (req, res) =>
  ok(res, service.getColumnCatalogue(req.query.reportType)));

exports.listTemplates = asyncHandler(async (req, res) =>
  ok(res, await service.listTemplates(req.user, req.query.reportType)));

exports.saveTemplate = asyncHandler(async (req, res) =>
  created(res, await service.saveTemplate(req.user, req.body)));

exports.deleteTemplate = asyncHandler(async (req, res) =>
  ok(res, await service.deleteTemplate(req.user, req.params.id)));
