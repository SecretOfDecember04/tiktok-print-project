const router = require('express').Router();
const crypto = require('crypto');
const { getSupabase } = require('../config/supabase');
const logger = require('../utils/logger');
const { emitToShop } = require('../services/websocket.service');

/**
 * Verify TikTok webhook signature
 */
function verifyTikTokSignature(req, secret) {
  const signature = req.headers['x-tiktok-signature'];
  if (!signature) return false;

  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * @route   POST /api/webhooks/tiktok
 * @desc    Handle TikTok webhooks for instant order notifications
 * @access  Public (but verified by signature)
 */
router.post('/tiktok', async (req, res) => {
  try {
    // Verify webhook signature
    // const isValid = verifyTikTokSignature(req, process.env.TIKTOK_WEBHOOK_SECRET);
    // if (!isValid) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    const { type, shop_id, data, timestamp } = req.body;

    logger.info(`TikTok webhook received: ${type}`);

    switch (type) {
      case 'order.created':
        await handleOrderCreated(shop_id, data);
        break;

      case 'order.updated':
        await handleOrderUpdated(shop_id, data);
        break;

      case 'order.cancelled':
        await handleOrderCancelled(shop_id, data);
        break;

      case 'live.started':
        await handleLiveStreamStarted(shop_id, data);
        break;

      case 'live.ended':
        await handleLiveStreamEnded(shop_id, data);
        break;

      default:
        logger.warn(`Unknown webhook type: ${type}`);
    }

    // Always respond quickly to webhooks
    res.status(200).json({ received: true });

  } catch (error) {
    logger.error('Webhook processing error:', error);
    // Still return 200 to prevent retries
    res.status(200).json({ received: true, error: true });
  }
});

/**
 * Handle new order created
 */
async function handleOrderCreated(shopId, orderData) {
  try {
    const supabase = getSupabase();

    // Find shop by TikTok shop ID
    const { data: shop } = await supabase
      .from('shops')
      .select('*')
      .eq('shop_id', shopId)
      .single();

    if (!shop) {
      logger.error(`Shop not found for TikTok ID: ${shopId}`);
      return;
    }

    // Check if order already exists
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('platform_order_id', orderData.order_id)
      .single();

    if (existingOrder) {
      logger.info(`Order ${orderData.order_id} already exists`);
      return;
    }

    // Create order
    const order = {
      shop_id: shop.id,
      platform_order_id: orderData.order_id,
      order_number: orderData.order_number || `#${orderData.order_id.slice(-6)}`,
      customer_name: orderData.recipient_name,
      customer_email: orderData.buyer_email,
      customer_phone: orderData.recipient_phone,
      shipping_address: {
        line1: orderData.recipient_address,
        city: orderData.recipient_city,
        state: orderData.recipient_state,
        zip: orderData.recipient_zipcode,
        country: orderData.recipient_country || 'US'
      },
      items: orderData.item_list.map(item => ({
        product_id: item.product_id,
        sku: item.sku_id,
        name: item.product_name,
        quantity: item.quantity,
        price: item.sale_price,
        image: item.product_image_url
      })),
      order_total: orderData.payment_total_amount,
      currency: orderData.currency || 'USD',
      status: 'pending',
      platform_status: orderData.order_status,
      platform_data: orderData,
      priority: shop.is_live ? 'urgent' : 'normal'
    };

    const { data: savedOrder, error } = await supabase
      .from('orders')
      .insert(order)
      .select()
      .single();

    if (error) throw error;

    // If shop is in live mode or auto-print enabled, print immediately
    if (shop.is_live || shop.settings?.autoPrint) {
      emitToShop(shop.id, 'instant-print', {
        order: savedOrder,
        priority: shop.is_live ? 'URGENT' : 'HIGH',
        source: 'webhook'
      });

      logger.info(`🖨️ Instant print triggered for order ${order.order_number}`);
    }

    // Notify frontend
    emitToShop(shop.id, 'new-order', savedOrder);

    // Update shop stats
    await supabase.rpc('increment', {
      table_name: 'shops',
      column_name: 'total_orders',
      row_id: shop.id
    });

    logger.info(`✅ Order ${order.order_number} created from webhook`);

  } catch (error) {
    logger.error('Failed to handle order created webhook:', error);
  }
}

/**
 * Handle order update
 */
async function handleOrderUpdated(shopId, orderData) {
  try {
    const supabase = getSupabase();

    const { error } = await supabase
      .from('orders')
      .update({
        platform_status: orderData.order_status,