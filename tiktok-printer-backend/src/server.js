require('dotenv').config();
const app = require('./app');
const { createServer } = require('http');
const { initializeFirebase } = require('./config/firebase');
const { initializeSupabase } = require('./config/supabase');
const logger = require('./utils/logger');
const { initWebSocket } = require('./services/websocket.service');
const { startOrderPoller } = require('./workers/orderPoller');

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket
initWebSocket(httpServer);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Initialize Firebase Admin
    initializeFirebase();
    logger.info('Firebase Admin initialized');

    // Test Supabase connection
    const supabase = initializeSupabase();
    const { error } = await supabase.from('shops').select('count').limit(1);
    if (error) throw error;
    logger.info('Supabase connection established');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);

      // Start background workers
      startOrderPoller();
      logger.info('Order polling service started');
    });

  } catch (error) {
    logger.error('Unable to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.info('HTTP server closed.');
  });
  process.exit(0);
});

// Start the server
startServer();