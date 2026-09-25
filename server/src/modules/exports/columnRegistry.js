const { ATT_STATUS_META } = require('../../config/constants');

/**
 * Central registry of every column an export can render.
 *
 * A column definition is: key -> { header, width, resolve, format, align }
 *   - `header` is the DEFAULT label; callers may override it per request or
 *     save an override in an ExportTemplate. That is what makes column names
 *     customisable without touching code.
 *   - `resolve(row, ctx)` pulls the value out of the flattened data row.
 *
 * Adding a new column here makes it immediately selectable in every API,
 * template builder and UI column picker.
 */

const dash = (v) => (v === undefined || v === null || v === '' ? '-' : v);
const pct = (v) => (typeof v === 'number' ? Number(v.toFixed(2)) : v);

/* ------------------------------------------------------------------ *
 *  DAILY_ATTENDANCE / SESSION_ATTENDANCE
 *  One row = one student in one session.
 * ------------------------------------------------------------------ */
const ATTENDANCE_COLUMNS = {
  serial: { header: 'S.No', width: 7, align: 'center', resolve: (r, ctx) => ctx.index + 1 },
  date: { header: 'Date', width: 13, resolve: (r) => r.date },
  dayName: { header: 'Day', width: 11, resolve: (r) => r.dayName },
  studentCode: { header: 'Roll Number', width: 16, resolve: (r) => dash(r.rollNumber || r.studentCode) },
  registerNumber: { header: 'Register Number', width: 20, resolve: (r) => dash(r.registerNumber) },
  studentName: { header: 'Student Name', width: 28, resolve: (r) => dash(r.studentName) },
  departmentName: { header: 'Department', width: 22, resolve: (r) => dash(r.departmentName) },
  programmeName: { header: 'Programme', width: 24, resolve: (r) => dash(r.programmeName) },
  sectionCode: { header: 'Section', width: 14, resolve: (r) => dash(r.sectionCode) },
  semester: { header: 'Semester', width: 10, align: 'center', resolve: (r) => dash(r.semester) },
  subjectCode: { header: 'Subject Code', width: 15, resolve: (r) => dash(r.subjectCode) },
  subjectName: { header: 'Subject', width: 30, resolve: (r) => dash(r.subjectName) },
  facultyName: { header: 'Faculty', width: 24, resolve: (r) => dash(r.facultyName) },
  periodNumber: { header: 'Period', width: 9, align: 'center', resolve: (r) => dash(r.periodNumber) },
  startTime: { header: 'Start Time', width: 12, align: 'center', resolve: (r) => dash(r.startTime) },
  endTime: { header: 'End Time', width: 12, align: 'center', resolve: (r) => dash(r.endTime) },
  sessionType: { header: 'Class Type', width: 13, resolve: (r) => dash(r.sessionType) },
  roomNumber: { header: 'Room', width: 10, align: 'center', resolve: (r) => dash(r.roomNumber) },
  status: { header: 'Status', width: 16, align: 'center', resolve: (r) => ATT_STATUS_META[r.status]?.label || r.status },
  statusShort: { header: 'P/A', width: 7, align: 'center', resolve: (r) => ATT_STATUS_META[r.status]?.short || '-' },
  remarks: { header: 'Remarks', width: 26, resolve: (r) => dash(r.remarks) },
  markedByName: { header: 'Marked By', width: 22, resolve: (r) => dash(r.markedByName) },
  markedAt: { header: 'Marked At', width: 20, resolve: (r) => (r.markedAt ? new Date(r.markedAt) : '-'), format: 'dd-mm-yyyy hh:mm' },
  isCorrected: { header: 'Corrected', width: 11, align: 'center', resolve: (r) => (r.isCorrected ? 'Yes' : 'No') },
  originalStatus: { header: 'Original Status', width: 16, resolve: (r) => dash(r.originalStatus) },
  guardianName: { header: 'Guardian Name', width: 24, resolve: (r) => dash(r.guardianName) },
  guardianPhone: { header: 'Guardian Phone', width: 16, resolve: (r) => dash(r.guardianPhone) },
  cumulativePercent: {
    header: 'Cumulative %', width: 15, align: 'center',
    resolve: (r) => pct(r.cumulativePercent), format: '0.00',
  },
};

/* ------------------------------------------------------------------ *
 *  STUDENT_SUMMARY / DEFAULTERS
 *  One row = one student for one subject (or overall).
 * ------------------------------------------------------------------ */
const SUMMARY_COLUMNS = {
  serial: { header: 'S.No', width: 7, align: 'center', resolve: (r, ctx) => ctx.index + 1 },
  studentCode: { header: 'Roll Number', width: 16, resolve: (r) => dash(r.rollNumber || r.studentCode) },
  registerNumber: { header: 'Register Number', width: 20, resolve: (r) => dash(r.registerNumber) },
  studentName: { header: 'Student Name', width: 28, resolve: (r) => dash(r.studentName) },
  departmentName: { header: 'Department', width: 22, resolve: (r) => dash(r.departmentName) },
  sectionCode: { header: 'Section', width: 14, resolve: (r) => dash(r.sectionCode) },
  semester: { header: 'Semester', width: 10, align: 'center', resolve: (r) => dash(r.semester) },
  subjectCode: { header: 'Subject Code', width: 15, resolve: (r) => dash(r.subjectCode) },
  subjectName: { header: 'Subject', width: 30, resolve: (r) => dash(r.subjectName) },
  facultyName: { header: 'Faculty', width: 24, resolve: (r) => dash(r.facultyName) },
  heldPeriods: { header: 'Classes Held', width: 13, align: 'center', resolve: (r) => r.heldPeriods ?? 0 },
  presentPeriods: { header: 'Present', width: 10, align: 'center', resolve: (r) => r.presentPeriods ?? 0 },
  absentPeriods: { header: 'Absent', width: 10, align: 'center', resolve: (r) => r.absentPeriods ?? 0 },
  latePeriods: { header: 'Late', width: 9, align: 'center', resolve: (r) => r.latePeriods ?? 0 },
  excusedPeriods: { header: 'On Duty', width: 10, align: 'center', resolve: (r) => r.excusedPeriods ?? 0 },
  leavePeriods: { header: 'Leave', width: 9, align: 'center', resolve: (r) => r.leavePeriods ?? 0 },
  countablePeriods: { header: 'Countable Classes', width: 17, align: 'center', resolve: (r) => r.countablePeriods ?? 0 },
  percent: { header: 'Attendance %', width: 14, align: 'center', resolve: (r) => pct(r.percent), format: '0.00' },
  riskBand: { header: 'Status', width: 14, align: 'center', resolve: (r) => RISK_LABEL[r.riskBand] || dash(r.riskBand) },
  periodsToReachThreshold: {
    header: 'Classes To Recover', width: 18, align: 'center',
    resolve: (r) => (r.periodsToReachThreshold == null ? 'Not recoverable' : r.periodsToReachThreshold),
  },
  condonationGranted: { header: 'Condonation', width: 13, align: 'center', resolve: (r) => (r.condonation?.granted ? 'Granted' : 'No') },
  guardianName: { header: 'Guardian Name', width: 24, resolve: (r) => dash(r.guardianName) },
  guardianPhone: { header: 'Guardian Phone', width: 16, resolve: (r) => dash(r.guardianPhone) },
  guardianEmail: { header: 'Guardian Email', width: 26, resolve: (r) => dash(r.guardianEmail) },
  lastComputedAt: { header: 'Last Updated', width: 20, resolve: (r) => (r.lastComputedAt ? new Date(r.lastComputedAt) : '-'), format: 'dd-mm-yyyy hh:mm' },
};

const RISK_LABEL = {
  SAFE: 'Safe',
  WARNING: 'Warning',
  CONDONABLE: 'Condonable',
  DETAINED: 'Detained',
};

/* ------------------------------------------------------------------ *
 *  MONTHLY_REGISTER
 *  One row = one student; day columns are generated dynamically.
 * ------------------------------------------------------------------ */
const REGISTER_COLUMNS = {
  serial: { header: 'S.No', width: 7, align: 'center', resolve: (r, ctx) => ctx.index + 1 },
  studentCode: { header: 'Roll Number', width: 16, resolve: (r) => dash(r.rollNumber || r.studentCode) },
  studentName: { header: 'Student Name', width: 28, resolve: (r) => dash(r.studentName) },
  sectionCode: { header: 'Section', width: 14, resolve: (r) => dash(r.sectionCode) },
  totalHeld: { header: 'Held', width: 9, align: 'center', resolve: (r) => r.heldPeriods ?? 0 },
  totalPresent: { header: 'Present', width: 10, align: 'center', resolve: (r) => r.presentPeriods ?? 0 },
  percent: { header: 'Attendance %', width: 14, align: 'center', resolve: (r) => pct(r.percent), format: '0.00' },
};

const REGISTRIES = {
  DAILY_ATTENDANCE: ATTENDANCE_COLUMNS,
  SESSION_ATTENDANCE: ATTENDANCE_COLUMNS,
  STUDENT_SUMMARY: SUMMARY_COLUMNS,
  DEFAULTERS: SUMMARY_COLUMNS,
  MONTHLY_REGISTER: REGISTER_COLUMNS,
};

/** The out-of-the-box column set for each report type. */
const DEFAULT_COLUMNS = {
  DAILY_ATTENDANCE: [
    'serial', 'date', 'dayName', 'studentCode', 'studentName', 'sectionCode',
    'subjectCode', 'subjectName', 'periodNumber', 'startTime', 'facultyName',
    'status', 'remarks',
  ],
  SESSION_ATTENDANCE: [
    'serial', 'studentCode', 'studentName', 'status', 'remarks', 'markedByName', 'markedAt',
  ],
  STUDENT_SUMMARY: [
    'serial', 'studentCode', 'studentName', 'sectionCode', 'subjectCode', 'subjectName',
    'heldPeriods', 'presentPeriods', 'absentPeriods', 'percent', 'riskBand',
  ],
  DEFAULTERS: [
    'serial', 'studentCode', 'studentName', 'sectionCode', 'semester', 'subjectCode',
    'subjectName', 'heldPeriods', 'presentPeriods', 'absentPeriods', 'percent',
    'riskBand', 'periodsToReachThreshold', 'guardianName', 'guardianPhone',
  ],
  MONTHLY_REGISTER: [
    'serial', 'studentCode', 'studentName', 'totalHeld', 'totalPresent', 'percent',
  ],
};

function getRegistry(reportType) {
  const registry = REGISTRIES[reportType];
  if (!registry) throw new Error(`Unknown report type: ${reportType}`);
  return registry;
}

/** Everything a UI column picker needs to render, with the default label. */
function describeColumns(reportType) {
  const registry = getRegistry(reportType);
  const defaults = DEFAULT_COLUMNS[reportType] || [];
  return Object.entries(registry).map(([key, def]) => ({
    key,
    defaultHeader: def.header,
    width: def.width,
    isDefault: defaults.includes(key),
    defaultOrder: defaults.indexOf(key),
  }));
}

/**
 * Resolves the effective column list for one export request.
 *
 * Precedence: explicit request columns > saved template > report defaults.
 * A requested column may be either a plain key string or
 * `{ key, header, width, format }` to rename or resize it on the fly.
 *
 * Unknown keys are ignored rather than throwing, so a stale saved template
 * never breaks a download.
 */
function resolveColumns({ reportType, requested, template }) {
  const registry = getRegistry(reportType);

  let source = null;
  if (Array.isArray(requested) && requested.length) {
    source = requested;
  } else if (template?.columns?.length) {
    source = template.columns
      .filter((c) => c.visible !== false)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } else {
    source = DEFAULT_COLUMNS[reportType] || Object.keys(registry);
  }

  const resolved = [];
  const unknown = [];

  source.forEach((item) => {
    const key = typeof item === 'string' ? item : item.key;
    const def = registry[key];
    if (!def) { unknown.push(key); return; }

    const override = typeof item === 'string' ? {} : item;
    resolved.push({
      key,
      header: override.header || def.header,
      width: override.width || def.width,
      format: override.format || def.format,
      align: override.align || def.align || 'left',
      resolve: def.resolve,
    });
  });

  if (!resolved.length) {
    // Never hand back an empty sheet - fall back to the defaults.
    (DEFAULT_COLUMNS[reportType] || []).forEach((key) => {
      const def = registry[key];
      if (def) resolved.push({ key, header: def.header, width: def.width, format: def.format, align: def.align || 'left', resolve: def.resolve });
    });
  }

  return { columns: resolved, unknown };
}

module.exports = {
  ATTENDANCE_COLUMNS, SUMMARY_COLUMNS, REGISTER_COLUMNS,
  REGISTRIES, DEFAULT_COLUMNS, RISK_LABEL,
  getRegistry, describeColumns, resolveColumns,
};
