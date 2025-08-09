const { syncFirebaseUser } = require('../services/auth.service');

async function register(req, res) {
  const { fullName } = req.body;
  const { uid, email } = req.user;

  try {
    const user = await syncFirebaseUser({ uid, email, fullName });
    res.status(201).json({ message: 'user synced', user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

module.exports = { register };