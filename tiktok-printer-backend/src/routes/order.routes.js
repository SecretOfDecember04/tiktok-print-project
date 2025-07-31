const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
const OrderService = require('../services/order.service');
const { pollShopOrdersManually } = require('../workers/orderPoller');
const logger = require('../utils/logger');

/**
 * @route   GET /api/orders
 * @desc    Get orders for user's shops
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const { status, shopId, limit = 50, offset = 0 } = req.query;
    const supabase = getSupabase();

    // Get user's Supabase ID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's shop IDs
    const { data: shops } = await supabase
      .from('shops')
      .select('id')
      .eq('user_id', user.id);

    const shopIds = shops.map(shop => shop.id);

    // Build query
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .in('shop_id', shopIds);

    // Apply filters
    if (status) query = query.eq('status', status);
    if (shopId) query = query.eq('shop_id', shopId);

    // Apply pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: orders, error, count } = await query;

    if (error) throw error;

    res.json({
      orders: orders || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    logger.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * @route   GET /api/orders/shop/:shopId
 * @desc    Get orders for a specific shop
 * @access  Private
 */
router.get('/shop/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const { status, priority, limit } = req.query;
    
    const filters = {
      status,
      priority,
      limit: limit ? parseInt(limit) : undefined
    };

    const orders = await OrderService.getOrdersByShop(shopId, filters);
    res.json(orders);
  } catch (error) {
    logger.error('Error fetching shop orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * @route   POST /api/orders/sync/:shopId
 * @desc    Manually sync orders from TikTok
 * @access  Private
 */
router.post('/sync/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    
    // Verify shop belongs to user
    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('id', shopId)
      .eq('user_id', user.id)
      .single();

    if (!shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Sync orders
    const result = await pollShopOrdersManually(shopId);
    res.json(result);
  } catch (error) {
    logger.error('Error syncing orders:', error);
    res.status(500).json({ error: 'Failed to sync orders' });
  }
});

/**
 * @route   GET /api/orders/stats/:shopId
 * @desc    Get order statistics for a shop
 * @access  Private
 */
router.get('/stats/:shopId', async (req, res) => {
  try {
    const { shopId } = req.params;
    const stats = await OrderService.getOrderStats(shopId);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch order stats' });
  }
});

/**
 * @route   POST /api/orders/:id/print
 * @desc    Mark order as printed
 * @access  Private
 */
router.post('/:id/print', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's Supabase ID for verification
    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const order = await OrderService.markAsPrinted(id, user.id);
    res.json(order);
  } catch (error) {
    logger.error('Error marking order as printed:', error);
    res.status(500).json({ error: 'Failed to mark order as printed' });
  }
});

/**
 * @route   PUT /api/orders/:id/status
 * @desc    Update order status
 * @access  Private
 */
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Get user's Supabase ID for verification
    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const order = await OrderService.updateOrderStatus(id, status, user.id);
    res.json(order);
  } catch (error) {
    logger.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router;