const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
const tiktokService = require('../services/tiktok.service');
const { webhookRateLimiter } = require('../middleware/rateLimiter.middleware');
const logger = require('../utils/logger');

/**
 * @route   POST /api/webhooks/tiktok/orders
 * @desc    Receive order notifications from TikTok
 * @access  Public (but verified by signature)
 */
router.post('/tiktok/orders', webhookRateLimiter, async (req, res) => {
  try {
    const signature = req.headers['x-tts-signature'];
    const timestamp = req.headers['x-tts-timestamp'];
    const body = req.body;

    // Verify webhook signature
    if (!tiktokService.verifyWebhookSignature(signature, timestamp, body)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process different event types
    const { event_type, data } = body;

    logger.info(`Webhook received: ${event_type}`, {
      orderId: data?.order_id,
      shopId: data?.shop_id
    });

    const supabase = getSupabase();

    switch (event_type) {
      case 'ORDER_CREATED':
      case 'PACKAGE_CREATED':
        await handleNewOrder(supabase, data);
        break;

      case 'ORDER_STATUS_CHANGED':
        await handleOrderStatusChange(supabase, data);
        break;

      case 'PACKAGE_SHIPPED':
        await handleOrderShipped(supabase, data);
        break;

      case 'ORDER_CANCELLED':
        await handleOrderCancelled(supabase, data);
        break;

      default:
        logger.info(`Unhandled webhook event: ${event_type}`);
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ success: true });

  } catch (error) {
    logger.error('Webhook processing error:', error);
    // Still return 200 to prevent retries
    res.status(200).json({ success: true });
  }
});

/**
 * Handle new order creation
 */
async function handleNewOrder(supabase, data) {
  try {
    const { order_id, shop_id } = data;

    // Get shop info
    const { data: shop } = await supabase
      .from('shops')
      .select('id, user_id, access_token')
      .eq('shop_id', shop_id)
      .single();

    if (!shop) {
      logger.error('Shop not found for webhook:', shop_id);
      return;
    }

    // Fetch full order details from TikTok API
    const orderDetails = await tiktokService.getOrderDetails(
      shop.access_token,
      shop_id,
      order_id
    );

    if (!orderDetails || !orderDetails.data) {
      logger.error('Failed to fetch order details:', order_id);
      return;
    }

    const order = orderDetails.data.order_list[0];

    // Save order to database
    const orderData = {
      shop_id: shop.id,
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
      print_status: 'pending',
      raw_data: order
    };

    const { data: newOrder, error } = await supabase
      .from('orders')
      .insert(orderData)
      .select()
      .single();

    if (error) {
      logger.error('Failed to save order:', error);
      return;
    }

    logger.info('New order saved:', newOrder.id);

    // Check if auto-print is enabled for this shop
    const { data: shopSettings } = await supabase
      .from('shop_settings')
      .select('auto_print, default_template_id, default_printer_id')
      .eq('shop_id', shop.id)
      .single();

    if (shopSettings?.auto_print) {
      // Add to print queue automatically
      const { data: printJob } = await supabase
        .from('print_queue')
        .insert({
          order_id: newOrder.id,
          user_id: shop.user_id,
          template_id: shopSettings.default_template_id,
          printer_id: shopSettings.default_printer_id,
          status: 'pending',
          data: {
            orderNumber: order.order_id,
            buyer: order.buyer_info?.name,
            address: order.recipient_address,
            items: order.item_list
          }
        })
        .select()
        .single();

      logger.info('Order added to print queue:', printJob.id);

      // Update order print status
      await supabase
        .from('orders')
        .update({ print_status: 'queued' })
        .eq('id', newOrder.id);
    }

    // Emit real-time event
    if (global.io) {
      global.io.to(`user-${shop.user_id}`).emit('new-order', {
        shopId: shop.id,
        order: newOrder,
        autoPrint: shopSettings?.auto_print || false
      });
    }

  } catch (error) {
    logger.error('Error handling new order:', error);
  }
}

/**
 * Handle order status change
 */
async function handleOrderStatusChange(supabase, data) {
  try {
    const { order_id, order_status, shop_id } = data;

    // Update order status
    const { error } = await supabase
      .from('orders')
      .update({
        status: order_status,
        updated_at: new Date()
      })
      .eq('order_id', order_id);

    if (error) {
      logger.error('Failed to update order status:', error);
      return;
    }

    logger.info(`Order ${order_id} status updated to ${order_status}`);

  } catch (error) {
    logger.error('Error handling status change:', error);
  }
}

/**
 * Handle order shipped
 */
async function handleOrderShipped(supabase, data) {
  try {
    const { order_id, tracking_number, shipping_provider } = data;

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        tracking_number: tracking_number,
        shipping_provider: shipping_provider,
        shipped_at: new Date(),
        updated_at: new Date()
      })
      .eq('order_id', order_id);

    if (error) {
      logger.error('Failed to update shipped order:', error);
      return;
    }

    logger.info(`Order ${order_id} marked as shipped`);

  } catch (error) {
    logger.error('Error handling order shipped:', error);
  }
}

/**
 * Handle order cancelled
 */
async function handleOrderCancelled(supabase, data) {
  try {
    const { order_id, cancel_reason } = data;

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancel_reason: cancel_reason,
        cancelled_at: new Date(),
        updated_at: new Date()
      })
      .eq('order_id', order_id);

    if (error) {
      logger.error('Failed to update cancelled order:', error);
      return;
    }

    logger.info(`Order ${order_id} cancelled`);

  } catch (error) {
    logger.error('Error handling order cancellation:', error);
  }
}

/**
 * @route   GET /api/webhooks/test
 * @desc    Test webhook endpoint
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    message: 'Webhook endpoint is working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;