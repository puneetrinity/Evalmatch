/**
 * Rate Limiter for Database Queries
 *
 * Implements adaptive rate limiting for database connections to prevent
 * overwhelming Neon PostgreSQL with too many requests, which can trigger
 * rate limiting on their end.
 */

// Configuration for the rate limiter
interface RateLimiterConfig {
  maxRequestsPerInterval: number; // Maximum allowed requests per interval
  intervalMs: number; // Interval length in milliseconds
  burstFactor: number; // Allow occasional bursts up to this factor
  throttleDelayMs: number; // Delay to apply when throttling
  maxQueueSize: number; // Maximum size of the queue before rejecting
}

// Default configurations for different environments
const defaultConfig: Record<string, RateLimiterConfig> = {
  development: {
    maxRequestsPerInterval: 20, // 20 requests per interval
    intervalMs: 1000, // 1 second interval
    burstFactor: 2, // Allow up to 2x bursts
    throttleDelayMs: 100, // 100ms delay when throttling
    maxQueueSize: 100, // Allow up to 100 operations in queue
  },
  production: {
    maxRequestsPerInterval: 50, // 50 requests per interval
    intervalMs: 1000, // 1 second interval
    burstFactor: 1.5, // Allow up to 1.5x bursts
    throttleDelayMs: 50, // 50ms delay when throttling
    maxQueueSize: 200, // Allow up to 200 operations in queue
  },
  test: {
    maxRequestsPerInterval: 100, // 100 requests per interval for tests
    intervalMs: 1000, // 1 second interval
    burstFactor: 3, // Allow up to 3x bursts
    throttleDelayMs: 10, // 10ms delay when throttling
    maxQueueSize: 50, // Allow up to 50 operations in queue
  },
};

export class DatabaseRateLimiter {
  private config: RateLimiterConfig;
  private requestTimestamps: number[] = [];
  private pendingOperations: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
    operation: () => Promise<unknown>;
    context: string;
  }> = [];
  private isProcessingQueue = false;
  private consecutiveThrottles = 0;
  private enabled = true;
  private lastRateLimitHit: Date | null = null;

  constructor(config?: Partial<RateLimiterConfig>) {
    const env = process.env.NODE_ENV || "development";
    this.config = {
      ...defaultConfig[env],
      ...config,
    };

    // Start the queue processor
    this.processQueue();

    console.log(`Database rate limiter initialized (${env} mode):`);
    console.log(
      `- Max requests: ${this.config.maxRequestsPerInterval} per ${this.config.intervalMs}ms`,
    );
    console.log(`- Burst factor: ${this.config.burstFactor}x`);
  }

  /**
   * Execute an operation through the rate limiter
   * @param operation Function to execute
   * @param context Description of the operation for logging
   * @returns Promise resolving to the operation result
   */
  async execute<T>(
    operation: () => Promise<T>,
    context = "db operation",
  ): Promise<T> {
    // Clean up old timestamps
    this.cleanOldTimestamps();

    // If rate limiting is disabled, just execute the operation
    if (!this.enabled) {
      return operation();
    }

    // Calculate current request rate
    const currentRate = this.requestTimestamps.length;
    const maxAllowedRequests =
      this.config.maxRequestsPerInterval * this.config.burstFactor;

    // If we're under the limit, execute immediately
    if (currentRate < this.config.maxRequestsPerInterval) {
      this.recordRequest();
      this.consecutiveThrottles = 0;
      return operation();
    }

    // If we're over the burst limit, queue the operation
    if (currentRate >= maxAllowedRequests) {
      return this.queueOperation(operation, context);
    }

    // We're between normal and burst limit, add some throttling delay
    this.consecutiveThrottles++;
    const delay = this.config.throttleDelayMs * this.consecutiveThrottles;

    // Log throttling information
    if (this.consecutiveThrottles > 3) {
      console.warn(
        `Rate limiting database operations: ${currentRate}/${this.config.maxRequestsPerInterval} requests, delaying ${delay}ms`,
      );
    }

    // Apply throttling delay
    await new Promise((resolve) => setTimeout(resolve, delay));
    this.recordRequest();

    return operation();
  }

  /**
   * Queue an operation for later execution
   */
  private queueOperation<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    // If queue is already full, reject the operation
    if (this.pendingOperations.length >= this.config.maxQueueSize) {
      // Record the rate limit hit
      this.lastRateLimitHit = new Date();
      return Promise.reject(
        new Error(
          `Database operation queue full (${this.config.maxQueueSize} max). Too many concurrent operations.`,
        ),
      );
    }

    // Queue the operation
    return new Promise<T>((resolve, reject) => {
      this.pendingOperations.push({
        resolve: resolve as (value?: unknown) => void,
        reject,
        operation,
        context,
      });

      // Make sure queue processor is running
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued operations
   */
  private processQueue() {
    if (this.pendingOperations.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;

    // Check if we can process more operations now
    this.cleanOldTimestamps();
    const currentRate = this.requestTimestamps.length;

    if (currentRate < this.config.maxRequestsPerInterval) {
      // Process the next operation
      const next = this.pendingOperations.shift();
      if (next) {
        this.recordRequest();

        // Log queue information if there are many operations
        if (this.pendingOperations.length > 10) {
          console.log(
            `Processing database operation queue: ${this.pendingOperations.length} remaining operations`,
          );
        }

        next
          .operation()
          .then(next.resolve)
          .catch(next.reject)
          .finally(() => {
            // Schedule next queue processing
            setTimeout(() => this.processQueue(), this.config.throttleDelayMs);
          });
      } else {
        // Schedule next queue processing
        setTimeout(() => this.processQueue(), this.config.throttleDelayMs);
      }
    } else {
      // Wait for the next interval before processing more
      const waitTime = this.calculateWaitTime();

      if (this.pendingOperations.length > 0) {
        console.log(
          `Rate limited: waiting ${waitTime}ms before processing ${this.pendingOperations.length} queued database operations`,
        );
      }

      setTimeout(() => this.processQueue(), waitTime);
    }
  }

  /**
   * Record a new request timestamp
   */
  private recordRequest() {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Remove timestamps older than the interval
   */
  private cleanOldTimestamps() {
    const cutoff = Date.now() - this.config.intervalMs;
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => ts >= cutoff,
    );
  }

  /**
   * Calculate wait time before processing more operations
   */
  private calculateWaitTime(): number {
    if (this.requestTimestamps.length === 0) {
      return this.config.throttleDelayMs;
    }

    // Find the oldest timestamp in the current interval
    const oldest = Math.min(...this.requestTimestamps);
    const timeToWait = oldest + this.config.intervalMs - Date.now();

    // Add a small buffer to ensure we're outside the interval
    return Math.max(timeToWait + 50, this.config.throttleDelayMs);
  }

  /**
   * Enable or disable rate limiting
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log(`Database rate limiting ${enabled ? "enabled" : "disabled"}`);
  }

  /**
   * Get statistics about the rate limiter
   */
  getStats() {
    return {
      currentRate: this.requestTimestamps.length,
      maxRate: this.config.maxRequestsPerInterval,
      queueLength: this.pendingOperations.length,
      consecutiveThrottles: this.consecutiveThrottles,
      enabled: this.enabled,
      lastRateLimitHit: this.lastRateLimitHit,
    };
  }
}

// Export a singleton instance
export const dbRateLimiter = new DatabaseRateLimiter();
