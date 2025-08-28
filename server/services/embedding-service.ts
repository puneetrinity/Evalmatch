/**
 * Phase 3.2 & 3.3: Production Embedding Service
 * 
 * Implements LRU cache with TTLs, single-flight pattern, and worker isolation
 * for sub-2s response time optimization with 85%+ cache hit rate target.
 */

import { Worker } from 'worker_threads';
import crypto from 'crypto';
import path from 'path';
import { logger } from '../lib/logger';

interface EmbeddingRequest {
  text: string;
  model?: string;
  options?: Record<string, any>;
}

interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  norm: number;
  cacheKey: string;
  processingTime: number;
}

interface CacheEntry {
  result: EmbeddingResult;
  accessTime: number;
  accessCount: number;
  createdAt: number;
  ttl: number;
}

export class ProductionEmbeddingService {
  private worker: Worker | null = null;
  private cache = new Map<string, CacheEntry>();
  private inflightRequests = new Map<string, Promise<EmbeddingResult>>();
  
  // ✅ CRITICAL: Phase 3.5 - Cap cache sizes and add TTL expiration
  private readonly maxCacheSize = 10000;
  private readonly defaultTTL = 3600000; // 1 hour
  private readonly workerPath = path.join(__dirname, '../workers/embedding-worker.js');
  private readonly defaultModel = 'Xenova/all-MiniLM-L12-v2';
  
  // ✅ RAILWAY-SPECIFIC: Model preloading and readiness tracking
  private isModelReady = false;
  private modelLoadStartTime = 0;
  private warmupPromise: Promise<void> | null = null;
  
  // Performance monitoring
  private stats = {
    totalRequests: 0,
    cacheHits: 0,
    workerRestarts: 0,
    lastCleanup: Date.now(),
    modelLoadTime: 0,
    coldStarts: 0
  };

  constructor() {
    this.initializeWorker();
    this.startPeriodicCleanup();
    this.startModelPreloading();
  }

  // ✅ CRITICAL: Proper worker initialization with restart logic
  private initializeWorker(): void {
    if (this.worker) {
      this.worker.terminate();
    }

    try {
      this.worker = new Worker(this.workerPath);

      this.worker.on('error', (error) => {
        logger.error('Embedding worker error', { error });
        this.restartWorker();
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          logger.warn('Embedding worker exited with code', { code });
          this.restartWorker();
        }
      });

      logger.info('Embedding worker initialized', { 
        workerPath: this.workerPath,
        defaultModel: this.defaultModel,
        maxCacheSize: this.maxCacheSize
      });

    } catch (error) {
      logger.error('Failed to initialize embedding worker', { error });
      throw error;
    }
  }

  private restartWorker(): void {
    logger.info('Restarting embedding worker');
    this.stats.workerRestarts++;
    this.stats.coldStarts++;
    
    // Reset readiness state on worker restart
    this.isModelReady = false;
    this.warmupPromise = null;
    
    // Clear inflight requests on worker restart
    this.inflightRequests.clear();
    
    setTimeout(() => {
      this.initializeWorker();
      this.startModelPreloading(); // Preload model after restart
    }, 1000); // 1 second delay before restart
  }

  // ✅ RAILWAY-SPECIFIC: Preload model at boot for "always-loaded" behavior
  private startModelPreloading(): void {
    if (this.warmupPromise) return; // Already warming up

    this.warmupPromise = this.warmupModel();
    this.warmupPromise.catch((error) => {
      logger.error('Model warmup failed', { error: error.message });
      // Reset warmup state to allow retry
      this.warmupPromise = null;
      this.isModelReady = false;
    });
  }

  private async warmupModel(): Promise<void> {
    if (this.isModelReady) return;

    logger.info('🔥 Starting model warmup for Railway "always-loaded" behavior...', {
      model: this.defaultModel,
      environment: process.env.NODE_ENV || 'unknown'
    });

    this.modelLoadStartTime = Date.now();

    try {
      // Send warmup request to worker
      const warmupText = 'JavaScript programming skills and experience with React framework';
      const result = await this.processEmbedding(warmupText, this.defaultModel, {}, 'warmup-key');
      
      this.stats.modelLoadTime = Date.now() - this.modelLoadStartTime;
      this.isModelReady = true;

      logger.info('✅ Model warmup completed successfully', {
        loadTime: this.stats.modelLoadTime,
        dimensions: result.dimensions,
        norm: result.norm.toFixed(6)
      });

      // Remove warmup result from cache to avoid pollution
      this.cache.delete('warmup-key');

    } catch (error) {
      this.stats.modelLoadTime = Date.now() - this.modelLoadStartTime;
      logger.error('❌ Model warmup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        loadTime: this.stats.modelLoadTime
      });
      throw error;
    }
  }

  // ✅ RAILWAY-SPECIFIC: Readiness check for health endpoints
  async isReady(): Promise<boolean> {
    if (this.isModelReady) return true;

    // Wait for ongoing warmup (with timeout)
    if (this.warmupPromise) {
      try {
        await Promise.race([
          this.warmupPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Warmup timeout')), 30000))
        ]);
        return this.isModelReady;
      } catch (error) {
        logger.warn('Warmup timeout or error during readiness check', { error });
        return false;
      }
    }

    return false;
  }

  // ✅ RAILWAY-SPECIFIC: Keep-alive ping to prevent cold starts
  async keepAlive(): Promise<void> {
    if (!this.isModelReady) {
      logger.debug('Keep-alive triggered during model loading');
      return;
    }

    try {
      // Send lightweight embedding request to keep worker active
      const pingText = 'ping';
      await this.processEmbedding(pingText, this.defaultModel, {}, 'keep-alive-ping');
      
      // Remove ping from cache
      this.cache.delete('keep-alive-ping');
      
      logger.debug('Keep-alive ping successful');
    } catch (error) {
      logger.warn('Keep-alive ping failed', { error });
    }
  }

  // ✅ CRITICAL: Single-flight pattern with proper LRU cache
  async getEmbedding(request: EmbeddingRequest): Promise<EmbeddingResult> {
    const { text, model = this.defaultModel, options = {} } = request;
    this.stats.totalRequests++;

    // ✅ RAILWAY-SPECIFIC: Ensure model is ready before processing
    if (!this.isModelReady) {
      logger.info('Model not ready, waiting for warmup...', { totalRequests: this.stats.totalRequests });
      const isReady = await this.isReady();
      if (!isReady) {
        throw new Error('Embedding model not ready - service unavailable');
      }
    }

    // Create versioned cache key with content hash
    const normalizedText = text.trim().replace(/\s+/g, ' ');
    const contentHash = crypto.createHash('sha256')
      .update(normalizedText)
      .update(model)
      .update(JSON.stringify(options))
      .digest('hex');

    const cacheKey = `embed:v3|${model}|${contentHash.substring(0, 16)}`;

    // ✅ CRITICAL: True LRU cache with TTL and move-on-access
    const cachedEntry = this.getCachedEntry(cacheKey);
    if (cachedEntry) {
      this.stats.cacheHits++;
      
      // Update access tracking
      cachedEntry.accessTime = Date.now();
      cachedEntry.accessCount++;

      // Move to end (LRU behavior)
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cachedEntry);

      logger.debug('Embedding cache hit', { 
        cacheKey: cacheKey.substring(0, 20) + '...', 
        accessCount: cachedEntry.accessCount,
        hitRate: this.getCacheHitRate()
      });
      
      return cachedEntry.result;
    }

    // ✅ CRITICAL: Single-flight pattern prevents duplicate work
    if (this.inflightRequests.has(cacheKey)) {
      logger.debug('Embedding request already in flight', { 
        cacheKey: cacheKey.substring(0, 20) + '...' 
      });
      return this.inflightRequests.get(cacheKey)!;
    }

    // Create new embedding request
    const requestPromise = this.processEmbedding(normalizedText, model, options, cacheKey);
    this.inflightRequests.set(cacheKey, requestPromise);

    // Clean up after completion
    requestPromise.finally(() => {
      this.inflightRequests.delete(cacheKey);
    });

    return requestPromise;
  }

  // ✅ CRITICAL: TTL-aware cache retrieval
  private getCachedEntry(cacheKey: string): CacheEntry | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;

    // Check TTL expiration
    const now = Date.now();
    if (now - entry.createdAt > entry.ttl) {
      this.cache.delete(cacheKey);
      logger.debug('Cache entry expired', { 
        cacheKey: cacheKey.substring(0, 20) + '...',
        age: now - entry.createdAt,
        ttl: entry.ttl
      });
      return null;
    }

    return entry;
  }

  // ✅ CRITICAL: Worker communication with timeout and validation
  private async processEmbedding(
    text: string, 
    model: string, 
    options: Record<string, any>, 
    cacheKey: string
  ): Promise<EmbeddingResult> {
    if (!this.worker) {
      throw new Error('Embedding worker not available');
    }

    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    return new Promise<EmbeddingResult>((resolve, reject) => {
      // ✅ CRITICAL: Request timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('Embedding request timeout (30s)'));
      }, 30000);

      const messageHandler = (response: any) => {
        if (response.id !== requestId) return;

        clearTimeout(timeout);
        this.worker!.off('message', messageHandler);

        const processingTime = Date.now() - startTime;

        if (response.success) {
          // ✅ CRITICAL: Validate embedding before returning
          if (!response.embedding || !Array.isArray(response.embedding)) {
            reject(new Error('Invalid embedding format received'));
            return;
          }

          if (response.dimensions !== 384) {
            reject(new Error(`Invalid embedding dimensions: expected 384, got ${response.dimensions}`));
            return;
          }

          const result: EmbeddingResult = {
            embedding: response.embedding,
            model: response.modelName || model,
            dimensions: response.dimensions,
            norm: response.norm,
            cacheKey,
            processingTime
          };

          // Store in LRU cache with TTL
          this.addToCache(cacheKey, result);

          logger.debug('Embedding generated successfully', {
            textLength: text.length,
            processingTime,
            dimensions: result.dimensions,
            norm: result.norm.toFixed(6),
            cacheKey: cacheKey.substring(0, 20) + '...'
          });

          resolve(result);
        } else {
          reject(new Error(`Embedding generation failed: ${response.error}`));
        }
      };

      this.worker!.on('message', messageHandler);
      this.worker!.postMessage({
        id: requestId,
        text,
        modelName: model,
        options
      });
    });
  }

  // ✅ CRITICAL: True LRU eviction with TTL and access tracking
  private addToCache(key: string, result: EmbeddingResult): void {
    const now = Date.now();
    const entry: CacheEntry = {
      result,
      accessTime: now,
      accessCount: 1,
      createdAt: now,
      ttl: this.defaultTTL
    };

    // LRU eviction if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      // Find least recently used entry
      let lruKey = '';
      let lruTime = now;

      for (const [k, v] of this.cache.entries()) {
        if (v.accessTime < lruTime) {
          lruTime = v.accessTime;
          lruKey = k;
        }
      }

      if (lruKey) {
        this.cache.delete(lruKey);
        logger.debug('LRU cache eviction', { 
          evictedKey: lruKey.substring(0, 20) + '...',
          cacheSize: this.cache.size,
          newSize: this.cache.size
        });
      }
    }

    this.cache.set(key, entry);
  }

  // ✅ Phase 3.5: Periodic TTL cleanup to cap memory usage
  private startPeriodicCleanup(): void {
    const cleanupInterval = 300000; // 5 minutes
    
    setInterval(() => {
      const now = Date.now();
      let expiredCount = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.createdAt > entry.ttl) {
          this.cache.delete(key);
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        logger.info('Periodic cache cleanup completed', {
          expiredEntries: expiredCount,
          remainingEntries: this.cache.size,
          hitRate: this.getCacheHitRate()
        });
      }

      this.stats.lastCleanup = now;
    }, cleanupInterval);
  }

  // ✅ Batch processing for multiple texts
  async getEmbeddingsBatch(requests: EmbeddingRequest[]): Promise<EmbeddingResult[]> {
    const batchPromises = requests.map(request => this.getEmbedding(request));
    return Promise.all(batchPromises);
  }

  // ✅ Cache and performance statistics for monitoring
  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    inflightRequests: number;
    totalRequests: number;
    workerRestarts: number;
    lastCleanup: number;
    oldestEntry: number | null;
    averageAccessCount: number;
  } {
    const hitRate = this.getCacheHitRate();
    
    let oldestEntry: number | null = null;
    let totalAccessCount = 0;

    if (this.cache.size > 0) {
      const entries = Array.from(this.cache.values());
      oldestEntry = Math.min(...entries.map(e => e.createdAt));
      totalAccessCount = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    }

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate,
      inflightRequests: this.inflightRequests.size,
      totalRequests: this.stats.totalRequests,
      workerRestarts: this.stats.workerRestarts,
      lastCleanup: this.stats.lastCleanup,
      oldestEntry,
      averageAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0
    };
  }

  private getCacheHitRate(): number {
    return this.stats.totalRequests > 0 ? this.stats.cacheHits / this.stats.totalRequests : 0;
  }

  // ✅ Health check for monitoring with Railway-specific metrics
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    worker: 'running' | 'failed';
    cache: 'optimal' | 'degraded';
    performance: 'good' | 'poor';
    readiness: 'ready' | 'loading' | 'failed';
    details: any;
  }> {
    const stats = this.getCacheStats();
    
    const workerStatus = this.worker ? 'running' : 'failed';
    const cacheStatus = stats.hitRate >= 0.75 ? 'optimal' : 'degraded';
    const performanceStatus = stats.hitRate >= 0.85 && stats.workerRestarts < 5 ? 'good' : 'poor';
    
    // ✅ RAILWAY-SPECIFIC: Model readiness status
    let readinessStatus: 'ready' | 'loading' | 'failed' = 'failed';
    if (this.isModelReady) {
      readinessStatus = 'ready';
    } else if (this.warmupPromise) {
      readinessStatus = 'loading';
    }
    
    const overallStatus = workerStatus === 'running' && 
                         cacheStatus === 'optimal' && 
                         performanceStatus === 'good' &&
                         readinessStatus === 'ready' ? 'healthy' : 'unhealthy';

    return {
      status: overallStatus,
      worker: workerStatus,
      cache: cacheStatus,
      performance: performanceStatus,
      readiness: readinessStatus,
      details: {
        ...stats,
        isModelReady: this.isModelReady,
        modelLoadTime: this.stats.modelLoadTime,
        coldStarts: this.stats.coldStarts,
        defaultModel: this.defaultModel,
        workerPath: this.workerPath,
        environment: process.env.NODE_ENV || 'unknown',
        railwayEnvironment: process.env.RAILWAY_ENVIRONMENT || 'unknown'
      }
    };
  }

  // ✅ Graceful shutdown
  async shutdown(): Promise<void> {
    logger.info('Shutting down embedding service...');
    
    // Wait for inflight requests to complete (with timeout)
    const inflightCount = this.inflightRequests.size;
    if (inflightCount > 0) {
      logger.info(`Waiting for ${inflightCount} inflight requests to complete...`);
      
      const timeout = new Promise(resolve => setTimeout(resolve, 5000));
      const completion = Promise.all(this.inflightRequests.values()).catch(() => {
        // Ignore errors during shutdown
      });
      
      await Promise.race([completion, timeout]);
    }

    // Terminate worker
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }

    // Clear caches
    this.cache.clear();
    this.inflightRequests.clear();

    logger.info('Embedding service shutdown complete');
  }
}

// ✅ Singleton instance for application-wide use
let embeddingServiceInstance: ProductionEmbeddingService | null = null;

export function getEmbeddingService(): ProductionEmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new ProductionEmbeddingService();
  }
  return embeddingServiceInstance;
}

export async function shutdownEmbeddingService(): Promise<void> {
  if (embeddingServiceInstance) {
    await embeddingServiceInstance.shutdown();
    embeddingServiceInstance = null;
  }
}

logger.info('✅ Production embedding service module loaded with LRU cache and single-flight pattern');