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

// Environment variable setup for tests
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/evalmatch_test';
process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;

// Mock environment variables that might be missing in tests
process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3000';
process.env.VITE_APP_ENV = 'test';

// Mock import.meta for Vite-specific code in tests
global.importMeta = {
  env: {
    VITE_API_BASE_URL: process.env.VITE_API_BASE_URL,
    VITE_APP_ENV: 'test',
    NODE_ENV: 'test',
    MODE: 'test'
  }
};

// Define import.meta globally for modules that expect it
Object.defineProperty(global, 'import', {
  value: {
    meta: {
      env: global.importMeta.env
    }
  },
  writable: false,
  configurable: false
});

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

// Additional JSDOM polyfills for browser APIs
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000',
    origin: 'http://localhost:3000',
    protocol: 'http:',
    host: 'localhost:3000',
    hostname: 'localhost',
    port: '3000',
    pathname: '/',
    search: '',
    hash: '',
    assign: jest.fn(),
    replace: jest.fn(),
    reload: jest.fn(),
  },
  writable: true,
});

// Mock navigation API
Object.defineProperty(window, 'navigation', {
  value: {
    navigate: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  },
  writable: true,
});

// Mock caches API
Object.defineProperty(global, 'caches', {
  value: {
    open: jest.fn(() => Promise.resolve({
      match: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    })),
    delete: jest.fn(),
    keys: jest.fn(() => Promise.resolve([])),
  },
  writable: true,
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));