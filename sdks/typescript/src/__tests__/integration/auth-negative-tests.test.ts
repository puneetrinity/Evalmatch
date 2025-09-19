/**
 * Authentication Negative Tests
 * Verifies proper 401/403 behavior for unauthenticated and malformed requests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EvalMatchClient } from '../../client'
import { EvalMatchError, ErrorCode } from '../../core/errors'

describe('Authentication Negative Tests', () => {
  let unauthenticatedClient: EvalMatchClient
  let invalidTokenClient: EvalMatchClient

  beforeEach(() => {
    // Client with no authentication
    const noAuth = {
      getToken: async () => null,
      isAuthenticated: async () => false
    }

    unauthenticatedClient = new EvalMatchClient({
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: noAuth,
      timeout: 5000
    })

    // Client with invalid token
    const invalidAuth = {
      getToken: async () => 'invalid-token-12345',
      isAuthenticated: async () => true
    }

    invalidTokenClient = new EvalMatchClient({
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: invalidAuth,
      timeout: 5000
    })
  })

  describe('No Authentication (401 Expected)', () => {
    it('should fail jobs.list without auth', async () => {
      await expect(unauthenticatedClient.jobs.list()).rejects.toThrow(EvalMatchError)
      
      try {
        await unauthenticatedClient.jobs.list()
      } catch (error) {
        if (error instanceof EvalMatchError) {
          expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
          expect(error.context.statusCode).toBe(401)
        }
      }
    })

    it('should fail jobs.get without auth', async () => {
      await expect(unauthenticatedClient.jobs.get(1)).rejects.toThrow(EvalMatchError)
    })

    it('should fail jobs.create without auth', async () => {
      const jobData = {
        title: 'Test Job',
        description: 'Test description'
      }
      await expect(unauthenticatedClient.jobs.create(jobData)).rejects.toThrow(EvalMatchError)
    })

    it('should fail resumes.list without auth', async () => {
      await expect(unauthenticatedClient.resumes.list()).rejects.toThrow(EvalMatchError)
    })

    it('should fail analysis.analyzeText without auth', async () => {
      const analysisData = {
        resumeText: 'test resume',
        jobDescriptionText: 'test job'
      }
      await expect(unauthenticatedClient.analysis.analyzeText(analysisData)).rejects.toThrow(EvalMatchError)
    })

    it('should fail credits.getBalance without auth', async () => {
      await expect(unauthenticatedClient.credits.getBalance()).rejects.toThrow(EvalMatchError)
    })

    it('should fail user.getProfile without auth', async () => {
      await expect(unauthenticatedClient.user.getProfile()).rejects.toThrow(EvalMatchError)
    })

    it('should fail tokens.statusByToken without auth', async () => {
      await expect(unauthenticatedClient.tokens.statusByToken()).rejects.toThrow(EvalMatchError)
    })
  })

  describe('Invalid Token (401/403 Expected)', () => {
    it('should fail jobs.list with invalid token', async () => {
      await expect(invalidTokenClient.jobs.list()).rejects.toThrow(EvalMatchError)
      
      try {
        await invalidTokenClient.jobs.list()
      } catch (error) {
        if (error instanceof EvalMatchError) {
          expect([ErrorCode.INVALID_CREDENTIALS, ErrorCode.INSUFFICIENT_PERMISSIONS]).toContain(error.code)
          expect([401, 403]).toContain(error.context.statusCode)
        }
      }
    })

    it('should fail resumes.get with invalid token', async () => {
      await expect(invalidTokenClient.resumes.get(1)).rejects.toThrow(EvalMatchError)
    })

    it('should fail analysis.analyzeText with invalid token', async () => {
      const analysisData = {
        resumeText: 'test resume',
        jobDescriptionText: 'test job'
      }
      await expect(invalidTokenClient.analysis.analyzeText(analysisData)).rejects.toThrow(EvalMatchError)
    })

    it('should fail credits.getBalance with invalid token', async () => {
      await expect(invalidTokenClient.credits.getBalance()).rejects.toThrow(EvalMatchError)
    })

    it('should fail tokens.statusByToken with invalid token', async () => {
      await expect(invalidTokenClient.tokens.statusByToken()).rejects.toThrow(EvalMatchError)
    })
  })

  describe('Protected vs Public Endpoints', () => {
    it('should allow health.status without auth', async () => {
      // Health endpoints should be public
      const health = await unauthenticatedClient.health.status()
      expect(health).toHaveProperty('status')
    })

    it('should allow health.system without auth', async () => {
      // System health should be public
      const health = await unauthenticatedClient.health.system()
      expect(health).toHaveProperty('status')
    })
  })

  describe('Error Context Validation', () => {
    it('should provide detailed error context for auth failures', async () => {
      try {
        await unauthenticatedClient.jobs.list()
        expect.fail('Should have thrown an error')
      } catch (error) {
        if (error instanceof EvalMatchError) {
          expect(error.context).toHaveProperty('endpoint')
          expect(error.context).toHaveProperty('method')
          expect(error.context).toHaveProperty('statusCode')
          expect(error.context).toHaveProperty('timestamp')
          expect(error.context.endpoint).toContain('/job-descriptions')
          expect(error.context.method).toBe('GET')
          expect(error.code).toBe(ErrorCode.INVALID_CREDENTIALS)
        }
      }
    })

    it('should provide recovery actions for auth errors', async () => {
      try {
        await invalidTokenClient.tokens.statusByToken()
        expect.fail('Should have thrown an error')
      } catch (error) {
        if (error instanceof EvalMatchError) {
          expect(error.recoveryActions).toBeDefined()
          expect(Array.isArray(error.recoveryActions)).toBe(true)
          expect(error.recoveryActions.length).toBeGreaterThan(0)
        }
      }
    })
  })
})