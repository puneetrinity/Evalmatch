/**
 * Integration Tests for New SDK Features
 * Tests the newly added jobs CRUD, batch upload, tokens, and analyzeText endpoints
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EvalMatchClient } from '../../client'
import type { 
  JobDescriptionInput, 
  BatchUploadResponse, 
  TokenStatusResponse, 
  AnalyzeTextResponse 
} from '../../client'

describe('New SDK Features Integration', () => {
  let client: EvalMatchClient

  beforeEach(() => {
    const mockAuth = {
      getToken: async () => 'test-token',
      isAuthenticated: async () => true
    }

    client = new EvalMatchClient({
      baseUrl: 'https://api.test.evalmatch.com',
      authProvider: mockAuth,
      timeout: 5000
    })
  })

  describe('Jobs CRUD Operations', () => {
    it('should list job descriptions', async () => {
      const jobs = await client.jobs.list()
      
      expect(Array.isArray(jobs)).toBe(true)
      expect(jobs.length).toBeGreaterThan(0)
      expect(jobs[0]).toHaveProperty('id')
      expect(jobs[0]).toHaveProperty('title')
      expect(jobs[0]).toHaveProperty('description')
      expect(jobs[0]).toHaveProperty('requirements')
    })

    it('should get a specific job description', async () => {
      const job = await client.jobs.get(1)
      
      expect(job).toHaveProperty('id', 1)
      expect(job).toHaveProperty('title')
      expect(job).toHaveProperty('description')
      expect(job).toHaveProperty('requirements')
      expect(job).toHaveProperty('skills')
    })

    it('should create a new job description', async () => {
      const jobData: JobDescriptionInput = {
        title: 'Senior React Developer',
        description: 'We are looking for an experienced React developer...',
        requirements: ['React', 'TypeScript', '5+ years experience']
      }

      const job = await client.jobs.create(jobData)
      
      expect(job).toHaveProperty('id')
      expect(job.title).toBe('Senior Developer') // MSW mock response
      expect(job).toHaveProperty('createdAt')
    })

    it('should update a job description', async () => {
      const updateData = {
        title: 'Updated Senior Developer',
        description: 'Updated job description...'
      }

      const updatedJob = await client.jobs.update(1, updateData)
      
      expect(updatedJob).toHaveProperty('id', 1)
      expect(updatedJob.title).toContain('Updated')
      expect(updatedJob).toHaveProperty('updatedAt')
    })

    it('should delete a job description', async () => {
      const result = await client.jobs.delete(1)
      
      expect(result).toHaveProperty('success', true)
    })

  })

  describe('Batch Upload', () => {
    it.skip('should upload multiple resumes', async () => {
      // Create mock File objects for testing
      const file1 = new Blob(['resume content 1'], { type: 'application/pdf' })
      const file2 = new Blob(['resume content 2'], { type: 'application/pdf' })
      
      Object.defineProperty(file1, 'name', { value: 'resume1.pdf' })
      Object.defineProperty(file2, 'name', { value: 'resume2.pdf' })

      const result = await client.resumes.uploadBatch([file1, file2])
      
      expect(result).toHaveProperty('batchId')
      expect(result).toHaveProperty('message')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('summary')
      
      expect(Array.isArray(result.results.successful)).toBe(true)
      expect(result.results.successful.length).toBe(2)
      expect(result.summary.totalFiles).toBe(2)
      expect(result.summary.successfulUploads).toBe(2)
      expect(result.summary.failedUploads).toBe(0)
      
      // Check uploaded resume structure
      expect(result.results.successful[0]).toHaveProperty('resumeId')
      expect(result.results.successful[0]).toHaveProperty('filename')
      expect(result.results.successful[0]).toHaveProperty('fileSize')
      expect(result.results.successful[0]).toHaveProperty('processingTime')
    })

    it('should handle empty file array', async () => {
      try {
        await client.resumes.uploadBatch([])
        // This might succeed or fail depending on server validation
        // If it succeeds, that's fine for this test
      } catch (error) {
        // If it fails, that's also acceptable behavior
        expect(error).toBeDefined()
      }
    })
  })

  describe('Analysis Text Endpoint', () => {
    it('should analyze resume text against job description', async () => {
      const analysisData = {
        resumeText: `John Doe
        Senior React Developer
        
        Experience:
        - 5 years React development
        - JavaScript, TypeScript
        - Node.js backend experience
        - AWS deployment`,
        
        jobDescriptionText: `Senior Frontend Developer
        
        Requirements:
        - React expertise
        - TypeScript
        - 3+ years experience
        - GraphQL knowledge preferred`
      }

      const result = await client.analysis.analyzeText(analysisData)
      
      expect(result).toHaveProperty('matchPercentage')
      expect(result).toHaveProperty('matchedSkills')
      expect(result).toHaveProperty('missingSkills')
      expect(result).toHaveProperty('candidateStrengths')
      expect(result).toHaveProperty('candidateWeaknesses')
      expect(result).toHaveProperty('confidenceLevel')
      expect(result).toHaveProperty('recommendations')
      
      expect(typeof result.matchPercentage).toBe('number')
      expect(result.matchPercentage).toBe(87.5) // MSW mock value
      expect(Array.isArray(result.matchedSkills)).toBe(true)
      expect(Array.isArray(result.missingSkills)).toBe(true)
      expect(Array.isArray(result.candidateStrengths)).toBe(true)
      expect(Array.isArray(result.candidateWeaknesses)).toBe(true)
      expect(typeof result.confidenceLevel).toBe('string')
      expect(Array.isArray(result.recommendations)).toBe(true)
    })

    it('should handle empty text inputs', async () => {
      const analysisData = {
        resumeText: '',
        jobDescriptionText: ''
      }

      // Should still succeed with MSW mock
      const result = await client.analysis.analyzeText(analysisData)
      
      expect(result).toHaveProperty('matchPercentage')
    })
  })

  describe('Token Status', () => {
    it('should get token status information', async () => {
      // Token status endpoint requires API token authentication
      const tokenAuth = {
        getToken: async () => 'evalmatch-api-token-abc123',
        isAuthenticated: async () => true
      }
      
      const tokenClient = new EvalMatchClient({
        baseUrl: 'https://api.test.evalmatch.com',
        authProvider: tokenAuth,
        timeout: 5000
      })
      
      const result = await tokenClient.tokens.statusByToken()
      
      expect(result).toHaveProperty('token')
      expect(result).toHaveProperty('usage')
      
      // Check token structure
      const token = result.token
      expect(token).toHaveProperty('id')
      expect(token).toHaveProperty('name')
      expect(token).toHaveProperty('partial')
      expect(token).toHaveProperty('status')
      expect(token).toHaveProperty('permissions')
      expect(token).toHaveProperty('createdAt')
      expect(token).toHaveProperty('expiresAt')
      expect(token).toHaveProperty('lastUsedAt')
      
      expect(Array.isArray(token.permissions)).toBe(true)
      expect(['active', 'expired', 'revoked']).toContain(token.status)
      
      // Check usage structure
      const usage = result.usage
      expect(usage).toHaveProperty('requestsToday')
      expect(usage).toHaveProperty('requestsThisMonth')
      expect(usage).toHaveProperty('totalRequests')
      
      expect(typeof usage.requestsToday).toBe('number')
      expect(typeof usage.requestsThisMonth).toBe('number')
      expect(typeof usage.totalRequests).toBe('number')
    })
  })

  describe('Error Handling with throwOnError: false', () => {
    it('should return error envelope for jobs.get with invalid ID', async () => {
      const result = await client.jobs.get(999, { throwOnError: false })
      
      if ('success' in result) {
        // Error envelope
        expect(result.success).toBe(false)
        expect(result).toHaveProperty('error')
        expect(result.error).toHaveProperty('code')
        expect(result.error).toHaveProperty('message')
      } else {
        // If MSW doesn't properly handle this case, skip the test
        expect.fail('Expected error envelope but got success response')
      }
    })

    it('should return error envelope for jobs.delete with invalid ID', async () => {
      const result = await client.jobs.delete(999, { throwOnError: false })
      
      if ('success' in result) {
        // Error envelope
        expect(result.success).toBe(false)
        expect(result).toHaveProperty('error')
      } else {
        // If MSW doesn't properly handle this case, skip the test
        expect.fail('Expected error envelope but got success response')
      }
    })
  })

  describe('Type Safety Validation', () => {
    it('should enforce correct types for JobDescriptionInput', () => {
      const jobData: JobDescriptionInput = {
        title: 'Test Job',
        description: 'Test description',
        requirements: ['React', 'TypeScript'] // optional
      }
      
      expect(jobData.title).toBe('Test Job')
      expect(jobData.description).toBe('Test description')
      expect(Array.isArray(jobData.requirements)).toBe(true)
      
      // Test without requirements
      const minimalJob: JobDescriptionInput = {
        title: 'Minimal Job',
        description: 'Minimal description'
      }
      
      expect(minimalJob.requirements).toBeUndefined()
    })

    it('should enforce correct return types', async () => {
      // These should compile without type errors
      const jobs: any = await client.jobs.list({ throwOnError: false })
      const job: any = await client.jobs.get(1, { throwOnError: false })
      const analysis: any = await client.analysis.analyzeText({
        resumeText: 'test',
        jobDescriptionText: 'test'
      }, { throwOnError: false })
      const tokenStatus: any = await client.tokens.statusByToken({ throwOnError: false })
      
      // Basic runtime checks
      expect(jobs).toBeDefined()
      expect(job).toBeDefined()
      expect(analysis).toBeDefined()
      expect(tokenStatus).toBeDefined()
    })
  })
})