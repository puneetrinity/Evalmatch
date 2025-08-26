/**
 * Tests for RetryableHTTPClient and CircuitBreaker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RetryableHTTPClient, CircuitBreaker, CircuitBreakerState } from '../../core/retry-client'
import { server, resetHandlers, addHandlers } from '../mocks/server'
import { http, HttpResponse } from 'msw'

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      threshold: 3,
      timeout: 1000,
      monitoringPeriod: 500
    })
  })

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
  })

  it('should open after threshold failures', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('Test error'))

    // Attempt multiple times to trigger circuit breaker
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation)
      } catch (error) {
        // Expected to fail
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)
  })

  it('should transition to HALF_OPEN after timeout', async () => {
    vi.useFakeTimers()
    
    const operation = vi.fn().mockRejectedValue(new Error('Test error'))

    // Trigger circuit breaker to OPEN
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation)
      } catch (error) {
        // Expected to fail
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN)

    // Fast forward time to trigger timeout
    vi.advanceTimersByTime(1100)
    
    try {
      await circuitBreaker.execute(operation)
    } catch (error) {
      // Expected to fail but state should change
    }

    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN)
    
    vi.useRealTimers()
  })

  it('should reset to CLOSED after successful operations in HALF_OPEN', async () => {
    vi.useFakeTimers()
    
    const failingOperation = vi.fn().mockRejectedValue(new Error('Test error'))
    const successOperation = vi.fn().mockResolvedValue('success')

    // Trigger circuit breaker to OPEN
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(failingOperation)
      } catch (error) {
        // Expected to fail
      }
    }

    // Fast forward time to trigger timeout
    vi.advanceTimersByTime(1100)

    try {
      await circuitBreaker.execute(failingOperation)
    } catch (error) {
      // Expected to fail but now in HALF_OPEN
    }

    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN)

    // Execute successful operations to close circuit
    for (let i = 0; i < 3; i++) {
      await circuitBreaker.execute(successOperation)
    }

    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED)
    
    vi.useRealTimers()
  })
})

describe('RetryableHTTPClient', () => {
  let client: RetryableHTTPClient

  beforeEach(() => {
    client = new RetryableHTTPClient(
      { baseURL: 'https://api.test.evalmatch.com' },
      {
        maxAttempts: 3,
        baseDelay: 10, // Reduced for testing
        maxDelay: 100,
        backoffFactor: 2
      },
      {
        threshold: 5,
        timeout: 1000,
        monitoringPeriod: 500
      }
    )
  })

  it('should make successful requests', async () => {
    const response = await client.request({
      method: 'GET',
      url: '/health'
    })

    expect(response.data).toEqual({
      success: true,
      data: {
        status: 'healthy',
        uptime: 12345,
        version: '1.0.0'
      },
      timestamp: expect.any(String)
    })
  })

  it('should retry on server errors', async () => {
    // Mock server error endpoint
    resetHandlers(
      http.get('https://api.test.evalmatch.com/retry-test', ({ request }) => {
        const url = new URL(request.url)
        const attempt = parseInt(url.searchParams.get('attempt') || '0')
        
        if (attempt < 2) {
          return HttpResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
        
        return HttpResponse.json({ success: true, data: 'success' })
      })
    )

    const response = await client.request({
      method: 'GET',
      url: '/retry-test?attempt=0'
    })

    expect(response.data).toEqual({ success: true, data: 'success' })
  })

  it('should not retry on 4xx errors', async () => {
    const startTime = Date.now()

    try {
      await client.request({
        method: 'GET',
        url: '/error/401'
      })
      // Should not reach here
      expect.fail('Expected request to throw an error')
    } catch (error) {
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(1000) // Should fail quickly without retries
      expect(error.name).toBe('HTTPError')
      expect(error.status).toBe(401)
    }
  })

  it('should add request metadata', async () => {
    const response = await client.request({
      method: 'GET',
      url: '/health'
    })

    expect(response.config.metadata).toMatchObject({
      requestId: expect.stringMatching(/^req_\d+_[a-z0-9]+$/),
      startTime: expect.any(Number),
      duration: expect.any(Number)
    })
  }, 5000)

  it('should respect circuit breaker state', async () => {
    // Force multiple failures to trigger circuit breaker
    const promises = []
    
    for (let i = 0; i < 6; i++) {
      promises.push(
        client.request({
          method: 'GET',
          url: '/error/500'
        }).catch(error => error)
      )
    }

    await Promise.all(promises)

    // Circuit breaker should now be open
    expect(client.circuitBreakerState).toBe(CircuitBreakerState.OPEN)

    // Next request should fail immediately
    const startTime = Date.now()
    try {
      await client.request({
        method: 'GET',
        url: '/health'
      })
      expect.fail('Expected circuit breaker to block request')
    } catch (error) {
      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(100) // Should fail immediately
      expect(error.message).toContain('Circuit breaker is open')
    }
  }, 8000)

  it('should handle network errors', async () => {
    // Note: In jsdom environment, MSW cannot truly simulate network errors
    // so we mock a 500 error which gets enriched as HTTP Error
    try {
      await client.request({
        method: 'GET',
        url: '/network-error'
      })
      expect.fail('Expected network error to be thrown')
    } catch (error) {
      expect(error.name).toBe('HTTPError')
      expect(error.message).toContain('500')
    }
  }, 5000)

  it('should apply exponential backoff with jitter', async () => {
    let attemptCount = 0
    const timestamps: number[] = []

    resetHandlers(
      http.get('https://api.test.evalmatch.com/backoff-test', () => {
        timestamps.push(Date.now())
        attemptCount++
        
        if (attemptCount < 3) {
          return HttpResponse.json(
            { error: 'Server error' },
            { status: 500 }
          )
        }
        
        return HttpResponse.json({ success: true })
      })
    )

    await client.request({
      method: 'GET',
      url: '/backoff-test'
    })

    expect(attemptCount).toBe(3)
    expect(timestamps).toHaveLength(3)

    // Check that delays increase (accounting for jitter)
    const delay1 = timestamps[1] - timestamps[0]
    const delay2 = timestamps[2] - timestamps[1]
    
    expect(delay1).toBeGreaterThan(5) // Should have some delay
    expect(delay2).toBeGreaterThan(delay1 * 0.8) // Should increase (with jitter tolerance)
  })
})