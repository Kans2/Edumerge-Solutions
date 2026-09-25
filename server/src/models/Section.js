const mongoose = require('mongoose');
const sectionSchema = new mongoose.Schema({
  name: { type: String, required: true },            // A / B / C
  code: { type: String, required: true, index: true }, // CSE-2022-A
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  programmeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true, index: true },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  currentSemester: { type: Number, default: 1 },
  classAdvisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  roomNumber: String,
  strength: { type: Number, default: 0 },            // denormalised active student count
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
sectionSchema.index({ code: 1 }, { unique: true });
module.exports = mongoose.model('Section', sectionSchema);
