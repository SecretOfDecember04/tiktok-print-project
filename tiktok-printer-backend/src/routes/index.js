const router = require('express').Router();

// Import route modules
const authRoutes = require('./auth.routes');
const shopRoutes = require('./shop.routes');
const orderRoutes = require('./order.routes');
const templateRoutes = require('./template.routes');
const webhookRoutes = require('./webhook.routes');
const printerRoutes = require('./printer.routes');
const fulfillmentRoutes = require('./fulfillment.routes');
const printHistoryRoutes = require('./printHistory.routes');

// Public routes
router.use('/auth', authRoutes);

// Webhook routes (public but verified by signature)
router.use('/webhooks', webhookRoutes);

// TikTok OAuth callback is public (verified by state)
router.use('/shops/callback/tiktok', shopRoutes);

// Protected routes (all routes below require authentication)
const { authenticate } = require('../middleware/auth.middleware');

router.use('/shops', authenticate, shopRoutes);
router.use('/orders', authenticate, orderRoutes);
router.use('/templates', authenticate, templateRoutes);
router.use('/printers', authenticate, printerRoutes);
router.use('/fulfillment', authenticate, fulfillmentRoutes);
router.use('/print-history', authenticate, printHistoryRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TikTok Printer API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      shops: '/api/shops',
      orders: '/api/orders',
      templates: '/api/templates',
      printers: '/api/printers',
      fulfillment: '/api/fulfillment',
      printHistory: '/api/print-history',
      webhooks: '/api/webhooks'
    }
  });
});

module.exports = router;