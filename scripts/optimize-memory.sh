#!/bin/bash

# Memory Optimization Script for Railway Deployment
# Implements all memory optimization recommendations

echo "🚀 Implementing Memory Optimizations for Railway"
echo "=============================================="

# 1. Update NODE_OPTIONS in Dockerfile.railway
echo "1. Updating NODE_OPTIONS in Dockerfile.railway..."
cat > /tmp/node-options-patch.txt << 'EOF'
# Optimized for Railway's small containers (512MB typical)
ENV NODE_OPTIONS="--max-old-space-size=256 --max-semi-space-size=16"
EOF

# 2. Create optimized health snapshot
echo "2. Creating optimized health snapshot..."
cat > server/observability/health-snapshot-optimized.ts << 'EOF'
/**
 * OPTIMIZED: Lightweight Health Snapshot for Small Containers
 * 
 * - Caches primitives only (no large objects)
 * - 5 second cache TTL (reduced from 2s sampling)
 * - Adds heap monitoring headers
 */

import { redis } from '../core/redis';
import { Request, Response } from 'express';

interface LightweightSnapshot {
  status: 'healthy' | 'degraded' | 'critical';
  ts: number;
  heapPercent: number;
  redis: boolean;
  db: boolean;
}

let lastSnapshot: LightweightSnapshot | null = null;
let snapshotTime = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Get lightweight health snapshot (primitives only)
 */
async function getHealthSnapshot(): Promise<LightweightSnapshot> {
  const now = Date.now();
  
  // Return cached snapshot if fresh
  if (lastSnapshot && (now - snapshotTime) < CACHE_TTL) {
    return lastSnapshot;
  }
  
  try {
    // Memory check (instant)
    const mem = process.memoryUsage();
    const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    
    // Fast Redis ping (100ms budget)
    const redisOk = await Promise.race([
      redis.ping().then(() => true).catch(() => false),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100))
    ]);
    
    // DB check (just config check, no connection)
    const dbOk = !!process.env.DATABASE_URL;
    
    // Determine status based on heap
    const status = heapPercent < 80 ? 'healthy' :
                   heapPercent < 90 ? 'degraded' : 'critical';
    
    lastSnapshot = {
      status,
      ts: now,
      heapPercent,
      redis: redisOk,
      db: dbOk
    };
    
    snapshotTime = now;
    return lastSnapshot;
    
  } catch (error) {
    return {
      status: 'critical',
      ts: now,
      heapPercent: 100,
      redis: false,
      db: false
    };
  }
}

/**
 * Optimized readiness handler with heap monitoring
 */
export async function optimizedReadyzHandler(req: Request, res: Response): Promise<void> {
  const snapshot = await getHealthSnapshot();
  
  // Add heap monitoring headers
  res.set('X-Heap-Percent', `${snapshot.heapPercent}%`);
  res.set('X-Health-Cache', 'true');
  res.set('X-Cache-Age', Math.round((Date.now() - snapshot.ts) / 1000).toString());
  res.set('Cache-Control', 'no-cache');
  
  const httpStatus = snapshot.status === 'healthy' ? 200 :
                    snapshot.status === 'degraded' ? 200 : 503;
  
  res.status(httpStatus).json({
    status: snapshot.status,
    heap: `${snapshot.heapPercent}%`,
    redis: snapshot.redis,
    db: snapshot.db,
    ts: snapshot.ts
  });
}

/**
 * Force garbage collection endpoint (dev only)
 */
export function gcHandler(req: Request, res: Response): void {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'GC not allowed in production' });
  }
  
  if (global.gc) {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    const freed = before - after;
    
    res.json({
      success: true,
      freedMB: Math.round(freed / 1024 / 1024),
      heapUsedMB: Math.round(after / 1024 / 1024)
    });
  } else {
    res.status(400).json({
      error: 'GC not exposed. Run with --expose-gc flag'
    });
  }
}
EOF

# 3. Create LRU cache implementation
echo "3. Creating LRU cache with size limits..."
cat > server/lib/sized-lru-cache.ts << 'EOF'
/**
 * Size-limited LRU cache for memory-constrained environments
 */

interface CacheEntry<T> {
  value: T;
  size: number;
  timestamp: number;
}

export class SizedLRUCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private currentSize = 0;
  private readonly maxSize: number;
  private readonly ttl: number;
  
  constructor(maxSizeBytes: number = 1_000_000, ttlMs: number = 60_000) {
    this.maxSize = maxSizeBytes;
    this.ttl = ttlMs;
  }
  
  private calculateSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1000; // Default size for non-serializable objects
    }
  }
  
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return null;
    }
    
    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }
  
  set(key: string, value: T): void {
    const size = this.calculateSize(value);
    
    // Skip if single item exceeds max size
    if (size > this.maxSize) return;
    
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }
    
    // Evict LRU entries until we have space
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.delete(firstKey);
    }
    
    // Add new entry
    this.cache.set(key, {
      value,
      size,
      timestamp: Date.now()
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
  }
  
  getStats() {
    return {
      entries: this.cache.size,
      currentSizeBytes: this.currentSize,
      maxSizeBytes: this.maxSize,
      utilizationPercent: Math.round((this.currentSize / this.maxSize) * 100)
    };
  }
}

// Export singleton instances for different cache types
export const analysisCache = new SizedLRUCache(500_000, 300_000);  // 500KB, 5 min
export const embeddingCache = new SizedLRUCache(200_000, 600_000); // 200KB, 10 min
export const generalCache = new SizedLRUCache(300_000, 60_000);    // 300KB, 1 min
EOF

# 4. Create memory monitoring utility
echo "4. Creating memory monitoring utility..."
cat > server/lib/memory-monitor.ts << 'EOF'
/**
 * Memory monitoring and alerting for production
 */

import { logger } from './logger';

interface MemoryMetrics {
  heapUsedMB: number;
  heapTotalMB: number;
  heapPercent: number;
  externalMB: number;
  rssMB: number;
}

export class MemoryMonitor {
  private lastAlert = 0;
  private readonly alertCooldown = 60_000; // 1 minute between alerts
  
  getMetrics(): MemoryMetrics {
    const mem = process.memoryUsage();
    return {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      heapPercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      externalMB: Math.round(mem.external / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024)
    };
  }
  
  checkAndAlert(): void {
    const metrics = this.getMetrics();
    const now = Date.now();
    
    // Alert on high memory usage
    if (metrics.heapPercent > 85 && (now - this.lastAlert) > this.alertCooldown) {
      logger.warn('⚠️ High memory usage detected', metrics);
      this.lastAlert = now;
      
      // Try to free memory
      if (global.gc && metrics.heapPercent > 90) {
        logger.info('🧹 Triggering garbage collection');
        global.gc();
        
        const afterMetrics = this.getMetrics();
        logger.info('📊 GC complete', {
          before: metrics.heapUsedMB,
          after: afterMetrics.heapUsedMB,
          freedMB: metrics.heapUsedMB - afterMetrics.heapUsedMB
        });
      }
    }
  }
  
  startMonitoring(intervalMs: number = 30_000): void {
    setInterval(() => this.checkAndAlert(), intervalMs);
    logger.info('📊 Memory monitoring started', {
      interval: intervalMs,
      initialMetrics: this.getMetrics()
    });
  }
}

export const memoryMonitor = new MemoryMonitor();
EOF

echo ""
echo "✅ Memory optimization files created!"
echo ""
echo "Next steps:"
echo "1. Update Dockerfile.railway with new NODE_OPTIONS"
echo "2. Replace health snapshot with optimized version"
echo "3. Replace any unbounded caches with SizedLRUCache"
echo "4. Start memory monitoring in index.ts"
echo ""
echo "To apply NODE_OPTIONS fix in Dockerfile.railway:"
echo "sed -i 's/--max-old-space-size=7168/--max-old-space-size=256/g' Dockerfile.railway"
echo "sed -i 's/--max-semi-space-size=256/--max-semi-space-size=16/g' Dockerfile.railway"