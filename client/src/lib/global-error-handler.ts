/**
 * Global Error Handling Utilities
 * 
 * Provides centralized error processing, user notifications, and error recovery
 * mechanisms for the entire application.
 */

import { toast } from '@/hooks/use-toast';
import {
  AppError,
  createSystemError,
  createNetworkError,
  showErrorToast,
  ErrorSeverity,
  ErrorCategory,
  RecoveryAction,
} from './error-handling';
import { BatchError } from './batch-error-handling';

// ===== GLOBAL ERROR STATE =====

interface GlobalErrorState {
  errors: AppError[];
  errorCount: number;
  lastError?: AppError;
  errorRate: number;
  isOnline: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'offline';
}

class GlobalErrorManager {
  private state: GlobalErrorState = {
    errors: [],
    errorCount: 0,
    errorRate: 0,
    isOnline: navigator.onLine,
    connectionQuality: 'excellent',
  };

  private errorWindow: number[] = []; // Error timestamps for rate calculation
  private readonly MAX_ERROR_HISTORY = 100;
  private readonly ERROR_RATE_WINDOW = 60000; // 1 minute
  private listeners: Array<(state: GlobalErrorState) => void> = [];

  constructor() {
    this.setupNetworkMonitoring();
    this.setupUnhandledErrorCatching();
  }

  private setupNetworkMonitoring() {
    window.addEventListener('online', () => {
      this.state.isOnline = true;
      this.state.connectionQuality = 'good';
      this.notifyListeners();
      
      toast({
        title: "Connection Restored",
        description: "You're back online. Retrying failed operations...",
        duration: 3000,
      });
    });

    window.addEventListener('offline', () => {
      this.state.isOnline = false;
      this.state.connectionQuality = 'offline';
      this.notifyListeners();
      
      toast({
        variant: "destructive",
        title: "Connection Lost",
        description: "You're offline. Some features may not work properly.",
        duration: 5000,
      });
    });

    // Monitor connection quality
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      const updateConnectionQuality = () => {
        if (!this.state.isOnline || !navigator.onLine) {
          this.state.connectionQuality = 'offline';
        } else if (connection.effectiveType === '4g') {
          this.state.connectionQuality = 'excellent';
        } else if (connection.effectiveType === '3g') {
          this.state.connectionQuality = 'good';
        } else {
          this.state.connectionQuality = 'poor';
        }
        this.notifyListeners();
      };

      connection.addEventListener('change', updateConnectionQuality);
      updateConnectionQuality();
    }
  }

  private setupUnhandledErrorCatching() {
    // Catch unhandled JavaScript errors
    window.addEventListener('error', (event) => {
      const error = createSystemError(event.error?.message || event.message, {
        code: 'UNHANDLED_JS_ERROR',
        severity: ErrorSeverity.HIGH,
        context: {
          timestamp: new Date(),
          url: event.filename,
          additionalData: {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error?.stack,
          },
        },
      });

      this.handleError(error, { showToast: true, reportToConsole: true });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = createSystemError(
        event.reason?.message || String(event.reason),
        {
          code: 'UNHANDLED_PROMISE_REJECTION',
          severity: ErrorSeverity.MEDIUM,
          context: {
            timestamp: new Date(),
            additionalData: {
              reason: event.reason,
              stack: event.reason?.stack,
            },
          },
        }
      );

      this.handleError(error, { showToast: false, reportToConsole: true });
      
      // Prevent default console error
      event.preventDefault();
    });
  }

  handleError(
    error: AppError | Error | unknown,
    options: {
      showToast?: boolean;
      reportToConsole?: boolean;
      context?: Record<string, unknown>;
      recovery?: RecoveryAction[];
    } = {}
  ): AppError {
    const {
      showToast = true,
      reportToConsole = true,
      context = {},
      recovery = [],
    } = options;

    // Convert to AppError if necessary
    let appError: AppError;
    if (error && typeof error === 'object' && 'category' in error) {
      appError = error as AppError;
    } else if (error instanceof Error) {
      appError = createSystemError(error.message, {
        code: 'CONVERTED_ERROR',
        context: { timestamp: new Date(), additionalData: context, stackTrace: error.stack },
      });
    } else {
      appError = createSystemError(
        typeof error === 'string' ? error : 'Unknown error occurred',
        {
          code: 'UNKNOWN_ERROR',
          context: { timestamp: new Date(), additionalData: context },
        }
      );
    }

    // Add to error history
    this.addToErrorHistory(appError);

    // Update error rate
    this.updateErrorRate();

    // Handle offline errors differently
    if (!this.state.isOnline && appError.category === ErrorCategory.NETWORK) {
      appError = createNetworkError('You are currently offline', {
        code: 'OFFLINE_ERROR',
        isConnectionLost: true,
        userFriendlyMessage: 'You are offline. Check your connection and try again.',
        suggestedActions: [
          'Check your internet connection',
          'Try again when back online',
          'Some features may be available offline',
        ],
      });
    }

    // Console logging
    if (reportToConsole) {
      this.logError(appError);
    }

    // Show user notification
    if (showToast && this.shouldShowToast(appError)) {
      showErrorToast(appError);
    }

    // Notify listeners
    this.notifyListeners();

    return appError;
  }

  private addToErrorHistory(error: AppError) {
    this.state.errors.unshift(error);
    this.state.errorCount++;
    this.state.lastError = error;

    // Keep only recent errors
    if (this.state.errors.length > this.MAX_ERROR_HISTORY) {
      this.state.errors = this.state.errors.slice(0, this.MAX_ERROR_HISTORY);
    }

    // Add to error rate window
    this.errorWindow.push(Date.now());
  }

  private updateErrorRate() {
    const now = Date.now();
    const windowStart = now - this.ERROR_RATE_WINDOW;
    
    // Remove old errors from rate calculation
    this.errorWindow = this.errorWindow.filter(timestamp => timestamp > windowStart);
    
    // Calculate error rate (errors per minute)
    this.state.errorRate = this.errorWindow.length;
  }

  private shouldShowToast(error: AppError): boolean {
    // Don't spam user with too many error toasts
    if (this.state.errorRate > 5) {
      return error.severity === ErrorSeverity.CRITICAL;
    }

    // Don't show toast for low severity errors
    if (error.severity === ErrorSeverity.LOW) {
      return false;
    }

    // Always show critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      return true;
    }

    // Check if we recently showed a similar error
    const recentSimilarError = this.state.errors
      .slice(0, 5) // Check last 5 errors
      .find(e => e.code === error.code && 
               Date.now() - e.context.timestamp.getTime() < 30000); // Within 30 seconds

    return !recentSimilarError;
  }

  private logError(error: AppError) {
    const logLevel = error.severity === ErrorSeverity.CRITICAL ? 'error' :
                    error.severity === ErrorSeverity.HIGH ? 'error' :
                    error.severity === ErrorSeverity.MEDIUM ? 'warn' : 'info';

    console.group(`🚨 ${error.severity.toUpperCase()} Error: ${error.code}`);
    console[logLevel]('Message:', error.message);
    console[logLevel]('Category:', error.category);
    console[logLevel]('Retryable:', error.retryable);
    console[logLevel]('Context:', error.context);
    
    if (error.suggestedActions.length > 0) {
      console.info('Suggested Actions:', error.suggestedActions);
    }
    
    if (error.cause) {
      console.error('Caused by:', error.cause);
    }
    
    console.groupEnd();
  }

  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener({ ...this.state });
      } catch (error) {
        console.error('Error in global error manager listener:', error);
      }
    });
  }

  subscribe(listener: (state: GlobalErrorState) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getState(): GlobalErrorState {
    return { ...this.state };
  }

  clearErrors() {
    this.state.errors = [];
    this.state.errorCount = 0;
    this.state.lastError = undefined;
    this.errorWindow = [];
    this.state.errorRate = 0;
    this.notifyListeners();
  }

  getErrorStats() {
    const errorsByCategory = this.state.errors.reduce((acc, error) => {
      acc[error.category] = (acc[error.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errorsBySeverity = this.state.errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalErrors: this.state.errorCount,
      recentErrors: this.state.errors.length,
      errorRate: this.state.errorRate,
      errorsByCategory,
      errorsBySeverity,
      isOnline: this.state.isOnline,
      connectionQuality: this.state.connectionQuality,
    };
  }
}

// ===== GLOBAL INSTANCE =====

export const globalErrorManager = new GlobalErrorManager();

// ===== REACT HOOKS =====

import { useState, useEffect } from 'react';

export function useGlobalErrors() {
  const [errorState, setErrorState] = useState<GlobalErrorState>(
    globalErrorManager.getState()
  );

  useEffect(() => {
    return globalErrorManager.subscribe(setErrorState);
  }, []);

  return {
    ...errorState,
    clearErrors: () => globalErrorManager.clearErrors(),
    handleError: (error: AppError | Error | unknown, options?: any) =>
      globalErrorManager.handleError(error, options),
    getErrorStats: () => globalErrorManager.getErrorStats(),
  };
}

export function useConnectionStatus() {
  const { isOnline, connectionQuality } = useGlobalErrors();
  
  return {
    isOnline,
    connectionQuality,
    isGoodConnection: connectionQuality === 'excellent' || connectionQuality === 'good',
  };
}

// ===== UTILITY FUNCTIONS =====

export function handleGlobalError(
  error: AppError | Error | unknown,
  context?: Record<string, unknown>
): AppError {
  return globalErrorManager.handleError(error, { context });
}

export function reportError(
  error: AppError | Error | unknown,
  context?: Record<string, unknown>
): void {
  globalErrorManager.handleError(error, { 
    context, 
    showToast: false, 
    reportToConsole: true 
  });
}

export function createErrorBoundaryHandler() {
  return (error: Error, errorInfo: { componentStack: string }) => {
    const appError = createSystemError(error.message, {
      code: 'REACT_ERROR_BOUNDARY',
      severity: ErrorSeverity.HIGH,
      componentName: 'ErrorBoundary',
      context: {
        timestamp: new Date(),
        additionalData: {
          componentStack: errorInfo.componentStack,
          stack: error.stack,
        },
      },
    });

    globalErrorManager.handleError(appError, {
      showToast: true,
      reportToConsole: true,
    });
  };
}

// ===== ERROR RECOVERY UTILITIES =====

export function createRecoveryActions(error: AppError): RecoveryAction[] {
  const actions: RecoveryAction[] = [];

  // Retry action for retryable errors
  if (error.retryable) {
    actions.push({
      id: 'retry',
      label: 'Try Again',
      description: 'Retry the failed operation',
      action: () => {
        // This would need to be implemented by the calling component
        console.log('Retry action triggered for error:', error.code);
      },
      isDestructive: false,
      requiresConfirmation: false,
    });
  }

  // Refresh page for network errors
  if (error.category === ErrorCategory.NETWORK) {
    actions.push({
      id: 'refresh',
      label: 'Refresh Page',
      description: 'Reload the page to reset connections',
      action: () => window.location.reload(),
      isDestructive: false,
      requiresConfirmation: false,
    });
  }

  // Clear cache for system errors
  if (error.category === ErrorCategory.SYSTEM) {
    actions.push({
      id: 'clear-cache',
      label: 'Clear Cache',
      description: 'Clear browser cache and reload',
      action: async () => {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(name => caches.delete(name)));
        }
        localStorage.clear();
        sessionStorage.clear();
        window.location.reload();
      },
      isDestructive: true,
      requiresConfirmation: true,
    });
  }

  return actions;
}

// ===== EXPORTS =====

export type { GlobalErrorState };
export { GlobalErrorManager };