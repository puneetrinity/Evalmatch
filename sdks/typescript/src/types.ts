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