const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const { getSupabase } = require('../config/supabase');
const { emitToShop } = require('./websocket.service');
const notifier = require('node-notifier');

class TikTokLiveService extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // shopId -> WebSocket connection
    this.reconnectAttempts = new Map();
  }

  /**
   * Connect to TikTok Live Stream
   */
  async connectToLiveStream(shopId, streamId, credentials) {
    try {
      logger.info(`Connecting to TikTok live stream: ${streamId}`);

      // Close existing connection if any
      this.disconnectFromLiveStream(shopId);

      // TikTok Live WebSocket endpoint (this is a simulation - real endpoint would be different)
      const wsUrl = `wss://live-api.tiktokglobalshop.com/live/v1/stream/${streamId}`;

      const ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'X-Shop-Id': credentials.shopId,
          'X-App-Key': credentials.appKey
        }
      });

      ws.on('open', () => {
        logger.info(`Connected to live stream for shop ${shopId}`);
        this.connections.set(shopId, ws);
        this.reconnectAttempts.set(shopId, 0);

        // Send authentication
        ws.send(JSON.stringify({
          type: 'auth',
          data: {
            shopId: credentials.shopId,
            appKey: credentials.appKey,
            timestamp: Date.now()
          }
        }));

        // Notify frontend
        emitToShop(shopId, 'live-stream-connected', { streamId });
      });

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleLiveStreamMessage(shopId, message);
        } catch (error) {
          logger.error('Error parsing live stream message:', error);
        }
      });

      ws.on('error', (error) => {
        logger.error(`Live stream error for shop ${shopId}:`, error);
        emitToShop(shopId, 'live-stream-error', { error: error.message });
      });

      ws.on('close', () => {
        logger.info(`Disconnected from live stream for shop ${shopId}`);
        this.connections.delete(shopId);

        // Attempt reconnection
        this.attemptReconnect(shopId, streamId, credentials);
      });

    } catch (error) {
      logger.error('Failed to connect to live stream:', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages from TikTok Live Stream
   */
  async handleLiveStreamMessage(shopId, message) {
    const { type, data } = message;

    switch (type) {
      case 'order_created':
        await this.handleInstantOrder(shopId, data);
        break;

      case 'viewer_joined':
        emitToShop(shopId, 'viewer-joined', data);
        break;

      case 'comment':
        emitToShop(shopId, 'live-comment', data);
        break;

      case 'product_clicked':
        emitToShop(shopId, 'product-interest', data);
        break;

      case 'stream_stats':
        emitToShop(shopId, 'stream-stats', data);
        break;

      default:
        logger.debug(`Unknown live stream message type: ${type}`);
    }
  }

  /**
   * Handle instant order from live stream
   */
  async handleInstantOrder(shopId, orderData) {
    try {
      logger.info(`📦 INSTANT ORDER from live stream: ${orderData.order_id}`);

      const supabase = getSupabase();

      // Transform TikTok order data to our format
      const order = {
        shop_id: shopId,
        platform_order_id: orderData.order_id,
        order_number: orderData.order_number || `#${orderData.order_id.slice(-6)}`,
        customer_name: orderData.buyer_info.name,
        customer_email: orderData.buyer_info.email || null,
        customer_phone: orderData.buyer_info.phone || null,
        shipping_address: {
          line1: orderData.shipping_address.address_line_1,
          line2: orderData.shipping_address.address_line_2,
          city: orderData.shipping_address.city,
          state: orderData.shipping_address.state,
          zip: orderData.shipping_address.postal_code,
          country: orderData.shipping_address.country || 'US'
        },
        items: orderData.items.map(item => ({
          product_id: item.product_id,
          sku: item.sku_id,
          name: item.product_name,
          quantity: item.quantity,
          price: item.price,
          image: item.product_image
        })),
        order_total: orderData.total_amount,
        currency: orderData.currency || 'USD',
        status: 'pending',
        platform_status: orderData.order_status,
        platform_data: orderData,
        priority: 'urgent' // Live orders are always urgent
      };

      // Save to database
      const { data: savedOrder, error } = await supabase
        .from('orders')
        .insert(order)
        .select()
        .single();

      if (error) throw error;

      // Get shop settings
      const { data: shop } = await supabase
        .from('shops')
        .select('settings')
        .eq('id', shopId)
        .single();

      // Send instant print command if enabled
      if (shop?.settings?.instantPrint) {
        emitToShop(shopId, 'instant-print', {
          order: savedOrder,
          priority: 'URGENT',
          source: 'live_stream'
        });

        // Desktop notification
        notifier.notify({
          title: '🔴 LIVE ORDER!',
          message: `Order ${order.order_number} from ${order.customer_name}`,
          sound: true,
          wait: false
        });
      }

      // Emit to frontend
      emitToShop(shopId, 'live-order-received', savedOrder);

      // Update shop stats
      await supabase.rpc('increment_shop_orders', { shop_id: shopId });

      logger.info(`✅ Live order ${order.order_number} processed and sent to printer`);

    } catch (error) {
      logger.error('Failed to process instant order:', error);
      emitToShop(shopId, 'order-error', { error: error.message });
    }
  }

  /**
   * Disconnect from live stream
   */
  disconnectFromLiveStream(shopId) {
    const ws = this.connections.get(shopId);
    if (ws) {
      ws.close();
      this.connections.delete(shopId);
      logger.info(`Disconnected from live stream for shop ${shopId}`);
    }
  }

  /**
   * Attempt to reconnect to live stream
   */
  async attemptReconnect(shopId, streamId, credentials) {
    const attempts = this.reconnectAttempts.get(shopId) || 0;

    if (attempts < 5) {
      const delay = Math.min(1000 * Math.pow(2, attempts), 30000); // Exponential backoff

      logger.info(`Attempting to reconnect to live stream in ${delay}ms...`);

      setTimeout(() => {
        this.reconnectAttempts.set(shopId, attempts + 1);
        this.connectToLiveStream(shopId, streamId, credentials);
      }, delay);
    } else {
      logger.error(`Failed to reconnect to live stream after 5 attempts`);
      emitToShop(shopId, 'live-stream-failed', {
        error: 'Connection lost. Please restart live mode.'
      });
    }
  }

  /**
   * Get live stream status
   */
  isConnected(shopId) {
    return this.connections.has(shopId);
  }

  /**
   * Get all active connections
   */
  getActiveConnections() {
    return Array.from(this.connections.keys());
  }
}

// Export singleton instance
module.exports = new TikTokLiveService();