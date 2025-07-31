/**
 * Debug and System Status Routes
 * 
 * Comprehensive debugging endpoints to troubleshoot configuration,
 * database, Firebase auth, and overall system health.
 */

import { Router, Request, Response } from 'express';
import { config } from '../config/unified-config';
import { getConnectionStats, isDatabaseAvailable, testConnection } from '../database';
import { verifyFirebaseConfiguration, getFirebaseAuthStatus } from '../auth/firebase-auth';
import { logger } from '../config/logger';

const router = Router();

/**
 * Complete system status check
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const [databaseTest, firebaseStatus] = await Promise.all([
      isDatabaseAvailable() ? testConnection() : Promise.resolve(false),
      verifyFirebaseConfiguration(),
    ]);

    const systemStatus = {
      timestamp: new Date().toISOString(),
      environment: config.env,
      version: process.env.npm_package_version || '1.0.0',
      
      // Application Status
      application: {
        status: 'running',
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        node: process.version,
        platform: process.platform,
      },

      // Configuration Status
      configuration: {
        status: config.validation.isValid ? 'valid' : 'invalid',
        errors: config.validation.errors,
        warnings: config.validation.warnings,
        database: config.database.enabled ? 'enabled' : 'disabled',
        firebase: config.firebase.configured ? 'configured' : 'not configured',
        aiProviders: Object.entries(config.ai.providers)
          .filter(([, provider]) => provider.enabled)
          .map(([name]) => name),
        primaryAI: config.ai.primary,
      },

      // Database Status
      database: config.database.enabled ? {
        status: isDatabaseAvailable() ? (databaseTest ? 'connected' : 'connection_failed') : 'not_initialized',
        enabled: config.database.enabled,
        connectionTest: databaseTest,
        stats: isDatabaseAvailable() ? getConnectionStats() : null,
      } : {
        status: 'disabled',
        enabled: false,
        reason: 'No DATABASE_URL configured',
      },

      // Firebase Auth Status
      firebase: {
        status: firebaseStatus.status,
        details: firebaseStatus.details,
        error: firebaseStatus.error,
        authStats: getFirebaseAuthStatus(),
      },

      // Environment Variables Check
      environmentVariables: {
        node_env: process.env.NODE_ENV,
        port: process.env.PORT,
        has_database_url: !!process.env.DATABASE_URL,
        has_firebase_project_id: !!process.env.FIREBASE_PROJECT_ID,
        has_firebase_service_account: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        has_groq_key: !!process.env.GROQ_API_KEY,
        has_openai_key: !!process.env.OPENAI_API_KEY,
        has_anthropic_key: !!process.env.ANTHROPIC_API_KEY,
        has_session_secret: !!process.env.SESSION_SECRET,
      },
    };

    // Determine overall health
    const isHealthy = config.validation.isValid && 
                     (config.database.enabled ? databaseTest : true) &&
                     (config.firebase.configured ? firebaseStatus.status === 'success' : config.env === 'development') &&
                     config.ai.hasAnyProvider;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      ...systemStatus,
    });

  } catch (error) {
    logger.error('System status check failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve system status',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Database-specific debug endpoint
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    if (!config.database.enabled) {
      return res.json({
        status: 'disabled',
        enabled: false,
        reason: 'DATABASE_URL not configured',
        fallback: 'Using memory storage',
      });
    }

    const [connectionTest, stats] = await Promise.all([
      testConnection(),
      getConnectionStats(),
    ]);

    res.json({
      status: isDatabaseAvailable() ? (connectionTest ? 'connected' : 'connection_failed') : 'not_initialized',
      enabled: config.database.enabled,
      url: config.database.url ? 'configured' : 'missing',
      connectionTest,
      stats,
      configuration: {
        poolSize: config.database.poolSize,
        connectionTimeout: config.database.connectionTimeout,
      },
    });

  } catch (error) {
    logger.error('Database debug failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Database debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Firebase authentication debug endpoint
 */
router.get('/firebase', async (req: Request, res: Response) => {
  try {
    const [configStatus, authStats] = await Promise.all([
      verifyFirebaseConfiguration(),
      Promise.resolve(getFirebaseAuthStatus()),
    ]);

    res.json({
      configuration: configStatus,
      authStats,
      environment: {
        projectId: config.firebase.projectId,
        hasServiceAccount: !!config.firebase.serviceAccountKey,
        clientConfig: {
          apiKey: config.firebase.clientConfig.apiKey ? 'configured' : 'missing',
          authDomain: config.firebase.clientConfig.authDomain || 'missing',
          projectId: config.firebase.clientConfig.projectId ? 'configured' : 'missing',
        },
      },
    });

  } catch (error) {
    logger.error('Firebase debug failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Firebase debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * AI providers debug endpoint
 */
router.get('/ai-providers', async (req: Request, res: Response) => {
  try {
    res.json({
      primary: config.ai.primary,
      hasAnyProvider: config.ai.hasAnyProvider,
      providers: Object.entries(config.ai.providers).map(([name, provider]) => ({
        name,
        enabled: provider.enabled,
        hasKey: !!provider.apiKey,
        keyLength: provider.apiKey?.length || 0,
      })),
      recommendations: {
        groq: 'Fastest and most cost-effective for most use cases',
        openai: 'Most reliable with broad model selection',
        anthropic: 'Highest quality analysis and reasoning',
      },
    });

  } catch (error) {
    logger.error('AI providers debug failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'AI providers debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Environment variables debug endpoint
 */
router.get('/environment', async (req: Request, res: Response) => {
  try {
    // List environment variables (sanitized - no actual values)
    const envStatus = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PORT: process.env.PORT || 'not set',
      
      // Database
      DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'not set',
      
      // Firebase
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'configured' : 'not set',
      FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? 'configured' : 'not set',
      
      // Firebase Client (build-time)
      VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY ? 'configured' : 'not set',
      VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN ? 'configured' : 'not set',
      VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID ? 'configured' : 'not set',
      
      // AI Providers
      GROQ_API_KEY: process.env.GROQ_API_KEY ? 'configured' : 'not set',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'configured' : 'not set',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? 'configured' : 'not set',
      
      // Security
      SESSION_SECRET: process.env.SESSION_SECRET ? 'configured' : 'not set',
      
      // Features
      SERVE_STATIC: process.env.SERVE_STATIC || 'default (true)',
    };

    const missingRequired = [];
    const missingOptional = [];

    // Check required variables
    if (!process.env.FIREBASE_PROJECT_ID) missingRequired.push('FIREBASE_PROJECT_ID');
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) missingRequired.push('FIREBASE_SERVICE_ACCOUNT_KEY');
    if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
      missingRequired.push('At least one AI provider key (GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)');
    }

    // Check optional variables
    if (!process.env.DATABASE_URL) missingOptional.push('DATABASE_URL (will use memory storage)');
    if (!process.env.SESSION_SECRET) missingOptional.push('SESSION_SECRET (will generate temporary secret)');

    res.json({
      environment: envStatus,
      validation: {
        missingRequired,
        missingOptional,
        isValid: missingRequired.length === 0,
      },
      instructions: {
        required: 'Set these environment variables for the app to work properly',
        optional: 'These variables are optional but recommended for production',
        example: 'See .env.example file for configuration template',
      },
    });

  } catch (error) {
    logger.error('Environment debug failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Environment debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Configuration validation endpoint
 */
router.get('/config-validation', async (req: Request, res: Response) => {
  try {
    res.json({
      isValid: config.validation.isValid,
      errors: config.validation.errors,
      warnings: config.validation.warnings,
      configuration: {
        environment: config.env,
        port: config.port,
        database: {
          enabled: config.database.enabled,
          url: config.database.url ? 'configured' : null,
          poolSize: config.database.poolSize,
        },
        firebase: {
          configured: config.firebase.configured,
          projectId: config.firebase.projectId,
        },
        ai: {
          primary: config.ai.primary,
          enabledProviders: Object.entries(config.ai.providers)
            .filter(([, provider]) => provider.enabled)
            .map(([name]) => name),
        },
        security: {
          hasSessionSecret: !!config.security.sessionSecret,
          corsOrigins: config.security.corsOrigins,
        },
        features: config.features,
      },
      fixInstructions: config.validation.errors.length > 0 ? [
        'Set missing environment variables listed in errors',
        'Restart the application after configuration changes',
        'Check .env.example for the correct format',
        'Ensure Firebase service account JSON is valid',
      ] : [],
    });

  } catch (error) {
    logger.error('Config validation debug failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Config validation debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Authentication status endpoint
 */
router.get('/auth-status', async (req: Request, res: Response) => {
  try {
    res.json({
      status: 'bypassed',
      mode: 'TESTING_MODE',
      message: '🔓 Authentication is currently bypassed for core functionality testing',
      user: req.user || null,
      instructions: [
        'All authenticated routes will work with a mock user',
        'Resume uploads, job descriptions, and analysis should work',
        'Firebase auth will be re-enabled after testing is complete',
        'Check server logs for "AUTH BYPASS ACTIVE" messages'
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Auth status debug failed:', error);
    res.status(500).json({
      status: 'error',
      error: 'Auth status debug failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Database schema inspection endpoint
router.get("/db-schema", async (req: Request, res: Response) => {
  try {
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');
    
    // Check resumes table schema
    const resumesSchema = await db.execute(sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'resumes' 
      ORDER BY ordinal_position
    `);
    
    // Check analysis_results table schema  
    const analysisSchema = await db.execute(sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'analysis_results' 
      ORDER BY ordinal_position
    `);
    
    // Check data counts
    const resumeCount = await db.execute(sql`SELECT COUNT(*) as count FROM resumes`);
    const jobCount = await db.execute(sql`SELECT COUNT(*) as count FROM job_descriptions`);
    
    res.json({
      status: "ok",
      tables: {
        resumes: {
          schema: resumesSchema.rows,
          count: resumeCount.rows[0]?.count || 0
        },
        analysis_results: {
          schema: analysisSchema.rows,
          count: 0
        },
        job_descriptions: {
          count: jobCount.rows[0]?.count || 0
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: "Database schema check failed",
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;