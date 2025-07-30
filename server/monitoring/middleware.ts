import { Request, Response, NextFunction } from 'express';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { logger, httpLoggerConfig } from '../config/logger';
import { startOperation, endOperation, getMetricsReport } from './metrics';

// Enhance express Request type to include any custom properties
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
    interface Response {
      responseTime?: number;
    }
  }
}

// Create HTTP request logger middleware
const httpLogger = pinoHttp(httpLoggerConfig);

/**
 * Request tracking middleware
 * - Adds unique ID to each request
 * - Tracks request timing and success/failure metrics
 * - Logs request details
 */
export function requestTracking(req: Request, res: Response, next: NextFunction) {
  // Generate unique request ID if not already present
  req.id = req.id || req.headers['x-request-id'] as string || uuidv4();
  
  // Set request ID in response headers for client correlation
  res.setHeader('X-Request-Id', req.id);
  
  // Track request timing
  const requestId = req.id;
  const endpoint = `${req.method} ${req.path}`;
  startOperation(requestId, 'http_request');
  
  // Capture response timing
  const startTime = Date.now();
  
  // Add response finish handler to track metrics
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Store response time for reporting
    res.responseTime = duration;
    
    // Check if response was successful (2xx or 3xx)
    const success = res.statusCode < 400;
    
    // Record operation metrics
    endOperation(requestId, success, { 
      endpoint,
      statusCode: res.statusCode,
      responseTime: duration
    });
    
    // Log additional details for non-200 responses
    if (res.statusCode >= 400) {
      const level = res.statusCode >= 500 ? 'error' : 'warn';
      logger[level]({
        req: {
          id: requestId,
          method: req.method,
          url: req.originalUrl,
          params: req.params,
          query: req.query,
          // Don't log sensitive body data
          body: req.method === 'POST' ? '[Request Body]' : undefined
        },
        res: {
          statusCode: res.statusCode,
          responseTime: duration
        }
      }, `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    }
  });
  
  // Continue to next middleware
  next();
}

/**
 * Error handling middleware
 * - Logs errors with appropriate context
 * - Standardizes error responses
 */
export function errorHandling(err: Error | unknown, req: Request, res: Response, next: NextFunction) {
  // Extract most important error details
  const error = {
    message: err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
    statusCode: err.statusCode || err.status || 500,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    requestId: req.id
  };
  
  // Determine log level based on status code
  const level = error.statusCode >= 500 ? 'error' : 'warn';
  
  // Log error with context
  logger[level]({
    err: {
      message: error.message,
      code: error.code,
      stack: error.stack
    },
    req: {
      id: req.id,
      method: req.method,
      url: req.originalUrl,
      params: req.params,
      query: req.query
    }
  }, `Error handling request ${req.method} ${req.originalUrl}: ${error.message}`);
  
  // Send standardized error response to client
  res.status(error.statusCode).json({
    error: {
      message: error.message,
      code: error.code,
      requestId: req.id
    }
  });
}

/**
 * Metrics reporting endpoint middleware
 * - Returns current application metrics
 * - Protected by admin flag
 */
export function metricsReporting(req: Request, res: Response) {
  const isAdmin = req.query.admin === 'true' || false;
  
  // Only allow admin access in production
  if (process.env.NODE_ENV === 'production' && !isAdmin) {
    return res.status(403).json({
      error: {
        message: 'Unauthorized access to metrics',
        code: 'FORBIDDEN'
      }
    });
  }
  
  // Generate metrics report
  const report = getMetricsReport();
  res.json(report);
}

/**
 * Express middleware for logging and monitoring
 */
export const monitoringMiddleware = {
  httpLogger,
  requestTracking,
  errorHandling,
  metricsEndpoint: metricsReporting
};