import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { config } from "./config";
// import { initializeDatabase } from "./db-setup"; // imported conditionally below
import { initializeMonitoring, logger } from "./monitoring";

// Emergency database migration
async function runEmergencyMigration() {
  if (!process.env.DATABASE_URL) {
    logger.info('No DATABASE_URL found, skipping migration (using memory storage)');
    return;
  }

  try {
    // Import pg dynamically
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    logger.info('🔧 Running emergency database schema migration...');

    // Add missing columns if they don't exist
    const migrations = [
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS user_id INTEGER',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS analyzed_data JSON',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS user_id TEXT',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS session_id TEXT',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS analyzed_data JSON'
    ];

    for (const query of migrations) {
      await pool.query(query);
    }

    await pool.end();
    logger.info('✅ Database migration completed successfully!');
  } catch (error) {
    logger.error('❌ Database migration failed:', error);
    logger.info('⚠️  Continuing with memory storage fallback...');
  }
}

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for development, configure for production
  crossOriginEmbedderPolicy: false // Allow embedding for certain features
}));

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow Railway domains and localhost for development
    const allowedOrigins = [
      'https://web-production-392cc.up.railway.app',
      'http://localhost:5173',
      'http://localhost:5000',
      'http://localhost:3000'
    ];
    
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV === 'development') {
      // In development, allow all origins
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400 // Cache preflight requests for 24 hours
};

app.use(cors(corsOptions));

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
      
      // First run emergency migration to fix missing columns
      await runEmergencyMigration();
      
      // Then run the original database setup
      const { initializeDatabase: originalInit } = await import("./db-setup");
      const result = await originalInit();
      if (result.success) {
        logger.info('Database setup complete: ' + result.message);
      } else {
        logger.warn('Database setup issue: ' + result.message);
      }
      
      // Then run enhanced features initialization
      logger.info('Initializing enhanced features...');
      const { initializeDatabase: enhancedInit } = await import("./lib/db-migrations");
      await enhancedInit();
      
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
