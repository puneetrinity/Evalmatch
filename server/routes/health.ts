/**
 * Health and System Status Routes
 * Handles health checks, migration status, and system monitoring
 */

import { Router, Request, Response } from 'express';
import { logger } from '../lib/logger';
import { 
  basicHealthCheck, 
  detailedHealthCheck, 
  readinessProbe, 
  livenessProbe 
} from '../middleware/health-checks';

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
    const { getMigrationStatus } = await import('../lib/db-migrations');
    const status = await getMigrationStatus();
    
    res.json({
      status: "ok",
      migrations: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Migration status check failed:', error);
    res.status(500).json({
      status: "error",
      message: "Failed to check migration status",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Database health status endpoint - Monitor database connection health
router.get("/db-status", async (req: Request, res: Response) => {
  try {
    // Default status when hybrid storage is not available
    let dbHealthStatus = {
      available: false,
      connectionStatus: 'unknown',
      lastCheck: new Date().toISOString(),
      message: 'Hybrid storage not available'
    };

    // Check if hybrid storage is available
    const { storage } = await import('../storage');
    
    if (storage && 'getHealthStatus' in storage && typeof storage.getHealthStatus === 'function') {
      try {
        dbHealthStatus = await storage.getHealthStatus();
      } catch (healthError) {
        logger.error('Health status check failed:', healthError);
        dbHealthStatus = {
          available: false,
          connectionStatus: 'error',
          lastCheck: new Date().toISOString(),
          message: healthError instanceof Error ? healthError.message : 'Health check failed'
        };
      }
    }

    res.json({
      status: dbHealthStatus.available ? "healthy" : "degraded",
      database: dbHealthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Database status check failed:', error);
    res.status(500).json({
      status: "error",
      message: "Failed to check database status",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug endpoint - System debugging information
router.get("/debug", async (req: Request, res: Response) => {
  try {
    const { config } = await import('../config');
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      isDatabaseEnabled: config.isDatabaseEnabled,
      platform: process.platform,
      nodeVersion: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      railwayEnv: !!process.env.RAILWAY_ENVIRONMENT,
      databaseUrl: process.env.DATABASE_URL ? 'SET' : 'MISSING',
      groqApi: process.env.GROQ_API_KEY ? 'SET' : 'MISSING',
      openaiApi: process.env.OPENAI_API_KEY ? 'SET' : 'MISSING',
      anthropicApi: process.env.ANTHROPIC_API_KEY ? 'SET' : 'MISSING'
    };

    res.json({
      status: "ok",
      debug: debugInfo
    });
  } catch (error) {
    logger.error('Debug endpoint error:', error);
    res.status(500).json({
      status: "error",
      message: "Failed to get debug information",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Service status endpoint - AI provider and service availability
router.get("/service-status", async (req: Request, res: Response) => {
  try {
    const services = {
      timestamp: new Date().toISOString(),
      groq: { available: false, configured: false, statusMessage: 'Not configured' },
      openai: { available: false, configured: false, statusMessage: 'Not configured' },
      anthropic: { available: false, configured: false, statusMessage: 'Not configured' }
    };

    // Check Groq service
    try {
      const groq = await import('../lib/groq');
      services.groq = groq.getGroqServiceStatus();
    } catch (error) {
      services.groq.statusMessage = 'Import failed';
    }

    // Check OpenAI service  
    try {
      const openai = await import('../lib/openai');
      services.openai = openai.getOpenAIServiceStatus();
    } catch (error) {
      services.openai.statusMessage = 'Import failed';
    }

    // Check Anthropic service
    try {
      const anthropic = await import('../lib/anthropic');
      services.anthropic = anthropic.getAnthropicServiceStatus();
    } catch (error) {
      services.anthropic.statusMessage = 'Import failed';
    }

    res.json({
      status: "ok",
      services
    });
  } catch (error) {
    logger.error('Service status check failed:', error);
    res.status(500).json({
      status: "error",
      message: "Failed to check service status",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;