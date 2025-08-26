/**
 * Basic Tests for EvalMatchClient
 * Tests core functionality with simplified mock setup
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { EvalMatchClient } from '../client'
import { AuthProvider, EvalMatchConfig } from '../types'

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

describe('EvalMatchClient Basic', () => {
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

  describe('API Structure', () => {
    it('should have resume management methods', () => {
      expect(client.resumes).toBeDefined()
      expect(client.resumes.list).toBeTypeOf('function')
      expect(client.resumes.upload).toBeTypeOf('function')
      expect(client.resumes.get).toBeTypeOf('function')
    })

    it('should have job management methods', () => {
      expect(client.jobs).toBeDefined()
      expect(client.jobs.create).toBeTypeOf('function')
    })

    it('should have analysis methods', () => {
      expect(client.analysis).toBeDefined()
      expect(client.analysis.analyze).toBeTypeOf('function')
      expect(client.analysis.analyzeBias).toBeTypeOf('function')
    })

    it('should have utility methods', () => {
      expect(client.isAuthenticated).toBeTypeOf('function')
      expect(client.getConfig).toBeTypeOf('function')
    })
  })

  describe('Mock Service Integration', () => {
    it('should successfully list resumes', async () => {
      const resumes = await client.resumes.list()
      
      expect(resumes.success).toBe(true)
      expect(resumes.data).toHaveLength(1)
      expect(resumes.data[0]).toMatchObject({
        id: 1,
        filename: 'test-resume.pdf',
        status: 'analyzed'
      })
    })

    it('should successfully get resume by ID', async () => {
      const resume = await client.resumes.get(123)
      
      expect(resume.success).toBe(true)
      expect(resume.data).toMatchObject({
        id: 123,
        filename: 'resume-123.pdf',
        status: 'analyzed'
      })
    })

    it('should successfully create job description', async () => {
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

    it('should successfully analyze resumes', async () => {
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

    it('should successfully analyze job bias', async () => {
      const result = await client.analysis.analyzeBias(123)
      
      expect(result.success).toBe(true)
      expect(result.data).toMatchObject({
        biasScore: 0.1,
        riskLevel: 'low',
        issues: []
      })
    })
  })
})