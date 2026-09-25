const mongoose = require('mongoose');
const { SESSION_STATUS, SESSION_TYPE } = require('../config/constants');

/**
 * A single occurrence of a class. Generated ahead of time from the timetable
 * so that a missed class is visible as an unmarked session rather than a gap.
 */
const classSessionSchema = new mongoose.Schema({
  offeringId: { type: mongoose.Schema.Types.ObjectId, ref: 'CourseOffering', required: true, index: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  date: { type: String, required: true, index: true },     // YYYY-MM-DD
  dayOfWeek: { type: Number, required: true },
  startTime: { type: String, required: true },
  endTime: String,
  periodNumber: Number,
  periodsCounted: { type: Number, default: 1 },
  sessionType: { type: String, enum: Object.values(SESSION_TYPE), default: SESSION_TYPE.LECTURE },
  roomNumber: String,
  topic: String,

  status: { type: String, enum: Object.values(SESSION_STATUS), default: SESSION_STATUS.SCHEDULED, index: true },

  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  markedByName: String,
  markedAt: Date,
  lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lastEditedAt: Date,
  editCount: { type: Number, default: 0 },

  lockedAt: Date,
  unlockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  unlockReason: String,

  cancelledReason: String,

  // Denormalised counters refreshed on every mark, so lists never aggregate
  stats: {
    total: { type: Number, default: 0 },
    present: { type: Number, default: 0 },
    absent: { type: Number, default: 0 },
    late: { type: Number, default: 0 },
    excused: { type: Number, default: 0 },
    leave: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
  },

  // Denormalised labels used by exports
  subjectCode: String,
  subjectName: String,
  sectionCode: String,
  facultyName: String,
}, { timestamps: true });

/* One session per offering per date per period - protects against double generation. */
classSessionSchema.index({ offeringId: 1, date: 1, periodNumber: 1 }, { unique: true });
classSessionSchema.index({ date: 1, departmentId: 1, status: 1 });
classSessionSchema.index({ facultyId: 1, date: 1 });
classSessionSchema.index({ sectionId: 1, date: 1 });
classSessionSchema.index({ status: 1, date: 1 });

module.exports = mongoose.model('ClassSession', classSessionSchema);
