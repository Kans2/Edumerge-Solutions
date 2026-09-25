const mongoose = require('mongoose');
const { ATT_STATUS } = require('../config/constants');

/**
 * One row per student per session. The compound unique index makes marking
 * idempotent: re-submitting a roster updates rather than duplicates.
 */
const attendanceRecordSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },

  date: { type: String, required: true, index: true },
  periodNumber: Number,
  periodsCounted: { type: Number, default: 1 },

  status: { type: String, enum: Object.values(ATT_STATUS), required: true, index: true },
  remarks: String,

  // Snapshot of the student for exports and historical accuracy
  studentCode: String,
  studentName: String,
  rollNumber: String,

  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  markedAt: { type: Date, default: Date.now },

  // Correction trail
  isCorrected: { type: Boolean, default: false },
  originalStatus: String,
  correctedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  correctedAt: Date,
  correctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CorrectionRequest' },

  // Set when an approved leave/OD auto-applied to this record
  leaveId: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest' },
}, { timestamps: true });

attendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
attendanceRecordSchema.index({ studentId: 1, termId: 1, offeringId: 1 });
attendanceRecordSchema.index({ studentId: 1, date: 1 });
attendanceRecordSchema.index({ sectionId: 1, date: 1, status: 1 });
attendanceRecordSchema.index({ departmentId: 1, date: 1 });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
