const {
  AttendanceSummary, AttendanceRecord, ClassSession, Section, User, CourseOffering,
} = require('../../models');
const {
  ROLES, CAPABILITIES, RISK_BAND, SESSION_STATUS, AUDIT_ACTION,
} = require('../../config/constants');
const ApiError = require('../../utils/ApiError');
const termService = require('../academics/termService');
const auditService = require('../audit/auditService');
const notificationService = require('../notifications/notificationService');
const attendancePolicy = require('../attendance/attendancePolicy');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { toDateKey } = require('../../utils/dateUtils');

const has = (user, cap) => (user.capabilities || []).includes(cap);

/** Restricts every report to the viewer's slice of the institution. */
async function scopeMatch(user, query = {}) {
  const match = {};
  if (has(user, CAPABILITIES.REPORT_VIEW_ALL) || has(user, CAPABILITIES.ATT_READ_ALL)) {
    if (query.departmentId) match.departmentId = query.departmentId;
  } else if (has(user, CAPABILITIES.REPORT_VIEW_DEPT) || has(user, CAPABILITIES.ATT_READ_DEPT)) {
    match.departmentId = user.departmentId;
  } else if (user.role === ROLES.FACULTY) {
    const offeringIds = await CourseOffering.find({ facultyId: user._id, isActive: true }).distinct('_id');
    match.offeringId = { $in: offeringIds };
  } else {
    throw ApiError.forbidden('You do not have access to reports.');
  }
  if (query.sectionId) match.sectionId = query.sectionId;
  return match;
}

/* ------------------------------------------------------------------ *
 *  Defaulters
 * ------------------------------------------------------------------ */

/**
 * Students below the threshold. Defaults to the OVERALL scope, which is what
 * detention decisions are actually based on; pass scope=SUBJECT to drill in.
 */
async function getDefaulters(user, query = {}) {
  const term = query.termId ? await termService.getTerm(query.termId) : await termService.requireCurrentTerm();
  const activePolicy = term.policy || attendancePolicy.DEFAULT_POLICY;
  const threshold = Number(query.threshold) || activePolicy.minAttendancePercent;

  const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });
  const match = {
    ...(await scopeMatch(user, query)),
    termId: term._id,
    scope: query.scope === 'SUBJECT' ? 'SUBJECT' : 'OVERALL',
    percent: { $lt: threshold },
  };
  if (query.riskBand) match.riskBand = { $in: String(query.riskBand).split(',') };
  if (query.excludeCondoned === 'true') match['condonation.granted'] = { $ne: true };

  const [items, total, bands] = await Promise.all([
    AttendanceSummary.find(match).sort({ percent: 1, studentName: 1 }).skip(skip).limit(limit).lean(),
    AttendanceSummary.countDocuments(match),
    AttendanceSummary.aggregate([
      { $match: match },
      { $group: { _id: '$riskBand', count: { $sum: 1 } } },
    ]),
  ]);

  const studentIds = items.map((i) => i.studentId);
  const students = await User.find({ _id: { $in: studentIds } })
    .select('code name email student.guardianName student.guardianPhone student.guardianEmail student.registerNumber')
    .lean();
  const studentMap = new Map(students.map((s) => [String(s._id), s]));

  const enriched = items.map((i) => {
    const s = studentMap.get(String(i.studentId)) || {};
    return {
      ...i,
      email: s.email,
      registerNumber: s.student?.registerNumber,
      guardianName: s.student?.guardianName,
      guardianPhone: s.student?.guardianPhone,
      guardianEmail: s.student?.guardianEmail,
      shortfallPercent: Math.round((threshold - i.percent) * 100) / 100,
    };
  });

  return {
    items: enriched,
    meta: buildMeta(page, limit, total),
    summary: {
      threshold,
      termName: term.name,
      total,
      byBand: Object.fromEntries(bands.map((b) => [b._id, b.count])),
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Section & department rollups
 * ------------------------------------------------------------------ */

async function getSectionReport(user, sectionId, query = {}) {
  const term = query.termId ? await termService.getTerm(query.termId) : await termService.requireCurrentTerm();
  const section = await Section.findById(sectionId).lean();
  if (!section) throw ApiError.notFound('Section not found.');

  if (!has(user, CAPABILITIES.ATT_READ_ALL)
    && !has(user, CAPABILITIES.ATT_READ_DEPT)
    && String(section.classAdvisorId) !== String(user._id)) {
    const teaches = await CourseOffering.exists({ sectionId, facultyId: user._id, isActive: true });
    if (!teaches) throw ApiError.forbidden('You do not have access to this section.');
  }

  const threshold = term.policy?.minAttendancePercent || 75;

  const [students, subjectRows] = await Promise.all([
    AttendanceSummary.find({ sectionId, termId: term._id, scope: 'OVERALL' })
      .sort({ percent: 1 }).lean(),
    AttendanceSummary.aggregate([
      { $match: { sectionId: section._id, termId: term._id, scope: 'SUBJECT' } },
      {
        $group: {
          _id: '$offeringId',
          subjectCode: { $first: '$subjectCode' },
          subjectName: { $first: '$subjectName' },
          avgPercent: { $avg: '$percent' },
          held: { $max: '$heldPeriods' },
          belowThreshold: { $sum: { $cond: [{ $lt: ['$percent', threshold] }, 1, 0] } },
          students: { $sum: 1 },
        },
      },
      { $sort: { avgPercent: 1 } },
    ]),
  ]);

  const bands = students.reduce((acc, s) => {
    acc[s.riskBand] = (acc[s.riskBand] || 0) + 1;
    return acc;
  }, {});

  const avg = students.length
    ? Math.round((students.reduce((sum, s) => sum + s.percent, 0) / students.length) * 100) / 100
    : 0;

  return {
    section,
    termName: term.name,
    threshold,
    averagePercent: avg,
    studentCount: students.length,
    bands,
    students,
    subjects: subjectRows.map((s) => ({
      ...s,
      avgPercent: Math.round(s.avgPercent * 100) / 100,
    })),
  };
}

async function getDepartmentReport(user, query = {}) {
  const term = query.termId ? await termService.getTerm(query.termId) : await termService.requireCurrentTerm();
  const match = { ...(await scopeMatch(user, query)), termId: term._id, scope: 'OVERALL' };
  const threshold = term.policy?.minAttendancePercent || 75;

  const bySection = await AttendanceSummary.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$sectionId',
        sectionCode: { $first: '$sectionCode' },
        students: { $sum: 1 },
        avgPercent: { $avg: '$percent' },
        below: { $sum: { $cond: [{ $lt: ['$percent', threshold] }, 1, 0] } },
        detained: { $sum: { $cond: [{ $eq: ['$riskBand', RISK_BAND.DETAINED] }, 1, 0] } },
      },
    },
    { $sort: { avgPercent: 1 } },
  ]);

  const byDepartment = await AttendanceSummary.aggregate([
    { $match: { termId: term._id, scope: 'OVERALL', ...(match.departmentId ? { departmentId: match.departmentId } : {}) } },
    {
      $group: {
        _id: '$departmentId',
        students: { $sum: 1 },
        avgPercent: { $avg: '$percent' },
        below: { $sum: { $cond: [{ $lt: ['$percent', threshold] }, 1, 0] } },
      },
    },
    { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'd' } },
    { $addFields: { name: { $arrayElemAt: ['$d.name', 0] } } },
    { $project: { d: 0 } },
    { $sort: { avgPercent: 1 } },
  ]);

  return {
    termName: term.name,
    threshold,
    bySection: bySection.map((s) => ({ ...s, avgPercent: round2(s.avgPercent) })),
    byDepartment: byDepartment.map((d) => ({ ...d, avgPercent: round2(d.avgPercent) })),
  };
}

/* ------------------------------------------------------------------ *
 *  Daily overview
 * ------------------------------------------------------------------ */

/** What actually happened on one day across the viewer's scope. */
async function getDailyOverview(user, query = {}) {
  const date = query.date || toDateKey(new Date());
  const match = { date };

  if (has(user, CAPABILITIES.ATT_READ_ALL)) {
    if (query.departmentId) match.departmentId = query.departmentId;
  } else if (has(user, CAPABILITIES.ATT_READ_DEPT)) {
    match.departmentId = user.departmentId;
  } else {
    match.facultyId = user._id;
  }
  if (query.sectionId) match.sectionId = query.sectionId;

  const [sessionAgg, recordAgg] = await Promise.all([
    ClassSession.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    AttendanceRecord.aggregate([
      { $match: { date, ...(match.departmentId ? { departmentId: match.departmentId } : {}),
        ...(match.sectionId ? { sectionId: match.sectionId } : {}) } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const sessions = Object.fromEntries(sessionAgg.map((s) => [s._id, s.count]));
  const records = Object.fromEntries(recordAgg.map((r) => [r._id, r.count]));

  const present = (records.PRESENT || 0) + (records.LATE || 0);
  const countable = present + (records.ABSENT || 0);

  return {
    date,
    sessions: {
      scheduled: sessions[SESSION_STATUS.SCHEDULED] || 0,
      marked: sessions[SESSION_STATUS.MARKED] || 0,
      locked: sessions[SESSION_STATUS.LOCKED] || 0,
      cancelled: sessions[SESSION_STATUS.CANCELLED] || 0,
      total: Object.values(sessions).reduce((a, b) => a + b, 0),
    },
    marks: {
      present: records.PRESENT || 0,
      absent: records.ABSENT || 0,
      late: records.LATE || 0,
      excused: records.EXCUSED || 0,
      leave: records.LEAVE || 0,
      total: Object.values(records).reduce((a, b) => a + b, 0),
    },
    attendancePercent: countable ? round2((present / countable) * 100) : null,
    markingCompliance: (sessions[SESSION_STATUS.SCHEDULED] || 0) + (sessions[SESSION_STATUS.MARKED] || 0) + (sessions[SESSION_STATUS.LOCKED] || 0) > 0
      ? round2((((sessions[SESSION_STATUS.MARKED] || 0) + (sessions[SESSION_STATUS.LOCKED] || 0))
        / ((sessions[SESSION_STATUS.SCHEDULED] || 0) + (sessions[SESSION_STATUS.MARKED] || 0) + (sessions[SESSION_STATUS.LOCKED] || 0))) * 100)
      : null,
  };
}

/** Attendance percentage per day over a window, for trend charts. */
async function getTrend(user, query = {}) {
  const days = Math.min(Number(query.days) || 30, 120);
  const to = query.to || toDateKey(new Date());
  const from = query.from || toDateKey(new Date(Date.now() - days * 86400000));

  const match = { date: { $gte: from, $lte: to } };
  if (has(user, CAPABILITIES.ATT_READ_ALL)) {
    if (query.departmentId) match.departmentId = query.departmentId;
  } else if (has(user, CAPABILITIES.ATT_READ_DEPT)) {
    match.departmentId = user.departmentId;
  }
  if (query.sectionId) match.sectionId = query.sectionId;

  const rows = await AttendanceRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$date',
        present: { $sum: { $cond: [{ $in: ['$status', ['PRESENT', 'LATE']] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'ABSENT'] }, 1, 0] } },
        exempt: { $sum: { $cond: [{ $in: ['$status', ['EXCUSED', 'LEAVE']] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((r) => {
    const countable = r.present + r.absent;
    return {
      date: r._id,
      present: r.present,
      absent: r.absent,
      exempt: r.exempt,
      percent: countable ? round2((r.present / countable) * 100) : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 *  Condonation & alerts
 * ------------------------------------------------------------------ */

async function grantCondonation(user, summaryId, payload) {
  if (!has(user, CAPABILITIES.CONDONATION_GRANT)) {
    throw ApiError.forbidden('You cannot grant condonation.');
  }
  const summary = await AttendanceSummary.findById(summaryId);
  if (!summary) throw ApiError.notFound('Attendance summary not found.');

  const term = await termService.getTerm(summary.termId);
  const floor = term?.policy?.condonationFloorPercent || 65;
  if (summary.percent < floor) {
    throw ApiError.badRequest(
      `Attendance of ${summary.percent}% is below the condonation floor of ${floor}% and cannot be condoned.`
    );
  }

  summary.condonation = {
    granted: true,
    grantedBy: user._id,
    grantedAt: new Date(),
    reason: payload.reason,
  };
  await summary.save();

  await auditService.record({
    action: AUDIT_ACTION.CONDONATION_GRANTED,
    entityType: 'AttendanceSummary',
    entityId: summary._id,
    actor: user,
    summary: `Condonation granted to ${summary.studentName} (${summary.percent}%)`,
    meta: { reason: payload.reason },
  });

  await notificationService.notify({
    userId: summary.studentId,
    type: 'CONDONATION_GRANTED',
    title: 'Attendance condonation granted',
    body: `Your attendance of ${summary.percent}% has been condoned. ${payload.reason || ''}`.trim(),
    link: '/my-attendance',
  });
  return summary;
}

/**
 * Weekly warning to every student below the threshold, plus their guardian
 * when an email is on file.
 */
async function sendLowAttendanceAlerts() {
  const term = await termService.getCurrentTerm();
  if (!term) return { notified: 0 };
  const threshold = term.policy?.minAttendancePercent || 75;

  const defaulters = await AttendanceSummary.find({
    termId: term._id, scope: 'OVERALL', percent: { $lt: threshold }, 'condonation.granted': { $ne: true },
  }).lean();

  if (!defaulters.length) return { notified: 0 };

  await notificationService.notifyMany(defaulters.map((d) => ({
    userId: d.studentId,
    type: 'LOW_ATTENDANCE',
    title: `Your attendance is ${d.percent}%`,
    body: d.periodsToReachThreshold == null
      ? `You are below the required ${threshold}% and can no longer reach it this term. Please meet your class advisor.`
      : `You are below the required ${threshold}%. Attend the next ${d.periodsToReachThreshold} classes without a break to recover.`,
    severity: d.riskBand === RISK_BAND.DETAINED ? 'CRITICAL' : 'WARNING',
    link: '/my-attendance',
  })));

  return { notified: defaulters.length, threshold, termName: term.name };
}

function round2(n) { return Math.round((n || 0) * 100) / 100; }

module.exports = {
  getDefaulters, getSectionReport, getDepartmentReport,
  getDailyOverview, getTrend, grantCondonation, sendLowAttendanceAlerts,
};
