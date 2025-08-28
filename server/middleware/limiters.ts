/**
 * PHASE 1.5: Fixed Rate Limiting (Single Redis Store)
 * 
 * Uses the single Redis client from core/redis.ts
 * Fixed limits (no adaptive logic that was causing issues)
 */

import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../core/redis';
import { Request, Response, NextFunction } from 'express';

// Create rate limiters lazily to ensure Redis connection is ready
let userLimiter: any = null;
let analysisLimiter: any = null;  
let adminLimiter: any = null;

function createRateLimiters() {
  try {
    // Create separate Redis stores for each rate limiter
    const userStore = new RedisStore({
      sendCommand: (...args: any[]) => (redis as any).call(...args),
      prefix: 'user-limit:',
    });

    const analysisStore = new RedisStore({
      sendCommand: (...args: any[]) => (redis as any).call(...args),
      prefix: 'analysis-limit:',
    });

    const adminStore = new RedisStore({
      sendCommand: (...args: any[]) => (redis as any).call(...args),
      prefix: 'admin-limit:',
    });

    // Create rate limiters with Redis stores
    userLimiter = rateLimit({
      store: userStore,
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 requests per minute per IP
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Too many requests',
        retryAfter: 60
      }
    });

    analysisLimiter = rateLimit({
      store: analysisStore,
      windowMs: 5 * 60 * 1000, // 5 minutes  
      max: 2, // 2 analysis requests per 5 minutes
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Analysis rate limit exceeded',
        retryAfter: 300
      }
    });

    adminLimiter = rateLimit({
      store: adminStore,
      windowMs: 60 * 1000, // 1 minute
      max: 5, // 5 admin requests per minute
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: 'Admin rate limit exceeded', 
        retryAfter: 60
      }
    });

    console.log('[rate-limiters] Redis-backed rate limiters initialized');
  } catch (error) {
    console.error('[rate-limiters] Failed to create Redis stores:', error);
    
    // Fall back to memory-based rate limiters
    userLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests', retryAfter: 60 }
    });

    analysisLimiter = rateLimit({
      windowMs: 5 * 60 * 1000,
      max: 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Analysis rate limit exceeded', retryAfter: 300 }
    });

    adminLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Admin rate limit exceeded', retryAfter: 60 }
    });

    console.log('[rate-limiters] Using memory-based rate limiters as fallback');
  }
}

// Initialize rate limiters when Redis is ready
redis.on('ready', () => {
  if (!userLimiter) {
    createRateLimiters();
  }
});

// If Redis is already ready, create limiters immediately
if (redis.status === 'ready') {
  createRateLimiters();
} else {
  // Create fallback limiters immediately for startup
  console.log('[rate-limiters] Creating fallback rate limiters during startup');
  
  userLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests', retryAfter: 60 }
  });

  analysisLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 2,
    standardHeaders: true, 
    legacyHeaders: false,
    message: { error: 'Analysis rate limit exceeded', retryAfter: 300 }
  });

  adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Admin rate limit exceeded', retryAfter: 60 }
  });
}

// Export wrapper functions that use the lazily-created limiters
export const userLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (userLimiter) {
    return userLimiter(req, res, next);
  }
  next();
};

export const analysisLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (analysisLimiter) {
    return analysisLimiter(req, res, next);
  }
  next();
};

export const adminLimiterMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (adminLimiter) {
    return adminLimiter(req, res, next);
  }
  next();
};

// For backward compatibility, export the middleware functions with original names
export { userLimiterMiddleware as userLimiter };
export { analysisLimiterMiddleware as analysisLimiter };
export { adminLimiterMiddleware as adminLimiter };