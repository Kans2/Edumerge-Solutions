const {
  ATT_STATUS, ATT_STATUS_META, RISK_BAND, riskBandFor,
} = require('../../config/constants');
const { hoursSince } = require('../../utils/dateUtils');

const DEFAULT_POLICY = {
  minAttendancePercent: 75,
  condonationFloorPercent: 65,
  excusedCountsAsPresent: true,
  lateCountsAsPresent: true,
  editWindowHours: 24,
  lockAfterHours: 48,
  defaultMark: ATT_STATUS.PRESENT,
};

const withDefaults = (policy) => ({ ...DEFAULT_POLICY, ...(policy || {}) });

/* ------------------------------------------------------------------ *
 *  Per-record classification
 * ------------------------------------------------------------------ */

/**
 * Decides how one mark contributes to the numerator and denominator.
 *
 * Two policy levers matter here:
 *  - `excusedCountsAsPresent`: when true, OD/approved leave is removed from
 *    the denominator entirely (the fair reading). When false, it is treated
 *    as an absence.
 *  - `lateCountsAsPresent`: when true, LATE credits attendance.
 *
 * Returns { credited, countable, weight } where weight is the number of
 * periods this single record represents (a 3-hour lab is one record, 3 periods).
 */
function classify(record, policy = DEFAULT_POLICY) {
  const p = withDefaults(policy);
  const weight = Math.max(1, record.periodsCounted || 1);
  const status = record.status;

  if (status === ATT_STATUS.EXCUSED || status === ATT_STATUS.LEAVE) {
    return p.excusedCountsAsPresent
      ? { credited: 0, countable: 0, weight }      // removed from both sides
      : { credited: 0, countable: weight, weight }; // treated as absence
  }

  if (status === ATT_STATUS.LATE) {
    return p.lateCountsAsPresent
      ? { credited: weight, countable: weight, weight }
      : { credited: 0, countable: weight, weight };
  }

  if (status === ATT_STATUS.PRESENT) return { credited: weight, countable: weight, weight };
  return { credited: 0, countable: weight, weight }; // ABSENT
}

/* ------------------------------------------------------------------ *
 *  Aggregation
 * ------------------------------------------------------------------ */

/**
 * Computes an attendance summary from a list of records.
 * Percentage is always credited / countable, never credited / total, so
 * exempt periods can never drag a student down.
 */
function computeSummary(records = [], policy = DEFAULT_POLICY) {
  const p = withDefaults(policy);

  const totals = {
    heldPeriods: 0,
    presentPeriods: 0,
    absentPeriods: 0,
    latePeriods: 0,
    excusedPeriods: 0,
    leavePeriods: 0,
    countablePeriods: 0,
    creditedPeriods: 0,
  };

  records.forEach((r) => {
    const { credited, countable, weight } = classify(r, p);
    totals.heldPeriods += weight;
    totals.countablePeriods += countable;
    totals.creditedPeriods += credited;

    switch (r.status) {
      case ATT_STATUS.PRESENT: totals.presentPeriods += weight; break;
      case ATT_STATUS.ABSENT: totals.absentPeriods += weight; break;
      case ATT_STATUS.LATE: totals.latePeriods += weight; break;
      case ATT_STATUS.EXCUSED: totals.excusedPeriods += weight; break;
      case ATT_STATUS.LEAVE: totals.leavePeriods += weight; break;
      default: break;
    }
  });

  const percent = totals.countablePeriods > 0
    ? round2((totals.creditedPeriods / totals.countablePeriods) * 100)
    : 100; // no countable periods yet => not penalised

  const riskBand = riskBandFor(percent, {
    minPercent: p.minAttendancePercent,
    condonationFloor: p.condonationFloorPercent,
  });

  return {
    ...totals,
    percent,
    riskBand,
    periodsToReachThreshold: periodsToReachThreshold(
      totals.creditedPeriods, totals.countablePeriods, p.minAttendancePercent
    ),
  };
}

/**
 * How many consecutive future periods must be attended to climb back to the
 * threshold. Solves (credited + x) / (countable + x) >= target.
 * Returns 0 when already safe, or null when mathematically unreachable.
 */
function periodsToReachThreshold(credited, countable, targetPercent) {
  const target = targetPercent / 100;
  if (countable === 0) return 0;
  if (credited / countable >= target) return 0;
  if (target >= 1) return null; // 100% requirement can never be recovered
  const needed = (target * countable - credited) / (1 - target);
  return Math.max(0, Math.ceil(needed));
}

/**
 * How many further periods a student may miss and still stay at or above the
 * threshold. Solves credited / (countable + x) >= target.
 */
function periodsCanMiss(credited, countable, targetPercent) {
  const target = targetPercent / 100;
  if (target <= 0) return Infinity;
  if (countable > 0 && credited / countable < target) return 0;
  const maxTotal = Math.floor(credited / target);
  return Math.max(0, maxTotal - countable);
}

/* ------------------------------------------------------------------ *
 *  Edit & lock rules
 * ------------------------------------------------------------------ */

/**
 * Faculty may edit their own marking inside the edit window. After that the
 * session locks and only a correction request can change it.
 */
function canEditSession(session, user, policy = DEFAULT_POLICY, now = new Date()) {
  const p = withDefaults(policy);

  if (session.status === 'CANCELLED') {
    return { allowed: false, reason: 'This class was cancelled.' };
  }
  if (session.status === 'LOCKED') {
    return { allowed: false, reason: 'This session is locked. Raise a correction request to change it.' };
  }
  const caps = user.capabilities || [];
  if (caps.includes('attendance:edit:any')) return { allowed: true };

  const isOwner = String(session.facultyId) === String(user._id);
  if (!isOwner) {
    return { allowed: false, reason: 'Only the faculty who took this class can edit it.' };
  }
  if (session.markedAt && hoursSince(session.markedAt, now) > p.editWindowHours) {
    return {
      allowed: false,
      reason: `The ${p.editWindowHours}-hour edit window has closed. Raise a correction request instead.`,
    };
  }
  return { allowed: true };
}

/** A session becomes locked once the lock window has elapsed since the class. */
function shouldLock(session, policy = DEFAULT_POLICY, now = new Date()) {
  const p = withDefaults(policy);
  if (['LOCKED', 'CANCELLED'].includes(session.status)) return false;
  const reference = session.markedAt || new Date(`${session.date}T${session.startTime || '00:00'}:00.000Z`);
  return hoursSince(reference, now) >= p.lockAfterHours;
}

/* ------------------------------------------------------------------ *
 *  Roster defaults
 * ------------------------------------------------------------------ */

/**
 * Builds the default roster for a session. Everyone starts at the configured
 * default mark (PRESENT), so faculty only tap the handful of absentees —
 * this is what keeps marking to a few seconds per class.
 *
 * Students with an approved leave covering this date are pre-set to
 * EXCUSED/LEAVE and flagged as locked so they cannot be silently overwritten.
 */
function buildDefaultRoster(students = [], { policy = DEFAULT_POLICY, approvedLeaves = [], existing = [] } = {}) {
  const p = withDefaults(policy);
  const existingByStudent = new Map(existing.map((r) => [String(r.studentId), r]));
  const leaveByStudent = new Map(approvedLeaves.map((l) => [String(l.studentId), l]));

  return students.map((s) => {
    const id = String(s._id);
    const prior = existingByStudent.get(id);
    const leave = leaveByStudent.get(id);

    if (prior) {
      return {
        studentId: s._id,
        studentCode: s.code,
        studentName: s.name,
        rollNumber: s.student?.rollNumber,
        status: prior.status,
        remarks: prior.remarks || '',
        source: 'EXISTING',
        isCorrected: Boolean(prior.isCorrected),
        locked: false,
      };
    }

    if (leave) {
      const status = leave.leaveType === 'ON_DUTY' ? ATT_STATUS.EXCUSED : ATT_STATUS.LEAVE;
      return {
        studentId: s._id,
        studentCode: s.code,
        studentName: s.name,
        rollNumber: s.student?.rollNumber,
        status,
        remarks: `${leave.leaveType} approved (${leave.requestNo})`,
        source: 'LEAVE',
        locked: true,
      };
    }

    return {
      studentId: s._id,
      studentCode: s.code,
      studentName: s.name,
      rollNumber: s.student?.rollNumber,
      status: p.defaultMark,
      remarks: '',
      source: 'DEFAULT',
      locked: false,
    };
  });
}

/** Rejects rosters that reference students outside the section. */
function validateRoster(entries = [], validStudentIds = []) {
  const valid = new Set(validStudentIds.map(String));
  const unknown = [];
  const badStatus = [];
  const seen = new Set();
  const duplicates = [];

  entries.forEach((e) => {
    const id = String(e.studentId);
    if (!valid.has(id)) unknown.push(id);
    if (!ATT_STATUS_META[e.status]) badStatus.push(e.status);
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  });

  return {
    valid: unknown.length === 0 && badStatus.length === 0 && duplicates.length === 0,
    unknown, badStatus, duplicates,
  };
}

function sessionStats(entries = []) {
  const stats = { total: 0, present: 0, absent: 0, late: 0, excused: 0, leave: 0, percent: 0 };
  entries.forEach((e) => {
    stats.total += 1;
    if (e.status === ATT_STATUS.PRESENT) stats.present += 1;
    else if (e.status === ATT_STATUS.ABSENT) stats.absent += 1;
    else if (e.status === ATT_STATUS.LATE) stats.late += 1;
    else if (e.status === ATT_STATUS.EXCUSED) stats.excused += 1;
    else if (e.status === ATT_STATUS.LEAVE) stats.leave += 1;
  });
  const countable = stats.total - stats.excused - stats.leave;
  stats.percent = countable > 0 ? round2(((stats.present + stats.late) / countable) * 100) : 100;
  return stats;
}

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = {
  DEFAULT_POLICY, withDefaults, classify, computeSummary,
  periodsToReachThreshold, periodsCanMiss,
  canEditSession, shouldLock,
  buildDefaultRoster, validateRoster, sessionStats, round2,
};
