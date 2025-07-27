const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
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
 * @route   POST /api/orders/:id/print
 * @desc    Mark order as printed
 * @access  Private
 */
router.post('/:id/print', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    // Update order status
    const { data: order, error } = await supabase
      .from('orders')
      .update({
        status: 'printed',
        print_status: 'printed',
        printed_at: new Date().toISOString(),
        printed_by: req.user.email
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    logger.info(`Order printed: ${id}`);
    res.json(order);
  } catch (error) {
    logger.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

module.exports = router;