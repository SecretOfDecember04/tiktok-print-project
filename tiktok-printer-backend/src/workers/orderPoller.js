const cron = require('node-cron');
const { getSupabase } = require('../config/supabase');
const OrderService = require('../services/order.service');
const logger = require('../utils/logger');

let isPollerRunning = false;

/**
 * Start the order polling service
 * Runs every 2 minutes to fetch new orders from connected shops
 */
function startOrderPoller() {
  if (isPollerRunning) {
    logger.warn('Order poller is already running');
    return;
  }

  // Schedule order polling every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    await pollOrders();
  });

  // Also run immediately on startup
  setTimeout(() => {
    pollOrders();
  }, 5000); // Wait 5 seconds after startup

  isPollerRunning = true;
  logger.info('Order polling service started - running every 2 minutes');
}

/**
 * Poll orders from all active shops
 */
async function pollOrders() {
  try {
    logger.debug('Starting order polling cycle...');
    
    const supabase = getSupabase();

    // Get all active TikTok shops
    const { data: shops, error } = await supabase
      .from('shops')
      .select('id, shop_name, platform, status, last_sync_at')
      .eq('platform', 'tiktok')
      .eq('status', 'active');

    if (error) {
      throw error;
    }

    if (!shops || shops.length === 0) {
      logger.debug('No active shops found for polling');
      return;
    }

    logger.debug(`Polling orders for ${shops.length} shops`);

    const results = await Promise.allSettled(
      shops.map(shop => pollShopOrders(shop))
    );

    // Log results
    let successCount = 0;
    let errorCount = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
        logger.debug(`✅ Shop ${shops[index].shop_name}: ${result.value} new orders`);
      } else {
        errorCount++;
        logger.error(`❌ Shop ${shops[index].shop_name}: ${result.reason.message}`);
      }
    });

    logger.info(`Order polling completed: ${successCount} success, ${errorCount} errors`);

  } catch (error) {
    logger.error('Error in order polling cycle:', error);
  }
}

/**
 * Poll orders for a specific shop
 */
async function pollShopOrders(shop) {
  try {
    // Sync orders from TikTok
    const newOrders = await OrderService.syncOrdersFromTikTok(shop.id);

    // Update last sync time
    const supabase = getSupabase();
    await supabase
      .from('shops')
      .update({ 
        last_sync_at: new Date().toISOString() 
      })
      .eq('id', shop.id);

    return newOrders.length;
  } catch (error) {
    // Log error but don't throw to prevent stopping other shops
    logger.error(`Error polling orders for shop ${shop.shop_name}:`, error);
    throw error;
  }
}

/**
 * Poll orders for a specific shop manually (for testing)
 */
async function pollShopOrdersManually(shopId) {
  try {
    const supabase = getSupabase();
    
    const { data: shop, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .single();

    if (error || !shop) {
      throw new Error('Shop not found');
    }

    logger.info(`Manually polling orders for shop: ${shop.shop_name}`);
    const newOrderCount = await pollShopOrders(shop);
    
    return {
      success: true,
      shopName: shop.shop_name,
      newOrders: newOrderCount
    };
  } catch (error) {
    logger.error('Manual order polling failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Stop the order polling service
 */
function stopOrderPoller() {
  if (!isPollerRunning) {
    logger.warn('Order poller is not running');
    return;
  }

  // Note: node-cron doesn't provide a direct way to stop specific tasks
  // In production, you might want to use a more sophisticated job queue
  isPollerRunning = false;
  logger.info('Order polling service stopped');
}

/**
 * Get polling status
 */
function getPollerStatus() {
  return {
    isRunning: isPollerRunning,
    nextRun: isPollerRunning ? 'Every 2 minutes' : 'Not scheduled'
  };
}

module.exports = {
  startOrderPoller,
  stopOrderPoller,
  pollShopOrdersManually,
  getPollerStatus
};
