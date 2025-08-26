/**
 * Integration Tests for EvalMatchClient
 * Tests the complete client workflow with mock server
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EvalMatchClient } from '../../client'
import { AuthProvider, EvalMatchConfig } from '../../types'

// Simple mock auth provider for integration tests
class SimpleAuthProvider implements AuthProvider {
  async getToken(): Promise<string | null> {
    return 'test-token'
  }

  async isAuthenticated(): Promise<boolean> {
    return true
  }
}

describe('EvalMatchClient Integration', () => {
  let client: EvalMatchClient
  let config: EvalMatchConfig

  beforeEach(() => {
    config = {
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: new SimpleAuthProvider(),
      timeout: 5000,
      retries: 2
    }
    client = new EvalMatchClient(config)
  })

  it('should initialize client with proper configuration', () => {
    expect(client).toBeDefined()
    expect(client.getConfig().baseUrl).toBe('https://api.test.evalmatch.com')
    expect(client.getConfig().timeout).toBe(5000)
  })

  it('should have all expected API methods', () => {
    expect(client.resumes).toBeDefined()
    expect(client.resumes.list).toBeTypeOf('function')
    expect(client.resumes.upload).toBeTypeOf('function')
    expect(client.resumes.get).toBeTypeOf('function')

    expect(client.jobs).toBeDefined()
    expect(client.jobs.create).toBeTypeOf('function')

    expect(client.analysis).toBeDefined()
    expect(client.analysis.analyze).toBeTypeOf('function')
    expect(client.analysis.analyzeBias).toBeTypeOf('function')

    expect(client.isAuthenticated).toBeTypeOf('function')
  })

  it('should report authenticated status', async () => {
    const isAuth = await client.isAuthenticated()
    expect(isAuth).toBe(true)
  })

  it('should create client with default configuration', () => {
    const defaultClient = new EvalMatchClient({
      authProvider: new SimpleAuthProvider()
    })

    const defaultConfig = defaultClient.getConfig()
    expect(defaultConfig.baseUrl).toBe('https://evalmatch.app/api')
    expect(defaultConfig.timeout).toBe(30000)
    expect(defaultConfig.debug).toBe(false)
  })

  it('should handle circuit breaker configuration', () => {
    const clientWithCircuitBreaker = new EvalMatchClient({
      ...config,
      circuitBreaker: {
        threshold: 10,
        timeout: 60000
      }
    })

    expect(clientWithCircuitBreaker).toBeDefined()
    expect(clientWithCircuitBreaker.getConfig().circuitBreaker).toEqual({
      threshold: 10,
      timeout: 60000
    })
  })
})