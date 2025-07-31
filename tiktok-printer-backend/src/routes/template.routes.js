const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
const logger = require('../utils/logger');

/**
 * @route   GET /api/templates
 * @desc    Get all user's label templates
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

    // Get user's templates
    const { data: templates, error } = await supabase
      .from('templates')
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
 * @desc    Create a new label template
 * @access  Private
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, template_data, is_default } = req.body;

    if (!name || !template_data) {
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

    // If this is being set as default, unset other defaults
    if (is_default) {
      await supabase
        .from('templates')
        .update({ is_default: false })
        .eq('user_id', user.id);
    }

    // Create template
    const { data: template, error } = await supabase
      .from('templates')
      .insert({
        user_id: user.id,
        name,
        description,
        template_data,
        is_default: is_default || false
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

/**
 * @route   GET /api/templates/:id
 * @desc    Get template details
 * @access  Private
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
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

    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    logger.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

/**
 * @route   PUT /api/templates/:id
 * @desc    Update template
 * @access  Private
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, template_data, is_default } = req.body;
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

    // If this is being set as default, unset other defaults
    if (is_default) {
      await supabase
        .from('templates')
        .update({ is_default: false })
        .eq('user_id', user.id);
    }

    const { data: template, error } = await supabase
      .from('templates')
      .update({
        name,
        description,
        template_data,
        is_default: is_default || false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    logger.info(`Template ${id} updated`);
    res.json(template);
  } catch (error) {
    logger.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete template
 * @access  Private
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
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

    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;

    logger.info(`Template ${id} deleted`);
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    logger.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

/**
 * @route   GET /api/templates/default
 * @desc    Get user's default template
 * @access  Private
 */
router.get('/default', async (req, res) => {
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

    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      throw error;
    }

    res.json(template || null);
  } catch (error) {
    logger.error('Error fetching default template:', error);
    res.status(500).json({ error: 'Failed to fetch default template' });
  }
});

module.exports = router;