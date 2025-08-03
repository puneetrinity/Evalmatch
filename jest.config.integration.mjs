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
      tsconfig: {
        types: ['jest', 'node'],
        module: 'ESNext',
        target: 'ESNext'
      }
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
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
  workerIdleMemoryLimit: '512MB',
  
  globals: {
    'ts-jest': {
      useESM: true
    }
  }
};