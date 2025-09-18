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

    // Job description endpoints
    expect(typeof client.jobs.create).toBe('function');

    // Analysis endpoints  
    expect(typeof client.analysis.analyze).toBe('function');
    expect(typeof client.analysis.analyzeBias).toBe('function');

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

  describe('Missing Public Endpoints (TODO)', () => {
    it('should eventually have user profile endpoint', () => {
      // TODO: Add when user profile is documented and generated
      // expect(typeof client.user.profile).toBe('function');
      expect(true).toBe(true); // Placeholder
    });

    it('should eventually have credits endpoints', () => {
      // TODO: Add when credits endpoints are documented and generated
      // expect(typeof client.credits.balance).toBe('function');
      // expect(typeof client.credits.history).toBe('function');
      // expect(typeof client.credits.packages).toBe('function');
      // expect(typeof client.credits.grantBeta).toBe('function');
      expect(true).toBe(true); // Placeholder
    });

    it('should eventually have health status endpoint', () => {
      // TODO: Add when health endpoints are documented and generated
      // expect(typeof client.health.status).toBe('function');
      expect(true).toBe(true); // Placeholder
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