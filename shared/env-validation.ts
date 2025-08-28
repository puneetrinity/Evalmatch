/**
 * Environment Variable Validation and Type Safety
 * 
 * This file provides comprehensive validation for environment variables
 * with proper TypeScript typing and runtime validation.
 */

import { z } from 'zod';

// Environment variable schemas
export const DatabaseConfigSchema = z.object({
  DATABASE_URL: z.string().url('Invalid database URL').optional(),
  DB_TYPE: z.enum(['postgresql', 'sqlite', 'memory']).default('postgresql'),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSL: z.coerce.boolean().default(false),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DB_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(30000),
  DB_QUERY_TIMEOUT: z.coerce.number().int().positive().default(60000),
});

export const ServerConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters').optional(),
  JWT_EXPIRY: z.string().default('24h'),
});

export const FirebaseConfigSchema = z.object({
  FIREBASE_PROJECT_ID: z.string().min(1, 'Firebase project ID is required'),
  FIREBASE_PRIVATE_KEY_ID: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1, 'Firebase private key is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('Invalid Firebase client email'),
  FIREBASE_CLIENT_ID: z.string().min(1).optional(),
  FIREBASE_AUTH_URI: z.string().url().optional(),
  FIREBASE_TOKEN_URI: z.string().url().optional(),
  FIREBASE_CLIENT_X509_CERT_URL: z.string().url().optional(),
  FIREBASE_API_KEY: z.string().min(1, 'Firebase API key is required'),
  FIREBASE_AUTH_DOMAIN: z.string().min(1, 'Firebase auth domain is required'),
  FIREBASE_STORAGE_BUCKET: z.string().min(1).optional(),
  FIREBASE_MESSAGING_SENDER_ID: z.string().min(1).optional(),
  FIREBASE_APP_ID: z.string().min(1, 'Firebase app ID is required'),
  FIREBASE_MEASUREMENT_ID: z.string().optional(),
});

export const AIProviderConfigSchema = z.object({
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required').optional(),
  OPENAI_MODEL: z.string().default('gpt-4'),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  OPENAI_TIMEOUT: z.coerce.number().int().positive().default(60000),

  // Anthropic Configuration
  ANTHROPIC_API_KEY: z.string().min(1, 'Anthropic API key is required').optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-sonnet-20240229'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  ANTHROPIC_TIMEOUT: z.coerce.number().int().positive().default(60000),

  // Groq Configuration
  GROQ_API_KEY: z.string().min(1, 'Groq API key is required').optional(),
  GROQ_MODEL: z.string().default('llama-3.1-70b-versatile'),
  GROQ_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  GROQ_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  GROQ_TIMEOUT: z.coerce.number().int().positive().default(30000),

  // AI Provider Selection
  PRIMARY_AI_PROVIDER: z.enum(['openai', 'anthropic', 'groq']).default('anthropic'),
  FALLBACK_AI_PROVIDERS: z.string().optional(), // Comma-separated list
  AI_RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  AI_RETRY_DELAY: z.coerce.number().int().positive().default(1000),
});

export const StorageConfigSchema = z.object({
  STORAGE_TYPE: z.enum(['local', 'memory', 'cloud']).default('local'),
  UPLOAD_MAX_SIZE: z.coerce.number().int().positive().default(10 * 1024 * 1024), // 10MB
  UPLOAD_ALLOWED_TYPES: z.string().default('application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'),
  UPLOAD_DIR: z.string().default('./uploads'),
  TEMP_DIR: z.string().default('./temp'),
  CLEANUP_INTERVAL: z.coerce.number().int().positive().default(3600000), // 1 hour
  MAX_FILE_AGE: z.coerce.number().int().positive().default(86400000), // 24 hours
});

export const SecurityConfigSchema = z.object({
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  CSRF_SECRET: z.string().min(32).optional(),
  HELMET_CSP: z.coerce.boolean().default(true),
  TRUST_PROXY: z.coerce.boolean().default(false),
  SECURE_COOKIES: z.coerce.boolean().default(false), // Set to true in production
  COOKIE_MAX_AGE: z.coerce.number().int().positive().default(86400000), // 24 hours
});

export const MonitoringConfigSchema = z.object({
  ENABLE_METRICS: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  HEALTH_CHECK_INTERVAL: z.coerce.number().int().positive().default(30000),
  PERFORMANCE_MONITORING: z.coerce.boolean().default(true),
  ERROR_TRACKING: z.coerce.boolean().default(true),
  LOG_REQUESTS: z.coerce.boolean().default(true),
  LOG_RESPONSES: z.coerce.boolean().default(false), // May contain sensitive data
});

// Combined environment schema
export const EnvironmentSchema = DatabaseConfigSchema
  .merge(ServerConfigSchema)
  .merge(FirebaseConfigSchema)
  .merge(AIProviderConfigSchema)
  .merge(StorageConfigSchema)
  .merge(SecurityConfigSchema)
  .merge(MonitoringConfigSchema);

// Type definitions
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type FirebaseConfig = z.infer<typeof FirebaseConfigSchema>;
export type AIProviderConfig = z.infer<typeof AIProviderConfigSchema>;
export type StorageConfig = z.infer<typeof StorageConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type EnvironmentConfig = z.infer<typeof EnvironmentSchema>;

// Validation utilities
export function validateEnvironment(env: NodeJS.ProcessEnv = process.env): {
  success: boolean;
  data?: EnvironmentConfig;
  errors?: string[];
} {
  try {
    const data = EnvironmentSchema.parse(env);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
}

export function validateDatabaseConfig(env: NodeJS.ProcessEnv = process.env): {
  success: boolean;
  data?: DatabaseConfig;
  errors?: string[];
} {
  try {
    const data = DatabaseConfigSchema.parse(env);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown database config validation error'] };
  }
}

export function validateServerConfig(env: NodeJS.ProcessEnv = process.env): {
  success: boolean;
  data?: ServerConfig;
  errors?: string[];
} {
  try {
    const data = ServerConfigSchema.parse(env);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown server config validation error'] };
  }
}

export function validateFirebaseConfig(env: NodeJS.ProcessEnv = process.env): {
  success: boolean;
  data?: FirebaseConfig;
  errors?: string[];
} {
  try {
    const data = FirebaseConfigSchema.parse(env);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown Firebase config validation error'] };
  }
}

export function validateAIProviderConfig(env: NodeJS.ProcessEnv = process.env): {
  success: boolean;
  data?: AIProviderConfig;
  errors?: string[];
} {
  try {
    const data = AIProviderConfigSchema.parse(env);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => 
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown AI provider config validation error'] };
  }
}

// Type guards for environment validation
export function isDevelopment(env?: string): boolean {
  return (env || process.env.NODE_ENV) === 'development';
}

export function isProduction(env?: string): boolean {
  return (env || process.env.NODE_ENV) === 'production';
}

export function isTest(env?: string): boolean {
  return (env || process.env.NODE_ENV) === 'test';
}

// Environment-specific configuration helpers
export function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export function getOptionalEnvVar(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || defaultValue;
}

export function getEnvAsNumber(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Required numeric environment variable ${name} is not set`);
  }
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid number, got: ${value}`);
  }
  
  return parsed;
}

export function getEnvAsBoolean(name: string, defaultValue?: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Required boolean environment variable ${name} is not set`);
  }
  
  return value.toLowerCase() === 'true';
}

export function getEnvAsArray(name: string, separator = ',', defaultValue?: string[]): string[] {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) return defaultValue;
    return [];
  }
  
  return value.split(separator).map(item => item.trim()).filter(Boolean);
}

// Configuration validation for specific environments
export function validateProductionConfig(env: NodeJS.ProcessEnv = process.env): {
  success: boolean;
  errors?: string[];
} {
  const requiredInProduction = [
    'DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_APP_ID',
    'SESSION_SECRET',
  ];

  const missing = requiredInProduction.filter(key => !env[key]);
  
  if (missing.length > 0) {
    return {
      success: false,
      errors: [`Missing required production environment variables: ${missing.join(', ')}`]
    };
  }

  // Additional production-specific validations
  const errors: string[] = [];

  if (env.NODE_ENV !== 'production') {
    errors.push('NODE_ENV must be set to "production" in production environment');
  }

  if (env.SESSION_SECRET && env.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters in production');
  }

  if (!env.SECURE_COOKIES || env.SECURE_COOKIES !== 'true') {
    errors.push('SECURE_COOKIES should be set to "true" in production');
  }

  return {
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

// Sanitize environment variables for logging (remove sensitive data)
export function sanitizeEnvForLogging(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const sensitiveKeys = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'JWT_SECRET',
    'FIREBASE_PRIVATE_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GROQ_API_KEY',
    'CSRF_SECRET',
  ];

  const sanitized: Record<string, string> = {};
  
  Object.entries(env).forEach(([key, value]) => {
    if (sensitiveKeys.some(sensitive => key.includes(sensitive))) {
      sanitized[key] = value ? '***REDACTED***' : 'undefined';
    } else {
      sanitized[key] = value || 'undefined';
    }
  });

  return sanitized;
}