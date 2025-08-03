const { getSupabase } = require('../config/supabase');
const { emitToShop } = require('./websocket.service');
const PrintHistoryService = require('./printHistory.service');
const logger = require('../utils/logger');

class QueueService {
  /**
   * Add a print job to the queue
   */
  static async addPrintJob(jobData) {
    try {
      const supabase = getSupabase();
      
      const printJob = {
        order_id: jobData.orderId,
        user_id: jobData.userId,
        shop_id: jobData.shopId,
        template_id: jobData.templateId,
        printer_id: jobData.printerId,
        priority: jobData.priority || 'normal',
        status: 'pending',
        data: jobData.data,
        retry_count: 0,
        max_retries: 3,
        created_at: new Date().toISOString()
      };

      const { data: newJob, error } = await supabase
        .from('print_queue')
        .insert(printJob)
        .select()
        .single();

      if (error) throw error;

      logger.info(`Print job added to queue: ${newJob.id}`);

      // Log print job creation
      try {
        await PrintHistoryService.logPrintJobCreated({
          jobId: newJob.id,
          orderId: jobData.orderId,
          userId: jobData.userId,
          printerId: jobData.printerId,
          templateId: jobData.templateId,
          priority: jobData.priority,
          data: jobData.data
        });
      } catch (historyError) {
        logger.warn('Failed to log print job creation:', historyError.message);
      }

      // Emit to desktop app for immediate processing
      emitToShop(jobData.shopId, 'new-print-job', newJob);

      return newJob;
    } catch (error) {
      logger.error('Error adding print job:', error);
      throw error;
    }
  }

  /**
   * Get pending print jobs for a specific printer
   */
  static async getPendingJobs(printerId, limit = 10) {
    try {
      const supabase = getSupabase();

      const { data: jobs, error } = await supabase
        .from('print_queue')
        .select(`
          *,
          orders!inner(
            id,
            order_number,
            customer_name,
            shipping_address,
            items
          ),
          templates(
            id,
            name,
            template_data
          )
        `)
        .eq('printer_id', printerId)
        .in('status', ['pending', 'retrying'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) throw error;

      return jobs || [];
    } catch (error) {
      logger.error('Error fetching pending jobs:', error);
      throw error;
    }
  }

  /**
   * Update print job status
   */
  static async updateJobStatus(jobId, status, errorMessage = null) {
    try {
      const supabase = getSupabase();

      const updateData = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'failed' && errorMessage) {
        updateData.error_message = errorMessage;
        updateData.failed_at = new Date().toISOString();
      } else if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      } else if (status === 'processing') {
        updateData.started_at = new Date().toISOString();
      }

      const { data: updatedJob, error } = await supabase
        .from('print_queue')
        .update(updateData)
        .eq('id', jobId)
        .select()
        .single();

      if (error) throw error;

      // Log status change
      try {
        await PrintHistoryService.logStatusChange(
          jobId,
          originalJob.status,
          status,
          details
        );
      } catch (historyError) {
        logger.warn('Failed to log status change:', historyError.message);
      }

      // Update related order status
      if (status === 'completed') {
        await supabase
          .from('orders')
          .update({
            status: 'printed',
            printed_at: new Date().toISOString()
          })
          .eq('id', updatedJob.order_id);

        logger.info(`Order ${updatedJob.order_id} marked as printed`);

        // Log print completion
        try {
          await PrintHistoryService.logPrintCompletion(jobId, true, {
            processingTime: details.processingTime,
            printTime: details.printTime,
            totalPages: details.totalPages,
            quality: details.quality
          });
        } catch (historyError) {
          logger.warn('Failed to log print completion:', historyError.message);
        }

        // Trigger auto-fulfillment if enabled
        try {
          const FulfillmentService = require('./fulfillment.service');
          await FulfillmentService.autoFulfillOrder(updatedJob.order_id);
        } catch (fulfillmentError) {
          logger.warn(`Auto-fulfillment failed for order ${updatedJob.order_id}:`, fulfillmentError.message);
        }
      } else if (status === 'failed') {
        // Log print failure
        try {
          await PrintHistoryService.logPrintCompletion(jobId, false, {
            errorMessage: details.errorMessage,
            retryCount: updatedJob.retry_count
          });
        } catch (historyError) {
          logger.warn('Failed to log print failure:', historyError.message);
        }
      }

      // Emit status update
      emitToShop(updatedJob.shop_id, 'print-job-updated', updatedJob);

      return updatedJob;
    } catch (error) {
      logger.error('Error updating job status:', error);
      throw error;
    }
  }

  /**
   * Retry a failed print job
   */
  static async retryJob(jobId) {
    try {
      const supabase = getSupabase();

      // Get current job
      const { data: job, error: fetchError } = await supabase
        .from('print_queue')
        .select('*')
        .eq('id', jobId)
        .single();

      if (fetchError || !job) {
        throw new Error('Print job not found');
      }

      if (job.retry_count >= job.max_retries) {
        throw new Error('Maximum retries exceeded');
      }

      // Update retry count and status
      const { data: updatedJob, error } = await supabase
        .from('print_queue')
        .update({
          status: 'retrying',
          retry_count: job.retry_count + 1,
          error_message: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId)
        .select()
        .single();

      if (error) throw error;

      logger.info(`Print job ${jobId} queued for retry (attempt ${updatedJob.retry_count})`);

      // Emit retry event
      emitToShop(updatedJob.shop_id, 'print-job-retry', updatedJob);

      return updatedJob;
    } catch (error) {
      logger.error('Error retrying job:', error);
      throw error;
    }
  }

  /**
   * Get print job history for a user
   */
  static async getJobHistory(userId, filters = {}) {
    try {
      const supabase = getSupabase();

      let query = supabase
        .from('print_queue')
        .select(`
          *,
          orders!inner(
            id,
            order_number,
            customer_name
          ),
          templates(
            id,
            name
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.printerId) {
        query = query.eq('printer_id', filters.printerId);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      const { data: jobs, error } = await query;

      if (error) throw error;

      return jobs || [];
    } catch (error) {
      logger.error('Error fetching job history:', error);
      throw error;
    }
  }

  /**
   * Clean up old completed/failed jobs
   */
  static async cleanupOldJobs(daysOld = 30) {
    try {
      const supabase = getSupabase();
      
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { error } = await supabase
        .from('print_queue')
        .delete()
        .in('status', ['completed', 'failed', 'cancelled'])
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;

      logger.info(`Cleaned up print jobs older than ${daysOld} days`);
    } catch (error) {
      logger.error('Error cleaning up old jobs:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  static async getQueueStats(userId) {
    try {
      const supabase = getSupabase();

      const { data: stats, error } = await supabase
        .from('print_queue')
        .select('status')
        .eq('user_id', userId);

      if (error) throw error;

      const statusCounts = stats.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {});

      // Get today's jobs
      const today = new Date().toISOString().split('T')[0];
      const { count: todayCount } = await supabase
        .from('print_queue')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', `${today}T00:00:00.000Z`);

      return {
        total: stats.length,
        today: todayCount || 0,
        pending: statusCounts.pending || 0,
        processing: statusCounts.processing || 0,
        completed: statusCounts.completed || 0,
        failed: statusCounts.failed || 0,
        retrying: statusCounts.retrying || 0
      };
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      throw error;
    }
  }
}

module.exports = QueueService;
