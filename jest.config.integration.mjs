/**
 * Jest Configuration for Integration Tests
 */

export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.test.json'
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@server/(.*)$': '<rootDir>/server/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@/tests/(.*)$': '<rootDir>/tests/$1',
    '^firebase-admin/(.*)$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^firebase-admin$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^jose$': '<rootDir>/tests/__mocks__/jose.ts',
    '^jwks-rsa$': '<rootDir>/tests/__mocks__/jwks-rsa.ts',
    '^@xenova/transformers$': '<rootDir>/tests/__mocks__/transformers.ts',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jose|jwks-rsa|@firebase|@xenova)/)'
  ],
  roots: ['<rootDir>/tests'],
  testMatch: [
    '**/*.test.ts',
    '!**/unit/**/*.test.ts' // Exclude unit tests from integration test runs
  ],
  collectCoverageFrom: [
    'server/**/*.{ts,js}',
    'shared/**/*.{ts,js}',
    '!server/**/*.d.ts',
    '!server/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-node.ts'],
  testTimeout: 30000, // 30 seconds for integration tests
  maxWorkers: 1, // Run tests sequentially to avoid database conflicts
  verbose: false, // Reduce console output to save memory
  bail: 1, // Stop on first failure for faster feedback
  
  // Memory optimization settings
  forceExit: true,
  detectOpenHandles: true,
  logHeapUsage: true,
  workerIdleMemoryLimit: '512MB'
};