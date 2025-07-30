/**
 * Database Retry Utility with Rate Limiting
 * 
 * Provides utility functions to handle and retry database operations
 * when encountering temporary connection issues, rate limiting, or control plane errors.
 * 
 * Includes integration with rate limiter to prevent overwhelming the database.
 */
import { dbRateLimiter } from './rate-limiter';

// Configuration for retries
const RETRY_OPTIONS = {
  maxRetries: 5,               // Maximum number of retry attempts
  initialDelayMs: 500,         // Initial delay before first retry
  maxDelayMs: 10000,           // Maximum delay between retries
  backoffFactor: 2.5,          // Exponential backoff multiplier
  timeoutErrorRetryCount: 3    // Special retry count for timeout errors
};

/**
 * Execute a database operation with intelligent retry logic and rate limiting
 * 
 * @param operation Function to execute that may throw a database error
 * @param context Description of the operation for logging
 * @returns The result of the operation
 */
export async function withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
  // Wrap the operation with rate limiting
  return dbRateLimiter.execute(async () => {
    let lastError: Error;
    let delay = RETRY_OPTIONS.initialDelayMs;
    let timeoutRetryCount = 0;
    
    for (let attempt = 1; attempt <= RETRY_OPTIONS.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        lastError = error;
        const errorMessage = error?.message || 'Unknown error';
        
        // Check error types to determine retry strategy
        const isNeonControlPlaneError = 
          error?.code === 'XX000' || 
          (typeof errorMessage === 'string' && 
            (errorMessage.includes('Control plane request failed') || 
             errorMessage.includes('Couldn\'t connect to compute node')));
        
        const isRateLimitError = 
          typeof errorMessage === 'string' && 
          (errorMessage.includes('rate limit') || 
           errorMessage.includes('Too many database connection attempts'));
        
        const isConnectionTimeoutError = 
          typeof errorMessage === 'string' && 
          (errorMessage.includes('timeout') || 
           errorMessage.includes('Connection terminated') ||
           errorMessage.includes('connection reset'));
        
        // Special handling for different error types
        if (isConnectionTimeoutError) {
          timeoutRetryCount++;
          
          // For timeout errors, we might need more specialized handling with longer delays
          if (timeoutRetryCount <= RETRY_OPTIONS.timeoutErrorRetryCount) {
            console.warn(`Database connection timeout in ${context}, special retry (${timeoutRetryCount}/${RETRY_OPTIONS.timeoutErrorRetryCount}) after ${delay * 2}ms`);
            
            // Use longer delay for timeout errors
            await new Promise(resolve => setTimeout(resolve, delay * 2));
            delay = Math.min(delay * RETRY_OPTIONS.backoffFactor, RETRY_OPTIONS.maxDelayMs);
            continue;
          }
        } else if (isRateLimitError) {
          // For rate limit errors, use a longer delay
          console.warn(`Rate limit exceeded in ${context}, retrying (${attempt}/${RETRY_OPTIONS.maxRetries}) after ${delay * 1.5}ms`);
          await new Promise(resolve => setTimeout(resolve, delay * 1.5));
        } else if (isNeonControlPlaneError) {
          // Standard retry for control plane errors
          if (attempt < RETRY_OPTIONS.maxRetries) {
            console.warn(`Neon control plane error in ${context}, retrying (${attempt}/${RETRY_OPTIONS.maxRetries}) after ${delay}ms:`, errorMessage);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } else {
          // Don't retry other types of errors
          console.error(`Database error (not retriable) in ${context}:`, error);
          throw error;
        }
        
        // Increase delay for next attempt with exponential backoff
        if (attempt < RETRY_OPTIONS.maxRetries) {
          delay = Math.min(delay * RETRY_OPTIONS.backoffFactor, RETRY_OPTIONS.maxDelayMs);
        } else {
          console.error(`Database operation in ${context} failed after ${attempt} attempts:`, errorMessage);
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