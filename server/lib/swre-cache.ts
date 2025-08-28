/**
 * Stale-While-Revalidate Cache with Memory Pressure Awareness
 * 
 * Provides fast cache responses while refreshing in background.
 * Respects memory pressure - won't trigger expensive operations during critical conditions.
 */

import { redis } from '../core/redis';
import { getMemoryPressure } from '../observability/health-snapshot';
import { logger } from './logger';

interface CacheEntry<T> {
  data: T;
  at: number; // timestamp when cached
}

interface SWREOptions {
  ttl?: number;    // Total TTL in seconds (default 24h)
  swr?: number;    // Stale-while-revalidate window in seconds (default 6h)
  key?: string;    // Optional key override
}

interface SWREResult<T> {
  data: T;
  stale: boolean;
  hit: boolean;
  age: number; // age in seconds
  memoryPressure?: string;
  refreshTriggered?: boolean;
}

/**
 * Get data with stale-while-revalidate pattern
 * 
 * @param key Cache key
 * @param fetcher Function to fetch fresh data
 * @param options Cache configuration
 */
export async function getOrSWRE<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SWREOptions = {}
): Promise<SWREResult<T>> {
  const { ttl = 86400, swr = 21600 } = options; // 24h TTL, 6h SWR window
  const memoryPressure = getMemoryPressure();
  
  try {
    // Try to get from cache first
    const raw = await redis.get(key);
    
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);
      const age = (Date.now() - entry.at) / 1000;
      const isStale = age > swr;
      
      // Background refresh logic
      let refreshTriggered = false;
      if (isStale && memoryPressure !== 'critical') {
        refreshTriggered = true;
        
        // Trigger background refresh (don't await)
        refreshInBackground(key, fetcher, ttl, age);
      }
      
      logger.debug('SWRE cache hit', {
        key,
        age: Math.round(age),
        stale: isStale,
        memoryPressure,
        refreshTriggered
      });
      
      return {
        data: entry.data,
        stale: isStale,
        hit: true,
        age: Math.round(age),
        memoryPressure,
        refreshTriggered
      };
    }
    
    // Cache miss - fetch fresh data
    logger.debug('SWRE cache miss', { key, memoryPressure });
    const data = await fetcher();
    
    // Cache the fresh data
    await cacheData(key, data, ttl);
    
    return {
      data,
      stale: false,
      hit: false,
      age: 0,
      memoryPressure
    };
    
  } catch (error) {
    logger.warn('SWRE cache operation failed', { key, error });
    
    // Try to fetch directly if cache operations fail
    try {
      const data = await fetcher();
      return {
        data,
        stale: false,
        hit: false,
        age: 0,
        memoryPressure
      };
    } catch (fetchError) {
      logger.error('SWRE fetcher failed after cache failure', { key, error: fetchError });
      throw fetchError;
    }
  }
}

/**
 * Background refresh without blocking the response
 */
async function refreshInBackground<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number,
  currentAge: number
): Promise<void> {
  try {
    logger.debug('SWRE background refresh started', { key, currentAge });
    
    const startTime = Date.now();
    const data = await fetcher();
    const duration = Date.now() - startTime;
    
    await cacheData(key, data, ttl);
    
    logger.info('SWRE background refresh completed', { 
      key, 
      duration,
      previousAge: Math.round(currentAge)
    });
    
  } catch (error) {
    logger.warn('SWRE background refresh failed', { key, error });
    // Don't throw - background refresh failures shouldn't affect responses
  }
}

/**
 * Cache data with timestamp
 */
async function cacheData<T>(key: string, data: T, ttl: number): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    at: Date.now()
  };
  
  await redis.setex(key, ttl, JSON.stringify(entry));
}

/**
 * Generate cache key from components
 */
export function generateCacheKey(namespace: string, ...components: string[]): string {
  // Create SHA256 hash of components for consistent, collision-resistant keys
  const crypto = require('crypto');
  const combined = [namespace, ...components].join(':');
  const hash = crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
  return `swre:${namespace}:${hash}`;
}

/**
 * Invalidate cache entry
 */
export async function invalidateCache(key: string): Promise<void> {
  try {
    await redis.del(key);
    logger.debug('SWRE cache invalidated', { key });
  } catch (error) {
    logger.warn('SWRE cache invalidation failed', { key, error });
  }
}

/**
 * Warm cache with data (useful for preloading)
 */
export async function warmCache<T>(
  key: string,
  data: T,
  ttl: number = 86400
): Promise<void> {
  try {
    await cacheData(key, data, ttl);
    logger.debug('SWRE cache warmed', { key });
  } catch (error) {
    logger.warn('SWRE cache warming failed', { key, error });
  }
}

/**
 * Get cache statistics for monitoring
 */
export async function getCacheStats(pattern: string = 'swre:*'): Promise<{
  keys: number;
  memoryUsage?: number;
  hitRate?: number;
}> {
  try {
    const keys = await redis.keys(pattern);
    return {
      keys: keys.length,
      // Note: memory usage would require Redis INFO command
      // hitRate would require tracking hits/misses over time
    };
  } catch (error) {
    logger.warn('SWRE cache stats failed', { error });
    return { keys: 0 };
  }
}

// Export common cache configurations
export const CACHE_CONFIGS = {
  // Analysis results - high value, medium TTL
  ANALYSIS: { ttl: 24 * 3600, swr: 6 * 3600 },   // 24h TTL, 6h SWR
  
  // Embeddings - very high value, long TTL  
  EMBEDDINGS: { ttl: 7 * 24 * 3600, swr: 24 * 3600 }, // 7d TTL, 1d SWR
  
  // Skill normalization - medium value, long TTL
  SKILLS: { ttl: 48 * 3600, swr: 12 * 3600 },    // 48h TTL, 12h SWR
  
  // Job analysis - medium value, medium TTL
  JOBS: { ttl: 12 * 3600, swr: 4 * 3600 },       // 12h TTL, 4h SWR
  
  // Interview questions - lower value, shorter TTL
  INTERVIEWS: { ttl: 6 * 3600, swr: 2 * 3600 }   // 6h TTL, 2h SWR
};