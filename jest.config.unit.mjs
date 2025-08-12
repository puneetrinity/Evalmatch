/**
 * Jest configuration for unit tests
 */

export default {
  displayName: 'unit',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json'
    }]
  },
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(@xenova|string-similarity)/)'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-unit.ts'],
  collectCoverageFrom: [
    'server/**/*.ts',
    'shared/**/*.ts',
    '!server/**/*.d.ts',
    '!**/*.test.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: false, // Reduce verbose output to save memory
  silent: false,
  maxWorkers: 1, // Sequential execution for unit tests to prevent memory conflicts
  workerIdleMemoryLimit: '256MB', // Increased limit for complex tests
  testTimeout: 15000, // Increased timeout for memory-intensive tests
  
  // Additional memory optimization for unit tests
  logHeapUsage: false, // Disable heap logging to save memory
  forceExit: true,
  detectOpenHandles: false, // Disable for unit tests to improve performance
  
  // Memory optimization settings
  clearMocks: true,
  restoreMocks: true,
  resetModules: false, // Keep false unless specifically needed per test
};