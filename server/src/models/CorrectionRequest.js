const mongoose = require('mongoose');
const { CORRECTION_STATUS, ATT_STATUS } = require('../config/constants');

/**
 * Raised when a locked session needs to change. Nothing on a locked session
 * can be edited except through an approved correction.
 */
const correctionRequestSchema = new mongoose.Schema({
  requestNo: { type: String, unique: true, index: true },   // COR-2026-000123
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession', required: true, index: true },
  offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },

  date: { type: String, required: true },
  subjectCode: String,
  subjectName: String,
  sectionCode: String,

  raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  raisedByName: String,
  raisedByRole: String,
  reason: { type: String, required: true, maxlength: 1000 },
  evidenceUrl: String,

  /** Each line is one student whose mark should change. */
  changes: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentCode: String,
    studentName: String,
    fromStatus: { type: String, enum: Object.values(ATT_STATUS) },
    toStatus: { type: String, enum: Object.values(ATT_STATUS), required: true },
  }],

  status: { type: String, enum: Object.values(CORRECTION_STATUS), default: CORRECTION_STATUS.PENDING, index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedByName: String,
  reviewedAt: Date,
  reviewNote: String,
  appliedAt: Date,
}, { timestamps: true });

correctionRequestSchema.index({ status: 1, departmentId: 1, createdAt: -1 });
correctionRequestSchema.index({ raisedBy: 1, createdAt: -1 });

module.exports = mongoose.model('CorrectionRequest', correctionRequestSchema);
