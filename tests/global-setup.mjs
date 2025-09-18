/**
 * Jest Global Setup
 * Runs once before all tests start
 */

export default async function globalSetup() {
  console.log('🚀 Starting Jest global setup...');
  
  // Set up test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_EXTERNAL_SERVICES = 'true';
  process.env.MOCK_AI_PROVIDERS = 'true';
  process.env.AUTH_BYPASS_MODE = 'true';
  
  // Mock AI provider API keys to prevent initialization errors
  process.env.OPENAI_API_KEY = 'mock-openai-api-key';
  process.env.GROQ_API_KEY = 'mock-groq-api-key';
  process.env.ANTHROPIC_API_KEY = 'mock-anthropic-api-key';
  
  // Set Admin/Beta environment defaults for protected routes and tier logic
  process.env.ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || 'test-admin';
  process.env.BETA_MODE = process.env.BETA_MODE || 'true';
  
  // Credit system configuration defaults
  process.env.CREDIT_SYSTEM_ENABLED = process.env.CREDIT_SYSTEM_ENABLED || 'true';
  process.env.DEFAULT_CREDIT_LIMIT = process.env.DEFAULT_CREDIT_LIMIT || '100';
  process.env.TEST_USER_CREDITS = process.env.TEST_USER_CREDITS || '50';
  
  // Ensure database is enabled for integration tests
  process.env.DATABASE_ENABLED = process.env.DATABASE_ENABLED || 'true';
  
  // Set test database URL if not already set
  if (!process.env.TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/evalmatch_test';
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  
  // For CI environments without a database, use a mock connection string
  if (process.env.CI && !process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock_test';
    process.env.TEST_DATABASE_URL = 'postgresql://mock:mock@localhost:5432/mock_test';
  }
  
  console.log('✅ Jest global setup completed');
}