/**
 * PHASE 1.1: Single Redis Client (Leaf Module)
 * 
 * This is a LEAF module with ZERO upstream imports.
 * Eliminates the 3 competing Redis clients that were causing 502s.
 * 
 * NO IMPORTS FROM: app, queues, routes, middleware, services
 * Only system-level imports allowed.
 */

import IORedis from 'ioredis';

// PERFORMANCE FIX: Only create Redis client if REDIS_URL is configured
// Prevents connection errors in environments without Redis
let redis: IORedis | null = null;

if (process.env.REDIS_URL) {
  redis = new IORedis(process.env.REDIS_URL, {
    enableReadyCheck: true,
    connectTimeout: 2000,
    lazyConnect: false,
    autoResubscribe: true,
    // Connection pool settings optimized for Railway
    maxRetriesPerRequest: 3,
    keepAlive: 30000,
    // Timeout settings
    commandTimeout: 5000,
    enableOfflineQueue: false,
  });

  // Essential error handling only
  redis.on('error', e => console.error('[redis]', e.message));
  redis.on('connect', () => console.log('[redis] connected'));
  redis.on('ready', () => console.log('[redis] ready'));
  redis.on('close', () => console.log('[redis] connection closed'));
} else {
  console.log('[redis] Redis not configured - rate limiters will use memory fallback');
}

// Export redis instance (may be null)
export { redis };

// Export for debugging (do not use in production code)
export const getRedisStatus = () => ({
  status: redis?.status || 'not_configured',
  connected: redis?.status === 'ready'
});