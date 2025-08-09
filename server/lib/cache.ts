/**
 * Simple in-memory cache implementation for caching analysis results
 * This helps reduce API calls and improve performance with larger datasets
 */

type CacheItem<T> = {
  data: T;
  expiresAt: number;
};

class AnalysisCache {
  private cache: Map<string, CacheItem<unknown>> = new Map();
  private readonly defaultTTL: number = 15 * 60 * 1000; // 15 minutes
  
  // PERFORMANCE FIX: Prevent memory leaks with size limits
  private readonly maxSize: number = 1000;
  private readonly maxMemoryMB: number = 100;
  private accessCount = new Map<string, number>();
  private cleanupTimer: NodeJS.Timeout;
  
  constructor() {
    // PERFORMANCE: Automatic cleanup every 5 minutes
    this.cleanupTimer = setInterval(() => this.performCleanup(), 5 * 60 * 1000);
  }

  /**
   * Store an item in the cache
   * @param key - The cache key
   * @param data - The data to store
   * @param ttl - Time to live in ms, defaults to 15 minutes
   */
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    // PERFORMANCE FIX: Check size limits before adding
    const serialized = JSON.stringify(data);
    const sizeBytes = new Blob([serialized]).size;
    
    // Don't cache excessively large items
    if (sizeBytes > 1024 * 1024) { // 1MB limit per item
      console.warn(`[CACHE] Item too large to cache: ${key} (${Math.round(sizeBytes / 1024)}KB)`);
      return;
    }
    
    // Evict items if we're at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }
    
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { data, expiresAt });
    this.accessCount.set(key, 0);
  }

  /**
   * Get an item from the cache
   * @param key - The cache key
   * @returns The cached data or undefined if not found or expired
   */
  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);

    // Not in cache or expired
    if (!item || item.expiresAt < Date.now()) {
      if (item) {
        // Remove expired item
        this.cache.delete(key);
        this.accessCount.delete(key);
      }
      return undefined;
    }

    // PERFORMANCE: Track access for LRU eviction
    const currentAccess = this.accessCount.get(key) || 0;
    this.accessCount.set(key, currentAccess + 1);

    return item.data as T;
  }

  /**
   * Remove an item from the cache
   * @param key - The cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate cache entries that match a prefix
   * Useful for invalidating all entries related to a specific type
   * @param keyPrefix - The key prefix to match
   */
  invalidateByPrefix(keyPrefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all items from the cache
   */
  clear(): void {
    this.cache.clear();
    this.accessCount.clear();
  }
  
  // PERFORMANCE FIX: Add memory management methods
  
  /**
   * Perform LRU eviction to prevent memory leaks
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let minAccess = Infinity;
    
    for (const [key, accessCount] of this.accessCount.entries()) {
      if (accessCount < minAccess) {
        minAccess = accessCount;
        lruKey = key;
      }
    }
    
    if (lruKey) {
      this.cache.delete(lruKey);
      this.accessCount.delete(lruKey);
    }
  }
  
  /**
   * Perform periodic cleanup of expired items
   */
  private performCleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => {
      this.cache.delete(key);
      this.accessCount.delete(key);
    });
    
    if (expiredKeys.length > 0) {
      console.log(`[CACHE] Cleanup: removed ${expiredKeys.length} expired items`);
    }
  }
  
  /**
   * Get current memory usage estimate
   */
  getMemoryUsage(): { items: number; estimatedSizeMB: number } {
    let totalSize = 0;
    
    for (const [key, item] of this.cache.entries()) {
      const serialized = JSON.stringify({ key, data: item });
      totalSize += new Blob([serialized]).size;
    }
    
    return {
      items: this.cache.size,
      estimatedSizeMB: totalSize / (1024 * 1024)
    };
  }
  
  /**
   * Destroy cache and cleanup timers
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }

  /**
   * Get cache stats
   * @returns Object with count of total and expired items
   */
  getStats(): { total: number; expired: number } {
    const now = Date.now();
    let expired = 0;

    for (const item of this.cache.values()) {
      if (item.expiresAt < now) {
        expired++;
      }
    }

    return {
      total: this.cache.size,
      expired,
    };
  }
}

// Export singleton instance
export const analysisCache = new AnalysisCache();

// PERFORMANCE FIX: Cleanup on process exit
process.on('SIGTERM', () => analysisCache.destroy());
process.on('SIGINT', () => analysisCache.destroy());

/**
 * Generate a cache key for resume analysis
 */
export function generateResumeAnalysisKey(resumeId: number): string {
  return `resume:${resumeId}:analysis`;
}

/**
 * Generate a cache key for job description analysis
 */
export function generateJobAnalysisKey(jobId: number): string {
  return `job:${jobId}:analysis`;
}

/**
 * Generate a cache key for match analysis
 */
export function generateMatchAnalysisKey(
  resumeId: number,
  jobId: number,
): string {
  return `match:${resumeId}:${jobId}`;
}

/**
 * Generate a cache key for interview questions
 */
export function generateInterviewQuestionsKey(
  resumeId: number,
  jobId: number,
): string {
  return `questions:${resumeId}:${jobId}`;
}

/**
 * Generate a cache key for bias analysis
 */
export function generateBiasAnalysisKey(jobId: number): string {
  return `bias:${jobId}`;
}

/**
 * Calculate a hash for a string
 * Used for generating cache keys from content
 */
export function calculateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}
