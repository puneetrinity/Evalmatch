/**
 * Dual Authentication Matrix Tests
 * Verifies that all public endpoints work with both Firebase JWT and API tokens
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EvalMatchClient } from '../../client'

describe('Dual Authentication Matrix', () => {
  let firebaseClient: EvalMatchClient
  let tokenClient: EvalMatchClient

  beforeEach(() => {
    // Client with Firebase JWT
    const firebaseAuth = {
      getToken: async () => 'firebase-jwt-token',
      isAuthenticated: async () => true
    }

    firebaseClient = new EvalMatchClient({
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: firebaseAuth,
      timeout: 5000
    })

    // Client with API Token
    const tokenAuth = {
      getToken: async () => 'evalmatch-api-token-abc123',
      isAuthenticated: async () => true
    }

    tokenClient = new EvalMatchClient({
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: tokenAuth,
      timeout: 5000
    })
  })

  describe('Jobs Endpoints (Both Auth Methods)', () => {
    it('should list jobs with Firebase auth', async () => {
      const jobs = await firebaseClient.jobs.list()
      expect(Array.isArray(jobs)).toBe(true)
    })

    it('should list jobs with API token', async () => {
      const jobs = await tokenClient.jobs.list()
      expect(Array.isArray(jobs)).toBe(true)
    })

    it('should get job with Firebase auth', async () => {
      const job = await firebaseClient.jobs.get(1)
      expect(job).toHaveProperty('id', 1)
    })

    it('should get job with API token', async () => {
      const job = await tokenClient.jobs.get(1)
      expect(job).toHaveProperty('id', 1)
    })

    it('should create job with Firebase auth', async () => {
      const jobData = {
        title: 'Senior Developer',
        description: 'We are looking for an experienced developer...'
      }
      const job = await firebaseClient.jobs.create(jobData)
      expect(job).toHaveProperty('id')
    })

    it('should create job with API token', async () => {
      const jobData = {
        title: 'Senior Developer',
        description: 'We are looking for an experienced developer...'
      }
      const job = await tokenClient.jobs.create(jobData)
      expect(job).toHaveProperty('id')
    })

    it('should update job with Firebase auth', async () => {
      const updateData = { title: 'Updated Title' }
      const job = await firebaseClient.jobs.update(1, updateData)
      expect(job).toHaveProperty('id', 1)
    })

    it('should update job with API token', async () => {
      const updateData = { title: 'Updated Title' }
      const job = await tokenClient.jobs.update(1, updateData)
      expect(job).toHaveProperty('id', 1)
    })

    it('should delete job with Firebase auth', async () => {
      const result = await firebaseClient.jobs.delete(1)
      expect(result).toHaveProperty('success', true)
    })

    it('should delete job with API token', async () => {
      const result = await tokenClient.jobs.delete(1)
      expect(result).toHaveProperty('success', true)
    })
  })

  describe('Resumes Endpoints (Both Auth Methods)', () => {
    it('should list resumes with Firebase auth', async () => {
      const resumes = await firebaseClient.resumes.list()
      expect(Array.isArray(resumes)).toBe(true)
    })

    it('should list resumes with API token', async () => {
      const resumes = await tokenClient.resumes.list()
      expect(Array.isArray(resumes)).toBe(true)
    })

    it('should get resume with Firebase auth', async () => {
      const resume = await firebaseClient.resumes.get(1)
      expect(resume).toHaveProperty('id', 1)
    })

    it('should get resume with API token', async () => {
      const resume = await tokenClient.resumes.get(1)
      expect(resume).toHaveProperty('id', 1)
    })

    it('should handle batch upload with Firebase auth', async () => {
      const result = await firebaseClient.resumes.uploadBatch([])
      expect(result).toHaveProperty('batchId')
    })

    it('should handle batch upload with API token', async () => {
      const result = await tokenClient.resumes.uploadBatch([])
      expect(result).toHaveProperty('batchId')
    })
  })

  describe('Analysis Endpoints (Both Auth Methods)', () => {
    it('should analyze text with Firebase auth', async () => {
      const analysisData = {
        resumeText: 'John Doe - Senior Developer with React experience',
        jobDescriptionText: 'Looking for React developer with 3+ years experience'
      }
      const result = await firebaseClient.analysis.analyzeText(analysisData)
      expect(result).toHaveProperty('matchPercentage')
    })

    it('should analyze text with API token', async () => {
      const analysisData = {
        resumeText: 'John Doe - Senior Developer with React experience',
        jobDescriptionText: 'Looking for React developer with 3+ years experience'
      }
      const result = await tokenClient.analysis.analyzeText(analysisData)
      expect(result).toHaveProperty('matchPercentage')
    })
  })

  describe('Credits Endpoints (Both Auth Methods)', () => {
    it('should get credit balance with Firebase auth', async () => {
      const balance = await firebaseClient.credits.getBalance()
      expect(balance).toHaveProperty('available')
    })

    it('should get credit balance with API token', async () => {
      const balance = await tokenClient.credits.getBalance()
      expect(balance).toHaveProperty('available')
    })

    it('should get credit history with Firebase auth', async () => {
      const history = await firebaseClient.credits.getHistory()
      expect(Array.isArray(history)).toBe(true)
    })

    it('should get credit history with API token', async () => {
      const history = await tokenClient.credits.getHistory()
      expect(Array.isArray(history)).toBe(true)
    })

    it('should get credit packages with Firebase auth', async () => {
      const packages = await firebaseClient.credits.getPackages()
      expect(Array.isArray(packages)).toBe(true)
    })

    it('should get credit packages with API token', async () => {
      const packages = await tokenClient.credits.getPackages()
      expect(Array.isArray(packages)).toBe(true)
    })
  })

  describe('User Endpoints (Both Auth Methods)', () => {
    it('should get profile with Firebase auth', async () => {
      const profile = await firebaseClient.user.getProfile()
      expect(profile).toHaveProperty('id')
    })

    it('should get profile with API token', async () => {
      const profile = await tokenClient.user.getProfile()
      expect(profile).toHaveProperty('id')
    })
  })

  describe('Tokens Endpoints (Token-Only)', () => {
    it('should get token status with API token', async () => {
      const status = await tokenClient.tokens.statusByToken()
      expect(status).toHaveProperty('token')
      expect(status).toHaveProperty('usage')
    })

    it('should fail token status with Firebase auth', async () => {
      // This endpoint is token-specific and should fail with Firebase auth
      await expect(firebaseClient.tokens.statusByToken()).rejects.toThrow()
    })
  })

  describe('Health Endpoints (Public)', () => {
    it('should get health status with Firebase auth', async () => {
      const health = await firebaseClient.health.status()
      expect(health).toHaveProperty('status')
    })

    it('should get health status with API token', async () => {
      const health = await tokenClient.health.status()
      expect(health).toHaveProperty('status')
    })

    it('should get system health with Firebase auth', async () => {
      const health = await firebaseClient.health.system()
      expect(health).toHaveProperty('status')
    })

    it('should get system health with API token', async () => {
      const health = await tokenClient.health.system()
      expect(health).toHaveProperty('status')
    })
  })
})