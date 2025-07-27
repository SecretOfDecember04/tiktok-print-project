const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
const logger = require('../utils/logger');
const tiktokLiveService = require('../services/tiktokLive.service');

/**
 * @route   GET /api/shops
 * @desc    Get all user's shops
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabase();

    // First get user's Supabase ID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's shops
    const { data: shops, error } = await supabase
      .from('shops')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Add live status
    const shopsWithLiveStatus = shops.map(shop => ({
      ...shop,
      is_live_connected: tiktokLiveService.isConnected(shop.id)
    }));

    res.json(shopsWithLiveStatus || []);
  } catch (error) {
    logger.error('Error fetching shops:', error);
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

/**
 * @route   POST /api/shops
 * @desc    Connect a new shop
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { platform, shopName, credentials } = req.body;

    // Validate input
    if (!platform || !shopName || !credentials) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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

    // TODO: Test TikTok credentials before saving
    // const tiktokService = new TikTokService(credentials);
    // await tiktokService.testConnection();

    // Create shop
    const { data: shop, error } = await supabase
      .from('shops')
      .insert({
        user_id: user.id,
        platform,
        shop_name: shopName,
        shop_id: credentials.shopId,
        credentials: credentials // Will be encrypted by model
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`New shop connected: ${shopName}`);
    res.status(201).json(shop);
  } catch (error) {
    logger.error('Error connecting shop:', error);
    res.status(500).json({ error: 'Failed to connect shop' });
  }
});

/**
 * @route   POST /api/shops/:id/live/start
 * @desc    Start live mode for a shop
 * @access  Private
 */
router.post('/:id/live/start', async (req, res) => {
  try {
    const { id } = req.params;
    const { streamId } = req.body;

    if (!streamId) {
      return res.status(400).json({ error: 'Stream ID is required' });
    }

    const supabase = getSupabase();

    // Get shop with credentials
    const { data: shop, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !shop) {
      return res.status(404).json({ error: 'Shop not found' });
    }

    // Update shop to live mode
    await supabase
      .from('shops')
      .update({
        is_live: true,
        live_stream_id: streamId,
        settings: {
          ...shop.settings,
          liveMode: true,
          instantPrint: true
        }
      })
      .eq('id', id);

    // Connect to TikTok Live Stream
    await tiktokLiveService.connectToLiveStream(id, streamId, shop.credentials);

    logger.info(`Live mode started for shop ${id}`);
    res.json({
      message: 'Live mode activated',
      streamId,
      status: 'connected'
    });

  } catch (error) {
    logger.error('Error starting live mode:', error);
    res.status(500).json({ error: 'Failed to start live mode' });
  }
});

/**
 * @route   POST /api/shops/:id/live/stop
 * @desc    Stop live mode for a shop
 * @access  Private
 */
router.post('/:id/live/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    // Update shop to normal mode
    await supabase
      .from('shops')
      .update({
        is_live: false,
        live_stream_id: null,
        settings: {
          ...shop.settings,
          liveMode: false
        }
      })
      .eq('id', id);

    // Disconnect from live stream
    tiktokLiveService.disconnectFromLiveStream(id);

    logger.info(`Live mode stopped for shop ${id}`);
    res.json({
      message: 'Live mode deactivated',
      status: 'disconnected'
    });

  } catch (error) {
    logger.error('Error stopping live mode:', error);
    res.status(500).json({ error: 'Failed to stop live mode' });
  }
});

/**
 * @route   GET /api/shops/:id/live/status
 * @desc    Get live stream status
 * @access  Private
 */
router.get('/:id/live/status', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    const { data: shop } = await supabase
      .from('shops')
      .select('is_live, live_stream_id, settings')
      .eq('id', id)
      .single();

    const isConnected = tiktokLiveService.isConnected(id);

    res.json({
      isLive: shop?.is_live || false,
      streamId: shop?.live_stream_id,
      isConnected,
      instantPrint: shop?.settings?.instantPrint || false
    });

  } catch (error) {
    logger.error('Error getting live status:', error);
    res.status(500).json({ error: 'Failed to get live status' });
  }
});

module.exports = router;