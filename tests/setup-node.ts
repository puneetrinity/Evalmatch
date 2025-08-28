/**
 * Test Setup Configuration for Node Environment (Integration Tests)
 * Runs before integration tests to set up environment
 */

import dotenv from 'dotenv';

// Load environment variables for testing
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS_MODE = 'true'; // Skip authentication in tests
process.env.DISABLE_EXTERNAL_SERVICES = 'true';
process.env.MOCK_AI_PROVIDERS = 'true';

// Memory optimization: Reduce test data sizes
process.env.TEST_DATA_SIZE_LIMIT = '1000'; // Limit test data size
process.env.CONSOLE_LOG_LEVEL = 'error'; // Reduce console noise

// Force garbage collection in Node.js
if (global.gc) {
  global.gc();
}

// Mock console methods to reduce memory usage during testing
const originalConsole = global.console;
global.console = {
  ...console,
  log: () => {}, // Suppress logs to reduce memory
  debug: () => {},
  info: () => {},
  warn: originalConsole.warn,
  error: originalConsole.error,
};

// Add cleanup after each test to free memory
if (typeof afterEach !== 'undefined') {
  afterEach(() => {
    if (global.gc) {
      global.gc();
    }
  });
}