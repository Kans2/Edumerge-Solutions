const mongoose = require('mongoose');
module.exports = mongoose.model('Programme', new mongoose.Schema({
  name: { type: String, required: true },            // e.g. B.E. Computer Science
  code: { type: String, required: true, unique: true, uppercase: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  degreeType: { type: String, enum: ['UG', 'PG', 'PHD'], default: 'UG' },
  durationYears: { type: Number, default: 4 },
  totalSemesters: { type: Number, default: 8 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));
