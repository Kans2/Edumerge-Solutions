const http = require('http');
const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/db');
const sockets = require('./sockets');
const { startJobs, stopJobs } = require('./jobs');

async function bootstrap() {
  await connectDB();

  const server = http.createServer(app);
  sockets.init(server);
  startJobs();

  server.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}${env.API_PREFIX} [${env.NODE_ENV}]`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received - shutting down gracefully`);
    stopJobs();
    server.close(() => { disconnectDB().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  ['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => shutdown(s)));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
  process.on('uncaughtException', (err) => { logger.fatal({ err }, 'Uncaught exception'); process.exit(1); });
}

bootstrap();
