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
  
  // Set test database URL if not already set
  if (!process.env.TEST_DATABASE_URL) {
    process.env.TEST_DATABASE_URL = 'postgresql://test:test@localhost:5432/evalmatch_test';
  }
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  
  console.log('✅ Jest global setup completed');
}