const mongoose = require('mongoose');

/**
 * A term carries the attendance policy in force for that period, so a rule
 * change next semester never retroactively rewrites past percentages.
 */
const academicTermSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },   // e.g. 2025-26 Odd Semester
  academicYear: { type: String, required: true },         // 2025-26
  termType: { type: String, enum: ['ODD', 'EVEN', 'SUMMER'], default: 'ODD' },
  startDate: { type: String, required: true },            // YYYY-MM-DD
  endDate: { type: String, required: true },
  policy: {
    minAttendancePercent: { type: Number, default: 75 },
    condonationFloorPercent: { type: Number, default: 65 },
    excusedCountsAsPresent: { type: Boolean, default: true },
    lateCountsAsPresent: { type: Boolean, default: true },
    editWindowHours: { type: Number, default: 24 },
    lockAfterHours: { type: Number, default: 48 },
    defaultMark: { type: String, default: 'PRESENT' },
  },
  isCurrent: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('AcademicTerm', academicTermSchema);
