/**
 * Comprehensive Error Handling System
 * 
 * This module provides a robust error handling infrastructure for the batch management system,
 * including error classification, retry mechanisms, circuit breakers, and user recovery options.
 */

import { toast } from '@/hooks/use-toast';

// ===== ERROR TYPE DEFINITIONS =====

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  NETWORK = 'network',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  SECURITY = 'security',
  USER_INPUT = 'user_input'
}

export interface ErrorContext {
  timestamp: Date;
  userAgent?: string;
  url?: string;
  userId?: string;
  sessionId?: string;
  batchId?: string;
  operationId?: string;
  requestId?: string;
  stackTrace?: string;
  additionalData?: Record<string, unknown>;
}

export interface BaseError {
  id: string;
  code: string;
  message: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  userFriendlyMessage: string;
  suggestedActions: string[];
  context: ErrorContext;
  cause?: BaseError;
  attempts?: number;
  maxRetries?: number;
}

// ===== SPECIFIC ERROR TYPES =====

export interface NetworkError extends BaseError {
  category: ErrorCategory.NETWORK;
  isTimeout: boolean;
  isConnectionLost: boolean;
  isServerUnavailable: boolean;
  statusCode?: number;
  responseTime?: number;
  endpoint?: string;
}

export interface ValidationError extends BaseError {
  category: ErrorCategory.VALIDATION;
  field?: string;
  expectedFormat?: string;
  actualValue?: unknown;
  validationRule?: string;
  validationErrors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
}

export interface BusinessLogicError extends BaseError {
  category: ErrorCategory.BUSINESS_LOGIC;
  businessRule?: string;
  resourceId?: string;
  resourceType?: string;
  preconditions?: Record<string, boolean>;
}

export interface SystemError extends BaseError {
  category: ErrorCategory.SYSTEM;
  componentName?: string;
  resourceType?: 'database' | 'storage' | 'memory' | 'cpu' | 'network';
  isTransient: boolean;
  systemLoad?: number;
}

export interface SecurityError extends BaseError {
  category: ErrorCategory.SECURITY;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  securityFlag?: string;
  ipAddress?: string;
  blocked: boolean;
}

export type AppError = NetworkError | ValidationError | BusinessLogicError | SystemError | SecurityError;

// ===== ERROR RESPONSE INTERFACES =====

export interface ErrorResponse {
  success: false;
  error: {
    id: string;
    code: string;
    message: string;
    category: ErrorCategory;
    severity: ErrorSeverity;
    retryable: boolean;
    timestamp: string;
    requestId?: string;
    details?: Record<string, unknown>;
    suggestedActions?: string[];
    retryAfter?: number;
  };
}

export interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  action: () => Promise<void> | void;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  icon?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: AppError | null;
  errorInfo: {
    componentStack?: string;
    errorBoundary?: string;
  } | null;
  retryCount: number;
  recoveryActions: RecoveryAction[];
}

// ===== RETRY AND CIRCUIT BREAKER TYPES =====

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryCondition?: (error: AppError) => boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  enabled: boolean;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  totalRequests: number;
  successfulRequests: number;
}

// ===== MONITORING AND LOGGING TYPES =====

export interface ErrorMetrics {
  errorCount: number;
  errorRate: number;
  averageResponseTime: number;
  slowRequestCount: number;
  circuitBreakerTrips: number;
  retryAttempts: number;
  recoverySuccessRate: number;
}

export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  level: 'error' | 'warn' | 'info' | 'debug';
  error: AppError;
  resolved: boolean;
  resolvedAt?: Date;
  resolutionMethod?: string;
  userImpact: 'none' | 'low' | 'medium' | 'high';
  tags: string[];
}

// ===== UTILITY FUNCTIONS =====

/**
 * Generate unique error ID
 */
export function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create error context from current environment
 */
export function createErrorContext(additionalData?: Record<string, unknown>): ErrorContext {
  return {
    timestamp: new Date(),
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    additionalData,
  };
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: AppError): boolean {
  if (!error.retryable) return false;

  switch (error.category) {
    case ErrorCategory.NETWORK:
      const networkError = error as NetworkError;
      return networkError.isTimeout || 
             networkError.isConnectionLost || 
             networkError.isServerUnavailable ||
             (networkError.statusCode && networkError.statusCode >= 500);
    
    case ErrorCategory.SYSTEM:
      const systemError = error as SystemError;
      return systemError.isTransient;
    
    case ErrorCategory.VALIDATION:
    case ErrorCategory.SECURITY:
      return false;
    
    case ErrorCategory.BUSINESS_LOGIC:
      // Some business logic errors might be retryable after fixing preconditions
      return error.code === 'TEMPORARY_RESOURCE_UNAVAILABLE';
    
    default:
      return false;
  }
}

/**
 * Get retry delay with exponential backoff and jitter
 */
export function getRetryDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const delay = Math.min(exponentialDelay, config.maxDelay);
  
  if (config.jitter) {
    // Add random jitter of ±25%
    const jitterRange = delay * 0.25;
    return delay + (Math.random() * 2 - 1) * jitterRange;
  }
  
  return delay;
}

/**
 * Extract error information from unknown error objects
 */
export function extractErrorInfo(error: unknown): { message: string; stack?: string; code?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      code: (error as any).code,
    };
  }
  
  if (typeof error === 'string') {
    return { message: error };
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return {
      message: String((error as any).message),
      code: (error as any).code,
    };
  }
  
  return { message: 'Unknown error occurred' };
}

// ===== ERROR FACTORY FUNCTIONS =====

export function createNetworkError(
  message: string,
  options: Partial<NetworkError> = {}
): NetworkError {
  const context = createErrorContext(options.context?.additionalData);
  
  return {
    id: generateErrorId(),
    code: options.code || 'NETWORK_ERROR',
    message,
    category: ErrorCategory.NETWORK,
    severity: options.severity || ErrorSeverity.MEDIUM,
    retryable: options.retryable !== false,
    userFriendlyMessage: options.userFriendlyMessage || 'Network connection issue. Please check your internet connection.',
    suggestedActions: options.suggestedActions || [
      'Check your internet connection',
      'Refresh the page',
      'Try again in a few moments'
    ],
    context: { ...context, ...options.context },
    isTimeout: options.isTimeout || false,
    isConnectionLost: options.isConnectionLost || false,
    isServerUnavailable: options.isServerUnavailable || false,
    statusCode: options.statusCode,
    responseTime: options.responseTime,
    endpoint: options.endpoint,
    cause: options.cause,
    attempts: options.attempts || 0,
    maxRetries: options.maxRetries || 3,
  };
}

export function createValidationError(
  message: string,
  options: Partial<ValidationError> = {}
): ValidationError {
  const context = createErrorContext(options.context?.additionalData);
  
  return {
    id: generateErrorId(),
    code: options.code || 'VALIDATION_ERROR',
    message,
    category: ErrorCategory.VALIDATION,
    severity: options.severity || ErrorSeverity.LOW,
    retryable: false,
    userFriendlyMessage: options.userFriendlyMessage || 'The provided data is invalid. Please check your input.',
    suggestedActions: options.suggestedActions || [
      'Check the highlighted fields',
      'Ensure all required fields are filled',
      'Follow the format requirements'
    ],
    context: { ...context, ...options.context },
    field: options.field,
    expectedFormat: options.expectedFormat,
    actualValue: options.actualValue,
    validationRule: options.validationRule,
    validationErrors: options.validationErrors,
    cause: options.cause,
    attempts: 0,
    maxRetries: 0,
  };
}

export function createBusinessLogicError(
  message: string,
  options: Partial<BusinessLogicError> = {}
): BusinessLogicError {
  const context = createErrorContext(options.context?.additionalData);
  
  return {
    id: generateErrorId(),
    code: options.code || 'BUSINESS_LOGIC_ERROR',
    message,
    category: ErrorCategory.BUSINESS_LOGIC,
    severity: options.severity || ErrorSeverity.MEDIUM,
    retryable: options.retryable || false,
    userFriendlyMessage: options.userFriendlyMessage || 'This operation cannot be completed at this time.',
    suggestedActions: options.suggestedActions || [
      'Verify the operation requirements',
      'Check your permissions',
      'Contact support if the issue persists'
    ],
    context: { ...context, ...options.context },
    businessRule: options.businessRule,
    resourceId: options.resourceId,
    resourceType: options.resourceType,
    preconditions: options.preconditions,
    cause: options.cause,
    attempts: options.attempts || 0,
    maxRetries: options.maxRetries || 1,
  };
}

export function createSystemError(
  message: string,
  options: Partial<SystemError> = {}
): SystemError {
  const context = createErrorContext(options.context?.additionalData);
  
  return {
    id: generateErrorId(),
    code: options.code || 'SYSTEM_ERROR',
    message,
    category: ErrorCategory.SYSTEM,
    severity: options.severity || ErrorSeverity.HIGH,
    retryable: options.retryable !== false,
    userFriendlyMessage: options.userFriendlyMessage || 'A system error occurred. Please try again later.',
    suggestedActions: options.suggestedActions || [
      'Try again in a few moments',
      'Refresh the page',
      'Contact support if the issue persists'
    ],
    context: { ...context, ...options.context },
    componentName: options.componentName,
    resourceType: options.resourceType,
    isTransient: options.isTransient !== false,
    systemLoad: options.systemLoad,
    cause: options.cause,
    attempts: options.attempts || 0,
    maxRetries: options.maxRetries || 3,
  };
}

export function createSecurityError(
  message: string,
  options: Partial<SecurityError> = {}
): SecurityError {
  const context = createErrorContext(options.context?.additionalData);
  
  return {
    id: generateErrorId(),
    code: options.code || 'SECURITY_ERROR',
    message,
    category: ErrorCategory.SECURITY,
    severity: options.severity || ErrorSeverity.HIGH,
    retryable: false,
    userFriendlyMessage: options.userFriendlyMessage || 'Access denied due to security restrictions.',
    suggestedActions: options.suggestedActions || [
      'Verify your permissions',
      'Check your session',
      'Contact an administrator'
    ],
    context: { ...context, ...options.context },
    riskLevel: options.riskLevel || 'medium',
    securityFlag: options.securityFlag,
    ipAddress: options.ipAddress,
    blocked: options.blocked !== false,
    cause: options.cause,
    attempts: 0,
    maxRetries: 0,
  };
}

// ===== ERROR PARSING AND CONVERSION =====

/**
 * Convert fetch errors to typed AppError
 */
export function convertFetchError(error: unknown, endpoint?: string): NetworkError {
  const errorInfo = extractErrorInfo(error);
  
  // Detect specific network error types
  const isTimeout = errorInfo.message.toLowerCase().includes('timeout') ||
                   errorInfo.message.toLowerCase().includes('aborted');
  
  const isConnectionLost = errorInfo.message.toLowerCase().includes('failed to fetch') ||
                          errorInfo.message.toLowerCase().includes('network error');
  
  const isServerUnavailable = errorInfo.code === 'ECONNREFUSED' ||
                             errorInfo.message.toLowerCase().includes('server unavailable');
  
  return createNetworkError(errorInfo.message, {
    code: errorInfo.code || 'FETCH_ERROR',
    isTimeout,
    isConnectionLost,
    isServerUnavailable,
    endpoint,
    context: {
      timestamp: new Date(),
      stackTrace: errorInfo.stack,
    },
  });
}

/**
 * Convert HTTP response errors to typed AppError
 */
export function convertHttpError(response: Response, responseData?: any): AppError {
  const statusCode = response.status;
  const endpoint = response.url;
  
  // Parse error details from response
  const errorMessage = responseData?.error?.message || 
                      responseData?.message || 
                      `HTTP ${statusCode} - ${response.statusText}`;
  
  const errorCode = responseData?.error?.code || 
                   responseData?.code || 
                   `HTTP_${statusCode}`;
  
  // Categorize based on status code
  if (statusCode >= 400 && statusCode < 500) {
    if (statusCode === 401) {
      return createSecurityError(errorMessage, {
        code: errorCode,
        riskLevel: 'medium',
        severity: ErrorSeverity.MEDIUM,
      });
    }
    
    if (statusCode === 403) {
      return createSecurityError(errorMessage, {
        code: errorCode,
        riskLevel: 'high',
        severity: ErrorSeverity.HIGH,
      });
    }
    
    if (statusCode === 400 || statusCode === 422) {
      return createValidationError(errorMessage, {
        code: errorCode,
        validationErrors: responseData?.error?.validationErrors,
      });
    }
    
    return createBusinessLogicError(errorMessage, {
      code: errorCode,
      severity: ErrorSeverity.LOW,
    });
  }
  
  if (statusCode >= 500) {
    return createNetworkError(errorMessage, {
      code: errorCode,
      statusCode,
      endpoint,
      isServerUnavailable: true,
      severity: ErrorSeverity.HIGH,
    });
  }
  
  return createNetworkError(errorMessage, {
    code: errorCode,
    statusCode,
    endpoint,
  });
}

/**
 * Show user-friendly error notification
 */
export function showErrorToast(error: AppError, options: {
  showActions?: boolean;
  duration?: number;
} = {}) {
  const { showActions = false, duration = 5000 } = options;
  
  toast({
    variant: error.severity === ErrorSeverity.CRITICAL ? 'destructive' : 'default',
    title: `${error.category.replace('_', ' ')} Error`,
    description: error.userFriendlyMessage,
    duration,
  });
  
  // Log error for monitoring
  console.error(`[${error.category}] ${error.code}: ${error.message}`, {
    id: error.id,
    context: error.context,
    suggestedActions: error.suggestedActions,
  });
}

// ===== EXPORT TYPES AND UTILITIES =====

export type {
  AppError,
  NetworkError,
  ValidationError,
  BusinessLogicError,
  SystemError,
  SecurityError,
  ErrorResponse,
  RecoveryAction,
  ErrorBoundaryState,
  RetryConfig,
  CircuitBreakerConfig,
  CircuitBreakerStatus,
  ErrorMetrics,
  ErrorLogEntry,
  ErrorContext,
  BaseError,
};

export {
  ErrorSeverity,
  ErrorCategory,
  CircuitBreakerState,
};