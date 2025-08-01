/**
 * Global Error Handler Middleware
 * 
 * Comprehensive error handling system that:
 * - Catches all unhandled errors in the application
 * - Provides structured error responses
 * - Logs errors with appropriate detail levels
 * - Handles different error types (validation, auth, database, etc.)
 * - Prevents sensitive information leakage
 * - Implements retry logic for transient errors
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { config } from '../config/unified-config';
import type { ValidationError } from '@shared/utility-types';

// Error types and their corresponding status codes
export const ERROR_TYPES = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND_ERROR: 404,
  CONFLICT_ERROR: 409,
  RATE_LIMIT_ERROR: 429,
  DATABASE_ERROR: 503,
  INTERNAL_ERROR: 500,
} as const;

// Transient errors that can be retried
const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /connection terminated/i,
  /connection reset/i,
  /rate limit/i,
  /temporary/i,
  /unavailable/i,
  /busy/i,
  /overload/i,
];

// Sensitive fields that should be redacted from error responses
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'credential',
  'session',
];

/**
 * Interface for structured error objects
 */
export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  details?: Record<string, unknown>;
  cause?: Error;
  validationErrors?: ValidationError[];
}

/**
 * Create a structured error object
 */
export function createError(
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR',
  details?: Record<string, unknown>
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.code = code;
  error.isOperational = true;
  error.details = details;
  return error;
}

/**
 * Check if an error is transient (temporary) and can be retried
 */
function isTransientError(error: AppError): boolean {
  const message = error.message.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Determine error type based on error properties and message
 */
function categorizeError(error: AppError): { statusCode: number; errorType: string } {
  // Check for specific error codes first
  if (error.code) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
      case 'INVALID_INPUT':
        return { statusCode: 400, errorType: 'VALIDATION_ERROR' };
      case 'UNAUTHORIZED':
      case 'INVALID_TOKEN':
        return { statusCode: 401, errorType: 'AUTHENTICATION_ERROR' };
      case 'FORBIDDEN':
      case 'INSUFFICIENT_PERMISSIONS':
        return { statusCode: 403, errorType: 'AUTHORIZATION_ERROR' };
      case 'NOT_FOUND':
        return { statusCode: 404, errorType: 'NOT_FOUND_ERROR' };
      case 'CONFLICT':
      case 'DUPLICATE_ENTRY':
        return { statusCode: 409, errorType: 'CONFLICT_ERROR' };
      case 'RATE_LIMIT_EXCEEDED':
        return { statusCode: 429, errorType: 'RATE_LIMIT_ERROR' };
      case 'DATABASE_ERROR':
      case 'CONNECTION_ERROR':
        return { statusCode: 503, errorType: 'DATABASE_ERROR' };
    }
  }

  // Check for database-related errors
  if (error.message.includes('database') || 
      error.message.includes('connection') ||
      error.message.includes('query') ||
      isTransientError(error)) {
    return { statusCode: 503, errorType: 'DATABASE_ERROR' };
  }

  // Check for validation errors
  if (error.message.includes('validation') || 
      error.message.includes('invalid') ||
      error.message.includes('required')) {
    return { statusCode: 400, errorType: 'VALIDATION_ERROR' };
  }

  // Use provided status code or default to 500
  const statusCode = error.statusCode || 500;
  return { 
    statusCode, 
    errorType: statusCode >= 500 ? 'INTERNAL_ERROR' : 'CLIENT_ERROR' 
  };
}

/**
 * Redact sensitive information from error details
 */
function redactSensitiveData(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const keyLower = key.toLowerCase();
    if (SENSITIVE_FIELDS.some(field => keyLower.includes(field))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * Create a user-friendly error message
 */
function createUserMessage(error: AppError, errorType: string): string {
  // For transient errors, provide helpful retry message
  if (isTransientError(error)) {
    return 'The service is temporarily unavailable. Please try again in a moment.';
  }

  // For specific error types, provide appropriate messages
  switch (errorType) {
    case 'VALIDATION_ERROR':
      return error.message.includes('validation') 
        ? error.message 
        : 'The provided data is invalid. Please check your input and try again.';
    
    case 'AUTHENTICATION_ERROR':
      return 'Authentication failed. Please check your credentials and try again.';
    
    case 'AUTHORIZATION_ERROR':
      return 'You do not have permission to perform this action.';
    
    case 'NOT_FOUND_ERROR':
      return 'The requested resource was not found.';
    
    case 'RATE_LIMIT_ERROR':
      return 'Too many requests. Please wait a moment before trying again.';
    
    case 'DATABASE_ERROR':
      return 'Database service is temporarily unavailable. Please try again later.';
    
    default:
      // For internal errors, provide generic message unless in development
      return config.env === 'development' 
        ? error.message 
        : 'An unexpected error occurred. Please try again later.';
  }
}

/**
 * Generate error response object
 */
interface ErrorResponse {
  error: {
    message: string;
    code: string;
    type: string;
    requestId?: string;
    timestamp: string;
    retryable?: boolean;
    retryAfter?: number;
    details?: unknown;
    validationErrors?: ValidationError[];
  };
}

function createErrorResponse(
  error: AppError, 
  errorType: string, 
  statusCode: number, 
  requestId?: string
): ErrorResponse {
  const isTransient = isTransientError(error);
  const userMessage = createUserMessage(error, errorType);

  const response: ErrorResponse = {
    error: {
      message: userMessage,
      code: error.code || errorType,
      type: errorType,
      requestId,
      timestamp: new Date().toISOString(),
    }
  };

  // Add retry information for transient errors
  if (isTransient) {
    response.error.retryable = true;
    response.error.retryAfter = 5; // seconds
  }

  // Add validation errors if present
  if (error.validationErrors && error.validationErrors.length > 0) {
    response.error.validationErrors = error.validationErrors;
  }

  // Add details in development mode
  if (config.env === 'development' && error.details) {
    response.error.details = redactSensitiveData(error.details);
  }

  return response;
}

/**
 * Main global error handler middleware
 */
export function globalErrorHandler(
  err: Error | AppError | unknown,
  req: Request & { id?: string },
  res: Response,
  next: NextFunction
): void {
  // Skip if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Convert unknown errors to AppError
  let error: AppError;
  if (err instanceof Error) {
    error = err as AppError;
  } else {
    error = createError('An unexpected error occurred', 500, 'INTERNAL_ERROR');
    error.cause = err as Error;
  }

  // Categorize the error
  const { statusCode, errorType } = categorizeError(error);

  // Generate request context for logging
  const requestContext = {
    id: req.id,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    params: req.params,
    query: redactSensitiveData(req.query),
    // Only log body for non-file uploads and redact sensitive data
    body: req.body && !(req as any).file ? redactSensitiveData(req.body) : '[Request Body]',
  };

  // Log error with appropriate level
  const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  logger[logLevel]({
    error: {
      message: error.message,
      code: error.code,
      type: errorType,
      statusCode,
      stack: config.env !== 'production' ? error.stack : undefined,
      isOperational: error.isOperational,
      details: config.env !== 'production' ? redactSensitiveData(error.details) : undefined,
    },
    request: requestContext,
  }, `${errorType}: ${error.message}`);

  // Create and send error response
  const errorResponse = createErrorResponse(error, errorType, statusCode, req.id);
  res.status(statusCode).json(errorResponse);
}

/**
 * Handler for unhandled promise rejections
 */
export function handleUnhandledRejection(reason: any, promise: Promise<any>): void {
  logger.error({
    error: {
      message: 'Unhandled Promise Rejection',
      reason: String(reason),
      stack: reason?.stack,
    }
  }, 'Unhandled Promise Rejection detected');

  // In production, we might want to gracefully shutdown
  if (config.env === 'production') {
    logger.error('Shutting down due to unhandled promise rejection');
    process.exit(1);
  }
}

/**
 * Handler for uncaught exceptions
 */
export function handleUncaughtException(error: Error): void {
  logger.fatal({
    error: {
      message: error.message,
      stack: error.stack,
    }
  }, 'Uncaught Exception detected');

  // Always exit on uncaught exceptions
  process.exit(1);
}

/**
 * Initialize global error handlers
 */
export function initializeGlobalErrorHandling(): void {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', handleUnhandledRejection);
  
  // Handle uncaught exceptions
  process.on('uncaughtException', handleUncaughtException);
  
  logger.info('🛡️ Global error handlers initialized');
}

// Export convenience functions for creating specific error types
export const createValidationError = (
  message: string, 
  details?: Record<string, unknown>,
  validationErrors?: ValidationError[]
): AppError => {
  const error = createError(message, 400, 'VALIDATION_ERROR', details);
  if (validationErrors) {
    error.validationErrors = validationErrors;
  }
  return error;
};

export const createAuthError = (message: string = 'Authentication failed'): AppError =>
  createError(message, 401, 'AUTHENTICATION_ERROR');

export const createForbiddenError = (message: string = 'Access forbidden'): AppError =>
  createError(message, 403, 'AUTHORIZATION_ERROR');

export const createNotFoundError = (message: string = 'Resource not found'): AppError =>
  createError(message, 404, 'NOT_FOUND_ERROR');

export const createConflictError = (
  message: string, 
  details?: Record<string, unknown>
): AppError =>
  createError(message, 409, 'CONFLICT_ERROR', details);

export const createRateLimitError = (message: string = 'Rate limit exceeded'): AppError =>
  createError(message, 429, 'RATE_LIMIT_ERROR');

export const createDatabaseError = (
  message: string, 
  details?: Record<string, unknown>
): AppError =>
  createError(message, 503, 'DATABASE_ERROR', details);