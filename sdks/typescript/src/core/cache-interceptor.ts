/**
 * Cache Interceptor
 * 
 * Integrates the multi-layer cache with the SDK's interceptor system
 * Provides transparent caching for API requests
 */

import { CacheManager, CacheOptions, CacheStrategy } from './cache-manager';
import type { 
  RequestInterceptor, 
  ResponseInterceptor, 
  RequestConfig, 
  ResponseData 
} from './interceptors';

export interface CacheInterceptorConfig {
  enabled: boolean;
  cacheOptions?: Partial<CacheOptions>;
  strategy?: Partial<CacheStrategy>;
  debug?: boolean;
}

export class CacheInterceptor {
  private cacheManager: CacheManager;
  private config: CacheInterceptorConfig;
  
  constructor(config: CacheInterceptorConfig = { enabled: true }) {
    this.config = config;
    
    // Create custom cache strategy
    const customStrategy: CacheStrategy = {
      shouldCache: (key: string, data: any, options?) => {
        // Don't cache errors
        if (data?.error || data?.status >= 400) return false;
        
        // Don't cache authentication requests
        if (key.includes('/auth/') || key.includes('/login') || key.includes('/token')) return false;
        
        // Don't cache mutations (non-GET requests)
        if (key.startsWith('POST:') || key.startsWith('PUT:') || key.startsWith('DELETE:')) return false;
        
        // Apply custom strategy if provided
        if (this.config.strategy?.shouldCache) {
          return this.config.strategy.shouldCache(key, data, options);
        }
        
        return true;
      },
      
      getCacheKey: (request: RequestConfig) => {
        const { url = '', method = 'GET', params = {}, data = {} } = request;
        
        // Include relevant request data in cache key
        const relevantData = method === 'GET' ? params : { ...params, ...data };
        const dataString = Object.keys(relevantData)
          .sort()
          .map(key => `${key}=${JSON.stringify(relevantData[key])}`)
          .join('&');
          
        const cacheKey = `${method}:${url}${dataString ? '?' + dataString : ''}`;
        
        // Apply custom strategy if provided
        if (this.config.strategy?.getCacheKey) {
          return this.config.strategy.getCacheKey(request);
        }
        
        return cacheKey;
      },
      
      getTTL: (request: RequestConfig) => {
        const { url = '' } = request;
        
        // Long TTL for relatively static data
        if (url.includes('/resumes') || url.includes('/jobs')) {
          return 15 * 60 * 1000; // 15 minutes
        }
        
        // Medium TTL for analysis results
        if (url.includes('/analysis')) {
          return 5 * 60 * 1000; // 5 minutes
        }
        
        // Short TTL for user data
        if (url.includes('/user') || url.includes('/profile')) {
          return 2 * 60 * 1000; // 2 minutes
        }
        
        // Apply custom strategy if provided
        if (this.config.strategy?.getTTL) {
          return this.config.strategy.getTTL(request);
        }
        
        // Default TTL
        return 5 * 60 * 1000; // 5 minutes
      },
      
      shouldBypassCache: (request: RequestConfig) => {
        const { method = 'GET', headers = {} } = request;
        
        // Bypass non-GET requests
        if (method !== 'GET') return true;
        
        // Bypass if client explicitly requests no cache
        if (headers['Cache-Control'] === 'no-cache' || 
            headers['cache-control'] === 'no-cache') return true;
            
        // Apply custom strategy if provided
        if (this.config.strategy?.shouldBypassCache) {
          return this.config.strategy.shouldBypassCache(request);
        }
        
        return false;
      }
    };
    
    this.cacheManager = new CacheManager(
      this.config.cacheOptions,
      customStrategy
    );
  }
  
  /**
   * Request interceptor - checks cache before making request
   */
  createRequestInterceptor(): RequestInterceptor {
    return async (config: RequestConfig) => {
      if (!this.config.enabled) return config;
      
      const cacheKey = this.cacheManager['strategy'].getCacheKey(config);
      
      // Skip cache if strategy says so
      if (this.cacheManager['strategy'].shouldBypassCache(config)) {
        if (this.config.debug) {
          console.log(`[Cache] Bypassing cache for: ${cacheKey}`);
        }
        return config;
      }
      
      // Try to get from cache
      const cachedResponse = await this.cacheManager.get(cacheKey);
      
      if (cachedResponse) {
        if (this.config.debug) {
          console.log(`[Cache] Cache HIT for: ${cacheKey}`);
        }
        
        // Return cached response by throwing a special "success" error
        // This prevents the actual HTTP request from being made
        const cacheResponse = {
          data: cachedResponse,
          status: 200,
          statusText: 'OK (cached)',
          headers: { 'x-cache': 'HIT' },
          config,
          fromCache: true,
        };
        
        // We need to "short-circuit" the request
        // Store cached response in config for response interceptor
        config._cachedResponse = cacheResponse;
      } else {
        if (this.config.debug) {
          console.log(`[Cache] Cache MISS for: ${cacheKey}`);
        }
      }
      
      // Store cache key in config for response interceptor
      config._cacheKey = cacheKey;
      
      return config;
    };
  }
  
  /**
   * Response interceptor - stores successful responses in cache
   */
  createResponseInterceptor(): ResponseInterceptor {
    return {
      onFulfilled: async (response: ResponseData) => {
        if (!this.config.enabled) return response;
        
        const { config } = response;
        
        // Return cached response if available
        if (config._cachedResponse) {
          return config._cachedResponse;
        }
        
        const cacheKey = config._cacheKey;
        if (!cacheKey) return response;
        
        // Only cache successful responses
        if (response.status >= 200 && response.status < 300) {
          const ttl = this.cacheManager['strategy'].getTTL(config);
          
          try {
            await this.cacheManager.set(cacheKey, response.data, { ttl });
            
            if (this.config.debug) {
              console.log(`[Cache] Cached response for: ${cacheKey} (TTL: ${ttl}ms)`);
            }
            
            // Add cache header
            response.headers = {
              ...response.headers,
              'x-cache': 'MISS'
            };
          } catch (error) {
            console.warn('[Cache] Failed to cache response:', error);
          }
        }
        
        return response;
      },
      
      onRejected: async (error: any) => {
        if (!this.config.enabled) throw error;
        
        if (this.config.debug) {
          console.log(`[Cache] Request failed, not caching:`, error.message);
        }
        
        throw error;
      }
    };
  }
  
  /**
   * Get cache metrics
   */
  getMetrics() {
    return this.cacheManager.getMetrics();
  }
  
  /**
   * Clear all cache
   */
  async clearCache(): Promise<void> {
    return this.cacheManager.clear();
  }
  
  /**
   * Delete specific cache entry
   */
  async invalidateCache(key: string): Promise<boolean> {
    return this.cacheManager.delete(key);
  }
  
  /**
   * Invalidate cache entries by pattern
   */
  async invalidateCacheByPattern(pattern: string | RegExp): Promise<number> {
    const metrics = this.cacheManager.getMetrics();
    let invalidated = 0;
    
    // This is a simplified version - in production you'd need to track keys
    // For now, we'll just clear all cache
    if (pattern) {
      console.warn('[Cache] Pattern-based invalidation not fully implemented, clearing all cache');
      await this.clearCache();
      return metrics.cacheSize.memory + metrics.cacheSize.persistent;
    }
    
    return invalidated;
  }
  
  /**
   * Preload data into cache
   */
  async preloadCache(key: string, data: any, ttl?: number): Promise<void> {
    return this.cacheManager.set(key, data, { ttl });
  }
  
  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
  
  /**
   * Enable/disable cache
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }
  
  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<CacheInterceptorConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    this.cacheManager.dispose();
  }
}