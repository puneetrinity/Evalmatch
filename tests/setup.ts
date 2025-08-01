/**
 * Test Setup Configuration
 * Runs before all tests to set up environment
 */

import dotenv from 'dotenv';

// Load environment variables for testing
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS_MODE = 'true'; // Skip authentication in tests

// Global test configuration
beforeAll(async () => {
  // Ensure database is available
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    console.warn('⚠️  No test database URL provided. Some tests may fail.');
  }

  console.log('🧪 Test environment initialized');
  console.log(`   Database: ${process.env.TEST_DATABASE_URL ? 'Test DB' : 'Main DB'}`);
  console.log(`   Auth bypass: ${process.env.AUTH_BYPASS_MODE}`);
});

// Global test cleanup
afterAll(async () => {
  console.log('🧹 Test cleanup completed');
});

// Increase timeout for integration tests
jest.setTimeout(30000);