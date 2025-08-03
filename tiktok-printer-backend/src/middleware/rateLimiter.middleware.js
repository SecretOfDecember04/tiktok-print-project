const rateLimit = require('express-rate-limit');
const { getSupabase } = require('../config/supabase');
const logger = require('../utils/logger');

// Store for tracking user-specific limits
const userLimitStore = new Map();

/**
 * Custom store implementation for rate limiting
 */
class CustomRateLimitStore {
  constructor() {
    this.store = new Map();
  }

  async increment(key) {
    const now = Date.now();
    const record = this.store.get(key) || { count: 0, resetTime: now + 60000 };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + 60000;
    } else {
      record.count++;
    }

    this.store.set(key, record);

    return {
      totalHits: record.count,
      resetTime: new Date(record.resetTime)
    };
  }

  async decrement(key) {
    const record = this.store.get(key);
    if (record && record.count > 0) {
      record.count--;
      this.store.set(key, record);
    }
  }

  async resetKey(key) {
    this.store.delete(key);
  }

  // Cleanup old entries
  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

const customStore = new CustomRateLimitStore();

// Cleanup old entries every 5 minutes
setInterval(() => {
  customStore.cleanup();
}, 5 * 60 * 1000);

/**
 * Base rate limiter configuration
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Default limit
    message: {
      error: 'Too Many Requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: customStore,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise IP
      return req.user?.uid || req.ip;
    },
    onLimitReached: (req, res, options) => {
      const identifier = req.user?.uid || req.ip;
      logger.warn('Rate limit exceeded:', {
        identifier,
        endpoint: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        limit: options.max,
        windowMs: options.windowMs
      });
    }
  };

  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * Strict rate limiter for authentication endpoints
 */
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Very strict for auth
  message: {
    error: 'Too Many Authentication Attempts',
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    retryAfter: '15 minutes'
  }
});

/**
 * General API rate limiter
 */
const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // General API calls
  message: {
    error: 'Too Many Requests',
    message: 'API rate limit exceeded. Please try again later.',
    retryAfter: '15 minutes'
  }
});

/**
 * File upload rate limiter
 */
const uploadRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 uploads per hour
  message: {
    error: 'Upload Rate Limit Exceeded',
    message: 'Too many file uploads. Please try again in an hour.',
    retryAfter: '1 hour'
  }
});

/**
 * Print job rate limiter
 */
const printRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 print jobs per 5 minutes
  message: {
    error: 'Print Rate Limit Exceeded',
    message: 'Too many print jobs submitted. Please wait before submitting more.',
    retryAfter: '5 minutes'
  }
});

/**
 * TikTok API rate limiter (more conservative)
 */
const tiktokApiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute to TikTok API
  message: {
    error: 'TikTok API Rate Limit',
    message: 'TikTok API rate limit exceeded. Please wait before making more requests.',
    retryAfter: '1 minute'
  }
});

/**
 * Webhook rate limiter (very lenient for external services)
 */
const webhookRateLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // Very high limit for webhooks
  keyGenerator: (req) => {
    // Use IP for webhooks since no auth
    return req.ip;
  },
  message: {
    error: 'Webhook Rate Limit Exceeded',
    message: 'Too many webhook requests from this IP.',
    retryAfter: '1 minute'
  }
});

/**
 * Dynamic rate limiter based on user subscription
 */
const dynamicRateLimiter = async (req, res, next) => {
  try {
    if (!req.user?.uid) {
      // Not authenticated, use basic limit
      return apiRateLimiter(req, res, next);
    }

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('users')
      .select('subscription_status, subscription_expires_at')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (error || !user) {
      return apiRateLimiter(req, res, next);
    }

    // Determine rate limit based on subscription
    let maxRequests = 1000; // Default
    let windowMs = 15 * 60 * 1000; // 15 minutes

    if (user.subscription_status === 'trial') {
      maxRequests = 500; // Lower limit for trial users
    } else if (user.subscription_status === 'premium') {
      maxRequests = 5000; // Higher limit for premium users
    } else if (user.subscription_status === 'enterprise') {
      maxRequests = 10000; // Very high limit for enterprise
      windowMs = 60 * 60 * 1000; // 1 hour window
    }

    // Check if subscription is expired
    const now = new Date();
    const expiresAt = new Date(user.subscription_expires_at);
    
    if (user.subscription_status === 'trial' && expiresAt < now) {
      maxRequests = 100; // Very low limit for expired trial
    }

    // Create dynamic rate limiter
    const dynamicLimiter = createRateLimiter({
      windowMs,
      max: maxRequests,
      message: {
        error: 'Subscription Rate Limit',
        message: `Rate limit for ${user.subscription_status} subscription exceeded.`,
        retryAfter: Math.ceil(windowMs / 60000) + ' minutes',
        upgradeUrl: user.subscription_status === 'trial' ? '/upgrade' : undefined
      }
    });

    return dynamicLimiter(req, res, next);

  } catch (error) {
    logger.error('Dynamic rate limiter error:', error);
    // Fall back to basic rate limiter
    return apiRateLimiter(req, res, next);
  }
};

/**
 * Rate limiter for expensive operations
 */
const expensiveOperationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Very limited for expensive operations
  message: {
    error: 'Expensive Operation Limit',
    message: 'Too many expensive operations. Please try again in an hour.',
    retryAfter: '1 hour'
  }
});

/**
 * Custom rate limiter for specific endpoints
 */
const createCustomLimiter = (endpoint, limits) => {
  return createRateLimiter({
    ...limits,
    keyGenerator: (req) => {
      const identifier = req.user?.uid || req.ip;
      return `${endpoint}:${identifier}`;
    }
  });
};

/**
 * Rate limiting middleware with bypass for development
 */
const rateLimitWithBypass = (limiter) => {
  return (req, res, next) => {
    // Bypass rate limiting in test environment
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    // Apply rate limiting
    return limiter(req, res, next);
  };
};

/**
 * Get rate limit status for a user
 */
const getRateLimitStatus = async (req, res) => {
  try {
    const identifier = req.user?.uid || req.ip;
    const status = {};

    // Check various rate limit stores
    const limitTypes = [
      { name: 'api', key: identifier },
      { name: 'upload', key: identifier },
      { name: 'print', key: identifier },
      { name: 'tiktok', key: identifier }
    ];

    for (const limitType of limitTypes) {
      const record = customStore.store.get(limitType.key);
      if (record) {
        status[limitType.name] = {
          current: record.count,
          resetTime: new Date(record.resetTime),
          remaining: Math.max(0, record.resetTime - Date.now())
        };
      } else {
        status[limitType.name] = {
          current: 0,
          resetTime: null,
          remaining: 0
        };
      }
    }

    res.json({
      identifier,
      limits: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get rate limit status error:', error);
    res.status(500).json({ error: 'Failed to get rate limit status' });
  }
};

/**
 * Reset rate limits for a user (admin function)
 */
const resetUserRateLimit = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Reset all rate limits for this user
    for (const key of customStore.store.keys()) {
      if (key.includes(userId)) {
        customStore.resetKey(key);
      }
    }

    logger.info(`Rate limits reset for user: ${userId}`);
    
    res.json({
      message: 'Rate limits reset successfully',
      userId
    });

  } catch (error) {
    logger.error('Reset rate limit error:', error);
    res.status(500).json({ error: 'Failed to reset rate limits' });
  }
};

module.exports = {
  // Individual rate limiters
  authRateLimiter: rateLimitWithBypass(authRateLimiter),
  apiRateLimiter: rateLimitWithBypass(apiRateLimiter),
  uploadRateLimiter: rateLimitWithBypass(uploadRateLimiter),
  printRateLimiter: rateLimitWithBypass(printRateLimiter),
  tiktokApiRateLimiter: rateLimitWithBypass(tiktokApiRateLimiter),
  webhookRateLimiter: rateLimitWithBypass(webhookRateLimiter),
  expensiveOperationLimiter: rateLimitWithBypass(expensiveOperationLimiter),
  
  // Dynamic rate limiter
  dynamicRateLimiter,
  
  // Utility functions
  createCustomLimiter,
  createRateLimiter,
  getRateLimitStatus,
  resetUserRateLimit,
  
  // Store for testing
  customStore
};
