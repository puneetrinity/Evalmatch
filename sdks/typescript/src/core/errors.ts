/**
 * Enhanced Error Classes for EvalMatch SDK
 * Provides structured error handling with context and recovery suggestions
 */

export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  
  // Authentication errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  
  // API errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  
  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  
  // Validation errors
  INVALID_FILE_FORMAT = 'INVALID_FILE_FORMAT',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  
  // Firebase specific
  FIREBASE_AUTH_ERROR = 'FIREBASE_AUTH_ERROR',
  FIREBASE_TOKEN_ERROR = 'FIREBASE_TOKEN_ERROR'
}

export interface ErrorContext {
  requestId?: string
  duration?: number
  attempts?: number
  circuitBreakerState?: string
  endpoint?: string
  method?: string
  statusCode?: number
  timestamp?: string
  userAgent?: string
}

export interface RecoveryAction {
  type: 'retry' | 'authenticate' | 'wait' | 'contact_support' | 'check_parameters'
  description: string
  waitTime?: number
  retryAfter?: number
}

export class EvalMatchError extends Error {
  public readonly code: ErrorCode
  public readonly context: ErrorContext
  public readonly recoveryActions: RecoveryAction[]
  public readonly isRetryable: boolean
  public readonly originalError?: Error

  constructor(
    message: string,
    code: ErrorCode,
    context: ErrorContext = {},
    recoveryActions: RecoveryAction[] = [],
    isRetryable = false,
    originalError?: Error
  ) {
    super(message)
    this.name = 'EvalMatchError'
    this.code = code
    this.context = {
      ...context,
      timestamp: new Date().toISOString()
    }
    this.recoveryActions = recoveryActions
    this.isRetryable = isRetryable
    this.originalError = originalError
    
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EvalMatchError)
    }
  }

  toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`
  }

  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      recoveryActions: this.recoveryActions,
      isRetryable: this.isRetryable,
      stack: this.stack
    }
  }
}

export class NetworkError extends EvalMatchError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(
      message,
      ErrorCode.NETWORK_ERROR,
      context,
      [
        {
          type: 'retry',
          description: 'Check your internet connection and try again',
          waitTime: 1000
        },
        {
          type: 'contact_support',
          description: 'If the problem persists, contact support'
        }
      ],
      true,
      originalError
    )
  }
}

export class AuthenticationError extends EvalMatchError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(
      message,
      ErrorCode.INVALID_CREDENTIALS,
      context,
      [
        {
          type: 'authenticate',
          description: 'Re-authenticate with valid credentials'
        },
        {
          type: 'contact_support',
          description: 'Contact support if authentication continues to fail'
        }
      ],
      false,
      originalError
    )
  }
}

export class RateLimitError extends EvalMatchError {
  constructor(message: string, retryAfter: number, context: ErrorContext = {}, originalError?: Error) {
    super(
      message,
      ErrorCode.RATE_LIMIT_EXCEEDED,
      context,
      [
        {
          type: 'wait',
          description: `Wait ${retryAfter} seconds before making another request`,
          retryAfter
        }
      ],
      true,
      originalError
    )
  }
}

export class ValidationError extends EvalMatchError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}, originalError?: Error) {
    super(
      message,
      code,
      context,
      [
        {
          type: 'check_parameters',
          description: 'Check your request parameters and try again'
        }
      ],
      false,
      originalError
    )
  }
}

export class ServerError extends EvalMatchError {
  constructor(message: string, code: ErrorCode, context: ErrorContext = {}, originalError?: Error) {
    const isRetryable = code === ErrorCode.INTERNAL_SERVER_ERROR || code === ErrorCode.SERVICE_UNAVAILABLE
    
    super(
      message,
      code,
      context,
      isRetryable ? [
        {
          type: 'retry',
          description: 'The server is experiencing issues. Try again in a few moments',
          waitTime: 5000
        },
        {
          type: 'contact_support',
          description: 'If the problem persists, contact support'
        }
      ] : [
        {
          type: 'contact_support',
          description: 'Contact support for assistance'
        }
      ],
      isRetryable,
      originalError
    )
  }
}

export class CircuitBreakerError extends EvalMatchError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(
      message,
      ErrorCode.CIRCUIT_BREAKER_OPEN,
      context,
      [
        {
          type: 'wait',
          description: 'The service is temporarily unavailable. Wait before retrying',
          waitTime: 30000
        }
      ],
      false,
      originalError
    )
  }
}

export class FirebaseAuthError extends EvalMatchError {
  constructor(message: string, context: ErrorContext = {}, originalError?: Error) {
    super(
      message,
      ErrorCode.FIREBASE_AUTH_ERROR,
      context,
      [
        {
          type: 'authenticate',
          description: 'Re-authenticate with Firebase and try again'
        }
      ],
      false,
      originalError
    )
  }
}

/**
 * Error factory for creating appropriate error instances based on HTTP responses
 */
export class ErrorFactory {
  static createFromHttpError(error: any, context: ErrorContext = {}): EvalMatchError {
    const status = error.status || error.response?.status
    const data = error.data || error.response?.data
    const message = data?.message || error.message || 'An error occurred'

    // Add HTTP context - prioritize context params over error object
    const enrichedContext: ErrorContext = {
      ...context,
      statusCode: status,
      endpoint: context.endpoint || error.config?.url || error.request?.path || error.request?.url,
      method: context.method || error.config?.method?.toUpperCase(),
      requestId: error.config?.metadata?.requestId || context.requestId,
      duration: error.config?.metadata?.duration || context.duration
    }

    switch (status) {
      case 400:
        return new ValidationError(message, ErrorCode.INVALID_REQUEST, enrichedContext, error)
      
      case 401:
        return new AuthenticationError(message, enrichedContext, error)
      
      case 403:
        return new EvalMatchError(
          message,
          ErrorCode.INSUFFICIENT_PERMISSIONS,
          enrichedContext,
          [{ type: 'contact_support', description: 'Contact support for access permissions' }],
          false,
          error
        )
      
      case 404:
        return new EvalMatchError(
          message,
          ErrorCode.RESOURCE_NOT_FOUND,
          enrichedContext,
          [{ type: 'check_parameters', description: 'Check the resource identifier and try again' }],
          false,
          error
        )
      
      case 413:
        return new ValidationError(message, ErrorCode.FILE_TOO_LARGE, enrichedContext, error)
      
      case 415:
        return new ValidationError(message, ErrorCode.INVALID_FILE_FORMAT, enrichedContext, error)
      
      case 429:
        const retryAfter = data?.retryAfter || 60
        return new RateLimitError(message, retryAfter, enrichedContext, error)
      
      case 500:
        return new ServerError(message, ErrorCode.INTERNAL_SERVER_ERROR, enrichedContext, error)
      
      case 502:
      case 503:
      case 504:
        return new ServerError(message, ErrorCode.SERVICE_UNAVAILABLE, enrichedContext, error)
      
      default:
        if (!status) {
          return new NetworkError(message, enrichedContext, error)
        }
        
        return new EvalMatchError(
          message,
          ErrorCode.INTERNAL_SERVER_ERROR,
          enrichedContext,
          [{ type: 'contact_support', description: 'Contact support for assistance' }],
          status >= 500,
          error
        )
    }
  }

  static createCircuitBreakerError(context: ErrorContext = {}): CircuitBreakerError {
    return new CircuitBreakerError(
      'Service is temporarily unavailable due to repeated failures',
      context
    )
  }

  static createFirebaseAuthError(message: string, context: ErrorContext = {}): FirebaseAuthError {
    return new FirebaseAuthError(message, context)
  }
}