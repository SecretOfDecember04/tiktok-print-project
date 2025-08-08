// src/middleware/auth.middleware.js
const { getAuth } = require('../config/firebase');

async function authenticate(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'no token provided' });
    }
    const idToken = h.slice('Bearer '.length);

    try {
      const [headerB64] = idToken.split('.');
      const header = JSON.parse(Buffer.from(headerB64, 'base64').toString('utf8'));
      if (!header.kid) {
        return res.status(401).json({
          error: 'invalid token type',
          hint: 'This is not a Firebase ID token. Make sure to send user.getIdToken().',
        });
      }
    } catch (_) {
      // 忽略，交给 verifyIdToken 去报错
    }

    const decoded = await getAuth().verifyIdToken(idToken);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified,
    };
    next();
  } catch (err) {
    console.error('firebase auth error:', err.message);
    return res.status(401).json({ error: 'unauthorized' });
  }
}

module.exports = { authenticate };