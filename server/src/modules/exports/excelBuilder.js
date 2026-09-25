const ExcelJS = require('exceljs');
const { resolveColumns } = require('./columnRegistry');

/* White-theme palette matching the web UI. */
const THEME = {
  headerBg: 'FFF1F5F9',     // slate-100
  headerText: 'FF0F172A',   // slate-900
  border: 'FFE2E8F0',       // slate-200
  titleText: 'FF1E293B',
  muted: 'FF64748B',
  absentBg: 'FFFEE2E2',     // red-100
  absentText: 'FF991B1B',
  warnBg: 'FFFEF3C7',       // amber-100
  warnText: 'FF92400E',
  safeText: 'FF065F46',
  totalBg: 'FFF8FAFC',
};

const thin = { style: 'thin', color: { argb: THEME.border } };
const ALL_BORDERS = { top: thin, left: thin, bottom: thin, right: thin };

/**
 * Builds an .xlsx workbook from flat rows plus a resolved column list.
 *
 * @param {object}   args
 * @param {string}   args.reportType    key into the column registry
 * @param {Array}    args.rows          flattened data rows
 * @param {Array}    [args.requestedColumns] per-request column selection / renames
 * @param {object}   [args.template]    saved ExportTemplate
 * @param {object}   [args.meta]        title + filter chips printed above the table
 * @param {object}   [args.options]     sheet behaviour overrides
 * @returns {Promise<{buffer: Buffer, columns: Array, unknownColumns: Array, rowCount: number}>}
 */
async function buildWorkbook({
  reportType, rows = [], requestedColumns = null, template = null, meta = {}, options = {},
}) {
  const { columns, unknown } = resolveColumns({ reportType, requested: requestedColumns, template });

  const opts = {
    sheetName: 'Attendance',
    includeFilterHeader: true,
    includeSummaryRow: true,
    freezeHeader: true,
    autoFilter: true,
    highlightBelowThreshold: true,
    threshold: 75,
    ...(template?.options || {}),
    ...options,
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart Attendance Management System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sanitizeSheetName(opts.sheetName), {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width || 18 }));

  let cursor = 1;

  /* ---------------- Title + filter block ---------------- */
  if (opts.includeFilterHeader) {
    const lastCol = columns.length;

    sheet.mergeCells(cursor, 1, cursor, lastCol);
    const titleCell = sheet.getCell(cursor, 1);
    titleCell.value = meta.title || 'Attendance Report';
    titleCell.font = { bold: true, size: 14, color: { argb: THEME.titleText } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getRow(cursor).height = 22;
    cursor += 1;

    if (meta.subtitle) {
      sheet.mergeCells(cursor, 1, cursor, lastCol);
      const sub = sheet.getCell(cursor, 1);
      sub.value = meta.subtitle;
      sub.font = { size: 10, color: { argb: THEME.muted } };
      cursor += 1;
    }

    const chips = Object.entries(meta.filters || {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}: ${v}`);

    if (chips.length) {
      sheet.mergeCells(cursor, 1, cursor, lastCol);
      const f = sheet.getCell(cursor, 1);
      f.value = chips.join('   |   ');
      f.font = { size: 10, color: { argb: THEME.muted } };
      cursor += 1;
    }

    sheet.mergeCells(cursor, 1, cursor, lastCol);
    const gen = sheet.getCell(cursor, 1);
    gen.value = `Generated on ${formatDateTime(new Date())}${meta.generatedBy ? ` by ${meta.generatedBy}` : ''}`;
    gen.font = { size: 9, italic: true, color: { argb: THEME.muted } };
    cursor += 2; // one blank spacer row
  }

  /* ---------------- Header row ---------------- */
  const headerRowIndex = cursor;
  const headerRow = sheet.getRow(headerRowIndex);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 11, color: { argb: THEME.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.headerBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = ALL_BORDERS;
  });
  headerRow.height = 26;
  headerRow.commit();
  cursor += 1;

  /* ---------------- Data rows ---------------- */
  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(cursor);
    columns.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      let value;
      try {
        value = c.resolve(row, { index, meta, options: opts });
      } catch {
        value = '-';
      }
      cell.value = value;
      if (c.format) cell.numFmt = c.format;
      cell.alignment = { vertical: 'middle', horizontal: c.align || 'left', wrapText: false };
      cell.border = ALL_BORDERS;
      cell.font = { size: 10 };

      applyConditionalStyle(cell, c.key, row, opts);
    });
    excelRow.commit();
    cursor += 1;
  });

  /* ---------------- Totals row ---------------- */
  if (opts.includeSummaryRow && rows.length) {
    const totals = computeTotals(rows, columns);
    if (totals) {
      const totalRow = sheet.getRow(cursor);
      columns.forEach((c, i) => {
        const cell = totalRow.getCell(i + 1);
        if (i === 0) cell.value = 'TOTAL';
        else if (totals[c.key] !== undefined) cell.value = totals[c.key];
        cell.font = { bold: true, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.totalBg } };
        cell.alignment = { vertical: 'middle', horizontal: c.align || 'left' };
        cell.border = ALL_BORDERS;
        if (c.format) cell.numFmt = c.format;
      });
      totalRow.commit();
      cursor += 1;
    }
  }

  /* ---------------- Sheet behaviour ---------------- */
  if (opts.freezeHeader) {
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIndex }];
  }
  if (opts.autoFilter && rows.length) {
    sheet.autoFilter = {
      from: { row: headerRowIndex, column: 1 },
      to: { row: headerRowIndex + rows.length, column: columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    columns: columns.map((c) => ({ key: c.key, header: c.header })),
    unknownColumns: unknown,
    rowCount: rows.length,
  };
}

/** Red for absentees, amber/red for sub-threshold percentages. */
function applyConditionalStyle(cell, key, row, opts) {
  if (key === 'status' || key === 'statusShort') {
    if (row.status === 'ABSENT') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.absentBg } };
      cell.font = { size: 10, bold: true, color: { argb: THEME.absentText } };
    } else if (row.status === 'LATE') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.warnBg } };
      cell.font = { size: 10, color: { argb: THEME.warnText } };
    }
    return;
  }

  if (key === 'percent' && opts.highlightBelowThreshold && typeof row.percent === 'number') {
    if (row.percent < opts.threshold) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.absentBg } };
      cell.font = { size: 10, bold: true, color: { argb: THEME.absentText } };
    } else if (row.percent < opts.threshold + 5) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.warnBg } };
      cell.font = { size: 10, color: { argb: THEME.warnText } };
    } else {
      cell.font = { size: 10, color: { argb: THEME.safeText } };
    }
    return;
  }

  if (key === 'riskBand') {
    if (row.riskBand === 'DETAINED') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.absentBg } };
      cell.font = { size: 10, bold: true, color: { argb: THEME.absentText } };
    } else if (row.riskBand === 'CONDONABLE' || row.riskBand === 'WARNING') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: THEME.warnBg } };
      cell.font = { size: 10, color: { argb: THEME.warnText } };
    }
  }
}

const SUMMABLE = new Set([
  'heldPeriods', 'presentPeriods', 'absentPeriods', 'latePeriods',
  'excusedPeriods', 'leavePeriods', 'countablePeriods', 'totalHeld', 'totalPresent',
]);

function computeTotals(rows, columns) {
  const totals = {};
  let any = false;

  columns.forEach((c) => {
    if (SUMMABLE.has(c.key)) {
      totals[c.key] = rows.reduce((sum, r) => sum + (Number(c.resolve(r, { index: 0 })) || 0), 0);
      any = true;
    }
  });

  if (columns.some((c) => c.key === 'percent')) {
    const values = rows.map((r) => Number(r.percent)).filter((n) => !Number.isNaN(n));
    if (values.length) {
      totals.percent = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
      any = true;
    }
  }

  if (columns.some((c) => c.key === 'status')) {
    const present = rows.filter((r) => ['PRESENT', 'LATE'].includes(r.status)).length;
    totals.status = `${present} / ${rows.length} present`;
    any = true;
  }

  return any ? totals : null;
}

/** Excel rejects these characters and caps sheet names at 31 chars. */
function sanitizeSheetName(name = 'Sheet1') {
  return String(name).replace(/[\\/*?:[\]]/g, '-').slice(0, 31) || 'Sheet1';
}

function formatDateTime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Builds a safe, descriptive download filename. */
function buildFilename(reportType, meta = {}) {
  const parts = ['attendance', reportType.toLowerCase()];
  if (meta.date) parts.push(meta.date);
  else if (meta.fromDate && meta.toDate) parts.push(`${meta.fromDate}_to_${meta.toDate}`);
  if (meta.sectionCode) parts.push(meta.sectionCode);
  if (meta.subjectCode) parts.push(meta.subjectCode);
  return `${parts.join('_').replace(/[^a-zA-Z0-9_.-]/g, '-')}.xlsx`;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

module.exports = { buildWorkbook, buildFilename, sanitizeSheetName, THEME, XLSX_MIME };
