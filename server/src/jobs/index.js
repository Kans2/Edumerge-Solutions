const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../config/logger');
const summaryJob = require('./summaryJob');
const lockJob = require('./lockJob');
const sessionGenJob = require('./sessionGenJob');
const lowAttendanceJob = require('./lowAttendanceJob');

const tasks = [];

function startJobs() {
  if (!env.ENABLE_JOBS) {
    logger.warn('Background jobs are disabled (ENABLE_JOBS=false)');
    return;
  }
  tasks.push(cron.schedule(env.LOCK_CRON, lockJob, { timezone: env.TZ }));
  tasks.push(cron.schedule(env.SUMMARY_CRON, summaryJob, { timezone: env.TZ }));
  tasks.push(cron.schedule(env.SESSION_GEN_CRON, () => sessionGenJob(), { timezone: env.TZ }));
  tasks.push(cron.schedule(env.LOW_ATT_ALERT_CRON, lowAttendanceJob, { timezone: env.TZ }));
  logger.info(`Scheduled ${tasks.length} background jobs`);
}

const stopJobs = () => tasks.forEach((t) => t.stop());

module.exports = { startJobs, stopJobs, summaryJob, lockJob, sessionGenJob, lowAttendanceJob };
