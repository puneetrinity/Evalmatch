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
    MODE: 'test',
    DEV: true,
    PROD: false,
    // Firebase environment variables
    VITE_FIREBASE_API_KEY: 'test-api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'test-auth-domain',
    VITE_FIREBASE_PROJECT_ID: 'test-project-id',
    VITE_FIREBASE_STORAGE_BUCKET: 'test-storage-bucket',
    VITE_FIREBASE_MESSAGING_SENDER_ID: 'test-sender-id',
    VITE_FIREBASE_APP_ID: 'test-app-id'
  }
};

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

// Additional JSDOM polyfills for browser APIs (only in browser/jsdom environment)
// Note: Don't redefine location as JSDOM already provides it
// Instead, enhance existing location object with missing methods
if (typeof window !== 'undefined' && window.location) {
  // Mock location methods with proper implementation
  if (typeof window.location.assign !== 'function') {
    window.location.assign = jest.fn((url) => {
      // Simulate navigation by updating href
      Object.defineProperty(window.location, 'href', {
        writable: true,
        value: url
      });
    });
  }
  if (typeof window.location.replace !== 'function') {
    window.location.replace = jest.fn((url) => {
      // Simulate navigation by updating href
      Object.defineProperty(window.location, 'href', {
        writable: true,
        value: url
      });
    });
  }
  if (typeof window.location.reload !== 'function') {
    window.location.reload = jest.fn();
  }
}

// Mock navigation API (only in browser/jsdom environment)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'navigation', {
    value: {
      navigate: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
    },
    writable: true,
  });
}

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