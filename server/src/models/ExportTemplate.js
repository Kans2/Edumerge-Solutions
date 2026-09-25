const mongoose = require('mongoose');

/**
 * Saved Excel layout: which columns, in what order, under what headers.
 * This is what makes export column names customisable per user or institution.
 */
const columnSchema = new mongoose.Schema({
  key: { type: String, required: true },        // registry key, e.g. 'studentName'
  header: { type: String, required: true },     // the label printed in row 1
  width: { type: Number, default: 18 },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  format: String,                                // e.g. '0.00"%"' for percent columns
}, { _id: false });

const exportTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  reportType: {
    type: String,
    enum: ['DAILY_ATTENDANCE', 'SESSION_ATTENDANCE', 'STUDENT_SUMMARY', 'DEFAULTERS', 'MONTHLY_REGISTER'],
    required: true,
    index: true,
  },
  columns: { type: [columnSchema], default: [] },
  options: {
    includeSummaryRow: { type: Boolean, default: true },
    includeFilterHeader: { type: Boolean, default: true },
    freezeHeader: { type: Boolean, default: true },
    autoFilter: { type: Boolean, default: true },
    sheetName: { type: String, default: 'Attendance' },
    dateFormat: { type: String, default: 'dd-MM-yyyy' },
    highlightBelowThreshold: { type: Boolean, default: true },
  },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  scope: { type: String, enum: ['PRIVATE', 'DEPARTMENT', 'GLOBAL'], default: 'PRIVATE' },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true });

exportTemplateSchema.index({ reportType: 1, ownerId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ExportTemplate', exportTemplateSchema);
