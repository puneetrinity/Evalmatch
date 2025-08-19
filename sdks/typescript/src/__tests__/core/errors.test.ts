/**
 * Tests for Enhanced Error Classes
 */

import { describe, it, expect } from 'vitest'
import {
  EvalMatchError,
  NetworkError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  ServerError,
  CircuitBreakerError,
  FirebaseAuthError,
  ErrorFactory,
  ErrorCode
} from '../../core/errors'

describe('EvalMatchError', () => {
  it('should create error with all properties', () => {
    const context = {
      requestId: 'req_123',
      duration: 500,
      statusCode: 400
    }

    const recoveryActions = [
      { type: 'retry' as const, description: 'Try again' }
    ]

    const error = new EvalMatchError(
      'Test error',
      ErrorCode.INVALID_REQUEST,
      context,
      recoveryActions,
      true,
      new Error('Original error')
    )

    expect(error.message).toBe('Test error')
    expect(error.name).toBe('EvalMatchError')
    expect(error.code).toBe(ErrorCode.INVALID_REQUEST)
    expect(error.context).toMatchObject(context)
    expect(error.context.timestamp).toBeDefined()
    expect(error.recoveryActions).toEqual(recoveryActions)
    expect(error.isRetryable).toBe(true)
    expect(error.originalError).toBeInstanceOf(Error)
  })

  it('should serialize to JSON properly', () => {
    const error = new EvalMatchError(
      'Test error',
      ErrorCode.NETWORK_ERROR,
      { requestId: 'req_123' }
    )

    const json = error.toJSON()

    expect(json).toMatchObject({
      name: 'EvalMatchError',
      message: 'Test error',
      code: ErrorCode.NETWORK_ERROR,
      context: {
        requestId: 'req_123',
        timestamp: expect.any(String)
      },
      isRetryable: false,
      stack: expect.any(String)
    })
  })

  it('should have proper toString representation', () => {
    const error = new EvalMatchError(
      'Test error',
      ErrorCode.RATE_LIMIT_EXCEEDED
    )

    expect(error.toString()).toBe('EvalMatchError [RATE_LIMIT_EXCEEDED]: Test error')
  })
})

describe('Specific Error Classes', () => {
  it('should create NetworkError with retry actions', () => {
    const error = new NetworkError('Connection failed', { requestId: 'req_123' })

    expect(error.code).toBe(ErrorCode.NETWORK_ERROR)
    expect(error.isRetryable).toBe(true)
    expect(error.recoveryActions).toHaveLength(2)
    expect(error.recoveryActions[0].type).toBe('retry')
    expect(error.recoveryActions[1].type).toBe('contact_support')
  })

  it('should create AuthenticationError with auth actions', () => {
    const error = new AuthenticationError('Invalid token')

    expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
    expect(error.isRetryable).toBe(false)
    expect(error.recoveryActions[0].type).toBe('authenticate')
  })

  it('should create RateLimitError with wait action', () => {
    const error = new RateLimitError('Too many requests', 60)

    expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED)
    expect(error.isRetryable).toBe(true)
    expect(error.recoveryActions[0].type).toBe('wait')
    expect(error.recoveryActions[0].retryAfter).toBe(60)
  })

  it('should create ValidationError with check parameters action', () => {
    const error = new ValidationError('Invalid input', ErrorCode.INVALID_PARAMETERS)

    expect(error.code).toBe(ErrorCode.INVALID_PARAMETERS)
    expect(error.isRetryable).toBe(false)
    expect(error.recoveryActions[0].type).toBe('check_parameters')
  })

  it('should create ServerError with appropriate retry behavior', () => {
    const retryableError = new ServerError('Internal error', ErrorCode.INTERNAL_SERVER_ERROR)
    expect(retryableError.isRetryable).toBe(true)
    expect(retryableError.recoveryActions[0].type).toBe('retry')

    const nonRetryableError = new ServerError('Not found', ErrorCode.RESOURCE_NOT_FOUND)
    expect(nonRetryableError.isRetryable).toBe(false)
    expect(nonRetryableError.recoveryActions[0].type).toBe('contact_support')
  })

  it('should create CircuitBreakerError with wait action', () => {
    const error = new CircuitBreakerError('Service unavailable')

    expect(error.code).toBe(ErrorCode.CIRCUIT_BREAKER_OPEN)
    expect(error.isRetryable).toBe(false)
    expect(error.recoveryActions[0].type).toBe('wait')
    expect(error.recoveryActions[0].waitTime).toBe(30000)
  })

  it('should create FirebaseAuthError with auth action', () => {
    const error = new FirebaseAuthError('Firebase auth failed')

    expect(error.code).toBe(ErrorCode.FIREBASE_AUTH_ERROR)
    expect(error.isRetryable).toBe(false)
    expect(error.recoveryActions[0].type).toBe('authenticate')
  })
})

describe('ErrorFactory', () => {
  it('should create ValidationError for 400 status', () => {
    const httpError = {
      status: 400,
      response: {
        status: 400,
        data: { message: 'Bad request' }
      },
      config: { url: '/test', method: 'post' }
    }

    const error = ErrorFactory.createFromHttpError(httpError)

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.code).toBe(ErrorCode.INVALID_REQUEST)
    expect(error.context.statusCode).toBe(400)
    expect(error.context.endpoint).toBe('/test')
    expect(error.context.method).toBe('POST')
  })

  it('should create AuthenticationError for 401 status', () => {
    const httpError = {
      status: 401,
      response: {
        status: 401,
        data: { message: 'Unauthorized' }
      }
    }

    const error = ErrorFactory.createFromHttpError(httpError)

    expect(error).toBeInstanceOf(AuthenticationError)
    expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
  })

  it('should create RateLimitError for 429 status', () => {
    const httpError = {
      status: 429,
      response: {
        status: 429,
        data: { 
          message: 'Rate limit exceeded',
          retryAfter: 120
        }
      }
    }

    const error = ErrorFactory.createFromHttpError(httpError)

    expect(error).toBeInstanceOf(RateLimitError)
    expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED)
    expect(error.recoveryActions[0].retryAfter).toBe(120)
  })

  it('should create ServerError for 5xx status', () => {
    const httpError = {
      status: 500,
      response: {
        status: 500,
        data: { message: 'Internal server error' }
      }
    }

    const error = ErrorFactory.createFromHttpError(httpError)

    expect(error).toBeInstanceOf(ServerError)
    expect(error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR)
    expect(error.isRetryable).toBe(true)
  })

  it('should create NetworkError for no status', () => {
    const httpError = {
      message: 'Network Error',
      config: { url: '/test' }
    }

    const error = ErrorFactory.createFromHttpError(httpError)

    expect(error).toBeInstanceOf(NetworkError)
    expect(error.code).toBe(ErrorCode.NETWORK_ERROR)
    expect(error.isRetryable).toBe(true)
  })

  it('should handle file size errors (413)', () => {
    const httpError = {
      status: 413,
      response: {
        status: 413,
        data: { message: 'File too large' }
      }
    }

    const error = ErrorFactory.createFromHttpError(httpError)

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.code).toBe(ErrorCode.FILE_TOO_LARGE)
  })

  it('should handle unsupported media type (415)', () => {
    const httpError = {
      status: 415,
      response: {
        status: 415,
        data: { message: 'Unsupported file format' }
      }
    }

    const error = ErrorFactory.createFromHttpError(httpError)

    expect(error).toBeInstanceOf(ValidationError)
    expect(error.code).toBe(ErrorCode.INVALID_FILE_FORMAT)
  })

  it('should create CircuitBreakerError', () => {
    const error = ErrorFactory.createCircuitBreakerError({
      circuitBreakerState: 'open'
    })

    expect(error).toBeInstanceOf(CircuitBreakerError)
    expect(error.code).toBe(ErrorCode.CIRCUIT_BREAKER_OPEN)
    expect(error.context.circuitBreakerState).toBe('open')
  })

  it('should create FirebaseAuthError', () => {
    const error = ErrorFactory.createFirebaseAuthError('Token expired', {
      requestId: 'req_123'
    })

    expect(error).toBeInstanceOf(FirebaseAuthError)
    expect(error.code).toBe(ErrorCode.FIREBASE_AUTH_ERROR)
    expect(error.message).toBe('Token expired')
    expect(error.context.requestId).toBe('req_123')
  })

  it('should enrich context for unknown status codes', () => {
    const httpError = {
      status: 418, // I'm a teapot
      response: {
        status: 418,
        data: { message: "I'm a teapot" }
      },
      config: { 
        url: '/coffee',
        method: 'brew',
        metadata: {
          requestId: 'req_coffee_123',
          duration: 1000
        }
      }
    }

    const error = ErrorFactory.createFromHttpError(httpError, {
      circuitBreakerState: 'closed'
    })

    expect(error.context).toMatchObject({
      statusCode: 418,
      endpoint: '/coffee',
      method: 'BREW',
      circuitBreakerState: 'closed',
      timestamp: expect.any(String)
    })
  })
})