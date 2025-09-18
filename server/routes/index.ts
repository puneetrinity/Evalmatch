/**
 * Modular Routes Index
 * Consolidates all route modules into a single registration system
 */

import { Express } from "express";
import healthRoutes from "./health";
import systemHealthRoutes from "./system-health";
import userRoutes from "./user";
import resumeRoutes from "./resumes";
import jobRoutes from "./jobs";
import analysisRoutes from "./analysis";
import adminRoutes from "./admin";
import debugRoutes from "./debug";
import dbCheckRoutes from "./db-check";
import batchRoutes from "./batches";
import versionRoutes from "./version";
import { monitoringRouter } from "./monitoring";
import { tokensRouter } from "./tokens";
import creditsRoutes from "./credits";
import authTrackingRoutes from "./auth-tracking";
import webhooksRoutes from "./webhooks";
import { config } from "../config/unified-config";
import { createDeprecationMiddleware, DEPRECATION_CONFIGS } from "../lib/deprecation-headers";
import { logger } from "../lib/logger";

/**
 * Register all modular routes with the Express app
 * Supports both legacy (/api) and versioned (/api/v1) routes
 */
export function registerModularRoutes(app: Express): void {
  // Always register versioned routes (v1)
  registerV1Routes(app);
  
  // Conditionally register legacy routes based on feature flag
  if (config.features.enableLegacyRoutes) {
    logger.info('🔄 Legacy routes enabled via feature flag');
    registerLegacyRoutes(app);
  } else {
    logger.info('⚠️  Legacy routes disabled via feature flag - clients must use /api/v1/*');
  }
}

/**
 * Register v1 API routes
 */
function registerV1Routes(app: Express): void {
  // API version information routes
  app.use("/api/v1", versionRoutes);

  // Health and system monitoring routes
  app.use("/api/v1", healthRoutes);
  app.use("/api/v1/health", systemHealthRoutes);
  app.use("/api/v1/monitoring", monitoringRouter);

  // User and authentication routes
  app.use("/api/v1", userRoutes);
  
  // Token management routes
  app.use("/api/v1/tokens", tokensRouter);

  // Credit system routes
  app.use("/api/v1/credits", creditsRoutes);

  // Auth tracking routes
  app.use("/api/v1", authTrackingRoutes);

  // Webhook routes
  app.use("/api/v1/webhooks", webhooksRoutes);

  // Resume management routes
  app.use("/api/v1/resumes", resumeRoutes);

  // Batch management routes
  app.use("/api/v1/batches", batchRoutes);

  // Job description management routes
  app.use("/api/v1/job-descriptions", jobRoutes);

  // Analysis and matching routes
  app.use("/api/v1/analysis", analysisRoutes);

  // Admin routes
  app.use("/api/v1/admin", adminRoutes);

  // Debug and system status routes
  app.use("/api/v1/debug", debugRoutes);
  app.use("/api/v1/debug", dbCheckRoutes);
}

/**
 * Register legacy routes for backward compatibility
 * @deprecated Use /api/v1/* routes instead
 */
function registerLegacyRoutes(app: Express): void {
  // Create deprecation middleware for all legacy routes
  const legacyDeprecationMiddleware = createDeprecationMiddleware({
    deprecatedDate: '2024-01-15T00:00:00Z',
    sunsetDate: '2024-06-01T00:00:00Z',
    migrationUrl: 'https://docs.evalmatch.com/api/migration/v2',
    message: 'Legacy API routes are deprecated. Use /api/v1/* endpoints for improved performance and features.'
  });

  // Apply deprecation headers to all legacy routes
  app.use("/api", legacyDeprecationMiddleware);

  // API version information routes (also available on legacy)
  app.use("/api", versionRoutes);

  // Health and system monitoring routes
  app.use("/api", healthRoutes);
  app.use("/api/health", systemHealthRoutes);
  app.use("/api/monitoring", monitoringRouter);

  // User and authentication routes
  app.use("/api", userRoutes);
  
  // Token management routes (legacy)
  app.use("/api/tokens", tokensRouter);

  // Credit system routes (legacy)
  app.use("/api/credits", creditsRoutes);

  // Auth tracking routes (legacy)
  app.use("/api", authTrackingRoutes);

  // Webhook routes (legacy)
  app.use("/api/webhooks", webhooksRoutes);

  // Resume management routes
  app.use("/api/resumes", resumeRoutes);

  // Batch management routes
  app.use("/api/batches", batchRoutes);

  // Job description management routes
  app.use("/api/job-descriptions", jobRoutes);

  // Analysis and matching routes (high priority for migration)
  app.use("/api/analysis", 
    createDeprecationMiddleware(DEPRECATION_CONFIGS.LEGACY_ANALYZE_TIERED),
    analysisRoutes
  );

  // Admin routes
  app.use("/api/admin", adminRoutes);

  // Debug and system status routes
  app.use("/api/debug", debugRoutes);
  app.use("/api/debug", dbCheckRoutes);
}

/**
 * Get summary of all registered routes for monitoring
 */
export function getRoutesSummary(): {
  totalModules: number;
  modules: string[];
  estimatedRoutes: number;
  versioning: {
    v1Routes: number;
    legacyRoutes: number;
    legacyEnabled: boolean;
    deprecationNotice: string;
  };
} {
  const legacyEnabled = config.features.enableLegacyRoutes;
  
  return {
    totalModules: 10,
    modules: [
      "health (5 routes)",
      "user (2 routes)",
      "tokens (6 routes)",
      "credits (6 routes)",
      "resumes (4 routes)",
      "batches (6 routes)",
      "jobs (5 routes)",
      "analysis (6 routes)",
      "admin (5 routes)",
      "debug (6 routes)",
    ],
    estimatedRoutes: legacyEnabled ? 102 : 51, // Conditional route count
    versioning: {
      v1Routes: 51,
      legacyRoutes: legacyEnabled ? 51 : 0,
      legacyEnabled,
      deprecationNotice: legacyEnabled 
        ? "Legacy /api/* routes are deprecated. Use /api/v1/* instead."
        : "Legacy routes disabled. Use /api/v1/* endpoints only."
    }
  };
}
