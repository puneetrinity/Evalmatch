/**
 * Monitoring and Logging System
 *
 * This module exports all monitoring and logging components
 * and provides initialization functions for the application.
 */

import { Express, Router } from "express";
import { monitoringMiddleware } from "./middleware";
import { startMetricsReporting } from "./metrics";
import { logger } from "../config/logger";

/**
 * Initialize monitoring for the application
 *
 * This sets up:
 * 1. Request logging
 * 2. Error handling
 * 3. Metrics collection
 * 4. Periodic reporting
 */
export function initializeMonitoring(app: Express): void {
  // Apply HTTP request logging middleware
  app.use(monitoringMiddleware.httpLogger);

  // Apply request tracking middleware for metrics
  app.use(monitoringMiddleware.requestTracking);

  // Add metrics endpoint (before error handling)
  const router = Router();
  router.get("/api/metrics", monitoringMiddleware.metricsEndpoint);
  app.use(router);

  // Apply error handling middleware (should be last)
  app.use(monitoringMiddleware.errorHandling);

  // Start periodic metrics reporting (hourly by default)
  const reportingInterval = process.env.METRICS_REPORTING_INTERVAL_MS
    ? parseInt(process.env.METRICS_REPORTING_INTERVAL_MS)
    : 3600000; // Default: 1 hour

  startMetricsReporting(reportingInterval);

  logger.info(
    `Monitoring initialized with reporting interval: ${reportingInterval}ms`,
  );
}

// Export all monitoring components
export { logger } from "../config/logger";
export { monitoringMiddleware } from "./middleware";
export * from "./metrics";
