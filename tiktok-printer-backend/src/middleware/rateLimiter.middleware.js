const rateLimit = require('express-rate-limit');
const { getSupabase } = require('../config/supabase');
const logger = require('../utils/logger');

class CustomStore {
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

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}

const sharedStore = new CustomStore();
setInterval(() => sharedStore.cleanup(), 5 * 60 * 1000);

const createRateLimiter = ({ windowMs, max, message, keyGenerator }) =>
  rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true,
    legacyHeaders: false,
    store: new CustomStore(),
    keyGenerator: keyGenerator || ((req) => req.user?.uid || req.ip)
  });

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts. Try again later.'
});

const apiRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many API requests. Try again later.'
});

const dynamicRateLimiter = async (req, res, next) => {
  try {
    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('subscription_status, subscription_expires_at')
      .eq('firebase_uid', req.user?.uid)
      .single();

    let max = 1000;
    if (user?.subscription_status === 'trial') max = 500;
    if (user?.subscription_status === 'premium') max = 5000;
    if (user?.subscription_status === 'enterprise') max = 10000;

    return createRateLimiter({
      windowMs: 15 * 60 * 1000,
      max,
      message: 'Rate limit exceeded based on subscription tier.'
    })(req, res, next);
  } catch (err) {
    logger.error('dynamicRateLimiter error:', err);
    return apiRateLimiter(req, res, next);
  }
};

module.exports = {
  authRateLimiter,
  apiRateLimiter,
  dynamicRateLimiter
};