const { getSupabase } = require('../config/supabase');
const OrderService = require('../services/order.service');
const QueueService = require('../services/queue.service');
const { emitToShop } = require('../services/websocket.service');
const logger = require('../utils/logger');

class OrderController {
  /**
   * Get all orders for user's shops
   */
  static async getOrders(req, res) {
    try {
      const { page = 1, limit = 50, status, shopId, priority } = req.query;
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
      if (priority) {
        query = query.eq('priority', priority);
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
  }

  /**
   * Get single order details
   */
  static async getOrderById(req, res) {
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

      // Get order with shop info and print history
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

      // Get print history for this order
      const { data: printHistory } = await supabase
        .from('print_queue')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      res.json({ 
        order: {
          ...order,
          printHistory: printHistory || []
        }
      });

    } catch (error) {
      logger.error('Fetch order error:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }

  /**
   * Update order status
   */
  static async updateOrderStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { status, printedAt, notes } = req.body;
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

      // Use order service to update status
      const updatedOrder = await OrderService.updateOrderStatus(orderId, status, user.id);

      // Add notes if provided
      if (notes) {
        await supabase
          .from('orders')
          .update({
            notes: notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId);
      }

      // Emit real-time update
      emitToShop(updatedOrder.shop_id, 'order-updated', updatedOrder);

      res.json({
        message: 'Order status updated',
        order: updatedOrder
      });

    } catch (error) {
      logger.error('Update order status error:', error);
      res.status(500).json({ error: 'Failed to update order status' });
    }
  }

  /**
   * Send order to print queue
   */
  static async printOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { templateId, printerId, priority = 'normal', copies = 1 } = req.body;
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

      const printJobs = [];

      // Create print jobs based on number of copies
      for (let i = 0; i < copies; i++) {
        const printJob = await QueueService.addPrintJob({
          orderId,
          userId: user.id,
          shopId: order.shop_id,
          templateId,
          printerId,
          priority,
          data: {
            orderNumber: order.order_number,
            customerName: order.customer_name,
            customerEmail: order.customer_email,
            customerPhone: order.customer_phone,
            shippingAddress: order.shipping_address,
            items: order.items,
            orderTotal: order.order_total,
            currency: order.currency,
            platformData: order.platform_data,
            copyNumber: i + 1,
            totalCopies: copies
          }
        });

        printJobs.push(printJob);
      }

      // Update order print status
      await supabase
        .from('orders')
        .update({
          status: 'queued',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      res.json({
        message: `Order queued for printing (${copies} ${copies === 1 ? 'copy' : 'copies'})`,
        printJobs: printJobs
      });

    } catch (error) {
      logger.error('Print order error:', error);
      res.status(500).json({ error: 'Failed to print order' });
    }
  }

  /**
   * Bulk print orders
   */
  static async bulkPrintOrders(req, res) {
    try {
      const { orderIds, templateId, printerId, priority = 'normal' } = req.body;
      const supabase = getSupabase();

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: 'Order IDs array is required' });
      }

      if (orderIds.length > 50) {
        return res.status(400).json({ error: 'Maximum 50 orders can be printed at once' });
      }

      // Get user
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('firebase_uid', req.user.uid)
        .single();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get all orders
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          *,
          shops!inner(
            id,
            shop_name,
            user_id
          )
        `)
        .in('id', orderIds)
        .eq('shops.user_id', user.id);

      if (error) throw error;

      if (orders.length !== orderIds.length) {
        return res.status(400).json({ 
          error: 'Some orders not found or do not belong to user' 
        });
      }

      const printJobs = [];
      const updatedOrders = [];

      // Create print jobs for each order
      for (const order of orders) {
        try {
          const printJob = await QueueService.addPrintJob({
            orderId: order.id,
            userId: user.id,
            shopId: order.shop_id,
            templateId,
            printerId,
            priority,
            data: {
              orderNumber: order.order_number,
              customerName: order.customer_name,
              customerEmail: order.customer_email,
              customerPhone: order.customer_phone,
              shippingAddress: order.shipping_address,
              items: order.items,
              orderTotal: order.order_total,
              currency: order.currency,
              platformData: order.platform_data,
              isBulkPrint: true
            }
          });

          printJobs.push(printJob);

          // Update order status
          await supabase
            .from('orders')
            .update({
              status: 'queued',
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id);

          updatedOrders.push(order);

        } catch (jobError) {
          logger.error(`Failed to create print job for order ${order.id}:`, jobError);
        }
      }

      res.json({
        message: `${printJobs.length} orders queued for printing`,
        printJobs: printJobs,
        successCount: printJobs.length,
        totalRequested: orderIds.length
      });

    } catch (error) {
      logger.error('Bulk print error:', error);
      res.status(500).json({ error: 'Failed to bulk print orders' });
    }
  }

  /**
   * Get order statistics
   */
  static async getOrderStats(req, res) {
    try {
      const { shopId, timeframe = '7d' } = req.query;
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

      // Calculate date range
      let startDate = new Date();
      switch (timeframe) {
        case '1d':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Build stats query
      let statsQuery = supabase
        .from('orders')
        .select(`
          status,
          priority,
          created_at,
          order_total,
          shops!inner(user_id)
        `)
        .eq('shops.user_id', user.id)
        .gte('created_at', startDate.toISOString());

      if (shopId) {
        statsQuery = statsQuery.eq('shop_id', shopId);
      }

      const { data: orders, error } = await statsQuery;

      if (error) throw error;

      // Calculate statistics
      const stats = {
        total: orders.length,
        byStatus: {},
        byPriority: {},
        totalValue: 0,
        averageValue: 0,
        recentTrend: []
      };

      orders.forEach(order => {
        // Status counts
        stats.byStatus[order.status] = (stats.byStatus[order.status] || 0) + 1;
        
        // Priority counts
        stats.byPriority[order.priority] = (stats.byPriority[order.priority] || 0) + 1;
        
        // Value calculations
        const orderValue = parseFloat(order.order_total) || 0;
        stats.totalValue += orderValue;
      });

      stats.averageValue = stats.total > 0 ? stats.totalValue / stats.total : 0;

      // Get daily breakdown for trend
      const dailyBreakdown = {};
      orders.forEach(order => {
        const date = order.created_at.split('T')[0];
        dailyBreakdown[date] = (dailyBreakdown[date] || 0) + 1;
      });

      stats.recentTrend = Object.entries(dailyBreakdown)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json(stats);

    } catch (error) {
      logger.error('Get order stats error:', error);
      res.status(500).json({ error: 'Failed to get order statistics' });
    }
  }

  /**
   * Cancel pending order
   */
  static async cancelOrder(req, res) {
    try {
      const { orderId } = req.params;
      const { reason } = req.body;
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

      // Cancel any pending print jobs for this order
      await supabase
        .from('print_queue')
        .update({
          status: 'cancelled',
          error_message: reason || 'Order cancelled by user',
          updated_at: new Date().toISOString()
        })
        .eq('order_id', orderId)
        .in('status', ['pending', 'retrying']);

      // Update order status
      const updatedOrder = await OrderService.updateOrderStatus(orderId, 'cancelled', user.id);

      // Add cancellation reason
      if (reason) {
        await supabase
          .from('orders')
          .update({
            cancel_reason: reason,
            cancelled_at: new Date().toISOString()
          })
          .eq('id', orderId);
      }

      res.json({
        message: 'Order cancelled successfully',
        order: updatedOrder
      });

    } catch (error) {
      logger.error('Cancel order error:', error);
      res.status(500).json({ error: 'Failed to cancel order' });
    }
  }
}

module.exports = OrderController;
