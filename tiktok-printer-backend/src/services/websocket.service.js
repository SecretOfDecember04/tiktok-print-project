const { Server } = require('socket.io');
const logger = require('../utils/logger');

let io;

function initWebSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: [process.env.FRONTEND_URL, process.env.DESKTOP_APP_URL],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info('Client connected:', socket.id);

    socket.on('join-shop', (shopId) => {
      socket.join(`shop-${shopId}`);
      logger.info(`Socket ${socket.id} joined shop-${shopId}`);
    });

    socket.on('disconnect', () => {
      logger.info('Client disconnected:', socket.id);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('WebSocket not initialized');
  }
  return io;
}

function emitToShop(shopId, event, data) {
  if (io) {
    io.to(`shop-${shopId}`).emit(event, data);
  }
}

module.exports = {
  initWebSocket,
  getIO,
  emitToShop
};