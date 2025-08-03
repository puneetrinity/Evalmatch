/**
 * Enhanced Batch Error Handling
 * 
 * Provides circuit breaker, retry mechanisms, and enhanced error handling
 * specifically for batch management operations.
 */

import {
  AppError,
  createNetworkError,
  createValidationError,
  createBusinessLogicError,
  createSystemError,
  convertFetchError,
  convertHttpError,
  isRetryableError,
  showErrorToast,
  ErrorSeverity,
  ErrorCategory,
  CircuitBreakerState,
} from './error-handling';

// ===== ENHANCED BATCH ERROR INTERFACE =====

export interface BatchError extends AppError {
  batchContext?: {
    batchId?: string;
    sessionId?: string;
    operation?: string;
    resumeCount?: number;
  };
}

// ===== CIRCUIT BREAKER IMPLEMENTATION =====

export class BatchCircuitBreaker {
  private state: CircuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    totalRequests: 0,
    successfulRequests: 0,
  };
  
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;

  constructor(
    private config: {
      enabled: boolean;
      failureThreshold: number;
      resetTimeout: number;
      monitoringPeriod: number;
    }
  ) {}

  async execute<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    this.state.totalRequests++;

    if (this.isOpen()) {
      throw createSystemError(
        `Circuit breaker is open for ${operationName}. Service temporarily unavailable.`,
        {
          code: 'CIRCUIT_BREAKER_OPEN',
          severity: ErrorSeverity.HIGH,
          componentName: 'BatchCircuitBreaker',
          isTransient: true,
        }
      );
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    if (!this.config.enabled) return false;
    if (!this.state.isOpen) return false;

    // Check if reset timeout has passed
    if (this.nextAttemptTime && new Date() > this.nextAttemptTime) {
      this.state.isOpen = false;
      this.state.failureCount = 0;
      console.log('[CIRCUIT BREAKER] Reset timeout passed, attempting to close circuit');
      return false;
    }

    return true;
  }

  private onSuccess() {
    this.state.successfulRequests++;
    this.state.failureCount = 0;
    
    if (this.state.isOpen) {
      this.state.isOpen = false;
      console.log('[CIRCUIT BREAKER] Circuit closed after successful request');
    }
  }

  private onFailure() {
    this.state.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state.failureCount >= this.config.failureThreshold) {
      this.state.isOpen = true;
      this.nextAttemptTime = new Date(Date.now() + this.config.resetTimeout);
      
      console.warn(
        `[CIRCUIT BREAKER] Circuit opened after ${this.state.failureCount} failures`,
        {
          nextAttemptTime: this.nextAttemptTime,
          totalRequests: this.state.totalRequests,
          successfulRequests: this.state.successfulRequests,
        }
      );
    }
  }

  getState(): CircuitBreakerState {
    return {
      ...this.state,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  reset() {
    this.state = {
      isOpen: false,
      failureCount: 0,
      totalRequests: 0,
      successfulRequests: 0,
    };
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
    console.log('[CIRCUIT BREAKER] Circuit breaker reset');
  }
}

// ===== RETRY MANAGER IMPLEMENTATION =====

export class BatchRetryManager {
  constructor(
    private config: {
      maxRetries: number;
      retryDelay: number;
      retryConfig: {
        exponentialBackoff: boolean;
        maxBackoffDelay: number;
        jitterEnabled: boolean;
        retryableErrorCodes: string[];
      };
    }
  ) {}

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    retryContext?: {
      batchId?: string;
      sessionId?: string;
      operationType?: string;
    }
  ): Promise<T> {
    let lastError: AppError | null = null;
    
    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        console.log(
          `[RETRY MANAGER] Attempt ${attempt}/${this.config.maxRetries + 1} for ${operationName}`,
          retryContext
        );
        
        const result = await operation();
        
        if (attempt > 1) {
          console.log(`[RETRY MANAGER] ✅ ${operationName} succeeded after ${attempt} attempts`);
        }
        
        return result;
      } catch (error) {
        lastError = this.convertToAppError(error, operationName, retryContext);
        
        console.warn(
          `[RETRY MANAGER] ❌ Attempt ${attempt} failed for ${operationName}:`,
          lastError.message
        );
        
        // Don't retry on the last attempt
        if (attempt === this.config.maxRetries + 1) {
          break;
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          console.log(`[RETRY MANAGER] Error not retryable for ${operationName}, aborting`);
          break;
        }
        
        // Calculate delay and wait
        const delay = this.calculateRetryDelay(attempt);
        console.log(`[RETRY MANAGER] Waiting ${delay}ms before retry ${attempt + 1}`);
        await this.delay(delay);
      }
    }
    
    // All retries failed
    if (lastError) {
      lastError.attempts = this.config.maxRetries + 1;
      lastError.maxRetries = this.config.maxRetries;
      throw lastError;
    }
    
    throw createSystemError('Retry manager failed without capturing error', {
      code: 'RETRY_MANAGER_ERROR',
      componentName: 'BatchRetryManager',
    });
  }

  private convertToAppError(
    error: unknown,
    operationName: string,
    context?: Record<string, unknown>
  ): AppError {
    if (error && typeof error === 'object' && 'category' in error) {
      return error as AppError;
    }
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return convertFetchError(error, operationName);
    }
    
    if (error instanceof Error) {
      // Check for network-related errors
      if (error.message.includes('timeout') || error.message.includes('aborted')) {
        return createNetworkError(error.message, {
          code: 'TIMEOUT_ERROR',
          isTimeout: true,
          context: { timestamp: new Date(), additionalData: context },
        });
      }
      
      if (error.message.includes('failed to fetch') || error.message.includes('network')) {
        return createNetworkError(error.message, {
          code: 'CONNECTION_ERROR',
          isConnectionLost: true,
          context: { timestamp: new Date(), additionalData: context },
        });
      }
      
      return createSystemError(error.message, {
        code: 'OPERATION_ERROR',
        componentName: 'BatchRetryManager',
        context: { timestamp: new Date(), additionalData: context, stackTrace: error.stack },
      });
    }
    
    return createSystemError(
      typeof error === 'string' ? error : 'Unknown error occurred',
      {
        code: 'UNKNOWN_ERROR',
        componentName: 'BatchRetryManager',
        context: { timestamp: new Date(), additionalData: context },
      }
    );
  }

  private isRetryableError(error: AppError): boolean {
    // Use the error handling library's retry logic
    if (!isRetryableError(error)) {
      return false;
    }
    
    // Check against configured retryable error codes
    return this.config.retryConfig.retryableErrorCodes.some(code => 
      error.code.includes(code)
    );
  }

  private calculateRetryDelay(attempt: number): number {
    const { retryConfig } = this.config;
    let delay = this.config.retryDelay;
    
    if (retryConfig.exponentialBackoff) {
      // Exponential backoff: delay * (2 ^ attempt)
      delay = this.config.retryDelay * Math.pow(2, attempt - 1);
      delay = Math.min(delay, retryConfig.maxBackoffDelay);
    }
    
    if (retryConfig.jitterEnabled) {
      // Add jitter: ±25% of the delay
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      delay += jitter;
    }
    
    return Math.max(delay, 100); // Minimum 100ms delay
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== BATCH ERROR FACTORY =====

export function createBatchError(
  type: string,
  message: string,
  code?: string,
  retryable: boolean = true,
  suggestions: string[] = [],
  batchContext?: {
    batchId?: string;
    sessionId?: string;
    operation?: string;
    resumeCount?: number;
  }
): BatchError {
  // Convert type to ErrorCategory
  const category = type.includes('network') ? ErrorCategory.NETWORK :
                  type.includes('validation') || type.includes('batch_not_found') ? ErrorCategory.VALIDATION :
                  type.includes('permission') || type.includes('unauthorized') || type.includes('security') ? ErrorCategory.SECURITY :
                  type.includes('server') || type.includes('timeout') || type.includes('corrupted') ? ErrorCategory.SYSTEM :
                  ErrorCategory.BUSINESS_LOGIC;
  
  const severity = type.includes('corrupted') || type.includes('security') ? ErrorSeverity.HIGH :
                  type.includes('network') || type.includes('timeout') ? ErrorSeverity.MEDIUM :
                  ErrorSeverity.LOW;
  
  const baseError = category === ErrorCategory.NETWORK ? 
    createNetworkError(message, {
      code: code || type.toUpperCase(),
      severity,
      isTimeout: type.includes('timeout'),
      isConnectionLost: type.includes('network'),
      suggestedActions: suggestions.length > 0 ? suggestions : getDefaultSuggestions(type),
    }) :
    category === ErrorCategory.VALIDATION ?
    createValidationError(message, {
      code: code || type.toUpperCase(),
      severity,
      suggestedActions: suggestions.length > 0 ? suggestions : getDefaultSuggestions(type),
    }) :
    category === ErrorCategory.SYSTEM ?
    createSystemError(message, {
      code: code || type.toUpperCase(),
      severity,
      isTransient: retryable,
      componentName: 'BatchManager',
      suggestedActions: suggestions.length > 0 ? suggestions : getDefaultSuggestions(type),
    }) :
    createBusinessLogicError(message, {
      code: code || type.toUpperCase(),
      severity,
      retryable,
      suggestedActions: suggestions.length > 0 ? suggestions : getDefaultSuggestions(type),
    });
  
  return {
    ...baseError,
    batchContext,
  } as BatchError;
}

function getDefaultSuggestions(type: string): string[] {
  switch (type) {
    case 'network_error':
      return ['Check your internet connection', 'Try refreshing the page'];
    case 'validation_failed':
      return ['Upload resumes first', 'Create a new batch'];
    case 'batch_not_found':
      return ['Start a new upload session', 'Check if files were uploaded'];
    case 'session_invalid':
      return ['Reset the session', 'Clear browser cache'];
    case 'corrupted_data':
      return ['Reset the session', 'Contact support if problem persists'];
    case 'timeout_error':
      return ['Try again', 'Check your connection speed'];
    case 'ownership_error':
      return ['Verify session ID', 'Try claiming the batch if orphaned'];
    case 'security_error':
      return ['Check permissions', 'Contact administrator'];
    case 'claim_failed':
      return ['Try again later', 'Verify batch is claimable'];
    case 'delete_failed':
      return ['Try again', 'Check batch permissions'];
    default:
      return ['Try again', 'Contact support if problem persists'];
  }
}

// ===== ERROR RECOVERY UTILITIES =====

export function handleBatchError(
  error: BatchError,
  context: {
    showToast?: boolean;
    logLevel?: 'error' | 'warn' | 'info';
    includeContext?: boolean;
  } = {}
) {
  const { showToast = true, logLevel = 'error', includeContext = true } = context;

  // Log error with appropriate level
  console[logLevel](`[BATCH ERROR] ${error.code}: ${error.message}`, {
    category: error.category,
    severity: error.severity,
    retryable: error.retryable,
    ...(includeContext && { batchContext: error.batchContext }),
    ...(includeContext && { context: error.context }),
  });

  // Show user-friendly notification
  if (showToast) {
    showErrorToast(error);
  }

  return error;
}

export function isBatchErrorRetryable(error: BatchError): boolean {
  return isRetryableError(error) && error.retryable;
}

export function getBatchErrorRecoveryActions(error: BatchError): Array<{
  id: string;
  label: string;
  description: string;
  isDestructive: boolean;
}> {
  const actions = [];

  if (isBatchErrorRetryable(error)) {
    actions.push({
      id: 'retry',
      label: 'Retry Operation',
      description: 'Try the failed operation again',
      isDestructive: false,
    });
  }

  if (error.category === ErrorCategory.NETWORK) {
    actions.push({
      id: 'refresh',
      label: 'Refresh Page',
      description: 'Reload the page to reset the connection',
      isDestructive: false,
    });
  }

  if (error.category === ErrorCategory.VALIDATION || error.code.includes('BATCH_NOT_FOUND')) {
    actions.push({
      id: 'create_new_batch',
      label: 'Create New Batch',
      description: 'Start a new upload session',
      isDestructive: true,
    });
  }

  if (error.category === ErrorCategory.SECURITY || error.code.includes('SESSION')) {
    actions.push({
      id: 'reset_session',
      label: 'Reset Session',
      description: 'Clear session data and start fresh',
      isDestructive: true,
    });
  }

  return actions;
}