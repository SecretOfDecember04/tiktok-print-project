// src/routes/webhook.routes.js

const router = require('express').Router();
const logger = require('../utils/logger');

/**
 * @route   POST /api/webhooks/tiktok/orders
 * @desc    Receive order notifications from TikTok (minimal version)
 * @access  Public
 */
router.post('/tiktok/orders', (req, res) => {
  try {
    logger.info('Received TikTok webhook:', req.body);

    // just echo back the received body for now
    res.status(200).json({
      message: 'Webhook received (minimal)',
      received: req.body
    });
  } catch (error) {
    logger.error('Error in minimal webhook handler:', error);
    res.status(200).json({ message: 'Webhook error', error: error.message });
  }
});

/**
 * @route   GET /api/webhooks/test
 * @desc    Test webhook endpoint
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhook test OK',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;