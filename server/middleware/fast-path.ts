/**
 * SURGICAL FIX: Fast Path Middleware for Critical Endpoints
 * 
 * Provides fast-path exemptions for critical endpoints that must respond 
 * quickly during load testing and high traffic scenarios.
 * 
 * This middleware should be applied BEFORE any expensive middleware
 * like rate limiters, health checks, or authentication.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// Critical endpoints that need fast-path treatment
const FAST_PATH_ENDPOINTS = new Set([
  '/api/health',
  '/api/v1/health', 
  '/api/healthz',
  '/api/v1/healthz',
  '/api/version',
  '/api/v1/version',
  '/api/readyz',
  '/api/v1/readyz',
  '/api/ready',
  '/api/v1/ready',
  '/api/ping',
  '/api/v1/ping'
]);

// Static responses for ultra-fast endpoints
const STATIC_RESPONSES = {
  '/api/healthz': {
    status: 'ok',
    timestamp: () => new Date().toISOString(),
    service: 'evalmatch-api',
    version: '1.0.0',
    uptime: () => Math.round(process.uptime())
  },
  '/api/v1/healthz': {
    status: 'ok',
    timestamp: () => new Date().toISOString(),
    service: 'evalmatch-api',
    version: '1.0.0',
    uptime: () => Math.round(process.uptime())
  },
  '/api/version': {
    version: '1.0.0',
    timestamp: () => new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  },
  '/api/v1/version': {
    version: '1.0.0',
    timestamp: () => new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  },
  '/api/readyz': {
    status: 'ready',
    timestamp: () => new Date().toISOString(),
    uptime: () => Math.round(process.uptime())
  },
  '/api/v1/readyz': {
    status: 'ready',
    timestamp: () => new Date().toISOString(),
    uptime: () => Math.round(process.uptime())
  },
  '/api/ping': {
    status: 'alive',
    timestamp: () => Date.now(),
    uptime: () => Math.round(process.uptime())
  },
  '/api/v1/ping': {
    status: 'alive',
    timestamp: () => Date.now(),
    uptime: () => Math.round(process.uptime())
  }
};

/**
 * Fast path middleware - intercepts critical endpoints and provides immediate responses
 * without going through expensive middleware chains
 */
export function fastPathMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  
  // Check if this is a fast-path endpoint
  if (FAST_PATH_ENDPOINTS.has(path)) {
    // Set fast-path headers
    res.setHeader('X-Fast-Path', 'true');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    // Check for static responses
    const staticResponse = STATIC_RESPONSES[path as keyof typeof STATIC_RESPONSES];
    if (staticResponse) {
      // Generate dynamic response by calling functions
      const response = Object.keys(staticResponse).reduce((acc, key) => {
        const value = staticResponse[key as keyof typeof staticResponse];
        acc[key] = typeof value === 'function' ? value() : value;
        return acc;
      }, {} as any);
      
      // Log fast path hit (minimal logging)
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`Fast path: ${path} (${Date.now() - req.timestamp}ms)`, { path });
      }
      
      return res.status(200).json(response);
    }
  }
  
  // Not a fast-path endpoint, continue to next middleware
  next();
}

/**
 * Request timestamp middleware - adds timestamp for response time tracking
 * This is lightweight and should be applied early
 */
export function requestTimestampMiddleware(req: Request, res: Response, next: NextFunction): void {
  (req as any).timestamp = Date.now();
  next();
}

/**
 * Check if a path should bypass expensive middleware
 */
export function shouldBypassMiddleware(path: string): boolean {
  return FAST_PATH_ENDPOINTS.has(path);
}

/**
 * Express middleware factory for conditional middleware application
 * Skips middleware for fast-path endpoints
 */
export function conditionalMiddleware(middleware: (req: Request, res: Response, next: NextFunction) => void) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (shouldBypassMiddleware(req.path)) {
      // Skip middleware for fast-path endpoints
      return next();
    }
    // Apply middleware for other endpoints
    return middleware(req, res, next);
  };
}