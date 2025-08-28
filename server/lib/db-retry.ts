/**
 * Database Retry Utility with Rate Limiting
 *
 * Provides utility functions to handle and retry database operations
 * when encountering temporary connection issues, rate limiting, or control plane errors.
 *
 * Includes integration with rate limiter to prevent overwhelming the database.
 */
import { dbRateLimiter } from "./rate-limiter";
import { logger } from './logger';

// Configuration for retries
const RETRY_OPTIONS = {
  maxRetries: 5, // Maximum number of retry attempts
  initialDelayMs: 500, // Initial delay before first retry
  maxDelayMs: 10000, // Maximum delay between retries
  backoffFactor: 2.5, // Exponential backoff multiplier
  timeoutErrorRetryCount: 3, // Special retry count for timeout errors
};

/**
 * Execute a database operation with intelligent retry logic and rate limiting
 *
 * @param operation Function to execute that may throw a database error
 * @param context Description of the operation for logging
 * @returns The result of the operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: string,
): Promise<T> {
  // Wrap the operation with rate limiting
  return dbRateLimiter.execute(async () => {
    let lastError: Error = new Error("No error occurred");
    let delay = RETRY_OPTIONS.initialDelayMs;
    let timeoutRetryCount = 0;

    for (let attempt = 1; attempt <= RETRY_OPTIONS.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        // Ensure we preserve the full error object
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message || "Unknown error";

        // Check error types to determine retry strategy
        const isNeonControlPlaneError =
          (error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "XX000") ||
          (typeof errorMessage === "string" &&
            (errorMessage.includes("Control plane request failed") ||
              errorMessage.includes("Couldn't connect to compute node")));

        const isRateLimitError =
          typeof errorMessage === "string" &&
          (errorMessage.includes("rate limit") ||
            errorMessage.includes("Too many database connection attempts"));

        const isConnectionTimeoutError =
          typeof errorMessage === "string" &&
          (errorMessage.includes("timeout") ||
            errorMessage.includes("Connection terminated") ||
            errorMessage.includes("connection reset"));

        // Special handling for different error types
        if (isConnectionTimeoutError) {
          timeoutRetryCount++;

          // For timeout errors, we might need more specialized handling with longer delays
          if (timeoutRetryCount <= RETRY_OPTIONS.timeoutErrorRetryCount) {
            logger.warn('Database connection timeout - special retry', {
              context,
              timeoutRetryAttempt: timeoutRetryCount,
              maxTimeoutRetries: RETRY_OPTIONS.timeoutErrorRetryCount,
              delayMs: delay * 2
            });

            // Use longer delay for timeout errors
            await new Promise((resolve) => setTimeout(resolve, delay * 2));
            delay = Math.min(
              delay * RETRY_OPTIONS.backoffFactor,
              RETRY_OPTIONS.maxDelayMs,
            );
            continue;
          }
        } else if (isRateLimitError) {
          // For rate limit errors, use a longer delay
          logger.warn('Database rate limit exceeded - retrying', {
            context,
            attempt,
            maxRetries: RETRY_OPTIONS.maxRetries,
            delayMs: delay * 1.5
          });
          await new Promise((resolve) => setTimeout(resolve, delay * 1.5));
        } else if (isNeonControlPlaneError) {
          // Standard retry for control plane errors
          if (attempt < RETRY_OPTIONS.maxRetries) {
            logger.warn('Neon control plane error - retrying', {
              context,
              attempt,
              maxRetries: RETRY_OPTIONS.maxRetries,
              delayMs: delay,
              error: errorMessage
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } else {
          // Don't retry other types of errors
          logger.error('Database error (not retriable)', { context, error });
          throw error;
        }

        // Increase delay for next attempt with exponential backoff
        if (attempt < RETRY_OPTIONS.maxRetries) {
          delay = Math.min(
            delay * RETRY_OPTIONS.backoffFactor,
            RETRY_OPTIONS.maxDelayMs,
          );
        } else {
          logger.error('Database operation failed after all retry attempts', {
            context,
            attempts: attempt,
            error: errorMessage
          });
        }
      }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError;
  }, context);
}

/**
 * Get the status of the database rate limiter
 */
export function getDatabaseRateLimiterStatus() {
  return dbRateLimiter.getStats();
}
