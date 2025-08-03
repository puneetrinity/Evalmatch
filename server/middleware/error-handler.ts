/**
 * Enhanced Server-Side Error Handler Middleware
 * 
 * Comprehensive error handling system that extends the existing global error handler
 * with additional features for batch management system including:
 * - Enhanced error classification and responses
 * - Retry mechanisms and circuit breaker patterns
 * - Error recovery workflows
 * - Detailed error monitoring and logging
 * - Consistent API error responses
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { config } from '../config/unified-config';
import type { ValidationError } from '@shared/utility-types';
import { 
  globalErrorHandler,
  AppError,
  createError,
  createValidationError,
  createAuthError,
  createForbiddenError,
  createNotFoundError,
  createConflictError,
  createRateLimitError,
  createDatabaseError
} from './global-error-handler';

// ===== ENHANCED ERROR TYPES =====

export interface EnhancedErrorContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
  batchId?: string;
  operation?: string;
  endpoint: string;
  method: string;
  userAgent?: string;
  ipAddress: string;
  timestamp: Date;
  executionTime?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  systemLoad?: number;
}

export interface ErrorMetrics {
  errorCount: number;
  errorRate: number;
  averageResponseTime: number;
  slowRequestCount: number;
  circuitBreakerTrips: number;
  retryAttempts: number;
  errorsByCategory: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  topErrors: Array<{ code: string; count: number; lastOccurrence: Date }>;
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  totalRequests: number;
  successfulRequests: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: AppError) => boolean;
}

// ===== ERROR METRICS TRACKING =====

class ErrorMetricsTracker {
  private metrics: ErrorMetrics = {
    errorCount: 0,
    errorRate: 0,
    averageResponseTime: 0,
    slowRequestCount: 0,
    circuitBreakerTrips: 0,
    retryAttempts: 0,
    errorsByCategory: {},
    errorsBySeverity: {},
    topErrors: [],
  };

  private requestTimes: number[] = [];
  private readonly maxRequestTimeHistory = 1000;
  private readonly slowRequestThreshold = 5000; // 5 seconds

  updateMetrics(error: AppError, responseTime: number) {
    this.metrics.errorCount++;
    
    // Track response times
    this.requestTimes.push(responseTime);
    if (this.requestTimes.length > this.maxRequestTimeHistory) {
      this.requestTimes.shift();
    }
    
    // Update average response time
    this.metrics.averageResponseTime = 
      this.requestTimes.reduce((sum, time) => sum + time, 0) / this.requestTimes.length;
    
    // Track slow requests
    if (responseTime > this.slowRequestThreshold) {
      this.metrics.slowRequestCount++;
    }
    
    // Track errors by category
    const category = error.code || 'UNKNOWN';
    this.metrics.errorsByCategory[category] = (this.metrics.errorsByCategory[category] || 0) + 1;
    
    // Track errors by severity
    const severity = this.getSeverityFromStatusCode(error.statusCode);
    this.metrics.errorsBySeverity[severity] = (this.metrics.errorsBySeverity[severity] || 0) + 1;
    
    // Update top errors
    this.updateTopErrors(error.code || 'UNKNOWN');
  }

  private getSeverityFromStatusCode(statusCode?: number): string {
    if (!statusCode) return 'unknown';
    if (statusCode >= 500) return 'critical';
    if (statusCode >= 400) return 'high';
    return 'medium';
  }

  private updateTopErrors(errorCode: string) {
    const existingError = this.metrics.topErrors.find(e => e.code === errorCode);
    
    if (existingError) {
      existingError.count++;
      existingError.lastOccurrence = new Date();
    } else {
      this.metrics.topErrors.push({
        code: errorCode,
        count: 1,
        lastOccurrence: new Date(),
      });
    }
    
    // Keep only top 20 errors sorted by count
    this.metrics.topErrors
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  resetMetrics() {
    this.metrics = {
      errorCount: 0,
      errorRate: 0,
      averageResponseTime: 0,
      slowRequestCount: 0,
      circuitBreakerTrips: 0,
      retryAttempts: 0,
      errorsByCategory: {},
      errorsBySeverity: {},
      topErrors: [],
    };
    this.requestTimes = [];
  }
}

// ===== CIRCUIT BREAKER IMPLEMENTATION =====

class CircuitBreaker {
  private state: CircuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    totalRequests: 0,
    successfulRequests: 0,
  };

  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 60000, // 1 minute
    private monitoringPeriod: number = 300000 // 5 minutes
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.state.totalRequests++;

    // Check if circuit is open
    if (this.isCircuitOpen()) {
      throw createError('Service temporarily unavailable', 503, 'CIRCUIT_BREAKER_OPEN');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isCircuitOpen(): boolean {
    if (!this.state.isOpen) return false;

    // Check if reset timeout has passed
    if (this.state.nextAttemptTime && new Date() > this.state.nextAttemptTime) {
      this.state.isOpen = false;
      this.state.failureCount = 0;
      logger.info('Circuit breaker reset - attempting to close circuit');
      return false;
    }

    return true;
  }

  private onSuccess() {
    this.state.successfulRequests++;
    this.state.failureCount = 0;
    
    if (this.state.isOpen) {
      this.state.isOpen = false;
      logger.info('Circuit breaker closed after successful request');
    }
  }

  private onFailure() {
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    if (this.state.failureCount >= this.failureThreshold) {
      this.state.isOpen = true;
      this.state.nextAttemptTime = new Date(Date.now() + this.resetTimeout);
      
      logger.warn(`Circuit breaker opened after ${this.state.failureCount} failures`, {
        nextAttemptTime: this.state.nextAttemptTime,
        totalRequests: this.state.totalRequests,
        successfulRequests: this.state.successfulRequests,
      });
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  reset() {
    this.state = {
      isOpen: false,
      failureCount: 0,
      totalRequests: 0,
      successfulRequests: 0,
    };
  }
}

// ===== GLOBAL INSTANCES =====

const errorMetrics = new ErrorMetricsTracker();
const circuitBreaker = new CircuitBreaker();

// ===== ENHANCED ERROR HANDLERS =====

/**
 * Create enhanced error context with system information
 */
function createEnhancedErrorContext(req: Request & { id?: string; startTime?: number }): EnhancedErrorContext {
  const executionTime = req.startTime ? Date.now() - req.startTime : undefined;
  
  return {
    requestId: req.id || 'unknown',
    userId: req.user?.id,
    sessionId: req.headers['x-session-id'] as string,
    batchId: req.params.batchId || req.body?.batchId || req.query?.batchId as string,
    operation: req.route?.path || req.path,
    endpoint: req.originalUrl,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ipAddress: req.ip || 'unknown',
    timestamp: new Date(),
    executionTime,
    memoryUsage: process.memoryUsage(),
    systemLoad: process.cpuUsage ? process.cpuUsage().user : undefined,
  };
}

/**
 * Enhanced error response with additional metadata
 */
interface EnhancedErrorResponse {
  success: false;
  error: {
    id: string;
    code: string;
    message: string;
    type: string;
    severity: string;
    retryable: boolean;
    timestamp: string;
    requestId: string;
    traceId?: string;
    details?: unknown;
    suggestedActions?: string[];
    retryAfter?: number;
    recoveryEndpoint?: string;
    supportReference?: string;
  };
  meta?: {
    executionTime?: number;
    memoryUsage?: number;
    systemLoad?: number;
    circuitBreakerState?: string;
  };
}

/**
 * Create enhanced error response
 */
function createEnhancedErrorResponse(
  error: AppError,
  context: EnhancedErrorContext,
  includeMetadata: boolean = false
): EnhancedErrorResponse {
  const response: EnhancedErrorResponse = {
    success: false,
    error: {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      type: error.code?.includes('VALIDATION') ? 'validation' :
             error.code?.includes('AUTH') ? 'authentication' :
             error.code?.includes('FORBIDDEN') ? 'authorization' :
             error.code?.includes('NOT_FOUND') ? 'not_found' :
             error.statusCode && error.statusCode >= 500 ? 'server_error' : 'client_error',
      severity: error.statusCode && error.statusCode >= 500 ? 'high' : 'medium',
      retryable: isRetryableError(error),
      timestamp: context.timestamp.toISOString(),
      requestId: context.requestId,
    },
  };

  // Add retry information for retryable errors
  if (response.error.retryable) {
    response.error.retryAfter = getRetryDelay(error);
    response.error.suggestedActions = [
      'Wait a moment and try again',
      'Check your network connection',
      'Contact support if the issue persists',
    ];
  }

  // Add specific suggested actions based on error type
  if (error.code?.includes('VALIDATION')) {
    response.error.suggestedActions = [
      'Check the highlighted fields',
      'Ensure all required data is provided',
      'Verify data format requirements',
    ];
  } else if (error.code?.includes('AUTH')) {
    response.error.suggestedActions = [
      'Check your login credentials',
      'Refresh your session',
      'Clear browser cache and try again',
    ];
  } else if (error.code?.includes('BATCH')) {
    response.error.suggestedActions = [
      'Verify the batch ID is correct',
      'Check your session permissions',
      'Try refreshing the page',
    ];
    response.error.recoveryEndpoint = '/api/batches/recover';
  }

  // Add validation details for validation errors
  if (error.validationErrors && error.validationErrors.length > 0) {
    response.error.details = {
      validationErrors: error.validationErrors,
    };
  }

  // Add metadata in development or for internal errors
  if (includeMetadata || config.env === 'development') {
    response.meta = {
      executionTime: context.executionTime,
      memoryUsage: context.memoryUsage?.heapUsed,
      systemLoad: context.systemLoad,
      circuitBreakerState: circuitBreaker.getState().isOpen ? 'open' : 'closed',
    };
  }

  // Add support reference for high-severity errors
  if (response.error.severity === 'high' || response.error.severity === 'critical') {
    response.error.supportReference = `REF-${context.requestId}-${Date.now().toString(36).toUpperCase()}`;
  }

  return response;
}

/**
 * Determine if error is retryable
 */
function isRetryableError(error: AppError): boolean {
  if (!error.statusCode) return false;
  
  // Network and server errors are generally retryable
  if (error.statusCode >= 500) return true;
  
  // Some 4xx errors are retryable
  if (error.statusCode === 408 || error.statusCode === 429) return true;
  
  // Check specific error codes
  const retryableCodes = [
    'TIMEOUT_ERROR',
    'CONNECTION_ERROR',
    'RATE_LIMIT_ERROR',
    'TEMPORARY_UNAVAILABLE',
    'CIRCUIT_BREAKER_OPEN',
  ];
  
  return retryableCodes.some(code => error.code?.includes(code));
}

/**
 * Calculate retry delay based on error type
 */
function getRetryDelay(error: AppError): number {
  if (error.statusCode === 429) return 60; // Rate limit - wait 1 minute
  if (error.statusCode && error.statusCode >= 500) return 30; // Server error - wait 30 seconds
  if (error.code?.includes('CIRCUIT_BREAKER')) return 300; // Circuit breaker - wait 5 minutes
  
  return 10; // Default - wait 10 seconds
}

/**
 * Log error with enhanced context
 */
function logEnhancedError(error: AppError, context: EnhancedErrorContext) {
  const logLevel = error.statusCode && error.statusCode >= 500 ? 'error' : 
                  error.statusCode && error.statusCode >= 400 ? 'warn' : 'info';

  const logData = {
    error: {
      id: error.code,
      message: error.message,
      statusCode: error.statusCode,
      stack: config.env !== 'production' ? error.stack : undefined,
    },
    context: {
      requestId: context.requestId,
      userId: context.userId,
      sessionId: context.sessionId?.substring(0, 10) + '...',
      batchId: context.batchId?.substring(0, 10) + '...',
      operation: context.operation,
      endpoint: context.endpoint,
      method: context.method,
      ipAddress: context.ipAddress.replace(/\d+$/, 'XXX'), // Mask last octet
      executionTime: context.executionTime,
    },
    metrics: {
      memoryUsage: context.memoryUsage?.heapUsed,
      systemLoad: context.systemLoad,
    },
  };

  logger[logLevel](logData, `${error.code}: ${error.message}`);
}

// ===== MIDDLEWARE FUNCTIONS =====

/**
 * Request timing middleware to track execution time
 */
export function requestTimingMiddleware(req: Request & { startTime?: number }, res: Response, next: NextFunction) {
  req.startTime = Date.now();
  next();
}

/**
 * Enhanced error handler middleware
 */
export function enhancedErrorHandler(
  err: Error | AppError | unknown,
  req: Request & { id?: string; startTime?: number },
  res: Response,
  next: NextFunction
): void {
  // Skip if response already sent
  if (res.headersSent) {
    return next(err);
  }

  const startTime = Date.now();

  // Create enhanced context
  const context = createEnhancedErrorContext(req);

  // Convert unknown errors to AppError
  let error: AppError;
  if (err instanceof Error) {
    error = err as AppError;
    if (!error.statusCode) {
      error.statusCode = 500;
      error.code = 'INTERNAL_ERROR';
    }
  } else {
    error = createError('An unexpected error occurred', 500, 'INTERNAL_ERROR');
    error.cause = err as Error;
  }

  // Execute through circuit breaker for system errors
  const executeWithCircuitBreaker = async () => {
    if (error.statusCode && error.statusCode >= 500) {
      return circuitBreaker.execute(async () => {
        // This is just for circuit breaker tracking
        // The actual error has already occurred
        throw error;
      }).catch(() => {
        // Circuit breaker will throw, but we already have the error
        return null;
      });
    }
  };

  executeWithCircuitBreaker().finally(() => {
    const responseTime = Date.now() - startTime;

    // Update metrics
    errorMetrics.updateMetrics(error, responseTime);

    // Log error with enhanced context
    logEnhancedError(error, context);

    // Create enhanced response
    const includeMetadata = error.statusCode && error.statusCode >= 500;
    const errorResponse = createEnhancedErrorResponse(error, context, includeMetadata);

    // Set appropriate headers
    res.set({
      'X-Request-ID': context.requestId,
      'X-Error-ID': errorResponse.error.id,
    });

    // Add retry headers for retryable errors
    if (errorResponse.error.retryable) {
      res.set({
        'Retry-After': String(errorResponse.error.retryAfter),
        'X-Retry-Limit': '3',
      });
    }

    // Send response
    res.status(error.statusCode || 500).json(errorResponse);
  });
}

/**
 * Batch-specific error handler middleware
 */
export function batchErrorHandler(
  err: Error | AppError | unknown,
  req: Request & { id?: string; batchValidation?: any },
  res: Response,
  next: NextFunction
): void {
  // Add batch-specific context
  if (req.batchValidation) {
    const batchError = err as AppError;
    if (batchError && typeof batchError === 'object') {
      batchError.details = {
        ...batchError.details,
        batchValidation: req.batchValidation,
      };
    }
  }

  // Use enhanced error handler
  enhancedErrorHandler(err, req, res, next);
}

/**
 * Async error wrapper to catch async handler errors
 */
export function asyncErrorHandler<T extends Request, U extends Response>(
  handler: (req: T, res: U, next: NextFunction) => Promise<void>
) {
  return (req: T, res: U, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Rate limit error handler
 */
export function rateLimitErrorHandler(req: Request, res: Response) {
  const error = createRateLimitError('Too many requests. Please try again later.');
  const context = createEnhancedErrorContext(req as Request & { id?: string; startTime?: number });
  const errorResponse = createEnhancedErrorResponse(error, context);

  res.status(429).json(errorResponse);
}

/**
 * Not found error handler
 */
export function notFoundErrorHandler(req: Request, res: Response, next: NextFunction) {
  const error = createNotFoundError(`Route ${req.method} ${req.path} not found`);
  enhancedErrorHandler(error, req as Request & { id?: string; startTime?: number }, res, next);
}

// ===== MONITORING AND METRICS ENDPOINTS =====

/**
 * Get error metrics endpoint
 */
export function getErrorMetrics(req: Request, res: Response) {
  const metrics = errorMetrics.getMetrics();
  const circuitBreakerState = circuitBreaker.getState();

  res.json({
    success: true,
    data: {
      metrics,
      circuitBreaker: circuitBreakerState,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Reset error metrics endpoint
 */
export function resetErrorMetrics(req: Request, res: Response) {
  errorMetrics.resetMetrics();
  circuitBreaker.reset();

  res.json({
    success: true,
    message: 'Error metrics reset successfully',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Health check with error information
 */
export function healthCheckWithErrors(req: Request, res: Response) {
  const metrics = errorMetrics.getMetrics();
  const circuitBreakerState = circuitBreaker.getState();
  
  const isHealthy = !circuitBreakerState.isOpen && 
                   metrics.errorRate < 0.05 && // Less than 5% error rate
                   metrics.averageResponseTime < 5000; // Less than 5 seconds

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    metrics: {
      errorRate: metrics.errorRate,
      averageResponseTime: metrics.averageResponseTime,
      circuitBreakerOpen: circuitBreakerState.isOpen,
    },
    details: isHealthy ? undefined : {
      issues: [
        circuitBreakerState.isOpen && 'Circuit breaker is open',
        metrics.errorRate >= 0.05 && `High error rate: ${(metrics.errorRate * 100).toFixed(2)}%`,
        metrics.averageResponseTime >= 5000 && `Slow response time: ${metrics.averageResponseTime}ms`,
      ].filter(Boolean),
    },
  });
}

// ===== EXPORTS =====

export {
  errorMetrics,
  circuitBreaker,
  EnhancedErrorContext,
  EnhancedErrorResponse,
  ErrorMetrics,
  CircuitBreakerState,
  RetryConfig,
};

// Re-export from global error handler for convenience
export {
  globalErrorHandler,
  AppError,
  createError,
  createValidationError,
  createAuthError,
  createForbiddenError,
  createNotFoundError,
  createConflictError,
  createRateLimitError,
  createDatabaseError,
} from './global-error-handler';