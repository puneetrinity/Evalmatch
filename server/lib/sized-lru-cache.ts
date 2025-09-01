/**
 * Size-limited LRU cache for memory-constrained environments
 */

interface CacheEntry<T> {
  value: T;
  size: number;
  timestamp: number;
  accessCount: number;
}

export class SizedLRUCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private currentSize = 0;
  private readonly maxSize: number;
  private readonly ttl: number;
  private hits = 0;
  private misses = 0;
  
  constructor(maxSizeBytes: number = 1_000_000, ttlMs: number = 60_000) {
    this.maxSize = maxSizeBytes;
    this.ttl = ttlMs;
    
    // PERFORMANCE: Start periodic cleanup to prevent memory leaks
    setInterval(() => this.performMaintenanceCleanup(), 300_000); // 5 minutes
  }
  
  private calculateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // UTF-16 encoding
    } catch {
      return 1000; // Default size for non-serializable objects
    }
  }
  
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      this.misses++;
      return null;
    }
    
    // Update access pattern
    entry.accessCount++;
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.hits++;
    return entry.value;
  }
  
  set(key: string, value: T): void {
    const size = this.calculateSize(value);
    
    // Skip if single item exceeds max size
    if (size > this.maxSize) {
      console.warn(`Cache item too large: ${key} (${Math.round(size/1024)}KB > ${Math.round(this.maxSize/1024)}KB)`);
      return;
    }
    
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }
    
    // Evict LRU entries until we have space
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.delete(firstKey);
      } else {
        break; // Safety check
      }
    }
    
    // Add new entry
    this.cache.set(key, {
      value,
      size,
      timestamp: Date.now(),
      accessCount: 1
    });
    
    this.currentSize += size;
  }
  
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    this.cache.delete(key);
    this.currentSize -= entry.size;
    return true;
  }
  
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
    this.hits = 0;
    this.misses = 0;
  }
  
  // Advanced cleanup: remove least accessed items first
  cleanup(targetSize: number = this.maxSize * 0.7): void {
    if (this.currentSize <= targetSize) return;
    
    // Sort by access count ascending (least accessed first)
    const entries = Array.from(this.cache.entries()).sort((a, b) => 
      a[1].accessCount - b[1].accessCount
    );
    
    for (const [key] of entries) {
      if (this.currentSize <= targetSize) break;
      this.delete(key);
    }
  }
  
  /**
   * PERFORMANCE: Enhanced maintenance cleanup
   */
  private performMaintenanceCleanup(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.delete(key);
        expiredCount++;
      }
    }
    
    // If still over 80% capacity, perform LRU cleanup
    if (this.currentSize > this.maxSize * 0.8) {
      this.cleanup(this.maxSize * 0.6); // Target 60% capacity
    }
    
    if (expiredCount > 0) {
      console.debug(`Cache maintenance: removed ${expiredCount} expired entries`);
    }
  }

  getStats() {
    const hitRate = this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses)) * 100 : 0;
    
    return {
      entries: this.cache.size,
      currentSizeBytes: this.currentSize,
      currentSizeKB: Math.round(this.currentSize / 1024),
      maxSizeBytes: this.maxSize,
      maxSizeKB: Math.round(this.maxSize / 1024),
      utilizationPercent: Math.round((this.currentSize / this.maxSize) * 100),
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100
    };
  }
}

// Export singleton instances for different cache types (optimized for 8GB RAM)
export const analysisCache = new SizedLRUCache(2_000_000, 1800_000);  // 2MB, 30 min
export const embeddingCache = new SizedLRUCache(5_000_000, 3600_000); // 5MB, 60 min  
export const skillCache = new SizedLRUCache(1_000_000, 7200_000);     // 1MB, 2 hours
export const generalCache = new SizedLRUCache(500_000, 300_000);      // 500KB, 5 min
