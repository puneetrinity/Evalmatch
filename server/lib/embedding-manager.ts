import { logger } from "./logger";
import crypto from "crypto";

/**
 * PERFORMANCE: Embedding manager with memory leak prevention
 * Implements comprehensive memory management for ML pipeline
 * Addresses service crashes under load
 */
export class EmbeddingManager {
  private embeddings: Map<string, { embedding: number[], accessTime: number }> = new Map();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes
  private readonly MAX_AGE = 3600000; // 1 hour
  private cleanupTimer: NodeJS.Timeout | null = null;
  private memoryMonitorTimer: NodeJS.Timeout | null = null;
  private accessOrder: string[] = []; // LRU tracking

  constructor() {
    // Start periodic cleanup
    this.cleanupTimer = setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
    
    // Graceful shutdown - only in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
    }
    
    // Monitor memory usage
    this.monitorMemory();
  }

  /**
   * Get or generate embedding with cache management
   */
  async getEmbedding(text: string, generator: (_text: string) => Promise<number[]>): Promise<number[]> {
    const cacheKey = this.getCacheKey(text);
    
    // Check cache first
    const cached = this.embeddings.get(cacheKey);
    if (cached) {
      // Update access time and order
      cached.accessTime = Date.now();
      this.updateAccessOrder(cacheKey);
      logger.debug("Embedding cache hit", { cacheKey });
      return cached.embedding;
    }
    
    // Generate new embedding
    const embedding = await generator(text);
    
    // Add to cache with memory management
    this.addToCache(cacheKey, embedding);
    
    return embedding;
  }

  /**
   * Add embedding to cache with size management
   */
  private addToCache(key: string, embedding: number[]): void {
    // Check memory before adding
    const memoryUsage = process.memoryUsage();
    if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB threshold
      logger.warn("High memory usage, clearing embedding cache", { 
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) 
      });
      this.clearOldest(Math.floor(this.embeddings.size / 2)); // Clear half
    }
    
    // Enforce size limit
    if (this.embeddings.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }
    
    // Add to cache
    this.embeddings.set(key, { embedding, accessTime: Date.now() });
    this.accessOrder.push(key);
    
    logger.debug("Embedding cached", { 
      key, 
      cacheSize: this.embeddings.size,
      memoryMB: Math.round(memoryUsage.heapUsed / 1024 / 1024)
    });
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    if (this.accessOrder.length === 0) return;
    
    const oldestKey = this.accessOrder.shift();
    if (oldestKey) {
      this.embeddings.delete(oldestKey);
      logger.debug("Evicted oldest embedding", { key: oldestKey });
    }
  }

  /**
   * Clear multiple oldest entries
   */
  private clearOldest(count: number): void {
    const toRemove = this.accessOrder.splice(0, count);
    for (const key of toRemove) {
      this.embeddings.delete(key);
    }
    logger.info(`Cleared ${toRemove.length} oldest embeddings`);
  }

  /**
   * Periodic cleanup of old entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, data] of this.embeddings.entries()) {
      if (now - data.accessTime > this.MAX_AGE) {
        this.embeddings.delete(key);
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
          this.accessOrder.splice(index, 1);
        }
        removed++;
      }
    }
    
    if (removed > 0) {
      logger.info(`Cleaned up ${removed} expired embeddings`);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logger.debug("Forced garbage collection after cleanup");
    }
  }

  /**
   * Monitor memory usage and alert
   */
  private monitorMemory(): void {
    this.memoryMonitorTimer = setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      
      if (heapUsedMB > 600) { // 600MB warning threshold
        logger.warn("High memory usage detected in embedding manager", {
          heapUsedMB,
          heapTotalMB,
          cacheSize: this.embeddings.size,
          usage: `${Math.round((heapUsedMB / heapTotalMB) * 100)}%`
        });
        
        // Emergency cleanup
        this.clearOldest(Math.floor(this.embeddings.size * 0.75));
      }
    }, 60000); // Check every minute
  }

  /**
   * Generate cache key
   */
  private getCacheKey(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Graceful shutdown
   */
  public shutdown(): void {
    logger.info("Shutting down embedding manager");
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    if (this.memoryMonitorTimer) {
      clearInterval(this.memoryMonitorTimer);
    }
    
    this.embeddings.clear();
    this.accessOrder = [];
    
    logger.info("Embedding manager shutdown complete");
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; memoryMB: number; oldestAge: number } {
    const now = Date.now();
    let oldestAge = 0;
    
    for (const data of this.embeddings.values()) {
      const age = now - data.accessTime;
      if (age > oldestAge) oldestAge = age;
    }
    
    return {
      size: this.embeddings.size,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      oldestAge: Math.round(oldestAge / 1000) // seconds
    };
  }
}

// Singleton instance
export const embeddingManager = new EmbeddingManager();