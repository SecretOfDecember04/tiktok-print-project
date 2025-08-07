const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'no token provided' });
    }

    const token = authHeader.split('Bearer ')[1];

    // verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'invalid or expired token' });
    }

    // attach user info to request
    req.user = user;
    next();
  } catch (error) {
    console.error('auth middleware error:', error.message);
    return res.status(500).json({ error: 'internal auth error' });
  }
}

module.exports = {
  authenticate
};