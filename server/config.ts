/**
 * Legacy Configuration Module
 * 
 * This module is DEPRECATED and replaced by config/unified-config.ts
 * Kept for backward compatibility during migration.
 */

import { config as unifiedConfig, Environment } from './config/unified-config';

// Debug logging for Railway
console.log('🔧 Legacy config loading...');
console.log('UnifiedConfig available:', !!unifiedConfig);
console.log('Environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  AUTH_BYPASS_MODE: process.env.AUTH_BYPASS_MODE,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING',
  GROQ_API_KEY: process.env.GROQ_API_KEY ? 'SET' : 'MISSING'
});

// Re-export unified config with legacy interface
export { Environment };

// Legacy config interface for backward compatibility
interface LegacyConfig {
  port: number;
  env: Environment;
  databaseUrl: string | null;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  isDatabaseEnabled: boolean;
}

// Transform unified config to legacy format with safety checks
const legacyConfig: LegacyConfig = {
  port: unifiedConfig?.port || parseInt(process.env.PORT || '5000', 10),
  env: unifiedConfig?.env || (process.env.NODE_ENV as Environment) || Environment.Development,
  databaseUrl: unifiedConfig?.database?.url || process.env.DATABASE_URL || null,
  openaiApiKey: unifiedConfig?.ai?.providers?.openai?.apiKey || process.env.OPENAI_API_KEY || null,
  anthropicApiKey: unifiedConfig?.ai?.providers?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY || null,
  isDatabaseEnabled: unifiedConfig?.database?.enabled || !!process.env.DATABASE_URL,
};

export const config = legacyConfig;