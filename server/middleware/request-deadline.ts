/**
 * Request Deadline Enforcement with AbortController
 * 
 * Provides a secondary timeout safety net using AbortController to ensure
 * requests don't hang beyond intended deadlines. Works alongside route timeouts
 * for comprehensive request lifecycle management.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// Extend Express Request to include deadline information
declare global {
  namespace Express {
    interface Request {
      deadline?: AbortController;
      deadlineMs?: number;
      startTime?: number;
    }
  }
}

interface DeadlineConfig {
  deadlineMs: number;
  description: string;
}

// Route-specific deadlines (should be shorter than route timeouts)
const ROUTE_DEADLINES: { [pattern: string]: DeadlineConfig } = {
  // Health checks - very fast
  '/api/health': { deadlineMs: 1500, description: 'Health check' },
  '/api/v1/health': { deadlineMs: 1500, description: 'Health check' },
  '/api/healthz': { deadlineMs: 800, description: 'Health probe' },
  '/api/v1/healthz': { deadlineMs: 800, description: 'Health probe' },
  '/api/ready': { deadlineMs: 1500, description: 'Readiness probe' },
  '/api/v1/ready': { deadlineMs: 1500, description: 'Readiness probe' },
  '/api/live': { deadlineMs: 800, description: 'Liveness probe' },
  '/api/v1/live': { deadlineMs: 800, description: 'Liveness probe' },
  '/api/ping': { deadlineMs: 400, description: 'Ping' },
  '/api/v1/ping': { deadlineMs: 400, description: 'Ping' },

  // Version endpoints - fast
  '/api/version': { deadlineMs: 800, description: 'Version check' },
  '/api/v1/version': { deadlineMs: 800, description: 'Version check' },

  // Monitoring endpoints - moderate
  '/api/monitoring': { deadlineMs: 4000, description: 'Monitoring' },
  '/api/v1/monitoring': { deadlineMs: 4000, description: 'Monitoring' },

  // Debug endpoints - moderate  
  '/api/debug': { deadlineMs: 4000, description: 'Debug' },
  '/api/v1/debug': { deadlineMs: 4000, description: 'Debug' },
};

// Pattern-based deadlines for dynamic routes
const PATTERN_DEADLINES: { pattern: RegExp; config: DeadlineConfig }[] = [
  // Analysis routes - shorter than 30s route timeout
  { 
    pattern: /^\/api\/(v1\/)?analysis/, 
    config: { deadlineMs: 25000, description: 'AI analysis' }
  },
  
  // File upload routes - shorter than 60s route timeout
  { 
    pattern: /^\/api\/(v1\/)?(resumes|upload)/, 
    config: { deadlineMs: 50000, description: 'File upload' }
  },
  
  // Batch processing - shorter than 45s route timeout
  { 
    pattern: /^\/api\/(v1\/)?batches/, 
    config: { deadlineMs: 40000, description: 'Batch processing' }
  },

  // Job processing - shorter than 15s route timeout
  { 
    pattern: /^\/api\/(v1\/)?job-descriptions/, 
    config: { deadlineMs: 12000, description: 'Job processing' }
  },

  // Admin operations - shorter than 10s route timeout
  { 
    pattern: /^\/api\/(v1\/)?admin/, 
    config: { deadlineMs: 8000, description: 'Admin operation' }
  },

  // User operations - shorter than 5s route timeout
  { 
    pattern: /^\/api\/(v1\/)?user/, 
    config: { deadlineMs: 4000, description: 'User operation' }
  },

  // Token operations - shorter than 3s route timeout  
  { 
    pattern: /^\/api\/(v1\/)?tokens/, 
    config: { deadlineMs: 2500, description: 'Token operation' }
  },
];

// Default deadline (should be shorter than default route timeout of 10s)
const DEFAULT_DEADLINE: DeadlineConfig = { 
  deadlineMs: 6500, 
  description: 'Default request' 
};

/**
 * Get deadline configuration for a specific route path
 */
function getDeadlineForPath(path: string): DeadlineConfig {
  // Check exact path matches first
  const exactMatch = ROUTE_DEADLINES[path];
  if (exactMatch) {
    return exactMatch;
  }

  // Check pattern matches
  for (const { pattern, config } of PATTERN_DEADLINES) {
    if (pattern.test(path)) {
      return config;
    }
  }

  // Return default deadline
  return DEFAULT_DEADLINE;
}

/**
 * Request deadline middleware
 * Sets up AbortController for each request with appropriate deadline
 */
export function requestDeadlineMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const path = req.path;
  const deadlineConfig = getDeadlineForPath(path);
  
  // Create AbortController for this request
  const abortController = new AbortController();
  
  // Attach to request for use in handlers
  req.deadline = abortController;
  req.deadlineMs = deadlineConfig.deadlineMs;
  req.startTime = startTime;
  
  // Set deadline header for client awareness
  res.setHeader('X-Request-Deadline', Math.round(deadlineConfig.deadlineMs / 1000));
  
  // Create deadline timer
  const deadlineTimer = setTimeout(() => {
    if (!res.headersSent) {
      const duration = Date.now() - startTime;
      
      // Signal abortion to any operations using the AbortController
      abortController.abort();
      
      // Log deadline exceeded (minimal logging for performance)
      if (process.env.NODE_ENV !== 'production') {
        logger.warn(`Request deadline exceeded: ${path} (${duration}ms > ${deadlineConfig.deadlineMs}ms)`, {
          path,
          deadline: deadlineConfig.deadlineMs,
          duration,
          method: req.method,
          description: deadlineConfig.description
        });
      }

      // Send deadline response (different from timeout to distinguish the cause)
      res.status(408).json({
        success: false,
        error: 'Request deadline exceeded',
        code: 'DEADLINE_EXCEEDED',
        deadline: deadlineConfig.deadlineMs,
        duration,
        description: deadlineConfig.description,
        timestamp: new Date().toISOString(),
        path
      });
    }
  }, deadlineConfig.deadlineMs);
  
  // Clean up deadline on response finish
  res.on('finish', () => {
    clearTimeout(deadlineTimer);
  });

  res.on('close', () => {
    clearTimeout(deadlineTimer);
  });

  // Continue to next middleware
  next();
}

/**
 * Helper to create AbortSignal with custom timeout
 * Use this in AI operations, database calls, etc.
 */
export function createAbortSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  
  setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  return controller.signal;
}

/**
 * Helper to create AbortSignal from request deadline
 * Use this to respect the request's overall deadline
 */
export function getRequestAbortSignal(req: Request): AbortSignal | undefined {
  return req.deadline?.signal;
}

/**
 * Get remaining time until request deadline
 */
export function getRemainingDeadline(req: Request): number {
  if (!req.startTime || !req.deadlineMs) {
    return 0;
  }
  
  const elapsed = Date.now() - req.startTime;
  const remaining = req.deadlineMs - elapsed;
  
  return Math.max(0, remaining);
}

/**
 * Check if request deadline has been exceeded
 */
export function isDeadlineExceeded(req: Request): boolean {
  return getRemainingDeadline(req) <= 0;
}

/**
 * Get all configured deadlines for monitoring
 */
export function getDeadlineConfigurations(): {
  exact: { [path: string]: DeadlineConfig };
  patterns: { pattern: string; config: DeadlineConfig }[];
  default: DeadlineConfig;
} {
  return {
    exact: ROUTE_DEADLINES,
    patterns: PATTERN_DEADLINES.map(({ pattern, config }) => ({
      pattern: pattern.toString(),
      config
    })),
    default: DEFAULT_DEADLINE
  };
}