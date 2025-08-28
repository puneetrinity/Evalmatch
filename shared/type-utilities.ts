/**
 * TYPESCRIPT: Advanced Type Utilities and Generic Patterns
 * Provides reusable type utilities for enhanced type safety across the application
 */

// ===== UTILITY TYPES =====

/**
 * Makes specified keys required while keeping others optional
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Makes specified keys optional while keeping others required  
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Creates a type with only the specified keys from T
 */
export type PickStrict<T, K extends keyof T> = {
  [P in K]: T[P];
};

/**
 * Deep partial type that makes all nested properties optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Deep required type that makes all nested properties required
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Creates a type with readonly nested properties
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

/**
 * Extracts non-nullable types
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Creates a union of all possible paths through an object type
 */
export type Paths<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}` | `${K}.${Paths<T[K]>}`
          : `${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Gets the value type at a given path in an object type
 */
export type PathValue<T, P extends Paths<T>> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? Rest extends Paths<T[K]>
      ? PathValue<T[K], Rest>
      : never
    : never
  : P extends keyof T
  ? T[P]
  : never;

// ===== API RESPONSE UTILITIES =====

/**
 * Standard API success response wrapper
 */
export type ApiSuccessResponse<T> = {
  readonly success: true;
  readonly data: T;
  readonly timestamp: string;
  readonly processingTime?: number;
  readonly metadata?: Record<string, unknown>;
};

/**
 * Standard API error response wrapper
 */
export type ApiErrorResponse = {
  readonly success: false;
  readonly error: string;
  readonly message: string;
  readonly timestamp: string;
  readonly details?: Record<string, unknown>;
};

/**
 * Union of success and error responses
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Paginated response wrapper
 */
export type PaginatedResponse<T> = ApiSuccessResponse<{
  readonly items: T[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasNext: boolean;
    readonly hasPrev: boolean;
  };
}>;

// ===== DATABASE UTILITIES =====

/**
 * Base entity with common database fields
 */
export type BaseEntity = {
  readonly id: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * Insert type that omits auto-generated fields
 */
export type InsertEntity<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Update type that makes all fields optional except ID
 */
export type UpdateEntity<T extends BaseEntity> = RequireKeys<Partial<T>, 'id'>;

/**
 * Database query conditions
 */
export type QueryConditions<T> = {
  [K in keyof T]?: T[K] | T[K][] | {
    $eq?: T[K];
    $ne?: T[K];
    $in?: T[K][];
    $nin?: T[K][];
    $gt?: T[K];
    $gte?: T[K];
    $lt?: T[K];
    $lte?: T[K];
    $like?: string;
    $ilike?: string;
  };
};

// ===== VALIDATION UTILITIES =====

/**
 * Validation result for form fields
 */
export type ValidationResult<T> = {
  readonly isValid: boolean;
  readonly errors: Partial<Record<keyof T, string[]>>;
  readonly warnings?: Partial<Record<keyof T, string[]>>;
};

/**
 * Validator function type
 */
export type Validator<T> = (value: T) => ValidationResult<T>;

/**
 * Field validator type
 */
export type FieldValidator<T, K extends keyof T> = (value: T[K]) => string | null;

/**
 * Schema validator type
 */
export type SchemaValidator<T> = {
  [K in keyof T]?: FieldValidator<T, K> | FieldValidator<T, K>[];
};

// ===== ASYNC UTILITIES =====

/**
 * Promise that resolves to a Result type
 */
export type AsyncResult<T, E = Error> = Promise<
  | { success: true; data: T }
  | { success: false; error: E }
>;

/**
 * Extracts the resolved type from a Promise
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Creates a type for async operations with loading states
 */
export type AsyncState<T, E = Error> = 
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: E };

// ===== FUNCTION UTILITIES =====

/**
 * Extracts parameter types from a function
 */
export type Parameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;

/**
 * Extracts return type from a function
 */
export type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : any;

/**
 * Creates a type for event handlers
 */
export type EventHandler<T = void> = (event: T) => void | Promise<void>;

/**
 * Creates a type for callback functions with error handling
 */
export type Callback<T, E = Error> = (error: E | null, result?: T) => void;

// ===== BRAND TYPES =====

/**
 * Creates a branded type for better type safety
 */
export type Brand<T, B> = T & { readonly __brand: B };

/**
 * User ID brand type
 */
export type UserId = Brand<string, 'UserId'>;

/**
 * Session ID brand type  
 */
export type SessionId = Brand<string, 'SessionId'>;

/**
 * Resume ID brand type (exported from api-contracts)
 */
// export type ResumeId = Brand<number, 'ResumeId'>;  // Commented out - using api-contracts version

/**
 * Job ID brand type (exported from api-contracts)
 */
// export type JobId = Brand<number, 'JobId'>;  // Commented out - using api-contracts version

/**
 * Analysis ID brand type
 */
export type AnalysisId = Brand<number, 'AnalysisId'>;

// ===== CONDITIONAL TYPES =====

/**
 * Checks if T extends U
 */
export type Extends<T, U> = T extends U ? true : false;

/**
 * Gets the keys of T that are of type U
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Filters object properties by type
 */
export type FilterByType<T, U> = Pick<T, KeysOfType<T, U>>;

/**
 * Creates a union from object values
 */
export type ValueOf<T> = T[keyof T];

/**
 * Creates a union from array elements
 */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

// ===== STRING UTILITIES =====

/**
 * Capitalizes the first letter of a string type
 */
export type Capitalize<S extends string> = S extends `${infer F}${infer R}` 
  ? `${Uppercase<F>}${R}` 
  : S;

/**
 * Converts string to snake_case
 */
export type SnakeCase<S extends string> = S extends `${infer T}${infer U}`
  ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${SnakeCase<U>}`
  : S;

/**
 * Converts string to camelCase
 */
export type CamelCase<S extends string> = S extends `${infer P1}_${infer P2}${infer P3}`
  ? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
  : Lowercase<S>;

// ===== ERROR TRANSFORMATION UTILITIES =====

/**
 * Maps App-specific concrete error classes to service-level error interfaces
 * These utilities bridge the gap between service implementations and interface contracts
 */

import type {
  ValidationError,
  BusinessLogicError,
  ExternalServiceError,
  NotFoundError,
  AuthenticationError,
  RateLimitError,
  Result
} from './result-types';

import { failure } from './result-types';

/**
 * Interface representing the structure of App-specific error classes
 * Used to provide better type safety for transformation functions
 */
interface AppErrorLike {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly timestamp?: string;
  readonly field?: string;
  readonly validationRules?: string[];
  readonly operation?: string;
  readonly service?: string;
  readonly originalError?: string;
  readonly resource?: string;
  readonly id?: string | number;
  readonly userId?: string;
  readonly retryAfter?: number;
  readonly limit?: number;
}

/**
 * Transforms AppValidationError to ValidationError interface
 */
export function transformValidationError(appError: AppErrorLike): ValidationError {
  return {
    code: 'VALIDATION_ERROR' as const,
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    timestamp: appError.timestamp,
    field: appError.field,
    validationRules: appError.validationRules
  };
}

/**
 * Transforms AppExternalServiceError to ExternalServiceError interface
 */
export function transformExternalServiceError(appError: AppErrorLike): ExternalServiceError {
  return {
    code: appError.code as 'EXTERNAL_SERVICE_ERROR' | 'AI_PROVIDER_ERROR' | 'DATABASE_ERROR', // Cast to correct union
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    timestamp: appError.timestamp,
    service: appError.service || 'Unknown',
    originalError: appError.originalError
  };
}

/**
 * Transforms AppBusinessLogicError to BusinessLogicError interface
 */
export function transformBusinessLogicError(appError: AppErrorLike): BusinessLogicError {
  return {
    code: 'BUSINESS_LOGIC_ERROR' as const,
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    timestamp: appError.timestamp,
    operation: appError.operation || 'Unknown'
  };
}

/**
 * Transforms AppNotFoundError to NotFoundError interface
 */
export function transformNotFoundError(appError: AppErrorLike): NotFoundError {
  return {
    code: 'NOT_FOUND' as const,
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    timestamp: appError.timestamp,
    resource: appError.resource || 'Unknown',
    id: appError.id
  };
}

/**
 * Transforms AppAuthenticationError to AuthenticationError interface
 */
export function transformAuthenticationError(appError: AppErrorLike): AuthenticationError {
  return {
    code: appError.code as 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR' | 'TOKEN_EXPIRED', // Cast to correct union
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    timestamp: appError.timestamp,
    userId: appError.userId
  };
}

/**
 * Transforms AppRateLimitError to RateLimitError interface
 */
export function transformRateLimitError(appError: AppErrorLike): RateLimitError {
  return {
    code: 'RATE_LIMIT_EXCEEDED' as const,
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    timestamp: appError.timestamp,
    retryAfter: appError.retryAfter,
    limit: appError.limit
  };
}

/**
 * Generic error transformer that routes to specific transformers based on error type
 */
export function transformAppError(appError: AppErrorLike): ValidationError | ExternalServiceError | BusinessLogicError | NotFoundError | AuthenticationError | RateLimitError {
  // Check the constructor name or code to determine the error type
  const errorName = (appError as any).constructor?.name || '';
  
  switch (errorName) {
    case 'AppValidationError':
      return transformValidationError(appError);
    case 'AppExternalServiceError':
      return transformExternalServiceError(appError);
    case 'AppBusinessLogicError':
      return transformBusinessLogicError(appError);
    case 'AppNotFoundError':
      return transformNotFoundError(appError);
    case 'AppAuthenticationError':
      return transformAuthenticationError(appError);
    case 'AppRateLimitError':
      return transformRateLimitError(appError);
    default:
      // Fallback based on error code
      switch (appError.code) {
        case 'VALIDATION_ERROR':
          return transformValidationError(appError);
        case 'EXTERNAL_SERVICE_ERROR':
        case 'AI_PROVIDER_ERROR':
        case 'DATABASE_ERROR':
          return transformExternalServiceError(appError);
        case 'BUSINESS_LOGIC_ERROR':
          return transformBusinessLogicError(appError);
        case 'NOT_FOUND':
          return transformNotFoundError(appError);
        case 'AUTHENTICATION_ERROR':
        case 'AUTHORIZATION_ERROR':
        case 'TOKEN_EXPIRED':
          return transformAuthenticationError(appError);
        case 'RATE_LIMIT_EXCEEDED':
          return transformRateLimitError(appError);
        default:
          // Default to external service error for unknown types
          return transformExternalServiceError(appError);
      }
  }
}

/**
 * Result transformer - converts Result with App-specific errors to service interface errors
 */
export function transformResult<T>(
  result: Result<T, AppErrorLike>
): Result<T, ValidationError | ExternalServiceError | BusinessLogicError | NotFoundError | AuthenticationError | RateLimitError> {
  if (result.success) {
    return result; // Success case remains unchanged
  }
  
  return failure(transformAppError(result.error));
}

/**
 * Specific transformers for common service patterns
 */

/**
 * Transforms resume service results (ValidationError | ExternalServiceError | BusinessLogicError)
 */
export function transformResumeServiceResult<T>(
  result: Result<T, AppErrorLike>
): Result<T, ValidationError | ExternalServiceError | BusinessLogicError> {
  if (result.success) {
    return result;
  }
  
  const transformedError = transformAppError(result.error);
  
  // Ensure the error is one of the expected types for resume service
  if (
    transformedError.code === 'VALIDATION_ERROR' ||
    transformedError.code === 'EXTERNAL_SERVICE_ERROR' ||
    transformedError.code === 'AI_PROVIDER_ERROR' ||
    transformedError.code === 'DATABASE_ERROR' ||
    transformedError.code === 'BUSINESS_LOGIC_ERROR'
  ) {
    return failure(transformedError as ValidationError | ExternalServiceError | BusinessLogicError);
  }
  
  // Convert other errors to external service errors as fallback
  return failure(transformExternalServiceError(result.error) as ExternalServiceError);
}

/**
 * Transforms job service results (ValidationError | ExternalServiceError | BusinessLogicError)
 */
export function transformJobServiceResult<T>(
  result: Result<T, AppErrorLike>
): Result<T, ValidationError | ExternalServiceError | BusinessLogicError> {
  return transformResumeServiceResult(result); // Same pattern as resume service
}

/**
 * Transforms analysis service results (ValidationError | ExternalServiceError | BusinessLogicError)
 */
export function transformAnalysisServiceResult<T>(
  result: Result<T, AppErrorLike>
): Result<T, ValidationError | ExternalServiceError | BusinessLogicError> {
  return transformResumeServiceResult(result); // Same pattern as resume service
}

/**
 * Transforms database results (NotFoundError | ExternalServiceError)
 */
export function transformDatabaseResult<T>(
  result: Result<T, AppErrorLike>
): Result<T, NotFoundError | ExternalServiceError> {
  if (result.success) {
    return result;
  }
  
  const transformedError = transformAppError(result.error);
  
  // Ensure the error is one of the expected types for database operations
  if (transformedError.code === 'NOT_FOUND') {
    return failure(transformedError as NotFoundError);
  }
  
  // Convert everything else to external service error
  return failure(transformExternalServiceError(result.error) as ExternalServiceError);
}

/**
 * Maps NotFoundError to BusinessLogicError for services that don't handle NotFound
 * This is a compatibility function for services that expect specific error types
 */
export function mapNotFoundToBusinessLogic(appError: AppErrorLike): ValidationError | ExternalServiceError | BusinessLogicError {
  const transformedError = transformAppError(appError);
  
  if (transformedError.code === 'NOT_FOUND') {
    // Convert NotFoundError to BusinessLogicError for services that don't handle it
    return {
      code: 'BUSINESS_LOGIC_ERROR',
      message: transformedError.message,
      statusCode: transformedError.statusCode,
      details: transformedError.details,
      timestamp: transformedError.timestamp,
      operation: 'resource_lookup'
    };
  }
  
  // For other errors, use the standard transformation
  if (
    transformedError.code === 'VALIDATION_ERROR' ||
    transformedError.code === 'EXTERNAL_SERVICE_ERROR' ||
    transformedError.code === 'AI_PROVIDER_ERROR' ||
    transformedError.code === 'DATABASE_ERROR' ||
    transformedError.code === 'BUSINESS_LOGIC_ERROR'
  ) {
    return transformedError as ValidationError | ExternalServiceError | BusinessLogicError;
  }
  
  // Default to business logic error
  return {
    code: 'BUSINESS_LOGIC_ERROR',
    message: transformedError.message,
    statusCode: transformedError.statusCode,
    details: transformedError.details,
    timestamp: transformedError.timestamp,
    operation: 'unknown'
  };
}

/**
 * Transforms auth results (AuthenticationError | RateLimitError)
 */
export function transformAuthResult<T>(
  result: Result<T, AppErrorLike>
): Result<T, AuthenticationError | RateLimitError> {
  if (result.success) {
    return result;
  }
  
  const transformedError = transformAppError(result.error);
  
  // Ensure the error is one of the expected types for auth operations
  if (
    transformedError.code === 'AUTHENTICATION_ERROR' ||
    transformedError.code === 'AUTHORIZATION_ERROR' ||
    transformedError.code === 'TOKEN_EXPIRED'
  ) {
    return failure(transformedError as AuthenticationError);
  }
  
  if (transformedError.code === 'RATE_LIMIT_EXCEEDED') {
    return failure(transformedError as RateLimitError);
  }
  
  // Convert other errors to authentication errors as fallback
  return failure(transformAuthenticationError(result.error) as AuthenticationError);
}

// ===== EXPORTS FOR LEGACY COMPATIBILITY =====

export type {
  // Re-export commonly used types from shared schema
  ValidationError,
  ProcessingError
} from './schema';

/**
 * Type assertion helper
 */
export const assertType = <T>(): ((value: unknown) => asserts value is T) => {
  return (value: unknown): asserts value is T => {
    // Runtime type checking would go here in a real implementation
    // This is mainly for compile-time type assertions
  };
};

/**
 * Type guard helper
 */
export const isType = <T>(predicate: (value: unknown) => boolean) => {
  return (value: unknown): value is T => predicate(value);
};

// ===== ERROR TYPE GUARDS AND UTILITIES =====

import type { AppError } from './result-types';

/**
 * Type guard to check if an error has AppError properties
 * Safely checks for the existence of statusCode, code, and timestamp properties
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as any).code === 'string' &&
    typeof (error as any).message === 'string' &&
    typeof (error as any).statusCode === 'number'
  );
}

/**
 * Type guard to check if an error is a standard JavaScript Error
 */
export function isStandardError(error: unknown): error is Error {
  return error instanceof Error && !isAppError(error);
}

/**
 * Safely extracts status code from any error type
 * Returns a fallback status code if the error doesn't have one
 */
export function getErrorStatusCode(error: unknown, fallback = 500): number {
  if (isAppError(error)) {
    return error.statusCode;
  }
  return fallback;
}

/**
 * Safely extracts error code from any error type
 * Returns a fallback code if the error doesn't have one
 */
export function getErrorCode(error: unknown, fallback = 'UNKNOWN_ERROR'): string {
  if (isAppError(error)) {
    return error.code;
  }
  return fallback;
}

/**
 * Safely extracts error message from any error type
 */
export function getErrorMessage(error: unknown, fallback = 'An unknown error occurred'): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

/**
 * Safely extracts timestamp from any error type
 * Returns current timestamp if the error doesn't have one
 */
export function getErrorTimestamp(error: unknown): string {
  if (isAppError(error) && error.timestamp) {
    return error.timestamp;
  }
  return new Date().toISOString();
}

/**
 * Utility function to create a standard error response object from any error
 * This is particularly useful in route handlers for consistent error responses
 */
export function createErrorResponse(error: unknown, defaultMessage?: string) {
  return {
    success: false as const,
    error: getErrorCode(error, 'ROUTE_ERROR'),
    message: getErrorMessage(error, defaultMessage || 'An error occurred'),
    timestamp: getErrorTimestamp(error)
  };
}

/**
 * Utility function to extract details from AppError if available
 */
export function getErrorDetails(error: unknown): Record<string, unknown> | undefined {
  if (isAppError(error)) {
    return error.details;
  }
  return undefined;
}

// ===== DATA TYPE TRANSFORMATION UTILITIES =====

import type {
  AnalyzedResumeData,
  AnalyzedJobData,
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse
} from './schema';
import type { ResumeId, JobId } from './api-contracts';

/**
 * Transforms AnalyzedResumeData (raw database type) to AnalyzeResumeResponse (API response type)
 * Bridges the gap between database storage format and API contract format
 */
export function transformToAnalyzeResumeResponse(
  id: number,
  filename: string,
  analyzedData: AnalyzedResumeData,
  processingTime: number = 0,
  confidence: number = 0.8,
  warnings?: string[]
): AnalyzeResumeResponse {
  return {
    id: id as ResumeId,
    filename,
    analyzedData,
    processingTime,
    confidence,
    warnings,
    // Convenience properties for backward compatibility
    name: analyzedData.name,
    skills: analyzedData.skills,
    experience: analyzedData.workExperience,
    education: analyzedData.education?.map((edu) => ({
      degree: edu,
      institution: 'Unknown',
      field: 'Unknown'
    })),
    contact: analyzedData.contactInfo,
    experienceYears: analyzedData.workExperience?.reduce((total, exp) => {
      const years = parseInt(exp.duration.match(/\d+/)?.[0] || '0');
      return total + years;
    }, 0) || 0
  };
}

/**
 * Transforms AnalyzedJobData (raw database type) to AnalyzeJobDescriptionResponse (API response type)
 * Bridges the gap between database storage format and API contract format
 */
export function transformToAnalyzeJobDescriptionResponse(
  id: number,
  title: string,
  analyzedData: AnalyzedJobData,
  processingTime: number = 0,
  confidence: number = 0.8,
  warnings?: string[]
): AnalyzeJobDescriptionResponse {
  return {
    id: id as JobId,
    title,
    analyzedData,
    processingTime,
    confidence,
    warnings,
    // Convenience properties for backward compatibility
    requiredSkills: analyzedData.requiredSkills,
    preferredSkills: analyzedData.preferredSkills,
    skills: [...(analyzedData.requiredSkills || []), ...(analyzedData.preferredSkills || [])],
    experience: analyzedData.experienceLevel,
    experienceLevel: analyzedData.experienceLevel,
    responsibilities: analyzedData.responsibilities,
    requirements: analyzedData.responsibilities, // Map responsibilities to requirements for backward compatibility
    summary: analyzedData.summary,
    biasAnalysis: analyzedData.biasAnalysis
  };
}

/**
 * Safe property accessor that handles undefined/null values
 * Prevents "Property 'property' does not exist on type 'string'" errors
 */
export function safeAccess<T, K extends keyof T>(
  obj: T | null | undefined,
  property: K
): T[K] | undefined {
  return obj?.[property];
}

/**
 * Safe array accessor that returns empty array for undefined values
 */
export function safeArray<T>(arr: T[] | null | undefined): T[] {
  return arr || [];
}

/**
 * Safe string accessor that returns empty string for undefined values
 */
export function safeString(str: string | null | undefined): string {
  return str || '';
}