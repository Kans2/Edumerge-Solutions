const { z } = require('zod');
const { ATT_STATUS, SESSION_TYPE } = require('../../config/constants');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
const timeHm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM');

const markSessionSchema = z.object({
  entries: z.array(z.object({
    studentId: objectId,
    status: z.enum(Object.values(ATT_STATUS)),
    remarks: z.string().max(300).optional(),
  })).max(500).default([]),
  topic: z.string().max(200).optional(),
});

const updateRecordsSchema = z.object({
  changes: z.array(z.object({
    studentId: objectId,
    status: z.enum(Object.values(ATT_STATUS)),
    remarks: z.string().max(300).optional(),
  })).min(1).max(500),
});

const createSessionSchema = z.object({
  offeringId: objectId,
  date: dateKey,
  startTime: timeHm,
  endTime: timeHm.optional(),
  periodNumber: z.coerce.number().int().min(1).max(12),
  periodsCounted: z.coerce.number().int().min(1).max(6).default(1),
  sessionType: z.enum(Object.values(SESSION_TYPE)).optional(),
  roomNumber: z.string().max(30).optional(),
  topic: z.string().max(200).optional(),
});

const cancelSessionSchema = z.object({ reason: z.string().min(3, 'Please give a reason').max(500) });
const unlockSessionSchema = z.object({ reason: z.string().min(5, 'Please give a reason').max(500) });

const generateSessionsSchema = z.object({
  termId: objectId.optional(),
  fromDate: dateKey,
  toDate: dateKey,
  offeringId: objectId.optional(),
});

module.exports = {
  objectId, dateKey, timeHm,
  markSessionSchema, updateRecordsSchema, createSessionSchema,
  cancelSessionSchema, unlockSessionSchema, generateSessionsSchema,
};
