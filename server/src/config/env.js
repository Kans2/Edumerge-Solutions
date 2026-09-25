require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  API_PREFIX: process.env.API_PREFIX || '/api/v1',
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smart_attendance',

  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_access_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',

  CLIENT_ORIGIN: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(','),
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  TZ: process.env.TZ || 'Asia/Kolkata',

  MIN_ATTENDANCE_PERCENT: parseFloat(process.env.MIN_ATTENDANCE_PERCENT || '75'),
  CONDONATION_FLOOR_PERCENT: parseFloat(process.env.CONDONATION_FLOOR_PERCENT || '65'),
  EDIT_WINDOW_HOURS: parseInt(process.env.EDIT_WINDOW_HOURS || '24', 10),
  LOCK_AFTER_HOURS: parseInt(process.env.LOCK_AFTER_HOURS || '48', 10),
  DEFAULT_MARK: process.env.DEFAULT_MARK || 'PRESENT',
  EXCUSED_COUNTS_AS_PRESENT: process.env.EXCUSED_COUNTS_AS_PRESENT !== 'false',

  ENABLE_JOBS: process.env.ENABLE_JOBS !== 'false',
  SUMMARY_CRON: process.env.SUMMARY_CRON || '0 1 * * *',
  LOCK_CRON: process.env.LOCK_CRON || '0 * * * *',
  SESSION_GEN_CRON: process.env.SESSION_GEN_CRON || '0 0 * * 0',
  LOW_ATT_ALERT_CRON: process.env.LOW_ATT_ALERT_CRON || '0 7 * * 1',

  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),

  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  MAIL_FROM: process.env.MAIL_FROM || 'Attendance Office <no-reply@college.edu>',
};

module.exports = env;
