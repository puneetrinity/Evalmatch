/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment
    environment: 'jsdom',
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'src/__tests__/',
        'src/generated/', // Exclude auto-generated code
        '**/*.d.ts',
        '**/*.config.ts',
        '**/test-*'
      ],
      thresholds: {
        global: {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85
        }
      }
    },
    
    // Test files configuration
    include: [
      'src/__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    
    // Setup files
    setupFiles: ['./src/__tests__/setup.ts'],
    
    // Test timeout
    testTimeout: 10000,
    
    // Global test configuration
    globals: true,
    
    // Reporter configuration
    reporter: ['verbose', 'junit'],
    outputFile: './test-results.xml',
    
    // Watch mode exclusions
    watchExclude: ['**/node_modules/**', '**/dist/**'],
    
    // Pool configuration for performance
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 1,
        maxThreads: 4
      }
    }
  }
})