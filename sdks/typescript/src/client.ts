/**
 * Main EvalMatch SDK Client
 * Provides a convenient wrapper around the API with retry + circuit breaker
 * 
 * Note: API responses follow envelope pattern - access data via .data property:
 * - const result = await client.resumes.list();
 * - const resumes = result.data.resumes; // Access actual data via .data
 * - const matchResults = analysis.data.results; // Results are in .data envelope
 */

// Note: Using manual HTTP client with generated types for better control over retry logic

import type { AuthProvider, EvalMatchConfig, ClientOptions } from './types';
import type {
  Resume,
  JobDescription,
  PostAnalysisAnalyzeByJobIdResponses,
  PostAnalysisAnalyzeBiasByJobIdResponses,
  GetCreditsBalanceData,
  GetCreditsBalanceResponses,
  GetCreditsHistoryData,
  GetCreditsHistoryResponses,
  GetCreditsPackagesResponses,
  PostCreditsGrantBetaData,
  PostCreditsGrantBetaResponses,
  GetHealthResponses,
  GetSystemHealthResponses,
  GetUserProfileResponses
} from './generated/types.gen';

// Define typed response for analyzeText endpoint
export interface AnalyzeTextResponse {
  success: boolean;
  data: {
    matchPercentage: number;
    matchedSkills: string[];
    missingSkills: string[];
    candidateStrengths: string[];
    candidateWeaknesses: string[];
    confidenceLevel: string;
    recommendations: string[];
  };
  timestamp: string;
}

// Define types for jobs input
export interface JobDescriptionInput {
  title: string;
  description: string;
  requirements?: string[];
}

// Define types for batch upload
export interface BatchUploadResponse {
  batchId: string;
  message: string;
  results: {
    successful: Array<{
      filename: string;
      resumeId: number;
      fileSize: number;
      processingTime: number;
      hasAnalysis: boolean;
    }>;
    failed: Array<{
      filename: string;
      error: string;
      reason: string;
    }>;
  };
  summary: {
    totalFiles: number;
    successfulUploads: number;
    failedUploads: number;
    totalSize: number;
    processingTime: number;
  };
}

// Define types for token status
export interface TokenStatusResponse {
  success: boolean;
  data: {
    token: {
      id: string;
      name: string;
      partial: string;
      status: 'active' | 'expired' | 'revoked';
      permissions: string[];
      createdAt: string;
      expiresAt: string | null;
      lastUsedAt: string | null;
    };
    usage: {
      requestsToday: number;
      requestsThisMonth: number;
      totalRequests: number;
    };
  };
  timestamp: string;
}
import { RetryableHTTPClient, RetryConfig, CircuitBreakerConfig, CircuitBreakerState } from './core/retry-client';
import { ErrorFactory, EvalMatchError, CircuitBreakerError } from './core/errors';
import { createDefaultInterceptors } from './core/interceptors';

export class EvalMatchClient {
  private authProvider: AuthProvider;
  private config: Required<Omit<EvalMatchConfig, 'authProvider' | 'circuitBreaker'>> & { 
    authProvider: AuthProvider;
    circuitBreaker?: EvalMatchConfig['circuitBreaker'];
  };
  private httpClient: RetryableHTTPClient;

  constructor(config: EvalMatchConfig) {
    this.authProvider = config.authProvider;
    this.config = {
      baseUrl: config.baseUrl || 'https://evalmatch.app/api',
      timeout: config.timeout || 30000,
      headers: config.headers || {},
      debug: config.debug || false,
      retries: config.retries || 2,
      authProvider: config.authProvider,
      circuitBreaker: config.circuitBreaker
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
    if (this.httpClient.circuitBreakerState === CircuitBreakerState.OPEN) {
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
   * Enhanced request method with retry logic and configurable error handling
   */
  private async request<T>(config: any, options?: ClientOptions): Promise<T> {
    const throwOnError = options?.throwOnError !== false; // Default to true
    
    // Apply per-request options
    if (options?.signal) {
      config.signal = options.signal;
    }
    if (options?.timeout) {
      config.timeout = options.timeout;
    }
    
    try {
      const response = await this.httpClient.request<T>(config);
      return response.data as T;
    } catch (error) {
      if (!throwOnError) {
        // Return error envelope instead of throwing
        const evalMatchError = this.createError(error, config);
        return {
          success: false,
          error: {
            code: evalMatchError.code,
            message: evalMatchError.message,
            context: evalMatchError.context,
            recoveryActions: evalMatchError.recoveryActions,
            isRetryable: evalMatchError.isRetryable
          }
        } as any; // Cast needed for return type flexibility
      }
      
      this.handleError(error, config);
    }
  }

  /**
   * Create EvalMatchError without throwing (for error envelopes)
   */
  private createError(error: any, requestConfig?: any): EvalMatchError {
    // Check if circuit breaker is open
    if (this.httpClient.circuitBreakerState === CircuitBreakerState.OPEN) {
      return ErrorFactory.createCircuitBreakerError({
        circuitBreakerState: this.httpClient.circuitBreakerState,
        endpoint: requestConfig?.url,
        method: requestConfig?.method?.toUpperCase()
      });
    }

    // Use error factory for consistent error handling
    return ErrorFactory.createFromHttpError(error, {
      circuitBreakerState: this.httpClient.circuitBreakerState,
      endpoint: requestConfig?.url,
      method: requestConfig?.method?.toUpperCase()
    });
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
    list: async (options: ClientOptions = {}): Promise<Resume[]> => {
      const headers = await this.getAuthHeaders();
      return this.request<Resume[]>({
        method: 'GET',
        url: '/resumes',
        headers
      }, options);
    },

    /**
     * Upload a new resume
     * Supports File/Blob in browser, Buffer/Readable in Node.js
     */
    upload: async (file: File | Blob | Buffer | any, options: ClientOptions = {}): Promise<Resume> => {
      const headers = await this.getAuthHeaders();
      
      // Browser environment
      if (typeof window !== 'undefined' && typeof FormData !== 'undefined' && (file instanceof Blob || file instanceof File)) {
        const formData = new FormData();
        formData.append('file', file);
        
        return this.request<Resume>({
          method: 'POST',
          url: '/resumes',
          data: formData,
          headers
        }, options);
      }
      
      // Node.js environment - use form-data polyfill
      try {
        const FormDataPolyfill = (await import('form-data')).default;
        const formData = new FormDataPolyfill();
        
        if (Buffer.isBuffer(file)) {
          formData.append('file', file, { filename: 'resume.pdf' });
        } else if (file && typeof file.pipe === 'function') {
          // Readable stream
          formData.append('file', file, { filename: 'resume.pdf' });
        } else {
          throw new Error('Unsupported file type for Node.js upload. Use Buffer or Readable stream.');
        }
        
        // Merge form headers (including boundary) with auth headers
        const nodeHeaders = { ...headers, ...formData.getHeaders() };
        
        return this.request<Resume>({
          method: 'POST',
          url: '/resumes',
          data: formData,
          headers: nodeHeaders
        }, options);
      } catch (error) {
        if (error instanceof Error && error.message.includes('form-data')) {
          throw new Error('form-data package required for Node.js uploads. Install with: npm install form-data');
        }
        throw error;
      }
    },

    /**
     * Get specific resume by ID
     */
    get: async (id: number, options: ClientOptions = {}): Promise<Resume> => {
      const headers = await this.getAuthHeaders();
      return this.request<Resume>({
        method: 'GET',
        url: `/resumes/${id}`,
        headers
      }, options);
    },

    /**
     * Upload multiple resumes in batch
     * Supports File/Blob arrays in browser, Buffer/Readable arrays in Node.js
     */
    uploadBatch: async (files: (File | Blob | Buffer | any)[], options: ClientOptions = {}): Promise<BatchUploadResponse> => {
      const headers = await this.getAuthHeaders();
      
      // Browser environment
      if (typeof window !== 'undefined' && typeof FormData !== 'undefined') {
        const formData = new FormData();
        files.forEach((file, index) => {
          if (file instanceof Blob || file instanceof File) {
            formData.append('files', file);
          } else {
            throw new Error(`File at index ${index} is not a valid Blob or File`);
          }
        });
        
        const response = await this.request<{ success: boolean; data: BatchUploadResponse; timestamp: string }>({
          method: 'POST',
          url: '/resumes/batch',
          data: formData,
          headers
        }, options);
        
        return response.data;
      }
      
      // Node.js environment - use form-data polyfill
      try {
        const FormDataPolyfill = (await import('form-data')).default;
        const formData = new FormDataPolyfill();
        
        files.forEach((file, index) => {
          if (Buffer.isBuffer(file)) {
            formData.append('files', file, { filename: `resume_${index}.pdf` });
          } else if (file && typeof file.pipe === 'function') {
            // Readable stream
            formData.append('files', file, { filename: `resume_${index}.pdf` });
          } else {
            throw new Error(`File at index ${index} is not a valid Buffer or Readable stream`);
          }
        });
        
        // Merge form headers (including boundary) with auth headers
        const nodeHeaders = { ...headers, ...formData.getHeaders() };
        
        const response = await this.request<{ success: boolean; data: BatchUploadResponse; timestamp: string }>({
          method: 'POST',
          url: '/resumes/batch',
          data: formData,
          headers: nodeHeaders
        }, options);
        
        return response.data;
      } catch (error) {
        if (error instanceof Error && error.message.includes('form-data')) {
          throw new Error('form-data package required for Node.js batch uploads. Install with: npm install form-data');
        }
        throw error;
      }
    }
  };

  /**
   * Job Description Management
   */
  public jobs = {
    /**
     * Create a new job description
     */
    create: async (data: JobDescriptionInput, options: ClientOptions = {}): Promise<JobDescription> => {
      const headers = await this.getAuthHeaders();
      return this.request<JobDescription>({
        method: 'POST',
        url: '/job-descriptions',
        data,
        headers
      }, options);
    },

    /**
     * List user's job descriptions
     */
    list: async (options: ClientOptions = {}): Promise<JobDescription[]> => {
      const headers = await this.getAuthHeaders();
      return this.request<JobDescription[]>({
        method: 'GET',
        url: '/job-descriptions',
        headers
      }, options);
    },

    /**
     * Get specific job description by ID
     */
    get: async (id: number, options: ClientOptions = {}): Promise<JobDescription> => {
      const headers = await this.getAuthHeaders();
      return this.request<JobDescription>({
        method: 'GET',
        url: `/job-descriptions/${id}`,
        headers
      }, options);
    },

    /**
     * Update job description
     */
    update: async (id: number, data: Partial<JobDescriptionInput>, options: ClientOptions = {}): Promise<JobDescription> => {
      const headers = await this.getAuthHeaders();
      return this.request<JobDescription>({
        method: 'PATCH',
        url: `/job-descriptions/${id}`,
        data,
        headers
      }, options);
    },

    /**
     * Delete job description
     */
    delete: async (id: number, options: ClientOptions = {}): Promise<{ success: boolean }> => {
      const headers = await this.getAuthHeaders();
      return this.request<{ success: boolean }>({
        method: 'DELETE',
        url: `/job-descriptions/${id}`,
        headers
      }, options);
    }
  };

  /**
   * AI Analysis
   */
  public analysis = {
    /**
     * Analyze resumes against a job description
     */
    analyze: async (jobId: number, resumeIds?: number[], options: ClientOptions = {}): Promise<PostAnalysisAnalyzeByJobIdResponses[200]> => {
      const headers = await this.getAuthHeaders();
      return this.request<PostAnalysisAnalyzeByJobIdResponses[200]>({
        method: 'POST',
        url: `/analysis/analyze/${jobId}`,
        data: resumeIds ? { resumeIds } : {},
        headers
      }, options);
    },

    /**
     * Analyze job description for bias
     */
    analyzeBias: async (jobId: number, options: ClientOptions = {}): Promise<PostAnalysisAnalyzeBiasByJobIdResponses[200]> => {
      const headers = await this.getAuthHeaders();
      return this.request<PostAnalysisAnalyzeBiasByJobIdResponses[200]>({
        method: 'POST',
        url: `/analysis/analyze-bias/${jobId}`,
        data: {},
        headers
      }, options);
    },

    /**
     * Analyze resume text directly against job description text
     * Returns typed response with match percentage and skill analysis
     */
    analyzeText: async (data: { resumeText: string; jobDescriptionText: string }, options: ClientOptions = {}): Promise<AnalyzeTextResponse> => {
      const headers = await this.getAuthHeaders();
      return this.request<AnalyzeTextResponse>({
        method: 'POST',
        url: '/analysis/analyze-text',
        data,
        headers
      }, options);
    }
  };

  /**
   * Credits management API
   */
  public credits = {
    /**
     * Get user's credit balance and tier information
     */
    balance: async (options?: ClientOptions): Promise<GetCreditsBalanceResponses[200]> => {
      const headers = await this.getAuthHeaders();
      return this.request<GetCreditsBalanceResponses[200]>({
        method: 'GET',
        url: '/credits/balance',
        headers
      }, options);
    },

    /**
     * Get user's credit transaction history
     */
    history: async (params?: GetCreditsHistoryData['query'], options?: ClientOptions): Promise<GetCreditsHistoryResponses[200]> => {
      const headers = await this.getAuthHeaders();
      return this.request<GetCreditsHistoryResponses[200]>({
        method: 'GET',
        url: '/credits/history',
        params,
        headers
      }, options);
    },

    /**
     * Get available credit packages for purchase
     */
    packages: async (options?: ClientOptions): Promise<GetCreditsPackagesResponses[200]> => {
      const headers = await this.getAuthHeaders();
      return this.request<GetCreditsPackagesResponses[200]>({
        method: 'GET',
        url: '/credits/packages',
        headers
      }, options);
    },

    /**
     * Grant beta credits to user (requires authentication)
     */
    grantBeta: async (body?: PostCreditsGrantBetaData['body'], options?: ClientOptions): Promise<PostCreditsGrantBetaResponses[200]> => {
      const headers = await this.getAuthHeaders();
      return this.request<PostCreditsGrantBetaResponses[200]>({
        method: 'POST',
        url: '/credits/grant-beta',
        data: body || {},
        headers
      }, options);
    }
  };

  /**
   * User management API
   */
  public user = {
    /**
     * Get current user profile information
     */
    profile: async (options: ClientOptions = {}): Promise<GetUserProfileResponses[200]> => {
      const headers = await this.getAuthHeaders();
      return this.request<GetUserProfileResponses[200]>({
        method: 'GET',
        url: '/user/profile',
        headers
      }, options);
    }
  };

  /**
   * Token management API
   */
  public tokens = {
    /**
     * Get status information for the current API token
     * Requires API token authentication (not Firebase JWT)
     */
    statusByToken: async (options: ClientOptions = {}): Promise<TokenStatusResponse> => {
      const headers = await this.getAuthHeaders();
      return this.request<TokenStatusResponse>({
        method: 'GET',
        url: '/v1/tokens/status/by-token',
        headers
      }, options);
    }
  };

  /**
   * Health and system status API
   */
  public health = {
    /**
     * Get basic service health status
     */
    status: async (options?: ClientOptions): Promise<GetHealthResponses[200]> => {
      return this.request<GetHealthResponses[200]>({
        method: 'GET',
        url: '/health'
      }, options);
    },

    /**
     * Get detailed system health information
     */
    systemHealth: async (options?: ClientOptions): Promise<GetSystemHealthResponses[200]> => {
      return this.request<GetSystemHealthResponses[200]>({
        method: 'GET',
        url: '/system-health'
      }, options);
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
}
