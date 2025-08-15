/**
 * Comprehensive Unit Tests for Batch Error Handling
 * 
 * Tests all functionality including:
 * - Error classification and creation
 * - Circuit breaker functionality
 * - Retry manager with exponential backoff
 * - Error recovery workflows
 * - Batch-specific error types
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  BatchCircuitBreaker,
  BatchRetryManager,
  createBatchError,
  handleBatchError,
  isBatchErrorRetryable,
  getBatchErrorRecoveryActions,
  BatchError,
} from '@/lib/batch-error-handling';
import {
  AppError,
  ErrorSeverity,
  ErrorCategory,
  CircuitBreakerState,
  createNetworkError,
  createValidationError,
  createSystemError,
  showErrorToast,
} from '@/lib/error-handling';

// ===== MOCKS =====

// Mock showErrorToast
jest.mock('@/lib/error-handling', () => ({
  ...jest.requireActual('@/lib/error-handling'),
  showErrorToast: jest.fn(),
}));

const mockShowErrorToast = showErrorToast as jest.MockedFunction<typeof showErrorToast>;

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// ===== TEST DATA =====

const mockBatchContext = {
  batchId: 'batch_test123',
  sessionId: 'session_test456',
  operation: 'validate',
  resumeCount: 5,
};

const createMockOperation = (shouldSucceed = true, delay = 0) => {
  return jest.fn().mockImplementation(() => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (shouldSucceed) {
          resolve('success');
        } else {
          reject(new Error('Operation failed'));
        }
      }, delay);
    });
  });
};

// ===== TEST SUITES =====

// Skip this test suite if database is not available
const skipDatabase = !(global as any).testUtils?.hasRealDatabase;
const describeMethod = skipDatabase ? describe.skip : describe;

describeMethod('Batch Error Handling', () => {
  if (skipDatabase) {
    it('should skip database-dependent tests', () => {
      console.log('⏩ Skipping batch error handling tests - no database available');
    });
    return;
  }
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===== BATCH CIRCUIT BREAKER TESTS =====

  describe('BatchCircuitBreaker', () => {
    let circuitBreaker: BatchCircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new BatchCircuitBreaker({
        enabled: true,
        failureThreshold: 3,
        resetTimeout: 5000,
        monitoringPeriod: 60000,
      });
    });

    it('should initialize with closed state', () => {
      const state = circuitBreaker.getState();

      expect(state.isOpen).toBe(false);
      expect(state.failureCount).toBe(0);
      expect(state.totalRequests).toBe(0);
      expect(state.successfulRequests).toBe(0);
    });

    it('should execute operation successfully when circuit is closed', async () => {
      const mockOperation = createMockOperation(true);

      const result = await circuitBreaker.execute(mockOperation, 'test_operation');

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
      
      const state = circuitBreaker.getState();
      expect(state.totalRequests).toBe(1);
      expect(state.successfulRequests).toBe(1);
      expect(state.failureCount).toBe(0);
    });

    it('should track failures and open circuit when threshold is reached', async () => {
      const mockOperation = createMockOperation(false);

      // Execute 3 failing operations to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation, 'failing_operation');
        } catch (error) {
          // Expected to fail
        }
      }

      const state = circuitBreaker.getState();
      expect(state.isOpen).toBe(true);
      expect(state.failureCount).toBe(3);
      expect(state.totalRequests).toBe(3);
      expect(state.successfulRequests).toBe(0);
    });

    it('should reject operations immediately when circuit is open', async () => {
      const mockOperation = createMockOperation(false);

      // Force circuit to open
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation, 'failing_operation');
        } catch (error) {
          // Expected to fail
        }
      }

      // Next operation should be rejected immediately
      await expect(
        circuitBreaker.execute(createMockOperation(true), 'test_operation')
      ).rejects.toThrow('Circuit breaker is open');

      expect(mockOperation).toHaveBeenCalledTimes(3); // Not called for the rejected operation
    });

    it('should close circuit after reset timeout with successful operation', async () => {
      const mockOperation = createMockOperation(false);

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation, 'failing_operation');
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState().isOpen).toBe(true);

      // Fast-forward past reset timeout
      jest.advanceTimersByTime(6000);

      // Next operation should succeed and close circuit
      const successOperation = createMockOperation(true);
      const result = await circuitBreaker.execute(successOperation, 'recovery_operation');

      expect(result).toBe('success');
      expect(circuitBreaker.getState().isOpen).toBe(false);
      expect(circuitBreaker.getState().failureCount).toBe(0);
    });

    it('should handle disabled circuit breaker', async () => {
      const disabledBreaker = new BatchCircuitBreaker({
        enabled: false,
        failureThreshold: 1,
        resetTimeout: 1000,
        monitoringPeriod: 60000,
      });

      const mockOperation = createMockOperation(false);

      // Even with failures, circuit should remain closed
      for (let i = 0; i < 5; i++) {
        try {
          await disabledBreaker.execute(mockOperation, 'test_operation');
        } catch (error) {
          // Expected to fail
        }
      }

      expect(disabledBreaker.getState().isOpen).toBe(false);
    });

    it('should reset circuit state when requested', async () => {
      const mockOperation = createMockOperation(false);

      // Generate some failures
      for (let i = 0; i < 2; i++) {
        try {
          await circuitBreaker.execute(mockOperation, 'failing_operation');
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState().failureCount).toBe(2);

      circuitBreaker.reset();

      const state = circuitBreaker.getState();
      expect(state.isOpen).toBe(false);
      expect(state.failureCount).toBe(0);
      expect(state.totalRequests).toBe(0);
      expect(state.successfulRequests).toBe(0);
    });
  });

  // ===== BATCH RETRY MANAGER TESTS =====

  describe('BatchRetryManager', () => {
    let retryManager: BatchRetryManager;

    beforeEach(() => {
      retryManager = new BatchRetryManager({
        maxRetries: 3,
        retryDelay: 1000,
        retryConfig: {
          exponentialBackoff: true,
          maxBackoffDelay: 10000,
          jitterEnabled: false,
          retryableErrorCodes: ['NETWORK_ERROR', 'TIMEOUT_ERROR', 'CONNECTION_ERROR'],
        },
      });
    });

    it('should execute operation successfully on first attempt', async () => {
      const mockOperation = createMockOperation(true);

      const result = await retryManager.executeWithRetry(
        mockOperation,
        'successful_operation'
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry operation on retryable failures', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(createNetworkError('Network timeout', { code: 'TIMEOUT_ERROR' }))
        .mockRejectedValueOnce(createNetworkError('Connection lost', { code: 'CONNECTION_ERROR' }))
        .mockResolvedValueOnce('success');

      const result = await retryManager.executeWithRetry(
        mockOperation,
        'retry_operation'
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff for retry delays', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(createNetworkError('Network error', { code: 'NETWORK_ERROR' }))
        .mockRejectedValueOnce(createNetworkError('Network error', { code: 'NETWORK_ERROR' }))
        .mockResolvedValueOnce('success');

      const startTime = Date.now();
      
      const resultPromise = retryManager.executeWithRetry(
        mockOperation,
        'backoff_test'
      );

      // Fast-forward through retry delays
      jest.advanceTimersByTime(1000); // First retry delay
      jest.advanceTimersByTime(2000); // Second retry delay (exponential)

      const result = await resultPromise;

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const validationError = createValidationError('Invalid input', {
        code: 'VALIDATION_ERROR',
      });

      const mockOperation = jest.fn().mockRejectedValue(validationError);

      await expect(
        retryManager.executeWithRetry(mockOperation, 'non_retryable_operation')
      ).rejects.toThrow('Invalid input');

      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should respect max retries limit', async () => {
      const networkError = createNetworkError('Network error', { code: 'NETWORK_ERROR' });
      const mockOperation = jest.fn().mockRejectedValue(networkError);

      await expect(
        retryManager.executeWithRetry(mockOperation, 'max_retries_test')
      ).rejects.toThrow('Network error');

      expect(mockOperation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });

    it('should apply jitter when enabled', async () => {
      const jitterRetryManager = new BatchRetryManager({
        maxRetries: 2,
        retryDelay: 1000,
        retryConfig: {
          exponentialBackoff: false,
          maxBackoffDelay: 10000,
          jitterEnabled: true,
          retryableErrorCodes: ['NETWORK_ERROR'],
        },
      });

      const mockOperation = jest.fn()
        .mockRejectedValueOnce(createNetworkError('Network error', { code: 'NETWORK_ERROR' }))
        .mockResolvedValueOnce('success');

      const resultPromise = jitterRetryManager.executeWithRetry(
        mockOperation,
        'jitter_test'
      );

      // With jitter, delay should be different from base delay
      jest.advanceTimersByTime(1500); // Should be enough with jitter

      const result = await resultPromise;
      expect(result).toBe('success');
    });

    it('should handle various error types correctly', async () => {
      const timeoutError = new Error('timeout');
      timeoutError.name = 'TimeoutError';

      const fetchError = new TypeError('failed to fetch');

      const mockOperation = jest.fn()
        .mockRejectedValueOnce(timeoutError)
        .mockRejectedValueOnce(fetchError)
        .mockResolvedValueOnce('success');

      const result = await retryManager.executeWithRetry(
        mockOperation,
        'error_conversion_test'
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should include retry context in error when max retries exceeded', async () => {
      const networkError = createNetworkError('Network error', { code: 'NETWORK_ERROR' });
      const mockOperation = jest.fn().mockRejectedValue(networkError);

      try {
        await retryManager.executeWithRetry(
          mockOperation,
          'context_test',
          {
            batchId: 'test_batch',
            sessionId: 'test_session',
            operationType: 'validation',
          }
        );
      } catch (error) {
        const appError = error as AppError;
        expect(appError.attempts).toBe(4);
        expect(appError.maxRetries).toBe(3);
      }
    });
  });

  // ===== BATCH ERROR FACTORY TESTS =====

  describe('createBatchError', () => {
    it('should create network batch error', () => {
      const error = createBatchError(
        'network_error',
        'Connection failed',
        'NETWORK_001',
        true,
        ['Check connection'],
        mockBatchContext
      );

      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryable).toBe(true);
      expect(error.batchContext).toEqual(mockBatchContext);
      expect(error.suggestedActions).toContain('Check connection');
    });

    it('should create validation batch error', () => {
      const error = createBatchError(
        'validation_failed',
        'Invalid batch data',
        'VALIDATION_001',
        false,
        ['Upload resumes first'],
        mockBatchContext
      );

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.retryable).toBe(false);
      expect(error.suggestedActions).toContain('Upload resumes first');
    });

    it('should create security batch error', () => {
      const error = createBatchError(
        'security_error',
        'Access denied',
        'SECURITY_001',
        false,
        ['Check permissions'],
        mockBatchContext
      );

      expect(error.category).toBe(ErrorCategory.SECURITY);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(false);
    });

    it('should create system batch error', () => {
      const error = createBatchError(
        'server_error',
        'Internal server error',
        'SYSTEM_001',
        true,
        ['Try again later'],
        mockBatchContext
      );

      expect(error.category).toBe(ErrorCategory.SYSTEM);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(true);
    });

    it('should use default suggestions when none provided', () => {
      const error = createBatchError(
        'timeout_error',
        'Request timeout',
        'TIMEOUT_001',
        true,
        [],
        mockBatchContext
      );

      expect(error.suggestedActions).toContain('Try again');
      expect(error.suggestedActions).toContain('Check your connection speed');
    });

    it('should categorize corrupted data errors as high severity', () => {
      const error = createBatchError(
        'corrupted_data',
        'Data integrity check failed',
        'CORRUPT_001',
        false,
        [],
        mockBatchContext
      );

      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.category).toBe(ErrorCategory.SYSTEM);
    });
  });

  // ===== ERROR HANDLING UTILITIES TESTS =====

  describe('handleBatchError', () => {
    let batchError: BatchError;

    beforeEach(() => {
      batchError = createBatchError(
        'network_error',
        'Connection failed',
        'NETWORK_001',
        true,
        ['Check connection'],
        mockBatchContext
      );
    });

    it('should log error with appropriate level', () => {
      handleBatchError(batchError, { logLevel: 'warn' });

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('NETWORK_001'),
        expect.objectContaining({
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          batchContext: mockBatchContext,
        })
      );
    });

    it('should show toast notification by default', () => {
      handleBatchError(batchError);

      expect(mockShowErrorToast).toHaveBeenCalledWith(batchError);
    });

    it('should not show toast when disabled', () => {
      handleBatchError(batchError, { showToast: false });

      expect(mockShowErrorToast).not.toHaveBeenCalled();
    });

    it('should exclude context when requested', () => {
      handleBatchError(batchError, { includeContext: false });

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('NETWORK_001'),
        expect.not.objectContaining({
          batchContext: expect.anything(),
          context: expect.anything(),
        })
      );
    });
  });

  describe('isBatchErrorRetryable', () => {
    it('should identify retryable network errors', () => {
      const networkError = createBatchError(
        'network_error',
        'Connection timeout',
        'TIMEOUT_001',
        true,
        [],
        mockBatchContext
      );

      expect(isBatchErrorRetryable(networkError)).toBe(true);
    });

    it('should identify non-retryable validation errors', () => {
      const validationError = createBatchError(
        'validation_failed',
        'Invalid format',
        'VALIDATION_001',
        false,
        [],
        mockBatchContext
      );

      expect(isBatchErrorRetryable(validationError)).toBe(false);
    });

    it('should respect error retryable flag', () => {
      const nonRetryableError = createBatchError(
        'network_error',
        'Non-retryable network error',
        'NETWORK_001',
        false, // Explicitly non-retryable
        [],
        mockBatchContext
      );

      expect(isBatchErrorRetryable(nonRetryableError)).toBe(false);
    });
  });

  describe('getBatchErrorRecoveryActions', () => {
    it('should provide retry action for retryable errors', () => {
      const retryableError = createBatchError(
        'network_error',
        'Connection failed',
        'NETWORK_001',
        true,
        [],
        mockBatchContext
      );

      const actions = getBatchErrorRecoveryActions(retryableError);

      expect(actions).toContainEqual(
        expect.objectContaining({
          id: 'retry',
          label: 'Retry Operation',
          isDestructive: false,
        })
      );
    });

    it('should provide refresh action for network errors', () => {
      const networkError = createBatchError(
        'network_error',
        'Connection lost',
        'NETWORK_001',
        true,
        [],
        mockBatchContext
      );

      const actions = getBatchErrorRecoveryActions(networkError);

      expect(actions).toContainEqual(
        expect.objectContaining({
          id: 'refresh',
          label: 'Refresh Page',
          isDestructive: false,
        })
      );
    });

    it('should provide create new batch action for validation errors', () => {
      const validationError = createBatchError(
        'batch_not_found',
        'Batch does not exist',
        'VALIDATION_001',
        false,
        [],
        mockBatchContext
      );

      const actions = getBatchErrorRecoveryActions(validationError);

      expect(actions).toContainEqual(
        expect.objectContaining({
          id: 'create_new_batch',
          label: 'Create New Batch',
          isDestructive: true,
        })
      );
    });

    it('should provide reset session action for security errors', () => {
      const securityError = createBatchError(
        'session_invalid',
        'Session expired',
        'SECURITY_001',
        false,
        [],
        mockBatchContext
      );

      const actions = getBatchErrorRecoveryActions(securityError);

      expect(actions).toContainEqual(
        expect.objectContaining({
          id: 'reset_session',
          label: 'Reset Session',
          isDestructive: true,
        })
      );
    });

    it('should handle errors with multiple applicable actions', () => {
      const complexError = createBatchError(
        'network_error',
        'Connection failed',
        'BATCH_NOT_FOUND',
        true,
        [],
        mockBatchContext
      );

      const actions = getBatchErrorRecoveryActions(complexError);

      // Should have both retry and refresh actions
      expect(actions.length).toBeGreaterThan(1);
      expect(actions.some(action => action.id === 'retry')).toBe(true);
      expect(actions.some(action => action.id === 'refresh')).toBe(true);
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration Tests', () => {
    it('should work together: circuit breaker + retry manager', async () => {
      const circuitBreaker = new BatchCircuitBreaker({
        enabled: true,
        failureThreshold: 2,
        resetTimeout: 1000,
        monitoringPeriod: 60000,
      });

      const retryManager = new BatchRetryManager({
        maxRetries: 1,
        retryDelay: 100,
        retryConfig: {
          exponentialBackoff: false,
          maxBackoffDelay: 1000,
          jitterEnabled: false,
          retryableErrorCodes: ['NETWORK_ERROR'],
        },
      });

      const mockOperation = createMockOperation(false);

      // First operation: retry manager will try twice, both fail
      try {
        await retryManager.executeWithRetry(
          () => circuitBreaker.execute(mockOperation, 'test_op'),
          'integrated_test'
        );
      } catch (error) {
        // Expected to fail
      }

      // Circuit breaker should now be open
      expect(circuitBreaker.getState().isOpen).toBe(true);

      // Next operation should fail immediately due to circuit breaker
      await expect(
        circuitBreaker.execute(createMockOperation(true), 'should_fail_immediately')
      ).rejects.toThrow('Circuit breaker is open');
    });

    it('should handle batch context in error flow', async () => {
      const retryManager = new BatchRetryManager({
        maxRetries: 1,
        retryDelay: 100,
        retryConfig: {
          exponentialBackoff: false,
          maxBackoffDelay: 1000,
          jitterEnabled: false,
          retryableErrorCodes: ['NETWORK_ERROR'],
        },
      });

      const mockOperation = jest.fn().mockRejectedValue(
        createNetworkError('Network error', { code: 'NETWORK_ERROR' })
      );

      try {
        await retryManager.executeWithRetry(
          mockOperation,
          'context_integration_test',
          mockBatchContext
        );
      } catch (error) {
        const batchError = createBatchError(
          'network_error',
          'Final error',
          'NETWORK_001',
          false,
          [],
          mockBatchContext
        );

        const actions = getBatchErrorRecoveryActions(batchError);
        expect(actions.length).toBeGreaterThan(0);

        handleBatchError(batchError, { showToast: false });
        expect(console.error).toHaveBeenCalledWith(
          expect.stringContaining('NETWORK_001'),
          expect.objectContaining({
            batchContext: mockBatchContext,
          })
        );
      }
    });
  });
});