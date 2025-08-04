/**
 * Comprehensive Unit Tests for Global Error Handler
 * 
 * Tests all functionality including:
 * - Global error state management
 * - Error rate monitoring and tracking
 * - Network status monitoring
 * - Unhandled error catching
 * - Error recovery actions
 * - React hooks integration
 */

import { renderHook, act } from '@testing-library/react';
import { jest, describe, test, expect, beforeEach, afterEach, beforeAll, afterAll, it } from '@jest/globals';
import {
  GlobalErrorManager,
  globalErrorManager,
  useGlobalErrors,
  useConnectionStatus,
  handleGlobalError,
  reportError,
  createErrorBoundaryHandler,
  createRecoveryActions,
} from '../../../client/src/lib/global-error-handler';
import {
  AppError,
  createNetworkError,
  createSystemError,
  createValidationError,
  createSecurityError,
  ErrorSeverity,
  ErrorCategory,
  showErrorToast,
} from '../../../client/src/lib/error-handling';
import { toast } from '../../../client/src/hooks/use-toast';

// ===== MOCKS =====

// Mock toast notifications
jest.mock('../../../client/src/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

// Mock showErrorToast
jest.mock('../../../client/src/lib/error-handling', () => {
  const actual = jest.requireActual('../../../client/src/lib/error-handling') as any;
  return {
    ...actual,
    showErrorToast: jest.fn(),
  };
});

const mockToast = toast as jest.MockedFunction<typeof toast>;
const mockShowErrorToast = showErrorToast as jest.MockedFunction<typeof showErrorToast>;

// Mock window events
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();

Object.defineProperty(window, 'addEventListener', {
  value: mockAddEventListener,
});

Object.defineProperty(window, 'removeEventListener', {
  value: mockRemoveEventListener,
});

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  value: true,
  writable: true,
});

// Mock navigator.connection
const mockConnection = {
  effectiveType: '4g',
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

Object.defineProperty(navigator, 'connection', {
  value: mockConnection,
  writable: true,
});

// Mock window location
const mockReload = jest.fn();
delete (window as any).location;
(window as any).location = {
  reload: mockReload,
  href: 'http://localhost/',
};

// Mock caches API
const mockCaches = {
  keys: jest.fn<() => Promise<string[]>>().mockResolvedValue(['cache1', 'cache2']),
  delete: jest.fn<(cacheName: string) => Promise<boolean>>().mockResolvedValue(true),
};

Object.defineProperty(window, 'caches', {
  value: mockCaches,
});

// Mock localStorage and sessionStorage
const mockStorage = {
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockStorage,
});

Object.defineProperty(window, 'sessionStorage', {
  value: mockStorage,
});

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();
  console.group = jest.fn();
  console.groupEnd = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// ===== TEST DATA =====

const createMockError = (type: 'network' | 'system' | 'validation' | 'security' = 'network') => {
  switch (type) {
    case 'network':
      return createNetworkError('Network connection failed', {
        code: 'NETWORK_001',
        isConnectionLost: true,
      });
    case 'system':
      return createSystemError('System error occurred', {
        code: 'SYSTEM_001',
        componentName: 'TestComponent',
      });
    case 'validation':
      return createValidationError('Validation failed', {
        code: 'VALIDATION_001',
        field: 'email',
      });
    case 'security':
      return createSecurityError('Access denied', {
        code: 'SECURITY_001',
        riskLevel: 'high',
      });
  }
};

// ===== TEST HELPERS =====

const triggerWindowEvent = (eventType: string, eventData?: any) => {
  const eventHandlers = mockAddEventListener.mock.calls
    .filter(call => call[0] === eventType)
    .map(call => call[1]);
  
  eventHandlers.forEach(handler => {
    if (typeof handler === 'function') {
      handler(eventData || { type: eventType });
    }
  });
};

const triggerConnectionChange = (effectiveType: string) => {
  mockConnection.effectiveType = effectiveType;
  const connectionHandlers = mockConnection.addEventListener.mock.calls
    .filter(call => call[0] === 'change')
    .map(call => call[1]);
  
  connectionHandlers.forEach(handler => {
    if (typeof handler === 'function') {
      handler();
    }
  });
};

// ===== TEST SUITES =====

describe('Global Error Handler', () => {
  let errorManager: GlobalErrorManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
    });

    errorManager = new GlobalErrorManager();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===== GLOBAL ERROR MANAGER TESTS =====

  describe('GlobalErrorManager', () => {
    it('should initialize with correct default state', () => {
      const state = errorManager.getState();

      expect(state.errors).toEqual([]);
      expect(state.errorCount).toBe(0);
      expect(state.errorRate).toBe(0);
      expect(state.isOnline).toBe(true);
      expect(state.connectionQuality).toBe('excellent');
    });

    it('should setup network event listeners', () => {
      expect(mockAddEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockAddEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
      expect(mockAddEventListener).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockAddEventListener).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));
    });

    it('should setup connection quality monitoring', () => {
      expect(mockConnection.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should handle online event', () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', { value: false });
      
      triggerWindowEvent('online');

      const state = errorManager.getState();
      expect(state.isOnline).toBe(true);
      expect(state.connectionQuality).toBe('good');
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Connection Restored',
        description: "You're back online. Retrying failed operations...",
        duration: 3000,
      });
    });

    it('should handle offline event', () => {
      triggerWindowEvent('offline');

      const state = errorManager.getState();
      expect(state.isOnline).toBe(false);
      expect(state.connectionQuality).toBe('offline');
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Connection Lost',
        description: "You're offline. Some features may not work properly.",
        duration: 5000,
      });
    });

    it('should update connection quality based on effectiveType', () => {
      triggerConnectionChange('4g');
      expect(errorManager.getState().connectionQuality).toBe('excellent');

      triggerConnectionChange('3g');
      expect(errorManager.getState().connectionQuality).toBe('good');

      triggerConnectionChange('2g');
      expect(errorManager.getState().connectionQuality).toBe('poor');
    });

    it('should handle connection quality when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false });
      
      triggerConnectionChange('4g');
      expect(errorManager.getState().connectionQuality).toBe('offline');
    });
  });

  // ===== ERROR HANDLING TESTS =====

  describe('Error Handling', () => {
    it('should handle AppError objects', () => {
      const networkError = createMockError('network');
      
      const result = errorManager.handleError(networkError);

      expect(result).toBe(networkError);
      expect(errorManager.getState().errors).toContain(networkError);
      expect(errorManager.getState().errorCount).toBe(1);
      expect(errorManager.getState().lastError).toBe(networkError);
    });

    it('should convert Error objects to AppError', () => {
      const jsError = new Error('JavaScript error');
      jsError.stack = 'Stack trace';

      const result = errorManager.handleError(jsError);

      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.message).toBe('JavaScript error');
      expect(result.context.stackTrace).toBe('Stack trace');
    });

    it('should convert string errors to AppError', () => {
      const result = errorManager.handleError('String error message');

      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.message).toBe('String error message');
    });

    it('should convert unknown errors to AppError', () => {
      const result = errorManager.handleError(null);

      expect(result.category).toBe(ErrorCategory.SYSTEM);
      expect(result.message).toBe('Unknown error occurred');
    });

    it('should add custom context to errors', () => {
      const customContext = { customField: 'customValue' };
      
      errorManager.handleError('Test error', { context: customContext });

      const state = errorManager.getState();
      expect(state.lastError?.context.additionalData).toEqual(customContext);
    });

    it('should handle offline network errors differently', () => {
      // Set offline before handling error
      errorManager['state'].isOnline = false;
      
      const networkError = createMockError('network');
      const result = errorManager.handleError(networkError);

      expect(result.message).toBe('You are currently offline');
      expect(result.code).toBe('OFFLINE_ERROR');
      expect(result.userFriendlyMessage).toContain('You are offline');
    });

    it('should show toast notifications by default', () => {
      const error = createMockError('system');
      
      errorManager.handleError(error);

      expect(mockShowErrorToast).toHaveBeenCalledWith(error);
    });

    it('should skip toast when disabled', () => {
      const error = createMockError('system');
      
      errorManager.handleError(error, { showToast: false });

      expect(mockShowErrorToast).not.toHaveBeenCalled();
    });

    it('should log errors when enabled', () => {
      const error = createMockError('system');
      
      errorManager.handleError(error, { reportToConsole: true });

      expect(console.group).toHaveBeenCalledWith(
        expect.stringContaining('HIGH Error: SYSTEM_001')
      );
      expect(console.error).toHaveBeenCalledWith('Message:', error.message);
      expect(console.groupEnd).toHaveBeenCalled();
    });

    it('should skip console logging when disabled', () => {
      const error = createMockError('system');
      
      errorManager.handleError(error, { reportToConsole: false });

      expect(console.group).not.toHaveBeenCalled();
    });
  });

  // ===== ERROR HISTORY AND RATE MANAGEMENT TESTS =====

  describe('Error History and Rate Management', () => {
    it('should maintain error history with size limit', () => {
      // Create more errors than the limit (assuming MAX_ERROR_HISTORY = 100)
      for (let i = 0; i < 105; i++) {
        errorManager.handleError(`Error ${i}`);
      }

      const state = errorManager.getState();
      expect(state.errors.length).toBe(100); // Should be capped at MAX_ERROR_HISTORY
      expect(state.errorCount).toBe(105); // Total count should still be accurate
    });

    it('should calculate error rate correctly', () => {
      // Add multiple errors quickly
      for (let i = 0; i < 5; i++) {
        errorManager.handleError(`Error ${i}`);
      }

      const state = errorManager.getState();
      expect(state.errorRate).toBe(5);
    });

    it('should exclude old errors from rate calculation', () => {
      // Add an error
      errorManager.handleError('Old error');

      // Fast-forward time beyond rate window (1 minute)
      jest.advanceTimersByTime(65000);

      // Add another error
      errorManager.handleError('New error');

      const state = errorManager.getState();
      expect(state.errorRate).toBe(1); // Only the new error should count
    });

    it('should clear errors and reset state', () => {
      // Add some errors
      for (let i = 0; i < 3; i++) {
        errorManager.handleError(`Error ${i}`);
      }

      errorManager.clearErrors();

      const state = errorManager.getState();
      expect(state.errors).toEqual([]);
      expect(state.errorCount).toBe(0);
      expect(state.errorRate).toBe(0);
      expect(state.lastError).toBeUndefined();
    });
  });

  // ===== TOAST NOTIFICATION LOGIC TESTS =====

  describe('Toast Notification Logic', () => {
    it('should show toasts for medium severity errors', () => {
      const mediumError = createNetworkError('Network error', {
        severity: ErrorSeverity.MEDIUM,
      });

      errorManager.handleError(mediumError);

      expect(mockShowErrorToast).toHaveBeenCalled();
    });

    it('should always show toasts for critical errors', () => {
      const criticalError = createSystemError('Critical error', {
        severity: ErrorSeverity.CRITICAL,
      });

      errorManager.handleError(criticalError);

      expect(mockShowErrorToast).toHaveBeenCalled();
    });

    it('should skip toasts for low severity errors', () => {
      const lowError = createValidationError('Validation error', {
        severity: ErrorSeverity.LOW,
      });

      errorManager.handleError(lowError);

      expect(mockShowErrorToast).not.toHaveBeenCalled();
    });

    it('should limit toasts when error rate is high', () => {
      // Create high error rate
      for (let i = 0; i < 6; i++) {
        errorManager.handleError(createNetworkError(`Error ${i}`, {
          severity: ErrorSeverity.MEDIUM,
        }));
      }

      expect(mockShowErrorToast).toHaveBeenCalledTimes(5); // Should stop showing medium errors
    });

    it('should still show critical errors even at high error rate', () => {
      // Create high error rate with medium errors
      for (let i = 0; i < 6; i++) {
        errorManager.handleError(createNetworkError(`Error ${i}`, {
          severity: ErrorSeverity.MEDIUM,
        }));
      }

      mockShowErrorToast.mockClear();

      // Add critical error
      errorManager.handleError(createSystemError('Critical error', {
        severity: ErrorSeverity.CRITICAL,
      }));

      expect(mockShowErrorToast).toHaveBeenCalledTimes(1);
    });

    it('should not show duplicate toasts for similar errors', () => {
      const error1 = createNetworkError('Network error', {
        code: 'NETWORK_001',
        severity: ErrorSeverity.MEDIUM,
      });

      const error2 = createNetworkError('Network error', {
        code: 'NETWORK_001',
        severity: ErrorSeverity.MEDIUM,
      });

      errorManager.handleError(error1);
      errorManager.handleError(error2);

      expect(mockShowErrorToast).toHaveBeenCalledTimes(1);
    });

    it('should show toasts for similar errors after time delay', () => {
      const error1 = createNetworkError('Network error', {
        code: 'NETWORK_001',
        severity: ErrorSeverity.MEDIUM,
      });

      errorManager.handleError(error1);

      // Fast-forward time beyond duplicate detection window (30 seconds)
      jest.advanceTimersByTime(35000);

      const error2 = createNetworkError('Network error', {
        code: 'NETWORK_001',
        severity: ErrorSeverity.MEDIUM,
      });

      errorManager.handleError(error2);

      expect(mockShowErrorToast).toHaveBeenCalledTimes(2);
    });
  });

  // ===== UNHANDLED ERROR CATCHING TESTS =====

  describe('Unhandled Error Catching', () => {
    it('should catch unhandled JavaScript errors', () => {
      const jsError = new Error('Unhandled JS error');
      jsError.stack = 'JS stack trace';

      const errorEvent = {
        error: jsError,
        message: jsError.message,
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      };

      triggerWindowEvent('error', errorEvent);

      const state = errorManager.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.lastError?.code).toBe('UNHANDLED_JS_ERROR');
      expect(state.lastError?.context.additionalData).toMatchObject({
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      });
    });

    it('should catch unhandled promise rejections', () => {
      const rejectionReason = new Error('Promise rejection');
      rejectionReason.stack = 'Promise stack trace';

      const rejectionEvent = {
        reason: rejectionReason,
        preventDefault: jest.fn(),
      };

      triggerWindowEvent('unhandledrejection', rejectionEvent);

      const state = errorManager.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.lastError?.code).toBe('UNHANDLED_PROMISE_REJECTION');
      expect(rejectionEvent.preventDefault).toHaveBeenCalled();
    });

    it('should handle unhandled errors without error objects', () => {
      const errorEvent = {
        message: 'Script error',
        filename: '',
        lineno: 0,
        colno: 0,
      };

      triggerWindowEvent('error', errorEvent);

      const state = errorManager.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.lastError?.message).toBe('Script error');
    });

    it('should handle promise rejections with string reasons', () => {
      const rejectionEvent = {
        reason: 'String rejection reason',
        preventDefault: jest.fn(),
      };

      triggerWindowEvent('unhandledrejection', rejectionEvent);

      const state = errorManager.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.lastError?.message).toBe('String rejection reason');
    });
  });

  // ===== LISTENER MANAGEMENT TESTS =====

  describe('Listener Management', () => {
    it('should notify listeners on state changes', () => {
      const listener = jest.fn();
      const unsubscribe = errorManager.subscribe(listener);

      errorManager.handleError('Test error');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCount: 1,
        })
      );

      unsubscribe();
    });

    it('should handle listener errors gracefully', () => {
      const faultyListener = jest.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });

      errorManager.subscribe(faultyListener);
      errorManager.handleError('Test error');

      expect(console.error).toHaveBeenCalledWith(
        'Error in global error manager listener:',
        expect.any(Error)
      );
    });

    it('should remove listeners when unsubscribed', () => {
      const listener = jest.fn();
      const unsubscribe = errorManager.subscribe(listener);

      unsubscribe();
      errorManager.handleError('Test error');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ===== ERROR STATISTICS TESTS =====

  describe('Error Statistics', () => {
    it('should provide comprehensive error statistics', () => {
      errorManager.handleError(createMockError('network'));
      errorManager.handleError(createMockError('network'));
      errorManager.handleError(createMockError('system'));
      errorManager.handleError(createMockError('validation'));

      const stats = errorManager.getErrorStats();

      expect(stats.totalErrors).toBe(4);
      expect(stats.recentErrors).toBe(4);
      expect(stats.errorsByCategory).toEqual({
        network: 2,
        system: 1,
        validation: 1,
      });
      expect(stats.errorsBySeverity).toEqual({
        medium: 2, // network errors
        high: 1,   // system error
        low: 1,    // validation error
      });
      expect(stats.isOnline).toBe(true);
    });

    it('should track errors by category correctly', () => {
      errorManager.handleError(createMockError('security'));
      errorManager.handleError(createMockError('security'));

      const stats = errorManager.getErrorStats();

      expect(stats.errorsByCategory.security).toBe(2);
    });

    it('should track errors by severity correctly', () => {
      errorManager.handleError(createSystemError('Critical error', {
        severity: ErrorSeverity.CRITICAL,
      }));

      const stats = errorManager.getErrorStats();

      expect(stats.errorsBySeverity.critical).toBe(1);
    });
  });

  // ===== REACT HOOKS TESTS =====

  describe('React Hooks', () => {
    describe('useGlobalErrors', () => {
      it('should provide error state and actions', () => {
        const { result } = renderHook(() => useGlobalErrors());

        expect(result.current.errors).toEqual([]);
        expect(result.current.errorCount).toBe(0);
        expect(result.current.isOnline).toBe(true);
        expect(typeof result.current.clearErrors).toBe('function');
        expect(typeof result.current.handleError).toBe('function');
        expect(typeof result.current.getErrorStats).toBe('function');
      });

      it('should update when global state changes', () => {
        const { result } = renderHook(() => useGlobalErrors());

        act(() => {
          globalErrorManager.handleError('Test error');
        });

        expect(result.current.errorCount).toBe(1);
        expect(result.current.errors).toHaveLength(1);
      });

      it('should clear errors when requested', () => {
        const { result } = renderHook(() => useGlobalErrors());

        act(() => {
          globalErrorManager.handleError('Test error');
        });

        expect(result.current.errorCount).toBe(1);

        act(() => {
          result.current.clearErrors();
        });

        expect(result.current.errorCount).toBe(0);
      });

      it('should handle errors through hook', () => {
        const { result } = renderHook(() => useGlobalErrors());

        act(() => {
          result.current.handleError('Hook error');
        });

        expect(result.current.errorCount).toBe(1);
        expect(result.current.lastError?.message).toBe('Hook error');
      });
    });

    describe('useConnectionStatus', () => {
      it('should provide connection status', () => {
        const { result } = renderHook(() => useConnectionStatus());

        expect(result.current.isOnline).toBe(true);
        expect(result.current.connectionQuality).toBe('excellent');
        expect(result.current.isGoodConnection).toBe(true);
      });

      it('should update when connection changes', () => {
        const { result } = renderHook(() => useConnectionStatus());

        act(() => {
          triggerWindowEvent('offline');
        });

        expect(result.current.isOnline).toBe(false);
        expect(result.current.connectionQuality).toBe('offline');
        expect(result.current.isGoodConnection).toBe(false);
      });

      it('should identify good connections correctly', () => {
        const { result } = renderHook(() => useConnectionStatus());

        // Test excellent connection
        act(() => {
          triggerConnectionChange('4g');
        });
        expect(result.current.isGoodConnection).toBe(true);

        // Test good connection
        act(() => {
          triggerConnectionChange('3g');
        });
        expect(result.current.isGoodConnection).toBe(true);

        // Test poor connection
        act(() => {
          triggerConnectionChange('2g');
        });
        expect(result.current.isGoodConnection).toBe(false);
      });
    });
  });

  // ===== UTILITY FUNCTIONS TESTS =====

  describe('Utility Functions', () => {
    it('should handle global errors with helper function', () => {
      const error = createMockError('network');
      const result = handleGlobalError(error, { customData: 'test' });

      expect(result).toBe(error);
      expect(result.context.additionalData).toEqual({ customData: 'test' });
    });

    it('should report errors without showing toast', () => {
      reportError('Report error', { reportData: 'test' });

      expect(mockShowErrorToast).not.toHaveBeenCalled();
      expect(console.group).toHaveBeenCalled();
    });

    it('should create error boundary handler', () => {
      const handler = createErrorBoundaryHandler();
      const error = new Error('React error');
      const errorInfo = { componentStack: 'Component stack trace' };

      handler(error, errorInfo);

      const state = globalErrorManager.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.lastError?.code).toBe('REACT_ERROR_BOUNDARY');
      expect(state.lastError?.context.additionalData).toMatchObject({
        componentStack: 'Component stack trace',
      });
    });
  });

  // ===== RECOVERY ACTIONS TESTS =====

  describe('Recovery Actions', () => {
    it('should create retry action for retryable errors', () => {
      const retryableError = createNetworkError('Network error', {
        retryable: true,
      });

      const actions = createRecoveryActions(retryableError);

      expect(actions).toContainEqual(
        expect.objectContaining({
          id: 'retry',
          label: 'Try Again',
          isDestructive: false,
          requiresConfirmation: false,
        })
      );
    });

    it('should create refresh action for network errors', () => {
      const networkError = createMockError('network');
      const actions = createRecoveryActions(networkError);

      expect(actions).toContainEqual(
        expect.objectContaining({
          id: 'refresh',
          label: 'Refresh Page',
          isDestructive: false,
        })
      );
    });

    it('should create clear cache action for system errors', () => {
      const systemError = createMockError('system');
      const actions = createRecoveryActions(systemError);

      expect(actions).toContainEqual(
        expect.objectContaining({
          id: 'clear-cache',
          label: 'Clear Cache',
          isDestructive: true,
          requiresConfirmation: true,
        })
      );
    });

    it('should execute refresh action correctly', () => {
      const networkError = createMockError('network');
      const actions = createRecoveryActions(networkError);
      const refreshAction = actions.find(action => action.id === 'refresh');

      expect(refreshAction).toBeTruthy();

      refreshAction!.action();

      expect(mockReload).toHaveBeenCalled();
    });

    it('should execute clear cache action correctly', async () => {
      const systemError = createMockError('system');
      const actions = createRecoveryActions(systemError);
      const clearCacheAction = actions.find(action => action.id === 'clear-cache');

      expect(clearCacheAction).toBeTruthy();

      await clearCacheAction!.action();

      expect(mockCaches.keys).toHaveBeenCalled();
      expect(mockCaches.delete).toHaveBeenCalledWith('cache1');
      expect(mockCaches.delete).toHaveBeenCalledWith('cache2');
      expect(mockStorage.clear).toHaveBeenCalledTimes(2); // localStorage + sessionStorage
      expect(mockReload).toHaveBeenCalled();
    });

    it('should handle caches API not available', async () => {
      delete (window as any).caches;

      const systemError = createMockError('system');
      const actions = createRecoveryActions(systemError);
      const clearCacheAction = actions.find(action => action.id === 'clear-cache');

      await expect(clearCacheAction!.action()).resolves.not.toThrow();

      expect(mockReload).toHaveBeenCalled();

      // Restore caches for other tests
      (window as any).caches = mockCaches;
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration Tests', () => {
    it('should handle complete error workflow', () => {
      // Start with no errors
      expect(globalErrorManager.getState().errorCount).toBe(0);

      // Trigger unhandled error
      const errorEvent = {
        error: new Error('Unhandled error'),
        message: 'Unhandled error',
        filename: 'app.js',
        lineno: 1,
        colno: 1,
      };

      triggerWindowEvent('error', errorEvent);

      // Check state updated
      const state = globalErrorManager.getState();
      expect(state.errorCount).toBe(1);
      expect(state.lastError?.code).toBe('UNHANDLED_JS_ERROR');

      // Check toast shown
      expect(mockShowErrorToast).toHaveBeenCalled();

      // Check logging occurred
      expect(console.group).toHaveBeenCalled();

      // Get recovery actions
      const actions = createRecoveryActions(state.lastError!);
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should handle network state changes affecting error handling', () => {
      // Start online
      expect(globalErrorManager.getState().isOnline).toBe(true);

      // Handle network error while online
      const networkError = createMockError('network');
      globalErrorManager.handleError(networkError);

      expect(globalErrorManager.getState().lastError?.code).toBe('NETWORK_001');

      // Go offline
      triggerWindowEvent('offline');

      // Handle network error while offline
      const anotherNetworkError = createMockError('network');
      globalErrorManager.handleError(anotherNetworkError);

      expect(globalErrorManager.getState().lastError?.code).toBe('OFFLINE_ERROR');
    });

    it('should maintain error rate across multiple errors', () => {
      // Add errors at different times
      for (let i = 0; i < 3; i++) {
        globalErrorManager.handleError(`Error ${i}`);
        jest.advanceTimersByTime(10000); // 10 seconds between errors
      }

      const state = globalErrorManager.getState();
      expect(state.errorCount).toBe(3);
      expect(state.errorRate).toBe(3); // All within 1-minute window
    });

    it('should handle hook integration with real state changes', () => {
      const { result } = renderHook(() => useGlobalErrors());

      // Initial state
      expect(result.current.errorCount).toBe(0);

      // Add error through global manager
      act(() => {
        globalErrorManager.handleError('Global error');
      });

      // Hook should reflect change
      expect(result.current.errorCount).toBe(1);

      // Add error through hook
      act(() => {
        result.current.handleError('Hook error');
      });

      // State should be updated
      expect(result.current.errorCount).toBe(2);

      // Clear through hook
      act(() => {
        result.current.clearErrors();
      });

      expect(result.current.errorCount).toBe(0);
    });
  });
});