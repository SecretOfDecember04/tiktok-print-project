const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { getSupabase } = require('../config/supabase');
const tiktokService = require('../services/tiktok.service');
const logger = require('../utils/logger');

/**
 * @route   GET /api/orders
 * @desc    Get all orders for user's shops
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, status, shopId } = req.query;
    const supabase = getSupabase();

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build query
    let query = supabase
      .from('orders')
      .select(`
        *,
        shops!inner(
          id,
          shop_name,
          user_id
        )
      `)
      .eq('shops.user_id', user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    // Apply filters
    if (shopId) {
      query = query.eq('shop_id', shopId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, error, count } = await query;

    if (error) throw error;

    res.json({
      orders: orders || [],
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    logger.error('Fetch orders error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});


router.get('/tiktok/live-orders', OrderController.fetchLiveTikTokOrders);


/**
 * @route   POST /api/orders/sync/:shopId
 * @desc    Manually sync orders from TikTok for a specific shop
 * @access  Private
 */
router.post('/sync/:shopId', authenticate, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { startDate, endDate } = req.body;
    const supabase = getSupabase();

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get shop with tokens
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .eq('user_id', user.id)
      .single();

    if (shopError || !shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Check if token needs refresh
    if (new Date(shop.token_expires_at) < new Date()) {
      logger.info('Token expired, refreshing...');

      try {
        const tokenData = await tiktokService.refreshToken(shop.refresh_token);

        // Update tokens
        await supabase
          .from('shops')
          .update({
            access_token: tokenData.data.access_token,
            refresh_token: tokenData.data.refresh_token,
            token_expires_at: new Date(Date.now() + tokenData.data.expires_in * 1000)
          })
          .eq('id', shopId);

        shop.access_token = tokenData.data.access_token;
      } catch (refreshError) {
        logger.error('Token refresh failed:', refreshError);
        return res.status(401).json({ error: 'Failed to refresh token' });
      }
    }

    // Fetch orders from TikTok
    const orderParams = {
      create_time_from: startDate || Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60, // Default: last 7 days
      create_time_to: endDate || Math.floor(Date.now() / 1000),
      page_size: 100
    };

    const ordersResponse = await tiktokService.getOrders(
      shop.access_token,
      shop.shop_id,
      orderParams
    );

    if (!ordersResponse || !ordersResponse.data || !ordersResponse.data.order_list) {
      return res.json({
        message: 'No orders found',
        ordersProcessed: 0
      });
    }

    // Process and save orders
    const orders = ordersResponse.data.order_list;
    let newOrders = 0;
    let updatedOrders = 0;

    for (const order of orders) {
      // Check if order exists
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, status')
        .eq('order_id', order.order_id)
        .single();

      const orderData = {
        shop_id: shopId,
        order_id: order.order_id,
        status: order.order_status,
        total_amount: order.payment_info?.total_amount || 0,
        currency: order.payment_info?.currency || 'USD',
        buyer_email: order.buyer_info?.email || null,
        buyer_name: order.buyer_info?.name || null,
        shipping_address: order.recipient_address || {},
        items: order.item_list || [],
        tracking_number: order.tracking_number || null,
        created_at: new Date(order.create_time * 1000),
        updated_at: new Date(order.update_time * 1000),
        raw_data: order
      };

      if (existingOrder) {
        // Update existing order
        await supabase
          .from('orders')
          .update(orderData)
          .eq('id', existingOrder.id);
        updatedOrders++;
      } else {
        // Insert new order
        const { error: insertError } = await supabase
          .from('orders')
          .insert(orderData);

        if (!insertError) {
          newOrders++;

          // Emit event for new order (for real-time updates)
          if (global.io) {
            global.io.to(`user-${user.id}`).emit('new-order', {
              shopId,
              order: orderData
            });
          }
        }
      }
    }

    res.json({
      message: 'Orders synced successfully',
      ordersProcessed: orders.length,
      newOrders,
      updatedOrders
    });

  } catch (error) {
    logger.error('Order sync error:', error);
    res.status(500).json({ error: 'Failed to sync orders' });
  }
});

/**
 * @route   GET /api/orders/:orderId
 * @desc    Get single order details
 * @access  Private
 */
router.get('/:orderId', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const supabase = getSupabase();

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get order with shop info
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        shops!inner(
          id,
          shop_name,
          user_id
        )
      `)
      .eq('id', orderId)
      .eq('shops.user_id', user.id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });

  } catch (error) {
    logger.error('Fetch order error:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * @route   PUT /api/orders/:orderId/status
 * @desc    Update order status (mark as printed, etc.)
 * @access  Private
 */
router.put('/:orderId/status', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, printedAt } = req.body;
    const supabase = getSupabase();

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify order belongs to user
    const { data: order } = await supabase
      .from('orders')
      .select(`
        id,
        shops!inner(user_id)
      `)
      .eq('id', orderId)
      .eq('shops.user_id', user.id)
      .single();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Update order
    const updateData = {
      status,
      updated_at: new Date()
    };

    if (printedAt) {
      updateData.printed_at = printedAt;
      updateData.print_status = 'printed';
    }

    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Order status updated',
      order: updatedOrder
    });

  } catch (error) {
    logger.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

/**
 * @route   POST /api/orders/:orderId/print
 * @desc    Send order to print queue
 * @access  Private
 */
router.post('/:orderId/print', authenticate, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { templateId, printerId } = req.body;
    const supabase = getSupabase();

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get order with full details
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        shops!inner(
          id,
          shop_name,
          user_id
        )
      `)
      .eq('id', orderId)
      .eq('shops.user_id', user.id)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Add to print queue
    const { data: printJob, error: printError } = await supabase
      .from('print_queue')
      .insert({
        order_id: orderId,
        user_id: user.id,
        template_id: templateId,
        printer_id: printerId,
        status: 'pending',
        data: {
          orderNumber: order.order_id,
          buyer: order.buyer_name,
          address: order.shipping_address,
          items: order.items
        }
      })
      .select()
      .single();

    if (printError) throw printError;

    // Emit print job to desktop app
    if (global.io) {
      global.io.to(`printer-${printerId}`).emit('new-print-job', printJob);
    }

    // Update order print status
    await supabase
      .from('orders')
      .update({
        print_status: 'queued',
        updated_at: new Date()
      })
      .eq('id', orderId);

    res.json({
      message: 'Order sent to print queue',
      printJob
    });

  } catch (error) {
    logger.error('Print order error:', error);
    res.status(500).json({ error: 'Failed to print order' });
  }
});

module.exports = router;