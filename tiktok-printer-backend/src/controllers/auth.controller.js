const authService = require('../services/auth.service.js');
const jwt = require('jsonwebtoken');

async function register(req, res) {
  const { email, password, fullName } = req.body;
  try {
    const user = await authService.registerUser({ email, password, fullName });
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });
    res.status(201).json({ token });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  try {
    const user = await authService.loginUser({ email, password });
    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });
    res.status(200).json({ token });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

module.exports = {
  register,
  login,
};
