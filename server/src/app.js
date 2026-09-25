const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const pinoHttp = require('pino-http');

const env = require('./config/env');
const logger = require('./config/logger');
const requestId = require('./middlewares/requestId');
const { standardLimiter } = require('./middlewares/rateLimit');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const routes = require('./routes');

const app = express();

app.set('trust proxy', 1);
app.use(requestId);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: env.CLIENT_ORIGIN,
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'X-Row-Count', 'X-Columns', 'X-Unknown-Columns'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Excel buffers are already compressed; compressing again wastes CPU.
app.use(compression({ filter: (req, res) => !String(res.getHeader('Content-Type') || '').includes('spreadsheet') }));
app.use(mongoSanitize({ replaceWith: '_' }));

if (env.NODE_ENV !== 'test') {
  app.use(pinoHttp({ logger, genReqId: (req) => req.id, autoLogging: { ignore: (req) => req.url === '/health' } }));
}

app.use('/uploads', express.static(path.resolve(process.cwd(), env.UPLOAD_DIR)));

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.get('/ready', (req, res) => {
  const mongoose = require('mongoose');
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ready' : 'degraded', db: dbUp });
});

app.use(env.API_PREFIX, standardLimiter, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
