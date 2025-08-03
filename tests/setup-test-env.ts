/**
 * Test Environment Setup
 * Configures database, mock services, and test utilities
 */

import { execSync } from 'child_process';
import path from 'path';
import { db } from '../server/db';
import { users, resumes, jobDescriptions, analysisResults, interviewQuestions } from '../shared/schema';

// Test database configuration
export const TEST_DB_CONFIG = {
  connectionString: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/evalmatch_test',
  maxConnections: 5,
  idleTimeoutMillis: 30000,
};

// Test data cleanup
export const cleanupTestData = async () => {
  try {
    // Clean up in reverse dependency order
    await db.delete(interviewQuestions);
    await db.delete(analysisResults);
    await db.delete(resumes);
    await db.delete(jobDescriptions);
    await db.delete(users);
    
    console.log('✅ Test data cleaned up successfully');
  } catch (error) {
    console.error('❌ Failed to cleanup test data:', error);
    throw error;
  }
};

// Create test database if it doesn't exist
export const setupTestDatabase = async () => {
  try {
    // Check if test database exists and create if needed
    const dbName = 'evalmatch_test';
    
    try {
      execSync(`createdb ${dbName}`, { stdio: 'ignore' });
      console.log(`✅ Test database '${dbName}' created`);
    } catch (error) {
      // Database might already exist, that's okay
      console.log(`ℹ️ Test database '${dbName}' already exists or creation skipped`);
    }

    // Run migrations on test database
    execSync('npm run db:migrate:test', { stdio: 'inherit', cwd: process.cwd() });
    console.log('✅ Test database migrations completed');

  } catch (error) {
    console.error('❌ Failed to setup test database:', error);
    throw error;
  }
};

// Global test setup
export const globalSetup = async () => {
  console.log('🚀 Setting up test environment...');
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DB_CONFIG.connectionString;
  process.env.DISABLE_EXTERNAL_SERVICES = 'true';
  process.env.MOCK_AI_PROVIDERS = 'true';
  process.env.TEST_MODE = 'true';

  try {
    await setupTestDatabase();
    console.log('✅ Test environment setup completed');
  } catch (error) {
    console.error('❌ Test environment setup failed:', error);
    process.exit(1);
  }
};

// Global test teardown
export const globalTeardown = async () => {
  console.log('🧹 Cleaning up test environment...');
  
  try {
    await cleanupTestData();
    
    // Close database connections
    await db.$client.end();
    
    console.log('✅ Test environment cleanup completed');
  } catch (error) {
    console.error('❌ Test environment cleanup failed:', error);
  }
};

// Test utilities
export const testUtils = {
  // Wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate test IDs
  generateTestId: (prefix: string = 'test') => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
  
  // Mock fetch for client-side tests
  mockFetch: (response: any, status: number = 200) => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(response),
        text: () => Promise.resolve(JSON.stringify(response)),
      })
    ) as jest.Mock;
  },
  
  // Reset all mocks
  resetMocks: () => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.restoreAllMocks();
  },
  
  // Console capture for testing logs
  captureConsole: () => {
    const originalConsole = { ...console };
    const logs: string[] = [];
    
    console.log = jest.fn((...args) => {
      logs.push(args.join(' '));
    });
    
    console.error = jest.fn((...args) => {
      logs.push(`ERROR: ${args.join(' ')}`);
    });
    
    console.warn = jest.fn((...args) => {
      logs.push(`WARN: ${args.join(' ')}`);
    });
    
    return {
      getLogs: () => logs,
      restore: () => {
        Object.assign(console, originalConsole);
      }
    };
  }
};

// Export for use in tests
export default {
  globalSetup,
  globalTeardown,
  cleanupTestData,
  testUtils,
  TEST_DB_CONFIG
};