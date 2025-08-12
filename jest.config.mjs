/**
 * Jest Configuration with 2024/2025 Best Practices
 * Optimized for ES Modules, TypeScript, and Memory Efficiency
 * @type {import('jest').Config}
 */

export default {
  displayName: 'main',
  
  // ES Module Configuration (2024/2025 best practice)
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx', '.mts', '.cts'],
  
  // Setup and Environment Configuration
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  setupFiles: [
    '<rootDir>/tests/jest.setup.mjs', 
    '<rootDir>/tests/helpers/jsdom-navigation-polyfill.mjs',
    '<rootDir>/tests/__mocks__/import-meta-env.mjs'
  ],
  
  // Test File Discovery
  testMatch: [
    '**/tests/**/*.test.{ts,tsx,mts,cts}',
    '!**/tests/unit/**/*',
    '!**/tests/integration/**/*',
    '!**/tests/e2e/**/*'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/build/',
    '/dist/',
    '/coverage/'
  ],
  
  // Module Resolution and Path Mapping
  moduleNameMapper: {
    // Path aliases
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@server/(.*)$': '<rootDir>/server/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@/tests/(.*)$': '<rootDir>/tests/$1',
    
    // External module mocks
    '^firebase-admin/(.*)$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^firebase-admin$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^jose$': '<rootDir>/tests/__mocks__/jose.ts',
    '^jwks-rsa$': '<rootDir>/tests/__mocks__/jwks-rsa.ts',
    
    // Internal module mocks
    '^../../../server/lib/logger$': '<rootDir>/tests/__mocks__/logger.ts',
    '^../../server/lib/logger$': '<rootDir>/tests/__mocks__/logger.ts',
    '^wouter$': '<rootDir>/tests/__mocks__/wouter.ts',
    
    // ES Module file extension handling
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^(\\.{1,2}/.*)\\.mjs$': '$1',
    '^(\\.{1,2}/.*)\\.cjs$': '$1'
  },
  
  // TypeScript and ES Module Transformation
  transform: {
    '^.+\\.(ts|tsx|mts|cts)$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.test.json',
      // 2024/2025 ts-jest optimizations
      diagnostics: {
        ignoreCodes: [1343], // Ignore import assertions warnings
      },
    }]
  },
  
  // Transform Ignore Patterns (2024/2025 updated for modern packages)
  transformIgnorePatterns: [
    'node_modules/(?!(wouter|jose|jwks-rsa|@firebase|regexparam|@xenova|string-similarity|@anthropic-ai|groq-sdk)/)'
  ],
  
  // Module File Extensions
  moduleFileExtensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'json'],
  
  // Global Environment Variables (using testEnvironmentOptions for 2024/2025)
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons'],
    url: 'http://localhost:3000'
  },
  
  // Environment Variables Setup
  globalSetup: '<rootDir>/tests/global-setup.mjs',
  globalTeardown: '<rootDir>/tests/global-teardown.mjs',
  
  // Import.meta.env handling through setup file
  globals: {
    'import.meta': {
      env: {
        VITE_API_BASE_URL: 'http://localhost:3000',
        VITE_APP_ENV: 'test',
        NODE_ENV: 'test',
        MODE: 'test',
        DEV: true,
        PROD: false,
        VITE_FIREBASE_API_KEY: 'test-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'test-auth-domain',
        VITE_FIREBASE_PROJECT_ID: 'test-project-id',
        VITE_FIREBASE_STORAGE_BUCKET: 'test-storage-bucket',
        VITE_FIREBASE_MESSAGING_SENDER_ID: 'test-sender-id',
        VITE_FIREBASE_APP_ID: 'test-app-id'
      }
    }
  },
  
  // Performance and Memory Optimization (2024/2025 best practices)
  maxWorkers: process.env.CI ? 1 : '25%', // Adjust for CI vs local
  workerIdleMemoryLimit: process.env.CI ? '1024MB' : '512MB',
  
  // Test Execution Configuration
  testTimeout: 30000,
  testSequencer: '@jest/test-sequencer', // Use default sequencer for 2024/2025
  
  // Mock and Module Management
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  resetMocks: false, // Changed for better performance
  
  // Output and Reporting Configuration
  verbose: false, // Keep false for better performance
  silent: false,
  errorOnDeprecated: false, // Set to false to avoid warnings in 2024/2025
  
  // Cache Configuration (2024/2025 optimized)
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  cache: true,
  
  // Debug and Monitoring
  logHeapUsage: process.env.DEBUG_MEMORY === 'true',
  forceExit: true,
  detectOpenHandles: true,
  detectLeaks: process.env.DEBUG_MEMORY === 'true',
  openHandlesTimeout: 10000, // Give extra time for cleanup in CI
  
  // Test Execution Control
  bail: 0, // Continue running all tests
  maxConcurrency: process.env.CI ? 1 : 5,
  
  // Coverage Configuration
  collectCoverageFrom: [
    'client/src/**/*.{ts,tsx}',
    'server/**/*.{ts,js}',
    'shared/**/*.{ts,js}',
    '!**/*.d.ts',
    '!**/*.test.{ts,tsx}',
    '!**/*.spec.{ts,tsx}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/dist/',
    '/build/',
    '\\.d\\.ts$'
  ],
  
  // 2024/2025 Jest Configuration Updates
  injectGlobals: true, // Explicit global injection
  sandboxInjectedGlobals: ['Math'], // Sandbox specific globals
  
  // Snapshot Configuration
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true
  },
  
  // Reporter Configuration
  reporters: [
    'default',
    ...(process.env.CI ? [['jest-junit', { outputDirectory: 'coverage', outputName: 'junit.xml' }]] : [])
  ],
  
  // Watch Mode Configuration
  watchman: true,
  watchPathIgnorePatterns: ['/node_modules/', '/build/', '/dist/', '/coverage/']
};