const {
  ClassSession, CourseOffering, AttendanceRecord, Section, User,
} = require('../../models');
const {
  SESSION_STATUS, ROLES, AUDIT_ACTION, DAYS, CAPABILITIES,
} = require('../../config/constants');
const ApiError = require('../../utils/ApiError');
const termService = require('../academics/termService');
const auditService = require('../audit/auditService');
const attendancePolicy = require('../attendance/attendancePolicy');
const { dateRange, dayOfWeek, toDateKey, isValidDateKey } = require('../../utils/dateUtils');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const logger = require('../../config/logger');

const has = (user, cap) => (user.capabilities || []).includes(cap);

/* ------------------------------------------------------------------ *
 *  Generation from the timetable
 * ------------------------------------------------------------------ */

/**
 * Expands each offering's weekly timetable into concrete ClassSession rows
 * for a date range, skipping holidays.
 *
 * The unique index on (offeringId, date, periodNumber) makes this safe to
 * re-run: existing sessions are left untouched, only gaps are filled.
 */
async function generateSessions({ termId, fromDate, toDate, offeringId = null, actor = null }) {
  if (!isValidDateKey(fromDate) || !isValidDateKey(toDate)) {
    throw ApiError.badRequest('Provide fromDate and toDate as YYYY-MM-DD.');
  }

  const term = await termService.getTerm(termId);
  if (!term) throw ApiError.badRequest('Academic term not found.');

  const filter = { termId: term._id, isActive: true };
  if (offeringId) filter._id = offeringId;
  const offerings = await CourseOffering.find(filter).lean();
  if (!offerings.length) return { created: 0, skipped: 0, offerings: 0 };

  const [holidays, workingOverrides] = await Promise.all([
    termService.getHolidaySet(term._id),
    termService.getWorkingOverrides(term._id),
  ]);

  // Clamp the requested window to the term boundaries.
  const start = fromDate < term.startDate ? term.startDate : fromDate;
  const end = toDate > term.endDate ? term.endDate : toDate;
  if (start > end) return { created: 0, skipped: 0, offerings: offerings.length };

  const dates = dateRange(start, end);
  const docs = [];

  offerings.forEach((offering) => {
    (offering.timetable || []).forEach((slot) => {
      dates.forEach((date) => {
        if (dayOfWeek(date) !== slot.dayOfWeek) return;
        if (holidays.has(date) && !workingOverrides.has(date)) return;

        docs.push({
          offeringId: offering._id,
          termId: term._id,
          sectionId: offering.sectionId,
          subjectId: offering.subjectId,
          departmentId: offering.departmentId,
          facultyId: offering.facultyId,
          date,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          periodNumber: slot.periodNumber,
          periodsCounted: slot.periodsCounted || 1,
          sessionType: slot.sessionType,
          roomNumber: slot.roomNumber,
          status: SESSION_STATUS.SCHEDULED,
          subjectCode: offering.subjectCode,
          subjectName: offering.subjectName,
          sectionCode: offering.sectionCode,
          facultyName: offering.facultyName,
        });
      });
    });
  });

  if (!docs.length) return { created: 0, skipped: 0, offerings: offerings.length };

  let created = 0;
  let skipped = 0;
  try {
    const result = await ClassSession.insertMany(docs, { ordered: false });
    created = result.length;
  } catch (err) {
    // Duplicate-key errors are expected on re-runs; count them as skips.
    created = err.result?.nInserted ?? err.insertedDocs?.length ?? 0;
    skipped = docs.length - created;
    if (!err.writeErrors && err.code !== 11000) throw err;
  }

  await Promise.all(offerings.map((o) => CourseOffering.updateOne(
    { _id: o._id },
    { $set: { plannedPeriods: docs.filter((d) => String(d.offeringId) === String(o._id)).length } }
  )));

  if (actor) {
    await auditService.record({
      action: AUDIT_ACTION.SESSION_CREATED,
      entityType: 'AcademicTerm',
      entityId: term._id,
      actor,
      summary: `Generated ${created} class sessions from ${start} to ${end}`,
      meta: { created, skipped, offerings: offerings.length },
    });
  }

  logger.info({ created, skipped }, 'Class sessions generated');
  return { created, skipped, offerings: offerings.length, from: start, to: end };
}

/* ------------------------------------------------------------------ *
 *  Queries
 * ------------------------------------------------------------------ */

/** What a faculty member has to teach (and mark) on a given day. */
async function getMySchedule(user, date) {
  const day = isValidDateKey(date) ? date : toDateKey(new Date());

  const filter = { date: day };
  if (user.role === ROLES.STUDENT) {
    if (!user.student?.sectionId) return { date: day, dayName: DAYS[dayOfWeek(day)], sessions: [] };
    filter.sectionId = user.student.sectionId;
  } else if (!has(user, CAPABILITIES.ATT_READ_ALL) && !has(user, CAPABILITIES.ATT_READ_DEPT)) {
    const advisorSections = user.staff?.advisorOfSectionIds || [];
    filter.$or = [{ facultyId: user._id }, { sectionId: { $in: advisorSections } }];
  }

  const sessions = await ClassSession.find(filter)
    .sort({ periodNumber: 1, startTime: 1 })
    .lean();

  return {
    date: day,
    dayName: DAYS[dayOfWeek(day)],
    sessions: sessions.map(decorate),
    counts: {
      total: sessions.length,
      marked: sessions.filter((s) => s.status === SESSION_STATUS.MARKED).length,
      pending: sessions.filter((s) => s.status === SESSION_STATUS.SCHEDULED).length,
      locked: sessions.filter((s) => s.status === SESSION_STATUS.LOCKED).length,
    },
  };
}

function decorate(s) {
  return {
    ...s,
    isPending: s.status === SESSION_STATUS.SCHEDULED,
    dayName: DAYS[s.dayOfWeek],
  };
}

async function listSessions(user, query) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });
  const filter = {};

  if (query.date) filter.date = query.date;
  else if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = query.from;
    if (query.to) filter.date.$lte = query.to;
  }

  if (query.sectionId) filter.sectionId = query.sectionId;
  if (query.subjectId) filter.subjectId = query.subjectId;
  if (query.offeringId) filter.offeringId = query.offeringId;
  if (query.status) filter.status = { $in: String(query.status).split(',') };
  if (query.facultyId) filter.facultyId = query.facultyId === 'me' ? user._id : query.facultyId;

  // Row-level scoping
  if (user.role === ROLES.STUDENT) {
    filter.sectionId = user.student?.sectionId;
  } else if (has(user, CAPABILITIES.ATT_READ_ALL)) {
    if (query.departmentId) filter.departmentId = query.departmentId;
  } else if (has(user, CAPABILITIES.ATT_READ_DEPT)) {
    filter.departmentId = user.departmentId;
  } else if (!query.facultyId) {
    const advisorSections = user.staff?.advisorOfSectionIds || [];
    filter.$or = [{ facultyId: user._id }, { sectionId: { $in: advisorSections } }];
  }

  const [items, total] = await Promise.all([
    ClassSession.find(filter).sort({ date: -1, periodNumber: 1 }).skip(skip).limit(limit).lean(),
    ClassSession.countDocuments(filter),
  ]);

  return { items: items.map(decorate), meta: buildMeta(page, limit, total) };
}

/* ------------------------------------------------------------------ *
 *  Mutations
 * ------------------------------------------------------------------ */

async function createAdhocSession(user, payload, ctx = {}) {
  const offering = await CourseOffering.findById(payload.offeringId).lean();
  if (!offering) throw ApiError.badRequest('Course offering not found.');

  if (!has(user, CAPABILITIES.ADMIN_MANAGE)
    && String(offering.facultyId) !== String(user._id)
    && !has(user, CAPABILITIES.ATT_EDIT_ANY)) {
    throw ApiError.forbidden('You can only add classes for subjects you teach.');
  }

  const existing = await ClassSession.findOne({
    offeringId: offering._id, date: payload.date, periodNumber: payload.periodNumber,
  });
  if (existing) throw ApiError.conflict('A class already exists for this subject, date and period.');

  const session = await ClassSession.create({
    offeringId: offering._id,
    termId: offering.termId,
    sectionId: offering.sectionId,
    subjectId: offering.subjectId,
    departmentId: offering.departmentId,
    facultyId: offering.facultyId,
    date: payload.date,
    dayOfWeek: dayOfWeek(payload.date),
    startTime: payload.startTime,
    endTime: payload.endTime,
    periodNumber: payload.periodNumber,
    periodsCounted: payload.periodsCounted || 1,
    sessionType: payload.sessionType,
    roomNumber: payload.roomNumber,
    topic: payload.topic,
    subjectCode: offering.subjectCode,
    subjectName: offering.subjectName,
    sectionCode: offering.sectionCode,
    facultyName: offering.facultyName,
  });

  await auditService.record({
    action: AUDIT_ACTION.SESSION_CREATED,
    entityType: 'ClassSession',
    entityId: session._id,
    actor: user,
    summary: `Extra class added: ${offering.subjectCode} on ${payload.date}`,
    ipAddress: ctx.ip,
  });
  return session;
}

async function cancelSession(user, sessionId, reason, ctx = {}) {
  const session = await ClassSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Class session not found.');

  if (String(session.facultyId) !== String(user._id) && !has(user, CAPABILITIES.ATT_EDIT_ANY)) {
    throw ApiError.forbidden('You can only cancel your own classes.');
  }
  if (session.status === SESSION_STATUS.MARKED) {
    throw ApiError.conflict('Attendance has already been marked. Raise a correction request instead.');
  }

  const before = session.status;
  session.status = SESSION_STATUS.CANCELLED;
  session.cancelledReason = reason;
  await session.save();

  // A cancelled class was never held, so its records must not count.
  await AttendanceRecord.deleteMany({ sessionId: session._id });

  await auditService.record({
    action: AUDIT_ACTION.SESSION_CANCELLED,
    entityType: 'ClassSession',
    entityId: session._id,
    actor: user,
    summary: `Cancelled ${session.subjectCode} on ${session.date}: ${reason}`,
    before: { status: before },
    after: { status: SESSION_STATUS.CANCELLED },
    ipAddress: ctx.ip,
  });
  return session;
}

/** Reopens a locked session so it can be edited directly. HOD and above only. */
async function unlockSession(user, sessionId, reason, ctx = {}) {
  if (!has(user, CAPABILITIES.ATT_UNLOCK)) throw ApiError.forbidden('You cannot unlock sessions.');

  const session = await ClassSession.findById(sessionId);
  if (!session) throw ApiError.notFound('Class session not found.');
  if (session.status !== SESSION_STATUS.LOCKED) throw ApiError.badRequest('This session is not locked.');

  session.status = SESSION_STATUS.MARKED;
  session.unlockedBy = user._id;
  session.unlockReason = reason;
  session.lockedAt = null;
  session.markedAt = new Date(); // restart the edit window
  await session.save();

  await auditService.record({
    action: AUDIT_ACTION.SESSION_UNLOCKED,
    entityType: 'ClassSession',
    entityId: session._id,
    actor: user,
    summary: `Unlocked ${session.subjectCode} on ${session.date}: ${reason}`,
    ipAddress: ctx.ip,
  });
  return session;
}

/**
 * Locks sessions whose edit window has elapsed. Run hourly.
 */
async function lockExpiredSessions() {
  const term = await termService.getCurrentTerm();
  const activePolicy = term?.policy || attendancePolicy.DEFAULT_POLICY;
  const now = new Date();

  const candidates = await ClassSession.find({
    status: SESSION_STATUS.MARKED,
  }).select('date startTime markedAt status subjectCode').lean();

  const toLock = candidates.filter((s) => attendancePolicy.shouldLock(s, activePolicy, now)).map((s) => s._id);
  if (!toLock.length) return { locked: 0 };

  await ClassSession.updateMany(
    { _id: { $in: toLock } },
    { $set: { status: SESSION_STATUS.LOCKED, lockedAt: now } }
  );
  logger.info({ locked: toLock.length }, 'Sessions locked');
  return { locked: toLock.length };
}

/**
 * Sessions that were scheduled but never marked. This is the report that
 * stops attendance quietly going missing.
 */
async function getUnmarkedSessions(user, query = {}) {
  const today = toDateKey(new Date());
  const filter = {
    status: SESSION_STATUS.SCHEDULED,
    date: { $lt: query.before || today },
  };
  if (query.from) filter.date.$gte = query.from;

  if (has(user, CAPABILITIES.ATT_READ_ALL)) {
    if (query.departmentId) filter.departmentId = query.departmentId;
  } else if (has(user, CAPABILITIES.ATT_READ_DEPT)) {
    filter.departmentId = user.departmentId;
  } else {
    filter.facultyId = user._id;
  }

  const sessions = await ClassSession.find(filter)
    .sort({ date: -1, periodNumber: 1 })
    .limit(Number(query.limit) || 300)
    .lean();

  const byFaculty = new Map();
  sessions.forEach((s) => {
    const k = String(s.facultyId);
    if (!byFaculty.has(k)) byFaculty.set(k, { facultyId: s.facultyId, facultyName: s.facultyName, count: 0, sessions: [] });
    const entry = byFaculty.get(k);
    entry.count += 1;
    entry.sessions.push(s);
  });

  return {
    total: sessions.length,
    sessions: sessions.map(decorate),
    byFaculty: [...byFaculty.values()].sort((a, b) => b.count - a.count),
  };
}

module.exports = {
  generateSessions, getMySchedule, listSessions, createAdhocSession,
  cancelSession, unlockSession, lockExpiredSessions, getUnmarkedSessions,
};
