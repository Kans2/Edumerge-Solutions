const { CourseOffering } = require('../models');
const attendanceService = require('../modules/attendance/attendanceService');
const termService = require('../modules/academics/termService');
const logger = require('../config/logger');

/**
 * Nightly full rebuild of every summary row. The incremental recompute on
 * each marking keeps things fresh during the day; this is the safety net that
 * guarantees the numbers are correct even if an incremental run was missed.
 */
module.exports = async function summaryJob() {
  const term = await termService.getCurrentTerm();
  if (!term) return { offerings: 0 };

  const offerings = await CourseOffering.find({ termId: term._id, isActive: true }).select('_id').lean();
  let updated = 0;
  let failed = 0;

  for (const o of offerings) {
    try {
      const r = await attendanceService.recomputeOffering(o._id, term._id);
      updated += r.updated || 0;
    } catch (err) {
      failed += 1;
      logger.error({ err, offeringId: o._id }, 'Summary recompute failed');
    }
  }

  logger.info({ offerings: offerings.length, updated, failed }, 'Nightly summary rebuild complete');
  return { offerings: offerings.length, updated, failed };
};
