const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const { apiRateLimiter } = require('./middleware/rateLimiter.middleware');
const { errorHandler, notFound, healthCheck, errorMetrics } = require('./middleware/error.middleware');

const routes = require('./routes');

const app = express();

// security
app.use(helmet());

// cors
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    process.env.DESKTOP_APP_URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// compression
app.use(compression());

// rate limiter
app.use('/api', apiRateLimiter);

// logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// uploads static
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// health check & metrics
app.get('/health', healthCheck);
app.get('/metrics/errors', errorMetrics);

// routes
app.use('/api', routes);

// 404 & error handler
app.use(notFound);
app.use(errorHandler);

module.exports = app;