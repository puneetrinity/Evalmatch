/**
 * Provider Abstraction Layer for AI Failover System
 * 
 * Defines standard interfaces and error handling for all AI providers
 * enabling seamless failover between Groq, OpenAI, and Anthropic
 */

import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse, MatchAnalysisResponse, BiasAnalysisResponse } from "@shared/schema";

// Result type for provider operations
export type ProviderResult<T> = {
  success: true;
  data: T;
  metadata: ProviderMetadata;
} | {
  success: false;
  error: ProviderError;
  metadata: ProviderMetadata;
};

// Provider metadata included with all responses
export interface ProviderMetadata {
  provider: 'groq' | 'openai' | 'anthropic';
  model: string;
  processingTime: number;
  retryCount: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  timestamp: string;
}

// Standardized error interface
export interface ProviderError {
  code: 'TIMEOUT' | 'RATE_LIMIT' | 'AUTH_ERROR' | 'NETWORK_ERROR' | 'CONTENT_POLICY' | 'MODEL_ERROR' | 'UNKNOWN';
  message: string;
  retryable: boolean;
  retryAfter?: number; // seconds
  retryAfterDate?: string; // HTTP date format
  originalError?: unknown;
  statusCode?: number;
}

// Standard options for all provider calls
export interface ProviderOptions {
  timeout?: number;
  retryCount?: number;
  signal?: AbortSignal;
}

/**
 * Base interface that all AI providers must implement
 */
export interface ProviderAdapter {
  /**
   * Provider identification
   */
  getName(): 'groq' | 'openai' | 'anthropic';
  getModel(): string;
  
  /**
   * Core analysis operations
   */
  analyzeResume(
    _resumeText: string, 
    _options?: ProviderOptions
  ): Promise<ProviderResult<AnalyzeResumeResponse>>;
  
  analyzeJobDescription(
    _title: string, 
    _description: string, 
    _options?: ProviderOptions
  ): Promise<ProviderResult<AnalyzeJobDescriptionResponse>>;
  
  analyzeMatch(
    _resumeAnalysis: AnalyzeResumeResponse,
    _jobAnalysis: AnalyzeJobDescriptionResponse,
    _resumeText?: string,
    _jobText?: string,
    _options?: ProviderOptions
  ): Promise<ProviderResult<MatchAnalysisResponse>>;
  
  analyzeBias(
    _title: string, 
    _description: string, 
    _options?: ProviderOptions
  ): Promise<ProviderResult<BiasAnalysisResponse>>;
  
  /**
   * Health and status
   */
  isAvailable(): boolean;
  getHealthStatus(): {
    available: boolean;
    lastSuccess?: Date;
    lastError?: Date;
    errorCount: number;
  };
}

/**
 * Normalize HTTP errors into standardized provider errors
 */
export function normalizeProviderError(error: unknown, provider: string): ProviderError {
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const _errorStack = error instanceof Error ? error.stack?.toLowerCase() || "" : "";
  
  // Extract status code if available
  let statusCode: number | undefined;
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as any).response;
    statusCode = response?.status;
  }
  
  // Timeout errors
  if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
    return {
      code: 'TIMEOUT',
      message: `${provider} request timed out`,
      retryable: true,
      statusCode,
      originalError: error
    };
  }
  
  // Rate limiting (429) with Retry-After parsing
  if (statusCode === 429 || errorMessage.includes("rate limit") || errorMessage.includes("too many requests")) {
    let retryAfter: number | undefined;
    let retryAfterDate: string | undefined;
    
    // Try to extract Retry-After header
    if (error && typeof error === 'object' && 'response' in error) {
      const response = (error as any).response;
      const retryAfterHeader = response?.headers?.['retry-after'];
      
      if (retryAfterHeader) {
        // Check if it's a number (seconds)
        const seconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(seconds)) {
          retryAfter = seconds;
        } else {
          // Assume it's an HTTP date
          retryAfterDate = retryAfterHeader;
        }
      }
    }
    
    return {
      code: 'RATE_LIMIT',
      message: `${provider} rate limit exceeded`,
      retryable: true,
      retryAfter,
      retryAfterDate,
      statusCode,
      originalError: error
    };
  }
  
  // Authentication errors (401, 403)
  if (statusCode === 401 || statusCode === 403 || 
      errorMessage.includes("unauthorized") || errorMessage.includes("authentication")) {
    return {
      code: 'AUTH_ERROR',
      message: `${provider} authentication failed`,
      retryable: false,
      statusCode,
      originalError: error
    };
  }
  
  // Network errors
  if (errorMessage.includes("network") || errorMessage.includes("connection") ||
      errorMessage.includes("econnrefused") || errorMessage.includes("enotfound")) {
    return {
      code: 'NETWORK_ERROR',
      message: `${provider} network error`,
      retryable: true,
      statusCode,
      originalError: error
    };
  }
  
  // Content policy violations
  if (errorMessage.includes("content policy") || errorMessage.includes("safety") ||
      errorMessage.includes("filtered") || errorMessage.includes("inappropriate")) {
    return {
      code: 'CONTENT_POLICY',
      message: `${provider} content policy violation`,
      retryable: false,
      statusCode,
      originalError: error
    };
  }
  
  // Model errors (404, 400 with model-related messages)
  if (statusCode === 404 || errorMessage.includes("model not found") ||
      errorMessage.includes("model unavailable") || errorMessage.includes("invalid model")) {
    return {
      code: 'MODEL_ERROR',
      message: `${provider} model error`,
      retryable: false,
      statusCode,
      originalError: error
    };
  }
  
  // Server errors (5xx) - generally retryable
  if (statusCode && statusCode >= 500) {
    return {
      code: 'NETWORK_ERROR',
      message: `${provider} server error`,
      retryable: true,
      statusCode,
      originalError: error
    };
  }
  
  // Default to unknown error
  return {
    code: 'UNKNOWN',
    message: `${provider} unknown error: ${errorMessage}`,
    retryable: true,
    statusCode,
    originalError: error
  };
}

/**
 * Create standardized metadata for provider responses
 */
export function createProviderMetadata(
  provider: 'groq' | 'openai' | 'anthropic',
  model: string,
  processingTime: number,
  retryCount: number = 0,
  circuitBreakerState: 'closed' | 'open' | 'half-open' = 'closed'
): ProviderMetadata {
  return {
    provider,
    model,
    processingTime,
    retryCount,
    circuitBreakerState,
    timestamp: new Date().toISOString()
  };
}