const mongoose = require('mongoose');
const { SESSION_TYPE } = require('../config/constants');

/**
 * One subject taught to one section by one faculty member in one term.
 * This is the unit that attendance percentages are reported against.
 */
const timetableSlotSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },  // 0 = Sunday
  startTime: { type: String, required: true },                  // HH:MM
  endTime: { type: String, required: true },
  periodNumber: Number,
  roomNumber: String,
  sessionType: { type: String, enum: Object.values(SESSION_TYPE), default: SESSION_TYPE.LECTURE },
  periodsCounted: { type: Number, default: 1 },                 // a 3-hour lab counts as 3
}, { _id: false });

const courseOfferingSchema = new mongoose.Schema({
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', required: true, index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },

  facultyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  coFacultyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  timetable: { type: [timetableSlotSchema], default: [] },

  // Denormalised for fast display and export headers
  subjectCode: String,
  subjectName: String,
  sectionCode: String,
  facultyName: String,

  plannedPeriods: { type: Number, default: 0 },
  conductedPeriods: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

courseOfferingSchema.index({ termId: 1, subjectId: 1, sectionId: 1 }, { unique: true });
courseOfferingSchema.index({ facultyId: 1, termId: 1, isActive: 1 });

module.exports = mongoose.model('CourseOffering', courseOfferingSchema);
