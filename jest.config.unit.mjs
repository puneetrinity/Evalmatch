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
  verbose: true,
  silent: false,
  maxWorkers: '50%',
  testTimeout: 10000
};