/**
 * Legacy Configuration Module
 * 
 * This module is DEPRECATED and replaced by config/unified-config.ts
 * Kept for backward compatibility during migration.
 */

import { config as unifiedConfig, Environment } from './config/unified-config';

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

// Transform unified config to legacy format
const legacyConfig: LegacyConfig = {
  port: unifiedConfig.port,
  env: unifiedConfig.env,
  databaseUrl: unifiedConfig.database.url,
  openaiApiKey: unifiedConfig.ai.providers.openai.apiKey,
  anthropicApiKey: unifiedConfig.ai.providers.anthropic.apiKey,
  isDatabaseEnabled: unifiedConfig.database.enabled,
};

export const config = legacyConfig;