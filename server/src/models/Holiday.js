const mongoose = require('mongoose');
const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true, index: true },   // YYYY-MM-DD
  name: { type: String, required: true },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', index: true },
  scope: { type: String, enum: ['INSTITUTION', 'DEPARTMENT'], default: 'INSTITUTION' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  isWorkingDay: { type: Boolean, default: false },       // true => a declared working Saturday
}, { timestamps: true });
holidaySchema.index({ date: 1, departmentId: 1 }, { unique: true });
module.exports = mongoose.model('Holiday', holidaySchema);
