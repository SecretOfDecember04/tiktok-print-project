const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { register } = require('../controllers/auth.controller');

router.post('/register', authenticate, register);

module.exports = router;