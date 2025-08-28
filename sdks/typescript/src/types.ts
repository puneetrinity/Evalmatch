/**
 * Custom types for EvalMatch SDK
 */

export interface AuthProvider {
  /**
   * Get current authentication token
   * @returns Promise that resolves to JWT token or null if not authenticated
   */
  getToken(): Promise<string | null>;
  
  /**
   * Check if user is currently authenticated
   */
  isAuthenticated(): Promise<boolean>;
}

export interface EvalMatchConfig {
  /**
   * Base URL for EvalMatch API
   * @default "https://evalmatch.app/api"
   */
  baseUrl?: string;
  
  /**
   * Authentication provider instance
   */
  authProvider: AuthProvider;
  
  /**
   * Request timeout in milliseconds
   * @default 30000
   */
  timeout?: number;
  
  /**
   * Custom headers to include with every request
   */
  headers?: Record<string, string>;
  
  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
  
  /**
   * Maximum number of retry attempts for failed requests
   * @default 3
   */
  retries?: number;
  
  /**
   * Circuit breaker configuration
   */
  circuitBreaker?: {
    /**
     * Number of failures before opening circuit
     * @default 5
     */
    threshold?: number;
    
    /**
     * Time to wait before attempting to close circuit (ms)
     * @default 30000
     */
    timeout?: number;
  };

  /**
   * Cache configuration
   */
  cache?: {
    /**
     * Enable caching
     * @default true
     */
    enabled?: boolean;
    
    /**
     * Memory cache settings
     */
    memory?: {
      /**
       * Maximum entries in memory cache
       * @default 100
       */
      maxSize?: number;
      
      /**
       * Maximum memory usage in bytes
       * @default 10MB
       */
      maxBytes?: number;
    };
    
    /**
     * Persistent cache settings (IndexedDB)
     */
    persistent?: {
      /**
       * Enable persistent caching
       * @default true
       */
      enabled?: boolean;
      
      /**
       * Maximum entries in persistent cache
       * @default 1000
       */
      maxSize?: number;
      
      /**
       * Maximum storage in bytes
       * @default 50MB
       */
      maxBytes?: number;
    };
    
    /**
     * Default TTL for cached entries (milliseconds)
     * @default 300000 (5 minutes)
     */
    defaultTTL?: number;
    
    /**
     * Enable cache debug logging
     * @default false
     */
    debug?: boolean;
  };
}

export interface ClientOptions {
  /**
   * Throw errors instead of returning error responses
   * @default true
   */
  throwOnError?: boolean;
  
  /**
   * Custom request metadata
   */
  meta?: Record<string, unknown>;
}