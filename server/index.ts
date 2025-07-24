import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { config } from "./config";
// import { initializeDatabase } from "./db-setup"; // imported conditionally below
import { initializeMonitoring, logger } from "./monitoring";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize monitoring and logging for production readiness
initializeMonitoring(app);

// Keep the legacy logging in development for backward compatibility
if (app.get("env") === "development") {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });
}

(async () => {
  // Initialize database schema if using PostgreSQL
  if (config.isDatabaseEnabled) {
    try {
      logger.info('Setting up database schema...');
      const { initializeDatabase } = await import("./db-setup");
      const result = await initializeDatabase();
      if (result.success) {
        logger.info('Database setup complete: ' + result.message);
      } else {
        logger.warn('Database setup issue: ' + result.message);
      }
    } catch (error) {
      logger.error({ error }, 'Failed to initialize database schema');
      logger.warn('Continuing with application startup, but database operations may fail');
    }
  }

  // Initialize storage system
  try {
    logger.info('Initializing storage system...');
    const { initializeAppStorage } = await import("./storage");
    await initializeAppStorage();
    logger.info('Storage system initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize storage system');
    process.exit(1); // Storage is critical, exit if it fails
  }
  
  // Log which type of storage we're using
  if (config.isDatabaseEnabled) {
    logger.info('Using PostgreSQL database storage');
  } else {
    logger.info('Using in-memory storage (fallback mode)');
  }

  const server = await registerRoutes(app);

  // Error handling - now handled by monitoring middleware
  // But keep this as a safety net for errors that might slip through
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error({ err }, `Error handler caught: ${message}`);
    
    // Only send response if headers not already sent
    if (!res.headersSent) {
      res.status(status).json({ 
        message,
        code: err.code || 'INTERNAL_ERROR',
        requestId: _req.id
      });
    }
    
    // Don't rethrow in production as it can crash the server
    if (app.get("env") !== "production") {
      throw err;
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Use Railway's PORT environment variable or fallback to 5000
  // Railway expects apps to use the PORT env var for proper routing
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    logger.info(`Server started successfully, listening on port ${port}`);
    log(`serving on port ${port}`); // Keep the original log for vite
  });
})();
