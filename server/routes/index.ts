/**
 * Modular Routes Index
 * Consolidates all route modules into a single registration system
 */

import { Express } from "express";
import healthRoutes from "./health";
import userRoutes from "./user";
import resumeRoutes from "./resumes";
import jobRoutes from "./jobs";
import analysisRoutes from "./analysis";
import adminRoutes from "./admin";
import debugRoutes from "./debug";
import dbCheckRoutes from "./db-check";
import batchRoutes from "./batches";

/**
 * Register all modular routes with the Express app
 */
export function registerModularRoutes(app: Express): void {
  // Health and system monitoring routes
  app.use("/api", healthRoutes);

  // User and authentication routes
  app.use("/api", userRoutes);

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
} {
  return {
    totalModules: 8,
    modules: [
      "health (5 routes)",
      "user (2 routes)",
      "resumes (4 routes)",
      "batches (6 routes)",
      "jobs (5 routes)",
      "analysis (6 routes)",
      "admin (5 routes)",
      "debug (6 routes)",
    ],
    estimatedRoutes: 39, // Comprehensive debugging included + batch routes
  };
}
