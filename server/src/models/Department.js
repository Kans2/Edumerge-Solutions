const mongoose = require('mongoose');
module.exports = mongoose.model('Department', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  hodUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));
