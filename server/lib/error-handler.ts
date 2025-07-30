/**
 * API Error Handler
 * 
 * Enhanced error handling for API requests with specific handling for
 * database connectivity issues and other common error types.
 */
import { Response } from 'express';

interface ApiErrorOptions {
  statusCode?: number;
  errorCode?: string;
  addDetails?: boolean;
}

/**
 * Handle API errors with appropriate status codes and formatting
 */
export function handleApiError(res: Response, error: unknown, options: ApiErrorOptions = {}) {
  const { 
    statusCode = 500, 
    errorCode = 'INTERNAL_ERROR',
    addDetails = false 
  } = options;
  
  // Extract message from error object
  let message = error?.message || 'An unexpected error occurred';
  
  // Check for database connection issues
  const isConnectionError = 
    message.includes('timeout') || 
    message.includes('Connection terminated') ||
    message.includes('connection reset') ||
    message.includes('rate limit');
  
  // Special handling for database connection errors
  if (isConnectionError) {
    return res.status(503).json({
      message: 'Database connection temporarily unavailable. Please try again in a moment.',
      errorCode: 'DATABASE_UNAVAILABLE',
      transient: true,
      retry: true
    });
  }
  
  // Try to parse JSON error message for structured error response
  try {
    if (message.startsWith('{') && message.endsWith('}')) {
      const parsedError = JSON.parse(message);
      return res.status(statusCode).json(parsedError);
    }
  } catch (e) {
    // Ignore parse errors
  }
  
  // For validation errors, try to extract structured information
  if (message.includes('Validation failed')) {
    try {
      const parsedError = JSON.parse(message);
      return res.status(400).json(parsedError);
    } catch (e) {
      // Fall back to standard error handling
    }
  }
  
  // Default error response
  const response: Record<string, unknown> = {
    message,
    errorCode
  };
  
  // Add error details for debugging if requested
  if (addDetails && error && process.env.NODE_ENV !== 'production') {
    response.details = typeof error === 'object' ? Object.getOwnPropertyNames(error).reduce((acc, key) => {
      if (key !== 'stack') { // Exclude stack trace
        acc[key] = (error as Record<string, unknown>)[key];
      }
      return acc;
    }, {} as Record<string, unknown>) : String(error);
  }
  
  // Log server errors
  if (statusCode >= 500) {
    console.error('API Error:', error);
  }
  
  return res.status(statusCode).json(response);
}