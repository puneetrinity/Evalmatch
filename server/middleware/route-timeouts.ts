/**
 * SURGICAL FIX: Per-Route Timeout Configuration
 * 
 * Implements different timeout thresholds for different route types:
 * - 2s for health checks (fast responses required)
 * - 5s for simple API endpoints  
 * - 30s for analysis operations (AI processing)
 * - 60s for file uploads
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

interface RouteTimeoutConfig {
  timeout: number; // milliseconds
  message: string;
  code: string;
}

// Timeout configurations for different route patterns
const ROUTE_TIMEOUTS: { [pattern: string]: RouteTimeoutConfig } = {
  // Health check endpoints - ultra fast
  '/api/health': { timeout: 2000, message: 'Health check timed out', code: 'HEALTH_TIMEOUT' },
  '/api/v1/health': { timeout: 2000, message: 'Health check timed out', code: 'HEALTH_TIMEOUT' },
  '/api/healthz': { timeout: 1000, message: 'Health probe timed out', code: 'PROBE_TIMEOUT' },
  '/api/v1/healthz': { timeout: 1000, message: 'Health probe timed out', code: 'PROBE_TIMEOUT' },
  '/api/ready': { timeout: 2000, message: 'Readiness probe timed out', code: 'READINESS_TIMEOUT' },
  '/api/v1/ready': { timeout: 2000, message: 'Readiness probe timed out', code: 'READINESS_TIMEOUT' },
  '/api/live': { timeout: 1000, message: 'Liveness probe timed out', code: 'LIVENESS_TIMEOUT' },
  '/api/v1/live': { timeout: 1000, message: 'Liveness probe timed out', code: 'LIVENESS_TIMEOUT' },
  '/api/ping': { timeout: 500, message: 'Ping timed out', code: 'PING_TIMEOUT' },
  '/api/v1/ping': { timeout: 500, message: 'Ping timed out', code: 'PING_TIMEOUT' },

  // Version and info endpoints - fast
  '/api/version': { timeout: 1000, message: 'Version check timed out', code: 'VERSION_TIMEOUT' },
  '/api/v1/version': { timeout: 1000, message: 'Version check timed out', code: 'VERSION_TIMEOUT' },

  // Monitoring endpoints - moderate  
  '/api/monitoring': { timeout: 5000, message: 'Monitoring request timed out', code: 'MONITORING_TIMEOUT' },
  '/api/v1/monitoring': { timeout: 5000, message: 'Monitoring request timed out', code: 'MONITORING_TIMEOUT' },

  // Database status - moderate
  '/api/debug': { timeout: 5000, message: 'Debug request timed out', code: 'DEBUG_TIMEOUT' },
  '/api/v1/debug': { timeout: 5000, message: 'Debug request timed out', code: 'DEBUG_TIMEOUT' },
};

// Pattern-based timeouts for dynamic routes
const PATTERN_TIMEOUTS: { pattern: RegExp; config: RouteTimeoutConfig }[] = [
  // Analysis routes - long timeout for AI processing
  { 
    pattern: /^\/api\/(v1\/)?analysis/, 
    config: { timeout: 30000, message: 'Analysis request timed out', code: 'ANALYSIS_TIMEOUT' }
  },
  
  // File upload routes - extended timeout
  { 
    pattern: /^\/api\/(v1\/)?(resumes|upload)/, 
    config: { timeout: 60000, message: 'File upload timed out', code: 'UPLOAD_TIMEOUT' }
  },
  
  // Batch processing - extended timeout
  { 
    pattern: /^\/api\/(v1\/)?batches/, 
    config: { timeout: 45000, message: 'Batch processing timed out', code: 'BATCH_TIMEOUT' }
  },

  // Job description processing - moderate timeout  
  { 
    pattern: /^\/api\/(v1\/)?job-descriptions/, 
    config: { timeout: 15000, message: 'Job processing timed out', code: 'JOB_TIMEOUT' }
  },

  // Admin operations - moderate timeout
  { 
    pattern: /^\/api\/(v1\/)?admin/, 
    config: { timeout: 10000, message: 'Admin operation timed out', code: 'ADMIN_TIMEOUT' }
  },

  // User operations - fast
  { 
    pattern: /^\/api\/(v1\/)?user/, 
    config: { timeout: 5000, message: 'User operation timed out', code: 'USER_TIMEOUT' }
  },

  // Token operations - fast
  { 
    pattern: /^\/api\/(v1\/)?tokens/, 
    config: { timeout: 3000, message: 'Token operation timed out', code: 'TOKEN_TIMEOUT' }
  },
];

// Default timeout for unmatched routes
const DEFAULT_TIMEOUT: RouteTimeoutConfig = { 
  timeout: 10000, 
  message: 'Request timed out', 
  code: 'REQUEST_TIMEOUT' 
};

/**
 * Get timeout configuration for a specific route path
 */
function getTimeoutForPath(path: string): RouteTimeoutConfig {
  // Check exact path matches first
  const exactMatch = ROUTE_TIMEOUTS[path];
  if (exactMatch) {
    return exactMatch;
  }

  // Check pattern matches
  for (const { pattern, config } of PATTERN_TIMEOUTS) {
    if (pattern.test(path)) {
      return config;
    }
  }

  // Return default timeout
  return DEFAULT_TIMEOUT;
}

/**
 * Route timeout middleware
 * Applies different timeout thresholds based on route patterns
 */
export function routeTimeoutMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const path = req.path;
  const timeoutConfig = getTimeoutForPath(path);
  
  // Set timeout header for client awareness
  res.setHeader('X-Route-Timeout', Math.round(timeoutConfig.timeout / 1000));
  
  // Create timeout timer
  const timeoutTimer = setTimeout(() => {
    if (!res.headersSent) {
      const duration = Date.now() - startTime;
      
      // Log timeout (minimal logging for performance)
      if (process.env.NODE_ENV !== 'production') {
        logger.warn(`Route timeout: ${path} (${duration}ms > ${timeoutConfig.timeout}ms)`, {
          path,
          timeout: timeoutConfig.timeout,
          duration,
          method: req.method
        });
      }

      // Send timeout response
      res.status(408).json({
        success: false,
        error: timeoutConfig.message,
        code: timeoutConfig.code,
        timeout: timeoutConfig.timeout,
        duration,
        timestamp: new Date().toISOString(),
        path
      });
    }
  }, timeoutConfig.timeout);

  // Clean up timeout on response finish
  res.on('finish', () => {
    clearTimeout(timeoutTimer);
  });

  res.on('close', () => {
    clearTimeout(timeoutTimer);
  });

  // Continue to next middleware
  next();
}

/**
 * Get all configured timeouts for monitoring
 */
export function getTimeoutConfigurations(): {
  exact: { [path: string]: RouteTimeoutConfig };
  patterns: { pattern: string; config: RouteTimeoutConfig }[];
  default: RouteTimeoutConfig;
} {
  return {
    exact: ROUTE_TIMEOUTS,
    patterns: PATTERN_TIMEOUTS.map(({ pattern, config }) => ({
      pattern: pattern.toString(),
      config
    })),
    default: DEFAULT_TIMEOUT
  };
}

/**
 * Helper to check if a route has a custom timeout
 */
export function hasCustomTimeout(path: string): boolean {
  return !!ROUTE_TIMEOUTS[path] || PATTERN_TIMEOUTS.some(({ pattern }) => pattern.test(path));
}

/**
 * Express middleware factory for specific timeout overrides
 * Use this to set custom timeouts for specific routes
 */
export function createTimeoutMiddleware(timeout: number, message?: string, code?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const config: RouteTimeoutConfig = {
      timeout,
      message: message || 'Request timed out',
      code: code || 'CUSTOM_TIMEOUT'
    };

    res.setHeader('X-Custom-Timeout', Math.round(timeout / 1000));

    const timeoutTimer = setTimeout(() => {
      if (!res.headersSent) {
        const duration = Date.now() - startTime;
        
        res.status(408).json({
          success: false,
          error: config.message,
          code: config.code,
          timeout: config.timeout,
          duration,
          timestamp: new Date().toISOString()
        });
      }
    }, timeout);

    res.on('finish', () => clearTimeout(timeoutTimer));
    res.on('close', () => clearTimeout(timeoutTimer));

    next();
  };
}