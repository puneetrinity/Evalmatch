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

/**
 * Register all modular routes with the Express app
 * Supports both legacy (/api) and versioned (/api/v1) routes
 */
export function registerModularRoutes(app: Express): void {
  // Register versioned routes (v1)
  registerV1Routes(app);
  
  // Register legacy routes for backward compatibility
  registerLegacyRoutes(app);
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

  // Resume management routes
  app.use("/api/resumes", resumeRoutes);

  // Batch management routes
  app.use("/api/batches", batchRoutes);

  // Job description management routes
  app.use("/api/job-descriptions", jobRoutes);

  // Analysis and matching routes
  app.use("/api/analysis", analysisRoutes);

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
    deprecationNotice: string;
  };
} {
  return {
    totalModules: 9,
    modules: [
      "health (5 routes)",
      "user (2 routes)",
      "tokens (6 routes)",
      "resumes (4 routes)",
      "batches (6 routes)",
      "jobs (5 routes)",
      "analysis (6 routes)",
      "admin (5 routes)",
      "debug (6 routes)",
    ],
    estimatedRoutes: 90, // Double routes for v1 + legacy support
    versioning: {
      v1Routes: 45,
      legacyRoutes: 45,
      deprecationNotice: "Legacy /api/* routes are deprecated. Use /api/v1/* instead."
    }
  };
}
