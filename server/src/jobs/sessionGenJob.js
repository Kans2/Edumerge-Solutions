const sessionService = require('../modules/sessions/sessionService');
const termService = require('../modules/academics/termService');
const { toDateKey } = require('../utils/dateUtils');
const logger = require('../config/logger');

/**
 * Rolls the session horizon forward. Runs weekly and keeps roughly four
 * weeks of classes materialised ahead of today.
 */
module.exports = async function sessionGenJob(opts = {}) {
  const term = await termService.getCurrentTerm();
  if (!term) return { created: 0 };

  const from = opts.fromDate || toDateKey(new Date());
  const to = opts.toDate || toDateKey(new Date(Date.now() + 28 * 86400000));

  try {
    const result = await sessionService.generateSessions({ termId: term._id, fromDate: from, toDate: to });
    logger.info(result, 'Session generation complete');
    return result;
  } catch (err) {
    logger.error({ err }, 'Session generation failed');
    return { created: 0, error: err.message };
  }
};
