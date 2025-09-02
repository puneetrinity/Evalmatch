/**
 * Phase 2.3: System health and metrics API endpoints
 * Provides monitoring dashboard data and health status
 */

import express from "express";
import { metricsCollector } from "../lib/metrics-collector";
import { serviceLevelManager } from "../lib/service-level-manager";
import { logger } from "../lib/logger";

const router = express.Router();

/**
 * GET /api/health - Quick health check endpoint
 * Returns basic health status for load balancers and monitoring
 */
router.get("/", async (req, res) => {
  try {
    const summary = await metricsCollector.getHealthSummary();
    
    // Return appropriate HTTP status based on health
    const statusCode = summary.score >= 60 ? 200 : 503;
    
    res.status(statusCode).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "evalmatch-api",
      version: "1.0.0",
      health: summary
    });
    
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(503).json({
      status: "error", 
      timestamp: new Date().toISOString(),
      service: "evalmatch-api",
      error: "Health check failed"
    });
  }
});

/**
 * GET /api/health/detailed - Comprehensive health metrics
 * Returns full system metrics for monitoring dashboards
 */
router.get("/detailed", async (req, res) => {
  try {
    const metrics = await metricsCollector.collectMetrics();
    
    res.json({
      status: "ok",
      data: metrics
    });
    
  } catch (error) {
    logger.error("Detailed health check failed:", error);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Failed to collect detailed metrics"
    });
  }
});

/**
 * GET /api/health/service-level - Current service level status
 * Returns service level configuration and recent changes
 */
router.get("/service-level", async (req, res) => {
  try {
    const config = serviceLevelManager.getCurrentConfig();
    const metrics = serviceLevelManager.getMetrics();
    
    res.json({
      status: "ok",
      data: {
        current: config,
        metrics: metrics,
        degradationThresholds: {
          memory: { reduced: "1GB", basic: "1.5GB", maintenance: "2GB" },
          queueDepth: { reduced: 100, basic: 200, maintenance: 300 },
          errorRate: { reduced: "5%", basic: "15%", maintenance: "30%" }
        }
      }
    });
    
  } catch (error) {
    logger.error("Service level check failed:", error);
    res.status(500).json({
      status: "error",
      error: "Failed to get service level status"
    });
  }
});

/**
 * POST /api/health/service-level - Manually set service level
 * Allows administrators to override automatic service level adjustment
 */
router.post("/service-level", async (req, res) => {
  try {
    const { level, reason } = req.body;
    
    if (!["FULL", "REDUCED", "BASIC", "MAINTENANCE"].includes(level)) {
      return res.status(400).json({
        status: "error",
        error: "Invalid service level. Must be one of: FULL, REDUCED, BASIC, MAINTENANCE"
      });
    }
    
    serviceLevelManager.setServiceLevel(level, reason || "Manual API override");
    
    res.json({
      status: "ok",
      message: `Service level set to ${level}`,
      data: serviceLevelManager.getCurrentConfig()
    });
    
  } catch (error) {
    logger.error("Failed to set service level:", error);
    res.status(500).json({
      status: "error",
      error: "Failed to set service level"
    });
  }
});

/**
 * GET /api/health/alerts - Current system alerts
 * Returns active alerts and warnings for monitoring systems
 */
router.get("/alerts", async (req, res) => {
  try {
    const summary = await metricsCollector.getHealthSummary();
    await metricsCollector.collectMetrics();
    
    // Generate structured alerts
    const alerts = summary.alerts.map((alert, index) => ({
      id: `alert-${Date.now()}-${index}`,
      severity: summary.score < 60 ? "critical" : summary.score < 80 ? "warning" : "info",
      message: alert,
      timestamp: new Date().toISOString(),
      category: categorizeAlert(alert)
    }));
    
    res.json({
      status: "ok",
      data: {
        totalAlerts: alerts.length,
        healthScore: summary.score,
        systemStatus: summary.status,
        alerts: alerts,
        summary: {
          critical: alerts.filter(a => a.severity === "critical").length,
          warning: alerts.filter(a => a.severity === "warning").length,
          info: alerts.filter(a => a.severity === "info").length
        }
      }
    });
    
  } catch (error) {
    logger.error("Failed to get alerts:", error);
    res.status(500).json({
      status: "error",
      error: "Failed to get system alerts"
    });
  }
});

/**
 * GET /api/health/performance - Performance metrics only
 * Returns focused performance data for monitoring dashboards
 */
router.get("/performance", async (req, res) => {
  try {
    const metrics = await metricsCollector.collectMetrics();
    
    res.json({
      status: "ok",
      data: {
        timestamp: metrics.timestamp,
        performance: metrics.performance,
        serviceLevel: metrics.serviceLevel.current,
        healthScore: metrics.healthScore,
        business: {
          analysesToday: metrics.business.analysesCompletedToday,
          avgResponseTime: metrics.business.averageAnalysisTimeMs,
          costSavings: metrics.business.costSavingsFromCache
        }
      }
    });
    
  } catch (error) {
    logger.error("Failed to get performance metrics:", error);
    res.status(500).json({
      status: "error",
      error: "Failed to get performance metrics"
    });
  }
});

/**
 * GET /api/health/providers - AI provider status
 * Returns status of all AI providers (placeholder for Phase 2.1)
 */
router.get("/providers", async (req, res) => {
  try {
    const metrics = await metricsCollector.collectMetrics();
    
    res.json({
      status: "ok",
      data: {
        timestamp: metrics.timestamp,
        providers: metrics.providers,
        summary: {
          total: Object.keys(metrics.providers).length,
          available: Object.values(metrics.providers).filter(p => p.available).length,
          healthy: Object.values(metrics.providers).filter(p => p.status === "HEALTHY").length
        }
      }
    });
    
  } catch (error) {
    logger.error("Failed to get provider status:", error);
    res.status(500).json({
      status: "error",
      error: "Failed to get provider status"
    });
  }
});

/**
 * Helper function to categorize alerts
 */
function categorizeAlert(alert: string): string {
  if (alert.includes("response time")) return "performance";
  if (alert.includes("success rate")) return "reliability";
  if (alert.includes("cache")) return "cache";
  if (alert.includes("memory")) return "system";
  if (alert.includes("queue")) return "queue";
  return "general";
}

export default router;