// src/services/tiktok.service.js
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class TikTokService {
  constructor() {
    this.appKey = process.env.TIKTOK_APP_KEY;
    this.appSecret = process.env.TIKTOK_APP_SECRET;
    this.redirectUri = process.env.TIKTOK_REDIRECT_URI;
    this.apiBaseUrl = process.env.TIKTOK_API_BASE_URL || 'https://open-api.tiktokglobalshop.com';
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state) {
    const params = new URLSearchParams({
      app_key: this.appKey,
      state: state,
      response_type: 'code',
      redirect_uri: this.redirectUri
    });

    const authUrl = `https://auth.tiktok-shops.com/oauth/authorize?${params.toString()}`;

    logger.debug('Generated auth URL', { authUrl });

    return authUrl;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code) {
    try {
      const params = {
        app_key: this.appKey,
        app_secret: this.appSecret,
        auth_code: code,
        grant_type: 'authorized_code'
      };

      const response = await axios.post(
        'https://auth.tiktok-shops.com/api/v2/token/get',
        params,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Token exchange successful');
      return response.data;
    } catch (error) {
      logger.error('Token exchange failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const params = {
        app_key: this.appKey,
        app_secret: this.appSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      };

      const response = await axios.post(
        'https://auth.tiktok-shops.com/api/v2/token/refresh',
        params,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Token refresh successful');
      return response.data;
    } catch (error) {
      logger.error('Token refresh failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get shop information
   */
  async getShopInfo(accessToken) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = '/shop/202309/shops';
      const params = {
        app_key: this.appKey,
        timestamp: timestamp,
        version: '202309'
      };

      // Generate signature
      const signature = this.generateSignature(path, params, '');

      const response = await axios.get(
        `${this.apiBaseUrl}${path}`,
        {
          params: {
            ...params,
            sign: signature
          },
          headers: {
            'x-tts-access-token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Shop info retrieved successfully');
      return response.data;
    } catch (error) {
      logger.error('Get shop info failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get orders from TikTok Shop
   */
  async getOrders(accessToken, shopId, params = {}) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const path = '/order/202309/orders/search';

      const queryParams = {
        app_key: this.appKey,
        timestamp: timestamp,
        shop_id: shopId,
        version: '202309',
        ...params
      };

      // Generate signature
      const signature = this.generateSignature(path, queryParams, '');

      const response = await axios.post(
        `${this.apiBaseUrl}${path}`,
        params,
        {
          params: {
            app_key: this.appKey,
            timestamp: timestamp,
            version: '202309',
            sign: signature
          },
          headers: {
            'x-tts-access-token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Get orders failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate signature for TikTok API requests
   */
  generateSignature(path, params, body) {
    // Sort parameters alphabetically
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join('');

    // Construct string to sign
    const stringToSign = `${this.appSecret}${path}${sortedParams}${body}${this.appSecret}`;

    // Generate SHA256 hash
    const signature = crypto
      .createHash('sha256')
      .update(stringToSign)
      .digest('hex');

    return signature;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(signature, timestamp, body) {
    const payload = `${this.appSecret}${timestamp}${JSON.stringify(body)}${this.appSecret}`;
    const expectedSignature = crypto
      .createHash('sha256')
      .update(payload)
      .digest('hex');

    return signature === expectedSignature;
  }
}

module.exports = new TikTokService();