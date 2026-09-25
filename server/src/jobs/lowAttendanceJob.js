const reportService = require('../modules/reports/reportService');
const logger = require('../config/logger');

module.exports = async function lowAttendanceJob() {
  try {
    const result = await reportService.sendLowAttendanceAlerts();
    logger.info(result, 'Low attendance alerts sent');
    return result;
  } catch (err) {
    logger.error({ err }, 'Low attendance alert job failed');
    return { notified: 0, error: err.message };
  }
};
