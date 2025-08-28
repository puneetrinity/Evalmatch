import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";
import { shouldBypassMiddleware, conditionalMiddleware } from "./fast-path";

// Create test-safe rate limiter configuration with fast-path bypass
const createTestSafeRateLimiter = (options: any) => {
  // Skip rate limiting entirely in test environment
  if (process.env.NODE_ENV === "test") {
    return (_req: any, _res: any, next: any) => next();
  }
  
  const limiter = rateLimit(options);
  
  // Wrap with conditional middleware to bypass fast-path endpoints
  return conditionalMiddleware((req, res, next) => {
    limiter(req, res, next);
  });
};

// Auth endpoints rate limiter - stricter limits to prevent brute force
export const authRateLimiter = createTestSafeRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per IP per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  // Removed trustProxy: true since Express app sets it globally
  handler: (req: any, res: any) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      error: "Too many authentication attempts",
      message: "Please wait 15 minutes before trying again",
      retryAfter: 15 * 60, // seconds
      code: "RATE_LIMIT_EXCEEDED"
    });
  },
  skip: (_req: any) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV === "development";
  },
});

// SURGICAL FIX: Static API rate limiter - no adaptive logic, no async per-request work
export const apiRateLimiter = createTestSafeRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 1000, // INCREASED: 1000 requests per minute (static, no system-load awareness)
  standardHeaders: true,
  legacyHeaders: false,
  // Skip expensive IP resolution and async work
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  // Fast static handler - no async logging
  handler: (req: any, res: any) => {
    res.status(429).json({
      error: "Too many requests",
      message: "Please slow down your requests", 
      retryAfter: 60,
      code: "RATE_LIMIT_EXCEEDED"
    });
  },
});

// File upload rate limiter - prevent abuse
export const uploadRateLimiter = createTestSafeRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  // Removed trustProxy: true since Express app sets it globally
  handler: (req: any, res: any) => {
    logger.warn(`Upload rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "Too many uploads",
      message: "You can upload up to 20 files per hour",
      retryAfter: 60 * 60, // seconds
      code: "RATE_LIMIT_EXCEEDED"
    });
  },
  skip: (_req: any) => {
    // Skip rate limiting in development and test
    return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  },
});
