/**
 * Provider Registry for AI Failover System
 * 
 * Manages provider health tracking and selection with Groq → OpenAI → Claude priority
 * Integrates with circuit breakers and implements intelligent provider selection
 */

import { ProviderAdapter } from './providers/base';
import { groqAdapter } from './providers/groq';
import { openaiAdapter } from './providers/openai';
import { anthropicAdapter } from './providers/anthropic';
import { getBreaker } from '../lib/circuit-breakers';
import { config } from '../config/unified-config';
import { logger } from '../lib/logger';

// Provider health state
interface ProviderHealth {
  name: 'groq' | 'openai' | 'anthropic';
  adapter: ProviderAdapter;
  available: boolean;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  lastSuccess?: Date;
  lastError?: Date;
  errorCount: number;
  errorRate: number; // Rolling window error rate
  consecutiveFailures: number;
  lastHealthCheck: Date;
}

// Provider selection result
export interface ProviderSelection {
  provider: ProviderAdapter;
  name: 'groq' | 'openai' | 'anthropic';
  reason: string;
  fallbackCount: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
}

export class ProviderRegistry {
  private providers: Map<string, ProviderHealth> = new Map();
  private readonly healthCheckInterval = 30000; // 30 seconds
  private healthCheckTimer?: NodeJS.Timeout;
  private errorWindow = new Map<string, Date[]>(); // Rolling window for error rates
  private readonly errorWindowSize = 60000; // 1 minute window

  constructor() {
    this.initializeProviders();
    this.startHealthChecking();
  }

  /**
   * Initialize providers in priority order: Groq → OpenAI → Claude
   */
  private initializeProviders(): void {
    // Priority order as specified: Groq (speed/cost) → OpenAI (reliability) → Claude (quality)
    const providerConfigs = [
      { name: 'groq' as const, adapter: groqAdapter },
      { name: 'openai' as const, adapter: openaiAdapter },
      { name: 'anthropic' as const, adapter: anthropicAdapter }
    ];

    for (const { name, adapter } of providerConfigs) {
      this.providers.set(name, {
        name,
        adapter,
        available: adapter.isAvailable(),
        circuitBreakerState: 'closed',
        errorCount: 0,
        errorRate: 0,
        consecutiveFailures: 0,
        lastHealthCheck: new Date()
      });
    }

    logger.info('Provider registry initialized', {
      providers: Array.from(this.providers.keys()),
      priorityOrder: config.ai.providerPriority
    });
  }

  /**
   * Select the best available provider following Groq → OpenAI → Claude priority
   */
  public selectProvider(): ProviderSelection | null {
    const priorityOrder = config.ai.providerPriority.length > 0 
      ? config.ai.providerPriority 
      : ['groq', 'openai', 'anthropic']; // Default to preferred order

    let fallbackCount = 0;

    for (const providerName of priorityOrder) {
      const health = this.providers.get(providerName);
      if (!health) continue;

      // Update circuit breaker state
      this.updateCircuitBreakerState(health);

      // Check if provider is available for use
      if (this.isProviderUsable(health)) {
        const reason = fallbackCount === 0 
          ? `Primary provider (${providerName})`
          : `Fallback #${fallbackCount} (${providerName}) - previous providers unavailable`;

        logger.info('Provider selected', {
          provider: providerName,
          reason,
          fallbackCount,
          circuitBreakerState: health.circuitBreakerState,
          errorRate: health.errorRate,
          consecutiveFailures: health.consecutiveFailures
        });

        return {
          provider: health.adapter,
          name: health.name,
          reason,
          fallbackCount,
          circuitBreakerState: health.circuitBreakerState
        };
      }

      fallbackCount++;
    }

    logger.warn('No providers available', {
      checkedProviders: priorityOrder,
      providerStates: Array.from(this.providers.entries()).map(([name, health]) => ({
        name,
        available: health.available,
        circuitBreakerState: health.circuitBreakerState,
        errorRate: health.errorRate
      }))
    });

    return null;
  }

  /**
   * Record successful provider operation
   */
  public recordSuccess(providerName: string): void {
    const health = this.providers.get(providerName);
    if (!health) return;

    health.lastSuccess = new Date();
    health.consecutiveFailures = 0;
    health.errorCount = Math.max(0, health.errorCount - 1); // Gradually reduce on success
    
    // Record success with circuit breaker
    const breaker = getBreaker(providerName as any, {
      failureThreshold: config.ai.circuitBreaker.failureThreshold,
      halfOpenAfterMs: config.ai.circuitBreaker.resetTimeout,
      windowSize: 50
    });
    
    // Circuit breaker success is recorded automatically during exec()
    
    this.updateErrorRate(providerName);
    
    logger.debug('Provider success recorded', {
      provider: providerName,
      consecutiveFailures: health.consecutiveFailures,
      errorCount: health.errorCount,
      errorRate: health.errorRate
    });
  }

  /**
   * Record failed provider operation
   */
  public recordFailure(providerName: string, error?: any, retryAfterMs?: number): void {
    const health = this.providers.get(providerName);
    if (!health) return;

    health.lastError = new Date();
    health.errorCount++;
    health.consecutiveFailures++;

    // Add error to rolling window
    const errors = this.errorWindow.get(providerName) || [];
    errors.push(new Date());
    this.errorWindow.set(providerName, errors);

    this.updateErrorRate(providerName);

    // Circuit breaker failure is recorded automatically during exec()
    
    logger.warn('Provider failure recorded', {
      provider: providerName,
      error: error instanceof Error ? error.message : String(error),
      consecutiveFailures: health.consecutiveFailures,
      errorCount: health.errorCount,
      errorRate: health.errorRate,
      retryAfterMs
    });
  }

  /**
   * Get health status for all providers
   */
  public getHealthStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [name, health] of this.providers) {
      status[name] = {
        available: health.available,
        circuitBreakerState: health.circuitBreakerState,
        lastSuccess: health.lastSuccess?.toISOString(),
        lastError: health.lastError?.toISOString(),
        errorCount: health.errorCount,
        errorRate: health.errorRate,
        consecutiveFailures: health.consecutiveFailures,
        lastHealthCheck: health.lastHealthCheck.toISOString()
      };
    }

    return status;
  }

  /**
   * Check if provider is usable (available and circuit breaker allows requests)
   */
  private isProviderUsable(health: ProviderHealth): boolean {
    return health.available && 
           health.circuitBreakerState !== 'open' &&
           health.adapter.isAvailable();
  }

  /**
   * Update circuit breaker state from actual circuit breaker
   */
  private updateCircuitBreakerState(health: ProviderHealth): void {
    try {
      const breaker = getBreaker(health.name, {
        failureThreshold: config.ai.circuitBreaker.failureThreshold,
        halfOpenAfterMs: config.ai.circuitBreaker.resetTimeout,
        windowSize: 50
      });
      
      const status = breaker.status();
      health.circuitBreakerState = status.state as 'closed' | 'open' | 'half-open';
    } catch (error) {
      logger.warn('Failed to get circuit breaker state', {
        provider: health.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Update error rate based on rolling window
   */
  private updateErrorRate(providerName: string): void {
    const errors = this.errorWindow.get(providerName) || [];
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.errorWindowSize);

    // Remove old errors outside the window
    const recentErrors = errors.filter(errorTime => errorTime >= windowStart);
    this.errorWindow.set(providerName, recentErrors);

    // Calculate error rate (errors per minute)
    const health = this.providers.get(providerName);
    if (health) {
      health.errorRate = recentErrors.length; // Simple count for now
    }
  }

  /**
   * Perform health checks on all providers
   */
  private performHealthChecks(): void {
    for (const [name, health] of this.providers) {
      try {
        const adapterHealth = health.adapter.getHealthStatus();
        health.available = adapterHealth.available;
        health.lastHealthCheck = new Date();

        // Update circuit breaker state
        this.updateCircuitBreakerState(health);
        
        // Clean up old errors
        this.updateErrorRate(name);
        
      } catch (error) {
        logger.warn('Health check failed', {
          provider: name,
          error: error instanceof Error ? error.message : String(error)
        });
        health.available = false;
      }
    }
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);

    logger.info('Provider health checking started', {
      interval: this.healthCheckInterval
    });
  }

  /**
   * Stop health checking (for cleanup)
   */
  public destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
    logger.info('Provider registry destroyed');
  }
}

// Export singleton instance
export const providerRegistry = new ProviderRegistry();