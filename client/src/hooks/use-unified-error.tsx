/**
 * Unified Error Hook
 * Provides consistent error handling across the application
 */

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface ErrorInfo {
  code?: string;
  message: string;
  details?: any;
  suggestions?: string[];
}

interface UseUnifiedErrorOptions {
  showToast?: boolean;
  logToConsole?: boolean;
  fallbackMessage?: string;
}

export function useUnifiedError(options: UseUnifiedErrorOptions = {}) {
  const { showToast = true, logToConsole = true, fallbackMessage = 'An unexpected error occurred' } = options;
  const { toast } = useToast();
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleError = useCallback((error: unknown, customMessage?: string) => {
    let errorInfo: ErrorInfo;

    if (error instanceof Error) {
      // Check for Firebase error structure
      if ('code' in error && typeof (error as any).code === 'string') {
        errorInfo = {
          code: (error as any).code,
          message: customMessage || error.message,
          details: error,
        };
      } else {
        errorInfo = {
          message: customMessage || error.message,
          details: error,
        };
      }
    } else if (typeof error === 'string') {
      errorInfo = {
        message: customMessage || error,
      };
    } else {
      errorInfo = {
        message: customMessage || fallbackMessage,
        details: error,
      };
    }

    setError(errorInfo);

    if (logToConsole) {
      console.error('Error occurred:', errorInfo);
    }

    if (showToast) {
      toast({
        title: 'Error',
        description: errorInfo.message,
        variant: 'destructive',
      });
    }

    return errorInfo;
  }, [showToast, logToConsole, fallbackMessage, toast]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const withErrorHandling = useCallback(
    async <T,>(asyncFunction: () => Promise<T>): Promise<T | null> => {
      setIsLoading(true);
      clearError();
      
      try {
        const result = await asyncFunction();
        return result;
      } catch (error) {
        handleError(error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [handleError, clearError]
  );

  return {
    error,
    isLoading,
    handleError,
    clearError,
    withErrorHandling,
  };
}

// Error code mapping for common scenarios
export const ERROR_CODES = {
  // Authentication
  AUTH_INVALID_EMAIL: 'auth/invalid-email',
  AUTH_USER_NOT_FOUND: 'auth/user-not-found',
  AUTH_WRONG_PASSWORD: 'auth/wrong-password',
  AUTH_EMAIL_IN_USE: 'auth/email-already-in-use',
  AUTH_WEAK_PASSWORD: 'auth/weak-password',
  AUTH_NETWORK_FAILED: 'auth/network-request-failed',
  
  // File handling
  FILE_INVALID_TYPE: 'file/invalid-type',
  FILE_TOO_LARGE: 'file/too-large',
  FILE_UPLOAD_FAILED: 'file/upload-failed',
  FILE_PARSE_FAILED: 'file/parse-failed',
  
  // API/Server
  SERVER_UNAVAILABLE: 'server/unavailable',
  SERVER_TIMEOUT: 'server/timeout',
  API_RATE_LIMIT: 'api/rate-limit',
  
  // Analysis
  ANALYSIS_NO_JOB: 'analysis/no-job',
  ANALYSIS_NO_RESUMES: 'analysis/no-resumes',
  ANALYSIS_FAILED: 'analysis/failed',
  
  // Generic
  UNKNOWN: 'unknown',
} as const;

// Helper function to create consistent error objects
export function createError(code: string, message: string, suggestions?: string[]): Error {
  const error = new Error(message);
  (error as any).code = code;
  (error as any).suggestions = suggestions;
  return error;
}