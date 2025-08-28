/**
 * Phase 3.4: Performance monitoring integration for embedding service
 * 
 * Railway-optimized health checks and monitoring endpoints with PII sanitization
 */

import { Router } from 'express';
import { getEmbeddingService } from '../services/embedding-service';
import { logger } from '../lib/logger';

const router = Router();

// ✅ RAILWAY-SPECIFIC: Readiness probe for load balancer
router.get('/ready', async (req, res) => {
  try {
    const embeddingService = getEmbeddingService();
    const isReady = await embeddingService.isReady();
    
    if (isReady) {
      res.status(200).json({
        status: 'ready',
        service: 'embedding',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not-ready',
        service: 'embedding',
        message: 'Model still loading',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    logger.error('Embedding readiness check failed', { error });
    res.status(503).json({
      status: 'error',
      service: 'embedding',
      error: 'Readiness check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ RAILWAY-SPECIFIC: Health check with detailed metrics
router.get('/health', async (req, res) => {
  try {
    const embeddingService = getEmbeddingService();
    const health = await embeddingService.healthCheck();
    const _stats = embeddingService.getCacheStats();
    
    // ✅ Phase 3.4: PII sanitization - no user data in health metrics
    const sanitizedHealth = {
      ...health,
      details: {
        ...health.details,
        // Remove any potentially sensitive information
        workerPath: health.details.workerPath ? '[REDACTED]' : undefined,
        railwayEnvironment: health.details.railwayEnvironment
      }
    };
    
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      service: 'embedding',
      ...sanitizedHealth,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Embedding health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      service: 'embedding',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Performance metrics endpoint for monitoring dashboard
router.get('/metrics', async (req, res) => {
  try {
    const embeddingService = getEmbeddingService();
    const stats = embeddingService.getCacheStats();
    
    // ✅ Phase 3.4: PII-free metrics in Prometheus format
    const metrics = `
# HELP embedding_total_requests Total number of embedding requests
# TYPE embedding_total_requests counter
embedding_total_requests ${stats.totalRequests}

# HELP embedding_cache_hits Total number of cache hits
# TYPE embedding_cache_hits counter  
embedding_cache_hits ${Math.round(stats.totalRequests * stats.hitRate)}

# HELP embedding_cache_hit_rate Current cache hit rate
# TYPE embedding_cache_hit_rate gauge
embedding_cache_hit_rate ${stats.hitRate.toFixed(4)}

# HELP embedding_cache_size Current cache size
# TYPE embedding_cache_size gauge
embedding_cache_size ${stats.size}

# HELP embedding_inflight_requests Current number of inflight requests
# TYPE embedding_inflight_requests gauge
embedding_inflight_requests ${stats.inflightRequests}

# HELP embedding_worker_restarts Total number of worker restarts
# TYPE embedding_worker_restarts counter
embedding_worker_restarts ${stats.workerRestarts}

# HELP embedding_average_access_count Average access count per cached entry
# TYPE embedding_average_access_count gauge
embedding_average_access_count ${stats.averageAccessCount.toFixed(2)}
`.trim();

    res.set('Content-Type', 'text/plain').send(metrics);
    
  } catch (error) {
    logger.error('Embedding metrics request failed', { error });
    res.status(500).json({
      error: 'Metrics unavailable',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ RAILWAY-SPECIFIC: Keep-alive endpoint to prevent cold starts
router.post('/keep-alive', async (req, res) => {
  try {
    const embeddingService = getEmbeddingService();
    await embeddingService.keepAlive();
    
    res.status(200).json({
      status: 'ok',
      message: 'Keep-alive ping sent',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.warn('Keep-alive ping failed', { error });
    res.status(200).json({
      status: 'warning',
      message: 'Keep-alive ping failed but service continuing',
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ Test endpoint for validating embedding functionality
router.post('/test', async (req, res) => {
  try {
    const { text = 'test embedding generation' } = req.body;
    
    // ✅ PII sanitization - limit text length and log safely
    const safeText = String(text).slice(0, 100);
    
    const embeddingService = getEmbeddingService();
    const startTime = Date.now();
    
    const result = await embeddingService.getEmbedding({
      text: safeText,
      model: 'Xenova/all-MiniLM-L12-v2'
    });
    
    const responseTime = Date.now() - startTime;
    
    res.status(200).json({
      status: 'success',
      dimensions: result.dimensions,
      norm: result.norm,
      model: result.model,
      processingTime: result.processingTime,
      responseTime,
      cacheHit: result.processingTime < 50, // Likely cache hit if very fast
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Embedding test failed', { error });
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;