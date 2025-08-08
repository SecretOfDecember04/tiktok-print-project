const { getSupabase } = require('../config/supabase');
const TikTokService = require('./tiktok.service');
const logger = require('../utils/logger');

class OrderService {
  /**
   * Get orders for a specific shop
   */
  static async getOrdersByShop(shopId, filters = {}) {
    try {
      const supabase = getSupabase();
      
      let query = supabase
        .from('orders')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data: orders, error } = await query;
      if (error) throw error;

      return orders;
    } catch (error) {
      logger.error('Error fetching orders:', error);
      throw error;
    }
  }

  static async getLiveOrdersFromTikTok(shopId) {
    const supabase = getSupabase();

    // fetch shop credentials
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single();

    if (shopError || !shop) {
      throw new Error('shop not found');
    }

    // init TikTok service
    const tiktokService = new TikTokService({
      accessToken: shop.credentials.access_token,
      shopId: shop.shop_id
    });

    // fetch orders from TikTok
    const orders = await tiktokService.getOrders({
      page_size: 20,
      sort_field: 'create_time',
      sort_order: 'DESC'
    });

    return orders;
  }

  /**
   * Fetch orders from TikTok API and sync to database
   */
  static async syncOrdersFromTikTok(shopId) {
    try {
      const supabase = getSupabase();

      // Get shop credentials
      const { data: shop, error: shopError } = await supabase
        .from('shops')
        .select('*')
        .eq('id', shopId)
        .single();

      if (shopError || !shop) {
        throw new Error('Shop not found');
      }

      // Initialize TikTok service
      const tiktokService = new TikTokService({
        accessToken: shop.credentials.access_token,
        shopId: shop.shop_id
      });

      // Fetch orders from TikTok (last 30 days)
      const orders = await tiktokService.getOrders({
        page_size: 50,
        sort_field: 'create_time',
        sort_order: 'DESC'
      });

      const syncedOrders = [];

      for (const orderData of orders) {
        // Check if order already exists
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('id')
          .eq('platform_order_id', orderData.order_id)
          .single();

        if (existingOrder) {
          continue; // Skip existing orders
        }

        // Create new order
        const order = {
          shop_id: shop.id,
          platform_order_id: orderData.order_id,
          order_number: orderData.order_number || `#${orderData.order_id.slice(-6)}`,
          customer_name: orderData.recipient_address?.name,
          customer_email: orderData.buyer_email,
          customer_phone: orderData.recipient_address?.phone_number,
          shipping_address: {
            line1: orderData.recipient_address?.address_line1,
            line2: orderData.recipient_address?.address_line2,
            city: orderData.recipient_address?.city,
            state: orderData.recipient_address?.state,
            zip: orderData.recipient_address?.zipcode,
            country: orderData.recipient_address?.country_code || 'US'
          },
          items: orderData.order_line_list?.map((item) => ({
            product_id: item.product_id,
            sku: item.sku_id,
            name: item.product_name,
            quantity: item.quantity,
            price: item.platform_total_price,
            image: item.sku_image
          })) || [],
          order_total: orderData.payment?.total_amount,
          currency: orderData.payment?.currency || 'USD',
          status: 'pending',
          platform_status: orderData.order_status,
          platform_data: orderData,
          priority: 'normal'
        };

        const { data: savedOrder, error } = await supabase
          .from('orders')
          .insert(order)
          .select()
          .single();

        if (error) {
          logger.error('Error saving order:', error);
          continue;
        }

        syncedOrders.push(savedOrder);
      }

      logger.info(`Synced ${syncedOrders.length} new orders for shop ${shopId}`);
      return syncedOrders;
    } catch (error) {
      logger.error('Error syncing orders from TikTok:', error);
      throw error;
    }
  }

  /**
   * Update order status
   */
  static async updateOrderStatus(orderId, status, userId) {
    try {
      const supabase = getSupabase();

      // Verify order belongs to user
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('*, shop:shops!inner(user_id)')
        .eq('id', orderId)
        .eq('shop.user_id', userId)
        .single();

      if (fetchError || !order) {
        throw new Error('Order not found');
      }

      // Update order
      const { data: updatedOrder, error } = await supabase
        .from('orders')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      logger.info(`Order ${orderId} status updated to ${status}`);
      return updatedOrder;
    } catch (error) {
      logger.error('Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Mark order as printed
   */
  static async markAsPrinted(orderId, userId) {
    try {
      const supabase = getSupabase();

      const { data: updatedOrder, error } = await supabase
        .from('orders')
        .update({ 
          status: 'printed',
          printed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .select('*, shop:shops!inner(user_id)')
        .eq('shop.user_id', userId)
        .single();

      if (error) throw error;

      logger.info(`Order ${orderId} marked as printed`);
      return updatedOrder;
    } catch (error) {
      logger.error('Error marking order as printed:', error);
      throw error;
    }
  }

  /**
   * Get order statistics for a shop
   */
  static async getOrderStats(shopId) {
    try {
      const supabase = getSupabase();

      // Get counts by status
      const { data: stats, error } = await supabase
        .from('orders')
        .select('status')
        .eq('shop_id', shopId);

      if (error) throw error;

      const statusCounts = stats.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});

      // Get today's orders
      const today = new Date().toISOString().split('T')[0];
      const { count: todayCount } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .gte('created_at', `${today}T00:00:00.000Z`);

      return {
        total: stats.length,
        today: todayCount || 0,
        pending: statusCounts.pending || 0,
        printed: statusCounts.printed || 0,
        shipped: statusCounts.shipped || 0,
        cancelled: statusCounts.cancelled || 0
      };
    } catch (error) {
      logger.error('Error getting order stats:', error);
      throw error;
    }
  }
}

module.exports = OrderService;
