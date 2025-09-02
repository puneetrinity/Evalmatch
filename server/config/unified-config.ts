/**
 * Unified Configuration System
 *
 * Single source of truth for all application configuration with comprehensive
 * validation and clear error messages. This replaces the scattered config files
 * and provides consistent environment variable handling.
 *
 * Note: Environment validation is now handled by the env-validator module.
 * This module focuses on building the configuration object from validated environment variables.
 */

import { logger } from "./logger";
import { Environment } from "../types/environment";

// Firebase service account types
interface FirebaseServiceAccount {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// Re-export for backward compatibility
export { Environment };

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
    queryTimeout: number;
    idleTimeout: number;
    healthCheckInterval: number;
    maxConnectionRetries: number;
    circuitBreaker: {
      enabled: boolean;
      failureThreshold: number;
      retryInterval: number;
    };
  };

  // Storage
  storage: {
    type: 'database' | 'hybrid' | 'memory';
    initialization: {
      maxRetries: number;
      timeoutMs: number;
      retryDelayMs: number;
    };
    fallback: {
      enabled: boolean;
      type: 'memory' | 'readonly';
    };
  };

  // Firebase Authentication
  firebase: {
    projectId: string | null;
    serviceAccountKey: string | FirebaseServiceAccount | null; // Allow both file path string or service account object
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
    primary: "groq" | "openai" | "anthropic" | null;
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
    betaMode: boolean;
  };

  // Hybrid Analyzer Configuration (aligned to existing thresholds)
  hybridAnalyzer: {
    thresholds: {
      failureThreshold: number;       // Replace ≤50 literals
      mlWeightCap: number;           // Align to existing ML_MAX 0.4
      llmWeightCap: number;          // Align to existing LLM_MAX 0.8
      biasAdjustmentLimit: number;   // From BIAS_DETECTION_CONFIG.MAX_PENALTY_FACTOR
      confidenceFloor: number;       // Align with CONFIDENCE_THRESHOLDS.MINIMUM_VIABLE
    };
    features: {
      enableBiasAdjustment: boolean;
      enableContaminationFiltering: boolean;
      enableTelemetry: boolean;      // Default false, enable first for gradual rollout
    };
  };

  // A/B Testing & Experimentation Framework
  experiments: {
    hybridAnalyzerThresholds: {
      enabled: boolean;
      participationRate: number;     // 0.1 = 10% participation
      variant: 'control' | 'experimental';
    };
    escoContaminationV2: {
      enabled: boolean;
      participationRate: number;
      variant: 'current' | 'wordBoundary';
    };
  };

  // Validation status
  validation: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Load complete application configuration from validated environment variables
 *
 * Note: This function assumes environment variables have already been validated
 * by the env-validator module. It focuses on building the configuration object.
 */
export function loadUnifiedConfig(): AppConfig {
  // Note: Environment variables are validated by validateEnvironmentOrExit() before this runs
  // AUTH_BYPASS_MODE environment variable is available but not currently used

  // Environment configuration (safe to read directly after validation)
  const env = (process.env.NODE_ENV || "development") as Environment;
  const port = parseInt(process.env.PORT || "3000", 10);

  // Database configuration
  const databaseUrl = process.env.DATABASE_URL || null;
  const databaseEnabled = !!databaseUrl;

  // Firebase configuration
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || null;
  
  // Get Firebase service account key - prefer base64 version for Railway compatibility
  let firebaseServiceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || null;
  if (!firebaseServiceAccountKey && process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
    try {
      firebaseServiceAccountKey = Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
        'base64'
      ).toString('utf8');
    } catch (error) {
      logger.warn('Failed to decode FIREBASE_SERVICE_ACCOUNT_KEY_BASE64', { error });
      firebaseServiceAccountKey = null;
    }
  }

  // Parse the service account key into an object for firebase-auth.ts
  let firebaseServiceAccountObject: FirebaseServiceAccount | null = null;
  if (firebaseServiceAccountKey) {
    try {
      // SECURITY FIX: Safe logging without exposing sensitive key content
      logger.debug('Attempting to parse Firebase service account key', {
        keyLength: firebaseServiceAccountKey.length,
        isString: typeof firebaseServiceAccountKey === 'string',
        looksLikeJson: firebaseServiceAccountKey.startsWith('{') && firebaseServiceAccountKey.endsWith('}')
      });
      const parsedKey = JSON.parse(firebaseServiceAccountKey);
      
      // Validate the parsed object has required fields
      const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
      const missingFields = requiredFields.filter(field => !parsedKey?.[field]);
      
      if (missingFields.length > 0) {
        logger.error('Firebase service account missing required fields', { 
          missingFields,
          hasPrivateKey: !!parsedKey?.private_key,
          privateKeyLength: parsedKey?.private_key?.length || 0
        });
        firebaseServiceAccountObject = null;
      } else if (parsedKey) {
        // Fix common private key formatting issues
        if (parsedKey.private_key.includes('\\n')) {
          parsedKey.private_key = parsedKey.private_key.replace(/\\n/g, '\n');
          logger.debug('Fixed escaped newlines in Firebase private key');
        }
        
        // Basic validation of private key format
        const privateKey = parsedKey.private_key;
        if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
          logger.error('Firebase private key appears to be malformed - missing BEGIN/END markers');
          firebaseServiceAccountObject = null;
        } else {
          // Use the parsed object directly - Firebase cert() handles both formats
          firebaseServiceAccountObject = parsedKey;
        }
      }
    } catch (error) {
      // SECURITY FIX: Safe error logging without exposing key content
      logger.error('Failed to parse Firebase service account key JSON', { 
        error: error instanceof Error ? error.message : String(error),
        keyLength: firebaseServiceAccountKey?.length,
        keyType: typeof firebaseServiceAccountKey,
        // REMOVED: keyPreview that could expose sensitive data
      });
      firebaseServiceAccountKey = null;
      firebaseServiceAccountObject = null;
    }
  }

  // Firebase client configuration (for build-time injection)
  const firebaseClientConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || null,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || null,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || null,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || null,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || null,
    appId: process.env.VITE_FIREBASE_APP_ID || null,
  };

  const firebaseConfigured = !!(firebaseProjectId && firebaseServiceAccountObject);

  // AI Provider configuration
  const groqApiKey = process.env.GROQ_API_KEY || null;
  const openaiApiKey = process.env.OPENAI_API_KEY || null;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || null;

  const aiProviders = {
    groq: { apiKey: groqApiKey, enabled: !!groqApiKey },
    openai: { apiKey: openaiApiKey, enabled: !!openaiApiKey },
    anthropic: { apiKey: anthropicApiKey, enabled: !!anthropicApiKey },
  };

  const hasAnyProvider = !!(groqApiKey || openaiApiKey || anthropicApiKey);

  // Determine primary AI provider (preference order: Groq -> OpenAI -> Anthropic)
  let primaryProvider: "groq" | "openai" | "anthropic" | null = null;
  if (groqApiKey) primaryProvider = "groq";
  else if (openaiApiKey) primaryProvider = "openai";
  else if (anthropicApiKey) primaryProvider = "anthropic";

  // Security configuration
  const sessionSecret = process.env.SESSION_SECRET || generateSecureSecret();

  // CORS origins (environment-aware with simplified logic)
  const corsOrigins = getCorsOrigins(env);

  // Feature flags
  const features = {
    staticFiles: process.env.SERVE_STATIC !== "false",
    monitoring: env === Environment.Production,
    uploads: true, // Always enabled for now
    betaMode: process.env.BETA_MODE === "true" || env === Environment.Development, // Enable beta mode via env var or in development
  };

  // Hybrid Analyzer Configuration (aligned to unified-scoring-config.ts thresholds)
  const hybridAnalyzer = {
    thresholds: {
      failureThreshold: parseInt(process.env.HYBRID_FAILURE_THRESHOLD || '50', 10),
      mlWeightCap: parseFloat(process.env.HYBRID_ML_WEIGHT_CAP || '0.4'),        // Align to existing ML_MAX
      llmWeightCap: parseFloat(process.env.HYBRID_LLM_WEIGHT_CAP || '0.8'),      // Align to existing LLM_MAX
      biasAdjustmentLimit: parseFloat(process.env.HYBRID_BIAS_LIMIT || '0.1'),   // From BIAS_DETECTION_CONFIG
      confidenceFloor: parseFloat(process.env.HYBRID_CONFIDENCE_FLOOR || '0.75'), // Aligned with CONFIDENCE_THRESHOLDS.MINIMUM_VIABLE
    },
    features: {
      enableBiasAdjustment: process.env.HYBRID_BIAS_ADJUSTMENT === 'true',        // Default false
      enableContaminationFiltering: process.env.HYBRID_CONTAMINATION_FILTERING !== 'false', // Default true (existing behavior)
      enableTelemetry: process.env.HYBRID_TELEMETRY === 'true',                   // Default false, enable first
    },
  };

  // A/B Testing & Experimentation Framework Configuration
  const experiments = {
    hybridAnalyzerThresholds: {
      enabled: process.env.EXPERIMENT_HYBRID_ANALYZER_THRESHOLDS === 'true',       // Default false
      participationRate: parseFloat(process.env.EXPERIMENT_HYBRID_ANALYZER_RATE || '0.1'), // Start at 10%
      variant: (process.env.EXPERIMENT_HYBRID_ANALYZER_VARIANT as 'control' | 'experimental') || 'control',
    },
    escoContaminationV2: {
      enabled: process.env.EXPERIMENT_ESCO_CONTAMINATION_V2 === 'true',            // Default false  
      participationRate: parseFloat(process.env.EXPERIMENT_ESCO_CONTAMINATION_RATE || '0.1'), // Start at 10%
      variant: (process.env.EXPERIMENT_ESCO_CONTAMINATION_VARIANT as 'current' | 'wordBoundary') || 'current',
    },
  };

  // Storage configuration
  const storageType = process.env.STORAGE_TYPE as 'database' | 'hybrid' | 'memory' || 
    (databaseEnabled ? 'hybrid' : 'memory'); // Default to hybrid if database available, memory otherwise

  // Build configuration object (validation status is managed by env-validator)
  const config: AppConfig = {
    env,
    port,
    database: {
      url: databaseUrl,
      enabled: databaseEnabled,
      poolSize:
        env === Environment.Production ? 20 : env === Environment.Test ? 5 : 10,
      connectionTimeout:
        env === Environment.Production
          ? 10000
          : env === Environment.Test
            ? 5000
            : 15000,
      queryTimeout:
        env === Environment.Production
          ? 30000
          : env === Environment.Test
            ? 10000
            : 60000,
      idleTimeout:
        env === Environment.Production
          ? 30000
          : env === Environment.Test
            ? 5000
            : 60000,
      healthCheckInterval: env === Environment.Production ? 30000 : 60000,
      maxConnectionRetries: 3,
      circuitBreaker: {
        enabled: env === Environment.Production,
        failureThreshold: 5,
        retryInterval: 60000,
      },
    },
    storage: {
      type: storageType,
      initialization: {
        maxRetries: parseInt(process.env.STORAGE_MAX_RETRIES || '3', 10),
        timeoutMs: parseInt(process.env.STORAGE_TIMEOUT_MS || '30000', 10),
        retryDelayMs: parseInt(process.env.STORAGE_RETRY_DELAY_MS || '1000', 10),
      },
      fallback: {
        enabled: env !== Environment.Test, // Always enable fallback except in tests
        type: 'memory' as const,
      },
    },
    firebase: {
      projectId: firebaseProjectId,
      serviceAccountKey: firebaseServiceAccountObject,
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
    hybridAnalyzer,
    experiments,
    validation: {
      isValid: true, // Assumed valid since env-validator ran successfully
      errors: [],
      warnings: [],
    },
  };

  // Log final configuration summary
  logConfigurationSummary(config);

  return config;
}

/**
 * Generate CORS origins based on environment with simplified logic
 */
function getCorsOrigins(env: Environment): string[] {
  // Base development origins
  const baseOrigins = [
    "http://localhost:3000",
    "http://localhost:5000",
    "http://localhost:5173",
    "http://localhost:8080",
  ];

  // In development, only use base origins
  if (env === Environment.Development || env === Environment.Test) {
    return baseOrigins;
  }

  // Production origins: start with base for testing, then add production URLs
  const productionOrigins = [...baseOrigins];

  // 1. Custom origins from ALLOWED_ORIGINS (highest priority)
  const customOrigins = process.env.ALLOWED_ORIGINS;
  if (customOrigins) {
    const origins = customOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    productionOrigins.push(...origins);
  }

  // 2. Auto-detect deployment platform URLs
  const platformUrls = [
    process.env.RAILWAY_PUBLIC_DOMAIN &&
      `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.URL, // Netlify already includes https://
  ].filter(Boolean) as string[];

  productionOrigins.push(...platformUrls);

  // 3. Firebase authentication domains (always needed for OAuth)
  const firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (firebaseProjectId) {
    productionOrigins.push(
      `https://${firebaseProjectId}.firebaseapp.com`,
      "https://accounts.google.com",
      "https://securetoken.googleapis.com",
    );
  }

  // Remove duplicates and return
  return Array.from(new Set(productionOrigins));
}

/**
 * Generate a secure session secret
 */
function generateSecureSecret(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Log final configuration summary (validation is handled by env-validator)
 */
function logConfigurationSummary(config: AppConfig): void {
  logger.info("🔧 Application Configuration Summary", {
    environment: config.env,
    port: config.port,
    database: config.database.enabled ? "PostgreSQL" : "Memory Storage",
    storage: `${config.storage.type} (${config.storage.fallback.enabled ? 'with fallback' : 'no fallback'})`,
    firebase: config.firebase.configured ? "Configured" : "Not Configured",
    aiProviders: Object.entries(config.ai.providers)
      .map(([name, provider]) => `${name}: ${provider.enabled ? "✅" : "❌"}`)
      .join(", "),
    primaryAI: config.ai.primary || "None",
    staticFiles: config.features.staticFiles ? "Enabled" : "Disabled",
    monitoring: config.features.monitoring ? "Enabled" : "Disabled",
    corsOrigins:
      config.env === "development"
        ? "Allow All (Dev Mode)"
        : `${config.security.corsOrigins.length} origins configured`,
    hybridAnalyzer: `bias:${config.hybridAnalyzer.features.enableBiasAdjustment}, contamination:${config.hybridAnalyzer.features.enableContaminationFiltering}, telemetry:${config.hybridAnalyzer.features.enableTelemetry}`,
    experiments: Object.entries(config.experiments)
      .map(([name, experiment]) => `${name}:${experiment.enabled ? `${(experiment.participationRate * 100).toFixed(0)}%` : 'off'}`)
      .join(", "),
  });
}

/**
 * Legacy validation function - now handled by env-validator module
 * Kept for backward compatibility but does nothing since validation
 * is performed earlier in the startup process.
 */
export function validateConfigurationOrExit(_config: AppConfig): void {
  // Validation is now handled by validateEnvironmentOrExit() in env-validator
  // This function is kept for backward compatibility but is effectively a no-op
  logger.debug(
    "Configuration validation skipped - handled by env-validator module",
  );
}

// Export singleton configuration
// Note: Environment validation is now performed in server/index.ts before config loading
export const config = loadUnifiedConfig();
