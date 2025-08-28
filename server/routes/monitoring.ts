import { Router } from "express";
import { embeddingManager } from "../lib/embedding-manager";
import { logger } from "../lib/logger";
import { getCacheStats } from "../lib/cached-ai-operations";
import { queueManager } from "../lib/queue-manager";

const router = Router();

/**
 * MONITORING: Memory and performance monitoring endpoints
 * Part of Phase 2 performance optimization
 */

// Health check with memory stats
router.get("/health", async (req, res) => {
  const memoryUsage = process.memoryUsage();
  const embeddingStats = embeddingManager.getStats();
  const cacheStats = await getCacheStats();
  
  // Get queue system health
  let queueHealth = null;
  try {
    queueHealth = await queueManager.getSystemHealth();
  } catch (error) {
    logger.warn("Failed to get queue health:", error);
  }
  
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    memory: {
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024),
      externalMB: Math.round(memoryUsage.external / 1024 / 1024),
      usage: `${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}%`
    },
    embeddingCache: {
      size: embeddingStats.size,
      memoryMB: embeddingStats.memoryMB,
      oldestAgeSeconds: embeddingStats.oldestAge
    },
    redisCache: cacheStats,
    queues: queueHealth
  };
  
  // Set status based on memory usage and queue health
  if (memoryUsage.heapUsed > 700 * 1024 * 1024) { // 700MB critical
    health.status = "critical";
    res.status(503);
  } else if (memoryUsage.heapUsed > 500 * 1024 * 1024) { // 500MB warning
    health.status = "degraded";
  } else if (queueHealth?.memory?.pressure === 'CRITICAL') {
    health.status = "critical";
    res.status(503);
  } else if (queueHealth?.memory?.pressure === 'HIGH') {
    health.status = "degraded";
  }
  
  res.json(health);
});

// Detailed memory report
router.get("/memory", (req, res) => {
  const memoryUsage = process.memoryUsage();
  const embeddingStats = embeddingManager.getStats();
  
  const report = {
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      platform: process.platform,
      nodeVersion: process.version
    },
    memory: {
      heapUsed: {
        bytes: memoryUsage.heapUsed,
        mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
      },
      heapTotal: {
        bytes: memoryUsage.heapTotal,
        mb: Math.round(memoryUsage.heapTotal / 1024 / 1024)
      },
      rss: {
        bytes: memoryUsage.rss,
        mb: Math.round(memoryUsage.rss / 1024 / 1024)
      },
      external: {
        bytes: memoryUsage.external,
        mb: Math.round(memoryUsage.external / 1024 / 1024)
      },
      arrayBuffers: {
        bytes: memoryUsage.arrayBuffers,
        mb: Math.round(memoryUsage.arrayBuffers / 1024 / 1024)
      }
    },
    caches: {
      embeddings: embeddingStats
    },
    thresholds: {
      warning: "500MB",
      critical: "700MB",
      maxHeap: "8GB"
    }
  };
  
  res.json(report);
});

// Force garbage collection endpoint (development only)
router.post("/gc", (req, res) => {
  if (process.env.NODE_ENV !== "production" && global.gc) {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    
    const freed = before - after;
    logger.info("Manual garbage collection triggered", {
      beforeMB: Math.round(before / 1024 / 1024),
      afterMB: Math.round(after / 1024 / 1024),
      freedMB: Math.round(freed / 1024 / 1024)
    });
    
    res.json({
      success: true,
      freed: {
        bytes: freed,
        mb: Math.round(freed / 1024 / 1024)
      }
    });
  } else {
    res.status(403).json({
      error: "Garbage collection not available",
      message: "GC is only available in development with --expose-gc flag"
    });
  }
});

export { router as monitoringRouter };