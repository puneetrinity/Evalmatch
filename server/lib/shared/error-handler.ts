/**
 * Unified Error Handler for AI Providers
 * 
 * Consolidates error handling, service status tracking, and fallback response
 * generation that was previously duplicated across anthropic.ts, openai.ts, and groq.ts
 * 
 * Eliminates ~200+ lines of duplicate error handling code per provider.
 */

import { logger } from "../logger";

export interface ServiceStatus {
  isAvailable: boolean;
  consecutiveFailures: number;
  lastErrorTime: number;
  timeElapsedSinceLastError: number;
  retry: {
    currentBackoff: number;
    maxBackoff: number;
  };
  apiUsageStats: {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCost: number;
  };
  cacheSize: number;
}

export interface UsageStats {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface ErrorClassification {
  type: 'rate_limit' | 'auth' | 'network' | 'content_policy' | 'timeout' | 'parse' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoverable: boolean;
  retryable: boolean;
}

/**
 * Unified error handler and service status tracker
 */
export class AIProviderErrorHandler {
  private readonly serviceName: string;
  private readonly status: ServiceStatus;
  private readonly failureThreshold: number;
  private readonly baseCost: { input: number; output: number };

  constructor(
    serviceName: string,
    options?: {
      failureThreshold?: number;
      baseBackoff?: number;
      maxBackoff?: number;
      baseCost?: { input: number; output: number };
    }
  ) {
    this.serviceName = serviceName;
    this.failureThreshold = options?.failureThreshold || 3;
    
    // Initialize service status (matches current anthropic.ts pattern)
    this.status = {
      isAvailable: true,
      consecutiveFailures: 0,
      lastErrorTime: 0,
      timeElapsedSinceLastError: 0,
      retry: {
        currentBackoff: options?.baseBackoff || 5000,
        maxBackoff: options?.maxBackoff || 300000,
      },
      apiUsageStats: {
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        estimatedCost: 0,
      },
      cacheSize: 0,
    };

    this.baseCost = options?.baseCost || { input: 0.000003, output: 0.000015 }; // Claude pricing
  }

  /**
   * Record successful API call (matches current recordApiSuccess pattern)
   */
  recordSuccess(usage?: UsageStats): void {
    // Reset failure tracking
    this.status.consecutiveFailures = 0;
    this.status.isAvailable = true;
    this.status.retry.currentBackoff = 5000; // Reset backoff

    // Track token usage
    if (usage) {
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      
      this.status.apiUsageStats.promptTokens += inputTokens;
      this.status.apiUsageStats.completionTokens += outputTokens;
      this.status.apiUsageStats.totalTokens += inputTokens + outputTokens;
      
      // Calculate cost
      const inputCost = inputTokens * this.baseCost.input;
      const outputCost = outputTokens * this.baseCost.output;
      this.status.apiUsageStats.estimatedCost += inputCost + outputCost;
    }

    logger.debug(`${this.serviceName} API call successful`, {
      totalTokens: this.status.apiUsageStats.totalTokens,
      estimatedCost: this.status.apiUsageStats.estimatedCost
    });
  }

  /**
   * Record API failure (matches current error tracking pattern)
   */
  recordFailure(error: Error): ErrorClassification {
    this.status.lastErrorTime = Date.now();
    this.status.consecutiveFailures++;

    const classification = this.classifyError(error);

    // Update service availability based on failure threshold
    if (this.status.consecutiveFailures >= this.failureThreshold) {
      this.status.isAvailable = false;
      
      // Exponential backoff
      this.status.retry.currentBackoff = Math.min(
        this.status.retry.currentBackoff * 2,
        this.status.retry.maxBackoff
      );

      logger.error(`${this.serviceName} service marked unavailable`, {
        consecutiveFailures: this.status.consecutiveFailures,
        backoffMs: this.status.retry.currentBackoff,
        errorType: classification.type,
        error: error.message
      });
    } else {
      logger.warn(`${this.serviceName} API failure recorded`, {
        consecutiveFailures: this.status.consecutiveFailures,
        threshold: this.failureThreshold,
        errorType: classification.type,
        error: error.message
      });
    }

    return classification;
  }

  /**
   * Check service recovery (matches current checkServiceRecovery pattern)
   */
  checkServiceRecovery(): boolean {
    if (this.status.isAvailable) {
      return true;
    }

    const elapsed = Date.now() - this.status.lastErrorTime;
    this.status.timeElapsedSinceLastError = elapsed;

    // If we've waited long enough, try to recover
    if (elapsed > this.status.retry.currentBackoff) {
      logger.info(`${this.serviceName} attempting service recovery`, {
        backoffSeconds: Math.round(elapsed / 1000),
        consecutiveFailures: this.status.consecutiveFailures
      });
      
      // Don't immediately mark as available, let next success call do that
      return true;
    }

    return false;
  }

  /**
   * Get current service status
   */
  getStatus(): ServiceStatus {
    return { ...this.status };
  }

  /**
   * Get formatted status for logging (matches current pattern)
   */
  get currentBackoff(): string {
    return `${Math.round(this.status.retry.currentBackoff / 1000)}s`;
  }

  get isAvailable(): boolean {
    return this.status.isAvailable && this.checkServiceRecovery();
  }

  /**
   * Create fallback response for failed operations
   */
  createFallbackResponse<T>(baseResponse: Partial<T>, context: string): T {
    logger.warn(`${this.serviceName} creating fallback response`, { context });
    
    return {
      processingTime: 0,
      confidence: 0,
      warnings: [
        `${this.serviceName} service temporarily unavailable`,
        'Using fallback response data',
        `Next retry available in ${this.currentBackoff}`
      ],
      ...baseResponse
    } as T;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Classify error type for appropriate handling
   */
  private classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase();
    
    // Rate limiting errors
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('quota')) {
      return {
        type: 'rate_limit',
        severity: 'medium',
        recoverable: true,
        retryable: true
      };
    }

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('invalid api key') || message.includes('authentication')) {
      return {
        type: 'auth',
        severity: 'high',
        recoverable: false,
        retryable: false
      };
    }

    // Network/connectivity errors
    if (message.includes('network') || message.includes('timeout') || message.includes('connection') || message.includes('econnreset')) {
      return {
        type: 'network',
        severity: 'medium',
        recoverable: true,
        retryable: true
      };
    }

    // Content policy violations
    if (message.includes('content policy') || message.includes('safety') || message.includes('harmful')) {
      return {
        type: 'content_policy',
        severity: 'low',
        recoverable: false,
        retryable: false
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: 'timeout',
        severity: 'medium',
        recoverable: true,
        retryable: true
      };
    }

    // Parse errors
    if (message.includes('json') || message.includes('parse') || message.includes('syntax')) {
      return {
        type: 'parse',
        severity: 'low',
        recoverable: true,
        retryable: false
      };
    }

    // Unknown errors
    return {
      type: 'unknown',
      severity: 'medium',
      recoverable: true,
      retryable: true
    };
  }
}

/**
 * Provider-specific error handlers with preset configurations
 */
export class AnthropicErrorHandler extends AIProviderErrorHandler {
  constructor() {
    super('Anthropic', {
      failureThreshold: 3,
      baseBackoff: 5000,
      maxBackoff: 300000,
      baseCost: { input: 0.000003, output: 0.000015 } // Claude pricing
    });
  }
}

export class OpenAIErrorHandler extends AIProviderErrorHandler {
  constructor() {
    super('OpenAI', {
      failureThreshold: 3,
      baseBackoff: 5000,
      maxBackoff: 300000,
      baseCost: { input: 0.000005, output: 0.000015 } // GPT-4 pricing
    });
  }
}

export class GroqErrorHandler extends AIProviderErrorHandler {
  constructor() {
    super('Groq', {
      failureThreshold: 5, // Groq can handle more failures due to speed
      baseBackoff: 2000,
      maxBackoff: 120000,
      baseCost: { input: 0.0000002, output: 0.0000002 } // Much cheaper
    });
  }
}

/**
 * Unified logging function for API service status (matches current pattern)
 */
export function logApiServiceStatus(serviceName: string, message: string, isError: boolean = false): void {
  const timestamp = new Date().toISOString();
  const prefix = isError ? "ERROR" : "INFO";
  const servicePrefix = `${serviceName.toUpperCase()}_API`;
  
  const logMessage = `[${timestamp}] [${servicePrefix}] [${prefix}] ${message}`;
  
  if (isError) {
    logger.error(logMessage);
  } else {
    logger.info(logMessage);
  }
}