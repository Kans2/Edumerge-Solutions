const {
  AttendanceRecord, AttendanceSummary, ClassSession, ExportTemplate,
  Section, Department, Programme, User, CourseOffering,
} = require('../../models');
const {
  ROLES, CAPABILITIES, DAYS, AUDIT_ACTION, RISK_BAND,
} = require('../../config/constants');
const ApiError = require('../../utils/ApiError');
const { buildWorkbook, buildFilename } = require('./excelBuilder');
const { describeColumns, DEFAULT_COLUMNS } = require('./columnRegistry');
const termService = require('../academics/termService');
const auditService = require('../audit/auditService');
const { dayOfWeek, isValidDateKey, toDateKey } = require('../../utils/dateUtils');

const has = (user, cap) => (user.capabilities || []).includes(cap);

/* ------------------------------------------------------------------ *
 *  Scoping
 * ------------------------------------------------------------------ */

/**
 * Applies row-level security to every export. A faculty member can only
 * export their own classes; an HOD their department; an officer everything.
 */
async function applyScope(user, filter, query) {
  if (user.role === ROLES.STUDENT) {
    throw ApiError.forbidden('Students cannot export class registers.');
  }
  if (has(user, CAPABILITIES.ATT_READ_ALL)) {
    if (query.departmentId) filter.departmentId = query.departmentId;
    return filter;
  }
  if (has(user, CAPABILITIES.ATT_READ_DEPT)) {
    filter.departmentId = user.departmentId;
    return filter;
  }

  // Plain faculty: their own offerings plus any section they advise
  const offeringIds = await CourseOffering.find({ facultyId: user._id, isActive: true }).distinct('_id');
  const advisorSections = user.staff?.advisorOfSectionIds || [];
  if (!offeringIds.length && !advisorSections.length) {
    throw ApiError.forbidden('You do not have any classes to export.');
  }
  filter.$or = [
    { offeringId: { $in: offeringIds } },
    ...(advisorSections.length ? [{ sectionId: { $in: advisorSections } }] : []),
  ];
  return filter;
}

/* ------------------------------------------------------------------ *
 *  Row builders
 * ------------------------------------------------------------------ */

/**
 * Flattens one day's attendance records into export rows, joining in the
 * session, section, department and (optionally) cumulative percentages.
 */
async function buildDailyRows(user, query) {
  const date = query.date;
  if (!isValidDateKey(date)) throw ApiError.badRequest('Provide a valid date as YYYY-MM-DD.');

  let filter = { date };
  if (query.sectionId) filter.sectionId = query.sectionId;
  if (query.subjectId) filter.subjectId = query.subjectId;
  if (query.offeringId) filter.offeringId = query.offeringId;
  if (query.status) filter.status = { $in: String(query.status).split(',') };
  filter = await applyScope(user, filter, query);

  const records = await AttendanceRecord.find(filter)
    .sort({ periodNumber: 1, rollNumber: 1, studentName: 1 })
    .limit(20000)
    .lean();

  if (!records.length) return { rows: [], context: { date } };

  const [sessions, sections, departments, students, markers] = await Promise.all([
    ClassSession.find({ _id: { $in: [...new Set(records.map((r) => String(r.sessionId)))] } })
      .select('startTime endTime periodNumber sessionType roomNumber facultyName subjectCode subjectName topic')
      .lean(),
    Section.find({ _id: { $in: [...new Set(records.map((r) => String(r.sectionId)))] } })
      .select('code currentSemester programmeId departmentId').lean(),
    Department.find({ _id: { $in: [...new Set(records.map((r) => String(r.departmentId)))] } })
      .select('name code').lean(),
    User.find({ _id: { $in: [...new Set(records.map((r) => String(r.studentId)))] } })
      .select('code name student').lean(),
    User.find({ _id: { $in: [...new Set(records.map((r) => String(r.markedBy)).filter(Boolean))] } })
      .select('name').lean(),
  ]);

  const programmes = await Programme.find({
    _id: { $in: [...new Set(sections.map((s) => String(s.programmeId)).filter(Boolean))] },
  }).select('name code').lean();

  const sessionMap = new Map(sessions.map((s) => [String(s._id), s]));
  const sectionMap = new Map(sections.map((s) => [String(s._id), s]));
  const deptMap = new Map(departments.map((d) => [String(d._id), d]));
  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const markerMap = new Map(markers.map((m) => [String(m._id), m]));
  const programmeMap = new Map(programmes.map((p) => [String(p._id), p]));

  // Cumulative percentages are only joined when the caller asks for them.
  let cumulativeMap = new Map();
  if (query.includeCumulative === 'true' || query.includeCumulative === true) {
    const termId = query.termId || (await termService.getCurrentTerm())?._id;
    const summaries = await AttendanceSummary.find({
      termId, scope: 'OVERALL', studentId: { $in: [...studentMap.keys()] },
    }).select('studentId percent').lean();
    cumulativeMap = new Map(summaries.map((s) => [String(s.studentId), s.percent]));
  }

  const dayName = DAYS[dayOfWeek(date)];

  const rows = records.map((r) => {
    const session = sessionMap.get(String(r.sessionId)) || {};
    const section = sectionMap.get(String(r.sectionId)) || {};
    const dept = deptMap.get(String(r.departmentId)) || {};
    const student = studentMap.get(String(r.studentId)) || {};
    const programme = programmeMap.get(String(section.programmeId)) || {};

    return {
      date: r.date,
      dayName,
      studentId: r.studentId,
      studentCode: r.studentCode || student.code,
      studentName: r.studentName || student.name,
      rollNumber: r.rollNumber || student.student?.rollNumber,
      registerNumber: student.student?.registerNumber,
      guardianName: student.student?.guardianName,
      guardianPhone: student.student?.guardianPhone,
      guardianEmail: student.student?.guardianEmail,
      departmentName: dept.name,
      programmeName: programme.name,
      sectionCode: section.code,
      semester: section.currentSemester,
      subjectCode: session.subjectCode,
      subjectName: session.subjectName,
      facultyName: session.facultyName,
      periodNumber: r.periodNumber ?? session.periodNumber,
      startTime: session.startTime,
      endTime: session.endTime,
      sessionType: session.sessionType,
      roomNumber: session.roomNumber,
      topic: session.topic,
      status: r.status,
      remarks: r.remarks,
      isCorrected: r.isCorrected,
      originalStatus: r.originalStatus,
      markedByName: markerMap.get(String(r.markedBy))?.name,
      markedAt: r.markedAt,
      cumulativePercent: cumulativeMap.get(String(r.studentId)),
    };
  });

  // Stable ordering: period, then roll number
  rows.sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0)
    || String(a.rollNumber || '').localeCompare(String(b.rollNumber || '')));

  return {
    rows,
    context: {
      date,
      dayName,
      sectionCode: rows[0]?.sectionCode,
      subjectCode: query.subjectId ? rows[0]?.subjectCode : undefined,
      totalRecords: rows.length,
      present: rows.filter((r) => ['PRESENT', 'LATE'].includes(r.status)).length,
      absent: rows.filter((r) => r.status === 'ABSENT').length,
    },
  };
}

/** One session's roster. */
async function buildSessionRows(user, sessionId) {
  const session = await ClassSession.findById(sessionId).lean();
  if (!session) throw ApiError.notFound('Class session not found.');
  require('../attendance/attendanceService').assertCanViewSession(user, session);

  const records = await AttendanceRecord.find({ sessionId })
    .sort({ rollNumber: 1, studentName: 1 }).lean();

  const markers = await User.find({
    _id: { $in: [...new Set(records.map((r) => String(r.markedBy)).filter(Boolean))] },
  }).select('name').lean();
  const markerMap = new Map(markers.map((m) => [String(m._id), m]));

  const rows = records.map((r) => ({
    ...r,
    dayName: DAYS[session.dayOfWeek],
    subjectCode: session.subjectCode,
    subjectName: session.subjectName,
    sectionCode: session.sectionCode,
    facultyName: session.facultyName,
    periodNumber: session.periodNumber,
    startTime: session.startTime,
    endTime: session.endTime,
    sessionType: session.sessionType,
    roomNumber: session.roomNumber,
    markedByName: markerMap.get(String(r.markedBy))?.name,
  }));

  return {
    rows,
    context: {
      date: session.date,
      sectionCode: session.sectionCode,
      subjectCode: session.subjectCode,
      subjectName: session.subjectName,
      facultyName: session.facultyName,
      periodNumber: session.periodNumber,
      totalRecords: rows.length,
    },
  };
}

/** Summary or defaulter rows from the materialised summary collection. */
async function buildSummaryRows(user, query, { defaultersOnly = false } = {}) {
  const term = query.termId ? await termService.getTerm(query.termId) : await termService.requireCurrentTerm();
  const activePolicy = term?.policy || {};
  const threshold = Number(query.threshold) || activePolicy.minAttendancePercent || 75;

  let filter = { termId: term._id, scope: query.scope === 'OVERALL' ? 'OVERALL' : 'SUBJECT' };
  if (query.sectionId) filter.sectionId = query.sectionId;
  if (query.offeringId) filter.offeringId = query.offeringId;
  if (query.subjectId) filter.subjectId = query.subjectId;
  if (query.riskBand) filter.riskBand = { $in: String(query.riskBand).split(',') };
  if (defaultersOnly) filter.percent = { $lt: threshold };
  filter = await applyScope(user, filter, query);

  const summaries = await AttendanceSummary.find(filter)
    .sort({ percent: 1, studentName: 1 })
    .limit(20000)
    .lean();

  if (!summaries.length) return { rows: [], context: { termName: term.name, threshold } };

  const [students, sections, departments] = await Promise.all([
    User.find({ _id: { $in: [...new Set(summaries.map((s) => String(s.studentId)))] } })
      .select('code name student').lean(),
    Section.find({ _id: { $in: [...new Set(summaries.map((s) => String(s.sectionId)).filter(Boolean))] } })
      .select('code currentSemester').lean(),
    Department.find({ _id: { $in: [...new Set(summaries.map((s) => String(s.departmentId)).filter(Boolean))] } })
      .select('name').lean(),
  ]);

  const studentMap = new Map(students.map((s) => [String(s._id), s]));
  const sectionMap = new Map(sections.map((s) => [String(s._id), s]));
  const deptMap = new Map(departments.map((d) => [String(d._id), d]));

  const rows = summaries.map((s) => {
    const student = studentMap.get(String(s.studentId)) || {};
    const section = sectionMap.get(String(s.sectionId)) || {};
    return {
      ...s,
      registerNumber: student.student?.registerNumber,
      guardianName: student.student?.guardianName,
      guardianPhone: student.student?.guardianPhone,
      guardianEmail: student.student?.guardianEmail,
      semester: section.currentSemester,
      sectionCode: s.sectionCode || section.code,
      departmentName: deptMap.get(String(s.departmentId))?.name,
    };
  });

  return {
    rows,
    context: {
      termName: term.name,
      threshold,
      totalRecords: rows.length,
      detained: rows.filter((r) => r.riskBand === RISK_BAND.DETAINED).length,
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Public export entry point
 * ------------------------------------------------------------------ */

const TITLES = {
  DAILY_ATTENDANCE: 'Daily Attendance Register',
  SESSION_ATTENDANCE: 'Class Attendance Sheet',
  STUDENT_SUMMARY: 'Attendance Summary',
  DEFAULTERS: 'Low Attendance (Defaulters) Report',
  MONTHLY_REGISTER: 'Monthly Attendance Register',
};

/**
 * Produces the .xlsx buffer for any report type.
 *
 * Column customisation resolves in this order:
 *   1. `columns` supplied on the request  (strings or {key, header, width})
 *   2. a saved ExportTemplate referenced by `templateId`
 *   3. the report type's built-in defaults
 */
async function generateExcel(user, { reportType, query = {}, columns = null, templateId = null, options = {} }) {
  if (!TITLES[reportType]) throw ApiError.badRequest(`Unsupported report type: ${reportType}`);

  let template = null;
  if (templateId) {
    template = await ExportTemplate.findById(templateId).lean();
    if (!template) throw ApiError.notFound('Export template not found.');
    if (template.scope === 'PRIVATE' && String(template.ownerId) !== String(user._id)
      && !has(user, CAPABILITIES.ADMIN_MANAGE)) {
      throw ApiError.forbidden('This export template belongs to another user.');
    }
  } else {
    template = await ExportTemplate.findOne({
      reportType, isDefault: true,
      $or: [{ scope: 'GLOBAL' }, { ownerId: user._id }, { departmentId: user.departmentId }],
    }).lean();
  }

  let built;
  switch (reportType) {
    case 'DAILY_ATTENDANCE': built = await buildDailyRows(user, query); break;
    case 'SESSION_ATTENDANCE': built = await buildSessionRows(user, query.sessionId); break;
    case 'STUDENT_SUMMARY': built = await buildSummaryRows(user, query); break;
    case 'DEFAULTERS': built = await buildSummaryRows(user, query, { defaultersOnly: true }); break;
    case 'MONTHLY_REGISTER': built = await buildSummaryRows(user, query); break;
    default: throw ApiError.badRequest('Unsupported report type.');
  }

  const meta = {
    title: options.title || TITLES[reportType],
    subtitle: options.subtitle || buildSubtitle(reportType, built.context),
    generatedBy: user.name,
    filters: buildFilterChips(query, built.context),
    ...built.context,
  };

  const result = await buildWorkbook({
    reportType,
    rows: built.rows,
    requestedColumns: columns,
    template,
    meta,
    options: { threshold: built.context.threshold || 75, ...options },
  });

  await auditService.record({
    action: AUDIT_ACTION.EXPORT_RUN,
    entityType: 'Export',
    actor: user,
    summary: `Exported ${reportType} (${result.rowCount} rows)`,
    meta: {
      reportType, query,
      columns: result.columns.map((c) => c.key),
      unknownColumns: result.unknownColumns,
    },
  });

  return {
    ...result,
    filename: options.filename || buildFilename(reportType, meta),
    context: built.context,
  };
}

function buildSubtitle(reportType, ctx = {}) {
  if (reportType === 'DAILY_ATTENDANCE' && ctx.date) {
    return `${ctx.dayName || ''} ${ctx.date} — ${ctx.present ?? 0} present, ${ctx.absent ?? 0} absent of ${ctx.totalRecords ?? 0} entries`;
  }
  if (reportType === 'SESSION_ATTENDANCE') {
    return [ctx.subjectName, ctx.sectionCode, ctx.date, ctx.facultyName].filter(Boolean).join(' · ');
  }
  if (reportType === 'DEFAULTERS') {
    return `${ctx.termName || ''} — below ${ctx.threshold}% (${ctx.totalRecords ?? 0} students, ${ctx.detained ?? 0} detained)`;
  }
  return ctx.termName || '';
}

function buildFilterChips(query, ctx) {
  const chips = {};
  if (query.date) chips.Date = query.date;
  if (query.from && query.to) chips.Period = `${query.from} to ${query.to}`;
  if (ctx.sectionCode) chips.Section = ctx.sectionCode;
  if (ctx.subjectCode) chips.Subject = ctx.subjectCode;
  if (ctx.termName) chips.Term = ctx.termName;
  if (query.threshold) chips.Threshold = `${query.threshold}%`;
  if (query.status) chips.Status = query.status;
  return chips;
}

/* ------------------------------------------------------------------ *
 *  Template management
 * ------------------------------------------------------------------ */

async function listTemplates(user, reportType) {
  const filter = {
    $or: [{ ownerId: user._id }, { scope: 'GLOBAL' }, { scope: 'DEPARTMENT', departmentId: user.departmentId }],
  };
  if (reportType) filter.reportType = reportType;
  return ExportTemplate.find(filter).sort({ reportType: 1, name: 1 }).lean();
}

async function saveTemplate(user, payload) {
  const doc = {
    name: payload.name,
    reportType: payload.reportType,
    columns: (payload.columns || []).map((c, i) => ({
      key: c.key,
      header: c.header,
      width: c.width || 18,
      visible: c.visible !== false,
      order: c.order ?? i,
      format: c.format,
    })),
    options: payload.options || {},
    ownerId: user._id,
    scope: payload.scope || 'PRIVATE',
    departmentId: payload.scope === 'DEPARTMENT' ? user.departmentId : undefined,
    isDefault: Boolean(payload.isDefault),
  };

  if (doc.isDefault) {
    await ExportTemplate.updateMany(
      { reportType: doc.reportType, ownerId: user._id },
      { $set: { isDefault: false } }
    );
  }

  return ExportTemplate.findOneAndUpdate(
    { reportType: doc.reportType, ownerId: user._id, name: doc.name },
    { $set: doc },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function deleteTemplate(user, id) {
  const t = await ExportTemplate.findById(id);
  if (!t) throw ApiError.notFound('Export template not found.');
  if (String(t.ownerId) !== String(user._id) && !has(user, CAPABILITIES.ADMIN_MANAGE)) {
    throw ApiError.forbidden('You can only delete your own templates.');
  }
  await t.deleteOne();
  return { deleted: true };
}

/** Column catalogue for the UI picker, including each column's default label. */
function getColumnCatalogue(reportType) {
  if (reportType) {
    return { reportType, columns: describeColumns(reportType), defaults: DEFAULT_COLUMNS[reportType] };
  }
  return Object.keys(TITLES).map((rt) => ({
    reportType: rt,
    title: TITLES[rt],
    columns: describeColumns(rt),
    defaults: DEFAULT_COLUMNS[rt],
  }));
}

module.exports = {
  generateExcel, buildDailyRows, buildSessionRows, buildSummaryRows,
  listTemplates, saveTemplate, deleteTemplate, getColumnCatalogue, TITLES,
};
