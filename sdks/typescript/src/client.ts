/**
 * Main EvalMatch SDK Client
 * Provides a convenient wrapper around the generated API client with advanced error handling
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

interface Resume {
  id: number;
  filename: string;
  status: string;
  skills?: string[];
  uploadedAt: string;
}

interface JobDescription {
  id: number;
  title: string;
  description: string;
  requirements: string[];
  createdAt: string;
}

interface AnalysisResult {
  overallScore: number;
  skillsMatch: {
    matched: string[];
    missing: string[];
  };
  recommendations: string[];
}

interface BiasAnalysisResult {
  biasScore: number;
  riskLevel: string;
  issues: string[];
  suggestions: string[];
}

import {
  postAnalysisAnalyzeByJobId,
  postAnalysisAnalyzeBiasByJobId,
  postJobDescriptions,
  getResumes,
  postResumes,
  getResumesById
} from './generated/sdk.gen';

import type { AuthProvider, EvalMatchConfig, ClientOptions } from './types';
import { RetryableHTTPClient, RetryConfig, CircuitBreakerConfig } from './core/retry-client';
import { ErrorFactory, EvalMatchError, CircuitBreakerError } from './core/errors';
import { createDefaultInterceptors } from './core/interceptors';
import { CacheInterceptor, CacheInterceptorConfig } from './core/cache-interceptor';

export class EvalMatchClient {
  private authProvider: AuthProvider;
  private config: Required<Omit<EvalMatchConfig, 'authProvider' | 'circuitBreaker' | 'cache'>> & { 
    authProvider: AuthProvider;
    circuitBreaker?: EvalMatchConfig['circuitBreaker'];
    cache?: EvalMatchConfig['cache'];
  };
  private httpClient: RetryableHTTPClient;
  private cacheInterceptor?: CacheInterceptor;

  constructor(config: EvalMatchConfig) {
    this.authProvider = config.authProvider;
    this.config = {
      baseUrl: config.baseUrl || 'https://evalmatch.app/api',
      timeout: config.timeout || 30000,
      headers: config.headers || {},
      debug: config.debug || false,
      retries: config.retries || 2,
      authProvider: config.authProvider,
      circuitBreaker: config.circuitBreaker,
      cache: config.cache
    };

    // Initialize HTTP client with retry logic and circuit breaker
    const retryConfig: RetryConfig = {
      maxAttempts: (config.retries || 2) + 1, // retries + 1 initial attempt
      baseDelay: 100,
      maxDelay: 5000,
      backoffFactor: 2,
      retryCondition: (error: any) => {
        // Custom retry logic for EvalMatch API
        if (error.response) {
          const status = error.response.status;
          return status >= 500 || status === 429 || status === 408;
        }
        return true; // Retry network errors
      }
    };

    const circuitBreakerConfig: CircuitBreakerConfig = {
      threshold: config.circuitBreaker?.threshold || 5,
      timeout: config.circuitBreaker?.timeout || 30000, // 30 seconds
      monitoringPeriod: 10000
    };

    this.httpClient = new RetryableHTTPClient(
      {
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        headers: this.config.headers
      },
      retryConfig,
      circuitBreakerConfig
    );

    // Initialize cache interceptor if caching is enabled
    if (this.config.cache?.enabled !== false) {
      this.cacheInterceptor = new CacheInterceptor({
        enabled: true,
        cacheOptions: this.config.cache?.memory || this.config.cache?.persistent ? {
          memoryMaxSize: this.config.cache.memory?.maxSize || 100,
          memoryMaxBytes: this.config.cache.memory?.maxBytes || 10 * 1024 * 1024,
          persistentMaxSize: this.config.cache.persistent?.maxSize || 1000,
          persistentMaxBytes: this.config.cache.persistent?.maxBytes || 50 * 1024 * 1024,
          defaultTTL: this.config.cache.defaultTTL || 300000,
          enablePersistence: this.config.cache.persistent?.enabled !== false
        } : undefined,
        debug: this.config.cache?.debug || this.config.debug
      });
    }

    // Setup default interceptors
    this.setupDefaultInterceptors();
  }

  /**
   * Setup default interceptors for the client
   */
  private setupDefaultInterceptors(): void {
    const { requestInterceptors, responseInterceptors, errorInterceptors } = 
      createDefaultInterceptors(
        () => this.authProvider.getToken(),
        this.config.debug
      );

    // Add cache interceptors first (if enabled)
    if (this.cacheInterceptor) {
      this.httpClient.interceptors.addRequestInterceptor(
        this.cacheInterceptor.createRequestInterceptor()
      );
      this.httpClient.interceptors.addResponseInterceptor(
        this.cacheInterceptor.createResponseInterceptor()
      );
    }

    // Add all default interceptors
    requestInterceptors.forEach(interceptor => {
      this.httpClient.interceptors.addRequestInterceptor(interceptor);
    });

    responseInterceptors.forEach(interceptor => {
      this.httpClient.interceptors.addResponseInterceptor(interceptor);
    });

    errorInterceptors.forEach(interceptor => {
      this.httpClient.interceptors.addErrorInterceptor(interceptor);
    });
  }

  /**
   * Get authentication headers for requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authProvider.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Handle API errors consistently using enhanced error factory
   */
  private handleError(error: any, requestConfig?: any): never {
    // Check if circuit breaker is open
    if (this.httpClient.circuitBreakerState === 'open') {
      throw ErrorFactory.createCircuitBreakerError({
        circuitBreakerState: this.httpClient.circuitBreakerState,
        endpoint: requestConfig?.url,
        method: requestConfig?.method?.toUpperCase()
      });
    }

    // Use error factory for consistent error handling
    throw ErrorFactory.createFromHttpError(error, {
      circuitBreakerState: this.httpClient.circuitBreakerState,
      endpoint: requestConfig?.url,
      method: requestConfig?.method?.toUpperCase()
    });
  }

  /**
   * Enhanced request method with retry logic
   */
  private async request<T>(config: any): Promise<T> {
    try {
      const response = await this.httpClient.request(config);
      return response.data as T;
    } catch (error) {
      this.handleError(error, config);
    }
  }

  /**
   * Expose internal request method for testing
   */
  public async _internalRequest<T>(config: any): Promise<T> {
    return this.request(config);
  }

  /**
   * Resume Management
   */
  public resumes = {
    /**
     * List user's resumes
     */
    list: async (options: ClientOptions = {}): Promise<ApiResponse<Resume[]>> => {
      const headers = await this.getAuthHeaders();
      return this.request({
        method: 'GET',
        url: '/resumes',
        headers
      });
    },

    /**
     * Upload a new resume
     */
    upload: async (file: File | Blob, options: ClientOptions = {}): Promise<ApiResponse<Resume>> => {
      const headers = await this.getAuthHeaders();
      const formData = new FormData();
      formData.append('file', file);
      
      return this.request({
        method: 'POST',
        url: '/resumes',
        data: formData,
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data'
        }
      });
    },

    /**
     * Get specific resume by ID
     */
    get: async (id: number, options: ClientOptions = {}): Promise<ApiResponse<Resume>> => {
      const headers = await this.getAuthHeaders();
      return this.request({
        method: 'GET',
        url: `/resumes/${id}`,
        headers
      });
    }
  };

  /**
   * Job Description Management
   */
  public jobs = {
    /**
     * Create a new job description
     */
    create: async (data: { title: string; description: string; requirements?: string[] }, options: ClientOptions = {}): Promise<ApiResponse<JobDescription>> => {
      const headers = await this.getAuthHeaders();
      return this.request({
        method: 'POST',
        url: '/job-descriptions',
        data,
        headers
      });
    }
  };

  /**
   * AI Analysis
   */
  public analysis = {
    /**
     * Analyze resumes against a job description
     */
    analyze: async (jobId: number, resumeIds?: number[], options: ClientOptions = {}): Promise<ApiResponse<AnalysisResult>> => {
      const headers = await this.getAuthHeaders();
      return this.request({
        method: 'POST',
        url: `/analysis/analyze/${jobId}`,
        data: resumeIds ? { resumeIds } : {},
        headers
      });
    },

    /**
     * Analyze job description for bias
     */
    analyzeBias: async (jobId: number, options: ClientOptions = {}): Promise<ApiResponse<BiasAnalysisResult>> => {
      const headers = await this.getAuthHeaders();
      return this.request({
        method: 'POST',
        url: `/analysis/analyze-bias/${jobId}`,
        data: {},
        headers
      });
    }
  };

  /**
   * Check if client is authenticated
   */
  public async isAuthenticated(): Promise<boolean> {
    return this.authProvider.isAuthenticated();
  }

  /**
   * Get current configuration
   */
  public getConfig(): Readonly<EvalMatchConfig> {
    return { ...this.config };
  }

  /**
   * Get interceptor manager for advanced customization
   */
  public getInterceptors() {
    return this.httpClient.interceptors;
  }

  /**
   * Get circuit breaker state for monitoring
   */
  public getCircuitBreakerState() {
    return this.httpClient.circuitBreakerState;
  }

  /**
   * Cache Management Methods
   */

  /**
   * Get cache performance metrics
   */
  public getCacheMetrics() {
    return this.cacheInterceptor?.getMetrics() || null;
  }

  /**
   * Clear all cache (both memory and persistent)
   */
  public async clearCache(): Promise<void> {
    if (this.cacheInterceptor) {
      await this.cacheInterceptor.clearCache();
    }
  }

  /**
   * Invalidate specific cache entry
   */
  public async invalidateCache(key: string): Promise<boolean> {
    if (this.cacheInterceptor) {
      return this.cacheInterceptor.invalidateCache(key);
    }
    return false;
  }

  /**
   * Invalidate cache entries by pattern
   */
  public async invalidateCacheByPattern(pattern: string | RegExp): Promise<number> {
    if (this.cacheInterceptor) {
      return this.cacheInterceptor.invalidateCacheByPattern(pattern);
    }
    return 0;
  }

  /**
   * Preload data into cache
   */
  public async preloadCache(key: string, data: any, ttl?: number): Promise<void> {
    if (this.cacheInterceptor) {
      await this.cacheInterceptor.preloadCache(key, data, ttl);
    }
  }

  /**
   * Check if cache is enabled
   */
  public isCacheEnabled(): boolean {
    return this.cacheInterceptor?.isEnabled() || false;
  }

  /**
   * Enable/disable cache
   */
  public setCacheEnabled(enabled: boolean): void {
    if (this.cacheInterceptor) {
      this.cacheInterceptor.setEnabled(enabled);
    }
  }
}