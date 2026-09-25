const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, ROLE_CAPABILITIES } = require('../config/constants');

const userSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, index: true }, // roll no / staff id
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  phone: String,
  passwordHash: { type: String, required: true, select: false },

  role: { type: String, enum: Object.values(ROLES), required: true, index: true },
  capabilities: { type: [String], default: [] },

  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', index: true },

  student: {
    programmeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Programme' },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section', index: true },
    rollNumber: String,
    registerNumber: String,
    admissionYear: Number,
    currentSemester: Number,
    guardianName: String,
    guardianPhone: String,
    guardianEmail: String,
    hostelResident: { type: Boolean, default: false },
  },

  staff: {
    designation: String,
    employeeType: { type: String, enum: ['PERMANENT', 'VISITING', 'CONTRACT'], default: 'PERMANENT' },
    advisorOfSectionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Section' }],
  },

  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'ALUMNI'], default: 'ACTIVE', index: true },
  refreshTokenHash: { type: String, select: false },
  lastLoginAt: Date,
}, { timestamps: true });

userSchema.pre('save', async function preSave(next) {
  if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  if (this.isModified('role') || !this.capabilities.length) {
    this.capabilities = ROLE_CAPABILITIES[this.role] || [];
  }
  next();
});

userSchema.methods.comparePassword = function cmp(plain) { return bcrypt.compare(plain, this.passwordHash); };
userSchema.methods.toSafeJSON = function safe() {
  const o = this.toObject();
  delete o.passwordHash; delete o.refreshTokenHash;
  return o;
};

userSchema.index({ role: 1, 'student.sectionId': 1, status: 1 });
userSchema.index({ name: 'text', email: 'text', code: 'text' });

module.exports = mongoose.model('User', userSchema);
