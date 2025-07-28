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
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000, // 5 second timeout
      idleTimeoutMillis: 10000, // 10 second idle timeout
    });

    logger.info('🔧 Running emergency database schema migration...');

    // Add missing columns if they don't exist - with timeout protection
    const migrations = [
      // Job descriptions table missing columns
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS user_id INTEGER',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS requirements JSON',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS skills JSON',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS experience TEXT',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS embedding JSON',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS requirements_embedding JSON',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS analyzed_data JSON',
      
      // Resumes table missing columns  
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS user_id TEXT',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS session_id TEXT',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_size INTEGER',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_type TEXT',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS analyzed_data JSON',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS skills JSON',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS embedding JSON',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS skills_embedding JSON',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()',
      'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()'
    ];

    // Run migrations with timeout protection
    const migrationPromise = (async () => {
      for (const query of migrations) {
        try {
          await pool.query(query);
        } catch (queryError) {
          logger.warn(`Migration query failed (continuing): ${query}`, queryError);
        }
      }
    })();

    // Add 10 second timeout to prevent hanging
    await Promise.race([
      migrationPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Migration timeout')), 10000))
    ]);

    await pool.end();
    logger.info('✅ Database migration completed successfully!');
  } catch (error) {
    logger.error('❌ Database migration failed:', error);
    logger.info('⚠️  Continuing with memory storage fallback...');
  }
}

const app = express();

// Trust proxy for Railway deployment (needed for rate limiting and real IP detection)
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com", "https://*.googleapis.com", "https://ealmatch-railway.firebaseapp.com", "https://securetoken.googleapis.com", "https://www.googleapis.com"], // Allow Firebase OAuth popups
      childSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com", "https://*.googleapis.com", "https://ealmatch-railway.firebaseapp.com", "https://securetoken.googleapis.com", "https://www.googleapis.com"], // Allow Firebase OAuth popups
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false // Allow embedding for certain features
}));

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow Railway domains, Firebase domains, and localhost for development
    const allowedOrigins = [
      'https://web-production-392cc.up.railway.app',
      'https://ealmatch-railway.firebaseapp.com',
      'https://accounts.google.com',
      'https://securetoken.googleapis.com',
      'https://www.googleapis.com',
      'http://localhost:5173',
      'http://localhost:5000',
      'http://localhost:3000',
      'http://localhost:8080'
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
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'X-Firebase-Auth',
    'X-Client-Version',
    'X-Firebase-gmpid'
  ],
  exposedHeaders: ['Content-Length', 'X-Request-ID'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  preflightContinue: false,
  maxAge: 86400 // Cache preflight requests for 24 hours
};

// Apply CORS to all API routes
app.use('/api', cors(corsOptions));

// Handle OPTIONS requests specifically for all API endpoints
app.options('/api/*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize monitoring and logging for production readiness
initializeMonitoring(app);

// Keep the legacy logging in development for backward compatibility
if (process.env.NODE_ENV === "development") {
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
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else if (process.env.SERVE_STATIC !== 'false') {
    // Only serve static files if not disabled (nginx will handle in production)
    serveStatic(app);
  } else {
    logger.info('Static file serving disabled - using reverse proxy');
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
