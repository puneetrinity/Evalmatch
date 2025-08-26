/**
 * TYPESCRIPT: Concrete Error Classes with Proper Status Codes
 * Provides consistent error objects across the entire application
 * 
 * @fileoverview This module defines concrete error classes that extend the base
 * AppError interface. Each error class includes proper HTTP status codes,
 * structured error information, and helper methods for common error scenarios.
 * 
 * @example
 * ```typescript
 * // Creating specific errors
 * const validationError = AppValidationError.requiredField('email');
 * const notFoundError = AppNotFoundError.user('user123');
 * const authError = AppAuthenticationError.tokenExpired('user123');
 * 
 * // All errors have consistent structure
 * console.log(error.code);        // 'VALIDATION_ERROR'
 * console.log(error.statusCode);  // 400
 * console.log(error.timestamp);   // '2024-01-01T00:00:00.000Z'
 * 
 * // Converting unknown errors
 * const appError = toAppError(unknownError, 'user_operation');
 * ```
 * 
 * @since 1.0.0
 * @author Claude Code Assistant
 */

import type {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  BusinessLogicError,
  ExternalServiceError,
  RateLimitError
} from './result-types';

// ===== BASE ERROR CLASS =====

/**
 * Base error class that all application errors extend
 * Provides consistent structure and behavior for all error types
 * 
 * @example
 * ```typescript
 * class CustomError extends BaseAppError {
 *   constructor(message: string) {
 *     super('CUSTOM_ERROR', message, 400);
 *   }
 * }
 * ```
 */
export class BaseAppError extends Error implements AppError {
  /** The error code identifier */
  readonly code: string;
  /** Human-readable error message */
  readonly message: string;
  /** HTTP status code */
  readonly statusCode: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;
  /** ISO timestamp when error was created */
  readonly timestamp: string;

  /**
   * Creates a new BaseAppError instance
   * 
   * @param code - The error code identifier
   * @param message - Human-readable error message
   * @param statusCode - HTTP status code
   * @param details - Additional error details
   */
  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.message = message;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    
    // Maintains proper stack trace for where error was thrown (Node.js only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Converts the error to a JSON-serializable object
   * Useful for API responses and logging
   * 
   * @returns Plain object representation of the error
   */
  toJSON(): AppError {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

// ===== VALIDATION ERRORS (400) =====

/**
 * Validation error for invalid input data
 * Used when request data doesn't meet validation requirements
 * 
 * @example
 * ```typescript
 * // Using helper methods
 * const error = AppValidationError.requiredField('email');
 * const error = AppValidationError.invalidFormat('phone', '+1234567890');
 * 
 * // Manual creation
 * const error = new AppValidationError(
 *   'Password must contain uppercase letter',
 *   'password',
 *   ['uppercase', 'strength']
 * );
 * ```
 */
export class AppValidationError extends BaseAppError implements ValidationError {
  /** Always 'VALIDATION_ERROR' for this error type */
  readonly code = 'VALIDATION_ERROR' as const;
  /** The field that failed validation (if applicable) */
  readonly field?: string;
  /** List of validation rules that were violated */
  readonly validationRules?: string[];

  /**
   * Creates a new validation error
   * 
   * @param message - Description of the validation failure
   * @param field - The field that failed validation
   * @param validationRules - Rules that were violated
   * @param details - Additional context about the failure
   */
  constructor(
    message: string,
    field?: string,
    validationRules?: string[],
    details?: Record<string, unknown>
  ) {
    super('VALIDATION_ERROR', message, 400, details);
    this.field = field;
    this.validationRules = validationRules;
  }

  /**
   * Creates a required field validation error
   * 
   * @param field - Name of the required field
   * @returns AppValidationError for missing required field
   */
  static requiredField(field: string): AppValidationError {
    return new AppValidationError(
      `Field '${field}' is required`,
      field,
      ['required']
    );
  }

  static invalidFormat(field: string, expectedFormat: string): AppValidationError {
    return new AppValidationError(
      `Field '${field}' has invalid format. Expected: ${expectedFormat}`,
      field,
      ['format']
    );
  }

  static fileTooLarge(maxSize: string): AppValidationError {
    return new AppValidationError(
      `File size exceeds maximum allowed size of ${maxSize}`,
      'file',
      ['file-size']
    );
  }

  static unsupportedFileType(allowedTypes: string[]): AppValidationError {
    return new AppValidationError(
      `Unsupported file type. Allowed types: ${allowedTypes.join(', ')}`,
      'file',
      ['file-type']
    );
  }
}

// Not found errors (404)
export class AppNotFoundError extends BaseAppError implements NotFoundError {
  readonly code = 'NOT_FOUND' as const;
  readonly resource: string;
  readonly id?: string | number;

  constructor(resource: string, id?: string | number, details?: Record<string, unknown>) {
    const message = id 
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    super('NOT_FOUND', message, 404, details);
    this.resource = resource;
    this.id = id;
  }

  static resume(id: string | number): AppNotFoundError {
    return new AppNotFoundError('Resume', id);
  }

  static jobDescription(id: string | number): AppNotFoundError {
    return new AppNotFoundError('Job Description', id);
  }

  static analysisResult(id: string | number): AppNotFoundError {
    return new AppNotFoundError('Analysis Result', id);
  }

  static user(id: string): AppNotFoundError {
    return new AppNotFoundError('User', id);
  }

  static resourceNotFound(resource: string): AppNotFoundError {
    return new AppNotFoundError(resource);
  }
}

// Authentication/Authorization errors (401/403)
export class AppAuthenticationError extends BaseAppError implements AuthenticationError {
  readonly code: 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR' | 'TOKEN_EXPIRED';
  readonly userId?: string;

  constructor(
    code: 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR' | 'TOKEN_EXPIRED',
    message: string,
    userId?: string,
    details?: Record<string, unknown>
  ) {
    const statusCode = code === 'AUTHORIZATION_ERROR' ? 403 : 401;
    super(code, message, statusCode, details);
    this.code = code;
    this.userId = userId;
  }

  static invalidCredentials(): AppAuthenticationError {
    return new AppAuthenticationError(
      'AUTHENTICATION_ERROR',
      'Invalid credentials provided'
    );
  }

  static tokenExpired(userId?: string): AppAuthenticationError {
    return new AppAuthenticationError(
      'TOKEN_EXPIRED',
      'Authentication token has expired',
      userId
    );
  }

  static insufficientPermissions(resource: string, userId?: string): AppAuthenticationError {
    return new AppAuthenticationError(
      'AUTHORIZATION_ERROR',
      `Insufficient permissions to access ${resource}`,
      userId
    );
  }

  static adminRequired(): AppAuthenticationError {
    return new AppAuthenticationError(
      'AUTHORIZATION_ERROR',
      'Admin privileges required for this operation'
    );
  }
}

// Business logic errors (422)
export class AppBusinessLogicError extends BaseAppError implements BusinessLogicError {
  readonly code = 'BUSINESS_LOGIC_ERROR' as const;
  readonly operation: string;

  constructor(operation: string, message: string, details?: Record<string, unknown>) {
    super('BUSINESS_LOGIC_ERROR', message, 422, details);
    this.operation = operation;
  }

  static resumeAlreadyAnalyzed(resumeId: string | number): AppBusinessLogicError {
    return new AppBusinessLogicError(
      'resume-analysis',
      `Resume ${resumeId} has already been analyzed`
    );
  }

  static incompatibleAnalysis(): AppBusinessLogicError {
    return new AppBusinessLogicError(
      'match-analysis',
      'Resume and job description are not compatible for analysis'
    );
  }

  static tierLimitExceeded(userTier: string, operation: string): AppBusinessLogicError {
    return new AppBusinessLogicError(
      operation,
      `Operation '${operation}' exceeds limits for tier '${userTier}'`
    );
  }

  static sessionExpiredOrInvalid(sessionId?: string, batchId?: string): AppBusinessLogicError {
    const details = {
      sessionId,
      batchId,
      solution: 'Refresh the page to start a new session and re-upload the resumes you want to analyze',
      userAction: 'REFRESH_AND_RETRY'
    };
    
    return new AppBusinessLogicError(
      'session-management',
      'Session or batch ID is invalid. No resumes found for the current session.',
      details
    );
  }
}

// External service errors (502/503)
export class AppExternalServiceError extends BaseAppError implements ExternalServiceError {
  readonly code: 'EXTERNAL_SERVICE_ERROR' | 'AI_PROVIDER_ERROR' | 'DATABASE_ERROR';
  readonly service: string;
  readonly originalError?: string;

  constructor(
    code: 'EXTERNAL_SERVICE_ERROR' | 'AI_PROVIDER_ERROR' | 'DATABASE_ERROR',
    service: string,
    message: string,
    originalError?: string,
    details?: Record<string, unknown>
  ) {
    const statusCode = code === 'DATABASE_ERROR' ? 503 : 502;
    super(code, message, statusCode, { ...details, originalError });
    this.code = code;
    this.service = service;
    this.originalError = originalError;
  }

  static aiProviderFailure(provider: string, operation: string, originalError?: string): AppExternalServiceError {
    return new AppExternalServiceError(
      'AI_PROVIDER_ERROR',
      provider,
      `AI provider '${provider}' failed during '${operation}' operation`,
      originalError
    );
  }

  static databaseFailure(operation: string, originalError?: string): AppExternalServiceError {
    return new AppExternalServiceError(
      'DATABASE_ERROR',
      'PostgreSQL',
      `Database operation '${operation}' failed`,
      originalError
    );
  }

  static embeddingServiceFailure(originalError?: string): AppExternalServiceError {
    return new AppExternalServiceError(
      'EXTERNAL_SERVICE_ERROR',
      'Embedding Service',
      'Failed to generate text embeddings',
      originalError
    );
  }
}

// Rate limit errors (429)
export class AppRateLimitError extends BaseAppError implements RateLimitError {
  readonly code = 'RATE_LIMIT_EXCEEDED' as const;
  readonly retryAfter?: number;
  readonly limit?: number;

  constructor(
    message: string,
    retryAfter?: number,
    limit?: number,
    details?: Record<string, unknown>
  ) {
    super('RATE_LIMIT_EXCEEDED', message, 429, details);
    this.retryAfter = retryAfter;
    this.limit = limit;
  }

  static tooManyRequests(retryAfter: number): AppRateLimitError {
    return new AppRateLimitError(
      `Too many requests. Try again in ${retryAfter} seconds`,
      retryAfter
    );
  }

  static aiProviderRateLimit(provider: string, retryAfter?: number): AppRateLimitError {
    return new AppRateLimitError(
      `Rate limit exceeded for AI provider '${provider}'`,
      retryAfter
    );
  }

  static adminAttemptsBlocked(retryAfter: number): AppRateLimitError {
    return new AppRateLimitError(
      `Too many failed admin attempts. Access blocked for ${Math.ceil(retryAfter / 60)} minutes`,
      retryAfter
    );
  }
}

// ===== ERROR CONVERSION UTILITIES =====

/**
 * Converts unknown errors to typed AppError instances
 * Provides intelligent error classification based on error content
 * 
 * @param error - The unknown error to convert
 * @param context - Context where the error occurred (for logging)
 * @returns A properly typed AppError instance
 * 
 * @example
 * ```typescript
 * try {
 *   // Some operation that might throw
 * } catch (unknownError) {
 *   const appError = toAppError(unknownError, 'user_creation');
 *   return failure(appError);
 * }
 * ```
 */
export function toAppError(error: unknown, context = 'Unknown operation'): AppError {
  // Already an AppError - return as-is
  if (error instanceof BaseAppError) {
    return error;
  }
  
  // Standard Error - classify based on message content
  if (error instanceof Error) {
    // Check for common error patterns and convert appropriately
    if (error.message.includes('not found')) {
      return new AppNotFoundError('Resource');
    }
    
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return new AppValidationError(error.message);
    }
    
    if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
      return AppAuthenticationError.invalidCredentials();
    }
    
    if (error.message.includes('rate limit') || error.message.includes('too many')) {
      return AppRateLimitError.tooManyRequests(60);
    }
    
    // Default to external service error for unknown Error instances
    return AppExternalServiceError.aiProviderFailure('Unknown', context, error.message);
  }
  
  // Fallback for non-Error objects (strings, objects, etc.)
  return new BaseAppError(
    'UNKNOWN_ERROR',
    `Unknown error in ${context}: ${String(error)}`,
    500,
    { originalError: error }
  );
}