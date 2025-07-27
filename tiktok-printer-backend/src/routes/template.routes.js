const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * @route   GET /api/templates
 * @desc    Get user's print templates
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
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

    // Get templates
    const { data: templates, error } = await supabase
      .from('print_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(templates || []);
  } catch (error) {
    logger.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/**
 * @route   POST /api/templates
 * @desc    Create a new print template
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, templateData, paperSize } = req.body;

    if (!name || !templateData) {
      return res.status(400).json({ error: 'Name and template data are required' });
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

    // Create template
    const { data: template, error } = await supabase
      .from('print_templates')
      .insert({
        user_id: user.id,
        name,
        description,
        template_data: templateData,
        paper_size: paperSize || '4x6'
      })
      .select()
      .single();

    if (error) throw error;

    logger.info(`New template created: ${name}`);
    res.status(201).json(template);
  } catch (error) {
    logger.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

module.exports = router;