/**
 * Legacy Configuration Module
 * 
 * This module is DEPRECATED and replaced by config/unified-config.ts
 * Kept for backward compatibility during migration.
 * 
 * IMPORTANT: This module uses direct environment variable access to avoid
 * circular dependencies that were causing startup failures.
 */

import { bootstrap } from './config/bootstrap';

// Debug logging for Railway
console.log('🔧 Legacy config loading...');
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  AUTH_BYPASS_MODE: process.env.AUTH_BYPASS_MODE,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING',
  GROQ_API_KEY: process.env.GROQ_API_KEY ? 'SET' : 'MISSING'
});

// Environment types
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test'
}

// Legacy config interface for backward compatibility
interface LegacyConfig {
  port: number;
  env: Environment;
  databaseUrl: string | null;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  isDatabaseEnabled: boolean;
}

// Direct environment variable access to avoid circular dependencies
const legacyConfig: LegacyConfig = {
  port: bootstrap.port,
  env: (process.env.NODE_ENV as Environment) || Environment.Development,
  databaseUrl: process.env.DATABASE_URL || null,
  openaiApiKey: process.env.OPENAI_API_KEY || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  isDatabaseEnabled: !!process.env.DATABASE_URL,
};

console.log('✅ Legacy config created:', {
  port: legacyConfig.port,
  env: legacyConfig.env,
  hasDatabaseUrl: !!legacyConfig.databaseUrl,
  hasOpenaiKey: !!legacyConfig.openaiApiKey,
  hasAnthropicKey: !!legacyConfig.anthropicApiKey
});

export const config = legacyConfig;