/**
 * PHASE 1.5: Fixed Rate Limiting (Single Redis Store)
 * 
 * Uses the single Redis client from core/redis.ts
 * Fixed limits (no adaptive logic that was causing issues)
 */

import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../core/redis';

// Single Redis store for all rate limiters
const store = new RedisStore({
  sendCommand: (...args: any[]) => (redis as any).call(...args),
});

// User-level rate limiting (generous for basic operations)
export const userLimiter = rateLimit({
  store,
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    retryAfter: 60
  }
});

// Analysis-specific rate limiting (stricter for AI operations)
export const analysisLimiter = rateLimit({
  store,
  windowMs: 5 * 60 * 1000, // 5 minutes  
  max: 2, // 2 analysis requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Analysis rate limit exceeded',
    retryAfter: 300
  }
});

// Admin operations rate limiting (very strict)
export const adminLimiter = rateLimit({
  store,
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 admin requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Admin rate limit exceeded', 
    retryAfter: 60
  }
});