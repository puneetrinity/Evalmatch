/**
 * Environment Configuration
 * 
 * This module loads and validates environment variables required by the application,
 * providing sensible defaults where possible.
 */

// Environment type
export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test'
}

// Configuration interface
interface Config {
  // Server configuration
  port: number;
  env: Environment;
  
  // Database configuration
  databaseUrl: string | null;
  
  // API keys
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  
  // Deployment configuration
  isDatabaseEnabled: boolean;
}

// Load and validate environment variables
export function loadConfig(): Config {
  // Determine environment
  const nodeEnv = process.env.NODE_ENV || 'development';
  const env = nodeEnv as Environment;

  // Server configuration
  const port = parseInt(process.env.PORT || '3000', 10);
  
  // Database configuration
  const databaseUrl = process.env.DATABASE_URL || null;
  
  // API keys
  const openaiApiKey = process.env.PR_OPEN_API_KEY || null;
  const anthropicApiKey = process.env.PR_ANTHROPIC_API_KEY || null;

  // Log API key status
  if (openaiApiKey) {
    console.log('OpenAI API key configuration: Key is set');
  } else {
    console.log('OpenAI API key configuration: Key is NOT set');
  }
  
  if (anthropicApiKey) {
    console.log('Anthropic API key configuration: Key is set');
  } else {
    console.log('Anthropic API key configuration: Key is NOT set');
  }
  
  // Feature flags
  const isDatabaseEnabled = !!databaseUrl || env === Environment.Production;
  
  // Log configuration (sanitized)
  console.log('Environment:', env);
  console.log('Database:', isDatabaseEnabled ? 'Enabled' : 'Disabled');
  console.log('OpenAI API:', openaiApiKey ? 'Configured' : 'Missing');
  console.log('Anthropic API:', anthropicApiKey ? 'Configured' : 'Missing');
  
  // Return config object
  return {
    port,
    env: env as Environment,
    databaseUrl,
    openaiApiKey,
    anthropicApiKey,
    isDatabaseEnabled
  };
}

// Export config singleton
export const config = loadConfig();