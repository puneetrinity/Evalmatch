/**
 * PHASE 1.5: Fixed Rate Limiting (Single Redis Store)
 * 
 * Uses the single Redis client from core/redis.ts
 * Fixed limits (no adaptive logic that was causing issues)
 */

import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../core/redis';

// Create Redis stores lazily to ensure connection is ready
let userStore: RedisStore | null = null;
let analysisStore: RedisStore | null = null;
let adminStore: RedisStore | null = null;

function createRedisStores() {
  if (!userStore) {
    userStore = new RedisStore({
      sendCommand: (...args: any[]) => (redis as any).call(...args),
      prefix: 'user-limit:',
    });
  }
  
  if (!analysisStore) {
    analysisStore = new RedisStore({
      sendCommand: (...args: any[]) => (redis as any).call(...args),
      prefix: 'analysis-limit:',
    });
  }
  
  if (!adminStore) {
    adminStore = new RedisStore({
      sendCommand: (...args: any[]) => (redis as any).call(...args),
      prefix: 'admin-limit:',
    });
  }
}

// Wait for Redis to be ready and create stores
redis.on('ready', () => {
  createRedisStores();
});

// If Redis is already ready, create stores immediately  
if (redis.status === 'ready') {
  createRedisStores();
}

// User-level rate limiting (generous for basic operations)
export const userLimiter = rateLimit({
  store: userStore,
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    retryAfter: 60
  },
  skip: () => !userStore, // Skip rate limiting if Redis store not ready
});

// Analysis-specific rate limiting (stricter for AI operations)
export const analysisLimiter = rateLimit({
  store: analysisStore,
  windowMs: 5 * 60 * 1000, // 5 minutes  
  max: 2, // 2 analysis requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Analysis rate limit exceeded',
    retryAfter: 300
  },
  skip: () => !analysisStore, // Skip rate limiting if Redis store not ready
});

// Admin operations rate limiting (very strict)
export const adminLimiter = rateLimit({
  store: adminStore,
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 admin requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Admin rate limit exceeded', 
    retryAfter: 60
  },
  skip: () => !adminStore, // Skip rate limiting if Redis store not ready
});