const mongoose = require('mongoose');
const {
  ClassSession, AttendanceRecord, AttendanceSummary, User, CourseOffering,
  LeaveRequest, AcademicTerm, Section,
} = require('../../models');
const {
  ATT_STATUS, SESSION_STATUS, ROLES, AUDIT_ACTION, DAYS, CAPABILITIES,
} = require('../../config/constants');
const ApiError = require('../../utils/ApiError');
const policy = require('./attendancePolicy');
const auditService = require('../audit/auditService');
const termService = require('../academics/termService');
const { toDateKey, dayOfWeek } = require('../../utils/dateUtils');
const { emitToSection, emitToUser } = require('../../sockets');
const logger = require('../../config/logger');

/* ------------------------------------------------------------------ *
 *  Access control helpers
 * ------------------------------------------------------------------ */

const has = (user, cap) => (user.capabilities || []).includes(cap);

function assertCanViewSession(user, session) {
  if (has(user, CAPABILITIES.ATT_READ_ALL)) return;
  if (has(user, CAPABILITIES.ATT_READ_DEPT)
    && String(session.departmentId) === String(user.departmentId)) return;
  if (String(session.facultyId) === String(user._id)) return;

  const advisorSections = (user.staff?.advisorOfSectionIds || []).map(String);
  if (advisorSections.includes(String(session.sectionId))) return;

  throw ApiError.forbidden('You do not have access to this class.');
}

/** Students never read a roster; they only read their own records. */
function assertNotStudent(user) {
  if (user.role === ROLES.STUDENT) throw ApiError.forbidden('Students cannot view class rosters.');
}

/* ------------------------------------------------------------------ *
 *  Roster
 * ------------------------------------------------------------------ */

async function getActiveStudents(sectionId) {
  return User.find({
    role: ROLES.STUDENT,
    'student.sectionId': sectionId,
    status: 'ACTIVE',
  })
    .select('code name student.rollNumber student.registerNumber student.guardianName student.guardianPhone')
    .sort({ 'student.rollNumber': 1, name: 1 })
    .lean();
}

/**
 * Returns the roster a faculty member sees when they open a class.
 * Everyone defaults to PRESENT; approved OD/leave is pre-applied and locked.
 */
async function getSessionRoster(user, sessionId) {
  assertNotStudent(user);

  const session = await ClassSession.findById(sessionId).lean();
  if (!session) throw ApiError.notFound('Class session not found.');
  assertCanViewSession(user, session);

  const term = await termService.getTerm(session.termId);
  const activePolicy = term?.policy || policy.DEFAULT_POLICY;

  const [students, existing, leaves] = await Promise.all([
    getActiveStudents(session.sectionId),
    AttendanceRecord.find({ sessionId: session._id }).lean(),
    LeaveRequest.find({
      sectionId: session.sectionId,
      status: 'APPROVED',
      fromDate: { $lte: session.date },
      toDate: { $gte: session.date },
    }).lean(),
  ]);

  const roster = policy.buildDefaultRoster(students, {
    policy: activePolicy,
    approvedLeaves: leaves,
    existing,
  });

  const editable = policy.canEditSession(session, user, activePolicy);

  return {
    session,
    roster,
    stats: policy.sessionStats(roster),
    policy: activePolicy,
    isMarked: session.status === SESSION_STATUS.MARKED || existing.length > 0,
    editable: editable.allowed,
    editBlockedReason: editable.reason || null,
    defaultMark: activePolicy.defaultMark,
  };
}

/* ------------------------------------------------------------------ *
 *  Marking
 * ------------------------------------------------------------------ */

/**
 * Marks or re-marks a whole session in one idempotent operation.
 *
 * Every write is a bulk upsert keyed on (sessionId, studentId), so submitting
 * the same roster twice produces the same state rather than duplicates.
 * Students omitted from the payload receive the policy default mark, which is
 * what allows the UI to send only the absentees.
 */
async function markSession(user, sessionId, payload, ctx = {}) {
  assertNotStudent(user);
  if (!has(user, CAPABILITIES.ATT_MARK)) throw ApiError.forbidden('You cannot mark attendance.');

  const session = await ClassSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Class session not found.');
  assertCanViewSession(user, session);

  if (session.status === SESSION_STATUS.CANCELLED) {
    throw ApiError.badRequest('This class was cancelled and cannot be marked.');
  }

  const term = await termService.getTerm(session.termId);
  const activePolicy = term?.policy || policy.DEFAULT_POLICY;

  const isRemark = session.status === SESSION_STATUS.MARKED;
  if (isRemark) {
    const check = policy.canEditSession(session, user, activePolicy);
    if (!check.allowed) throw ApiError.locked(check.reason);
  }

  const students = await getActiveStudents(session.sectionId);
  const studentIds = students.map((s) => s._id);

  // Build the full roster: supplied entries win, everyone else gets the default.
  const supplied = new Map((payload.entries || []).map((e) => [String(e.studentId), e]));
  const check = policy.validateRoster(payload.entries || [], studentIds);
  if (!check.valid) {
    throw ApiError.validation('The roster contains entries that do not belong to this class.', {
      unknownStudents: check.unknown,
      invalidStatuses: check.badStatus,
      duplicates: check.duplicates,
    });
  }

  const leaves = await LeaveRequest.find({
    sectionId: session.sectionId,
    status: 'APPROVED',
    fromDate: { $lte: session.date },
    toDate: { $gte: session.date },
  }).lean();
  const leaveByStudent = new Map(leaves.map((l) => [String(l.studentId), l]));

  const before = await AttendanceRecord.find({ sessionId: session._id }).lean();
  const beforeByStudent = new Map(before.map((r) => [String(r.studentId), r]));

  const now = new Date();
  const entries = students.map((s) => {
    const id = String(s._id);
    const given = supplied.get(id);
    const leave = leaveByStudent.get(id);

    let status = given?.status;
    let leaveId = null;

    // An approved leave always wins unless staff explicitly overrode it.
    if (leave && !given) {
      status = leave.leaveType === 'ON_DUTY' ? ATT_STATUS.EXCUSED : ATT_STATUS.LEAVE;
      leaveId = leave._id;
    }
    if (!status) status = activePolicy.defaultMark || ATT_STATUS.PRESENT;

    return {
      studentId: s._id,
      studentCode: s.code,
      studentName: s.name,
      rollNumber: s.student?.rollNumber,
      status,
      remarks: given?.remarks || (leave ? `${leave.leaveType} approved` : ''),
      leaveId,
    };
  });

  const ops = entries.map((e) => {
    const prior = beforeByStudent.get(String(e.studentId));
    const changed = prior && prior.status !== e.status;

    return {
      updateOne: {
        filter: { sessionId: session._id, studentId: e.studentId },
        update: {
          $set: {
            offeringId: session.offeringId,
            termId: session.termId,
            sectionId: session.sectionId,
            subjectId: session.subjectId,
            departmentId: session.departmentId,
            date: session.date,
            periodNumber: session.periodNumber,
            periodsCounted: session.periodsCounted || 1,
            status: e.status,
            remarks: e.remarks,
            studentCode: e.studentCode,
            studentName: e.studentName,
            rollNumber: e.rollNumber,
            markedBy: user._id,
            markedAt: now,
            leaveId: e.leaveId,
            ...(changed ? { isCorrected: false, originalStatus: prior.originalStatus || prior.status } : {}),
          },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  });

  if (ops.length) await AttendanceRecord.bulkWrite(ops, { ordered: false });

  const stats = policy.sessionStats(entries);
  session.status = SESSION_STATUS.MARKED;
  session.stats = stats;
  if (!session.markedAt) {
    session.markedBy = user._id;
    session.markedByName = user.name;
    session.markedAt = now;
  } else {
    session.lastEditedBy = user._id;
    session.lastEditedAt = now;
    session.editCount = (session.editCount || 0) + 1;
  }
  if (payload.topic) session.topic = payload.topic;
  await session.save();

  await CourseOffering.updateOne(
    { _id: session.offeringId },
    isRemark ? {} : { $inc: { conductedPeriods: session.periodsCounted || 1 } }
  );

  const changedStudents = entries.filter((e) => {
    const prior = beforeByStudent.get(String(e.studentId));
    return prior && prior.status !== e.status;
  });

  await auditService.record({
    action: isRemark ? AUDIT_ACTION.ATT_UPDATED : AUDIT_ACTION.ATT_MARKED,
    entityType: 'ClassSession',
    entityId: session._id,
    actor: user,
    summary: isRemark
      ? `Re-marked ${session.subjectCode} on ${session.date} (${changedStudents.length} changes)`
      : `Marked ${session.subjectCode} on ${session.date}: ${stats.present} present, ${stats.absent} absent`,
    before: isRemark ? { stats: before.length ? summarise(before) : null } : null,
    after: { stats },
    meta: { changed: changedStudents.map((c) => ({ studentCode: c.studentCode, to: c.status })) },
    ipAddress: ctx.ip,
  });

  // Recompute summaries off the request path.
  recomputeForSessionAsync(session);

  emitToSection(String(session.sectionId), 'attendance:marked', {
    sessionId: session._id, date: session.date, stats,
  });
  notifyAbsentees(entries, session).catch((err) => logger.warn({ err }, 'Absence notification failed'));

  return { session, stats, recordCount: entries.length, changed: changedStudents.length };
}

/**
 * Updates individual students inside an already-marked session.
 * Used by the inline roster editor rather than a full re-submit.
 */
async function updateRecords(user, sessionId, payload, ctx = {}) {
  assertNotStudent(user);

  const session = await ClassSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Class session not found.');
  assertCanViewSession(user, session);

  const term = await termService.getTerm(session.termId);
  const activePolicy = term?.policy || policy.DEFAULT_POLICY;

  const check = policy.canEditSession(session, user, activePolicy);
  if (!check.allowed) throw ApiError.locked(check.reason);

  const now = new Date();
  const results = [];

  for (const change of payload.changes || []) {
    const record = await AttendanceRecord.findOne({
      sessionId: session._id, studentId: change.studentId,
    });
    if (!record) { results.push({ studentId: change.studentId, ok: false, error: 'Record not found' }); continue; }
    if (record.status === change.status) { results.push({ studentId: change.studentId, ok: true, skipped: true }); continue; }

    const from = record.status;
    record.originalStatus = record.originalStatus || from;
    record.status = change.status;
    if (change.remarks !== undefined) record.remarks = change.remarks;
    record.correctedBy = user._id;
    record.correctedAt = now;
    await record.save();

    await auditService.record({
      action: AUDIT_ACTION.ATT_UPDATED,
      entityType: 'AttendanceRecord',
      entityId: record._id,
      actor: user,
      summary: `${record.studentName} (${record.studentCode}) changed from ${from} to ${change.status} on ${session.date}`,
      before: { status: from },
      after: { status: change.status },
      ipAddress: ctx.ip,
    });
    results.push({ studentId: change.studentId, ok: true, from, to: change.status });
  }

  await refreshSessionStats(session);
  recomputeForSessionAsync(session);

  return { updated: results.filter((r) => r.ok && !r.skipped).length, results };
}

async function refreshSessionStats(session) {
  const records = await AttendanceRecord.find({ sessionId: session._id }).lean();
  session.stats = policy.sessionStats(records);
  session.lastEditedAt = new Date();
  await session.save();
  return session.stats;
}

function summarise(records) {
  return policy.sessionStats(records);
}

/* ------------------------------------------------------------------ *
 *  Summary recomputation
 * ------------------------------------------------------------------ */

function recomputeForSessionAsync(session) {
  setImmediate(() => {
    recomputeOffering(session.offeringId, session.termId)
      .catch((err) => logger.error({ err, offeringId: session.offeringId }, 'Summary recompute failed'));
  });
}

/**
 * Rebuilds AttendanceSummary rows for one offering, plus each affected
 * student's OVERALL row. Idempotent — safe to re-run at any time.
 */
async function recomputeOffering(offeringId, termId) {
  const offering = await CourseOffering.findById(offeringId).lean();
  if (!offering) return { updated: 0 };

  const term = await termService.getTerm(termId || offering.termId);
  const activePolicy = term?.policy || policy.DEFAULT_POLICY;

  const records = await AttendanceRecord.find({ offeringId }).lean();
  const byStudent = new Map();
  records.forEach((r) => {
    const k = String(r.studentId);
    if (!byStudent.has(k)) byStudent.set(k, []);
    byStudent.get(k).push(r);
  });

  const section = await Section.findById(offering.sectionId).lean();
  const ops = [];

  for (const [studentId, rows] of byStudent.entries()) {
    const summary = policy.computeSummary(rows, activePolicy);
    const first = rows[0];

    ops.push({
      updateOne: {
        filter: { studentId, termId: offering.termId, offeringId, scope: 'SUBJECT' },
        update: {
          $set: {
            sectionId: offering.sectionId,
            departmentId: offering.departmentId,
            subjectId: offering.subjectId,
            studentCode: first.studentCode,
            studentName: first.studentName,
            rollNumber: first.rollNumber,
            subjectCode: offering.subjectCode,
            subjectName: offering.subjectName,
            sectionCode: offering.sectionCode || section?.code,
            heldPeriods: summary.heldPeriods,
            presentPeriods: summary.presentPeriods,
            absentPeriods: summary.absentPeriods,
            latePeriods: summary.latePeriods,
            excusedPeriods: summary.excusedPeriods,
            leavePeriods: summary.leavePeriods,
            countablePeriods: summary.countablePeriods,
            percent: summary.percent,
            riskBand: summary.riskBand,
            periodsToReachThreshold: summary.periodsToReachThreshold,
            lastComputedAt: new Date(),
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length) await AttendanceSummary.bulkWrite(ops, { ordered: false });

  await Promise.all([...byStudent.keys()].map((sid) => recomputeOverall(sid, offering.termId, activePolicy)));
  return { updated: ops.length };
}

/** Rolls every subject up into one OVERALL row per student. */
async function recomputeOverall(studentId, termId, activePolicy = policy.DEFAULT_POLICY) {
  const records = await AttendanceRecord.find({ studentId, termId }).lean();
  if (!records.length) return null;

  const summary = policy.computeSummary(records, activePolicy);
  const first = records[0];
  const student = await User.findById(studentId).select('code name student departmentId').lean();

  await AttendanceSummary.updateOne(
    { studentId, termId, offeringId: null, scope: 'OVERALL' },
    {
      $set: {
        sectionId: student?.student?.sectionId || first.sectionId,
        departmentId: student?.departmentId || first.departmentId,
        studentCode: student?.code || first.studentCode,
        studentName: student?.name || first.studentName,
        rollNumber: student?.student?.rollNumber || first.rollNumber,
        heldPeriods: summary.heldPeriods,
        presentPeriods: summary.presentPeriods,
        absentPeriods: summary.absentPeriods,
        latePeriods: summary.latePeriods,
        excusedPeriods: summary.excusedPeriods,
        leavePeriods: summary.leavePeriods,
        countablePeriods: summary.countablePeriods,
        percent: summary.percent,
        riskBand: summary.riskBand,
        periodsToReachThreshold: summary.periodsToReachThreshold,
        lastComputedAt: new Date(),
      },
    },
    { upsert: true }
  );
  return summary;
}

/* ------------------------------------------------------------------ *
 *  Student-facing reads
 * ------------------------------------------------------------------ */

async function getStudentAttendance(user, studentId, query = {}) {
  const targetId = studentId === 'me' ? String(user._id) : studentId;

  if (user.role === ROLES.STUDENT && String(user._id) !== String(targetId)) {
    throw ApiError.forbidden('You can only view your own attendance.');
  }

  const termId = query.termId || (await termService.getCurrentTerm())?._id;
  if (!termId) throw ApiError.badRequest('No active academic term configured.');

  const [subjectRows, overall] = await Promise.all([
    AttendanceSummary.find({ studentId: targetId, termId, scope: 'SUBJECT' })
      .sort({ percent: 1 }).lean(),
    AttendanceSummary.findOne({ studentId: targetId, termId, scope: 'OVERALL' }).lean(),
  ]);

  const term = await termService.getTerm(termId);
  const activePolicy = term?.policy || policy.DEFAULT_POLICY;

  const enriched = subjectRows.map((s) => ({
    ...s,
    canMiss: policy.periodsCanMiss(
      s.presentPeriods + s.latePeriods, s.countablePeriods, activePolicy.minAttendancePercent
    ),
  }));

  return {
    termId,
    policy: activePolicy,
    overall: overall || null,
    subjects: enriched,
    threshold: activePolicy.minAttendancePercent,
  };
}

/** Day-by-day history for one student, used by the calendar view. */
async function getStudentHistory(user, studentId, query = {}) {
  const targetId = studentId === 'me' ? String(user._id) : studentId;
  if (user.role === ROLES.STUDENT && String(user._id) !== String(targetId)) {
    throw ApiError.forbidden('You can only view your own attendance.');
  }

  const filter = { studentId: targetId };
  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }
  if (query.offeringId) filter.offeringId = query.offeringId;
  if (query.status) filter.status = { $in: String(query.status).split(',') };

  const records = await AttendanceRecord.find(filter)
    .sort({ date: -1, periodNumber: 1 })
    .limit(Number(query.limit) || 500)
    .lean();

  const sessionIds = [...new Set(records.map((r) => String(r.sessionId)))];
  const sessions = await ClassSession.find({ _id: { $in: sessionIds } })
    .select('subjectCode subjectName startTime endTime periodNumber facultyName topic sessionType')
    .lean();
  const sessionMap = new Map(sessions.map((s) => [String(s._id), s]));

  const byDate = new Map();
  records.forEach((r) => {
    const s = sessionMap.get(String(r.sessionId)) || {};
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date, dayName: DAYS[dayOfWeek(r.date)], periods: [] });
    byDate.get(r.date).periods.push({
      recordId: r._id,
      sessionId: r.sessionId,
      status: r.status,
      remarks: r.remarks,
      isCorrected: r.isCorrected,
      originalStatus: r.originalStatus,
      periodNumber: r.periodNumber ?? s.periodNumber,
      startTime: s.startTime,
      endTime: s.endTime,
      subjectCode: s.subjectCode,
      subjectName: s.subjectName,
      facultyName: s.facultyName,
      topic: s.topic,
    });
  });

  return [...byDate.values()].map((d) => ({
    ...d,
    periods: d.periods.sort((a, b) => (a.periodNumber || 0) - (b.periodNumber || 0)),
    summary: policy.sessionStats(d.periods),
  }));
}

module.exports = {
  getSessionRoster, markSession, updateRecords, refreshSessionStats,
  recomputeOffering, recomputeOverall, getStudentAttendance, getStudentHistory,
  getActiveStudents, assertCanViewSession,
};

/* ------------------------------------------------------------------ *
 *  Notifications
 * ------------------------------------------------------------------ */

async function notifyAbsentees(entries, session) {
  const notificationService = require('../notifications/notificationService');
  const absent = entries.filter((e) => e.status === ATT_STATUS.ABSENT);
  if (!absent.length) return;

  await notificationService.notifyMany(absent.map((a) => ({
    userId: a.studentId,
    type: 'MARKED_ABSENT',
    title: `Marked absent for ${session.subjectCode}`,
    body: `${session.subjectName} on ${session.date}, period ${session.periodNumber || '-'}.`,
    severity: 'WARNING',
    link: `/my-attendance`,
  })));

  absent.forEach((a) => emitToUser(String(a.studentId), 'attendance:absent', {
    date: session.date, subjectCode: session.subjectCode,
  }));
}
