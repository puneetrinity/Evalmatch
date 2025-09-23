/**
 * Request/Response Interceptor System for EvalMatch SDK
 * Provides middleware-style interceptors for HTTP requests/responses
 */

import { AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios'

export interface RequestContext {
  requestId: string
  startTime: number
  userId?: string
  traceId?: string
  metadata?: Record<string, any>
}

export interface ResponseContext extends RequestContext {
  duration: number
  statusCode?: number
  endpoint?: string
  method?: string
}

// Interceptor function types
export type RequestInterceptor = (
  config: AxiosRequestConfig,
  context: RequestContext
) => AxiosRequestConfig | Promise<AxiosRequestConfig>

export type ResponseInterceptor = (
  response: AxiosResponse,
  context: ResponseContext
) => AxiosResponse | Promise<AxiosResponse>

export type ErrorInterceptor = (
  error: AxiosError,
  context: ResponseContext
) => Promise<never>

// Built-in interceptors
export class BuiltInInterceptors {
  /**
   * Request ID interceptor - adds unique request ID to every request
   */
  static requestId(): RequestInterceptor {
    return (config, context) => {
      config.headers = config.headers || {}
      config.headers['X-Request-ID'] = context.requestId
      return config
    }
  }

  /**
   * User Agent interceptor - adds SDK user agent
   */
  static userAgent(version: string = '1.0.0'): RequestInterceptor {
    return (config) => {
      config.headers = config.headers || {}
      // Avoid forbidden User-Agent header in browsers; use a custom header instead
      config.headers['X-EvalMatch-Client'] = `EvalMatch-SDK/${version} (TypeScript)`
      return config
    }
  }

  /**
   * Timeout interceptor - ensures consistent timeout handling
   */
  static timeout(defaultTimeout: number = 30000): RequestInterceptor {
    return (config) => {
      config.timeout = config.timeout || defaultTimeout
      return config
    }
  }

  /**
   * Authentication interceptor - adds auth token if available
   */
  static authentication(getToken: () => Promise<string | null>): RequestInterceptor {
    return async (config) => {
      const token = await getToken()
      if (token) {
        config.headers = config.headers || {}
        config.headers['Authorization'] = `Bearer ${token}`
      }
      return config
    }
  }

  /**
   * Content type interceptor - sets proper content types
   */
  static contentType(): RequestInterceptor {
    return (config) => {
      if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
        config.headers = config.headers || {}
        config.headers['Content-Type'] = config.headers['Content-Type'] || 'application/json'
      }
      return config
    }
  }

  /**
   * Data extraction interceptor - extracts data from API response envelope
   */
  static dataExtraction(): ResponseInterceptor {
    return (response, context) => {
      // Extract data from envelope if present
      if (response.data && typeof response.data === 'object' && 'success' in response.data && 'data' in response.data) {
        // This is an API envelope response, extract the data
        response.data = response.data.data
      }
      return response
    }
  }

  /**
   * Response timing interceptor - logs response times
   */
  static responseTiming(): ResponseInterceptor {
    return (response, context) => {
      if (context.duration > 1000) {
        console.warn(`Slow API response: ${context.method} ${context.endpoint} took ${context.duration}ms`)
      }
      return response
    }
  }

  /**
   * Error logging interceptor - logs detailed error information
   */
  static errorLogging(debug = false): ErrorInterceptor {
    return async (error, context) => {
      if (debug) {
        console.error('API Error Details:', {
          requestId: context.requestId,
          method: context.method,
          endpoint: context.endpoint,
          duration: context.duration,
          statusCode: error.response?.status,
          error: error.message,
          data: error.response?.data
        })
      }
      
      throw error
    }
  }

  /**
   * Rate limit interceptor - logs 429 responses and passes metadata to retry client
   */
  static rateLimitLogging(): ErrorInterceptor {
    return async (error, context) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after']
        const retryCount = context.metadata?.retryCount || 0
        
        // Log rate limit event (retry client will handle the actual retry delay)
        console.log(`Rate limited. Server requested ${retryAfter}s delay (attempt ${retryCount + 1})`)
        
        // Pass retry metadata to help retry client make better decisions
        if (context.metadata) {
          context.metadata.rateLimited = true
          context.metadata.retryAfter = retryAfter
        }
      }
      
      throw error
    }
  }
}

/**
 * Interceptor Manager - manages request/response interceptors
 */
export class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = []
  private responseInterceptors: ResponseInterceptor[] = []
  private errorInterceptors: ErrorInterceptor[] = []

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor)
    
    // Return unsubscribe function
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor)
      if (index > -1) {
        this.requestInterceptors.splice(index, 1)
      }
    }
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor)
    
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor)
      if (index > -1) {
        this.responseInterceptors.splice(index, 1)
      }
    }
  }

  /**
   * Add an error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor)
    
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor)
      if (index > -1) {
        this.errorInterceptors.splice(index, 1)
      }
    }
  }

  /**
   * Process request through all request interceptors
   */
  async processRequest(config: AxiosRequestConfig, context: RequestContext): Promise<AxiosRequestConfig> {
    let processedConfig = config
    
    for (const interceptor of this.requestInterceptors) {
      processedConfig = await interceptor(processedConfig, context)
    }
    
    return processedConfig
  }

  /**
   * Process response through all response interceptors
   */
  async processResponse(response: AxiosResponse, context: ResponseContext): Promise<AxiosResponse> {
    let processedResponse = response
    
    for (const interceptor of this.responseInterceptors) {
      processedResponse = await interceptor(processedResponse, context)
    }
    
    return processedResponse
  }

  /**
   * Process error through all error interceptors
   */
  async processError(error: AxiosError, context: ResponseContext): Promise<never> {
    for (const interceptor of this.errorInterceptors) {
      await interceptor(error, context)
    }
    
    // If we reach here, no interceptor handled the error
    throw error
  }

  /**
   * Clear all interceptors
   */
  clear(): void {
    this.requestInterceptors = []
    this.responseInterceptors = []
    this.errorInterceptors = []
  }

  /**
   * Get interceptor counts (for debugging)
   */
  getCounts(): { request: number; response: number; error: number } {
    return {
      request: this.requestInterceptors.length,
      response: this.responseInterceptors.length,
      error: this.errorInterceptors.length
    }
  }
}

/**
 * Default interceptor configuration for EvalMatch SDK
 */
export function createDefaultInterceptors(
  getToken: () => Promise<string | null>,
  debug = false,
  unwrapEnvelope = true
): {
  requestInterceptors: RequestInterceptor[]
  responseInterceptors: ResponseInterceptor[]
  errorInterceptors: ErrorInterceptor[]
} {
  const responseInterceptors = [
    BuiltInInterceptors.responseTiming()
  ];
  
  // Only add data extraction if unwrapEnvelope is enabled
  if (unwrapEnvelope) {
    responseInterceptors.unshift(BuiltInInterceptors.dataExtraction());
  }
  
  return {
    requestInterceptors: [
      BuiltInInterceptors.requestId(),
      BuiltInInterceptors.userAgent(),
      BuiltInInterceptors.timeout(),
      BuiltInInterceptors.authentication(getToken),
      BuiltInInterceptors.contentType()
    ],
    responseInterceptors,
    errorInterceptors: [
      BuiltInInterceptors.errorLogging(debug),
      BuiltInInterceptors.rateLimitLogging()
    ]
  }
}
