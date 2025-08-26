import { jest } from '@jest/globals';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  NETWORK = 'network',
  VALIDATION = 'validation',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  SECURITY = 'security',
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface ErrorContext {
  timestamp: Date;
  userAgent: string;
  url: string;
  additionalData?: any;
}

export interface BaseError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  userFriendlyMessage?: string;
  context: ErrorContext;
  isRetryable: boolean;
  timestamp: Date;
  code?: string;
  retryable?: boolean;
  suggestedActions?: string[];
  attempts?: number;
  maxRetries?: number;
  cause?: Error | BaseError;
}

export interface NetworkError extends BaseError {
  category: ErrorCategory.NETWORK;
  isTimeout: boolean;
  isConnectionLost: boolean;
  statusCode?: number;
}

export interface ValidationError extends BaseError {
  category: ErrorCategory.VALIDATION;
  field?: string;
  validationErrors: string[];
}

export interface BusinessLogicError extends BaseError {
  category: ErrorCategory.BUSINESS_LOGIC;
  businessRule: string;
}

export interface SystemError extends BaseError {
  category: ErrorCategory.SYSTEM;
  isTransient: boolean;
  systemResource?: string;
}

export interface SecurityError extends BaseError {
  category: ErrorCategory.SECURITY;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  securityFlag?: string;
  ipAddress?: string;
  blocked: boolean;
}

export type AppError = NetworkError | ValidationError | BusinessLogicError | SystemError | SecurityError;

// Browser globals are now set up in setup-globals.ts
// Create a mock toast function that can be accessed by tests
export const mockToastFunction = jest.fn();

export function generateErrorId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `err_${timestamp}_${random}`;
}

export function createErrorContext(additionalData?: any): ErrorContext {
  const windowObj = (global as any).window;
  return {
    timestamp: new Date(),
    userAgent: windowObj?.navigator?.userAgent || 'Unknown',
    url: windowObj?.location?.href || 'Unknown',
    additionalData
  };
}

export function isRetryableError(error: AppError): boolean {
  return error.isRetryable;
}

export function getRetryDelay(attempt: number, config: RetryConfig): number {
  let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  delay = Math.min(delay, config.maxDelay);
  
  if (config.jitter) {
    delay += Math.random() * delay * 0.1;
  }
  
  return Math.floor(delay);
}

export function extractErrorInfo(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: String(error.message) };
  }
  return { message: 'Unknown error occurred' };
}

export function createNetworkError(message: string, config?: Partial<NetworkError>): NetworkError {
  return {
    id: generateErrorId(),
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    message,
    userFriendlyMessage: `Network connection issue: ${message}`,
    context: createErrorContext(),
    isRetryable: true,
    timestamp: new Date(),
    isTimeout: false,
    isConnectionLost: false,
    code: 'NETWORK_ERROR',
    retryable: true,
    suggestedActions: ['Check your internet connection', 'Retry the operation'],
    ...config
  };
}

export function createValidationError(message: string, config?: Partial<ValidationError>): ValidationError {
  return {
    id: generateErrorId(),
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.LOW,
    message,
    userFriendlyMessage: message,
    context: createErrorContext(),
    isRetryable: false,
    timestamp: new Date(),
    validationErrors: [message],
    code: 'VALIDATION_ERROR',
    retryable: false,
    suggestedActions: ['Check your input', 'Correct the validation errors'],
    attempts: 0,
    maxRetries: 0,
    ...config
  };
}

export function createBusinessLogicError(message: string, config?: Partial<BusinessLogicError>): BusinessLogicError {
  return {
    id: generateErrorId(),
    category: ErrorCategory.BUSINESS_LOGIC,
    severity: ErrorSeverity.MEDIUM,
    message,
    userFriendlyMessage: message,
    context: createErrorContext(),
    isRetryable: false,
    timestamp: new Date(),
    businessRule: 'Unknown',
    code: 'BUSINESS_LOGIC_ERROR',
    retryable: false,
    suggestedActions: ['Review your input', 'Contact support for assistance'],
    attempts: 0,
    maxRetries: 0,
    ...config
  };
}

export function createSystemError(message: string, config?: Partial<SystemError>): SystemError {
  return {
    id: generateErrorId(),
    category: ErrorCategory.SYSTEM,
    severity: ErrorSeverity.HIGH,
    message,
    userFriendlyMessage: message,
    context: createErrorContext(),
    isRetryable: true,
    timestamp: new Date(),
    isTransient: true,
    code: 'SYSTEM_ERROR',
    retryable: true,
    suggestedActions: ['Try again later', 'Contact support if problem persists'],
    ...config
  };
}

export function createSecurityError(message: string, config?: Partial<SecurityError>): SecurityError {
  return {
    id: generateErrorId(),
    category: ErrorCategory.SECURITY,
    severity: ErrorSeverity.CRITICAL,
    message,
    userFriendlyMessage: message,
    context: createErrorContext(),
    isRetryable: false,
    timestamp: new Date(),
    riskLevel: 'medium',
    blocked: true,
    code: 'SECURITY_ERROR',
    retryable: false,
    suggestedActions: ['Contact support immediately', 'Review security settings'],
    attempts: 0,
    maxRetries: 0,
    ...config
  };
}

export function convertFetchError(error: Error, url?: string): NetworkError {
  const message = error.message.toLowerCase();
  
  const context = createErrorContext({
    stackTrace: error.stack
  });
  
  if (message.includes('timeout')) {
    return createNetworkError(error.message, { 
      isTimeout: true,
      endpoint: url,
      context
    });
  }
  if (message.includes('failed to fetch') || error instanceof TypeError) {
    return createNetworkError(error.message, { 
      isConnectionLost: true,
      endpoint: url,
      context
    });
  }
  if (message.includes('network')) {
    return createNetworkError(error.message, { 
      isConnectionLost: true,
      endpoint: url,
      context
    });
  }
  if (message.includes('server unavailable') || (error as any).code === 'ECONNREFUSED') {
    return createNetworkError(error.message, {
      isServerUnavailable: true,
      code: (error as any).code || 'NETWORK_ERROR',
      endpoint: url,
      context
    });
  }
  
  return createNetworkError(error.message, {
    endpoint: url,
    context
  });
}

export function convertHttpError(response: Response, responseData?: any): AppError {
  const status = response.status;
  
  // Handle malformed responses (status 0 or invalid range)
  if (status === 0 || status < 100) {
    return createNetworkError('Malformed response', {
      category: ErrorCategory.NETWORK
    });
  }
  
  // Extract error details from response data if available
  const errorMessage = responseData?.error?.message || response.statusText || 'Request failed';
  const errorCode = responseData?.error?.code || `HTTP_${status}`;
  
  if (status === 401) {
    return createSecurityError(errorMessage, { 
      riskLevel: 'medium',
      code: errorCode
    });
  }
  if (status === 403) {
    return createSecurityError(errorMessage, { 
      riskLevel: 'high',
      code: errorCode
    });
  }
  if (status === 400) {
    return createValidationError(errorMessage, {
      code: errorCode
    });
  }
  if (status === 422) {
    const validationError = createValidationError(errorMessage, {
      code: errorCode,
      validationErrors: responseData?.error?.validationErrors || []
    });
    return validationError;
  }
  if (status >= 500) {
    return createNetworkError(errorMessage, {
      isServerUnavailable: true,
      statusCode: status,
      endpoint: response.url,
      code: errorCode
    });
  }
  if (status >= 400 && status < 500) {
    return createBusinessLogicError(errorMessage, {
      code: errorCode,
      severity: ErrorSeverity.LOW
    });
  }
  
  return createBusinessLogicError(errorMessage, {
    code: errorCode
  });
}

export function showErrorToast(error: AppError, options: {
  showActions?: boolean;
  duration?: number;
} = {}) {
  const { showActions = false, duration = 5000 } = options;
  
  // Call the mock toast function with the exact same format as the real implementation
  mockToastFunction({
    variant: error.severity === ErrorSeverity.CRITICAL ? 'destructive' : 'default',
    title: `${error.category.replace('_', ' ')} Error`,
    description: error.userFriendlyMessage,
    duration,
  });
  
  // Log error for monitoring - exact same format as real implementation
  console.error(`[${error.category}] ${error.code}: ${error.message}`, {
    id: error.id,
    context: error.context,
    suggestedActions: error.suggestedActions,
  });
}