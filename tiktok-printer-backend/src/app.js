const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { apiRateLimiter } = require('./middleware/rateLimiter.middleware');

const routes = require('./routes');
const errorMiddleware = require('./middleware/error.middleware');

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: [
    process.env.FRONTEND_URL,
    process.env.DESKTOP_APP_URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression middleware
app.use(compression());

// Rate limiting middleware
app.use('/api', apiRateLimiter);

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint with circuit breaker monitoring
const ErrorHandler = require('./middleware/errorHandler.middleware');
app.get('/health', ErrorHandler.healthCheck);
app.get('/metrics/errors', ErrorHandler.errorMetrics);

// API routes
app.use('/api', routes);

// 404 handler
app.use(ErrorHandler.notFound);

// Global error handler (must be last)
app.use(errorMiddleware);

module.exports = app;