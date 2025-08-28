/**
 * Test Setup Configuration
 * Runs before all tests to set up environment
 */

import '@testing-library/jest-dom';
import dotenv from 'dotenv';
import { jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Load environment variables for testing
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS_MODE = 'true'; // Skip authentication in tests
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

// Mock window.matchMedia for React components (only in browser/jsdom environment)
if (typeof window !== 'undefined') {
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
}

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

// Mock localStorage (only in browser/jsdom environment)
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
if (typeof window !== 'undefined') {
  Object.defineProperty(global, 'localStorage', { value: localStorageMock });
}

// Mock sessionStorage (only in browser/jsdom environment)
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(),
};
if (typeof window !== 'undefined') {
  Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });
}

// Global test configuration
beforeAll(async () => {
  // Ensure database is available
  if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
    console.warn('⚠️  No test database URL provided. Some tests may fail.');
  }

  // Ensure upload directories exist for tests
  const fs = await import('fs');
  const path = await import('path');
  
  const uploadDirs = ['uploads', 'uploads/quarantine', 'uploads/pending', 'uploads/processed'];
  for (const dir of uploadDirs) {
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (error) {
      // Directory might already exist, ignore error
    }
  }

  console.log('🧪 Test environment initialized');
  console.log(`   Database: ${process.env.TEST_DATABASE_URL ? 'Test DB' : 'Main DB'}`);
  console.log(`   Auth bypass: ${process.env.AUTH_BYPASS_MODE}`);
});

// Global test cleanup
afterAll(async () => {
  console.log('🧹 Test cleanup completed');
});

// Better test isolation
beforeEach(() => {
  // Reset all mocks between tests
  jest.clearAllMocks();
  
  // Reset console mock between tests
  if (typeof global.console.error === 'function' && 'mockClear' in global.console.error) {
    (global.console.error as jest.MockedFunction<any>).mockClear();
  }
  if (typeof global.console.warn === 'function' && 'mockClear' in global.console.warn) {
    (global.console.warn as jest.MockedFunction<any>).mockClear();
  }
  
  // Reset localStorage mock (only if in browser/jsdom environment)
  if (typeof window !== 'undefined' && localStorageMock) {
    localStorageMock.getItem.mockReturnValue(null);
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    localStorageMock.clear.mockClear();
  }
  
  // Reset sessionStorage mock (only if in browser/jsdom environment)
  if (typeof window !== 'undefined' && sessionStorageMock) {
    sessionStorageMock.getItem.mockReturnValue(null);
    sessionStorageMock.setItem.mockClear();
    sessionStorageMock.removeItem.mockClear();
    sessionStorageMock.clear.mockClear();
  }
  
  // Reset fetch mock
  if (global.fetch && typeof global.fetch === 'function' && 'mockClear' in global.fetch) {
    (global.fetch as jest.MockedFunction<any>).mockClear();
  }
});

afterEach(() => {
  // Additional cleanup after each test
  jest.restoreAllMocks();
});

// Increase timeout for integration tests
jest.setTimeout(30000);