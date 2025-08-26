/**
 * Comprehensive Environment Variable Validation System
 *
 * This module provides robust validation of all required environment variables
 * to prevent silent fallbacks and ensure the application never starts in a broken state.
 * It validates configuration early in the startup process and fails fast with clear error messages.
 */

import { logger } from "../config/logger";

// Environment validation result
export interface EnvValidationResult {
  isValid: boolean;
  errors: EnvValidationError[];
  warnings: EnvValidationWarning[];
  missingCritical: string[];
  missingOptional: string[];
  invalidFormats: string[];
}

export interface EnvValidationError {
  variable: string;
  message: string;
  category: "critical" | "format" | "security";
  suggestion?: string;
}

export interface EnvValidationWarning {
  variable: string;
  message: string;
  impact: string;
  suggestion?: string;
}

// Environment variable specifications
interface EnvVarSpec {
  name: string;
  required: boolean;
  category:
    | "core"
    | "database"
    | "firebase"
    | "ai"
    | "security"
    | "performance";
  validator?: (_value: string) => boolean;
  description: string;
  example?: string;
  securityLevel: "public" | "private" | "secret";
  productionRequired?: boolean; // Required specifically in production
  testMode?: boolean; // Can be bypassed in test mode
}

// Comprehensive environment variable specifications
const ENV_SPECS: EnvVarSpec[] = [
  // Core Application
  {
    name: "NODE_ENV",
    required: true,
    category: "core",
    validator: (val) => ["development", "production", "test"].includes(val),
    description: "Application environment mode",
    example: "production",
    securityLevel: "public",
  },
  {
    name: "PORT",
    required: false,
    category: "core",
    validator: (val) =>
      !isNaN(parseInt(val)) && parseInt(val) > 0 && parseInt(val) < 65536,
    description: "Server port number",
    example: "5000",
    securityLevel: "public",
  },

  // Database Configuration
  {
    name: "DATABASE_URL",
    required: false,
    category: "database",
    validator: (val) =>
      val.startsWith("postgresql://") || val.startsWith("postgres://"),
    description: "PostgreSQL connection string",
    example: "postgresql://user:password@host:5432/dbname",
    securityLevel: "secret",
    productionRequired: false, // Optional even in production due to memory fallback
  },

  // Firebase Authentication (Server-side)
  {
    name: "FIREBASE_PROJECT_ID",
    required: true,
    category: "firebase",
    validator: (val) => val.length > 0 && /^[a-z0-9-]+$/.test(val),
    description: "Firebase project identifier",
    example: "my-project-id",
    securityLevel: "private",
    productionRequired: true,
    testMode: true,
  },
  {
    name: "FIREBASE_SERVICE_ACCOUNT_KEY",
    required: false, // Made optional since we now support base64 alternative
    category: "firebase",
    validator: (val) => {
      try {
        const parsed = JSON.parse(val);
        return !!(
          parsed.type &&
          parsed.project_id &&
          parsed.private_key &&
          parsed.client_email
        );
      } catch {
        return false;
      }
    },
    description: "Firebase Admin SDK service account JSON",
    example:
      '{"type":"service_account","project_id":"...","private_key":"..."}',
    securityLevel: "secret",
    productionRequired: false, // Now optional due to base64 alternative
    testMode: true,
  },
  {
    name: "FIREBASE_SERVICE_ACCOUNT_KEY_BASE64",
    required: false, // Made optional - either this OR the JSON version is needed
    category: "firebase",
    validator: (val) => {
      try {
        const decoded = Buffer.from(val, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        return !!(
          parsed.type &&
          parsed.project_id &&
          parsed.private_key &&
          parsed.client_email
        );
      } catch {
        return false;
      }
    },
    description: "Firebase Admin SDK service account JSON (base64 encoded)",
    example: "base64-encoded-service-account-json",
    securityLevel: "secret",
    productionRequired: false, // Custom validation below
    testMode: true,
  },

  // Firebase Client Configuration (Build-time)
  {
    name: "VITE_FIREBASE_API_KEY",
    required: true,
    category: "firebase",
    validator: (val) => val.length > 20,
    description: "Firebase client API key",
    example: "AIzaSyC...",
    securityLevel: "private",
    productionRequired: true,
    testMode: true,
  },
  {
    name: "VITE_FIREBASE_AUTH_DOMAIN",
    required: true,
    category: "firebase",
    validator: (val) =>
      val.includes(".firebaseapp.com") || val.includes(".web.app"),
    description: "Firebase authentication domain",
    example: "my-project.firebaseapp.com",
    securityLevel: "private",
    productionRequired: true,
    testMode: true,
  },
  {
    name: "VITE_FIREBASE_PROJECT_ID",
    required: true,
    category: "firebase",
    validator: (val) => val.length > 0 && /^[a-z0-9-]+$/.test(val),
    description: "Firebase project ID for client",
    example: "my-project-id",
    securityLevel: "private",
    productionRequired: true,
    testMode: true,
  },
  {
    name: "VITE_FIREBASE_STORAGE_BUCKET",
    required: false,
    category: "firebase",
    validator: (val) =>
      val.includes(".appspot.com") ||
      val.includes(".firebasestorage.googleapis.com") ||
      val.includes(".firebasestorage.app"),
    description: "Firebase storage bucket",
    example: "my-project.appspot.com",
    securityLevel: "private",
  },
  {
    name: "VITE_FIREBASE_MESSAGING_SENDER_ID",
    required: false,
    category: "firebase",
    validator: (val) => /^\d+$/.test(val),
    description: "Firebase messaging sender ID",
    example: "123456789",
    securityLevel: "private",
  },
  {
    name: "VITE_FIREBASE_APP_ID",
    required: false,
    category: "firebase",
    validator: (val) => val.startsWith("1:") && val.includes(":web:"),
    description: "Firebase application ID",
    example: "1:123456789:web:abcdef123456",
    securityLevel: "private",
  },

  // AI Provider API Keys (At least one required)
  {
    name: "GROQ_API_KEY",
    required: false,
    category: "ai",
    validator: (val) => val.startsWith("gsk_") && val.length > 20,
    description: "Groq AI API key (fastest, recommended)",
    example: "gsk_...",
    securityLevel: "secret",
    testMode: true,
  },
  {
    name: "OPENAI_API_KEY",
    required: false,
    category: "ai",
    validator: (val) => val.startsWith("sk-") && val.length > 20,
    description: "OpenAI API key (reliable fallback)",
    example: "sk-...",
    securityLevel: "secret",
    testMode: true,
  },
  {
    name: "ANTHROPIC_API_KEY",
    required: false,
    category: "ai",
    validator: (val) => val.startsWith("sk-ant-") && val.length > 20,
    description: "Anthropic Claude API key (high quality)",
    example: "sk-ant-...",
    securityLevel: "secret",
    testMode: true,
  },

  // Security Configuration
  {
    name: "SESSION_SECRET",
    required: false,
    category: "security",
    validator: (val) => val.length >= 32,
    description: "Secure session secret (32+ characters)",
    example: "your-very-secure-random-string-here",
    securityLevel: "secret",
    productionRequired: true,
  },

  // Deployment Configuration
  {
    name: "ALLOWED_ORIGINS",
    required: false,
    category: "security",
    validator: (val) =>
      val.split(",").every((origin) => origin.trim().startsWith("http")),
    description: "Comma-separated list of allowed CORS origins",
    example: "https://myapp.com,https://www.myapp.com",
    securityLevel: "private",
  },
  {
    name: "RAILWAY_PUBLIC_DOMAIN",
    required: false,
    category: "core",
    validator: (val) =>
      val.includes(".railway.app") || 
      val.includes(".up.railway.app") || 
      /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(val), // Allow custom domains
    description: "Railway deployment public domain or custom domain",
    example: "myapp-production.up.railway.app or evalmatch.app",
    securityLevel: "public",
  },
  {
    name: "VERCEL_URL",
    required: false,
    category: "core",
    validator: (val) => val.includes(".vercel.app") || !val.startsWith("http"),
    description: "Vercel deployment URL",
    example: "myapp-123abc.vercel.app",
    securityLevel: "public",
  },
  {
    name: "URL",
    required: false,
    category: "core",
    validator: (val) => val.startsWith("http"),
    description: "Netlify deployment URL",
    example: "https://myapp.netlify.app",
    securityLevel: "public",
  },

  // Performance & Configuration
  {
    name: "MAX_CONCURRENT_EMBEDDINGS",
    required: false,
    category: "performance",
    validator: (val) =>
      !isNaN(parseInt(val)) && parseInt(val) > 0 && parseInt(val) <= 10,
    description: "Maximum concurrent embedding operations",
    example: "3",
    securityLevel: "public",
  },
  {
    name: "MAX_TEXT_LENGTH",
    required: false,
    category: "performance",
    validator: (val) => !isNaN(parseInt(val)) && parseInt(val) > 1000,
    description: "Maximum text length for processing",
    example: "50000",
    securityLevel: "public",
  },
  {
    name: "LOG_LEVEL",
    required: false,
    category: "core",
    validator: (val) => ["error", "warn", "info", "debug"].includes(val),
    description: "Logging verbosity level",
    example: "info",
    securityLevel: "public",
  },
];

/**
 * Validate all environment variables with comprehensive checks
 */
export function validateEnvironment(): EnvValidationResult {
  const errors: EnvValidationError[] = [];
  const warnings: EnvValidationWarning[] = [];
  const missingCritical: string[] = [];
  const missingOptional: string[] = [];
  const invalidFormats: string[] = [];

  const isProduction = process.env.NODE_ENV === "production";
  const isTest = process.env.NODE_ENV === "test";
  const authBypassMode = process.env.AUTH_BYPASS_MODE === "true";

  // Track AI providers
  const aiProviders = {
    groq: !!process.env.GROQ_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };
  const hasAnyAIProvider = Object.values(aiProviders).some(Boolean);

  // Validate each environment variable
  for (const spec of ENV_SPECS) {
    const value = process.env[spec.name];
    const isEmpty = !value || value.trim() === "";

    // Special case: Skip FIREBASE_SERVICE_ACCOUNT_KEY validation if BASE64 version exists
    // This needs to happen BEFORE any validation logic
    if (spec.name === "FIREBASE_SERVICE_ACCOUNT_KEY" && 
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64) {
      // Skip this entire validation - we're using the base64 version
      continue;
    }

    // Check if required in current environment
    const isRequired =
      spec.required || (isProduction && spec.productionRequired);
    const canBypass = isTest && spec.testMode && authBypassMode;

    if (isEmpty) {
      if (isRequired && !canBypass) {
        missingCritical.push(spec.name);
        errors.push({
          variable: spec.name,
          message: `Required environment variable missing: ${spec.description}`,
          category: "critical",
          suggestion: `Set ${spec.name}=${spec.example || "[value]"}`,
        });
      } else if (!isRequired) {
        missingOptional.push(spec.name);

        // Add specific warnings for important optional variables
        if (spec.name === "SESSION_SECRET" && isProduction) {
          warnings.push({
            variable: spec.name,
            message: "Using generated session secret",
            impact: "Sessions will reset on server restart",
            suggestion: "Set a persistent SESSION_SECRET for production",
          });
        }
      }
    } else {
      // Validate format if validator exists
      if (spec.validator && !spec.validator(value)) {
        invalidFormats.push(spec.name);
        errors.push({
          variable: spec.name,
          message: `Invalid format for ${spec.name}: ${spec.description}`,
          category: "format",
          suggestion: `Expected format: ${spec.example || "[valid format]"}`,
        });
      }
    }
  }

  // Special validation: At least one AI provider required
  if (!hasAnyAIProvider && !authBypassMode) {
    errors.push({
      variable: "AI_PROVIDERS",
      message: "At least one AI provider API key is required",
      category: "critical",
      suggestion:
        "Set one of: GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY",
    });
  } else if (!hasAnyAIProvider && authBypassMode) {
    warnings.push({
      variable: "AI_PROVIDERS",
      message: "No AI providers configured (bypass mode active)",
      impact: "AI-powered features will use placeholder responses",
      suggestion: "Configure at least one AI provider for full functionality",
    });
  }

  // Special validation: At least one Firebase service account key format required
  const hasFirebaseKey = !!(process.env.FIREBASE_SERVICE_ACCOUNT_KEY && process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim());
  const hasFirebaseKeyBase64 = !!(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 && process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64.trim());
  
  if (!hasFirebaseKey && !hasFirebaseKeyBase64 && !authBypassMode && isProduction) {
    errors.push({
      variable: "FIREBASE_SERVICE_ACCOUNT_KEY",
      message: "Firebase service account key required in production (either FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_SERVICE_ACCOUNT_KEY_BASE64)",
      category: "critical",
      suggestion: "Set FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 with base64 encoded JSON credentials",
    });
  }

  // Special validation: Firebase project ID consistency
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
  const viteFirebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID;
  if (
    firebaseProjectId &&
    viteFirebaseProjectId &&
    firebaseProjectId !== viteFirebaseProjectId
  ) {
    errors.push({
      variable: "FIREBASE_PROJECT_ID",
      message: "FIREBASE_PROJECT_ID and VITE_FIREBASE_PROJECT_ID must match",
      category: "format",
      suggestion: `Set both to the same value: ${firebaseProjectId}`,
    });
  }

  // Security validation: Check for potential security issues
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 32) {
    errors.push({
      variable: "SESSION_SECRET",
      message: "SESSION_SECRET is too short (minimum 32 characters)",
      category: "security",
      suggestion: "Generate a secure random string of at least 32 characters",
    });
  }

  // Critical security check: AUTH_BYPASS_MODE must never be enabled in production
  if (isProduction && process.env.AUTH_BYPASS_MODE === "true") {
    errors.push({
      variable: "AUTH_BYPASS_MODE",
      message: "AUTH_BYPASS_MODE cannot be enabled in production environment",
      category: "security",
      suggestion: "Remove AUTH_BYPASS_MODE or set it to false in production",
    });
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    missingCritical,
    missingOptional,
    invalidFormats,
  };
}

/**
 * Display comprehensive validation results with actionable guidance
 */
export function displayValidationResults(result: EnvValidationResult): void {
  const { isValid, errors, warnings, missingCritical, missingOptional: _missingOptional } =
    result;

  if (isValid && warnings.length === 0) {
    logger.info(
      "✅ Environment validation passed - all required variables configured correctly",
    );
    return;
  }

  // Display errors
  if (errors.length > 0) {
    logger.error("❌ Environment Validation Failed");
    logger.error("");

    errors.forEach((error, index) => {
      logger.error(`${index + 1}. ${error.variable}: ${error.message}`);
      if (error.suggestion) {
        logger.error(`   💡 ${error.suggestion}`);
      }
      logger.error("");
    });
  }

  // Display warnings
  if (warnings.length > 0) {
    logger.warn("⚠️  Environment Warnings");
    logger.warn("");

    warnings.forEach((warning, index) => {
      logger.warn(`${index + 1}. ${warning.variable}: ${warning.message}`);
      logger.warn(`   Impact: ${warning.impact}`);
      if (warning.suggestion) {
        logger.warn(`   💡 ${warning.suggestion}`);
      }
      logger.warn("");
    });
  }

  // Display helpful setup guidance
  if (errors.length > 0) {
    logger.error("📋 Required Environment Variables Setup Guide:");
    logger.error("");

    // Group by category
    const categories = {
      core: ENV_SPECS.filter(
        (s) => s.category === "core" && missingCritical.includes(s.name),
      ),
      firebase: ENV_SPECS.filter(
        (s) => s.category === "firebase" && missingCritical.includes(s.name),
      ),
      ai: ENV_SPECS.filter((s) => s.category === "ai"),
      security: ENV_SPECS.filter(
        (s) => s.category === "security" && missingCritical.includes(s.name),
      ),
    };

    Object.entries(categories).forEach(([categoryName, specs]) => {
      if (specs.length > 0 || categoryName === "ai") {
        logger.error(`🔧 ${categoryName.toUpperCase()} Configuration:`);

        if (categoryName === "ai") {
          logger.error("   # At least ONE of these is required:");
          logger.error(
            "   GROQ_API_KEY=gsk_your_groq_key_here          # Fastest, recommended",
          );
          logger.error(
            "   OPENAI_API_KEY=sk-your_openai_key_here       # Reliable fallback",
          );
          logger.error(
            "   ANTHROPIC_API_KEY=sk-ant-your_key_here       # High quality",
          );
        } else {
          specs.forEach((spec) => {
            logger.error(
              `   ${spec.name}=${spec.example || "[required_value]"}    # ${spec.description}`,
            );
          });
        }
        logger.error("");
      }
    });

    logger.error("📄 Example .env file:");
    logger.error("");
    logger.error("# Core Settings");
    logger.error("NODE_ENV=production");
    logger.error("PORT=5000");
    logger.error("");
    logger.error("# Database (optional - uses memory storage if not provided)");
    logger.error("DATABASE_URL=postgresql://user:password@host:5432/dbname");
    logger.error("");
    logger.error("# Firebase Authentication");
    logger.error("FIREBASE_PROJECT_ID=your-project-id");
    logger.error('FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}');
    logger.error("VITE_FIREBASE_API_KEY=AIzaSyC...");
    logger.error("VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com");
    logger.error("VITE_FIREBASE_PROJECT_ID=your-project-id");
    logger.error("");
    logger.error("# AI Provider (choose one or more)");
    logger.error("GROQ_API_KEY=gsk_your_groq_key_here");
    logger.error("");
    logger.error("# Security");
    logger.error(
      "SESSION_SECRET=your-very-secure-random-string-32-chars-minimum",
    );
    logger.error("");
  }
}

/**
 * Validate environment and exit process if critical errors exist
 */
export function validateEnvironmentOrExit(): EnvValidationResult {
  const result = validateEnvironment();

  displayValidationResults(result);

  const authBypassMode = process.env.AUTH_BYPASS_MODE === "true";
  const _isTest = process.env.NODE_ENV === "test";

  if (!result.isValid && !authBypassMode) {
    logger.error(
      "💥 Application cannot start due to environment configuration errors.",
    );
    logger.error("Please fix the above issues and restart the application.");
    logger.error("");
    logger.error(
      "ℹ️  For testing purposes, you can set AUTH_BYPASS_MODE=true to bypass some validations.",
    );
    process.exit(1);
  } else if (!result.isValid && authBypassMode) {
    logger.warn(
      "⚠️  Starting with configuration errors due to AUTH_BYPASS_MODE=true",
    );
    logger.warn("This should only be used for testing purposes.");
  }

  return result;
}

/**
 * Get environment variable safely with validation
 */
export function getEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];

  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${name} is not set`);
  }

  return value;
}

/**
 * Get environment variable as number with validation
 */
export function getEnvNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];

  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${name} is not set`);
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `Environment variable ${name} must be a valid number, got: ${value}`,
    );
  }

  return parsed;
}

/**
 * Get environment variable as boolean with validation
 */
export function getEnvBoolean(name: string, defaultValue?: boolean): boolean {
  const value = process.env[name];

  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${name} is not set`);
  }

  const normalized = value.toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  } else if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  } else {
    throw new Error(
      `Environment variable ${name} must be a boolean value, got: ${value}`,
    );
  }
}

/**
 * Validate JSON environment variable
 */
export function getEnvJSON<T = object>(name: string, defaultValue?: T): T {
  const value = process.env[name];

  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Required environment variable ${name} is not set`);
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(
      `Environment variable ${name} must be valid JSON, got: ${value}`,
    );
  }
}
