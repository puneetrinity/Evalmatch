// Only load dotenv in development, not in production (Railway provides env vars)
if (process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT) {
  import('dotenv').then(dotenv => dotenv.config());
}

import express from "express";
import cors from "cors";
import helmet from "helmet";

// Extend Express types
declare global {
  namespace Express {
    interface Locals {
      nonce?: string;
    }
    
    interface Request {
      id?: string;
    }
  }
}
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { config } from "./config/unified-config";
import { initializeDatabase } from "./database";
import { initializeFirebaseAuth } from "./auth/firebase-auth";
import { initializeMonitoring, logger } from "./monitoring";
import { globalErrorHandler, initializeGlobalErrorHandling } from "./middleware/global-error-handler";
import { initializeHealthChecks } from "./middleware/health-checks";
import { apiVersioningMiddleware } from './middleware/api-versioning';
import { validateEnvironmentOrExit } from "./lib/env-validator";
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger-config.js';

const app = express();

// Export app for testing purposes
export default app;

// Trust proxy for Railway deployment (needed for rate limiting and real IP detection)
app.set('trust proxy', 1); // Use 1 for single proxy (Railway)

// Generate CSP nonce for each request
app.use((req, res, next) => {
  res.locals.nonce = Math.random().toString(36).substring(2, 15);
  next();
});

// Security middleware with improved CSP (nonce-based)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://www.gstatic.com", "https://www.googleapis.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com", "https://*.googleapis.com", "https://securetoken.googleapis.com"],
      childSrc: ["'self'", "https://accounts.google.com", "https://*.firebaseapp.com", "https://*.googleapis.com", "https://securetoken.googleapis.com"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      upgradeInsecureRequests: config.env === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Critical fix for Firebase OAuth popup - set Cross-Origin-Opener-Policy
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Simplified CORS configuration using unified config
const corsOptions = {
  origin: config.env === 'development' ? true : config.security.corsOrigins,
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
  maxAge: 86400 // Cache preflight requests for 24 hours
};

// Apply CORS to all API routes (handles OPTIONS automatically)
app.use('/api', cors(corsOptions));

// Add API versioning middleware
app.use('/api', apiVersioningMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Initialize global error handling system
initializeGlobalErrorHandling();

// Initialize health check system
initializeHealthChecks();

// Initialize monitoring and logging for production readiness
initializeMonitoring(app);

// Keep the legacy logging in development for backward compatibility
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

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
  try {
    logger.info('🚀 Starting Evalmatch Application...');

    // CRITICAL: Validate environment variables first - fail fast if configuration is invalid
    logger.info('🔍 Validating environment configuration...');
    const envValidation = validateEnvironmentOrExit();
    
    if (envValidation.warnings.length > 0) {
      logger.info(`⚠️  Application starting with ${envValidation.warnings.length} configuration warning(s)`);
    } else {
      logger.info('✅ Environment validation completed successfully');
    }

    // Initialize Firebase Authentication first
    try {
      await initializeFirebaseAuth();
    } catch (error) {
      logger.error('Firebase Auth initialization failed:', error);
      if (config.env === 'production') {
        logger.error('Cannot start in production without authentication');
        process.exit(1);
      }
    }

    // Initialize database
    if (config.database.enabled) {
      try {
        logger.info('🗄️  Initializing PostgreSQL database...');
        await initializeDatabase();
        logger.info('✅ Database initialization completed successfully');
      } catch (error) {
        logger.error('Database initialization failed:', error);
        
        // Database failures should be fatal in all environments when database is enabled
        // This ensures consistent behavior and prevents silent fallbacks
        logger.error('CRITICAL: Cannot start application without functional database connection');
        logger.error('Check database configuration and connectivity');
        process.exit(1);
      }
    } else {
      logger.info('📝 Database disabled - using memory storage fallback');
    }

    // Initialize storage system
    try {
      logger.info('🏪 Initializing storage system...');
      const { initializeAppStorage } = await import("./storage");
      await initializeAppStorage();
      logger.info('✅ Storage system initialized successfully');
    } catch (error) {
      logger.error('Storage system initialization failed:', error);
      process.exit(1); // Storage is critical, exit if it fails
    }
    
    // Log final storage configuration
    if (config.database.enabled) {
      logger.info('💾 Using PostgreSQL database storage');
    } else {
      logger.info('🧠 Using in-memory storage (fallback mode)');
    }

    // Initialize skill learning scheduler if database is enabled
    if (config.database.enabled) {
      try {
        logger.info('🧠 Initializing consolidated skill learning system...');
        const { SkillLearningSystem } = await import('./lib/skill-learning');
        SkillLearningSystem.getInstance(); // Initialize the learning system
        logger.info('✅ Skill learning system initialized successfully');
      } catch (error) {
        logger.warn('Failed to start skill learning scheduler:', error);
        // Don't fail startup if scheduler fails to start
      }
    } else {
      logger.info('🧠 Skill learning scheduler disabled (no database)');
    }

    // Setup Swagger UI before registering routes
    logger.info('📚 Setting up API documentation...');
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'EvalMatch API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
        requestSnippetsEnabled: true,
        requestSnippets: {
          generators: {
            curl_bash: { title: 'cURL (bash)', syntax: 'bash' },
            curl_powershell: { title: 'cURL (PowerShell)', syntax: 'powershell' },
            javascript_fetch: { title: 'JavaScript (fetch)', syntax: 'javascript' }
          },
          defaultExpanded: true,
          languages: ['curl_bash', 'javascript_fetch']
        }
      }
    }));

    // Serve raw OpenAPI spec
    app.get('/api-docs.json', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });

    logger.info('✅ API documentation available at /api-docs');

    // Register all routes AFTER storage is initialized
    logger.info('🚗 Registering application routes...');
    registerRoutes(app);
    logger.info('✅ Routes registered successfully');

    // Global error handling middleware (replaces basic error handler)
    app.use(globalErrorHandler);

    // Use configured port from unified config
    const port = config.port;
    
    // Start the server AFTER all initialization is complete
    const server = app.listen(port, "0.0.0.0", () => {
      logger.info(`Server started successfully, listening on port ${port}`);
      log(`serving on port ${port}`); // Keep the original log for vite
    });

    // Railway-specific graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, initiating graceful database shutdown...`);
      
      try {
        // Stop accepting new connections
        server.close(() => {
          logger.info('HTTP server closed');
        });

        // Stop skill learning system
        if (config.database.enabled) {
          try {
            logger.info('Stopping consolidated skill learning system...');
            // The consolidated system handles its own cleanup automatically
            logger.info('Skill learning system stopped');
          } catch (error) {
            logger.warn('Error stopping skill learning scheduler:', error);
          }
        }

        // Close database connections gracefully
        if (config.database.enabled) {
          logger.info('Closing database connections gracefully...');
          const { closeDatabase } = await import('./database');
          await closeDatabase();
          logger.info('Database connections closed successfully');
        }

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Handle Railway SIGTERM signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Handle uncaught exceptions for Railway stability
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Setup Vite in development or serve static files in production
    if (config.env === 'development') {
      await setupVite(app, server);
      logger.info('🔥 Vite development server attached');
    } else if (config.features.staticFiles) {
      serveStatic(app);
      logger.info('📁 Static files served directly from Express');
    }

    logger.info('🎉 Evalmatch Application started successfully!', {
      environment: config.env,
      port: config.port,
      database: config.database.enabled ? 'PostgreSQL' : 'Memory',
      firebase: config.firebase.configured ? 'Configured' : 'Not Configured',
      aiProvider: config.ai.primary || 'None',
    });

  } catch (error) {
    logger.error('💥 Failed to start application:', error);
    process.exit(1);
  }
})();
