/**
 * Vitest Global Setup
 * Configures test environment, mocks, and utilities
 */

import { beforeAll, afterAll, afterEach, vi } from 'vitest'
import { server } from './mocks/server'
import { handlers } from './mocks/handlers'

// Global test setup
beforeAll(() => {
  // Start MSW server
  server.listen({ onUnhandledRequest: 'warn' })
  
  // Allow console.log for debug output but mock warn/error for cleaner test output
  // vi.spyOn(console, 'warn').mockImplementation(() => {})
  // vi.spyOn(console, 'error').mockImplementation(() => {})
  
  console.log('🔧 MSW server started for tests')
})

afterEach(() => {
  // Reset handlers back to original handlers (don't clear all)
  server.resetHandlers(...handlers)
  
  // Clear all mocks
  vi.clearAllMocks()
})

afterAll(() => {
  // Clean up
  server.close()
  vi.restoreAllMocks()
})

// Global test utilities
declare global {
  namespace Vi {
    interface AssertsShape {
      toBeValidUUID(): void
    }
  }
}

// Custom matchers
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return {
      pass: uuidRegex.test(received),
      message: () => `Expected ${received} to be a valid UUID`
    }
  }
})

// Global test configuration
export const TEST_CONFIG = {
  baseUrl: 'https://api.test.evalmatch.com',
  timeout: 5000,
  retries: 0
}