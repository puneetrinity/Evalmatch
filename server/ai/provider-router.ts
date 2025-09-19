/**
 * Provider Router for AI Failover System
 * 
 * Implements intelligent routing with exponential backoff and graceful degradation
 * Follows Groq → OpenAI → Claude priority with ML-only fallback
 */

import { ProviderResult, ProviderOptions, ProviderAdapter } from './providers/base';
import { ProviderSelection, providerRegistry } from './provider-registry';
import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse, MatchAnalysisResponse, BiasAnalysisResponse } from "@shared/schema";
import { config } from '../config/unified-config';
import { logger } from '../lib/logger';

// Analysis context for routing decisions
interface AnalysisContext {
  operation: 'analyzeResume' | 'analyzeJobDescription' | 'analyzeMatch' | 'analyzeBias';
  mode?: 'interactive' | 'batch';
  userId?: string;
  timeout?: number;
  retryCount?: number;
  signal?: AbortSignal;
}

// Router result with failover metadata
export interface RouterResult<T> {
  success: boolean;
  data?: T;
  error?: any;
  metadata: {
    providerUsed?: string;
    failoverCount: number;
    totalAttempts: number;
    mode: 'normal' | 'degraded';
    processingTime: number;
    circuitBreakerStates: Record<string, string>;
  };
}

export class ProviderRouter {
  // Configuration is now loaded from unified-config
  private getRetryConfig(mode: 'interactive' | 'batch' = 'interactive') {
    return config.ai.router[mode];
  }

  private getJitterConfig() {
    return config.ai.router.jitter;
  }

  /**
   * Route resume analysis through provider failover chain
   */
  async routeAnalyzeResume(
    resumeText: string, 
    context: AnalysisContext
  ): Promise<RouterResult<AnalyzeResumeResponse>> {
    return this.executeWithFailover(
      context,
      (provider, options) => provider.analyzeResume(resumeText, options),
      () => this.getDegradedResumeAnalysis(resumeText)
    );
  }

  /**
   * Route job description analysis through provider failover chain
   */
  async routeAnalyzeJobDescription(
    title: string,
    description: string,
    context: AnalysisContext
  ): Promise<RouterResult<AnalyzeJobDescriptionResponse>> {
    return this.executeWithFailover(
      context,
      (provider, options) => provider.analyzeJobDescription(title, description, options),
      () => this.getDegradedJobAnalysis(title, description)
    );
  }

  /**
   * Route match analysis through provider failover chain
   */
  async routeAnalyzeMatch(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse,
    resumeText?: string,
    jobText?: string,
    context?: AnalysisContext
  ): Promise<RouterResult<MatchAnalysisResponse>> {
    return this.executeWithFailover(
      context || { operation: 'analyzeMatch' },
      (provider, options) => provider.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText, options),
      () => this.getDegradedMatchAnalysis(resumeAnalysis, jobAnalysis)
    );
  }

  /**
   * Route bias analysis through provider failover chain
   */
  async routeAnalyzeBias(
    title: string,
    description: string,
    context: AnalysisContext
  ): Promise<RouterResult<BiasAnalysisResponse>> {
    return this.executeWithFailover(
      context,
      (provider, options) => provider.analyzeBias(title, description, options),
      () => this.getDegradedBiasAnalysis(title, description)
    );
  }

  /**
   * Execute operation with failover logic and deadline budgets
   */
  private async executeWithFailover<T>(
    context: AnalysisContext,
    operation: (provider: ProviderAdapter, options: ProviderOptions) => Promise<ProviderResult<T>>,
    degradedFallback: () => Promise<T>
  ): Promise<RouterResult<T>> {
    const startTime = Date.now();
    const mode = context.mode || 'interactive';
    const retryConfig = this.getRetryConfig(mode);
    const jitterConfig = this.getJitterConfig();
    const deadline = startTime + retryConfig.deadlineMs;
    
    let totalAttempts = 0;
    let failoverCount = 0;
    let lastError: any;
    const circuitBreakerStates: Record<string, string> = {};

    // Track initial circuit breaker states
    const healthStatus = providerRegistry.getHealthStatus();
    for (const [provider, status] of Object.entries(healthStatus)) {
      circuitBreakerStates[provider] = status.circuitBreakerState;
    }

    logger.info('Starting provider failover sequence', {
      operation: context.operation,
      mode,
      maxRetries: retryConfig.maxRetries,
      deadlineMs: retryConfig.deadlineMs
    });

    // Try each provider in priority order within deadline budget
    for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
      const currentTime = Date.now();
      
      // Check if we have enough time budget remaining
      if (currentTime >= deadline) {
        logger.warn('Deadline exceeded, switching to degraded mode', {
          operation: context.operation,
          mode,
          elapsedMs: currentTime - startTime,
          deadlineMs: retryConfig.deadlineMs
        });
        break;
      }
      const selection = providerRegistry.selectProvider();
      
      if (!selection) {
        logger.warn('No providers available, attempting degraded mode', {
          operation: context.operation,
          attempt,
          totalAttempts
        });
        break;
      }

      totalAttempts++;

      // Check if we have enough time for provider timeout + small jitter
      const attemptTime = Date.now();
      const providerTimeout = config.ai.providers[selection.name]?.timeout || 30000;
      const remainingTime = deadline - attemptTime;
      
      if (remainingTime < providerTimeout + jitterConfig.maxMs) {
        logger.warn('Insufficient time budget for provider attempt, switching to degraded mode', {
          operation: context.operation,
          provider: selection.name,
          remainingTimeMs: remainingTime,
          requiredTimeMs: providerTimeout + jitterConfig.maxMs
        });
        break;
      }

      // Apply minimal jitter between provider attempts (not first attempt)
      if (attempt > 0) {
        const jitterRange = jitterConfig.maxMs - jitterConfig.minMs;
        const jitterMs = jitterConfig.minMs + (Math.random() * jitterRange);
        await this.delay(jitterMs);
      }

      try {
        logger.info('Attempting provider operation', {
          provider: selection.name,
          operation: context.operation,
          attempt: attempt + 1,
          failoverCount: selection.fallbackCount,
          reason: selection.reason
        });

        const options: ProviderOptions = {
          timeout: context.timeout,
          retryCount: context.retryCount || attempt,
          signal: context.signal
        };

        const result = await operation(selection.provider, options);

        if (result.success) {
          // Success - record and return
          providerRegistry.recordSuccess(selection.name);
          
          const processingTime = Date.now() - startTime;
          
          logger.info('Provider operation succeeded', {
            provider: selection.name,
            operation: context.operation,
            totalAttempts,
            failoverCount: selection.fallbackCount,
            processingTime
          });

          return {
            success: true,
            data: result.data,
            metadata: {
              providerUsed: selection.name,
              failoverCount: selection.fallbackCount,
              totalAttempts,
              mode: 'normal',
              processingTime,
              circuitBreakerStates
            }
          };
        } else {
          // Provider returned error result
          lastError = result.error;
          providerRegistry.recordFailure(selection.name, result.error);
          
          logger.warn('Provider operation failed', {
            provider: selection.name,
            operation: context.operation,
            error: result.error.message,
            retryable: result.error.retryable,
            attempt: attempt + 1
          });

          // If error is not retryable, try next provider immediately
          if (!result.error.retryable) {
            failoverCount++;
            continue;
          }

          // Handle rate limiting with Retry-After
          if (result.error.code === 'RATE_LIMIT' && result.error.retryAfter) {
            const retryAfterMs = result.error.retryAfter * 1000;
            logger.info('Rate limited, respecting Retry-After', {
              provider: selection.name,
              retryAfterMs
            });
            await this.delay(Math.min(retryAfterMs, 8000)); // Max 8s retry delay
          }
        }
      } catch (error) {
        // Unexpected error during operation
        lastError = error;
        providerRegistry.recordFailure(selection.name, error);
        
        logger.error('Provider operation threw exception', {
          provider: selection.name,
          operation: context.operation,
          error: error instanceof Error ? error.message : String(error),
          attempt: attempt + 1
        });
      }

      failoverCount++;
      
      // Update circuit breaker states after each attempt
      const updatedStatus = providerRegistry.getHealthStatus();
      for (const [provider, status] of Object.entries(updatedStatus)) {
        circuitBreakerStates[provider] = status.circuitBreakerState;
      }
    }

    // All providers failed - attempt degraded mode
    logger.warn('All providers failed, attempting degraded mode', {
      operation: context.operation,
      totalAttempts,
      lastError: lastError instanceof Error ? lastError.message : String(lastError)
    });

    try {
      const degradedResult = await degradedFallback();
      const processingTime = Date.now() - startTime;

      logger.info('Degraded mode succeeded', {
        operation: context.operation,
        processingTime,
        mode: 'degraded'
      });

      return {
        success: true,
        data: degradedResult,
        metadata: {
          failoverCount,
          totalAttempts,
          mode: 'degraded',
          processingTime,
          circuitBreakerStates
        }
      };
    } catch (degradedError) {
      // Complete failure
      const processingTime = Date.now() - startTime;
      
      logger.error('Degraded mode also failed', {
        operation: context.operation,
        error: degradedError instanceof Error ? degradedError.message : String(degradedError),
        processingTime
      });

      return {
        success: false,
        error: lastError || degradedError,
        metadata: {
          failoverCount,
          totalAttempts,
          mode: 'degraded',
          processingTime,
          circuitBreakerStates
        }
      };
    }
  }

  /**
   * Degraded resume analysis using ML-only scoring
   */
  private async getDegradedResumeAnalysis(resumeText: string): Promise<AnalyzeResumeResponse> {
    // Import degraded heuristics when needed
    const { getDegradedResumeAnalysis } = await import('./degraded-heuristics');
    return getDegradedResumeAnalysis(resumeText);
  }

  /**
   * Degraded job description analysis using ML-only scoring
   */
  private async getDegradedJobAnalysis(title: string, description: string): Promise<AnalyzeJobDescriptionResponse> {
    const { getDegradedJobAnalysis } = await import('./degraded-heuristics');
    return getDegradedJobAnalysis(title, description);
  }

  /**
   * Degraded match analysis using ML-only scoring
   */
  private async getDegradedMatchAnalysis(
    resumeAnalysis: AnalyzeResumeResponse,
    jobAnalysis: AnalyzeJobDescriptionResponse
  ): Promise<MatchAnalysisResponse> {
    const { getDegradedMatchAnalysis } = await import('./degraded-heuristics');
    return getDegradedMatchAnalysis(resumeAnalysis, jobAnalysis);
  }

  /**
   * Degraded bias analysis using local detection
   */
  private async getDegradedBiasAnalysis(title: string, description: string): Promise<BiasAnalysisResponse> {
    const { getDegradedBiasAnalysis } = await import('./degraded-heuristics');
    return getDegradedBiasAnalysis(title, description);
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const providerRouter = new ProviderRouter();