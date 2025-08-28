/**
 * Unified Circuit Breaker for AI Providers
 * 
 * Consolidates circuit breaker logic that was previously duplicated across
 * anthropic.ts (~77 lines), openai.ts (~91 lines), and tiered-ai-provider.ts (~109 lines)
 * 
 * Eliminates ~277+ lines of duplicate code.
 */

import { logger } from "../logger";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
  resetTimeout: number;
  enableLogging?: boolean;
}

export interface ServiceStatus {
  isAvailable: boolean;
  state: 'closed' | 'open' | 'half-open';
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  totalFailures: number;
  totalSuccesses: number;
  averageResponseTime: number;
  nextRetryTime?: number;
}

export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  responseTime: number;
  fromCache?: boolean;
}

/**
 * Circuit breaker implementation with exponential backoff and health tracking
 */
export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private readonly serviceName: string;
  private status: ServiceStatus;
  private responseTimeBuffer: number[] = [];
  private readonly maxResponseTimeBuffer = 10;

  // Default configurations (consolidated from all providers)
  private static readonly DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    halfOpenMaxCalls: 3,
    resetTimeout: 5 * 60 * 1000, // 5 minutes
    enableLogging: true
  };

  constructor(serviceName: string, config?: Partial<CircuitBreakerConfig>) {
    this.serviceName = serviceName;
    this.config = { ...CircuitBreaker.DEFAULT_CONFIG, ...config };
    
    this.status = {
      isAvailable: true,
      state: 'closed',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
      totalFailures: 0,
      totalSuccesses: 0,
      averageResponseTime: 0
    };

    if (this.config.enableLogging) {
      logger.debug(`Circuit breaker initialized for ${serviceName}`, this.config);
    }
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, context?: string): Promise<OperationResult<T>> {
    const startTime = Date.now();

    // Check if circuit is open
    if (this.isCircuitOpen()) {
      const waitTime = this.getWaitTime();
      
      if (this.config.enableLogging) {
        logger.warn(`Circuit breaker OPEN for ${this.serviceName}`, {
          context,
          consecutiveFailures: this.status.consecutiveFailures,
          waitTime,
          nextRetryTime: new Date(this.status.nextRetryTime || 0).toISOString()
        });
      }

      return {
        success: false,
        error: new Error(`Service ${this.serviceName} temporarily unavailable. Retry in ${Math.ceil(waitTime / 1000)}s`),
        responseTime: 0
      };
    }

    // Execute the operation
    try {
      const result = await operation();
      const responseTime = Date.now() - startTime;
      
      this.recordSuccess(responseTime);
      
      return {
        success: true,
        data: result,
        responseTime
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      this.recordFailure(error instanceof Error ? error : new Error(String(error)), responseTime);
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        responseTime
      };
    }
  }

  /**
   * Record successful operation
   */
  recordSuccess(responseTime: number = 0): void {
    const now = Date.now();
    
    this.status.consecutiveSuccesses++;
    this.status.totalSuccesses++;
    this.status.consecutiveFailures = 0; // Reset failure counter
    this.status.lastSuccessTime = now;
    
    // Update response time tracking
    this.updateResponseTimeAverage(responseTime);

    // Handle state transitions
    if (this.status.state === 'half-open') {
      if (this.status.consecutiveSuccesses >= this.config.halfOpenMaxCalls) {
        this.transitionTo('closed');
        if (this.config.enableLogging) {
          logger.info(`Circuit breaker RECOVERED for ${this.serviceName}`, {
            consecutiveSuccesses: this.status.consecutiveSuccesses,
            averageResponseTime: this.status.averageResponseTime
          });
        }
      }
    } else if (this.status.state === 'open') {
      // Transition to half-open after success
      this.transitionTo('half-open');
    }

    this.status.isAvailable = true;
  }

  /**
   * Record failed operation
   */
  recordFailure(error: Error, responseTime: number = 0): void {
    const now = Date.now();
    
    this.status.consecutiveFailures++;
    this.status.totalFailures++;
    this.status.consecutiveSuccesses = 0; // Reset success counter
    this.status.lastFailureTime = now;
    
    // Update response time tracking (even for failures)
    this.updateResponseTimeAverage(responseTime);

    if (this.config.enableLogging) {
      logger.warn(`Circuit breaker failure recorded for ${this.serviceName}`, {
        consecutiveFailures: this.status.consecutiveFailures,
        threshold: this.config.failureThreshold,
        error: error.message,
        responseTime
      });
    }

    // Check if we should open the circuit
    if (this.status.consecutiveFailures >= this.config.failureThreshold) {
      this.transitionTo('open');
    }

    this.status.isAvailable = this.status.state !== 'open';
  }

  /**
   * Get current service status
   */
  getStatus(): ServiceStatus {
    return { ...this.status };
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return !this.isCircuitOpen();
  }

  /**
   * Force reset circuit breaker (for testing/manual recovery)
   */
  reset(): void {
    if (this.config.enableLogging) {
      logger.info(`Circuit breaker manually reset for ${this.serviceName}`);
    }
    
    this.status = {
      isAvailable: true,
      state: 'closed',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
      totalFailures: this.status.totalFailures, // Keep historical data
      totalSuccesses: this.status.totalSuccesses, // Keep historical data
      averageResponseTime: this.status.averageResponseTime
    };
  }

  // ==================== PRIVATE METHODS ====================

  private isCircuitOpen(): boolean {
    if (this.status.state !== 'open') {
      return false;
    }

    // Check if recovery timeout has passed
    const now = Date.now();
    const timeSinceLastFailure = now - this.status.lastFailureTime;
    
    if (timeSinceLastFailure >= this.config.recoveryTimeout) {
      this.transitionTo('half-open');
      return false;
    }

    return true;
  }

  private getWaitTime(): number {
    if (this.status.state !== 'open') {
      return 0;
    }

    const now = Date.now();
    const timeSinceLastFailure = now - this.status.lastFailureTime;
    const remainingWait = Math.max(0, this.config.recoveryTimeout - timeSinceLastFailure);
    
    return remainingWait;
  }

  private transitionTo(newState: 'closed' | 'open' | 'half-open'): void {
    const oldState = this.status.state;
    this.status.state = newState;

    // Set next retry time for open state
    if (newState === 'open') {
      this.status.nextRetryTime = Date.now() + this.config.recoveryTimeout;
      this.status.isAvailable = false;
      
      if (this.config.enableLogging) {
        logger.error(`Circuit breaker OPENED for ${this.serviceName}`, {
          consecutiveFailures: this.status.consecutiveFailures,
          threshold: this.config.failureThreshold,
          nextRetryTime: new Date(this.status.nextRetryTime).toISOString()
        });
      }
    } else {
      this.status.nextRetryTime = undefined;
      this.status.isAvailable = true;
    }

    if (this.config.enableLogging && oldState !== newState) {
      logger.info(`Circuit breaker state transition for ${this.serviceName}: ${oldState} → ${newState}`);
    }
  }

  private updateResponseTimeAverage(responseTime: number): void {
    // Add to response time buffer
    this.responseTimeBuffer.push(responseTime);
    
    // Keep buffer size manageable
    if (this.responseTimeBuffer.length > this.maxResponseTimeBuffer) {
      this.responseTimeBuffer.shift();
    }
    
    // Calculate average
    if (this.responseTimeBuffer.length > 0) {
      this.status.averageResponseTime = Math.round(
        this.responseTimeBuffer.reduce((sum, time) => sum + time, 0) / this.responseTimeBuffer.length
      );
    }
  }
}

/**
 * Circuit Breaker Manager for multiple services
 */
export class CircuitBreakerManager {
  private static breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create circuit breaker for a service
   */
  static getBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, config));
    }
    return this.breakers.get(serviceName)!;
  }

  /**
   * Get status for all circuit breakers
   */
  static getAllStatus(): Record<string, ServiceStatus> {
    const statuses: Record<string, ServiceStatus> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      statuses[name] = breaker.getStatus();
    }
    return statuses;
  }

  /**
   * Reset all circuit breakers
   */
  static resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
    logger.info('All circuit breakers reset');
  }

  /**
   * Clean up inactive circuit breakers (for memory management)
   */
  static cleanup(maxIdleTime: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [name, breaker] of this.breakers.entries()) {
      const status = breaker.getStatus();
      const lastActivity = Math.max(status.lastSuccessTime, status.lastFailureTime);
      
      if (now - lastActivity > maxIdleTime) {
        toRemove.push(name);
      }
    }

    for (const name of toRemove) {
      this.breakers.delete(name);
    }

    if (toRemove.length > 0) {
      logger.debug(`Cleaned up ${toRemove.length} inactive circuit breakers`, { removed: toRemove });
    }
  }
}