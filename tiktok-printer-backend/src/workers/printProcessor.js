const cron = require('node-cron');
const { getSupabase } = require('../config/supabase');
const QueueService = require('../services/queue.service');
const { emitToShop } = require('../services/websocket.service');
const logger = require('../utils/logger');

let isProcessorRunning = false;

/**
 * Start the print processor service
 * Runs every 30 seconds to process pending print jobs
 */
function startPrintProcessor() {
  if (isProcessorRunning) {
    logger.warn('Print processor is already running');
    return;
  }

  // Schedule print processing every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    await processPrintJobs();
  });

  // Also run immediately on startup
  setTimeout(() => {
    processPrintJobs();
  }, 10000); // Wait 10 seconds after startup

  isProcessorRunning = true;
  logger.info('Print processor service started - running every 30 seconds');
}

/**
 * Process pending print jobs
 */
async function processPrintJobs() {
  try {
    logger.debug('Starting print job processing cycle...');
    
    const supabase = getSupabase();

    // Get all active printers
    const { data: printers, error } = await supabase
      .from('printers')
      .select('id, name, user_id, status, last_seen_at')
      .eq('status', 'online');

    if (error) {
      throw error;
    }

    if (!printers || printers.length === 0) {
      logger.debug('No online printers found for processing');
      return;
    }

    logger.debug(`Processing jobs for ${printers.length} online printers`);

    const results = await Promise.allSettled(
      printers.map(printer => processPrinterJobs(printer))
    );

    // Log results
    let successCount = 0;
    let errorCount = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
        if (result.value > 0) {
          logger.debug(`✅ Printer ${printers[index].name}: ${result.value} jobs processed`);
        }
      } else {
        errorCount++;
        logger.error(`❌ Printer ${printers[index].name}: ${result.reason.message}`);
      }
    });

    if (successCount > 0 || errorCount > 0) {
      logger.info(`Print processing completed: ${successCount} success, ${errorCount} errors`);
    }

  } catch (error) {
    logger.error('Error in print processing cycle:', error);
  }
}

/**
 * Process jobs for a specific printer
 */
async function processPrinterJobs(printer) {
  try {
    // Check if printer is still responsive (last seen within 2 minutes)
    const lastSeen = new Date(printer.last_seen_at);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    
    if (lastSeen < twoMinutesAgo) {
      logger.warn(`Printer ${printer.name} appears offline - last seen ${lastSeen}`);
      await markPrinterOffline(printer.id);
      return 0;
    }

    // Get pending jobs for this printer
    const pendingJobs = await QueueService.getPendingJobs(printer.id, 5);
    
    if (pendingJobs.length === 0) {
      return 0;
    }

    logger.debug(`Processing ${pendingJobs.length} jobs for printer ${printer.name}`);

    let processedCount = 0;

    for (const job of pendingJobs) {
      try {
        // Update job status to processing
        await QueueService.updateJobStatus(job.id, 'processing');

        // Send job to desktop app via WebSocket
        const printCommand = {
          jobId: job.id,
          orderId: job.order_id,
          printerId: printer.id,
          template: job.templates,
          data: job.data,
          priority: job.priority
        };

        emitToShop(job.shop_id, 'process-print-job', printCommand);

        // Also emit directly to printer if connected
        if (global.io) {
          global.io.to(`printer-${printer.id}`).emit('print-command', printCommand);
        }

        processedCount++;
        
        logger.info(`Print job ${job.id} sent to printer ${printer.name}`);

        // Add delay between jobs to prevent overwhelming the printer
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (jobError) {
        logger.error(`Error processing job ${job.id}:`, jobError);
        
        // Mark job as failed
        await QueueService.updateJobStatus(
          job.id, 
          'failed', 
          jobError.message
        );
      }
    }

    return processedCount;
    
  } catch (error) {
    logger.error(`Error processing jobs for printer ${printer.name}:`, error);
    throw error;
  }
}

/**
 * Mark printer as offline
 */
async function markPrinterOffline(printerId) {
  try {
    const supabase = getSupabase();
    
    await supabase
      .from('printers')
      .update({ 
        status: 'offline',
        updated_at: new Date().toISOString()
      })
      .eq('id', printerId);

    logger.info(`Printer ${printerId} marked as offline`);
  } catch (error) {
    logger.error('Error marking printer offline:', error);
  }
}

/**
 * Handle print job completion from desktop app
 */
async function handleJobCompletion(jobId, success, errorMessage = null) {
  try {
    const status = success ? 'completed' : 'failed';
    
    await QueueService.updateJobStatus(jobId, status, errorMessage);
    
    if (success) {
      logger.info(`Print job ${jobId} completed successfully`);
    } else {
      logger.error(`Print job ${jobId} failed: ${errorMessage}`);
      
      // Attempt to retry the job if it hasn't exceeded max retries
      try {
        await QueueService.retryJob(jobId);
      } catch (retryError) {
        logger.warn(`Cannot retry job ${jobId}: ${retryError.message}`);
      }
    }
  } catch (error) {
    logger.error('Error handling job completion:', error);
  }
}

/**
 * Cleanup stale processing jobs
 * Jobs stuck in 'processing' status for more than 10 minutes
 */
async function cleanupStaleJobs() {
  try {
    const supabase = getSupabase();
    
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const { data: staleJobs, error } = await supabase
      .from('print_queue')
      .select('id')
      .eq('status', 'processing')
      .lt('started_at', tenMinutesAgo.toISOString());

    if (error) throw error;

    if (staleJobs && staleJobs.length > 0) {
      logger.warn(`Found ${staleJobs.length} stale processing jobs`);
      
      for (const job of staleJobs) {
        await QueueService.updateJobStatus(
          job.id, 
          'failed', 
          'Job timed out - no response from printer'
        );
      }
    }
  } catch (error) {
    logger.error('Error cleaning up stale jobs:', error);
  }
}

/**
 * Schedule periodic cleanup
 */
function scheduleCleanup() {
  // Clean up stale jobs every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await cleanupStaleJobs();
  });

  // Clean up old completed jobs every day at 2 AM
  cron.schedule('0 2 * * *', async () => {
    await QueueService.cleanupOldJobs(30);
  });

  logger.info('Print job cleanup scheduled');
}

/**
 * Stop the print processor service
 */
function stopPrintProcessor() {
  if (!isProcessorRunning) {
    logger.warn('Print processor is not running');
    return;
  }

  isProcessorRunning = false;
  logger.info('Print processor service stopped');
}

/**
 * Get processor status
 */
function getProcessorStatus() {
  return {
    isRunning: isProcessorRunning,
    nextRun: isProcessorRunning ? 'Every 30 seconds' : 'Not scheduled'
  };
}

module.exports = {
  startPrintProcessor,
  stopPrintProcessor,
  handleJobCompletion,
  scheduleCleanup,
  getProcessorStatus,
  processPrintJobs,
  cleanupStaleJobs
};
