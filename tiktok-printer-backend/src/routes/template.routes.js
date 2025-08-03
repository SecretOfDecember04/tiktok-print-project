const router = require('express').Router();
const { getSupabase } = require('../config/supabase');
const { 
  uploadTemplateImage, 
  uploadTemplateFile, 
  handleUploadError 
} = require('../middleware/upload.middleware');
const UploadService = require('../services/upload.service');
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

/**
 * @route   POST /api/templates/upload-image
 * @desc    Upload template image
 * @access  Private
 */
router.post('/upload-image', uploadTemplateImage, handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { templateId } = req.body;
    const uploadedImage = await UploadService.processTemplateImage(
      user.id, 
      req.file, 
      templateId
    );

    res.status(201).json({
      message: 'Image uploaded successfully',
      image: uploadedImage
    });

  } catch (error) {
    logger.error('Upload image error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

/**
 * @route   POST /api/templates/upload-file
 * @desc    Upload template file (JSON)
 * @access  Private
 */
router.post('/upload-file', uploadTemplateFile, handleUploadError, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const supabase = getSupabase();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const uploadedFile = await UploadService.processTemplateFile(user.id, req.file);

    // Optionally create template from uploaded data
    const { createTemplate } = req.body;
    if (createTemplate && uploadedFile.templateData) {
      const { data: template, error } = await supabase
        .from('templates')
        .insert({
          user_id: user.id,
          name: uploadedFile.originalName.replace(/\.[^/.]+$/, ''), // Remove extension
          description: 'Imported from file',
          template_data: uploadedFile.templateData,
          is_default: false
        })
        .select()
        .single();

      if (!error && template) {
        // Link file to template
        await UploadService.updateFileMetadata(user.id, uploadedFile.id, {
          templateId: template.id
        });

        return res.status(201).json({
          message: 'Template created from uploaded file',
          file: uploadedFile,
          template: template
        });
      }
    }

    res.status(201).json({
      message: 'File uploaded successfully',
      file: uploadedFile
    });

  } catch (error) {
    logger.error('Upload file error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/**
 * @route   GET /api/templates/files
 * @desc    Get user's uploaded files
 * @access  Private
 */
router.get('/files', async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    const supabase = getSupabase();
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const files = await UploadService.getUserFiles(user.id, type, parseInt(limit));

    res.json({
      files,
      count: files.length
    });

  } catch (error) {
    logger.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

/**
 * @route   DELETE /api/templates/files/:fileId
 * @desc    Delete uploaded file
 * @access  Private
 */
router.delete('/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const supabase = getSupabase();
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await UploadService.deleteFile(user.id, fileId);

    res.json({ message: 'File deleted successfully' });

  } catch (error) {
    logger.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * @route   GET /api/templates/storage-usage
 * @desc    Get user's storage usage
 * @access  Private
 */
router.get('/storage-usage', async (req, res) => {
  try {
    const supabase = getSupabase();
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', req.user.uid)
      .single();

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const usage = await UploadService.getStorageUsage(user.id);

    res.json(usage);

  } catch (error) {
    logger.error('Get storage usage error:', error);
    res.status(500).json({ error: 'Failed to get storage usage' });
  }
});

module.exports = router;