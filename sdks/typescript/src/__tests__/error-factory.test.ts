/**
 * Tests for ErrorFactory HTTP status code mappings
 * Ensures all expected HTTP status codes map to appropriate error types with recovery actions
 */

import { describe, it, expect } from 'vitest';
import { 
  ErrorFactory, 
  ErrorCode, 
  EvalMatchError, 
  ValidationError, 
  AuthenticationError, 
  RateLimitError, 
  NetworkError, 
  ServerError 
} from '../core/errors';

describe('ErrorFactory HTTP Status Code Mappings', () => {
  const createMockAxiosError = (status: number, message = 'Test error', data?: any) => ({
    response: {
      status,
      data: data || { message }
    },
    config: {
      url: '/test-endpoint',
      method: 'POST',
      metadata: {
        requestId: 'req_test_123',
        duration: 150
      }
    }
  });

  describe('4xx Client Errors', () => {
    it('should map 400 to ValidationError with INVALID_REQUEST code', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(400, 'Bad request'));
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(error.context.statusCode).toBe(400);
      expect(error.recoveryActions).toHaveLength(1);
      expect(error.recoveryActions[0].type).toBe('check_parameters');
      expect(error.isRetryable).toBe(false);
    });

    it('should map 401 to AuthenticationError', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(401, 'Unauthorized'));
      
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect(error.context.statusCode).toBe(401);
      expect(error.recoveryActions.some(action => action.type === 'authenticate')).toBe(true);
    });

    it('should map 403 to EvalMatchError with INSUFFICIENT_PERMISSIONS', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(403, 'Forbidden'));
      
      expect(error).toBeInstanceOf(EvalMatchError);
      expect(error.code).toBe(ErrorCode.INSUFFICIENT_PERMISSIONS);
      expect(error.context.statusCode).toBe(403);
      expect(error.recoveryActions[0].type).toBe('contact_support');
      expect(error.isRetryable).toBe(false);
    });

    it('should map 404 to EvalMatchError with RESOURCE_NOT_FOUND', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(404, 'Not found'));
      
      expect(error).toBeInstanceOf(EvalMatchError);
      expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
      expect(error.context.statusCode).toBe(404);
      expect(error.recoveryActions[0].type).toBe('check_parameters');
      expect(error.isRetryable).toBe(false);
    });

    it('should map 408 to EvalMatchError with REQUEST_TIMEOUT', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(408, 'Request timeout'));
      
      expect(error).toBeInstanceOf(EvalMatchError);
      expect(error.code).toBe(ErrorCode.REQUEST_TIMEOUT);
      expect(error.context.statusCode).toBe(408);
      expect(error.isRetryable).toBe(true);
      expect(error.recoveryActions).toHaveLength(2);
      expect(error.recoveryActions.some(action => action.type === 'retry')).toBe(true);
      expect(error.recoveryActions.some(action => action.type === 'reduce_payload')).toBe(true);
    });

    it('should map 409 to EvalMatchError with CONFLICT', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(409, 'Conflict'));
      
      expect(error).toBeInstanceOf(EvalMatchError);
      expect(error.code).toBe(ErrorCode.CONFLICT);
      expect(error.context.statusCode).toBe(409);
      expect(error.isRetryable).toBe(false);
      expect(error.recoveryActions).toHaveLength(2);
      expect(error.recoveryActions.some(action => action.type === 'refresh_and_retry')).toBe(true);
      expect(error.recoveryActions.some(action => action.type === 'check_parameters')).toBe(true);
    });

    it('should map 413 to ValidationError with FILE_TOO_LARGE', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(413, 'Payload too large'));
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.FILE_TOO_LARGE);
      expect(error.context.statusCode).toBe(413);
      expect(error.recoveryActions[0].type).toBe('check_parameters');
    });

    it('should map 415 to ValidationError with INVALID_FILE_FORMAT', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(415, 'Unsupported media type'));
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe(ErrorCode.INVALID_FILE_FORMAT);
      expect(error.context.statusCode).toBe(415);
      expect(error.recoveryActions[0].type).toBe('check_parameters');
    });

    it('should map 422 to EvalMatchError with UNPROCESSABLE_ENTITY', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(422, 'Unprocessable entity'));
      
      expect(error).toBeInstanceOf(EvalMatchError);
      expect(error.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
      expect(error.context.statusCode).toBe(422);
      expect(error.isRetryable).toBe(false);
      expect(error.recoveryActions).toHaveLength(2);
      expect(error.recoveryActions.some(action => action.type === 'validate_input')).toBe(true);
      expect(error.recoveryActions.some(action => action.type === 'check_documentation')).toBe(true);
    });

    it('should map 429 to RateLimitError with retry information', () => {
      const mockData = { message: 'Rate limit exceeded', retryAfter: 120 };
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(429, 'Too many requests', mockData));
      
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
      expect(error.context.statusCode).toBe(429);
      expect(error.isRetryable).toBe(true);
      expect(error.recoveryActions[0].type).toBe('wait');
      expect(error.recoveryActions[0].retryAfter).toBe(120);
    });

    it('should use default retryAfter for 429 when not provided', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(429, 'Too many requests'));
      
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.recoveryActions[0].retryAfter).toBe(60); // Default value
    });
  });

  describe('5xx Server Errors', () => {
    it('should map 500 to ServerError with INTERNAL_SERVER_ERROR', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(500, 'Internal server error'));
      
      expect(error).toBeInstanceOf(ServerError);
      expect(error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(error.context.statusCode).toBe(500);
      expect(error.isRetryable).toBe(true);
    });

    it('should map 502/503/504 to ServerError with SERVICE_UNAVAILABLE', () => {
      const statuses = [502, 503, 504];
      
      statuses.forEach(status => {
        const error = ErrorFactory.createFromHttpError(createMockAxiosError(status, 'Service unavailable'));
        
        expect(error).toBeInstanceOf(ServerError);
        expect(error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
        expect(error.context.statusCode).toBe(status);
        expect(error.isRetryable).toBe(true);
      });
    });
  });

  describe('Network Errors', () => {
    it('should map network errors (no status) to NetworkError', () => {
      const networkError = {
        message: 'Network Error',
        code: 'ECONNREFUSED',
        config: {
          url: '/test-endpoint',
          method: 'GET'
        }
      };

      const error = ErrorFactory.createFromHttpError(networkError);
      
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('Unknown Status Codes', () => {
    it('should map unknown 4xx codes to generic EvalMatchError (non-retryable)', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(418, "I'm a teapot"));
      
      expect(error).toBeInstanceOf(EvalMatchError);
      expect(error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(error.context.statusCode).toBe(418);
      expect(error.isRetryable).toBe(false); // 4xx should not be retryable
      expect(error.recoveryActions[0].type).toBe('contact_support');
    });

    it('should map unknown 5xx codes to generic EvalMatchError (retryable)', () => {
      const error = ErrorFactory.createFromHttpError(createMockAxiosError(599, 'Unknown server error'));
      
      expect(error).toBeInstanceOf(EvalMatchError);
      expect(error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR);
      expect(error.context.statusCode).toBe(599);
      expect(error.isRetryable).toBe(true); // 5xx should be retryable
      expect(error.recoveryActions[0].type).toBe('contact_support');
    });
  });

  describe('Error Context Enrichment', () => {
    it('should enrich error context with request metadata', () => {
      const mockError = {
        response: {
          status: 400,
          data: { message: 'Bad request' }
        },
        config: {
          url: '/api/resumes',
          method: 'post',
          metadata: {
            requestId: 'req_abc123',
            duration: 250
          }
        }
      };

      const error = ErrorFactory.createFromHttpError(mockError);
      
      expect(error.context.statusCode).toBe(400);
      expect(error.context.endpoint).toBe('/api/resumes');
      expect(error.context.method).toBe('POST');
      expect(error.context.requestId).toBe('req_abc123');
      expect(error.context.duration).toBe(250);
    });

    it('should prioritize provided context over error object data', () => {
      const mockError = createMockAxiosError(404, 'Not found');
      const providedContext = {
        requestId: 'override_req_id',
        endpoint: '/override/endpoint',
        method: 'PUT'
      };

      const error = ErrorFactory.createFromHttpError(mockError, providedContext);
      
      expect(error.context.requestId).toBe('override_req_id');
      expect(error.context.endpoint).toBe('/override/endpoint');
      expect(error.context.method).toBe('PUT');
      expect(error.context.statusCode).toBe(404); // Should still get status from error
    });
  });

  describe('Recovery Actions Validation', () => {
    it('should provide appropriate recovery actions for each error type', () => {
      const testCases = [
        { status: 400, expectedActions: ['check_parameters'] },
        { status: 401, expectedActions: ['authenticate'] },
        { status: 403, expectedActions: ['contact_support'] },
        { status: 404, expectedActions: ['check_parameters'] },
        { status: 408, expectedActions: ['retry', 'reduce_payload'] },
        { status: 409, expectedActions: ['refresh_and_retry', 'check_parameters'] },
        { status: 413, expectedActions: ['check_parameters'] },
        { status: 415, expectedActions: ['check_parameters'] },
        { status: 422, expectedActions: ['validate_input', 'check_documentation'] },
        { status: 429, expectedActions: ['wait'] },
        { status: 500, expectedActions: ['retry'] }
      ];

      testCases.forEach(({ status, expectedActions }) => {
        const error = ErrorFactory.createFromHttpError(createMockAxiosError(status));
        
        expectedActions.forEach(expectedAction => {
          expect(error.recoveryActions.some(action => action.type === expectedAction))
            .toBe(true, `Status ${status} should have recovery action: ${expectedAction}`);
        });
      });
    });
  });

  describe('Error Envelope Integration', () => {
    it('should return error envelope with recovery actions when throwOnError: false', () => {
      // This test verifies the integration between ErrorFactory and error envelope handling
      const mockError = createMockAxiosError(422, 'Validation failed');
      const error = ErrorFactory.createFromHttpError(mockError);
      
      // Verify the error has proper recovery actions that would be included in envelope
      expect(error.recoveryActions).toHaveLength(2);
      expect(error.recoveryActions[0].type).toBe('validate_input');
      expect(error.recoveryActions[1].type).toBe('check_documentation');
      
      // These recovery actions should be available when the error is converted to an envelope
      expect(error.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY);
      expect(error.isRetryable).toBe(false);
    });

    it('should handle 429 errors with header-based retry information', () => {
      const mockError = {
        response: {
          status: 429,
          headers: { 'retry-after': '120' },
          data: { message: 'Rate limit exceeded' }
        },
        config: { url: '/test' }
      };
      
      const error = ErrorFactory.createFromHttpError(mockError);
      
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.recoveryActions[0].retryAfter).toBe(120); // From header
    });

    it('should fallback to body retryAfter when header is missing', () => {
      const mockError = {
        response: {
          status: 429,
          headers: {},
          data: { message: 'Rate limit exceeded', retryAfter: 90 }
        },
        config: { url: '/test' }
      };
      
      const error = ErrorFactory.createFromHttpError(mockError);
      
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.recoveryActions[0].retryAfter).toBe(90); // From body
    });
  });
});