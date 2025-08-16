/**
 * Main EvalMatch SDK Client
 * Provides a convenient wrapper around the generated API client
 */

import {
  postAnalysisAnalyzeByJobId,
  postAnalysisAnalyzeBiasByJobId,
  postJobDescriptions,
  getResumes,
  postResumes,
  getResumesById
} from './generated/sdk.gen';

import type { AuthProvider, EvalMatchConfig, ClientOptions } from './types';
import { EvalMatchError, ValidationError, AuthenticationError, RateLimitError, ServerError } from './errors';

export class EvalMatchClient {
  private authProvider: AuthProvider;
  private config: Required<Omit<EvalMatchConfig, 'authProvider'>> & { authProvider: AuthProvider };

  constructor(config: EvalMatchConfig) {
    this.authProvider = config.authProvider;
    this.config = {
      baseUrl: config.baseUrl || 'https://evalmatch.app/api',
      timeout: config.timeout || 30000,
      headers: config.headers || {},
      debug: config.debug || false,
      authProvider: config.authProvider
    };
  }

  /**
   * Get authentication headers for requests
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.authProvider.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /**
   * Handle API errors consistently
   */
  private handleError(error: any): never {
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 400:
          throw new ValidationError(data?.error?.message || 'Validation failed', data?.error?.details);
        case 401:
          throw new AuthenticationError(data?.error?.message);
        case 429:
          const retryAfter = error.response.headers['x-ratelimit-reset'];
          throw new RateLimitError(data?.error?.message || 'Rate limit exceeded', retryAfter);
        case 500:
          throw new ServerError(data?.error?.message);
        default:
          throw new EvalMatchError(
            data?.error?.message || 'API request failed',
            data?.error?.code || 'API_ERROR',
            status,
            data?.error?.details
          );
      }
    }
    
    throw new EvalMatchError('Network error', 'NETWORK_ERROR');
  }

  /**
   * Resume Management
   */
  public resumes = {
    /**
     * List user's resumes
     */
    list: async (options: ClientOptions = {}) => {
      try {
        const headers = await this.getAuthHeaders();
        return await getResumes({ 
          headers,
          throwOnError: options.throwOnError ?? true 
        });
      } catch (error) {
        this.handleError(error);
      }
    },

    /**
     * Upload a new resume
     */
    upload: async (file: File | Blob, options: ClientOptions = {}) => {
      try {
        const headers = await this.getAuthHeaders();
        return await postResumes({ 
          body: { file },
          headers,
          throwOnError: options.throwOnError ?? true 
        });
      } catch (error) {
        this.handleError(error);
      }
    },

    /**
     * Get specific resume by ID
     */
    get: async (id: number, options: ClientOptions = {}) => {
      try {
        const headers = await this.getAuthHeaders();
        return await getResumesById({ 
          path: { id },
          headers,
          throwOnError: options.throwOnError ?? true 
        });
      } catch (error) {
        this.handleError(error);
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
    create: async (data: { title: string; description: string; requirements?: string[] }, options: ClientOptions = {}) => {
      try {
        const headers = await this.getAuthHeaders();
        return await postJobDescriptions({
          body: data,
          headers,
          throwOnError: options.throwOnError ?? true
        });
      } catch (error) {
        this.handleError(error);
      }
    }
  };

  /**
   * AI Analysis
   */
  public analysis = {
    /**
     * Analyze resumes against a job description
     */
    analyze: async (jobId: number, resumeIds?: number[], options: ClientOptions = {}) => {
      try {
        const headers = await this.getAuthHeaders();
        return await postAnalysisAnalyzeByJobId({
          path: { jobId },
          body: resumeIds ? { resumeIds } : {},
          headers,
          throwOnError: options.throwOnError ?? true
        });
      } catch (error) {
        this.handleError(error);
      }
    },

    /**
     * Analyze job description for bias
     */
    analyzeBias: async (jobId: number, options: ClientOptions = {}) => {
      try {
        const headers = await this.getAuthHeaders();
        return await postAnalysisAnalyzeBiasByJobId({
          path: { jobId },
          body: {},
          headers,
          throwOnError: options.throwOnError ?? true
        });
      } catch (error) {
        this.handleError(error);
      }
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
}