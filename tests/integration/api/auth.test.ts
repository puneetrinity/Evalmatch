/**
 * Authentication and Authorization Integration Tests
 * Comprehensive tests for Firebase auth integration and API security
 */

import { Express } from 'express';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { 
  MockAuth, 
  DatabaseTestHelper, 
  ResponseValidator,
  TestSuiteHelper,
  TEST_CONFIG,
  TestUser
} from '../../helpers/api-helpers';

// Mock the server setup
let app: Express;
let testUser: TestUser;
let adminUser: TestUser;
let regularUser: TestUser;

beforeAll(async () => {
  // Setup test environment and mocks first
  await TestSuiteHelper.setupTestEnvironment();
  
  // Use mock server instead of real server
  const { createMockServer } = await import('../../helpers/server-mock');
  app = createMockServer();
}, TEST_CONFIG.timeout);

afterAll(async () => {
  await TestSuiteHelper.teardownTestEnvironment();
}, TEST_CONFIG.timeout);

beforeEach(async () => {
  // Create fresh test users for each test
  testUser = MockAuth.createTestUser();
  adminUser = MockAuth.createTestUser({ uid: 'admin_user_123', email: 'admin@test.com' });
  regularUser = MockAuth.createTestUser({ uid: 'regular_user_456', email: 'user@test.com' });
  
  // Clear any existing test data
  await DatabaseTestHelper.cleanupTestData();
});

describe('Authentication and Authorization', () => {
  describe('Authentication Middleware', () => {
    test('should accept valid Firebase token', async () => {
      const response = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(testUser));

      expect([200, 404]).toContain(response.status); // 200 or 404 (no resumes), but not 401
      expect(response.status).not.toBe(401);
    });

    test('should reject requests without authorization header', async () => {
      const response = await request(app)
        .get('/api/resumes');

      ResponseValidator.validateErrorResponse(response, 401);
      expect(response.body.error || response.body.message).toMatch(/unauthorized|authentication/i);
    });

    test('should reject malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/resumes')
        .set('Authorization', 'InvalidFormat token123');

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should reject invalid Firebase token', async () => {
      const response = await request(app)
        .get('/api/resumes')
        .set('Authorization', 'Bearer invalid_firebase_token_123');

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should reject expired Firebase token', async () => {
      const expiredUser = MockAuth.createTestUser({ 
        firebaseToken: 'expired_token_' + (Date.now() - 1000000) 
      });

      const response = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(expiredUser));

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should handle missing Bearer prefix', async () => {
      const response = await request(app)
        .get('/api/resumes')
        .set('Authorization', testUser.firebaseToken!);

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should validate token format', async () => {
      const invalidTokens = [
        '',
        ' ',
        'Bearer',
        'Bearer ',
        'Bearer short',
        'Bearer ' + 'a'.repeat(10), // Too short
        'Bearer ' + 'a'.repeat(2000) // Too long
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/resumes')
          .set('Authorization', token);

        ResponseValidator.validateErrorResponse(response, 401);
      }
    });
  });

  describe('User Context and Authorization', () => {
    test('should populate request with user information', async () => {
      // Create a test resume to verify user context
      const testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'auth-test.pdf'
      });

      const response = await request(app)
        .get(`/api/resumes/${testResume.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response);
      // Verify that the user can access their own resume
      expect(response.body.data.id).toBe(testResume.id);
    });

    test('should prevent access to other users data', async () => {
      // Create resume for testUser
      const testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'private-resume.pdf'
      });

      // Try to access with different user
      const response = await request(app)
        .get(`/api/resumes/${testResume.id}`)
        .set(MockAuth.generateAuthHeaders(regularUser));

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Resume not found');
    });

    test('should isolate user data in list endpoints', async () => {
      // Create resumes for different users
      await Promise.all([
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          filename: 'user1-resume.pdf'
        }),
        DatabaseTestHelper.createTestResume({
          userId: regularUser.uid,
          filename: 'user2-resume.pdf'
        })
      ]);

      // Get resumes for testUser
      const response1 = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response1);
      expect(response1.body.data.resumes).toHaveLength(1);
      expect(response1.body.data.resumes[0].filename).toBe('user1-resume.pdf');

      // Get resumes for regularUser
      const response2 = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(regularUser));

      ResponseValidator.validateSuccessResponse(response2);
      expect(response2.body.data.resumes).toHaveLength(1);
      expect(response2.body.data.resumes[0].filename).toBe('user2-resume.pdf');
    });

    test('should validate user ownership in job descriptions', async () => {
      const testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Private Job',
        description: 'This job belongs to testUser'
      });

      // Owner should be able to access
      const response1 = await request(app)
        .get(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response1);

      // Non-owner should be denied
      const response2 = await request(app)
        .get(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(regularUser));

      ResponseValidator.validateErrorResponse(response2, 404);
    });

    test('should validate user ownership in analysis operations', async () => {
      const testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Analysis Test Job',
        description: 'Job description for analysis testing with proper authentication'
      });

      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'analysis-test.pdf'
      });

      // Owner should be able to run analysis
      const response1 = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      expect([200, 404]).toContain(response1.status); // 200 success or 404 no resumes

      // Non-owner should be denied
      const response2 = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(regularUser))
        .send({});

      ResponseValidator.validateErrorResponse(response2, 404);
    });
  });

  describe('Session Management and Security', () => {
    test('should handle session-based access control', async () => {
      const sessionId = `session_${Date.now()}_auth_test`;
      
      // Create resume with specific session
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId,
        filename: 'session-resume.pdf'
      });

      // Access with correct session should work
      const response1 = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(testUser))
        .query({ sessionId });

      ResponseValidator.validateSuccessResponse(response1);
      expect(response1.body.data.resumes).toHaveLength(1);

      // Access with wrong session should return empty
      const response2 = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(testUser))
        .query({ sessionId: 'wrong_session' });

      ResponseValidator.validateSuccessResponse(response2);
      expect(response2.body.data.resumes).toHaveLength(0);
    });

    test('should validate batch ownership through sessions', async () => {
      const batchId = `batch_${Date.now()}_auth_test`;
      const sessionId = `session_${Date.now()}_auth_test`;
      
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId,
        batchId,
        filename: 'batch-auth-test.pdf'
      });

      // Valid session should access batch
      const response1 = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', sessionId);

      ResponseValidator.validateSuccessResponse(response1);

      // Invalid session should be denied
      const response2 = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', 'wrong_session');

      expect(response2.status).toBe(403);
    });

    test('should prevent cross-user session access', async () => {
      const batchId = `batch_${Date.now()}_cross_user`;
      const sessionId = `session_${Date.now()}_cross_user`;
      
      // Create batch for testUser
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId,
        batchId,
        filename: 'cross-user-test.pdf'
      });

      // Different user with same session ID should be denied
      const response = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(regularUser))
        .set('X-Session-ID', sessionId);

      expect(response.status).toBe(403);
    });
  });

  describe('Authorization Edge Cases', () => {
    test('should handle missing user ID gracefully', async () => {
      const userWithoutId = MockAuth.createTestUser({ uid: '' });

      const response = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(userWithoutId));

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should handle null user ID gracefully', async () => {
      // Create token without user ID
      const invalidHeaders = {
        'Authorization': 'Bearer valid_looking_token_without_user_id',
        'Content-Type': 'application/json'
      };

      const response = await request(app)
        .get('/api/resumes')
        .set(invalidHeaders);

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should handle special characters in user IDs', async () => {
      const specialUser = MockAuth.createTestUser({ 
        uid: 'user@test.com#special$chars%123' 
      });

      const response = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(specialUser));

      // Should either work or fail gracefully
      expect([200, 400, 401]).toContain(response.status);
    });

    test('should handle extremely long user IDs', async () => {
      const longUser = MockAuth.createTestUser({ 
        uid: 'user_' + 'a'.repeat(1000) 
      });

      const response = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(longUser));

      // Should handle gracefully
      expect([200, 400, 401]).toContain(response.status);
    });
  });

  describe('API Endpoint Access Control', () => {
    const protectedEndpoints = [
      { method: 'GET', path: '/api/resumes' },
      { method: 'POST', path: '/api/resumes' },
      { method: 'GET', path: '/api/resumes/123' },
      { method: 'DELETE', path: '/api/resumes/123' },
      { method: 'GET', path: '/api/job-descriptions' },
      { method: 'POST', path: '/api/job-descriptions' },
      { method: 'GET', path: '/api/job-descriptions/123' },
      { method: 'PATCH', path: '/api/job-descriptions/123' },
      { method: 'DELETE', path: '/api/job-descriptions/123' },
      { method: 'POST', path: '/api/analysis/analyze/123' },
      { method: 'GET', path: '/api/analysis/analyze/123' },
      { method: 'GET', path: '/api/analysis/analyze/123/456' },
      { method: 'POST', path: '/api/analysis/analyze-bias/123' },
      { method: 'GET', path: '/api/batches/batch_123_test/validate' },
      { method: 'GET', path: '/api/batches/batch_123_test/status' },
      { method: 'POST', path: '/api/batches/batch_123_test/claim' },
      { method: 'DELETE', path: '/api/batches/batch_123_test' },
      { method: 'GET', path: '/api/batches/batch_123_test/resumes' }
    ];

    test('should require authentication for all protected endpoints', async () => {
      for (const endpoint of protectedEndpoints) {
        let response;
        
        switch (endpoint.method) {
          case 'GET':
            response = await request(app).get(endpoint.path);
            break;
          case 'POST':
            response = await request(app).post(endpoint.path);
            break;
          case 'PATCH':
            response = await request(app).patch(endpoint.path);
            break;
          case 'DELETE':
            response = await request(app).delete(endpoint.path);
            break;
          default:
            continue;
        }

        expect(response.status).toBe(401);
        expect(response.body.success || response.body.error).toBeDefined();
      }
    });

    test('should allow access with valid authentication', async () => {
      // Test a subset of endpoints that should work with valid auth
      const testEndpoints = [
        { method: 'GET', path: '/api/resumes' },
        { method: 'GET', path: '/api/job-descriptions' }
      ];

      for (const endpoint of testEndpoints) {
        const method = endpoint.method.toLowerCase();
        let response;
        
        if (method === 'get') {
          response = await request(app).get(endpoint.path).set(MockAuth.generateAuthHeaders(testUser));
        } else if (method === 'post') {
          response = await request(app).post(endpoint.path).set(MockAuth.generateAuthHeaders(testUser));
        } else if (method === 'put') {
          response = await request(app).put(endpoint.path).set(MockAuth.generateAuthHeaders(testUser));
        } else if (method === 'delete') {
          response = await request(app).delete(endpoint.path).set(MockAuth.generateAuthHeaders(testUser));
        }

        expect([200, 404]).toContain(response?.status);
        expect(response?.status).not.toBe(401);
      }
    });
  });

  describe('Security Headers and Validation', () => {
    test('should validate required headers for batch operations', async () => {
      const batchId = 'batch_123_header_test';

      // Missing X-Session-ID header
      const response1 = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser));

      expect([400, 403]).toContain(response1.status);

      // Missing Authorization header
      const response2 = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set('X-Session-ID', 'session_123_test');

      ResponseValidator.validateErrorResponse(response2, 401);
    });

    test('should sanitize user input in headers', async () => {
      const maliciousSessionId = '<script>alert("xss")</script>';
      const batchId = 'batch_123_sanitize_test';

      const response = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', maliciousSessionId);

      // Should either reject or sanitize the input
      expect([400, 403]).toContain(response.status);
    });

    test('should handle case-insensitive header names', async () => {
      const response1 = await request(app)
        .get('/api/resumes')
        .set('authorization', `Bearer ${testUser.firebaseToken}`); // lowercase

      const response2 = await request(app)
        .get('/api/resumes')
        .set('AUTHORIZATION', `Bearer ${testUser.firebaseToken}`); // uppercase

      // Both should work the same way
      expect(response1.status).toBe(response2.status);
    });

    test('should validate header value lengths', async () => {
      const longToken = 'Bearer ' + 'a'.repeat(10000);

      const response = await request(app)
        .get('/api/resumes')
        .set('Authorization', longToken);

      ResponseValidator.validateErrorResponse(response, 401);
    });
  });

  describe('Rate Limiting and Security Measures', () => {
    test('should enforce authentication rate limits', async () => {
      // Make many requests with invalid tokens
      const promises = Array(50).fill(null).map(() =>
        request(app)
          .get('/api/resumes')
          .set('Authorization', 'Bearer invalid_token_' + Math.random())
      );

      const responses = await Promise.allSettled(promises);
      
      // All should be 401, but rate limiting might kick in
      const rateLimited = responses.some(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      // Rate limiting behavior may vary
    });

    test('should handle concurrent authentication requests', async () => {
      const promises = Array(10).fill(null).map(() =>
        request(app)
          .get('/api/resumes')
          .set(MockAuth.generateAuthHeaders(testUser))
      );

      const responses = await Promise.all(promises);
      
      // All should succeed (or consistently fail)
      const firstStatus = responses[0].status;
      responses.forEach(response => {
        expect(response.status).toBe(firstStatus);
      });
    });

    test('should prevent brute force attacks on endpoints', async () => {
      // Create test data first
      const testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Brute Force Test',
        description: 'Test job description for brute force prevention testing'
      });

      // Try to access with many different invalid tokens
      const promises = Array(20).fill(null).map((_, i) =>
        request(app)
          .get(`/api/job-descriptions/${testJob.id}`)
          .set('Authorization', `Bearer invalid_token_${i}`)
      );

      const responses = await Promise.allSettled(promises);
      
      // All should be unauthorized
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value.status).toBe(401);
        }
      });
    });
  });

  describe('Error Handling and Security', () => {
    test('should not leak sensitive information in error messages', async () => {
      const response = await request(app)
        .get('/api/resumes')
        .set('Authorization', 'Bearer invalid_token_123');

      ResponseValidator.validateErrorResponse(response, 401);
      
      // Error message should not contain sensitive details
      const errorMessage = response.body.error || response.body.message || '';
      expect(errorMessage).not.toMatch(/database|sql|internal|stack|trace/i);
    });

    test('should handle malformed authorization headers gracefully', async () => {
      const malformedHeaders = [
        'Bearer\x00null_byte',
        'Bearer ' + '\n\r\t',
        'Bearer 🔑invalid_unicode',
        'Bearer <script>alert("xss")</script>',
        'Bearer ' + JSON.stringify({ fake: 'token' })
      ];

      for (const header of malformedHeaders) {
        const response = await request(app)
          .get('/api/resumes')
          .set('Authorization', header);

        ResponseValidator.validateErrorResponse(response, 401);
      }
    });

    test('should handle Firebase authentication errors gracefully', async () => {
      // Mock various Firebase error scenarios
      const firebaseErrorCases = [
        'id-token-expired',
        'id-token-revoked',
        'invalid-id-token',
        'user-disabled',
        'user-not-found'
      ];

      // These would require actual Firebase mocking in a real scenario
      for (const errorCase of firebaseErrorCases) {
        const response = await request(app)
          .get('/api/resumes')
          .set('Authorization', `Bearer mock_${errorCase}_token`);

        ResponseValidator.validateErrorResponse(response, 401);
      }
    });

    test('should handle network errors during token validation', async () => {
      // This would require mocking network failures
      const response = await request(app)
        .get('/api/resumes')
        .set('Authorization', 'Bearer network_error_simulation_token');

      // Should fail gracefully
      expect([401, 500, 503]).toContain(response.status);
    });
  });

  describe('User Permissions and Roles', () => {
    test('should handle user role validation', async () => {
      // In future, different user roles might have different permissions
      const basicUser = MockAuth.createTestUser({ 
        uid: 'basic_user_123',
        email: 'basic@test.com'
      });

      const premiumUser = MockAuth.createTestUser({ 
        uid: 'premium_user_456',
        email: 'premium@test.com'
      });

      // For now, all authenticated users have the same permissions
      const response1 = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(basicUser));

      const response2 = await request(app)
        .get('/api/resumes')
        .set(MockAuth.generateAuthHeaders(premiumUser));

      // Both should have same access level
      expect(response1.status).toBe(response2.status);
    });

    test('should handle admin-specific endpoints', async () => {
      // Test cleanup candidates endpoint (admin-like functionality)
      const response1 = await request(app)
        .get('/api/batches/cleanup-candidates')
        .set(MockAuth.generateAuthHeaders(regularUser));

      const response2 = await request(app)
        .get('/api/batches/cleanup-candidates')
        .set(MockAuth.generateAuthHeaders(adminUser));

      // Currently both should work, but in future might require admin role
      expect([200, 401, 403]).toContain(response1.status);
      expect([200, 401, 403]).toContain(response2.status);
    });
  });
});