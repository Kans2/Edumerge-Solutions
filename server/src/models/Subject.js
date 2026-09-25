const mongoose = require('mongoose');
const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true, index: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  semester: { type: Number, required: true },
  credits: { type: Number, default: 3 },
  subjectType: { type: String, enum: ['THEORY', 'LAB', 'ELECTIVE', 'PROJECT'], default: 'THEORY' },
  weeklyHours: { type: Number, default: 4 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model('Subject', subjectSchema);
