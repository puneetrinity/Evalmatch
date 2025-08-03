/**
 * Jest setup file for Node.js polyfills and global test configuration
 */

// Polyfill TextEncoder/TextDecoder for Node.js environment
const { TextEncoder, TextDecoder } = require('util');

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// Polyfill fetch for Node.js testing environment
const fetch = require('node-fetch');
const { Headers, Request, Response } = fetch;

if (typeof global.fetch === 'undefined') {
  global.fetch = fetch.default || fetch;
  global.Headers = Headers;
  global.Request = Request;
  global.Response = Response;
}

// Mock console methods to reduce test noise
const originalConsoleError = console.error;
console.error = (...args) => {
  // Suppress specific React warnings in tests
  if (
    args[0] &&
    typeof args[0] === 'string' &&
    (args[0].includes('Warning:') || args[0].includes('validateDOMNesting'))
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

// Database mocking setup - Skip module mocking in setup, handle it in individual tests
// This allows for better control over when and how database modules are mocked

// Global test utilities
global.testUtils = {
  mockDatabase: !process.env.DATABASE_URL || process.env.TEST_TYPE === 'unit',
  hasRealDatabase: !!process.env.DATABASE_URL,
};

if (global.testUtils.mockDatabase) {
  console.log('🔧 Mock database mode enabled for tests');
} else {
  console.log('🔌 Real database mode enabled for integration tests');
}