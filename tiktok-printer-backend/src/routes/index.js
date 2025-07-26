const router = require('express').Router();

// Import route modules
const authRoutes = require('./auth.routes');
const shopRoutes = require('./shop.routes');
const orderRoutes = require('./order.routes');
const templateRoutes = require('./template.routes');

// Public routes
router.use('/auth', authRoutes);

// Protected routes (all routes below require authentication)
const { authenticate } = require('../middleware/auth.middleware');

router.use('/shops', authenticate, shopRoutes);
router.use('/orders', authenticate, orderRoutes);
router.use('/templates', authenticate, templateRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'TikTok Printer API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      shops: '/api/shops',
      orders: '/api/orders',
      templates: '/api/templates'
    }
  });
});

module.exports = router;