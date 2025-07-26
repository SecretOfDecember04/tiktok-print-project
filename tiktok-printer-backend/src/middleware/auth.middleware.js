const { getAuth } = require('../config/firebase');
const logger = require('../utils/logger');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];

    // Verify Firebase ID token
    const decodedToken = await getAuth().verifyIdToken(token);

    // Add user info to request
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };

    next();
  } catch (error) {
    logger.error('Auth error:', error);

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }

    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Optional: Middleware to check if user is subscribed
async function requireSubscription(req, res, next) {
  try {
    const { getSupabase } = require('../config/supabase');
    const supabase = getSupabase();

    const { data: user, error } = await supabase
      .from('users')
      .select('subscription_status, subscription_expires_at')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (error || !user) {
      return res.status(403).json({ error: 'User not found' });
    }

    const now = new Date();
    const expiresAt = new Date(user.subscription_expires_at);

    if (user.subscription_status === 'active' ||
        (user.subscription_status === 'trial' && expiresAt > now)) {
      req.user.subscription = user;
      next();
    } else {
      return res.status(403).json({ error: 'Subscription required' });
    }
  } catch (error) {
    logger.error('Subscription check error:', error);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  }
}

module.exports = {
  authenticate,
  requireSubscription
};