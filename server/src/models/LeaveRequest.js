const mongoose = require('mongoose');
const { LEAVE_TYPE, LEAVE_STATUS } = require('../config/constants');

/**
 * Approved leave/OD retro-applies EXCUSED or LEAVE to every attendance record
 * already captured in the covered date range, and pre-applies to future ones.
 */
const leaveRequestSchema = new mongoose.Schema({
  requestNo: { type: String, unique: true, index: true },   // LV-2026-000045
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentCode: String,
  studentName: String,
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },

  leaveType: { type: String, enum: Object.values(LEAVE_TYPE), required: true },
  fromDate: { type: String, required: true },
  toDate: { type: String, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  documentUrl: String,

  status: { type: String, enum: Object.values(LEAVE_STATUS), default: LEAVE_STATUS.PENDING, index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByName: String,
  reviewedAt: Date,
  reviewNote: String,

  appliedRecordCount: { type: Number, default: 0 },
}, { timestamps: true });

leaveRequestSchema.index({ status: 1, departmentId: 1, createdAt: -1 });
leaveRequestSchema.index({ studentId: 1, fromDate: 1, toDate: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
