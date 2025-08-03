require('dotenv').config();
const app = require('./app');
const { createServer } = require('http');
const { initializeFirebase } = require('./config/firebase');
const { initializeSupabase } = require('./config/supabase');
const logger = require('./utils/logger');
const { initWebSocket } = require('./services/websocket.service');
const { startOrderPoller } = require('./workers/orderPoller');
const { startPrintProcessor, scheduleCleanup } = require('./workers/printProcessor');

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

    // Initialize Supabase (but don't fail if connection test fails)
    try {
      const supabase = initializeSupabase();
      logger.info('Supabase client initialized');

      // Optional: Test connection with a simple query
      if (process.env.NODE_ENV === 'development') {
        try {
          // Just test if we can make a query - don't care about the result
          const { data, error } = await supabase
            .from('shops')
            .select('id')
            .limit(1);

          if (!error) {
            logger.info('Supabase connection verified');
          } else if (error.code === '42P01') {
            logger.warn('Shops table does not exist yet - run migrations');
          } else {
            logger.warn(`Supabase test query failed: ${error.message}`);
          }
        } catch (testError) {
          // Network or other errors
          logger.warn('Could not test Supabase connection - will retry on first query');
        }
      }
    } catch (initError) {
      logger.error('Failed to initialize Supabase client:', initError);
      // Don't exit - let the app try to work anyway
    }

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
      logger.info(`Frontend URL: ${process.env.FRONTEND_URL}`);
      logger.info(`TikTok Redirect URI: ${process.env.TIKTOK_REDIRECT_URI}`);

      // Start background workers only if not in test mode
      if (process.env.NODE_ENV !== 'test') {
        try {
          startOrderPoller();
          logger.info('Order polling service started');
        } catch (pollerError) {
          logger.warn('Could not start order poller:', pollerError.message);
        }

        try {
          startPrintProcessor();
          scheduleCleanup();
          logger.info('Print processor service started');
        } catch (processorError) {
          logger.warn('Could not start print processor:', processorError.message);
        }
      }
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
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();