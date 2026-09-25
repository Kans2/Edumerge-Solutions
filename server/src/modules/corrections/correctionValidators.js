const { z } = require('zod');
const { ATT_STATUS, LEAVE_TYPE } = require('../../config/constants');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

const raiseCorrectionSchema = z.object({
  sessionId: objectId,
  reason: z.string().min(10, 'Please explain the reason in at least 10 characters').max(1000),
  evidenceUrl: z.string().url().optional(),
  changes: z.array(z.object({
    studentId: objectId,
    toStatus: z.enum(Object.values(ATT_STATUS)),
  })).min(1, 'Select at least one student').max(200),
});

const reviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().max(500).optional(),
});

const raiseLeaveSchema = z.object({
  studentId: objectId.optional(),
  leaveType: z.enum(Object.values(LEAVE_TYPE)),
  fromDate: dateKey,
  toDate: dateKey,
  reason: z.string().min(10, 'Please explain the reason').max(1000),
  documentUrl: z.string().url().optional(),
});

module.exports = { raiseCorrectionSchema, reviewSchema, raiseLeaveSchema };
