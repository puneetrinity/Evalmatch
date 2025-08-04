/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
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
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        module: 'ESNext',
        moduleResolution: 'node',
        target: 'ES2020'
      }
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