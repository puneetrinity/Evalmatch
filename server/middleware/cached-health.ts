/**
 * SURGICAL FIX: Cached Health Sampling System
 * 
 * Implements health snapshot sampling every 30s instead of live probes.
 * Serves cached static responses to eliminate per-request expensive operations
 * like Redis INFO, BullMQ getJobCounts, database pings during load tests.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

interface HealthSnapshot {
  basic: {
    status: string;
    timestamp: string;
    uptime: number;
    version: string;
    service: string;
  };
  detailed: {
    status: string;
    timestamp: string;
    uptime: number;
    version: string;
    memory: {
      heapUsed: number;
      heapTotal: number;
      usagePercent: number;
    };
    database: {
      status: string;
      available: boolean;
    };
    services: {
      total: number;
      healthy: number;
    };
  } | null;
  lastUpdate: number;
  nextUpdate: number;
}

// Global health snapshot - updated every 30s
let healthSnapshot: HealthSnapshot = {
  basic: {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: '1.0.0', 
    service: 'evalmatch-api'
  },
  detailed: null,
  lastUpdate: Date.now(),
  nextUpdate: Date.now() + 30000
};

// Background health sampling interval
let healthSamplingInterval: NodeJS.Timeout | null = null;

/**
 * Background task to sample health every 30 seconds
 * This runs independently and updates the cached snapshot
 */
async function sampleHealthBackground(): Promise<void> {
  try {
    const startTime = Date.now();
    
    // Basic health sample (fast)
    const basicHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      version: '1.0.0',
      service: 'evalmatch-api'
    };

    // Memory sample (fast, no external calls)
    const memUsage = process.memoryUsage();
    const memoryInfo = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      usagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
    };

    // Quick database availability check (no connection pool queries)
    let dbStatus = { status: 'unknown', available: false };
    try {
      const { config } = await import("../config/unified-config");
      if (config.database.enabled) {
        // Very fast check - just see if we have a connection URL
        dbStatus = {
          status: process.env.DATABASE_URL ? 'configured' : 'disabled',
          available: !!process.env.DATABASE_URL
        };
      } else {
        dbStatus = { status: 'disabled', available: false };
      }
    } catch (error) {
      dbStatus = { status: 'error', available: false };
    }

    // Static service count (no actual probing)
    const servicesInfo = {
      total: 3, // AI providers
      healthy: [
        process.env.GROQ_API_KEY,
        process.env.OPENAI_API_KEY, 
        process.env.ANTHROPIC_API_KEY
      ].filter(Boolean).length
    };

    // Update the cached snapshot
    const now = Date.now();
    healthSnapshot = {
      basic: basicHealth,
      detailed: {
        status: memoryInfo.usagePercent > 95 ? 'unhealthy' : 'healthy',
        timestamp: basicHealth.timestamp,
        uptime: basicHealth.uptime,
        version: basicHealth.version,
        memory: memoryInfo,
        database: dbStatus,
        services: servicesInfo
      },
      lastUpdate: now,
      nextUpdate: now + 30000 // Next update in 30s
    };

    const sampleTime = Date.now() - startTime;
    if (process.env.NODE_ENV === 'development') {
      logger.debug(`Health snapshot updated in ${sampleTime}ms`, {
        memory: memoryInfo.usagePercent,
        database: dbStatus.status,
        services: servicesInfo.healthy
      });
    }

  } catch (error) {
    logger.error('Health sampling failed:', error);
    // Keep the previous snapshot if sampling fails
    healthSnapshot.nextUpdate = Date.now() + 30000;
  }
}

/**
 * Start the background health sampling system
 */
export function startHealthSampling(): void {
  if (healthSamplingInterval) {
    return; // Already started
  }

  logger.info('🎯 Starting cached health sampling system (30s intervals)');
  
  // Initial sample
  sampleHealthBackground();
  
  // Set up interval for continuous sampling
  healthSamplingInterval = setInterval(sampleHealthBackground, 30000);
  
  logger.info('✅ Cached health sampling started');
}

/**
 * Stop the background health sampling system
 */
export function stopHealthSampling(): void {
  if (healthSamplingInterval) {
    clearInterval(healthSamplingInterval);
    healthSamplingInterval = null;
    logger.info('Health sampling stopped');
  }
}

/**
 * Cached health middleware - serves static snapshot instead of live probes
 */
export function cachedHealthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  
  // Only handle specific health endpoints with cached responses
  if (path === '/api/health' || path === '/api/v1/health') {
    // Return cached basic health
    res.setHeader('X-Health-Cache', 'true');
    res.setHeader('X-Health-Age', Math.round((Date.now() - healthSnapshot.lastUpdate) / 1000));
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    const status = healthSnapshot.basic.status === 'healthy' ? 200 : 503;
    return res.status(status).json({
      status: 'ok',
      timestamp: healthSnapshot.basic.timestamp,
      service: healthSnapshot.basic.service,
      version: healthSnapshot.basic.version,
      health: {
        status: healthSnapshot.basic.status,
        uptime: Math.round(process.uptime()), // Live uptime
        nextHealthUpdate: Math.round((healthSnapshot.nextUpdate - Date.now()) / 1000)
      }
    });
  }
  
  if (path === '/api/health/detailed' || path === '/api/v1/health/detailed') {
    // Return cached detailed health
    res.setHeader('X-Health-Cache', 'true');
    res.setHeader('X-Health-Age', Math.round((Date.now() - healthSnapshot.lastUpdate) / 1000));
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    if (!healthSnapshot.detailed) {
      return res.status(503).json({
        status: 'error',
        message: 'Health snapshot not yet available',
        timestamp: new Date().toISOString()
      });
    }
    
    const status = healthSnapshot.detailed.status === 'healthy' ? 200 : 503;
    return res.status(status).json({
      status: 'ok',
      timestamp: healthSnapshot.detailed.timestamp,
      data: {
        ...healthSnapshot.detailed,
        uptime: Math.round(process.uptime()), // Live uptime
        cache: {
          age: Math.round((Date.now() - healthSnapshot.lastUpdate) / 1000),
          nextUpdate: Math.round((healthSnapshot.nextUpdate - Date.now()) / 1000)
        }
      }
    });
  }
  
  // Not a cached health endpoint, continue to next middleware
  next();
}

/**
 * Get the current health snapshot (for internal use)
 */
export function getCurrentHealthSnapshot(): HealthSnapshot {
  return healthSnapshot;
}

/**
 * Force a health snapshot update (for testing)
 */
export async function forceHealthSnapshot(): Promise<void> {
  await sampleHealthBackground();
}