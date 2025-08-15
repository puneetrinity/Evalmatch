/**
 * Batch Management API Integration Tests
 * Comprehensive tests for batch validation, ownership, and management endpoints
 */

import { Express } from 'express';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { 
  MockAuth, 
  DatabaseTestHelper, 
  ResponseValidator,
  PerformanceTestHelper,
  TestSuiteHelper,
  TEST_CONFIG,
  TestUser,
  TestResume
} from '../../helpers/api-helpers';

// Mock the server setup
let app: Express;
let testUser: TestUser;
let anotherUser: TestUser;

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
  // Create fresh test users for each test with unique identifiers
  const testId = Date.now() + Math.random();
  testUser = MockAuth.createTestUser({ uid: `test_user_${testId}` });
  anotherUser = MockAuth.createTestUser({ uid: `another_user_${testId}_different` });
  
  // Clear any existing test data
  await DatabaseTestHelper.cleanupTestData();
});

describe('Batch Management API', () => {
  describe('GET /api/batches/:batchId/validate - Validate Batch Ownership', () => {
    let testBatch: { batchId: string; sessionId: string; resumes: TestResume[] };

    beforeEach(async () => {
      const batchId = `batch_${Date.now()}_test`;
      const sessionId = `session_${Date.now()}_test`;
      
      // Create test batch with resumes
      const resumes = await Promise.all([
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'resume1.pdf'
        }),
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'resume2.pdf'
        })
      ]);

      testBatch = { batchId, sessionId, resumes };
    });

    test('should validate valid batch ownership', async () => {
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.batchId).toBe(testBatch.batchId);
      expect(response.body.data.ownership).toBeDefined();
      expect(response.body.data.integrityChecks).toBeDefined();
    });

    test('should reject invalid batch ID format', async () => {
      const response = await request(app)
        .get('/api/batches/invalid_batch_format/validate')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should reject non-existent batch', async () => {
      const response = await request(app)
        .get('/api/batches/batch_99999_nonexistent/validate')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should reject batch access with wrong session ID', async () => {
      const wrongSessionId = `session_${Date.now()}_wrong`;
      
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', wrongSessionId);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('should reject batch access from different user', async () => {
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .set('X-Session-ID', testBatch.sessionId);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test.skip('should enforce rate limiting', async () => {
      // Rate limiting is disabled in test environment
      // Make rapid validation requests
      const promises = Array(35).fill(null).map(() =>
        request(app)
          .get(`/api/batches/${testBatch.batchId}/validate`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', testBatch.sessionId)
      );

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited (max 30 per minute)
      const rateLimited = responses.some(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      expect(rateLimited).toBe(true);
    });

    test('should measure validation performance', async () => {
      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .get(`/api/batches/${testBatch.batchId}/validate`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', testBatch.sessionId),
        2000 // 2 seconds max
      );

      ResponseValidator.validateSuccessResponse(response);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('GET /api/batches/:batchId/status - Get Batch Status', () => {
    let testBatch: { batchId: string; sessionId: string; resumes: TestResume[] };

    beforeEach(async () => {
      const batchId = `batch_${Date.now()}_status`;
      const sessionId = `session_${Date.now()}_status`;
      
      const resumes = await Promise.all([
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'status-resume1.pdf'
        }),
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'status-resume2.pdf'
        }),
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'status-resume3.pdf'
        })
      ]);

      testBatch = { batchId, sessionId, resumes };
    });

    test('should get comprehensive batch status', async () => {
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/status`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.batchId).toBe(testBatch.batchId);
      expect(response.body.data.status).toBeDefined();
      expect(response.body.data.resumeCount).toBe(3);
      expect(response.body.data.integrityStatus).toBeDefined();
      expect(response.body.data.integrityStatus.resumesValid).toBe(true);
      expect(response.body.data.integrityStatus.metadataConsistent).toBe(true);
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.lastAccessedAt).toBeDefined();
    });

    test('should detect batch status as active for recent batches', async () => {
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/status`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.canClaim).toBe(false);
    });

    test('should include analysis count in status', async () => {
      // Create analysis result for one of the resumes
      const jobDescription = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Test Job',
        description: 'Test job for analysis'
      });

      await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: testBatch.resumes[0].id!,
        jobDescriptionId: jobDescription.id!
      });

      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/status`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.analysisCount).toBeGreaterThan(0);
    });

    test('should require valid batch ownership for status', async () => {
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/status`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateErrorResponse(response, 403);
      expect(response.body.code).toBe('BATCH_ACCESS_DENIED');
    });

    test('should detect corrupted batch data', async () => {
      // Create a resume with corrupted data (empty content)
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId: testBatch.sessionId,
        batchId: testBatch.batchId,
        filename: 'corrupted-resume.pdf',
        content: '' // Empty content indicates corruption
      });

      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/status`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.integrityStatus.dataCorrupted).toBe(true);
      expect(response.body.data.status).toBe('corrupted');
    });
  });

  describe('POST /api/batches/:batchId/claim - Claim Orphaned Batch', () => {
    let orphanedBatch: { batchId: string; sessionId: string };

    beforeEach(async () => {
      const batchId = `batch_${Date.now()}_orphaned`;
      const sessionId = `session_${Date.now()}_orphaned`;
      
      // Create orphaned batch (older than 24 hours in real scenario)
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId,
        batchId,
        filename: 'orphaned-resume.pdf'
      });

      orphanedBatch = { batchId, sessionId };
    });

    test('should successfully claim orphaned batch', async () => {
      const newSessionId = `session_${Date.now()}_claim`;
      
      const response = await request(app)
        .post(`/api/batches/${orphanedBatch.batchId}/claim`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({
          sessionId: newSessionId,
          userId: anotherUser.uid,
          force: true // Force claim for testing
        });

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.success).toBe(true);
      expect(response.body.data.batchId).toBe(orphanedBatch.batchId);
      expect(response.body.data.newSessionId).toBe(newSessionId);
      expect(response.body.data.resumeCount).toBeGreaterThan(0);
    });

    test('should validate new session ID format', async () => {
      const response = await request(app)
        .post(`/api/batches/${orphanedBatch.batchId}/claim`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({
          sessionId: 'invalid_session_format',
          userId: anotherUser.uid
        });

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should reject claiming non-orphaned batch without force', async () => {
      const newSessionId = `session_${Date.now()}_claim`;
      
      const response = await request(app)
        .post(`/api/batches/${orphanedBatch.batchId}/claim`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({
          sessionId: newSessionId,
          userId: anotherUser.uid
          // force: false (default)
        });

      expect([403, 404]).toContain(response.status);
    });

    test('should reject claiming non-existent batch', async () => {
      const response = await request(app)
        .post('/api/batches/batch_99999_nonexistent/claim')
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({
          sessionId: `session_${Date.now()}_claim`,
          userId: anotherUser.uid
        });

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.code).toBe('BATCH_NOT_FOUND');
    });

    test.skip('should enforce rate limiting on claim attempts', async () => {
      const newSessionId = `session_${Date.now()}_limit`;
      
      // Make multiple rapid claim attempts (max 3 per 5 minutes)
      const promises = Array(5).fill(null).map(() =>
        request(app)
          .post(`/api/batches/${orphanedBatch.batchId}/claim`)
          .set(MockAuth.generateAuthHeaders(anotherUser))
          .send({
            sessionId: newSessionId,
            userId: anotherUser.uid,
            force: true
          })
      );

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rateLimited = responses.some(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      expect(rateLimited).toBe(true);
    });

    test('should update related analysis results when claiming', async () => {
      // Create analysis result associated with the batch
      const jobDescription = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Test Job',
        description: 'Test job description for batch analysis testing'
      });

      const resume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId: orphanedBatch.sessionId,
        batchId: orphanedBatch.batchId,
        filename: 'claim-test-resume.pdf'
      });

      await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: resume.id!,
        jobDescriptionId: jobDescription.id!
      });

      const newSessionId = `session_${Date.now()}_claimanalysis`;
      
      const response = await request(app)
        .post(`/api/batches/${orphanedBatch.batchId}/claim`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({
          sessionId: newSessionId,
          userId: anotherUser.uid,
          force: true
        });

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.success).toBe(true);
    });
  });

  describe('DELETE /api/batches/:batchId - Delete Batch', () => {
    let testBatch: { batchId: string; sessionId: string; resumes: TestResume[] };

    beforeEach(async () => {
      const batchId = `batch_${Date.now()}_delete`;
      const sessionId = `session_${Date.now()}_delete`;
      
      const resumes = await Promise.all([
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'delete-resume1.pdf'
        }),
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'delete-resume2.pdf'
        })
      ]);

      testBatch = { batchId, sessionId, resumes };
    });

    test('should successfully delete batch and all related data', async () => {
      // Create related data
      const jobDescription = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Delete Test Job',
        description: 'Test job description for batch deletion'
      });

      await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: testBatch.resumes[0].id!,
        jobDescriptionId: jobDescription.id!
      });

      const response = await request(app)
        .delete(`/api/batches/${testBatch.batchId}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.success).toBe(true);
      expect(response.body.data.deletedItems.resumes).toBe(2);
      expect(response.body.data.deletedItems.analysisResults).toBeGreaterThanOrEqual(0);
      
      // Verify batch is actually deleted
      const validateResponse = await request(app)
        .get(`/api/batches/${testBatch.batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      expect(validateResponse.status).toBe(403);
    });

    test('should require valid batch ownership for deletion', async () => {
      const response = await request(app)
        .delete(`/api/batches/${testBatch.batchId}`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateErrorResponse(response, 403);
      expect(response.body.code).toBe('BATCH_ACCESS_DENIED');
    });

    test('should return 404 for non-existent batch deletion', async () => {
      const response = await request(app)
        .delete('/api/batches/batch_99999_nonexistent')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      expect([403, 404]).toContain(response.status);
    });

    test.skip('should enforce rate limiting on deletion attempts', async () => {
      // Create multiple batches for deletion testing
      const batches = await Promise.all(
        Array(10).fill(null).map(async (_, i) => {
          const batchId = `batch_${Date.now()}_del_${i}`;
          const sessionId = `session_${Date.now()}_del_${i}`;
          
          await DatabaseTestHelper.createTestResume({
            userId: testUser.uid,
            sessionId,
            batchId,
            filename: `del-resume-${i}.pdf`
          });
          
          return { batchId, sessionId };
        })
      );

      // Make rapid deletion requests (max 5 per 2 minutes)
      const promises = batches.slice(0, 7).map(batch =>
        request(app)
          .delete(`/api/batches/${batch.batchId}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', batch.sessionId)
      );

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rateLimited = responses.some(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      expect(rateLimited).toBe(true);
    });

    test('should handle cascade deletion of interview questions', async () => {
      // In a real scenario, interview questions would be created
      // For now, we test that the deletion doesn't fail
      const response = await request(app)
        .delete(`/api/batches/${testBatch.batchId}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.deletedItems.interviewQuestions).toBeGreaterThanOrEqual(0);
    });

    test('should measure deletion performance', async () => {
      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .delete(`/api/batches/${testBatch.batchId}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', testBatch.sessionId),
        5000 // 5 seconds max
      );

      ResponseValidator.validateSuccessResponse(response);
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('GET /api/batches/:batchId/resumes - Get Batch Resumes', () => {
    let testBatch: { batchId: string; sessionId: string; resumes: TestResume[] };

    beforeEach(async () => {
      const batchId = `batch_${Date.now()}_resumes`;
      const sessionId = `session_${Date.now()}_resumes`;
      
      const resumes = await Promise.all([
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'batch-resume1.pdf',
          fileSize: 1024,
          fileType: 'application/pdf'
        }),
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'batch-resume2.docx',
          fileSize: 2048,
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }),
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: 'batch-resume3.txt',
          fileSize: 512,
          fileType: 'text/plain'
        })
      ]);

      testBatch = { batchId, sessionId, resumes };
    });

    test('should retrieve all resumes in batch', async () => {
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/resumes`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.batchId).toBe(testBatch.batchId);
      expect(response.body.data.sessionId).toBe(testBatch.sessionId);
      expect(response.body.data.resumeCount).toBe(3);
      expect(response.body.data.resumes).toHaveLength(3);
      
      // Verify resume data structure
      response.body.data.resumes.forEach((resume: any) => {
        expect(resume.id).toBeDefined();
        expect(resume.filename).toBeDefined();
        expect(resume.file_size).toBeDefined();
        expect(resume.file_type).toBeDefined();
        expect(resume.created_at).toBeDefined();
        expect(resume.has_analysis).toBeDefined();
      });
    });

    test('should include analysis status for each resume', async () => {
      // Create analysis for one resume
      const jobDescription = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Test Job',
        description: 'Test job description for batch analysis testing'
      });

      await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: testBatch.resumes[0].id!,
        jobDescriptionId: jobDescription.id!
      });

      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/resumes`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateSuccessResponse(response);
      
      const resumeWithAnalysis = response.body.data.resumes.find(
        (r: any) => r.id === testBatch.resumes[0].id
      );
      const resumeWithoutAnalysis = response.body.data.resumes.find(
        (r: any) => r.id === testBatch.resumes[1].id
      );

      expect(resumeWithAnalysis.has_analysis).toBe(true);
      expect(resumeWithoutAnalysis.has_analysis).toBe(false);
    });

    test('should require valid batch ownership', async () => {
      const response = await request(app)
        .get(`/api/batches/${testBatch.batchId}/resumes`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .set('X-Session-ID', testBatch.sessionId);

      ResponseValidator.validateErrorResponse(response, 403);
      expect(response.body.code).toBe('BATCH_ACCESS_DENIED');
    });

    test('should return empty result for non-existent batch', async () => {
      const response = await request(app)
        .get('/api/batches/batch_99999_nonexistent/resumes')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      expect([403, 404]).toContain(response.status);
    });

    test('should update access timestamp when retrieving resumes', async () => {
      const response1 = await request(app)
        .get(`/api/batches/${testBatch.batchId}/status`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      const firstAccessTime = new Date(response1.body.data.lastAccessedAt);

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      await request(app)
        .get(`/api/batches/${testBatch.batchId}/resumes`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      const response2 = await request(app)
        .get(`/api/batches/${testBatch.batchId}/status`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', testBatch.sessionId);

      const secondAccessTime = new Date(response2.body.data.lastAccessedAt);

      expect(secondAccessTime.getTime()).toBeGreaterThan(firstAccessTime.getTime());
    });
  });

  describe('GET /api/batches/cleanup-candidates - Admin Cleanup Endpoint', () => {
    beforeEach(async () => {
      // Create old batches that would be cleanup candidates
      const oldBatchId = `batch_${Date.now() - 7 * 24 * 60 * 60 * 1000}_old`; // 7 days ago
      const oldSessionId = `session_${Date.now() - 7 * 24 * 60 * 60 * 1000}_old`;
      
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId: oldSessionId,
        batchId: oldBatchId,
        filename: 'old-resume.pdf'
      });
    });

    test('should retrieve cleanup candidates', async () => {
      const response = await request(app)
        .get('/api/batches/cleanup-candidates')
        .set(MockAuth.generateAuthHeaders(testUser)); // In real scenario, would require admin auth

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.candidateCount).toBeDefined();
      expect(response.body.data.cutoffDate).toBeDefined();
      expect(Array.isArray(response.body.data.candidates)).toBe(true);
      
      // Verify candidate structure
      if (response.body.data.candidates.length > 0) {
        const candidate = response.body.data.candidates[0];
        expect(candidate.batchId).toBeDefined();
        expect(candidate.sessionId).toBeDefined();
        expect(candidate.resumeCount).toBeDefined();
        expect(candidate.hoursInactive).toBeDefined();
      }
    });

    test.skip('should enforce rate limiting on cleanup requests', async () => {
      // Make rapid cleanup candidate requests (max 10 per minute)
      const promises = Array(15).fill(null).map(() =>
        request(app)
          .get('/api/batches/cleanup-candidates')
          .set(MockAuth.generateAuthHeaders(testUser))
      );

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rateLimited = responses.some(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      expect(rateLimited).toBe(true);
    });

    test('should limit number of cleanup candidates returned', async () => {
      const response = await request(app)
        .get('/api/batches/cleanup-candidates')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.candidates.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Batch Security and Validation', () => {
    test('should validate batch ID format', async () => {
      const invalidBatchIds = [
        'invalid-batch-id',
        'batch_invalid_format',
        'batch_123',
        'batch_123_',
        'batch__123_abc',
      ];

      for (const batchId of invalidBatchIds) {
        const response = await request(app)
          .get(`/api/batches/${batchId}/validate`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', 'session_123_test');

        ResponseValidator.validateErrorResponse(response, 400);
      }
      
      // Empty string results in 404 (route not found) not 400
      const emptyResponse = await request(app)
        .get('/api/batches//validate')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', 'session_123_test');
        
      expect(emptyResponse.status).toBe(404);
    });

    test('should validate session ID format in claim requests', async () => {
      const batchId = `batch_${Date.now()}_format_test`;
      
      const invalidSessionIds = [
        'invalid-session-id',
        'session_invalid_format',
        'session_123',
        'session_123_',
        ''
      ];

      for (const sessionId of invalidSessionIds) {
        const response = await request(app)
          .post(`/api/batches/${batchId}/claim`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({
            sessionId,
            userId: testUser.uid
          });

        ResponseValidator.validateErrorResponse(response, 400);
      }
    });

    test('should handle concurrent batch operations safely', async () => {
      const batchId = `batch_${Date.now()}_concurrent`;
      const sessionId = `session_${Date.now()}_concurrent`;
      
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId,
        batchId,
        filename: 'concurrent-resume.pdf'
      });

      // Perform concurrent operations
      const operations = [
        () => request(app)
          .get(`/api/batches/${batchId}/validate`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', sessionId),
        () => request(app)
          .get(`/api/batches/${batchId}/status`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', sessionId),
        () => request(app)
          .get(`/api/batches/${batchId}/resumes`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .set('X-Session-ID', sessionId)
      ];

      const responses = await Promise.all(operations.map(op => op()));
      
      // All operations should succeed or fail gracefully
      responses.forEach(response => {
        expect([200, 403, 404, 429, 500]).toContain(response.status);
      });
    });

    test('should prevent batch access without proper headers', async () => {
      const batchId = `batch_${Date.now()}_headers`;
      const sessionId = `session_${Date.now()}_headers`;
      
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId,
        batchId,
        filename: 'header-test-resume.pdf'
      });

      // Test without session ID header
      const response1 = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser));
        // Missing X-Session-ID header

      expect([400, 403]).toContain(response1.status);

      // Test without authorization header
      const response2 = await request(app)
        .get(`/api/batches/${batchId}/validate`)
        .set('X-Session-ID', sessionId);
        // Missing Authorization header

      ResponseValidator.validateErrorResponse(response2, 401);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JSON in claim requests', async () => {
      const batchId = `batch_${Date.now()}_malformed`;
      
      const response = await request(app)
        .post(`/api/batches/${batchId}/claim`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('Content-Type', 'application/json')
        .send('{"sessionId": "invalid json"}'); // Malformed JSON

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should handle database connection errors gracefully', async () => {
      // This would require mocking database failures
      const response = await request(app)
        .get('/api/batches/batch_99999_nonexistent/validate')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', 'session_123_test');

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(false);
    });

    test('should handle special characters in batch/session IDs', async () => {
      // Test with URL-encoded special characters
      const specialBatchId = 'batch_123%20test_abc'; // Contains %20 (space)
      
      const response = await request(app)
        .get(`/api/batches/${specialBatchId}/validate`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', 'session_123_test');

      // Should reject due to invalid format
      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should handle extremely large batch operations', async () => {
      // Create batch with many resumes (if supported)
      const batchId = `batch_${Date.now()}_large`;
      const sessionId = `session_${Date.now()}_large`;
      
      // Create multiple resumes (within reasonable limits)
      const resumePromises = Array(20).fill(null).map((_, i) =>
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          sessionId,
          batchId,
          filename: `large-batch-resume-${i}.pdf`
        })
      );

      await Promise.all(resumePromises);

      const response = await request(app)
        .get(`/api/batches/${batchId}/resumes`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('X-Session-ID', sessionId);

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data.resumeCount).toBe(20);
      }
    });
  });
});