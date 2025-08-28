/**
 * Multi-Layer Cache Manager
 * 
 * Implements a sophisticated caching system with:
 * - L1: Memory cache (fast, volatile)
 * - L2: IndexedDB cache (persistent, larger capacity)
 * - TTL-based expiration with LRU eviction
 * - Cache performance metrics
 */

export interface CacheEntry<T = any> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: number;
  size?: number; // Estimated size in bytes
}

export interface CacheOptions {
  // Memory cache settings
  memoryMaxSize: number; // Max entries in memory
  memoryMaxBytes?: number; // Max memory usage in bytes
  
  // IndexedDB cache settings
  persistentMaxSize: number; // Max entries in IndexedDB
  persistentMaxBytes?: number; // Max storage in bytes
  
  // Default TTL settings
  defaultTTL: number; // Default TTL in milliseconds
  maxTTL: number; // Maximum allowed TTL
  
  // Performance settings
  enableMetrics: boolean;
  enablePersistence: boolean;
  cleanupInterval: number; // Cleanup interval in milliseconds
}

export interface CacheMetrics {
  // Hit/Miss statistics
  memoryHits: number;
  persistentHits: number;
  misses: number;
  total: number;
  
  // Performance metrics
  avgResponseTime: number;
  cacheSize: {
    memory: number;
    persistent: number;
  };
  
  // Efficiency metrics
  hitRate: number;
  memoryHitRate: number;
  persistentHitRate: number;
  
  // Last updated
  lastUpdated: number;
}

export interface CacheStrategy {
  shouldCache(key: string, data: any, options?: { ttl?: number }): boolean;
  getCacheKey(request: any): string;
  getTTL(request: any): number;
  shouldBypassCache(request: any): boolean;
}

export class CacheManager {
  private memoryCache = new Map<string, CacheEntry>();
  private persistentCache?: IDBDatabase;
  private options: CacheOptions;
  private metrics: CacheMetrics;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private dbPromise?: Promise<IDBDatabase>;
  
  // Default cache configuration
  private static readonly DEFAULT_OPTIONS: CacheOptions = {
    memoryMaxSize: 100,
    memoryMaxBytes: 10 * 1024 * 1024, // 10MB
    persistentMaxSize: 1000,
    persistentMaxBytes: 50 * 1024 * 1024, // 50MB
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxTTL: 60 * 60 * 1000, // 1 hour
    enableMetrics: true,
    enablePersistence: true,
    cleanupInterval: 60 * 1000, // 1 minute
  };
  
  // Default cache strategy
  private static readonly DEFAULT_STRATEGY: CacheStrategy = {
    shouldCache: (key: string, data: any) => {
      // Don't cache authentication requests or errors
      if (key.includes('/auth/') || key.includes('/login') || data?.error) {
        return false;
      }
      // Cache GET requests by default
      return true;
    },
    
    getCacheKey: (request: any) => {
      const { url, method = 'GET', params = {} } = request;
      const paramString = Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
      return `${method}:${url}${paramString ? '?' + paramString : ''}`;
    },
    
    getTTL: (request: any) => {
      const { url } = request;
      // Longer TTL for static data
      if (url.includes('/resumes/') || url.includes('/jobs/')) {
        return 15 * 60 * 1000; // 15 minutes
      }
      // Shorter TTL for analysis results
      if (url.includes('/analysis/')) {
        return 5 * 60 * 1000; // 5 minutes
      }
      // Default TTL
      return CacheManager.DEFAULT_OPTIONS.defaultTTL;
    },
    
    shouldBypassCache: (request: any) => {
      const { method = 'GET', params = {} } = request;
      // Always bypass non-GET requests
      if (method !== 'GET') return true;
      // Bypass if cache-control header says no-cache
      if (params.noCache || params['cache-control'] === 'no-cache') return true;
      return false;
    }
  };
  
  constructor(
    options: Partial<CacheOptions> = {},
    private strategy: CacheStrategy = CacheManager.DEFAULT_STRATEGY
  ) {
    this.options = { ...CacheManager.DEFAULT_OPTIONS, ...options };
    this.metrics = this.initializeMetrics();
    
    // Initialize persistent cache if enabled
    if (this.options.enablePersistence && typeof window !== 'undefined') {
      this.initializePersistentCache();
    }
    
    // Start cleanup timer
    if (this.options.cleanupInterval > 0) {
      this.startCleanupTimer();
    }
  }
  
  private initializeMetrics(): CacheMetrics {
    return {
      memoryHits: 0,
      persistentHits: 0,
      misses: 0,
      total: 0,
      avgResponseTime: 0,
      cacheSize: { memory: 0, persistent: 0 },
      hitRate: 0,
      memoryHitRate: 0,
      persistentHitRate: 0,
      lastUpdated: Date.now(),
    };
  }
  
  private async initializePersistentCache(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return;
    }
    
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('EvalMatchCache', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('cache')) {
          const store = db.createObjectStore('cache', { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('lastAccessed', 'lastAccessed');
        }
      };
    });
    
    try {
      this.persistentCache = await this.dbPromise;
    } catch (error) {
      console.warn('Failed to initialize persistent cache:', error);
    }
  }
  
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }
  
  /**
   * Get value from cache (checks both layers)
   */
  async get<T = any>(key: string): Promise<T | null> {
    const startTime = performance.now();
    
    try {
      // Check memory cache first (L1)
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && this.isEntryValid(memoryEntry)) {
        this.updateEntryAccess(memoryEntry);
        this.updateMetrics('memory-hit', performance.now() - startTime);
        return memoryEntry.value;
      }
      
      // Remove expired memory entry
      if (memoryEntry) {
        this.memoryCache.delete(key);
      }
      
      // Check persistent cache (L2)
      if (this.persistentCache) {
        const persistentEntry = await this.getFromPersistentCache<T>(key);
        if (persistentEntry && this.isEntryValid(persistentEntry)) {
          // Promote to memory cache
          this.memoryCache.set(key, persistentEntry);
          this.updateEntryAccess(persistentEntry);
          this.updateMetrics('persistent-hit', performance.now() - startTime);
          return persistentEntry.value;
        }
        
        // Remove expired persistent entry
        if (persistentEntry) {
          await this.removeFromPersistentCache(key);
        }
      }
      
      // Cache miss
      this.updateMetrics('miss', performance.now() - startTime);
      return null;
      
    } catch (error) {
      console.warn('Cache get error:', error);
      this.updateMetrics('miss', performance.now() - startTime);
      return null;
    }
  }
  
  /**
   * Set value in cache (both layers)
   */
  async set<T = any>(
    key: string, 
    value: T, 
    options: { ttl?: number; skipPersistent?: boolean } = {}
  ): Promise<void> {
    if (!this.strategy.shouldCache(key, value, options)) {
      return;
    }
    
    const ttl = Math.min(
      options.ttl || this.options.defaultTTL,
      this.options.maxTTL
    );
    
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccessed: Date.now(),
      size: this.estimateSize(value),
    };
    
    // Set in memory cache
    this.memoryCache.set(key, entry);
    this.enforceMemoryLimits();
    
    // Set in persistent cache
    if (this.persistentCache && !options.skipPersistent) {
      await this.setInPersistentCache(entry);
    }
    
    this.updateCacheSizeMetrics();
  }
  
  /**
   * Delete from cache (both layers)
   */
  async delete(key: string): Promise<boolean> {
    let deleted = false;
    
    // Delete from memory
    if (this.memoryCache.delete(key)) {
      deleted = true;
    }
    
    // Delete from persistent cache
    if (this.persistentCache) {
      const persistentDeleted = await this.removeFromPersistentCache(key);
      deleted = deleted || persistentDeleted;
    }
    
    this.updateCacheSizeMetrics();
    return deleted;
  }
  
  /**
   * Clear all cache (both layers)
   */
  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear persistent cache
    if (this.persistentCache) {
      const transaction = this.persistentCache.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
    
    this.updateCacheSizeMetrics();
  }
  
  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    this.updateCacheSizeMetrics();
    this.metrics.lastUpdated = Date.now();
    return { ...this.metrics };
  }
  
  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    
    // Cleanup memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (!this.isEntryValid(entry)) {
        this.memoryCache.delete(key);
      }
    }
    
    // Cleanup persistent cache (async, non-blocking)
    if (this.persistentCache) {
      this.cleanupPersistentCache().catch(error => {
        console.warn('Persistent cache cleanup error:', error);
      });
    }
    
    this.updateCacheSizeMetrics();
  }
  
  private async cleanupPersistentCache(): Promise<void> {
    if (!this.persistentCache) return;
    
    const transaction = this.persistentCache.transaction(['cache'], 'readwrite');
    const store = transaction.objectStore('cache');
    const index = store.index('timestamp');
    const now = Date.now();
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const entry: CacheEntry = cursor.value;
          if (!this.isEntryValid(entry)) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  private isEntryValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }
  
  private updateEntryAccess(entry: CacheEntry): void {
    entry.accessCount++;
    entry.lastAccessed = Date.now();
  }
  
  private enforceMemoryLimits(): void {
    // Enforce max entries
    if (this.memoryCache.size > this.options.memoryMaxSize) {
      this.evictLRUEntries();
    }
    
    // Enforce max bytes (if configured)
    if (this.options.memoryMaxBytes) {
      this.enforceMemoryByteLimit();
    }
  }
  
  private evictLRUEntries(): void {
    const entries = Array.from(this.memoryCache.entries());
    entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
    
    const toEvict = entries.length - this.options.memoryMaxSize;
    for (let i = 0; i < toEvict; i++) {
      this.memoryCache.delete(entries[i][0]);
    }
  }
  
  private enforceMemoryByteLimit(): void {
    if (!this.options.memoryMaxBytes) return;
    
    let totalBytes = 0;
    const entries = Array.from(this.memoryCache.entries());
    
    // Calculate total size
    for (const [, entry] of entries) {
      totalBytes += entry.size || 0;
    }
    
    // Evict if over limit
    if (totalBytes > this.options.memoryMaxBytes) {
      entries.sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);
      
      for (const [key, entry] of entries) {
        if (totalBytes <= this.options.memoryMaxBytes) break;
        this.memoryCache.delete(key);
        totalBytes -= entry.size || 0;
      }
    }
  }
  
  private async getFromPersistentCache<T>(key: string): Promise<CacheEntry<T> | null> {
    if (!this.persistentCache) return null;
    
    return new Promise((resolve, reject) => {
      const transaction = this.persistentCache!.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      const request = store.get(key);
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  
  private async setInPersistentCache<T>(entry: CacheEntry<T>): Promise<void> {
    if (!this.persistentCache) return;
    
    return new Promise((resolve, reject) => {
      const transaction = this.persistentCache!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.put(entry);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  private async removeFromPersistentCache(key: string): Promise<boolean> {
    if (!this.persistentCache) return false;
    
    return new Promise((resolve, reject) => {
      const transaction = this.persistentCache!.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.delete(key);
      
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
  
  private estimateSize(value: any): number {
    // Rough estimation of object size in bytes
    const jsonString = JSON.stringify(value);
    return new Blob([jsonString]).size;
  }
  
  private updateMetrics(type: 'memory-hit' | 'persistent-hit' | 'miss', responseTime: number): void {
    if (!this.options.enableMetrics) return;
    
    this.metrics.total++;
    
    switch (type) {
      case 'memory-hit':
        this.metrics.memoryHits++;
        break;
      case 'persistent-hit':
        this.metrics.persistentHits++;
        break;
      case 'miss':
        this.metrics.misses++;
        break;
    }
    
    // Update hit rates
    this.metrics.hitRate = 
      (this.metrics.memoryHits + this.metrics.persistentHits) / this.metrics.total;
    this.metrics.memoryHitRate = this.metrics.memoryHits / this.metrics.total;
    this.metrics.persistentHitRate = this.metrics.persistentHits / this.metrics.total;
    
    // Update average response time
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * (this.metrics.total - 1) + responseTime) / this.metrics.total;
  }
  
  private updateCacheSizeMetrics(): void {
    if (!this.options.enableMetrics) return;
    
    this.metrics.cacheSize.memory = this.memoryCache.size;
    // Note: persistent size would need async call, updated periodically
  }
  
  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    if (this.persistentCache) {
      this.persistentCache.close();
    }
    
    this.memoryCache.clear();
  }
}