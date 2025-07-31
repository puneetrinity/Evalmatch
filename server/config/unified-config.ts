/**
 * Unified Configuration System
 * 
 * Single source of truth for all application configuration with comprehensive
 * validation and clear error messages. This replaces the scattered config files
 * and provides consistent environment variable handling.
 */

import { logger } from './logger';

// Environment types
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test'
}

// Comprehensive application configuration interface
export interface AppConfig {
  // Environment
  env: Environment;
  port: number;
  
  // Database
  database: {
    url: string | null;
    enabled: boolean;
    poolSize: number;
    connectionTimeout: number;
  };
  
  // Firebase Authentication
  firebase: {
    projectId: string | null;
    serviceAccountKey: string | null;
    clientConfig: {
      apiKey: string | null;
      authDomain: string | null;
      projectId: string | null;
      storageBucket: string | null;
      messagingSenderId: string | null;
      appId: string | null;
    };
    configured: boolean;
  };
  
  // AI Providers
  ai: {
    primary: 'groq' | 'openai' | 'anthropic' | null;
    providers: {
      groq: { apiKey: string | null; enabled: boolean };
      openai: { apiKey: string | null; enabled: boolean };
      anthropic: { apiKey: string | null; enabled: boolean };
    };
    hasAnyProvider: boolean;
  };
  
  // Security
  security: {
    sessionSecret: string;
    corsOrigins: string[];
  };
  
  // Features
  features: {
    staticFiles: boolean;
    monitoring: boolean;
    uploads: boolean;
  };
  
  // Validation status
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Validate and load complete application configuration
 */
export function loadUnifiedConfig(): AppConfig {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check if we're in auth bypass testing mode
  const authBypassMode = process.env.AUTH_BYPASS_MODE === 'true';
  
  // Environment detection
  const nodeEnv = process.env.NODE_ENV || 'development';
  const env = nodeEnv as Environment;
  const port = parseInt(process.env.PORT || '5000', 10);
  
  // Database configuration
  const databaseUrl = process.env.DATABASE_URL || null;
  const databaseEnabled = !!databaseUrl;
  
  if (!databaseUrl && env === Environment.Production) {
    warnings.push('No DATABASE_URL in production - using memory storage');
  }
  
  // Firebase configuration validation
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || null;
  const firebaseServiceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || null;
  
  // Firebase client configuration (for build-time injection)
  const firebaseClientConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || null,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || null,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || null,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || null,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || null,
    appId: process.env.VITE_FIREBASE_APP_ID || null,
  };
  
  const firebaseConfigured = !!(firebaseProjectId && firebaseServiceAccountKey);
  
  if (!firebaseConfigured) {
    if (authBypassMode) {
      warnings.push('Firebase not configured (auth bypass mode active - using placeholder config)');
    } else {
      errors.push('Firebase not configured: Missing FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY');
    }
  }
  
  // Validate service account key format if provided
  if (firebaseServiceAccountKey) {
    try {
      const parsed = JSON.parse(firebaseServiceAccountKey);
      if (!parsed.type || !parsed.project_id || !parsed.private_key) {
        errors.push('Invalid FIREBASE_SERVICE_ACCOUNT_KEY format - missing required fields');
      }
    } catch (e) {
      errors.push('Invalid FIREBASE_SERVICE_ACCOUNT_KEY format - not valid JSON');
    }
  }
  
  // AI Provider configuration (standardized naming)
  const groqApiKey = process.env.GROQ_API_KEY || null;
  const openaiApiKey = process.env.OPENAI_API_KEY || null;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || null;
  
  const aiProviders = {
    groq: { apiKey: groqApiKey, enabled: !!groqApiKey },
    openai: { apiKey: openaiApiKey, enabled: !!openaiApiKey },
    anthropic: { apiKey: anthropicApiKey, enabled: !!anthropicApiKey },
  };
  
  const hasAnyProvider = !!(groqApiKey || openaiApiKey || anthropicApiKey);
  
  if (!hasAnyProvider) {
    if (authBypassMode) {
      warnings.push('No AI provider configured (auth bypass mode active - using placeholder config)');
    } else {
      errors.push('No AI provider configured: Set at least one of GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY');
    }
  }
  
  // Determine primary AI provider
  let primaryProvider: 'groq' | 'openai' | 'anthropic' | null = null;
  if (groqApiKey) primaryProvider = 'groq';
  else if (openaiApiKey) primaryProvider = 'openai';
  else if (anthropicApiKey) primaryProvider = 'anthropic';
  
  // Security configuration
  const sessionSecret = process.env.SESSION_SECRET || generateSecureSecret();
  if (!process.env.SESSION_SECRET) {
    warnings.push('No SESSION_SECRET provided - using generated secret (sessions will reset on restart)');
  }
  
  // CORS origins (environment-aware)
  const corsOrigins = getCorsOrigins(env);
  
  // Feature flags
  const features = {
    staticFiles: process.env.SERVE_STATIC !== 'false',
    monitoring: env === Environment.Production,
    uploads: true, // Always enabled for now
  };
  
  // Build configuration object
  const config: AppConfig = {
    env,
    port,
    database: {
      url: databaseUrl,
      enabled: databaseEnabled,
      poolSize: env === Environment.Production ? 15 : 10,
      connectionTimeout: 30000,
    },
    firebase: {
      projectId: firebaseProjectId,
      serviceAccountKey: firebaseServiceAccountKey,
      clientConfig: firebaseClientConfig,
      configured: firebaseConfigured,
    },
    ai: {
      primary: primaryProvider,
      providers: aiProviders,
      hasAnyProvider,
    },
    security: {
      sessionSecret,
      corsOrigins,
    },
    features,
    validation: {
      isValid: errors.length === 0,
      errors,
      warnings,
    },
  };
  
  // Log configuration status
  logConfigurationStatus(config);
  
  return config;
}

/**
 * Generate CORS origins based on environment
 */
function getCorsOrigins(env: Environment): string[] {
  const origins = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5173',
    'http://localhost:8080',
  ];
  
  if (env === Environment.Production) {
    // Add production origins - will be updated based on actual deployment
    origins.push(
      'https://web-production-392cc.up.railway.app',
      'https://evalmatch.railway.app', // If custom domain is set
    );
    
    // Add Firebase domains
    const projectId = process.env.VITE_FIREBASE_PROJECT_ID;
    if (projectId) {
      origins.push(
        `https://${projectId}.firebaseapp.com`,
        'https://accounts.google.com',
        'https://securetoken.googleapis.com',
      );
    }
  }
  
  return origins;
}

/**
 * Generate a secure session secret
 */
function generateSecureSecret(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Log configuration status with clear, actionable information
 */
function logConfigurationStatus(config: AppConfig): void {
  logger.info('🔧 Application Configuration Loaded', {
    environment: config.env,
    port: config.port,
    database: config.database.enabled ? 'PostgreSQL' : 'Memory Storage',
    firebase: config.firebase.configured ? 'Configured' : 'Not Configured',
    aiProviders: Object.entries(config.ai.providers)
      .map(([name, provider]) => `${name}: ${provider.enabled ? '✅' : '❌'}`)
      .join(', '),
    primaryAI: config.ai.primary || 'None',
    staticFiles: config.features.staticFiles ? 'Enabled' : 'Disabled',
    monitoring: config.features.monitoring ? 'Enabled' : 'Disabled',
  });
  
  // Log warnings
  if (config.validation.warnings.length > 0) {
    config.validation.warnings.forEach(warning => {
      logger.warn(`⚠️  Configuration Warning: ${warning}`);
    });
  }
  
  // Log errors
  if (config.validation.errors.length > 0) {
    config.validation.errors.forEach(error => {
      logger.error(`❌ Configuration Error: ${error}`);
    });
    
    logger.error('🚨 Application cannot start with configuration errors. Please fix the above issues.');
  } else {
    logger.info('✅ Configuration validation passed');
  }
}

/**
 * Validate configuration and exit if critical errors exist
 */
export function validateConfigurationOrExit(config: AppConfig): void {
  if (!config.validation.isValid) {
    logger.error('💥 Critical configuration errors detected:');
    config.validation.errors.forEach(error => {
      logger.error(`   • ${error}`);
    });
    
    logger.error('\n📋 Required Environment Variables:');
    logger.error('   • FIREBASE_PROJECT_ID - Your Firebase project ID');
    logger.error('   • FIREBASE_SERVICE_ACCOUNT_KEY - Firebase admin service account JSON');
    logger.error('   • GROQ_API_KEY (or OPENAI_API_KEY or ANTHROPIC_API_KEY) - AI provider key');
    logger.error('   • DATABASE_URL (optional) - PostgreSQL connection string');
    logger.error('   • SESSION_SECRET (optional) - Secure random string for sessions');
    
    logger.error('\n🔧 Example .env file:');
    logger.error('   FIREBASE_PROJECT_ID=your-project-id');
    logger.error('   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}');
    logger.error('   GROQ_API_KEY=your-groq-key-here');
    logger.error('   DATABASE_URL=postgresql://user:pass@host:5432/db');
    
    process.exit(1);
  }
}

// Export singleton configuration
export const config = loadUnifiedConfig();

// Validate on module load
validateConfigurationOrExit(config);