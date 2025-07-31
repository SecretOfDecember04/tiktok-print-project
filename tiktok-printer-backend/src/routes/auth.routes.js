const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
const { authenticate } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

/**
 * @route   POST /api/auth/register
 * @desc    Register user after Firebase Auth
 * @access  Public (but requires valid Firebase token)
 */
router.post('/register', authenticate, async (req, res) => {
  try {
    const { fullName } = req.body;
    const { uid, email } = req.user;

    const supabase = getSupabase();

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', uid)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'User already registered' });
    }

    // Create user in Supabase
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        firebase_uid: uid,
        email: email,
        full_name: fullName,
        subscription_status: 'trial',
        subscription_expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

/**
 * @route   GET /api/auth/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get shop count
    const { count: shopCount } = await supabase
      .from('shops')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    res.json({
      user: {
        ...user,
        shopCount: shopCount || 0
      }
    });
  } catch (error) {
    logger.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { fullName } = req.body;
    const supabase = getSupabase();

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({ full_name: fullName })
      .eq('firebase_uid', req.user.uid)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser
    });
  } catch (error) {
    logger.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * @route   GET /api/auth/subscription
 * @desc    Get subscription status
 * @access  Private
 */
router.get('/subscription', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();

    const { data: user, error } = await supabase
      .from('users')
      .select('subscription_status, subscription_expires_at')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (error) throw error;

    const now = new Date();
    const expiresAt = new Date(user.subscription_expires_at);
    const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

    res.json({
      status: user.subscription_status,
      expiresAt: user.subscription_expires_at,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      isActive: user.subscription_status === 'active' ||
                (user.subscription_status === 'trial' && expiresAt > now)
    });
  } catch (error) {
    logger.error('Subscription check error:', error);
    res.status(500).json({ error: 'Failed to check subscription' });
  }
});

// ===== TEMPORARY TEST ENDPOINTS - REMOVE IN PRODUCTION =====

/**
 * @route   POST /api/auth/test-token
 * @desc    Get a test token for development
 * @access  Public (TEST ONLY)
 */
router.post('/test-token', async (req, res) => {
  const testToken = 'test-token-123';
  res.json({
    token: testToken,
    instructions: 'Use this in Authorization: Bearer test-token-123',
    warning: 'This is for testing only - remove in production!'
  });
});

/**
 * @route   POST /api/auth/test-user
 * @desc    Create a test user directly in Supabase
 * @access  Public (TEST ONLY)
 */
router.post('/test-user', async (req, res) => {
  try {
    const supabase = getSupabase();
    const testUid = 'test-user-001';
    const testEmail = 'test@example.com';

    // Check if test user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', testUid)
      .single();

    if (existingUser) {
      return res.json({
        message: 'Test user already exists',
        user: existingUser,
        token: 'test-token-123'
      });
    }

    // Create test user
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        firebase_uid: testUid,
        email: testEmail,
        full_name: 'Test User',
        subscription_status: 'trial',
        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Test user created',
      user: newUser,
      token: 'test-token-123',
      instructions: 'Use Authorization: Bearer test-token-123 for API calls'
    });
  } catch (error) {
    logger.error('Test user creation error:', error);
    res.status(500).json({ error: 'Failed to create test user' });
  }
});

// ===== END OF TEST ENDPOINTS =====

module.exports = router;