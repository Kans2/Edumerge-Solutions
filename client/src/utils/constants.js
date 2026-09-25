export const ATT_STATUS = {
  PRESENT: 'PRESENT', ABSENT: 'ABSENT', LATE: 'LATE', EXCUSED: 'EXCUSED', LEAVE: 'LEAVE',
};

/* Every status carries an icon AND a label so colour is never the only cue. */
export const STATUS_META = {
  PRESENT: { label: 'Present', short: 'P', icon: '\u2713', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', btn: 'mark-present' },
  ABSENT:  { label: 'Absent',  short: 'A', icon: '\u2715', cls: 'bg-red-50 text-red-800 border-red-200', btn: 'mark-absent' },
  LATE:    { label: 'Late',    short: 'L', icon: '\u23F1', cls: 'bg-amber-50 text-amber-800 border-amber-200', btn: 'mark-late' },
  EXCUSED: { label: 'On duty', short: 'OD', icon: '\u2691', cls: 'bg-blue-50 text-blue-800 border-blue-200', btn: 'mark-excused' },
  LEAVE:   { label: 'Leave',   short: 'LV', icon: '\u2691', cls: 'bg-blue-50 text-blue-800 border-blue-200', btn: 'mark-excused' },
};

export const MARK_ORDER = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

export const SESSION_STATUS_META = {
  SCHEDULED: { label: 'Not marked', icon: '\u25CB', cls: 'bg-slate-100 text-slate-700' },
  MARKED:    { label: 'Marked',     icon: '\u2713', cls: 'bg-emerald-50 text-emerald-800' },
  LOCKED:    { label: 'Locked',     icon: '\uD83D\uDD12', cls: 'bg-slate-100 text-slate-600' },
  CANCELLED: { label: 'Cancelled',  icon: '\u2715', cls: 'bg-slate-100 text-slate-500' },
};

export const RISK_META = {
  SAFE:       { label: 'Safe',       icon: '\u2713', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  WARNING:    { label: 'Warning',    icon: '\u26A0', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  CONDONABLE: { label: 'Condonable', icon: '\u26A0', cls: 'bg-orange-50 text-orange-800 border-orange-200' },
  DETAINED:   { label: 'Detained',   icon: '\u2715', cls: 'bg-red-50 text-red-800 border-red-200' },
};

export const LEAVE_TYPES = [
  { value: 'MEDICAL', label: 'Medical' },
  { value: 'ON_DUTY', label: 'On duty (college event)' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'SPORTS', label: 'Sports' },
];

export const ROLES = {
  STUDENT: 'STUDENT', FACULTY: 'FACULTY', CLASS_ADVISOR: 'CLASS_ADVISOR',
  HOD: 'HOD', ATTENDANCE_OFFICER: 'ATTENDANCE_OFFICER', ADMIN: 'ADMIN',
};

export const STAFF_ROLES = [
  ROLES.FACULTY, ROLES.CLASS_ADVISOR, ROLES.HOD, ROLES.ATTENDANCE_OFFICER, ROLES.ADMIN,
];

export const REPORT_TYPES = [
  { value: 'DAILY_ATTENDANCE', label: 'Daily attendance register' },
  { value: 'SESSION_ATTENDANCE', label: 'Single class sheet' },
  { value: 'STUDENT_SUMMARY', label: 'Attendance summary' },
  { value: 'DEFAULTERS', label: 'Low attendance (defaulters)' },
  { value: 'MONTHLY_REGISTER', label: 'Monthly register' },
];
