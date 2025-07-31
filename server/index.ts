import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { config } from "./config/unified-config";
import { initializeDatabase } from "./database";
import { initializeFirebaseAuth } from "./auth/firebase-auth";
import { initializeMonitoring, logger } from "./monitoring";

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

// Critical fix for Firebase OAuth popup - set Cross-Origin-Opener-Policy
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// CORS configuration using unified config
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // Check against configured origins
    if (config.security.corsOrigins.includes(origin)) {
      callback(null, true);
    } else if (config.env === 'development') {
      // In development, allow all origins
      callback(null, true);
    } else {
      logger.warn('CORS blocked origin:', { origin, allowed: config.security.corsOrigins });
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
        
        if (config.env === 'production') {
          logger.error('Cannot start in production without database');
          process.exit(1);
        } else {
          logger.warn('Continuing with memory storage in development');
        }
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

  // Add simple root health check route for Railway
  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Evalmatch API is running',
      timestamp: new Date().toISOString(),
      environment: config.env,
      uptime: process.uptime()
    });
  });

  // Register all routes
  registerRoutes(app);

  // Error handling - now handled by monitoring middleware
  // But keep this as a safety net for errors that might slip through
  app.use((err: Error | unknown, _req: Request, res: Response, _next: NextFunction) => {
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

  // Use configured port from unified config
  const port = config.port;
  
  // Start the server
  const server = app.listen(port, "0.0.0.0", () => {
    logger.info(`Server started successfully, listening on port ${port}`);
    log(`serving on port ${port}`); // Keep the original log for vite
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
