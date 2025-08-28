/**
 * Jest Browser Test Setup
 * Configures browser environment for React component and client-side tests
 */

import '@testing-library/jest-dom';
import dotenv from 'dotenv';

// Load environment variables for testing
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS_MODE = 'true';
process.env.DISABLE_EXTERNAL_SERVICES = 'true';
process.env.MOCK_AI_PROVIDERS = 'true';

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock fetch for tests
global.fetch = jest.fn();

// Mock window.matchMedia for React components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock window.IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

// Mock IndexedDB
const indexedDBMock = {
  open: jest.fn(),
  deleteDatabase: jest.fn(),
  cmp: jest.fn(),
};
Object.defineProperty(global, 'indexedDB', { value: indexedDBMock });

// Mock crypto.subtle for checksums
Object.defineProperty(global.crypto, 'subtle', {
  value: {
    digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
  },
});

// Global test configuration
beforeAll(async () => {
  console.log('🧪 Browser test environment initialized');
});

afterAll(async () => {
  console.log('🧹 Browser test cleanup completed');
});

// Increase timeout for React tests
jest.setTimeout(30000);