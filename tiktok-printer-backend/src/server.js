require('dotenv').config();
const app = require('./app');
const { createServer } = require('http');
const { initializeSupabase } = require('./config/supabase');
const logger = require('./utils/logger');
// const { initializeFirebase } = require('./config/firebase');
// const { initWebSocket } = require('./services/websocket.service');
// const { startOrderPoller } = require('./workers/orderPoller');
// const { startPrintProcessor, scheduleCleanup } = require('./workers/printProcessor');

const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // optional: firebase
    // initializeFirebase();
    // logger.info('Firebase Admin initialized');

    // supabase
    try {
      const supabase = initializeSupabase();
      logger.info('Supabase client initialized');

      if (process.env.NODE_ENV === 'development') {
        const { error } = await supabase.from('shops').select('id').limit(1);
        if (!error) {
          logger.info('Supabase connection verified');
        } else {
          logger.warn(`Supabase query error: ${error.message}`);
        }
      }
    } catch (err) {
      logger.error('Failed to init Supabase:', err);
    }

    // optional: websockets
    // initWebSocket(httpServer);

    // start http server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`ENV: ${process.env.NODE_ENV}`);
    });

    // optional: workers
    // if (process.env.NODE_ENV !== 'test') {
    //   try {
    //     startOrderPoller();
    //     logger.info('Order poller started');
    //   } catch (err) {
    //     logger.warn('Order poller failed:', err.message);
    //   }

    //   try {
    //     startPrintProcessor();
    //     scheduleCleanup();
    //     logger.info('Print processor started');
    //   } catch (err) {
    //     logger.warn('Print processor failed:', err.message);
    //   }
    // }

  } catch (error) {
    logger.error('Server failed to start:', error);
    process.exit(1);
  }
}

// graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down...');
  httpServer.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down...');
  httpServer.close(() => process.exit(0));
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason, p) => {
  logger.error('Unhandled Rejection at:', p, 'reason:', reason);
  process.exit(1);
});

// start
startServer();