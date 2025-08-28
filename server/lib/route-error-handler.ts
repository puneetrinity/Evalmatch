/**
 * ROUTE ERROR HANDLER: Standardized Result Pattern Integration
 * Provides centralized utilities for converting Result patterns to HTTP responses
 * 
 * @fileoverview This module standardizes error handling across all Express.js routes
 * by providing utilities to convert Result types to consistent HTTP responses.
 * It builds upon the existing error utilities in @shared/type-utilities.ts.
 * 
 * @example
 * ```typescript
 * import { handleRouteResult } from '../lib/route-error-handler';
 * 
 * router.post('/analyze', async (req, res) => {
 *   const result = await analysisService.analyzeData(req.body);
 *   handleRouteResult(result, res, (data) => {
 *     res.json({ success: true, data });
 *   });
 * });
 * ```
 */

import { Response } from 'express';
import { Result, isFailure } from '@shared/result-types';
import { 
  getErrorStatusCode, 
  getErrorCode, 
  getErrorMessage, 
  getErrorTimestamp
} from '@shared/type-utilities';
import { logger } from './logger';

// ===== TYPES =====

/**
 * Standard error response format used across all routes
 */
export interface StandardErrorResponse {
  success: false;
  error: string;        // Error code for programmatic handling  
  message: string;      // Human-readable message
  timestamp: string;    // ISO timestamp
  details?: Record<string, unknown>; // Additional context (optional)
}

/**
 * Standard success response format
 */
export interface StandardSuccessResponse<T = any> {
  success: true;
  data: T;
  timestamp: string;
}

/**
 * Callback function for handling successful results
 */
export type SuccessCallback<T> = (_data: T) => void;

// ===== HTTP STATUS CODE MAPPING =====

/**
 * Industry-standard HTTP status code mapping for common error types
 * Based on 2024 RESTful API best practices from major providers
 */
const ERROR_STATUS_CODE_MAP: Record<string, number> = {
  // Client errors (4xx)
  'VALIDATION_ERROR': 400,
  'BAD_REQUEST': 400,
  'AUTHENTICATION_ERROR': 401,
  'TOKEN_EXPIRED': 401,
  'UNAUTHORIZED': 401,
  'AUTHORIZATION_ERROR': 403,
  'FORBIDDEN': 403,
  'NOT_FOUND': 404,
  'RESOURCE_NOT_FOUND': 404,
  'METHOD_NOT_ALLOWED': 405,
  'CONFLICT': 409,
  'BUSINESS_LOGIC_ERROR': 422,
  'UNPROCESSABLE_ENTITY': 422,
  'RATE_LIMIT_EXCEEDED': 429,
  
  // Server errors (5xx)
  'INTERNAL_SERVER_ERROR': 500,
  'ROUTE_ERROR': 500,
  'NOT_IMPLEMENTED': 501,
  'EXTERNAL_SERVICE_ERROR': 502,
  'AI_PROVIDER_ERROR': 502,
  'BAD_GATEWAY': 502,
  'SERVICE_UNAVAILABLE': 503,
  'DATABASE_ERROR': 503,
  'GATEWAY_TIMEOUT': 504,
} as const;

/**
 * Get HTTP status code for an error, with intelligent mapping
 */
function getStatusCode(error: unknown, defaultStatus = 500): number {
  // Use existing utility as primary source
  const statusFromUtility = getErrorStatusCode(error, null as any);
  if (statusFromUtility && statusFromUtility !== 500) {
    return statusFromUtility;
  }

  // Fall back to our enhanced mapping
  const errorCode = getErrorCode(error, 'UNKNOWN_ERROR');
  return ERROR_STATUS_CODE_MAP[errorCode] || defaultStatus;
}

// ===== CORE HANDLER FUNCTIONS =====

/**
 * Handles a Result type and responds with appropriate HTTP status and JSON
 * This is the main function for handling Result patterns in routes
 * 
 * @param result - The Result object from a service call
 * @param res - Express Response object
 * @param successCallback - Function to call on success with the data
 * @param options - Optional configuration
 */
export function handleRouteResult<T, E = any>(
  result: Result<T, E>,
  res: Response,
  successCallback: SuccessCallback<T>,
  options: {
    defaultErrorStatus?: number;
    logErrors?: boolean;
    includeErrorDetails?: boolean;
  } = {}
): void {
  const { 
    defaultErrorStatus = 500, 
    logErrors = true,
    includeErrorDetails = false 
  } = options;

  if (isFailure(result)) {
    const statusCode = getStatusCode(result.error, defaultErrorStatus);
    
    // Log error if enabled (default: true for server errors)
    if (logErrors && statusCode >= 500) {
      logger.error('Route error occurred', {
        error: result.error,
        statusCode,
        errorCode: getErrorCode(result.error),
        timestamp: getErrorTimestamp(result.error)
      });
    }

    const errorResponse: StandardErrorResponse = {
      success: false,
      error: getErrorCode(result.error),
      message: getErrorMessage(result.error),
      timestamp: getErrorTimestamp(result.error)
    };

    // Include error details in development or if explicitly requested
    if (includeErrorDetails && process.env.NODE_ENV !== 'production') {
      errorResponse.details = {
        originalError: result.error,
        stack: result.error instanceof Error ? result.error.stack : undefined
      };
    }

    res.status(statusCode).json(errorResponse);
    return;
  }

  // Success case - call the provided success callback
  successCallback(result.data);
}

/**
 * Handles generic errors (not Result types) - useful for catch blocks
 * 
 * @param error - Any error object or unknown value
 * @param res - Express Response object  
 * @param options - Optional configuration
 */
export function handleRouteError(
  error: unknown, 
  res: Response,
  options: {
    defaultErrorStatus?: number;
    logErrors?: boolean;
    includeErrorDetails?: boolean;
  } = {}
): void {
  const { 
    defaultErrorStatus = 500, 
    logErrors = true,
    includeErrorDetails = false 
  } = options;

  const statusCode = getStatusCode(error, defaultErrorStatus);
  
  // Always log unexpected errors
  if (logErrors) {
    logger.error('Unexpected route error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      statusCode,
      timestamp: new Date().toISOString()
    });
  }

  const errorResponse: StandardErrorResponse = {
    success: false,
    error: getErrorCode(error, 'ROUTE_ERROR'),
    message: getErrorMessage(error, 'An unexpected error occurred'),
    timestamp: getErrorTimestamp(error)
  };

  // Include error details in development
  if (includeErrorDetails && process.env.NODE_ENV !== 'production') {
    errorResponse.details = {
      originalError: error,
      stack: error instanceof Error ? error.stack : undefined
    };
  }

  res.status(statusCode).json(errorResponse);
}

// ===== CONVENIENCE FUNCTIONS =====

/**
 * Creates a success response with standard format
 */
export function createSuccessResponse<T>(data: T): StandardSuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };
}

/**
 * Sends a standardized success response
 */
export function sendSuccessResponse<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json(createSuccessResponse(data));
}

/**
 * Convenience function for simple Result handling without custom success logic
 */
export function handleSimpleResult<T>(
  result: Result<T, any>,
  res: Response,
  successStatusCode = 200
): void {
  handleRouteResult(result, res, (data) => {
    sendSuccessResponse(res, data, successStatusCode);
  });
}

// ===== MIDDLEWARE HELPER =====

/**
 * Express middleware wrapper for async route handlers that return Results
 * Automatically handles Result patterns and errors
 * 
 * @example
 * router.get('/data', wrapResultHandler(async (req, res) => {
 *   const service = createService();
 *   const result = await service.getData();
 *   return result; // Returns Result<T, E>
 * }));
 */
export function wrapResultHandler<T>(
  handler: (_req: any, _res: Response) => Promise<Result<T, any>>
) {
  return async (_req: any, _res: Response) => {
    try {
      const result = await handler(_req, _res);
      handleSimpleResult(result, _res);
    } catch (error) {
      handleRouteError(error, _res);
    }
  };
}

// ===== LEGACY COMPATIBILITY =====

/**
 * Helper to maintain compatibility with existing route patterns
 * Matches the current pattern used in analysis.ts, jobs.ts, resumes.ts
 */
export function handleLegacyResult<T>(result: Result<T, any>, res: Response): boolean {
  if (isFailure(result)) {
    const statusCode = getErrorStatusCode(result.error, 500);
    res.status(statusCode).json({
      success: false,
      error: getErrorCode(result.error),
      message: getErrorMessage(result.error),
      timestamp: getErrorTimestamp(result.error)
    });
    return true; // Indicates response was sent
  }
  return false; // Indicates success, caller should handle response
}