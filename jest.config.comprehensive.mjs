/**
 * Comprehensive Jest Configuration
 * Unified configuration for all test types with optimized performance
 */

export default {
  displayName: 'comprehensive',
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  
  // Test patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.test.tsx',
    '<rootDir>/tests/**/*.spec.ts'
  ],
  
  // Module resolution
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@server/(.*)$': '<rootDir>/server/$1',
    '^@/(.*)$': '<rootDir>/client/src/$1',
    '^@/tests/(.*)$': '<rootDir>/tests/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^firebase-admin/(.*)$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^firebase-admin$': '<rootDir>/tests/__mocks__/firebase-admin.ts',
    '^jose$': '<rootDir>/tests/__mocks__/jose.ts',
    '^jwks-rsa$': '<rootDir>/tests/__mocks__/jwks-rsa.ts',
    '^wouter$': '<rootDir>/tests/__mocks__/wouter.tsx'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.test.json'
    }]
  },
  
  transformIgnorePatterns: [
    'node_modules/(?!(@xenova|string-similarity|jose|jwks-rsa|@firebase|regexparam)/)'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  setupFiles: [
    '<rootDir>/tests/jest.setup.js',
    '<rootDir>/tests/helpers/jsdom-navigation-polyfill.js',
    '<rootDir>/tests/__mocks__/import-meta-env.js'
  ],
  
  // Global configuration
  globals: {
    'import.meta': {
      env: {
        VITE_API_BASE_URL: 'http://localhost:3000',
        VITE_APP_ENV: 'test',
        NODE_ENV: 'test',
        MODE: 'test',
        DEV: false,
        PROD: false,
        CI: true
      }
    }
  },
  
  // Test categorization using projects
  projects: [
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/unit/**/*.test.tsx'
      ],
      testEnvironment: 'node',
      collectCoverageFrom: [
        'server/**/*.ts',
        'shared/**/*.ts',
        '!**/*.d.ts',
        '!**/*.test.ts'
      ],
      coverageDirectory: 'coverage/unit'
    },
    {
      displayName: 'integration',
      testMatch: [
        '<rootDir>/tests/integration/**/*.test.ts'
      ],
      testEnvironment: 'node',
      testTimeout: 30000,
      collectCoverageFrom: [
        'server/**/*.ts',
        'shared/**/*.ts',
        '!**/*.d.ts',
        '!**/*.test.ts'
      ],
      coverageDirectory: 'coverage/integration'
    },
    {
      displayName: 'security',
      testMatch: [
        '<rootDir>/tests/security/**/*.test.ts'
      ],
      testEnvironment: 'node',
      testTimeout: 20000,
      collectCoverageFrom: [
        'shared/security-validation.ts',
        'server/lib/database-security.ts',
        'server/lib/secure-upload.ts',
        'client/src/lib/client-validation.ts'
      ],
      coverageDirectory: 'coverage/security'
    },
    {
      displayName: 'performance',
      testMatch: [
        '<rootDir>/tests/performance/**/*.test.ts'
      ],
      testEnvironment: 'node',
      testTimeout: 600000, // 10 minutes for performance tests
      maxWorkers: 1, // Sequential execution for accurate performance measurement
      collectCoverageFrom: [
        'server/**/*.ts',
        'shared/**/*.ts'
      ],
      coverageDirectory: 'coverage/performance'
    },
    {
      displayName: 'load',
      testMatch: [
        '<rootDir>/tests/load/**/*.test.ts'
      ],
      testEnvironment: 'node',
      testTimeout: 900000, // 15 minutes for load tests
      maxWorkers: 1, // Sequential execution for load tests
      collectCoverage: false // Skip coverage for load tests
    },
    {
      displayName: 'components',
      testMatch: [
        '<rootDir>/tests/components/**/*.test.tsx'
      ],
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/tests/setup-browser.ts'],
      collectCoverageFrom: [
        'client/src/components/**/*.{ts,tsx}',
        'client/src/hooks/**/*.{ts,tsx}',
        'client/src/lib/**/*.{ts,tsx}',
        '!**/*.d.ts',
        '!**/*.test.{ts,tsx}'
      ],
      coverageDirectory: 'coverage/components'
    }
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'server/**/*.{ts,js}',
    'client/src/**/*.{ts,tsx}',
    'shared/**/*.{ts,js}',
    '!**/*.d.ts',
    '!**/*.test.{ts,tsx,js}',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/build/**',
    '!**/coverage/**'
  ],
  
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html', 'json'],
  
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 75,
      lines: 75,
      statements: 75
    },
    'server/lib/': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'shared/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Performance optimization
  maxWorkers: process.env.CI ? 1 : '50%',
  workerIdleMemoryLimit: '512MB',
  
  // Memory management
  logHeapUsage: true,
  forceExit: true,
  detectOpenHandles: true,
  
  // Test execution
  verbose: false,
  silent: false,
  bail: 0,
  
  // Timeout settings
  testTimeout: 30000,
  
  // Cache configuration
  cacheDirectory: '<rootDir>/node_modules/.cache/jest',
  clearCache: false,
  
  // Reporting
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'test-results',
      outputName: 'comprehensive-test-results.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  
  // Error handling
  errorOnDeprecated: true,
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Watch mode (for development)
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/build/',
    '<rootDir>/dist/',
    '<rootDir>/coverage/',
    '<rootDir>/test-results/'
  ],
  
  // Test result processor
  testResultsProcessor: '<rootDir>/tests/helpers/test-results-processor.js'
};