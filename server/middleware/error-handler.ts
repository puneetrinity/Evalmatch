/**
 * RESULT PATTERN: Centralized Error Handling Middleware
 * Provides consistent error responses across all endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import { BaseAppError, AppNotFoundError, toAppError } from '@shared/errors';

/**
 * Express error handling middleware for Result pattern errors
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Convert unknown errors to AppError
  const appError = err instanceof BaseAppError ? err : toAppError(err, req.path);
  
  // Log error with context
  logger.error('Request error handled', {
    error: appError.code,
    message: appError.message,
    statusCode: appError.statusCode,
    path: req.path,
    method: req.method,
    userId: (req as any).user?.uid,
    timestamp: appError.timestamp,
    details: appError.details,
    stack: err instanceof Error ? err.stack : undefined
  });

  // Send consistent error response
  res.status(appError.statusCode).json({
    success: false,
    error: appError.code,
    message: appError.message,
    timestamp: appError.timestamp,
    ...(appError.details && { details: appError.details })
  });
};

/**
 * Catch-all middleware for unhandled routes
 */
export const notFoundHandler = (req: Request, res: Response) => {
  const error = AppNotFoundError.resourceNotFound(`Route ${req.path}`);
  
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
    userId: (req as any).user?.uid
  });

  res.status(error.statusCode).json({
    success: false,
    error: error.code,
    message: error.message,
    timestamp: error.timestamp
  });
};

/**
 * Async error wrapper for route handlers
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};