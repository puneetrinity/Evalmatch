/**
 * TYPESCRIPT: Result Pattern for Bulletproof Error Handling
 * Eliminates inconsistent try/catch patterns and provides type-safe error handling
 * 
 * @fileoverview This module implements the Result pattern for type-safe error handling
 * across the entire application. It provides a consistent way to handle success and
 * failure cases without throwing exceptions.
 * 
 * @example
 * ```typescript
 * // Creating results
 * const successResult = success({ data: 'hello' });
 * const errorResult = failure(new AppValidationError('Invalid input'));
 * 
 * // Checking results
 * if (isSuccess(result)) {
 *   console.log(result.data); // Type-safe access to data
 * } else {
 *   console.error(result.error); // Type-safe access to error
 * }
 * 
 * // Converting promises
 * const result = await fromPromise(
 *   fetchUserData(),
 *   (error) => AppExternalServiceError.databaseFailure('user_fetch', error.message)
 * );
 * ```
 * 
 * @since 1.0.0
 * @author Claude Code Assistant
 */

// ===== CORE RESULT TYPES =====

/**
 * Result type representing either success with data or failure with error
 * 
 * @template T - The type of data returned on success
 * @template E - The type of error returned on failure (defaults to AppError)
 * 
 * @example
 * ```typescript
 * type UserResult = Result<User, ValidationError>;
 * ```
 */
export type Result<T, E = AppError> = Success<T> | Failure<E>;

/**
 * Success variant of Result containing the successful data
 * 
 * @template T - The type of the success data
 */
export interface Success<T> {
  /** Always true for success results */
  readonly success: true;
  /** The successful data payload */
  readonly data: T;
}

/**
 * Failure variant of Result containing the error information
 * 
 * @template E - The type of the error
 */
export interface Failure<E> {
  /** Always false for failure results */
  readonly success: false;
  /** The error that caused the failure */
  readonly error: E;
}

// ===== RESULT CONSTRUCTORS =====

/**
 * Creates a successful Result with the provided data
 * 
 * @template T - The type of the success data
 * @param data - The data to wrap in a success result
 * @returns A Success result containing the data
 * 
 * @example
 * ```typescript
 * const result = success({ id: 1, name: 'John' });
 * // result: Success<{ id: number, name: string }>
 * ```
 */
export const success = <T>(data: T): Success<T> => ({ success: true, data });

/**
 * Creates a failure Result with the provided error
 * 
 * @template E - The type of the error
 * @param error - The error to wrap in a failure result
 * @returns A Failure result containing the error
 * 
 * @example
 * ```typescript
 * const result = failure(new AppValidationError('Invalid email'));
 * // result: Failure<AppValidationError>
 * ```
 */
export const failure = <E>(error: E): Failure<E> => ({ success: false, error });

// Base application error interface
export interface AppError {
  readonly code: string;
  readonly message: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly timestamp?: string;
}

// Specific error types for different domains
export interface ValidationError extends AppError {
  readonly code: 'VALIDATION_ERROR';
  readonly field?: string;
  readonly validationRules?: string[];
}

export interface NotFoundError extends AppError {
  readonly code: 'NOT_FOUND';
  readonly resource: string;
  readonly id?: string | number;
}

export interface AuthenticationError extends AppError {
  readonly code: 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR' | 'TOKEN_EXPIRED';
  readonly userId?: string;
}

export interface BusinessLogicError extends AppError {
  readonly code: 'BUSINESS_LOGIC_ERROR';
  readonly operation: string;
}

export interface ExternalServiceError extends AppError {
  readonly code: 'EXTERNAL_SERVICE_ERROR' | 'AI_PROVIDER_ERROR' | 'DATABASE_ERROR';
  readonly service: string;
  readonly originalError?: string;
}

export interface RateLimitError extends AppError {
  readonly code: 'RATE_LIMIT_EXCEEDED';
  readonly retryAfter?: number;
  readonly limit?: number;
}

// Union of all possible error types
export type ApplicationError = 
  | ValidationError 
  | NotFoundError 
  | AuthenticationError 
  | BusinessLogicError 
  | ExternalServiceError 
  | RateLimitError;

// Result types for specific operations
export type ResumeAnalysisResult<T> = Result<T, ValidationError | NotFoundError | ExternalServiceError | BusinessLogicError>;
export type JobAnalysisResult<T> = Result<T, ValidationError | NotFoundError | ExternalServiceError | BusinessLogicError>;
export type MatchAnalysisResult<T> = Result<T, ValidationError | NotFoundError | ExternalServiceError | BusinessLogicError>;
export type DatabaseResult<T> = Result<T, NotFoundError | ExternalServiceError>;
export type AuthResult<T> = Result<T, AuthenticationError | RateLimitError>;

// ===== TYPE GUARDS =====

/**
 * Type guard to check if a Result is a Success
 * 
 * @template T - The type of the success data
 * @template E - The type of the error
 * @param result - The Result to check
 * @returns True if the result is a Success, with proper type narrowing
 * 
 * @example
 * ```typescript
 * if (isSuccess(result)) {
 *   console.log(result.data); // TypeScript knows this is T
 * }
 * ```
 */
export const isSuccess = <T, E>(result: Result<T, E>): result is Success<T> => {
  return result.success === true;
};

/**
 * Type guard to check if a Result is a Failure
 * 
 * @template T - The type of the success data
 * @template E - The type of the error
 * @param result - The Result to check
 * @returns True if the result is a Failure, with proper type narrowing
 * 
 * @example
 * ```typescript
 * if (isFailure(result)) {
 *   console.error(result.error); // TypeScript knows this is E
 * }
 * ```
 */
export const isFailure = <T, E>(result: Result<T, E>): result is Failure<E> => {
  return result.success === false;
};

// ===== RESULT TRANSFORMATION UTILITIES =====

/**
 * Transforms the data in a successful Result while preserving failures
 * 
 * @template T - The input data type
 * @template U - The output data type
 * @template E - The error type
 * @param result - The Result to transform
 * @param transform - Function to transform the success data
 * @returns A new Result with transformed data or the original error
 * 
 * @example
 * ```typescript
 * const userResult = success({ id: 1, name: 'John' });
 * const nameResult = mapResult(userResult, user => user.name);
 * // nameResult: Result<string, E>
 * ```
 */
export const mapResult = <T, U, E>(
  result: Result<T, E>,
  transform: (data: T) => U
): Result<U, E> => {
  return isSuccess(result) 
    ? success(transform(result.data))
    : result;
};

/**
 * Chains Results together, similar to Promise.then() but for Results
 * 
 * @template T - The input data type
 * @template U - The output data type
 * @template E - The error type
 * @param result - The initial Result
 * @param next - Function that takes success data and returns a new Result
 * @returns The result of the next function, or the original error
 * 
 * @example
 * ```typescript
 * const userResult = success({ id: 1 });
 * const profileResult = chainResult(userResult, 
 *   user => fetchUserProfile(user.id)
 * );
 * ```
 */
export const chainResult = <T, U, E>(
  result: Result<T, E>,
  next: (data: T) => Result<U, E>
): Result<U, E> => {
  return isSuccess(result) 
    ? next(result.data)
    : result;
};

// Combine multiple Results into one
export const combineResults = <T extends readonly unknown[], E>(
  results: { [K in keyof T]: Result<T[K], E> }
): Result<T, E> => {
  const data = [] as unknown as T;
  
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (isFailure(result)) {
      return result;
    }
    (data as any)[i] = result.data;
  }
  
  return success(data);
};

/**
 * Converts a Promise to a Result, catching any thrown exceptions
 * 
 * @template T - The type of data the Promise resolves to
 * @param promise - The Promise to convert
 * @param errorTransform - Function to convert caught errors to AppError
 * @returns A Promise that resolves to a Result (never rejects)
 * 
 * @example
 * ```typescript
 * const result = await fromPromise(
 *   fetch('/api/users'),
 *   (error) => AppExternalServiceError.apiFailure('users', error.message)
 * );
 * 
 * if (isSuccess(result)) {
 *   // Handle successful response
 * } else {
 *   // Handle error without try/catch
 * }
 * ```
 */
export const fromPromise = async <T>(
  promise: Promise<T>,
  errorTransform: (error: unknown) => AppError
): Promise<Result<T, AppError>> => {
  try {
    const data = await promise;
    return success(data);
  } catch (error) {
    return failure(errorTransform(error));
  }
};

/**
 * Async version of chainResult for chaining async operations
 * 
 * @template T - The input data type
 * @template U - The output data type
 * @template E - The error type
 * @param result - The initial Result
 * @param next - Async function that takes success data and returns a Result Promise
 * @returns A Promise of the chained Result
 * 
 * @example
 * ```typescript
 * const userResult = success({ id: 1 });
 * const profileResult = await chainResultAsync(userResult, 
 *   async user => await fetchUserProfileFromDb(user.id)
 * );
 * ```
 */
export const chainResultAsync = async <T, U, E>(
  result: Result<T, E>,
  next: (data: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> => {
  return isSuccess(result) 
    ? await next(result.data)
    : result;
};