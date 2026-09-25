const path = require('path');
const fs = require('fs');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const dir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(dir, { recursive: true });

const ALLOWED = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
]);

module.exports = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
    },
  }),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024, files: 3 },
  fileFilter: (req, file, cb) => (ALLOWED.has(file.mimetype)
    ? cb(null, true)
    : cb(ApiError.badRequest(`File type not allowed: ${file.mimetype}`))),
});
