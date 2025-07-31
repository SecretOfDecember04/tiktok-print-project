const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { getSupabase } = require('../config/supabase');
const tiktokService = require('../services/tiktok.service');
const logger = require('../utils/logger');
const crypto = require('crypto');

// In-memory store for OAuth states (in production, use Redis or database)
const oauthStates = new Map();

/**
 * OAuth callback route - NO authentication required
 * TikTok will redirect here after user authorizes
 */
router.get('/callback/tiktok', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'Missing authorization code or state'
      });
    }

    logger.info('TikTok OAuth callback received', {
      code: code.substring(0, 10) + '...',
      state
    });

    // Verify state parameter
    const stateData = oauthStates.get(state);
    if (!stateData) {
      logger.error('Invalid state parameter');
      return res.status(400).json({
        success: false,
        error: 'Invalid state',
        message: 'Invalid state parameter'
      });
    }

    // Clean up state
    oauthStates.delete(state);

    // Check if state is expired (5 minutes)
    if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
      logger.error('State parameter expired');
      return res.status(400).json({
        success: false,
        error: 'Expired state',
        message: 'Authorization expired. Please try again.'
      });
    }

    // Exchange code for token
    let tokenData;
    try {
      tokenData = await tiktokService.exchangeCodeForToken(code);

      if (!tokenData || !tokenData.data || !tokenData.data.access_token) {
        throw new Error('Invalid token response from TikTok');
      }
    } catch (error) {
      logger.error('Token exchange failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Token exchange failed',
        message: 'Failed to complete authorization. Please try again.'
      });
    }

    const { access_token, refresh_token, expires_in } = tokenData.data;

    // Get shop information using the access token
    let shopInfo;
    try {
      shopInfo = await tiktokService.getShopInfo(access_token);

      if (!shopInfo || !shopInfo.data || !shopInfo.data.shop) {
        throw new Error('Could not retrieve shop information');
      }
    } catch (error) {
      logger.error('Failed to get shop info:', error);
      return res.status(500).json({
        success: false,
        error: 'Shop info failed',
        message: 'Failed to retrieve shop information.'
      });
    }

    // Save shop info to database
    const supabase = getSupabase();

    // Get user from state data
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', stateData.userId)
      .single();

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'User not found',
        message: 'User not found. Please try again.'
      });
    }

    // Check if shop already exists
    const { data: existingShop } = await supabase
      .from('shops')
      .select('id')
      .eq('shop_id', shopInfo.data.shop.shop_id)
      .eq('user_id', user.id)
      .single();

    if (existingShop) {
      // Update existing shop
      await supabase
        .from('shops')
        .update({
          shop_name: shopInfo.data.shop.shop_name,
          access_token: access_token,
          refresh_token: refresh_token,
          token_expires_at: new Date(Date.now() + expires_in * 1000),
          is_active: true,
          updated_at: new Date()
        })
        .eq('id', existingShop.id);

      logger.info('Shop updated', { shopId: shopInfo.data.shop.shop_id });
    } else {
      // Create new shop
      await supabase
        .from('shops')
        .insert({
          user_id: user.id,
          platform: 'tiktok',
          shop_id: shopInfo.data.shop.shop_id,
          shop_name: shopInfo.data.shop.shop_name,
          access_token: access_token,
          refresh_token: refresh_token,
          token_expires_at: new Date(Date.now() + expires_in * 1000),
          is_active: true
        });

      logger.info('Shop connected', { shopId: shopInfo.data.shop.shop_id });
    }

    // Return JSON response for success
    res.json({
      success: true,
      message: 'TikTok Shop connected successfully',
      shop: {
        id: shopInfo.data.shop.shop_id,
        name: shopInfo.data.shop.shop_name,
        platform: 'tiktok'
      }
    });

  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: 'OAuth callback failed',
      message: error.message || 'Failed to connect TikTok Shop'
    });
  }
});

/**
 * @route   POST /api/shops/connect
 * @desc    Generate TikTok OAuth URL
 * @access  Private
 */
router.post('/connect', authenticate, async (req, res) => {
  try {
    const { uid } = req.user;

    // Generate secure state parameter
    const state = crypto.randomBytes(32).toString('base64url');

    // Save state with user info for verification
    oauthStates.set(state, {
      userId: uid,
      timestamp: Date.now()
    });

    // Clean up old states (older than 5 minutes)
    for (const [key, value] of oauthStates.entries()) {
      if (Date.now() - value.timestamp > 5 * 60 * 1000) {
        oauthStates.delete(key);
      }
    }

    // Generate OAuth URL
    const authUrl = tiktokService.getAuthorizationUrl(state);

    logger.info('Generated TikTok auth URL', { uid, state });

    res.json({
      authUrl,
      message: 'Visit the authUrl to connect your TikTok Shop'
    });

  } catch (error) {
    logger.error('Connect shop error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

/**
 * @route   GET /api/shops
 * @desc    Get user's connected shops
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();

    // Get user from database
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.json({ shops: [] });
    }

    // Get shops for this user
    const { data: shops, error } = await supabase
      .from('shops')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Check token expiration and mask sensitive data
    const sanitizedShops = (shops || []).map((shop) => {
      const tokenExpired = new Date(shop.token_expires_at) < new Date();
      return {
        id: shop.id,
        platform: shop.platform,
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
        is_active: shop.is_active && !tokenExpired,
        token_expired: tokenExpired,
        created_at: shop.created_at,
        updated_at: shop.updated_at
      };
    });

    res.json({
      shops: sanitizedShops,
      count: sanitizedShops.length
    });

  } catch (error) {
    logger.error('Fetch shops error:', error);
    res.status(500).json({ error: 'Failed to fetch shops' });
  }
});

/**
 * @route   DELETE /api/shops/:shopId
 * @desc    Disconnect a shop
 * @access  Private
 */
router.delete('/:shopId', authenticate, async (req, res) => {
  try {
    const { shopId } = req.params;
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

    // Delete shop (only if it belongs to this user)
    const { error } = await supabase
      .from('shops')
      .delete()
      .eq('id', shopId)
      .eq('user_id', user.id);

    if (error) throw error;

    logger.info('Shop disconnected', { shopId, userId: user.id });

    res.json({ message: 'Shop disconnected successfully' });

  } catch (error) {
    logger.error('Disconnect shop error:', error);
    res.status(500).json({ error: 'Failed to disconnect shop' });
  }
});

/**
 * @route   POST /api/shops/:shopId/refresh
 * @desc    Refresh shop access token
 * @access  Private
 */
router.post('/:shopId/refresh', authenticate, async (req, res) => {
  try {
    const { shopId } = req.params;
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

    // Refresh token
    const tokenData = await tiktokService.refreshToken(shop.refresh_token);

    if (!tokenData || !tokenData.data || !tokenData.data.access_token) {
      throw new Error('Failed to refresh token');
    }

    const { access_token, refresh_token, expires_in } = tokenData.data;

    // Update tokens in database
    await supabase
      .from('shops')
      .update({
        access_token: access_token,
        refresh_token: refresh_token,
        token_expires_at: new Date(Date.now() + expires_in * 1000),
        updated_at: new Date()
      })
      .eq('id', shopId);

    logger.info('Token refreshed', { shopId });

    res.json({
      message: 'Token refreshed successfully',
      expires_at: new Date(Date.now() + expires_in * 1000)
    });

  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

module.exports = router;