const {
  CorrectionRequest, ClassSession, AttendanceRecord, LeaveRequest, User, Section,
} = require('../../models');
const {
  CORRECTION_STATUS, LEAVE_STATUS, ATT_STATUS, ROLES, AUDIT_ACTION, CAPABILITIES,
} = require('../../config/constants');
const ApiError = require('../../utils/ApiError');
const auditService = require('../audit/auditService');
const notificationService = require('../notifications/notificationService');
const attendanceService = require('../attendance/attendanceService');
const attendancePolicy = require('../attendance/attendancePolicy');
const termService = require('../academics/termService');
const { nextSequence } = require('../../utils/counter');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { dateRange } = require('../../utils/dateUtils');
const logger = require('../../config/logger');

const has = (user, cap) => (user.capabilities || []).includes(cap);

/* ------------------------------------------------------------------ *
 *  Correction requests
 * ------------------------------------------------------------------ */

async function raiseCorrection(user, payload, ctx = {}) {
  const session = await ClassSession.findById(payload.sessionId).lean();
  if (!session) throw ApiError.notFound('Class session not found.');

  // A student may only request a change to their own mark.
  if (user.role === ROLES.STUDENT) {
    const mine = (payload.changes || []).every((c) => String(c.studentId) === String(user._id));
    if (!mine) throw ApiError.forbidden('You can only request a correction for your own attendance.');
    if (String(session.sectionId) !== String(user.student?.sectionId)) {
      throw ApiError.forbidden('This class does not belong to your section.');
    }
  } else {
    attendanceService.assertCanViewSession(user, session);
  }

  const existing = await CorrectionRequest.findOne({
    sessionId: session._id,
    raisedBy: user._id,
    status: CORRECTION_STATUS.PENDING,
  });
  if (existing) {
    throw ApiError.conflict(`You already have a pending correction (${existing.requestNo}) for this class.`);
  }

  // Attach the current status to each requested change for a clear before/after.
  const studentIds = (payload.changes || []).map((c) => c.studentId);
  const records = await AttendanceRecord.find({
    sessionId: session._id, studentId: { $in: studentIds },
  }).lean();
  const recordMap = new Map(records.map((r) => [String(r.studentId), r]));

  const changes = (payload.changes || []).map((c) => {
    const record = recordMap.get(String(c.studentId));
    if (!record) throw ApiError.badRequest('One or more students were not marked in this class.');
    if (record.status === c.toStatus) {
      throw ApiError.badRequest(`${record.studentName} is already marked ${c.toStatus}.`);
    }
    return {
      studentId: c.studentId,
      studentCode: record.studentCode,
      studentName: record.studentName,
      fromStatus: record.status,
      toStatus: c.toStatus,
    };
  });

  if (!changes.length) throw ApiError.badRequest('No changes were requested.');

  const seq = await nextSequence(`correction_${new Date().getFullYear()}`);
  const request = await CorrectionRequest.create({
    requestNo: `COR-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`,
    sessionId: session._id,
    offeringId: session.offeringId,
    termId: session.termId,
    sectionId: session.sectionId,
    departmentId: session.departmentId,
    date: session.date,
    subjectCode: session.subjectCode,
    subjectName: session.subjectName,
    sectionCode: session.sectionCode,
    raisedBy: user._id,
    raisedByName: user.name,
    raisedByRole: user.role,
    reason: payload.reason,
    evidenceUrl: payload.evidenceUrl,
    changes,
  });

  await auditService.record({
    action: AUDIT_ACTION.CORRECTION_RAISED,
    entityType: 'CorrectionRequest',
    entityId: request._id,
    actor: user,
    summary: `${request.requestNo} raised for ${session.subjectCode} on ${session.date} (${changes.length} students)`,
    meta: { changes },
    ipAddress: ctx.ip,
  });

  await notifyApprovers(session, request);
  return request;
}

async function notifyApprovers(session, request) {
  const section = await Section.findById(session.sectionId).lean();
  const approverIds = [];
  if (section?.classAdvisorId) approverIds.push(section.classAdvisorId);

  const hods = await User.find({
    role: { $in: [ROLES.HOD, ROLES.ATTENDANCE_OFFICER] },
    departmentId: session.departmentId,
    status: 'ACTIVE',
  }).select('_id').lean();
  hods.forEach((h) => approverIds.push(h._id));

  await notificationService.notifyMany([...new Set(approverIds.map(String))].map((id) => ({
    userId: id,
    type: 'CORRECTION_PENDING',
    title: `Correction request ${request.requestNo}`,
    body: `${request.raisedByName} requested changes to ${session.subjectCode} on ${session.date}.`,
    severity: 'WARNING',
    link: '/corrections',
  })));
}

async function listCorrections(user, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (query.status) filter.status = { $in: String(query.status).split(',') };
  if (query.sectionId) filter.sectionId = query.sectionId;

  if (user.role === ROLES.STUDENT) {
    filter.raisedBy = user._id;
  } else if (has(user, CAPABILITIES.CORRECTION_APPROVE)) {
    if (!has(user, CAPABILITIES.ATT_READ_ALL)) filter.departmentId = user.departmentId;
    if (query.departmentId && has(user, CAPABILITIES.ATT_READ_ALL)) filter.departmentId = query.departmentId;
  } else {
    filter.raisedBy = user._id;
  }

  const [items, total] = await Promise.all([
    CorrectionRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CorrectionRequest.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

/**
 * Approving a correction rewrites the affected attendance records, preserving
 * the original status on each one, then recomputes the summaries.
 */
async function reviewCorrection(user, id, payload, ctx = {}) {
  if (!has(user, CAPABILITIES.CORRECTION_APPROVE)) {
    throw ApiError.forbidden('You cannot approve correction requests.');
  }

  const request = await CorrectionRequest.findById(id);
  if (!request) throw ApiError.notFound('Correction request not found.');
  if (request.status !== CORRECTION_STATUS.PENDING) {
    throw ApiError.conflict(`This request has already been ${request.status.toLowerCase()}.`);
  }
  if (!has(user, CAPABILITIES.ATT_READ_ALL)
    && String(request.departmentId) !== String(user.departmentId)) {
    throw ApiError.forbidden('This request belongs to another department.');
  }
  if (String(request.raisedBy) === String(user._id)) {
    throw ApiError.forbidden('You cannot approve your own correction request.');
  }

  const approve = payload.decision === 'APPROVE';
  const now = new Date();

  if (approve) {
    const session = await ClassSession.findById(request.sessionId);
    if (!session) throw ApiError.notFound('The related class session no longer exists.');

    for (const change of request.changes) {
      const record = await AttendanceRecord.findOne({
        sessionId: request.sessionId, studentId: change.studentId,
      });
      if (!record) {
        logger.warn({ studentId: change.studentId }, 'Correction skipped - record missing');
        continue;
      }
      record.originalStatus = record.originalStatus || record.status;
      record.status = change.toStatus;
      record.isCorrected = true;
      record.correctedBy = user._id;
      record.correctedAt = now;
      record.correctionId = request._id;
      await record.save();
    }

    await attendanceService.refreshSessionStats(session);
    request.appliedAt = now;

    attendanceService.recomputeOffering(request.offeringId, request.termId)
      .catch((err) => logger.error({ err }, 'Recompute after correction failed'));
  }

  request.status = approve ? CORRECTION_STATUS.APPROVED : CORRECTION_STATUS.REJECTED;
  request.reviewedBy = user._id;
  request.reviewedByName = user.name;
  request.reviewedAt = now;
  request.reviewNote = payload.note;
  await request.save();

  await auditService.record({
    action: approve ? AUDIT_ACTION.CORRECTION_APPROVED : AUDIT_ACTION.CORRECTION_REJECTED,
    entityType: 'CorrectionRequest',
    entityId: request._id,
    actor: user,
    summary: `${request.requestNo} ${request.status.toLowerCase()} — ${request.changes.length} records`,
    before: { status: CORRECTION_STATUS.PENDING },
    after: { status: request.status },
    meta: { note: payload.note },
    ipAddress: ctx.ip,
  });

  await notificationService.notify({
    userId: request.raisedBy,
    type: `CORRECTION_${request.status}`,
    title: `Correction ${request.requestNo} ${request.status.toLowerCase()}`,
    body: payload.note || (approve ? 'Your attendance record has been updated.' : 'The request was not approved.'),
    severity: approve ? 'INFO' : 'WARNING',
    link: '/corrections',
  });

  // Students whose record changed deserve to know directly.
  if (approve) {
    await notificationService.notifyMany(request.changes.map((c) => ({
      userId: c.studentId,
      type: 'ATTENDANCE_CORRECTED',
      title: `Attendance updated for ${request.subjectCode}`,
      body: `${request.date}: ${c.fromStatus} changed to ${c.toStatus}.`,
      link: '/my-attendance',
    })));
  }

  return request;
}

async function withdrawCorrection(user, id) {
  const request = await CorrectionRequest.findById(id);
  if (!request) throw ApiError.notFound('Correction request not found.');
  if (String(request.raisedBy) !== String(user._id)) {
    throw ApiError.forbidden('You can only withdraw your own requests.');
  }
  if (request.status !== CORRECTION_STATUS.PENDING) {
    throw ApiError.conflict('Only a pending request can be withdrawn.');
  }
  request.status = CORRECTION_STATUS.WITHDRAWN;
  await request.save();
  return request;
}

/* ------------------------------------------------------------------ *
 *  Leave / on-duty requests
 * ------------------------------------------------------------------ */

async function raiseLeave(user, payload, ctx = {}) {
  const studentId = payload.studentId && user.role !== ROLES.STUDENT ? payload.studentId : user._id;
  const student = await User.findById(studentId).lean();
  if (!student || student.role !== ROLES.STUDENT) throw ApiError.badRequest('Student not found.');

  if (payload.fromDate > payload.toDate) {
    throw ApiError.badRequest('The start date cannot be after the end date.');
  }

  const term = await termService.requireCurrentTerm();
  const seq = await nextSequence(`leave_${new Date().getFullYear()}`);

  const leave = await LeaveRequest.create({
    requestNo: `LV-${new Date().getFullYear()}-${String(seq).padStart(6, '0')}`,
    studentId: student._id,
    studentCode: student.code,
    studentName: student.name,
    sectionId: student.student?.sectionId,
    departmentId: student.departmentId,
    termId: term._id,
    leaveType: payload.leaveType,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    reason: payload.reason,
    documentUrl: payload.documentUrl,
  });

  await auditService.record({
    action: AUDIT_ACTION.LEAVE_RAISED,
    entityType: 'LeaveRequest',
    entityId: leave._id,
    actor: user,
    summary: `${leave.requestNo}: ${payload.leaveType} from ${payload.fromDate} to ${payload.toDate}`,
    ipAddress: ctx.ip,
  });

  const section = await Section.findById(student.student?.sectionId).lean();
  if (section?.classAdvisorId) {
    await notificationService.notify({
      userId: section.classAdvisorId,
      type: 'LEAVE_PENDING',
      title: `Leave request ${leave.requestNo}`,
      body: `${student.name} requested ${payload.leaveType} leave from ${payload.fromDate} to ${payload.toDate}.`,
      link: '/leaves',
    });
  }
  return leave;
}

/**
 * Approving a leave retro-applies EXCUSED / LEAVE to every attendance record
 * already captured inside the covered date range.
 */
async function reviewLeave(user, id, payload, ctx = {}) {
  if (!has(user, CAPABILITIES.LEAVE_APPROVE)) throw ApiError.forbidden('You cannot approve leave requests.');

  const leave = await LeaveRequest.findById(id);
  if (!leave) throw ApiError.notFound('Leave request not found.');
  if (leave.status !== LEAVE_STATUS.PENDING) {
    throw ApiError.conflict(`This request has already been ${leave.status.toLowerCase()}.`);
  }

  const approve = payload.decision === 'APPROVE';
  const now = new Date();

  if (approve) {
    const newStatus = leave.leaveType === 'ON_DUTY' ? ATT_STATUS.EXCUSED : ATT_STATUS.LEAVE;
    const dates = dateRange(leave.fromDate, leave.toDate);

    const records = await AttendanceRecord.find({
      studentId: leave.studentId,
      date: { $in: dates },
      status: { $in: [ATT_STATUS.ABSENT, ATT_STATUS.LATE] },
    });

    const offeringIds = new Set();
    for (const record of records) {
      record.originalStatus = record.originalStatus || record.status;
      record.status = newStatus;
      record.isCorrected = true;
      record.correctedBy = user._id;
      record.correctedAt = now;
      record.leaveId = leave._id;
      record.remarks = `${leave.leaveType} approved (${leave.requestNo})`;
      await record.save();
      offeringIds.add(String(record.offeringId));
    }

    leave.appliedRecordCount = records.length;

    for (const offeringId of offeringIds) {
      attendanceService.recomputeOffering(offeringId, leave.termId)
        .catch((err) => logger.error({ err }, 'Recompute after leave approval failed'));
    }
  }

  leave.status = approve ? LEAVE_STATUS.APPROVED : LEAVE_STATUS.REJECTED;
  leave.reviewedBy = user._id;
  leave.reviewedByName = user.name;
  leave.reviewedAt = now;
  leave.reviewNote = payload.note;
  await leave.save();

  await auditService.record({
    action: approve ? AUDIT_ACTION.LEAVE_APPROVED : AUDIT_ACTION.LEAVE_REJECTED,
    entityType: 'LeaveRequest',
    entityId: leave._id,
    actor: user,
    summary: `${leave.requestNo} ${leave.status.toLowerCase()} — ${leave.appliedRecordCount} records updated`,
    ipAddress: ctx.ip,
  });

  await notificationService.notify({
    userId: leave.studentId,
    type: `LEAVE_${leave.status}`,
    title: `Leave request ${leave.requestNo} ${leave.status.toLowerCase()}`,
    body: approve
      ? `${leave.appliedRecordCount} attendance records were updated to ${leave.leaveType}.`
      : (payload.note || 'Your leave request was not approved.'),
    severity: approve ? 'INFO' : 'WARNING',
    link: '/my-attendance',
  });

  return leave;
}

async function listLeaves(user, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status) filter.status = { $in: String(query.status).split(',') };

  if (user.role === ROLES.STUDENT) filter.studentId = user._id;
  else if (has(user, CAPABILITIES.ATT_READ_ALL)) {
    if (query.departmentId) filter.departmentId = query.departmentId;
  } else if (has(user, CAPABILITIES.LEAVE_APPROVE)) {
    filter.departmentId = user.departmentId;
  } else filter.studentId = user._id;

  if (query.sectionId) filter.sectionId = query.sectionId;

  const [items, total] = await Promise.all([
    LeaveRequest.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LeaveRequest.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

module.exports = {
  raiseCorrection, listCorrections, reviewCorrection, withdrawCorrection,
  raiseLeave, reviewLeave, listLeaves,
};
