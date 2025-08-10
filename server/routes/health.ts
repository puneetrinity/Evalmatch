/**
 * Health and System Status Routes
 * Handles health checks, migration status, and system monitoring
 */

import { Router, Request, Response } from "express";
import { logger } from "../lib/logger";
import {
  basicHealthCheck,
  detailedHealthCheck,
  readinessProbe,
  livenessProbe,
} from "../middleware/health-checks";

const router = Router();

// Basic health check endpoint - Fast response for load balancers
router.get("/health", basicHealthCheck);

// Detailed health check endpoint - Comprehensive system status
router.get("/health/detailed", detailedHealthCheck);

// Kubernetes-style readiness probe
router.get("/ready", readinessProbe);

// Kubernetes-style liveness probe
router.get("/live", livenessProbe);

// Migration status endpoint - Monitor database schema migrations
router.get("/migration-status", async (req: Request, res: Response) => {
  try {
    const { getMigrationStatus } = await import("../lib/db-migrations");
    const status = await getMigrationStatus();

    res.json({
      success: true,
      data: {
        migrations: status,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Migration status check failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check migration status",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Database health status endpoint - Monitor database connection health
router.get("/db-status", async (req: Request, res: Response) => {
  try {
    // Get comprehensive database status
    const { 
      getConnectionStats, 
      getPoolHealth, 
      getConnectionLeakDetails, 
      testDatabaseConnection,
      isDatabaseAvailable 
    } = await import("../database");

    const startTime = Date.now();
    
    // Perform multiple health checks in parallel
    const [connectionStats, poolHealth, leakDetails, connectivityTest] = await Promise.allSettled([
      Promise.resolve(getConnectionStats()),
      Promise.resolve(getPoolHealth()),
      Promise.resolve(getConnectionLeakDetails()),
      testDatabaseConnection(),
    ]);

    const responseTime = Date.now() - startTime;
    const isAvailable = isDatabaseAvailable();

    // Process results safely
    const stats = connectionStats.status === 'fulfilled' ? connectionStats.value : null;
    const health = poolHealth.status === 'fulfilled' ? poolHealth.value : null;
    const leaks = leakDetails.status === 'fulfilled' ? leakDetails.value : null;
    const connectivity = connectivityTest.status === 'fulfilled' ? connectivityTest.value : null;

    // Determine overall database status
    let overallStatus = 'healthy';
    const issues = [];

    if (!isAvailable) {
      overallStatus = 'unhealthy';
      issues.push('Database not available');
    } else if (!health?.healthy) {
      overallStatus = 'degraded';
      issues.push('Pool health issues detected');
    } else if (connectivity && !connectivity.success) {
      overallStatus = 'degraded';
      issues.push('Connectivity test failed');
    }

    // Check for specific issues
    if ((leaks as any)?.summary?.potentialLeaks > 0) {
      if ((leaks as any).summary.potentialLeaks > 5) {
        overallStatus = 'unhealthy';
      } else if (overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
      issues.push(`${(leaks as any).summary.potentialLeaks} potential connection leaks detected`);
    }

    if ((stats as any)?.connectionSuccessRate < 95) {
      if (overallStatus === 'healthy') overallStatus = 'degraded';
      issues.push(`Low connection success rate: ${(stats as any).connectionSuccessRate}%`);
    }

    if ((stats as any)?.querySuccessRate < 90) {
      overallStatus = 'unhealthy';
      issues.push(`Low query success rate: ${(stats as any).querySuccessRate}%`);
    }

    const response = {
      success: overallStatus !== 'unhealthy',
      data: {
        status: overallStatus,
        available: isAvailable,
        responseTime,
        issues: issues.length > 0 ? issues : undefined,
        connectivity: connectivity ? {
          success: connectivity.success,
          message: connectivity.message,
          details: connectivity.details,
        } : null,
        connectionPool: stats ? {
          totalConnections: stats.totalConnections,
          activeConnections: stats.activeConnections,
          failedConnections: stats.failedConnections,
          connectionSuccessRate: stats.connectionSuccessRate,
          uptime: stats.uptime,
          poolInfo: stats.poolInfo,
          circuitBreakerState: stats.circuitBreakerState,
        } : null,
        queryPerformance: stats ? {
          totalQueries: stats.totalQueries,
          successfulQueries: stats.successfulQueries,
          failedQueries: stats.failedQueries,
          querySuccessRate: stats.querySuccessRate,
          averageQueryTime: stats.queryPerformance.averageTime,
          maxQueryTime: stats.queryPerformance.maxTime,
          slowQueries: stats.queryPerformance.slowQueries,
          lastSuccessfulQuery: stats.lastSuccessfulQuery,
        } : null,
        connectionLeaks: leaks ? {
          summary: leaks.summary,
          thresholds: leaks.thresholds,
          activeConnections: leaks.activeConnections.length > 0 ? leaks.activeConnections.slice(0, 10) : undefined, // Limit to top 10
        } : null,
        healthMetrics: health ? {
          healthy: health.healthy,
          connections: health.metrics.connections,
          performance: health.metrics.performance,
          errors: health.metrics.errors,
          circuitBreaker: health.metrics.circuitBreaker,
        } : null,
      },
      timestamp: new Date().toISOString(),
    };

    // Set appropriate HTTP status
    const httpStatus = overallStatus === 'unhealthy' ? 503 : overallStatus === 'degraded' ? 200 : 200;
    if (overallStatus === 'degraded') {
      res.setHeader('X-Health-Warning', 'degraded');
    } else if (overallStatus === 'unhealthy') {
      res.setHeader('X-Health-Status', 'unhealthy');
    }

    res.status(httpStatus).json(response);

    // Log detailed health check results
    logger.info('Database health check completed', {
      status: overallStatus,
      responseTime,
      issues: issues.length,
      connectionLeaks: leaks?.summary.potentialLeaks || 0,
      querySuccessRate: stats?.querySuccessRate || 0,
    });

  } catch (error) {
    logger.error("Database status check failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check database status",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Connection leak monitoring endpoint - Detailed leak detection information
router.get("/connection-leaks", async (req: Request, res: Response) => {
  try {
    const { getConnectionLeakDetails, getConnectionStats } = await import("../database");
    
    const startTime = Date.now();
    const [leakDetails, connectionStats] = await Promise.allSettled([
      Promise.resolve(getConnectionLeakDetails()),
      Promise.resolve(getConnectionStats()),
    ]);

    const responseTime = Date.now() - startTime;

    const leaks = leakDetails.status === 'fulfilled' ? leakDetails.value : null;
    const stats = connectionStats.status === 'fulfilled' ? connectionStats.value : null;

    if (!leaks) {
      return res.status(500).json({
        success: false,
        error: "Failed to retrieve connection leak details",
        timestamp: new Date().toISOString(),
      });
    }

    // Determine alert level based on leak severity
    let alertLevel = 'info';
    const recommendations = [];

    if (leaks.summary.potentialLeaks > 10) {
      alertLevel = 'critical';
      recommendations.push('Immediate investigation required - high number of connection leaks detected');
      recommendations.push('Consider restarting the application to clear leaked connections');
    } else if (leaks.summary.potentialLeaks > 5) {
      alertLevel = 'warning';
      recommendations.push('Monitor connection usage patterns and investigate potential leaks');
    } else if (leaks.summary.staleConnections > 0) {
      alertLevel = 'warning';
      recommendations.push('Stale connections detected - review query patterns and connection handling');
    } else if (leaks.summary.total > 20) {
      alertLevel = 'info';
      recommendations.push('High number of active connections - monitor for performance impact');
    }

    // Add specific recommendations based on patterns
    if (leaks.summary.healthCheckConnections > 5) {
      recommendations.push('High number of health check connections - may indicate health check issues');
    }

    if (leaks.summary.oldestConnectionAge > 600000) { // 10 minutes
      recommendations.push('Very old connections detected - investigate long-running operations');
    }

    const response = {
      success: true,
      data: {
        alertLevel,
        summary: {
          ...leaks.summary,
          oldestConnectionAgeMinutes: Math.round(leaks.summary.oldestConnectionAge / 60000),
          responseTime,
        },
        thresholds: {
          ...leaks.thresholds,
          leakThresholdMinutes: Math.round(leaks.thresholds.leakThreshold / 60000),
          staleThresholdMinutes: Math.round(leaks.thresholds.staleThreshold / 60000),
        },
        activeConnections: leaks.activeConnections.map(conn => ({
          ...conn,
          ageMinutes: Math.round(conn.age / 60000),
          timeSinceLastUseMinutes: Math.round(conn.timeSinceLastUse / 60000),
        })),
        poolStatistics: stats ? {
          totalConnections: stats.totalConnections,
          activeConnections: stats.activeConnections,
          poolInfo: stats.poolInfo,
          connectionLeaks: (stats as any).connectionLeaks,
        } : null,
        recommendations: recommendations.length > 0 ? recommendations : undefined,
      },
      timestamp: new Date().toISOString(),
    };

    // Set appropriate HTTP status and headers based on alert level
    let httpStatus = 200;
    if (alertLevel === 'critical') {
      httpStatus = 503;
      res.setHeader('X-Alert-Level', 'critical');
    } else if (alertLevel === 'warning') {
      res.setHeader('X-Alert-Level', 'warning');
    }

    res.status(httpStatus).json(response);

    // Log connection leak monitoring results
    logger.info('Connection leak monitoring completed', {
      alertLevel,
      totalConnections: leaks.summary.total,
      potentialLeaks: leaks.summary.potentialLeaks,
      staleConnections: leaks.summary.staleConnections,
      responseTime,
    });

  } catch (error) {
    logger.error("Connection leak monitoring failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to monitor connection leaks",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Debug endpoint - System debugging information
router.get("/debug", async (req: Request, res: Response) => {
  try {
    const { config } = await import("../config/unified-config");

    const debugInfo = {
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      isDatabaseEnabled: config.database.enabled,
      platform: process.platform,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      railwayEnv: !!process.env.RAILWAY_ENVIRONMENT,
      databaseUrl: process.env.DATABASE_URL ? "SET" : "MISSING",
      groqApi: process.env.GROQ_API_KEY ? "SET" : "MISSING",
      openaiApi: process.env.OPENAI_API_KEY ? "SET" : "MISSING",
      anthropicApi: process.env.ANTHROPIC_API_KEY ? "SET" : "MISSING",
    };

    res.json({
      success: true,
      data: debugInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Debug endpoint error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get debug information",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Service status endpoint - AI provider and service availability
router.get("/service-status", async (req: Request, res: Response) => {
  try {
    const services = {
      timestamp: new Date().toISOString(),
      groq: {
        available: false,
        configured: false,
        statusMessage: "Not configured",
      },
      openai: {
        available: false,
        configured: false,
        statusMessage: "Not configured",
      },
      anthropic: {
        available: false,
        configured: false,
        statusMessage: "Not configured",
      },
    };

    // Check Groq service
    try {
      const groq = await import("../lib/groq");
      const groqStatus = groq.getGroqServiceStatus();
      services.groq = {
        available: groqStatus.isAvailable,
        configured: groqStatus.isConfigured,
        statusMessage: groqStatus.statusMessage,
      };
    } catch (error) {
      services.groq.statusMessage = "Import failed";
    }

    // Check OpenAI service
    try {
      const openai = await import("../lib/openai");
      const openaiStatus = openai.getOpenAIServiceStatus();
      services.openai = {
        available: (typeof openaiStatus === 'object' && openaiStatus && 'isAvailable' in openaiStatus) ? Boolean(openaiStatus.isAvailable) : false,
        configured: !!(typeof openaiStatus === 'object' && openaiStatus && 'apiUsageStats' in openaiStatus && openaiStatus.apiUsageStats),
        statusMessage: "OpenAI service available",
      };
    } catch (error) {
      services.openai.statusMessage = "Import failed";
    }

    // Check Anthropic service
    try {
      const anthropic = await import("../lib/anthropic");
      const anthropicStatus = anthropic.getAnthropicServiceStatus();
      services.anthropic = {
        available:
          anthropicStatus.isAnthropicAvailable || anthropicStatus.isAvailable,
        configured: !!anthropicStatus.apiUsageStats,
        statusMessage: "Anthropic service available",
      };
    } catch (error) {
      services.anthropic.statusMessage = "Import failed";
    }

    res.json({
      success: true,
      data: {
        services,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Service status check failed:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check service status",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
