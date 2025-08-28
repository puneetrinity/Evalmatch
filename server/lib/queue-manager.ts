import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { logger } from './logger';
import { cacheManager } from './redis-cache';

/**
 * PERFORMANCE: Bull Queue manager for memory-aware AI request processing
 * Implements intelligent queuing with ESM support and system load awareness
 */
export class QueueManager {
  private static instance: QueueManager | null = null;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private isInitialized = false;
  
  // Queue configurations
  static readonly QUEUE_NAMES = {
    AI_ANALYSIS: 'ai-analysis',
    BATCH_PROCESSING: 'batch-processing',
    HIGH_PRIORITY: 'high-priority',
    LOW_PRIORITY: 'low-priority',
  } as const;
  
  // Memory pressure thresholds (MB)
  static readonly MEMORY_THRESHOLDS = {
    LOW: 512,    // Normal operations
    MEDIUM: 1024, // Start throttling
    HIGH: 1536,   // Aggressive throttling
    CRITICAL: 2048 // Emergency mode
  } as const;
  
  private redisConnection: ConnectionOptions | null = null;

  private constructor() {
    this.setupRedisConnection();
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  private setupRedisConnection(): void {
    try {
      let redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      // Railway best practice: Add family=0 for dual-stack IPv4/IPv6 support
      if (redisUrl.includes('.railway.internal') && !redisUrl.includes('family=')) {
        redisUrl += redisUrl.includes('?') ? '&family=0' : '?family=0';
      }
      
      // Parse Redis URL for Bull connection
      const url = new URL(redisUrl);
      
      // Extract family parameter from URL search params for Railway IPv6 support
      const familyParam = url.searchParams.get('family');
      const family = familyParam ? parseInt(familyParam) : 0; // Default to dual-stack (0) for Railway
      
      this.redisConnection = {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        username: url.username || undefined,
        db: url.pathname ? parseInt(url.pathname.split('/')[1]) || 0 : 0,
        family: family, // Use parsed family parameter (0 = dual-stack for Railway IPv6)
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 1000, 3000),
        connectTimeout: 10000,
        commandTimeout: 5000,
      };
      
      logger.info('Queue Manager Redis connection configured', {
        host: this.redisConnection.host,
        port: this.redisConnection.port,
        db: this.redisConnection.db
      });
      
    } catch (error) {
      logger.error('Failed to setup Redis connection for queues:', error);
      this.redisConnection = null;
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized || !this.redisConnection) {
      return;
    }

    try {
      logger.info('🚀 Initializing Queue Manager with Bull queues...');

      // Create AI Analysis Queue (High Priority)
      const aiQueue = new Queue(QueueManager.QUEUE_NAMES.AI_ANALYSIS, {
        connection: this.redisConnection,
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 25,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      // Create Batch Processing Queue
      const batchQueue = new Queue(QueueManager.QUEUE_NAMES.BATCH_PROCESSING, {
        connection: this.redisConnection,
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 10,
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 5000,
          },
        },
      });

      // Create Priority Queues
      const highPriorityQueue = new Queue(QueueManager.QUEUE_NAMES.HIGH_PRIORITY, {
        connection: this.redisConnection,
        defaultJobOptions: {
          removeOnComplete: 20,
          removeOnFail: 50,
          attempts: 5,
          priority: 1, // Highest priority
        },
      });

      const lowPriorityQueue = new Queue(QueueManager.QUEUE_NAMES.LOW_PRIORITY, {
        connection: this.redisConnection,
        defaultJobOptions: {
          removeOnComplete: 5,
          removeOnFail: 10,
          attempts: 1,
          priority: 10, // Lowest priority
        },
      });

      this.queues.set(QueueManager.QUEUE_NAMES.AI_ANALYSIS, aiQueue);
      this.queues.set(QueueManager.QUEUE_NAMES.BATCH_PROCESSING, batchQueue);
      this.queues.set(QueueManager.QUEUE_NAMES.HIGH_PRIORITY, highPriorityQueue);
      this.queues.set(QueueManager.QUEUE_NAMES.LOW_PRIORITY, lowPriorityQueue);

      // Setup queue event handlers
      this.setupQueueEventHandlers();

      this.isInitialized = true;
      logger.info('✅ Queue Manager initialized successfully with Bull queues');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Queue Manager:', error);
      throw error;
    }
  }

  private setupQueueEventHandlers(): void {
    for (const [queueName, queue] of this.queues) {
      // Use generic event handler to avoid TypeScript issues with BullMQ v5
      (queue as any).on('completed', (job: any) => {
        logger.debug(`Job completed in ${queueName}:`, { 
          jobId: job?.id, 
          duration: job?.timestamp ? Date.now() - job.timestamp : 'unknown'
        });
      });

      (queue as any).on('failed', (job: any, err: Error) => {
        logger.warn(`Job failed in ${queueName}:`, { 
          jobId: job?.id, 
          error: err?.message || 'Unknown error',
          attempts: job?.attemptsMade 
        });
      });

      (queue as any).on('stalled', (jobId: string) => {
        logger.warn(`Job stalled in ${queueName}:`, { jobId });
      });
    }
  }

  async addJob(
    queueName: keyof typeof QueueManager.QUEUE_NAMES,
    jobType: string,
    data: any,
    options: any = {}
  ): Promise<string | null> {
    const queue = this.queues.get(QueueManager.QUEUE_NAMES[queueName]);
    if (!queue) {
      logger.error(`Queue not found: ${queueName}`);
      return null;
    }

    try {
      // Check memory pressure before adding job
      const memoryPressure = await this.getMemoryPressure();
      if (memoryPressure === 'CRITICAL') {
        logger.warn(`Job rejected due to critical memory pressure: ${jobType}`);
        throw new Error('System overloaded - try again later');
      }

      // Adjust job priority based on memory pressure
      if (memoryPressure === 'HIGH') {
        options.delay = (options.delay || 0) + 5000; // Add 5s delay
      }

      const job = await queue.add(jobType, data, options);
      logger.debug(`Job added to ${queueName}:`, { 
        jobId: job.id, 
        jobType, 
        memoryPressure 
      });
      
      return job.id!;
      
    } catch (error) {
      logger.error(`Failed to add job to ${queueName}:`, error);
      throw error;
    }
  }

  async getQueueStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};
    
    for (const [queueName, queue] of this.queues) {
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(),
          queue.getActive(),
          queue.getCompleted(),
          queue.getFailed(),
          queue.getDelayed(),
        ]);

        stats[queueName] = {
          waiting: waiting.length,
          active: active.length,
          completed: completed.length,
          failed: failed.length,
          delayed: delayed.length,
          total: waiting.length + active.length + completed.length + failed.length + delayed.length,
        };
      } catch (error) {
        logger.warn(`Failed to get stats for queue ${queueName}:`, error);
        stats[queueName] = { error: 'Failed to fetch stats' };
      }
    }

    return stats;
  }

  private async getMemoryPressure(): Promise<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'> {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

      if (heapUsedMB >= QueueManager.MEMORY_THRESHOLDS.CRITICAL) return 'CRITICAL';
      if (heapUsedMB >= QueueManager.MEMORY_THRESHOLDS.HIGH) return 'HIGH';
      if (heapUsedMB >= QueueManager.MEMORY_THRESHOLDS.MEDIUM) return 'MEDIUM';
      return 'LOW';
      
    } catch (error) {
      logger.warn('Failed to get memory pressure:', error);
      return 'MEDIUM'; // Safe default
    }
  }

  async getSystemHealth(): Promise<{
    queues: Record<string, any>;
    memory: { pressure: string; heapUsedMB: number };
    redis: { connected: boolean };
  }> {
    const queueStats = await this.getQueueStats();
    const memoryPressure = await this.getMemoryPressure();
    const memoryUsage = process.memoryUsage();
    const redisStats = await cacheManager.getStats();

    return {
      queues: queueStats,
      memory: {
        pressure: memoryPressure,
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
      redis: {
        connected: redisStats.connected,
      },
    };
  }

  async pauseAllQueues(): Promise<void> {
    logger.info('🚫 Pausing all queues...');
    for (const [queueName, queue] of this.queues) {
      await queue.pause();
      logger.info(`Paused queue: ${queueName}`);
    }
  }

  async resumeAllQueues(): Promise<void> {
    logger.info('▶️ Resuming all queues...');
    for (const [queueName, queue] of this.queues) {
      await queue.resume();
      logger.info(`Resumed queue: ${queueName}`);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('🔄 Shutting down Queue Manager...');
    
    // Close all workers
    for (const [workerName, worker] of this.workers) {
      await worker.close();
      logger.info(`Closed worker: ${workerName}`);
    }
    
    // Close all queues
    for (const [queueName, queue] of this.queues) {
      await queue.close();
      logger.info(`Closed queue: ${queueName}`);
    }
    
    this.queues.clear();
    this.workers.clear();
    this.isInitialized = false;
    
    logger.info('✅ Queue Manager shutdown complete');
  }
}

// Singleton instance
export const queueManager = QueueManager.getInstance();

// Graceful shutdown
process.on('SIGTERM', () => queueManager.shutdown());
process.on('SIGINT', () => queueManager.shutdown());