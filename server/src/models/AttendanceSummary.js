const mongoose = require('mongoose');
const { RISK_BAND } = require('../config/constants');

/**
 * Materialised per student per offering (and a rolled-up OVERALL row).
 * Reports and dashboards read this instead of aggregating millions of records.
 */
const attendanceSummarySchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', default: null, index: true },

  scope: { type: String, enum: ['SUBJECT', 'OVERALL'], default: 'SUBJECT', index: true },

  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },

  studentCode: String,
  studentName: String,
  rollNumber: String,
  subjectCode: String,
  subjectName: String,
  sectionCode: String,

  heldPeriods: { type: Number, default: 0 },      // total conducted
  presentPeriods: { type: Number, default: 0 },
  absentPeriods: { type: Number, default: 0 },
  latePeriods: { type: Number, default: 0 },
  excusedPeriods: { type: Number, default: 0 },
  leavePeriods: { type: Number, default: 0 },
  countablePeriods: { type: Number, default: 0 }, // denominator after exemptions

  percent: { type: Number, default: 0, index: true },
  riskBand: { type: String, enum: Object.values(RISK_BAND), default: RISK_BAND.SAFE, index: true },

  /** Periods the student must attend consecutively to reach the threshold. */
  periodsToReachThreshold: { type: Number, default: 0 },

  condonation: {
    granted: { type: Boolean, default: false },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    grantedAt: Date,
    reason: String,
  },

  lastComputedAt: { type: Date, default: Date.now },
}, { timestamps: true });

attendanceSummarySchema.index({ studentId: 1, termId: 1, offeringId: 1, scope: 1 }, { unique: true });
attendanceSummarySchema.index({ termId: 1, scope: 1, riskBand: 1 });
attendanceSummarySchema.index({ departmentId: 1, termId: 1, scope: 1, percent: 1 });
attendanceSummarySchema.index({ sectionId: 1, termId: 1, scope: 1 });

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);
