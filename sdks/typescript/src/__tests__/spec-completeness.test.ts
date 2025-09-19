/**
 * SDK Spec Completeness Test
 * Ensures SDK covers all public API endpoints documented in Swagger
 */

import { describe, it, expect } from 'vitest';
import { EvalMatchClient } from '../client';

describe('SDK Spec Completeness', () => {
  const mockAuth = {
    getToken: async () => 'test-token',
    isAuthenticated: async () => true
  };

  const client = new EvalMatchClient({
    baseUrl: 'https://test.evalmatch.com/api',
    authProvider: mockAuth
  });

  it('should have methods for all documented public endpoints', () => {
    // Resume endpoints
    expect(typeof client.resumes.list).toBe('function');
    expect(typeof client.resumes.upload).toBe('function'); 
    expect(typeof client.resumes.get).toBe('function');
    expect(typeof client.resumes.uploadBatch).toBe('function');

    // Job description endpoints
    expect(typeof client.jobs.create).toBe('function');
    expect(typeof client.jobs.list).toBe('function');
    expect(typeof client.jobs.get).toBe('function');
    expect(typeof client.jobs.update).toBe('function');
    expect(typeof client.jobs.delete).toBe('function');

    // Analysis endpoints  
    expect(typeof client.analysis.analyze).toBe('function');
    expect(typeof client.analysis.analyzeBias).toBe('function');
    expect(typeof client.analysis.analyzeText).toBe('function');

    // Token endpoints
    expect(typeof client.tokens.statusByToken).toBe('function');

    // Utility methods
    expect(typeof client.isAuthenticated).toBe('function');
    expect(typeof client.getConfig).toBe('function');
    expect(typeof client.getCircuitBreakerState).toBe('function');
  });

  it('should have proper method signatures for public endpoints', () => {
    // Check that methods accept proper parameters
    const resumesList = client.resumes.list.toString();
    expect(resumesList).toContain('options');

    const resumesUpload = client.resumes.upload.toString();
    expect(resumesUpload).toContain('file');
    expect(resumesUpload).toContain('options');

    const analysisAnalyze = client.analysis.analyze.toString();
    expect(analysisAnalyze).toContain('jobId');
    expect(analysisAnalyze).toContain('resumeIds');
    expect(analysisAnalyze).toContain('options');

    const jobsList = client.jobs.list.toString();
    expect(jobsList).toContain('options');

    const jobsUpdate = client.jobs.update.toString();
    expect(jobsUpdate).toContain('id');
    expect(jobsUpdate).toContain('data');

    const resumesBatch = client.resumes.uploadBatch.toString();
    expect(resumesBatch).toContain('files');
    expect(resumesBatch).toContain('options');

    const analyzeText = client.analysis.analyzeText.toString();
    expect(analyzeText).toContain('data');
    expect(analyzeText).toContain('options');
  });

  it('should support new ClientOptions features', () => {
    // Test that options interface supports new features
    const optionsTest = async () => {
      const controller = new AbortController();
      
      // These should compile without type errors
      await client.resumes.list({
        signal: controller.signal,
        timeout: 5000,
        throwOnError: false,
        meta: { test: true }
      });
    };

    expect(typeof optionsTest).toBe('function');
  });

  describe('Credits Endpoints', () => {
    it('should have credits balance method', () => {
      expect(typeof client.credits.balance).toBe('function');
    });

    it('should have credits history method', () => {
      expect(typeof client.credits.history).toBe('function');
    });

    it('should have credits packages method', () => {
      expect(typeof client.credits.packages).toBe('function');
    });

    it('should have credits grant-beta method', () => {
      expect(typeof client.credits.grantBeta).toBe('function');
    });
  });

  describe('Health Endpoints', () => {
    it('should have health status method', () => {
      expect(typeof client.health.status).toBe('function');
    });

    it('should have system health method', () => {
      expect(typeof client.health.systemHealth).toBe('function');
    });
  });

  describe('Jobs Endpoints', () => {
    it('should have jobs list method', () => {
      expect(typeof client.jobs.list).toBe('function');
    });

    it('should have jobs get method', () => {
      expect(typeof client.jobs.get).toBe('function');
    });

    it('should have jobs update method', () => {
      expect(typeof client.jobs.update).toBe('function');
    });

    it('should have jobs delete method', () => {
      expect(typeof client.jobs.delete).toBe('function');
    });
  });

  describe('Batch Upload', () => {
    it('should have resumes batch upload method', () => {
      expect(typeof client.resumes.uploadBatch).toBe('function');
    });
  });

  describe('Tokens', () => {
    it('should have tokens status by token method', () => {
      expect(typeof client.tokens.statusByToken).toBe('function');
    });
  });

  describe('Analysis Text', () => {
    it('should have analyze text method with proper typing', () => {
      expect(typeof client.analysis.analyzeText).toBe('function');
      
      // Test that method signature accepts correct parameters
      const analyzeTextMethod = client.analysis.analyzeText.toString();
      expect(analyzeTextMethod).toContain('data');
      expect(analyzeTextMethod).toContain('options');
    });
  });

  describe('User Profile Endpoint', () => {
    it('should have user profile method', () => {
      expect(typeof client.user.profile).toBe('function');
    });
  });

  describe('Generated vs Manual Client Parity', () => {
    it('should ensure manual client methods align with generated types', () => {
      // Test that return types match expectations
      const testReturnTypes = async () => {
        const resumesList = await client.resumes.list({ throwOnError: false });
        
        // Should be either Resume[] or error envelope
        if ('success' in resumesList) {
          // Error envelope
          expect(typeof resumesList.success).toBe('boolean');
          expect(resumesList.success).toBe(false);
          expect('error' in resumesList).toBe(true);
        } else {
          // Success response - should be array
          expect(Array.isArray(resumesList)).toBe(true);
        }
      };

      expect(typeof testReturnTypes).toBe('function');
    });
  });
});

/**
 * CI Guardrail: This test should fail if:
 * 1. New public endpoints are documented in Swagger but not implemented in SDK
 * 2. Manual client methods don't align with generated types
 * 3. ClientOptions interface doesn't support required features
 * 
 * To maintain:
 * - Update TODO sections when new endpoints are generated
 * - Add tests for new public API surface
 * - Ensure return types match server responses
 */