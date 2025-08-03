const { getSupabase } = require('../config/supabase');
const QueueService = require('../services/queue.service');
const logger = require('../utils/logger');

class PrinterController {
  /**
   * Register a new printer from desktop app
   */
  static async registerPrinter(req, res) {
    try {
      const { name, type, capabilities, deviceId } = req.body;
      const userId = req.user.id;

      if (!name || !type || !deviceId) {
        return res.status(400).json({ 
          error: 'Name, type, and deviceId are required' 
        });
      }

      const supabase = getSupabase();

      // Check if printer already exists for this user
      const { data: existingPrinter } = await supabase
        .from('printers')
        .select('id')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .single();

      if (existingPrinter) {
        // Update existing printer
        const { data: updatedPrinter, error } = await supabase
          .from('printers')
          .update({
            name,
            type,
            capabilities: capabilities || {},
            status: 'online',
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPrinter.id)
          .select()
          .single();

        if (error) throw error;

        return res.json({
          message: 'Printer updated successfully',
          printer: updatedPrinter
        });
      }

      // Create new printer
      const { data: newPrinter, error } = await supabase
        .from('printers')
        .insert({
          user_id: userId,
          name,
          type,
          device_id: deviceId,
          capabilities: capabilities || {},
          status: 'online',
          last_seen_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      logger.info(`New printer registered: ${name} (${type})`);

      res.status(201).json({
        message: 'Printer registered successfully',
        printer: newPrinter
      });

    } catch (error) {
      logger.error('Printer registration error:', error);
      res.status(500).json({ error: 'Failed to register printer' });
    }
  }

  /**
   * Get all user's printers
   */
  static async getPrinters(req, res) {
    try {
      const userId = req.user.id;
      const supabase = getSupabase();

      const { data: printers, error } = await supabase
        .from('printers')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Check which printers are online (seen within last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const printersWithStatus = printers.map(printer => ({
        ...printer,
        is_online: new Date(printer.last_seen_at) > fiveMinutesAgo
      }));

      res.json({
        printers: printersWithStatus,
        count: printers.length
      });

    } catch (error) {
      logger.error('Fetch printers error:', error);
      res.status(500).json({ error: 'Failed to fetch printers' });
    }
  }

  /**
   * Update printer heartbeat
   */
  static async updateHeartbeat(req, res) {
    try {
      const { printerId } = req.params;
      const userId = req.user.id;
      const { status, jobCount } = req.body;

      const supabase = getSupabase();

      const { data: updatedPrinter, error } = await supabase
        .from('printers')
        .update({
          status: status || 'online',
          last_seen_at: new Date().toISOString(),
          current_job_count: jobCount || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', printerId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;

      if (!updatedPrinter) {
        return res.status(404).json({ error: 'Printer not found' });
      }

      res.json({ 
        message: 'Heartbeat updated',
        printer: updatedPrinter
      });

    } catch (error) {
      logger.error('Heartbeat update error:', error);
      res.status(500).json({ error: 'Failed to update heartbeat' });
    }
  }

  /**
   * Delete/disconnect a printer
   */
  static async deletePrinter(req, res) {
    try {
      const { printerId } = req.params;
      const userId = req.user.id;

      const supabase = getSupabase();

      // Check if there are pending jobs for this printer
      const pendingJobs = await QueueService.getPendingJobs(printerId, 1);
      
      if (pendingJobs.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete printer with pending jobs',
          pendingJobsCount: pendingJobs.length
        });
      }

      const { error } = await supabase
        .from('printers')
        .delete()
        .eq('id', printerId)
        .eq('user_id', userId);

      if (error) throw error;

      logger.info(`Printer ${printerId} deleted by user ${userId}`);

      res.json({ message: 'Printer deleted successfully' });

    } catch (error) {
      logger.error('Delete printer error:', error);
      res.status(500).json({ error: 'Failed to delete printer' });
    }
  }

  /**
   * Test print on a specific printer
   */
  static async testPrint(req, res) {
    try {
      const { printerId } = req.params;
      const { templateId } = req.body;
      const userId = req.user.id;

      const supabase = getSupabase();

      // Verify printer belongs to user
      const { data: printer, error: printerError } = await supabase
        .from('printers')
        .select('*')
        .eq('id', printerId)
        .eq('user_id', userId)
        .single();

      if (printerError || !printer) {
        return res.status(404).json({ error: 'Printer not found' });
      }

      // Create test print job
      const testJob = await QueueService.addPrintJob({
        orderId: null, // No order for test print
        userId,
        shopId: null,
        templateId,
        printerId,
        priority: 'high',
        data: {
          isTestPrint: true,
          testData: {
            orderNumber: 'TEST-' + Date.now(),
            customerName: 'Test Customer',
            address: {
              line1: '123 Test Street',
              city: 'Test City',
              state: 'TS',
              zip: '12345',
              country: 'US'
            },
            items: [{
              name: 'Test Product',
              quantity: 1,
              sku: 'TEST-SKU'
            }]
          }
        }
      });

      res.json({
        message: 'Test print job queued',
        jobId: testJob.id
      });

    } catch (error) {
      logger.error('Test print error:', error);
      res.status(500).json({ error: 'Failed to queue test print' });
    }
  }

  /**
   * Get printer statistics
   */
  static async getPrinterStats(req, res) {
    try {
      const { printerId } = req.params;
      const userId = req.user.id;

      const supabase = getSupabase();

      // Verify printer belongs to user
      const { data: printer, error: printerError } = await supabase
        .from('printers')
        .select('*')
        .eq('id', printerId)
        .eq('user_id', userId)
        .single();

      if (printerError || !printer) {
        return res.status(404).json({ error: 'Printer not found' });
      }

      // Get print job statistics
      const stats = await QueueService.getJobHistory(userId, { 
        printerId,
        limit: 1000 
      });

      const statusCounts = stats.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});

      // Get today's jobs
      const today = new Date().toISOString().split('T')[0];
      const todayJobs = stats.filter(job => 
        job.created_at.startsWith(today)
      );

      res.json({
        printer,
        stats: {
          total: stats.length,
          today: todayJobs.length,
          completed: statusCounts.completed || 0,
          failed: statusCounts.failed || 0,
          pending: statusCounts.pending || 0,
          lastJob: stats[0] || null
        }
      });

    } catch (error) {
      logger.error('Printer stats error:', error);
      res.status(500).json({ error: 'Failed to get printer statistics' });
    }
  }

  /**
   * Handle print job completion callback from desktop app
   */
  static async handleJobCallback(req, res) {
    try {
      const { jobId, success, errorMessage } = req.body;
      
      if (!jobId || success === undefined) {
        return res.status(400).json({
          error: 'jobId and success status are required'
        });
      }

      const { handleJobCompletion } = require('../workers/printProcessor');
      await handleJobCompletion(jobId, success, errorMessage);

      res.json({ message: 'Job status updated successfully' });

    } catch (error) {
      logger.error('Job callback error:', error);
      res.status(500).json({ error: 'Failed to handle job callback' });
    }
  }
}

module.exports = PrinterController;
