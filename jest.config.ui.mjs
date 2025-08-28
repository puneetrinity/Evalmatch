/**
 * Jest configuration for UI/Component tests
 */

export default {
  displayName: 'ui-components',
  testEnvironment: 'jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@server/(.*)$': '<rootDir>/server/$1',
    '^@/hooks/useBatchManager$': '<rootDir>/tests/__mocks__/useBatchManager.ts',
    '^@/lib/firebase$': '<rootDir>/tests/__mocks__/firebase.ts',
    '^firebase/auth$': '<rootDir>/tests/__mocks__/firebase-auth.ts',
    '^firebase/app$': '<rootDir>/tests/__mocks__/firebase-app.ts',
    '^firebase/(.*)$': '<rootDir>/tests/__mocks__/firebase-auth.ts',
    '^react-hot-toast$': '<rootDir>/tests/__mocks__/react-hot-toast.ts',
    '^recharts$': '<rootDir>/tests/__mocks__/recharts.tsx',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json'
    }]
  },
  testMatch: [
    '<rootDir>/tests/components/**/*.test.tsx'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/tests/components/pages/',
    '<rootDir>/tests/components/layout/Header.test.tsx'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(@xenova|string-similarity|firebase|@firebase|@tanstack|@testing-library)/)'
  ],
  setupFiles: ['<rootDir>/tests/setup-globals.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup-ui.ts'],
  collectCoverageFrom: [
    'client/src/**/*.{ts,tsx}',
    '!**/*.test.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage/ui',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: false,
  silent: false,
  maxWorkers: 1,
  workerIdleMemoryLimit: '512MB',
  testTimeout: 30000,
  
  // Memory optimization
  clearMocks: true,
  restoreMocks: true,
  resetModules: false,
  forceExit: true,
  detectOpenHandles: false,
};