import Redis from "ioredis";
import { logger } from "./logger";
import crypto from "crypto";

/**
 * PERFORMANCE: Redis caching layer for 50% API reduction
 * Implements intelligent caching with TTL strategies
 */
export class CacheManager {
  private redis: Redis | null = null;
  private isConnected: boolean = false;
  private connectionAttempts: number = 0;
  private readonly MAX_RETRIES = 3;

  // TTL strategies for different operations (in seconds)
  static readonly TTL = {
    SKILL_NORMALIZATION: 24 * 60 * 60,    // 24 hours
    RESUME_ANALYSIS: 60 * 60,             // 1 hour  
    JOB_ANALYSIS: 4 * 60 * 60,            // 4 hours
    BIAS_ANALYSIS: 4 * 60 * 60,           // 4 hours
    EMBEDDINGS: 7 * 24 * 60 * 60,         // 7 days
    SKILL_MATCH: 2 * 60 * 60,             // 2 hours
    INTERVIEW_QUESTIONS: 30 * 60,         // 30 minutes
  };

  constructor() {
    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.connectionAttempts >= this.MAX_RETRIES) {
      logger.warn("Redis connection failed after max retries, cache disabled");
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) {
            logger.error("Redis connection failed, disabling cache");
            return null;
          }
          return Math.min(times * 1000, 3000);
        },
        lazyConnect: false,
        enableOfflineQueue: false,
      });

      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis cache connected successfully');
      });

      this.redis.on('error', (error: Error) => {
        logger.error('Redis cache error:', error);
        this.isConnected = false;
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });

      // Test connection
      await this.redis.ping();
      this.isConnected = true;
      
    } catch (error) {
      this.connectionAttempts++;
      logger.warn(`Redis connection attempt ${this.connectionAttempts} failed:`, error);
      this.isConnected = false;
      
      // Retry connection after delay
      if (this.connectionAttempts < this.MAX_RETRIES) {
        setTimeout(() => this.connect(), 5000);
      }
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.redis) {
      return null;
    }

    try {
      const cached = await this.redis.get(key);
      if (!cached) {
        return null;
      }

      const parsed = JSON.parse(cached);
      logger.debug("Cache hit", { key, size: cached.length });
      return parsed as T;
      
    } catch (error) {
      logger.warn("Cache get failed", { key, error });
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 3600): Promise<void> {
    if (!this.isConnected || !this.redis) {
      return;
    }

    try {
      const serialized = JSON.stringify(value);
      
      // Don't cache large objects (>1MB)
      if (serialized.length > 1024 * 1024) {
        logger.warn("Cache set skipped - value too large", { 
          key, 
          sizeMB: Math.round(serialized.length / 1024 / 1024) 
        });
        return;
      }

      await this.redis.setex(key, ttlSeconds, serialized);
      logger.debug("Cache set", { key, ttl: ttlSeconds, size: serialized.length });
      
    } catch (error) {
      logger.warn("Cache set failed", { key, error });
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<void> {
    if (!this.isConnected || !this.redis) {
      return;
    }

    try {
      await this.redis.del(key);
      logger.debug("Cache delete", { key });
    } catch (error) {
      logger.warn("Cache delete failed", { key, error });
    }
  }

  /**
   * Clear all cache entries matching pattern
   */
  async clearPattern(pattern: string): Promise<void> {
    if (!this.isConnected || !this.redis) {
      return;
    }

    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Cleared ${keys.length} cache entries matching pattern`, { pattern });
      }
    } catch (error) {
      logger.warn("Cache clear pattern failed", { pattern, error });
    }
  }

  /**
   * Generate cache key with namespace
   */
  static generateKey(namespace: string, ...parts: string[]): string {
    const combined = [namespace, ...parts].join(':');
    return `evalmatch:${combined}`;
  }

  /**
   * Generate hash-based cache key for long content
   */
  static generateHashKey(namespace: string, content: string, ...extra: string[]): string {
    const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    return CacheManager.generateKey(namespace, hash, ...extra);
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ connected: boolean; info?: any }> {
    if (!this.isConnected || !this.redis) {
      return { connected: false };
    }

    try {
      const info = await this.redis.info('stats');
      return { connected: true, info };
    } catch (error) {
      return { connected: false };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.redis) {
      logger.info("Shutting down Redis cache");
      await this.redis.quit();
      this.isConnected = false;
    }
  }
}

// Singleton instance
export const cacheManager = new CacheManager();

// Graceful shutdown
process.on('SIGTERM', () => cacheManager.shutdown());
process.on('SIGINT', () => cacheManager.shutdown());