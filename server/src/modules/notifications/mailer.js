const nodemailer = require('nodemailer');
const env = require('../../config/env');
const logger = require('../../config/logger');

let transporter = null;
if (env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}

async function send({ to, subject, text, html }) {
  if (!transporter) {
    logger.info({ to, subject }, '[mail:dev] email suppressed (no SMTP configured)');
    return { suppressed: true };
  }
  return transporter.sendMail({
    from: env.MAIL_FROM,
    to: Array.isArray(to) ? to.join(',') : to,
    subject, text, html,
  });
}
module.exports = { send };
