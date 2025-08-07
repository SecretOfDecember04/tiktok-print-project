const router = require('express').Router();

// only keep auth and webhook
const authRoutes = require('./auth.routes');
const webhookRoutes = require('./webhook.routes');

// public routes
router.use('/auth', authRoutes);

// webhook routes
router.use('/webhooks', webhookRoutes);

// disable all other routes
// const shopRoutes = require('./shop.routes');
// const orderRoutes = require('./order.routes');
// const templateRoutes = require('./template.routes');
// const printerRoutes = require('./printer.routes');
// const fulfillmentRoutes = require('./fulfillment.routes');
// const printHistoryRoutes = require('./printHistory.routes');
// const { authenticate } = require('../middleware/auth.middleware');

// router.use('/shops/callback/tiktok', shopRoutes);
// router.use('/shops', authenticate, shopRoutes);
// router.use('/orders', authenticate, orderRoutes);
// router.use('/templates', authenticate, templateRoutes);
// router.use('/printers', authenticate, printerRoutes);
// router.use('/fulfillment', authenticate, fulfillmentRoutes);
// router.use('/print-history', authenticate, printHistoryRoutes);

router.get('/', (req, res) => {
  res.json({
    message: 'TikTok Printer API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      webhooks: '/api/webhooks'
    }
  });
});

module.exports = router;