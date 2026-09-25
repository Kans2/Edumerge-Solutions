const sessionService = require('../modules/sessions/sessionService');
const logger = require('../config/logger');

module.exports = async function lockJob() {
  try {
    return await sessionService.lockExpiredSessions();
  } catch (err) {
    logger.error({ err }, 'Session lock job failed');
    return { locked: 0, error: err.message };
  }
};
