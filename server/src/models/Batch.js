const mongoose = require('mongoose');
const batchSchema = new mongoose.Schema({
  name: { type: String, required: true },            // e.g. 2022-2026
  programmeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme', required: true, index: true },
  admissionYear: { type: Number, required: true },
  graduationYear: Number,
  currentSemester: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
batchSchema.index({ programmeId: 1, admissionYear: 1 }, { unique: true });
module.exports = mongoose.model('Batch', batchSchema);
