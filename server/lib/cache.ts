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

  /**
   * Store an item in the cache
   * @param key - The cache key
   * @param data - The data to store
   * @param ttl - Time to live in ms, defaults to 15 minutes
   */
  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { data, expiresAt });
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
      }
      return undefined;
    }

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
