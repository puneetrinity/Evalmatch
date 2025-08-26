/**
 * Advanced HTTP Client with Retry Logic and Circuit Breaker
 * Implements exponential backoff and failure handling
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'
import { InterceptorManager, RequestContext, ResponseContext } from './interceptors'

export interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffFactor: number
  retryCondition?: (error: any) => boolean
}

export interface CircuitBreakerConfig {
  threshold: number
  timeout: number
  monitoringPeriod: number
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open', 
  HALF_OPEN = 'half-open'
}

export class CircuitBreaker {
  private state = CircuitBreakerState.CLOSED
  private failureCount = 0
  private lastFailureTime = 0
  private successCount = 0

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        this.state = CircuitBreakerState.HALF_OPEN
        this.successCount = 0
      } else {
        throw new Error('Circuit breaker is open - service unavailable')
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= 3) { // Require 3 successes to close
        this.reset()
      }
    } else {
      this.failureCount = 0
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.config.threshold) {
      this.state = CircuitBreakerState.OPEN
    }
  }

  private reset(): void {
    this.state = CircuitBreakerState.CLOSED
    this.failureCount = 0
    this.successCount = 0
  }

  getState(): CircuitBreakerState {
    return this.state
  }
}

export class RetryableHTTPClient {
  private httpClient: AxiosInstance
  private circuitBreaker: CircuitBreaker
  private interceptorManager: InterceptorManager

  constructor(
    baseConfig: AxiosRequestConfig,
    private retryConfig: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 5000,
      backoffFactor: 2
    },
    circuitBreakerConfig: CircuitBreakerConfig = {
      threshold: 5,
      timeout: 60000,
      monitoringPeriod: 10000
    }
  ) {
    this.httpClient = axios.create(baseConfig)
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig)
    this.interceptorManager = new InterceptorManager()
    
    this.setupInterceptors()
  }

  private setupInterceptors(): void {
    // Request interceptor for adding request metadata and processing through interceptor manager
    this.httpClient.interceptors.request.use(
      async (config) => {
        const context: RequestContext = {
          requestId: this.generateRequestId(),
          startTime: Date.now()
        }
        
        config.metadata = context
        
        // Process through interceptor manager
        const processedConfig = await this.interceptorManager.processRequest(config, context)
        return processedConfig as any
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor for timing, processing, and error enrichment
    this.httpClient.interceptors.response.use(
      async (response) => {
        const requestTime = Date.now() - (response.config.metadata?.startTime || Date.now())
        
        const context: ResponseContext = {
          requestId: response.config.metadata?.requestId || 'unknown',
          startTime: response.config.metadata?.startTime || Date.now(),
          duration: requestTime,
          statusCode: response.status,
          endpoint: response.config.url,
          method: response.config.method?.toUpperCase()
        }
        
        // Update metadata
        response.config.metadata = context
        
        // Process through interceptor manager
        const processedResponse = await this.interceptorManager.processResponse(response, context)
        return processedResponse
      },
      async (error) => {
        const requestTime = error.config?.metadata?.startTime 
          ? Date.now() - error.config.metadata.startTime 
          : 0
        
        const context: ResponseContext = {
          ...error.config?.metadata,
          requestId: error.config?.metadata?.requestId || 'unknown',
          startTime: error.config?.metadata?.startTime || Date.now(),
          duration: requestTime,
          statusCode: error.response?.status,
          endpoint: error.config?.url,
          method: error.config?.method?.toUpperCase()
        }
        
        if (error.config?.metadata) {
          error.config.metadata.duration = requestTime
        }

        // Process through interceptor manager
        try {
          await this.interceptorManager.processError(error, context)
        } catch (processedError) {
          return Promise.reject(this.enrichError(processedError))
        }
        
        return Promise.reject(this.enrichError(error))
      }
    )
  }

  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.circuitBreaker.execute(() => 
      this.retryWithBackoff(() => this.httpClient.request(config))
    )
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: any

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error

        // Don't retry if it's not a retryable error
        if (!this.isRetryableError(error)) {
          throw error
        }

        // Don't retry on the last attempt
        if (attempt === this.retryConfig.maxAttempts - 1) {
          throw this.enrichError(error, attempt + 1)
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
          this.retryConfig.maxDelay
        )

        // Add jitter to prevent thundering herd
        const jitteredDelay = delay + Math.random() * 100

        await this.sleep(jitteredDelay)
      }
    }

    throw lastError
  }

  private isRetryableError(error: any): boolean {
    if (this.retryConfig.retryCondition) {
      return this.retryConfig.retryCondition(error)
    }

    // Default retry conditions
    if (axios.isAxiosError(error)) {
      // Network errors
      if (!error.response) {
        return true
      }

      // Server errors (5xx) and rate limiting (429)
      const status = error.response.status
      return status >= 500 || status === 429 || status === 408
    }

    return false
  }

  private enrichError(error: any, attempts = 1): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError
      
      // Create enhanced error with context
      const enhancedError = new Error(
        `HTTP ${axiosError.response?.status || 'Network'} Error: ${
          axiosError.message
        } (after ${attempts} attempts)`
      )

      // Add error context
      Object.assign(enhancedError, {
        name: 'HTTPError',
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        requestId: axiosError.config?.metadata?.requestId,
        duration: axiosError.config?.metadata?.duration,
        attempts,
        originalError: error,
        circuitBreakerState: this.circuitBreaker.getState()
      })

      return enhancedError
    }

    return error
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Getter for the underlying axios instance (for advanced configuration)
  get instance(): AxiosInstance {
    return this.httpClient
  }

  // Getter for circuit breaker state (for monitoring)
  get circuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState()
  }

  // Getter for interceptor manager (for advanced configuration)
  get interceptors(): InterceptorManager {
    return this.interceptorManager
  }
}

// Type augmentation for axios config metadata
declare module 'axios' {
  interface AxiosRequestConfig {
    metadata?: {
      startTime?: number
      requestId?: string
      duration?: number
    }
  }
}