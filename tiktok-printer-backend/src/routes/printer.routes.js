const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { getSupabase } = require('../config/supabase');
const PrinterController = require('../controllers/printer.controller');
const QueueService = require('../services/queue.service');
const logger = require('../utils/logger');

/**
 * @route   POST /api/printers
 * @desc    Register a new printer
 * @access  Private
 */
router.post('/', authenticate, async (req, res) => {
  try {
    // Get user from database
    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user.id = user.id;
    await PrinterController.registerPrinter(req, res);
  } catch (error) {
    logger.error('Register printer route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/printers
 * @desc    Get user's printers
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user.id = user.id;
    await PrinterController.getPrinters(req, res);
  } catch (error) {
    logger.error('Get printers route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   PUT /api/printers/:printerId/heartbeat
 * @desc    Update printer heartbeat
 * @access  Private
 */
router.put('/:printerId/heartbeat', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user.id = user.id;
    await PrinterController.updateHeartbeat(req, res);
  } catch (error) {
    logger.error('Update heartbeat route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   DELETE /api/printers/:printerId
 * @desc    Delete a printer
 * @access  Private
 */
router.delete('/:printerId', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user.id = user.id;
    await PrinterController.deletePrinter(req, res);
  } catch (error) {
    logger.error('Delete printer route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   POST /api/printers/:printerId/test
 * @desc    Send test print to printer
 * @access  Private
 */
router.post('/:printerId/test', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user.id = user.id;
    await PrinterController.testPrint(req, res);
  } catch (error) {
    logger.error('Test print route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/printers/:printerId/stats
 * @desc    Get printer statistics
 * @access  Private
 */
router.get('/:printerId/stats', authenticate, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    req.user.id = user.id;
    await PrinterController.getPrinterStats(req, res);
  } catch (error) {
    logger.error('Printer stats route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/printers/:printerId/queue
 * @desc    Get pending jobs for a printer
 * @access  Private
 */
router.get('/:printerId/queue', authenticate, async (req, res) => {
  try {
    const { printerId } = req.params;
    const { limit = 10 } = req.query;

    const supabase = getSupabase();
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify printer belongs to user
    const { data: printer, error: printerError } = await supabase
      .from('printers')
      .select('id')
      .eq('id', printerId)
      .eq('user_id', user.id)
      .single();

    if (printerError || !printer) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    const jobs = await QueueService.getPendingJobs(printerId, parseInt(limit));

    res.json({
      jobs,
      count: jobs.length
    });

  } catch (error) {
    logger.error('Get printer queue error:', error);
    res.status(500).json({ error: 'Failed to get printer queue' });
  }
});

/**
 * @route   POST /api/printers/job-callback
 * @desc    Handle print job completion callback
 * @access  Private
 */
router.post('/job-callback', authenticate, PrinterController.handleJobCallback);

module.exports = router;
