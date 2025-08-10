/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  setupFiles: [
    '<rootDir>/tests/jest.setup.js', 
    '<rootDir>/tests/helpers/jsdom-navigation-polyfill.js',
    '<rootDir>/tests/__mocks__/import-meta-env.js'
  ],
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.test.tsx'
  ],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@server/(.*)$': '<rootDir>/server/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@/tests/(.*)$': '<rootDir>/tests/$1',
    '^firebase-admin/(.*)$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^firebase-admin$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^jose$': '<rootDir>/tests/__mocks__/jose.ts',
    '^jwks-rsa$': '<rootDir>/tests/__mocks__/jwks-rsa.ts',
    '^wouter$': '<rootDir>/tests/__mocks__/wouter.ts',
  },
  // Handle import.meta.env properly
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
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.test.json'
    }]
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!(wouter|jose|jwks-rsa|@firebase|regexparam)/)'
  ],
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  resetModules: true,
  
  // MEMORY OPTIMIZATION SETTINGS
  maxWorkers: '25%', // Reduce workers to prevent memory exhaustion
  workerIdleMemoryLimit: '256MB', // Kill workers when idle memory exceeds limit
  logHeapUsage: true, // Monitor memory usage
  forceExit: true, // Force exit to prevent hanging processes
  detectOpenHandles: true, // Detect memory leaks
  
  // TEST EXECUTION OPTIMIZATION
  bail: 0, // Continue running tests to get full picture
  verbose: false, // Reduce console output to save memory
  silent: false, // Keep error reporting
  
  // CACHE OPTIMIZATION
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  clearCache: false, // Don't clear cache unless necessary
  
  collectCoverageFrom: [
    'client/src/**/*.{ts,tsx}',
    'server/**/*.{ts,js}',
    'shared/**/*.{ts,js}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html']
};