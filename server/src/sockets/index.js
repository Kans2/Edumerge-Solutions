const { Server } = require('socket.io');
const env = require('../config/env');
const logger = require('../config/logger');
const tokens = require('../modules/auth/tokenService');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: env.CLIENT_ORIGIN, credentials: true } });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = tokens.verifyAccess(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.data.departmentId = payload.dept;
      socket.data.sectionId = payload.sec;
      return next();
    } catch { return next(new Error('Invalid token')); }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.departmentId) socket.join(`dept:${socket.data.departmentId}`);
    if (socket.data.sectionId) socket.join(`section:${socket.data.sectionId}`);

    socket.on('session:subscribe', (id) => socket.join(`session:${id}`));
    socket.on('session:unsubscribe', (id) => socket.leave(`session:${id}`));
    socket.on('disconnect', () => logger.debug(`socket disconnected ${socket.id}`));
  });

  logger.info('Socket.IO initialised');
  return io;
}

const emit = (room, event, payload) => { if (io) io.to(room).emit(event, payload); };

module.exports = {
  init,
  emitToUser: (id, e, p) => emit(`user:${id}`, e, p),
  emitToSection: (id, e, p) => emit(`section:${id}`, e, p),
  emitToDepartment: (id, e, p) => emit(`dept:${id}`, e, p),
  emitToSession: (id, e, p) => emit(`session:${id}`, e, p),
  getIo: () => io,
};
