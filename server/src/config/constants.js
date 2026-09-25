/* ------------------------------------------------------------------ *
 *  Roles & capabilities
 * ------------------------------------------------------------------ */
const ROLES = {
  STUDENT: 'STUDENT',
  FACULTY: 'FACULTY',
  CLASS_ADVISOR: 'CLASS_ADVISOR',
  HOD: 'HOD',
  ATTENDANCE_OFFICER: 'ATTENDANCE_OFFICER',
  ADMIN: 'ADMIN',
};

const CAPABILITIES = {
  ATT_MARK: 'attendance:mark',
  ATT_EDIT_OWN: 'attendance:edit:own',
  ATT_EDIT_ANY: 'attendance:edit:any',
  ATT_READ_OWN: 'attendance:read:own',
  ATT_READ_SECTION: 'attendance:read:section',
  ATT_READ_DEPT: 'attendance:read:dept',
  ATT_READ_ALL: 'attendance:read:all',
  ATT_UNLOCK: 'attendance:unlock',

  CORRECTION_RAISE: 'correction:raise',
  CORRECTION_APPROVE: 'correction:approve',

  LEAVE_RAISE: 'leave:raise',
  LEAVE_APPROVE: 'leave:approve',

  SESSION_MANAGE: 'session:manage',
  REPORT_VIEW_DEPT: 'report:view:dept',
  REPORT_VIEW_ALL: 'report:view:all',
  EXPORT_RUN: 'export:run',
  EXPORT_TEMPLATE_MANAGE: 'export:template:manage',
  CONDONATION_GRANT: 'condonation:grant',
  ADMIN_MANAGE: 'admin:manage',
};

const C = CAPABILITIES;

const ROLE_CAPABILITIES = {
  [ROLES.STUDENT]: [C.ATT_READ_OWN, C.CORRECTION_RAISE, C.LEAVE_RAISE],
  [ROLES.FACULTY]: [
    C.ATT_MARK, C.ATT_EDIT_OWN, C.ATT_READ_SECTION, C.CORRECTION_RAISE,
    C.SESSION_MANAGE, C.EXPORT_RUN,
  ],
  [ROLES.CLASS_ADVISOR]: [
    C.ATT_MARK, C.ATT_EDIT_OWN, C.ATT_READ_SECTION, C.CORRECTION_RAISE,
    C.CORRECTION_APPROVE, C.LEAVE_APPROVE, C.SESSION_MANAGE,
    C.REPORT_VIEW_DEPT, C.EXPORT_RUN,
  ],
  [ROLES.HOD]: [
    C.ATT_MARK, C.ATT_EDIT_ANY, C.ATT_READ_DEPT, C.ATT_UNLOCK,
    C.CORRECTION_APPROVE, C.LEAVE_APPROVE, C.SESSION_MANAGE,
    C.REPORT_VIEW_DEPT, C.EXPORT_RUN, C.EXPORT_TEMPLATE_MANAGE, C.CONDONATION_GRANT,
  ],
  [ROLES.ATTENDANCE_OFFICER]: [
    C.ATT_READ_ALL, C.ATT_EDIT_ANY, C.ATT_UNLOCK, C.CORRECTION_APPROVE,
    C.LEAVE_APPROVE, C.REPORT_VIEW_ALL, C.EXPORT_RUN, C.EXPORT_TEMPLATE_MANAGE,
    C.CONDONATION_GRANT,
  ],
  [ROLES.ADMIN]: Object.values(C),
};

/* ------------------------------------------------------------------ *
 *  Attendance domain
 * ------------------------------------------------------------------ */

/**
 * PRESENT  - physically present
 * ABSENT   - not present, counts against the student
 * LATE     - present but late; counts as present unless policy says otherwise
 * EXCUSED  - approved OD / medical / institutional duty
 * LEAVE    - approved personal leave
 */
const ATT_STATUS = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  LATE: 'LATE',
  EXCUSED: 'EXCUSED',
  LEAVE: 'LEAVE',
};

/** Statuses that credit the student as having attended. */
const PRESENT_LIKE = [ATT_STATUS.PRESENT, ATT_STATUS.LATE];

/** Statuses that are removed from the denominator when the policy allows it. */
const EXEMPT_LIKE = [ATT_STATUS.EXCUSED, ATT_STATUS.LEAVE];

const ATT_STATUS_META = {
  PRESENT: { label: 'Present', short: 'P', countsPresent: true, exempt: false },
  ABSENT: { label: 'Absent', short: 'A', countsPresent: false, exempt: false },
  LATE: { label: 'Late', short: 'L', countsPresent: true, exempt: false },
  EXCUSED: { label: 'On duty / Excused', short: 'OD', countsPresent: false, exempt: true },
  LEAVE: { label: 'Approved leave', short: 'LV', countsPresent: false, exempt: true },
};

const SESSION_STATUS = {
  SCHEDULED: 'SCHEDULED',   // generated from the timetable, not yet marked
  MARKED: 'MARKED',         // attendance captured, still editable
  LOCKED: 'LOCKED',         // edit window closed, corrections only
  CANCELLED: 'CANCELLED',   // class did not happen
};

const SESSION_TYPE = {
  LECTURE: 'LECTURE',
  LAB: 'LAB',
  TUTORIAL: 'TUTORIAL',
  SEMINAR: 'SEMINAR',
};

const CORRECTION_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
};

const LEAVE_TYPE = {
  MEDICAL: 'MEDICAL',
  ON_DUTY: 'ON_DUTY',
  PERSONAL: 'PERSONAL',
  SPORTS: 'SPORTS',
};

const LEAVE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

/** Risk banding used across dashboards and defaulter reports. */
const RISK_BAND = {
  SAFE: 'SAFE',               // >= threshold
  WARNING: 'WARNING',         // within 5 points of the threshold
  CONDONABLE: 'CONDONABLE',   // between the condonation floor and the threshold
  DETAINED: 'DETAINED',       // below the condonation floor
};

function riskBandFor(percent, { minPercent = 75, condonationFloor = 65 } = {}) {
  if (percent == null) return RISK_BAND.SAFE;
  if (percent >= minPercent) return RISK_BAND.SAFE;
  if (percent >= minPercent - 5) return RISK_BAND.WARNING;
  if (percent >= condonationFloor) return RISK_BAND.CONDONABLE;
  return RISK_BAND.DETAINED;
}

const AUDIT_ACTION = {
  ATT_MARKED: 'ATTENDANCE_MARKED',
  ATT_UPDATED: 'ATTENDANCE_UPDATED',
  ATT_BULK: 'ATTENDANCE_BULK_UPDATE',
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_CANCELLED: 'SESSION_CANCELLED',
  SESSION_LOCKED: 'SESSION_LOCKED',
  SESSION_UNLOCKED: 'SESSION_UNLOCKED',
  CORRECTION_RAISED: 'CORRECTION_RAISED',
  CORRECTION_APPROVED: 'CORRECTION_APPROVED',
  CORRECTION_REJECTED: 'CORRECTION_REJECTED',
  LEAVE_RAISED: 'LEAVE_RAISED',
  LEAVE_APPROVED: 'LEAVE_APPROVED',
  LEAVE_REJECTED: 'LEAVE_REJECTED',
  CONDONATION_GRANTED: 'CONDONATION_GRANTED',
  EXPORT_RUN: 'EXPORT_RUN',
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

module.exports = {
  ROLES, CAPABILITIES, ROLE_CAPABILITIES,
  ATT_STATUS, ATT_STATUS_META, PRESENT_LIKE, EXEMPT_LIKE,
  SESSION_STATUS, SESSION_TYPE, CORRECTION_STATUS,
  LEAVE_TYPE, LEAVE_STATUS, RISK_BAND, riskBandFor,
  AUDIT_ACTION, DAYS,
};
