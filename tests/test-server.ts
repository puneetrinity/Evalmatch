/**
 * Test Server Setup
 * Creates an Express app instance for testing without starting the actual server
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { config } from "../server/config/unified-config";
import { initializeDatabase } from "../server/database";
import { globalErrorHandler } from "../server/middleware/global-error-handler";
import { initializeHealthChecks } from "../server/middleware/health-checks";

let appInstance: express.Application | null = null;

export async function createTestApp(): Promise<express.Application> {
  if (appInstance) {
    return appInstance;
  }

  const app = express();

  // Trust proxy for testing
  app.set('trust proxy', true);

  // Generate CSP nonce for each request
  app.use((req, res, next) => {
    res.locals.nonce = Math.random().toString(36).substring(2, 15);
    next();
  });

  // Basic security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disable for testing
    crossOriginEmbedderPolicy: false
  }));

  // CORS
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // Body parsing
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Initialize database if enabled
  if (config.database.enabled) {
    try {
      await initializeDatabase();
    } catch (error) {
      console.warn('Database initialization failed in tests:', error);
    }
  }

  // Initialize health checks
  try {
    initializeHealthChecks();
  } catch (error) {
    console.warn('Health checks initialization failed in tests:', error);
  }

  // Register API routes
  registerRoutes(app);

  // Global error handler
  app.use(globalErrorHandler);

  appInstance = app;
  return app;
}

export function clearTestApp(): void {
  appInstance = null;
}