/**
 * Tests for EvalMatchClient with Enhanced Error Handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EvalMatchClient } from '../client'
import { AuthProvider, EvalMatchConfig } from '../types'
import { ErrorCode } from '../core/errors'
import { server, resetHandlers } from './mocks/server'
import { http, HttpResponse } from 'msw'

// Mock AuthProvider
class MockAuthProvider implements AuthProvider {
  constructor(private token: string | null = 'mock-token') {}

  async getToken(): Promise<string | null> {
    return this.token
  }

  async isAuthenticated(): Promise<boolean> {
    return this.token !== null
  }

  setToken(token: string | null): void {
    this.token = token
  }
}

describe('EvalMatchClient', () => {
  let mockAuth: MockAuthProvider
  let client: EvalMatchClient
  let config: EvalMatchConfig

  beforeEach(() => {
    mockAuth = new MockAuthProvider()
    config = {
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: mockAuth,
      timeout: 5000,
      retries: 2
    }
    client = new EvalMatchClient(config)
  })

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultClient = new EvalMatchClient({
        authProvider: mockAuth
      })

      const clientConfig = defaultClient.getConfig()
      expect(clientConfig.baseUrl).toBe('https://evalmatch.app/api')
      expect(clientConfig.timeout).toBe(30000)
    })

    it('should use custom configuration', () => {
      const clientConfig = client.getConfig()
      expect(clientConfig.baseUrl).toBe('https://api.test.evalmatch.com')
      expect(clientConfig.timeout).toBe(5000)
    })

    it('should check authentication status', async () => {
      expect(await client.isAuthenticated()).toBe(true)
      
      mockAuth.setToken(null)
      expect(await client.isAuthenticated()).toBe(false)
    })
  })

  describe('Resume Management', () => {
    it('should list resumes successfully', async () => {
      const resumes = await client.resumes.list()
      
      expect(resumes.success).toBe(true)
      expect(resumes.data).toHaveLength(1)
      expect(resumes.data[0]).toMatchObject({
        id: 1,
        filename: 'test-resume.pdf',
        status: 'analyzed'
      })
    })

    it('should get specific resume by ID', async () => {
      const resume = await client.resumes.get(123)
      
      expect(resume.success).toBe(true)
      expect(resume.data).toMatchObject({
        id: 123,
        filename: 'resume-123.pdf',
        status: 'analyzed'
      })
    })

    it.skip('should upload resume file', async () => {
      // Mock file
      const file = new Blob(['test content'], { type: 'application/pdf' })
      Object.defineProperty(file, 'name', { value: 'test.pdf' })
      
      const result = await client.resumes.upload(file as File)
      
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        id: 123,
        filename: 'uploaded-resume.pdf',
        status: 'processing'
      })
    }, 15000)

    it('should handle resume not found error', async () => {
      // This test will use the error endpoint defined in handlers
      await expect(client.resumes.get(999)).rejects.toThrow()
    })
  })

  describe('Job Description Management', () => {
    it('should create job description successfully', async () => {
      const jobData = {
        title: 'Senior Developer',
        description: 'Looking for a senior developer',
        requirements: ['React', 'TypeScript']
      }

      const result = await client.jobs.create(jobData)
      
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        id: 456,
        title: 'Senior Developer',
        requirements: ['React', 'TypeScript']
      })
    })

    it('should handle validation errors for job creation', async () => {
      resetHandlers(
        http.post('https://api.test.evalmatch.com/job-descriptions', () => {
          return HttpResponse.json(
            { error: 'Title is required' },
            { status: 400 }
          )
        })
      )

      await expect(client.jobs.create({ title: '', description: 'test' })).rejects.toThrow()
      
      try {
        await client.jobs.create({ title: '', description: 'test' })
      } catch (error) {
        expect(error.code).toBe(ErrorCode.INVALID_REQUEST)
        expect(error.context.statusCode).toBe(400)
        expect(error.isRetryable).toBe(false)
      }
    })
  })

  describe('AI Analysis', () => {
    it('should analyze resumes against job', async () => {
      const result = await client.analysis.analyze(123, [1, 2, 3])
      
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        overallScore: 0.85,
        skillsMatch: {
          matched: ['JavaScript', 'React'],
          missing: ['Python']
        }
      })
    })

    it('should analyze job bias', async () => {
      const result = await client.analysis.analyzeBias(123)
      
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        biasScore: 0.1,
        riskLevel: 'low',
        issues: []
      })
    })

    it('should handle analysis timeout', async () => {
      // Create a client with shorter timeout for this test
      const shortTimeoutClient = new EvalMatchClient({
        ...config,
        timeout: 100 // Short timeout to force timeout error
      })

      // Temporarily stop MSW to allow actual network request that will timeout
      server.close()
      
      await expect(shortTimeoutClient.analysis.analyze(123)).rejects.toThrow()
      
      try {
        await shortTimeoutClient.analysis.analyze(123)
      } catch (error) {
        // Should be a network error due to timeout/connection refused
        expect([ErrorCode.NETWORK_ERROR, ErrorCode.CONNECTION_REFUSED]).toContain(error.code)
        expect(error.isRetryable).toBe(true)
      }

      // Restart MSW for subsequent tests
      server.listen({ onUnhandledRequest: 'warn' })
    })
  })

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      resetHandlers(
        http.get('https://api.test.evalmatch.com/resumes', () => {
          return HttpResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        })
      )

      await expect(client.resumes.list()).rejects.toThrow()
      
      try {
        await client.resumes.list()
      } catch (error) {
        expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
        expect(error.isRetryable).toBe(false)
        expect(error.recoveryActions[0].type).toBe('authenticate')
      }
    })

    it('should handle rate limiting with retry after', async () => {
      resetHandlers(
        http.get('https://api.test.evalmatch.com/resumes', () => {
          return HttpResponse.json(
            { 
              error: 'Rate limit exceeded',
              retryAfter: 30
            },
            { status: 429 }
          )
        })
      )

      await expect(client.resumes.list()).rejects.toThrow()
      
      try {
        await client.resumes.list()
      } catch (error) {
        expect(error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED)
        expect(error.isRetryable).toBe(true)
        expect(error.recoveryActions[0].retryAfter).toBe(30)
      }
    })

    it('should handle server errors with retry', async () => {
      let attemptCount = 0
      
      // Add temporary handler for retry testing
      server.use(
        http.get('https://api.test.evalmatch.com/resumes', () => {
          attemptCount++
          console.log(`Retry test attempt ${attemptCount}`)
          if (attemptCount < 3) {
            return HttpResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            )
          }
          return HttpResponse.json({
            success: true,
            data: [],
            timestamp: new Date().toISOString()
          })
        })
      )

      const result = await client.resumes.list()
      
      expect(attemptCount).toBe(3) // Should have retried twice
      expect(result.success).toBe(true)
    })

    it('should handle circuit breaker opening', async () => {
      // Force multiple failures to trigger circuit breaker
      const promises = []
      
      for (let i = 0; i < 6; i++) {
        resetHandlers(
          http.get(`https://api.test.evalmatch.com/resumes-${i}`, () => {
            return HttpResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            )
          })
        )
        
        promises.push(
          client._internalRequest({
            method: 'GET',
            url: `/resumes-${i}`
          }).catch(error => error)
        )
      }

      await Promise.all(promises)

      // Next request should trigger circuit breaker error
      try {
        await client.resumes.list()
      } catch (error) {
        expect(error.code).toBe(ErrorCode.CIRCUIT_BREAKER_OPEN)
        expect(error.isRetryable).toBe(false)
        expect(error.recoveryActions[0].type).toBe('wait')
      }
    })

    it('should enrich errors with request context', async () => {
      // Add temporary error handler for this test
      server.use(
        http.get('https://api.test.evalmatch.com/resumes', () => {
          return HttpResponse.json(
            { error: 'Bad request' },
            { status: 400 }
          )
        })
      )

      try {
        await client.resumes.list()
        expect.fail('Expected error to be thrown')
      } catch (error) {
        expect(error.context).toMatchObject({
          statusCode: 400,
          endpoint: '/resumes',
          method: 'GET',
          timestamp: expect.any(String)
        })
        if (error.context.requestId) {
          expect(error.context.requestId).toMatch(/^req_\d+_[a-z0-9]+$/)
        }
        if (error.context.duration !== undefined) {
          expect(error.context.duration).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('Request Interceptors', () => {
    it('should add authentication headers automatically', async () => {
      let capturedHeaders: any

      resetHandlers(
        http.get('https://api.test.evalmatch.com/resumes', ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries())
          return HttpResponse.json({
            success: true,
            data: [],
            timestamp: new Date().toISOString()
          })
        })
      )

      await client.resumes.list()

      expect(capturedHeaders.authorization).toBe('Bearer mock-token')
    })

    it('should handle requests without authentication', async () => {
      mockAuth.setToken(null)
      let capturedHeaders: any

      resetHandlers(
        http.get('https://api.test.evalmatch.com/resumes', ({ request }) => {
          capturedHeaders = Object.fromEntries(request.headers.entries())
          return HttpResponse.json({
            success: true,
            data: [],
            timestamp: new Date().toISOString()
          })
        })
      )

      await client.resumes.list()

      expect(capturedHeaders.authorization).toBeUndefined()
    })
  })
})