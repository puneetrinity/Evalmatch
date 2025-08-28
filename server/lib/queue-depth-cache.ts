/**
 * Queue Depth Cache (5s TTL)
 * 
 * Caches BullMQ queue statistics to avoid expensive getJobCounts() calls
 * on every provider selection. Refreshes every 5 seconds automatically.
 */

import { logger } from './logger';

interface QueueCounts {
  waiting: number;
  active: number;
  failed: number;
  delayed?: number;
  completed?: number;
}

interface CacheEntry {
  ts: number;
  counts: QueueCounts;
}

const cache = new Map<string, CacheEntry>();
const TTL = Number(process.env.QUEUE_COUNTS_TTL_MS ?? 5000);

// Import queue manager to get actual counts
let aiQueues: any = null;

// Lazy import to avoid circular dependencies
async function getAiQueues() {
  if (!aiQueues) {
    try {
      const { queueManager } = await import('./queue-manager');
      // Get the actual queues from the queue manager
      aiQueues = {
        openai: queueManager.queues?.get('ai-analysis') || null,
        anthropic: queueManager.queues?.get('ai-analysis') || null, 
        groq: queueManager.queues?.get('ai-analysis') || null
      };
    } catch (error) {
      logger.warn('Failed to import queue manager for queue depth caching', { error });
      aiQueues = {};
    }
  }
  return aiQueues;
}

/**
 * Get cached queue counts for a provider
 * Returns cached value if fresh (< 5s old), otherwise fetches new data
 */
export async function getCounts(provider: string): Promise<QueueCounts> {
  const now = Date.now();
  const hit = cache.get(provider);
  
  // Return cached data if fresh
  if (hit && now - hit.ts < TTL) {
    return hit.counts;
  }

  // Fetch fresh data
  try {
    const queues = await getAiQueues();
    const queue = queues[provider];
    
    let counts: QueueCounts = { waiting: 0, active: 0, failed: 0 };
    
    if (queue && typeof queue.getJobCounts === 'function') {
      const rawCounts = await queue.getJobCounts();
      counts = {
        waiting: rawCounts.waiting || 0,
        active: rawCounts.active || 0,
        failed: rawCounts.failed || 0,
        delayed: rawCounts.delayed || 0,
        completed: rawCounts.completed || 0
      };
    }
    
    // Cache the result
    cache.set(provider, { ts: now, counts });
    
    // Log cache miss for monitoring
    logger.debug('Queue counts cache miss', { 
      provider, 
      counts,
      cacheSize: cache.size 
    });
    
    return counts;
    
  } catch (error) {
    logger.warn('Failed to get queue counts', { provider, error });
    
    // Return default safe values on error
    const defaultCounts = { waiting: 0, active: 0, failed: 0 };
    cache.set(provider, { ts: now, counts: defaultCounts });
    return defaultCounts;
  }
}

/**
 * Get all cached queue counts for multiple providers
 */
export async function getAllCounts(providers: string[]): Promise<Record<string, QueueCounts>> {
  const results = await Promise.all(
    providers.map(async provider => [provider, await getCounts(provider)] as const)
  );
  
  return Object.fromEntries(results);
}

/**
 * Force refresh cache for a provider
 */
export async function refreshCache(provider: string): Promise<QueueCounts> {
  cache.delete(provider);
  return getCounts(provider);
}

/**
 * Clear all cached queue counts
 */
export function clearCache(): void {
  cache.clear();
  logger.info('Queue depth cache cleared');
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats() {
  const now = Date.now();
  const entries = Array.from(cache.entries());
  
  return {
    size: cache.size,
    ttlMs: TTL,
    entries: entries.map(([provider, entry]) => ({
      provider,
      ageMs: now - entry.ts,
      fresh: (now - entry.ts) < TTL,
      counts: entry.counts
    }))
  };
}

// Cleanup old cache entries periodically (every 30 seconds)
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    const expiredThreshold = TTL * 2; // Remove entries older than 2x TTL
    
    for (const [provider, entry] of Array.from(cache.entries())) {
      if (now - entry.ts > expiredThreshold) {
        cache.delete(provider);
      }
    }
    
    const currentEntries = Array.from(cache.entries());
    
    // Log cleanup if we removed entries
    if (cache.size < currentEntries.length) {
      logger.debug('Queue depth cache cleanup completed', {
        removed: currentEntries.length - cache.size,
        remaining: cache.size
      });
    }
  }, 30000);
}