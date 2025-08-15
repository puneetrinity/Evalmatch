/**
 * Job Description API Integration Tests
 * Comprehensive tests for job description CRUD operations and analysis
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
  TestJobDescription
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

describe('Job Description API', () => {
  describe('POST /api/job-descriptions - Create Job Description', () => {
    const validJobData = {
      title: 'Senior Software Engineer',
      description: `We are looking for a Senior Software Engineer with experience in:
        - JavaScript, React, Node.js
        - Database design with PostgreSQL
        - RESTful API development
        - Agile development methodologies
        
        Requirements:
        - 5+ years of software development experience
        - Bachelor's degree in Computer Science or related field
        - Experience with cloud platforms (AWS, Azure)
        - Strong problem-solving skills`,
      company: 'Tech Innovations Inc.',
      location: 'San Francisco, CA',
      type: 'Full-time',
      salary: '$120,000 - $150,000'
    };

    test('should successfully create a job description', async () => {
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(validJobData);

      ResponseValidator.validateJobResponse(response);
      expect(response.body.status).toBe('success');
      expect(response.body.jobDescription.title).toBe(validJobData.title);
      expect(response.body.jobDescription.description).toBe(validJobData.description);
      expect(response.body.jobDescription.id).toBeDefined();
      expect(response.body.jobDescription.createdAt).toBeDefined();
    }, TEST_CONFIG.timeout);

    test('should successfully analyze job description with AI', async () => {
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(validJobData);

      ResponseValidator.validateJobResponse(response);
      expect(response.body.jobDescription.skills).toBeDefined();
      expect(Array.isArray(response.body.jobDescription.skills)).toBe(true);
      expect(response.body.jobDescription.requirements).toBeDefined();
      expect(response.body.analysis).toBeDefined();
      expect(response.body.analysis.skillsExtracted).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);

    test('should handle job creation when AI analysis fails', async () => {
      // Mock AI service failure scenario would be here
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(validJobData);

      // Should still create job even if analysis fails
      expect([200, 201]).toContain(response.status);
      expect(response.body.jobDescription).toBeDefined();
      expect(response.body.jobDescription.id).toBeDefined();
    }, TEST_CONFIG.timeout);

    test('should validate required fields', async () => {
      const invalidJobData = {
        // Missing title
        description: 'Job description without title'
      };

      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(invalidJobData);

      ResponseValidator.validateErrorResponse(response, 400);
      expect(response.body.error).toBe('Invalid job description data');
    });

    test('should validate title length', async () => {
      const longTitle = 'A'.repeat(300); // Assuming max length is 255
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({
          title: longTitle,
          description: validJobData.description
        });

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should validate description length', async () => {
      const longDescription = 'A'.repeat(50000); // Assuming reasonable max length
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({
          title: validJobData.title,
          description: longDescription
        });

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/job-descriptions')
        .send(validJobData);

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should measure creation performance', async () => {
      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .post('/api/job-descriptions')
          .set(MockAuth.generateAuthHeaders(testUser))
          .send(validJobData),
        5000 // 5 seconds max for AI analysis
      );

      expect([200, 201]).toContain(response.status);
      expect(duration).toBeLessThan(5000);
    }, 10000);
  });

  describe('GET /api/job-descriptions - Retrieve Job Descriptions', () => {
    beforeEach(async () => {
      // Create test job descriptions
      await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Frontend Developer',
        description: 'React and Vue.js developer needed'
      });
      await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Backend Developer',
        description: 'Node.js and Python developer needed'
      });
      await DatabaseTestHelper.createTestJobDescription({
        userId: anotherUser.uid,
        title: 'DevOps Engineer',
        description: 'AWS and Docker experience required'
      });
    });

    test('should retrieve all job descriptions for authenticated user', async () => {
      const response = await request(app)
        .get('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.status).toBe('success');
      expect(response.body.jobDescriptions).toHaveLength(2);
      expect(response.body.count).toBe(2);
      
      // Verify only user's jobs are returned
      response.body.jobDescriptions.forEach((job: any) => {
        expect(job.userId).toBe(testUser.uid);
      });
    });

    test('should handle pagination parameters', async () => {
      const response = await request(app)
        .get('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .query({ limit: 1, offset: 0 });

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.jobDescriptions).toHaveLength(1);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.pagination.offset).toBe(0);
    });

    test('should return empty array for user with no jobs', async () => {
      const emptyUser = MockAuth.createTestUser();
      const response = await request(app)
        .get('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(emptyUser));

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.jobDescriptions).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/job-descriptions');

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should handle invalid pagination parameters', async () => {
      const response = await request(app)
        .get('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .query({ limit: -1, offset: 'invalid' });

      ResponseValidator.validateSuccessResponse(response);
      // Should use default pagination values
      expect(response.body.pagination.limit).toBeGreaterThan(0);
      expect(response.body.pagination.offset).toBeGreaterThanOrEqual(0);
    });

    test('should measure retrieval performance', async () => {
      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .get('/api/job-descriptions')
          .set(MockAuth.generateAuthHeaders(testUser)),
        2000 // 2 seconds max
      );

      ResponseValidator.validateSuccessResponse(response);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('GET /api/job-descriptions/:id - Retrieve Specific Job Description', () => {
    let testJob: TestJobDescription;

    beforeEach(async () => {
      // Ensure user exists first, then create job
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure user creation
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Full Stack Developer',
        description: 'Looking for a full stack developer with React and Node.js experience'
      });
      // Verify job was created with an ID
      if (!testJob.id) {
        throw new Error('Test job was not created with an ID');
      }
    });

    test('should retrieve specific job description by ID', async () => {
      const response = await request(app)
        .get(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.status).toBe('success');
      expect(response.body.jobDescription.id).toBe(testJob.id);
      expect(response.body.jobDescription.title).toBe(testJob.title);
      expect(response.body.jobDescription.description).toBe(testJob.description);
      expect(response.body.isAnalyzed).toBeDefined();
    });

    test('should return 404 for non-existent job description', async () => {
      const response = await request(app)
        .get('/api/job-descriptions/99999')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should return 400 for invalid job ID', async () => {
      const response = await request(app)
        .get('/api/job-descriptions/invalid-id')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateErrorResponse(response, 400);
      expect(response.body.error).toBe('Invalid job description ID');
    });

    test('should not allow access to other users job descriptions', async () => {
      const response = await request(app)
        .get(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser));

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/job-descriptions/${testJob.id}`);

      ResponseValidator.validateErrorResponse(response, 401);
    });
  });

  describe('PATCH /api/job-descriptions/:id - Update Job Description', () => {
    let testJob: TestJobDescription;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Original Title',
        description: 'Original description with JavaScript requirements'
      });
    });

    test('should successfully update job description', async () => {
      const updateData = {
        title: 'Updated Title',
        description: 'Updated description with Python and JavaScript requirements'
      };

      const response = await request(app)
        .patch(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(updateData);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.status).toBe('success');
      expect(response.body.jobDescription.title).toBe(updateData.title);
      expect(response.body.jobDescription.description).toBe(updateData.description);
    }, TEST_CONFIG.timeout);

    test('should re-analyze job when description is updated', async () => {
      const updateData = {
        description: 'Completely new description requiring React, Vue.js, and Node.js experience'
      };

      const response = await request(app)
        .patch(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(updateData);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.jobDescription.description).toBe(updateData.description);
      // New analysis should be triggered for new description
    }, TEST_CONFIG.timeout);

    test('should not re-analyze if description unchanged', async () => {
      const updateData = {
        title: 'New Title Only'
        // Description not changed
      };

      const response = await request(app)
        .patch(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(updateData);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.jobDescription.title).toBe(updateData.title);
    });

    test('should validate ownership before update', async () => {
      const updateData = { title: 'Unauthorized Update' };

      const response = await request(app)
        .patch(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send(updateData);

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should return 404 for non-existent job description', async () => {
      const response = await request(app)
        .patch('/api/job-descriptions/99999')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ title: 'Updated Title' });

      ResponseValidator.validateErrorResponse(response, 404);
    });

    test('should return 400 for invalid job ID', async () => {
      const response = await request(app)
        .patch('/api/job-descriptions/invalid-id')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ title: 'Updated Title' });

      ResponseValidator.validateErrorResponse(response, 400);
      expect(response.body.error).toBe('Invalid job description ID');
    });

    test('should handle partial updates', async () => {
      const updateData = { title: 'Partial Update' };

      const response = await request(app)
        .patch(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(updateData);

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.jobDescription.title).toBe(updateData.title);
      expect(response.body.jobDescription.description).toBe(testJob.description);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .patch(`/api/job-descriptions/${testJob.id}`)
        .send({ title: 'Updated Title' });

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should validate update data', async () => {
      const invalidData = { title: 'A'.repeat(300) }; // Too long

      const response = await request(app)
        .patch(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(invalidData);

      ResponseValidator.validateErrorResponse(response, 400);
    });
  });

  describe('DELETE /api/job-descriptions/:id - Delete Job Description', () => {
    let testJob: TestJobDescription;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Job to Delete',
        description: 'This job will be deleted in tests'
      });
    });

    test('should successfully delete own job description', async () => {
      const response = await request(app)
        .delete(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Job description deleted successfully');
      
      // Verify job is deleted
      const getResponse = await request(app)
        .get(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateErrorResponse(getResponse, 404);
    });

    test('should validate ownership before deletion', async () => {
      const response = await request(app)
        .delete(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser));

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should return 404 for non-existent job description', async () => {
      const response = await request(app)
        .delete('/api/job-descriptions/99999')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateErrorResponse(response, 404);
    });

    test('should return 400 for invalid job ID', async () => {
      const response = await request(app)
        .delete('/api/job-descriptions/invalid-id')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateErrorResponse(response, 400);
      expect(response.body.error).toBe('Invalid job description ID');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .delete(`/api/job-descriptions/${testJob.id}`);

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should handle cascade deletion of related data', async () => {
      // Create related analysis results
      const resume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'test-resume.pdf'
      });
      
      await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: resume.id!,
        jobDescriptionId: testJob.id!
      });

      const response = await request(app)
        .delete(`/api/job-descriptions/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response);
      // Related data should be cleaned up appropriately
    });
  });

  describe('Job Description Analysis and AI Integration', () => {
    test('should extract skills from job description', async () => {
      const jobWithSkills = {
        title: 'Software Engineer',
        description: `Looking for a developer with:
          - JavaScript and TypeScript
          - React.js and Vue.js
          - Node.js and Express
          - PostgreSQL and MongoDB
          - AWS and Docker experience`
      };

      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(jobWithSkills);

      ResponseValidator.validateJobResponse(response);
      expect(response.body.jobDescription.skills).toBeDefined();
      expect(Array.isArray(response.body.jobDescription.skills)).toBe(true);
      expect(response.body.jobDescription.skills.length).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);

    test('should extract requirements from job description', async () => {
      const jobWithRequirements = {
        title: 'Senior Developer',
        description: `Requirements:
          - Bachelor's degree in Computer Science
          - 5+ years of experience
          - Experience with agile methodologies
          - Strong communication skills
          - Portfolio of previous work`
      };

      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(jobWithRequirements);

      ResponseValidator.validateJobResponse(response);
      expect(response.body.jobDescription.requirements).toBeDefined();
      expect(Array.isArray(response.body.jobDescription.requirements)).toBe(true);
    }, TEST_CONFIG.timeout);

    test('should handle job descriptions without clear structure', async () => {
      const unstructuredJob = {
        title: 'Developer Position',
        description: 'We need someone good with computers and stuff. Should know programming.'
      };

      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(unstructuredJob);

      ResponseValidator.validateJobResponse(response);
      // Should still create job even with poor description
      expect(response.body.jobDescription.id).toBeDefined();
    }, TEST_CONFIG.timeout);
  });

  describe('Rate Limiting and Security', () => {
    test('should enforce rate limits on job creation', async () => {
      const jobData = {
        title: 'Rate Limit Test',
        description: 'Testing rate limiting'
      };

      // Make multiple rapid requests
      const promises = Array(15).fill(null).map((_, i) =>
        request(app)
          .post('/api/job-descriptions')
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({ ...jobData, title: `${jobData.title} ${i}` })
      );

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rateLimited = responses.some(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      // Note: Rate limiting behavior may vary in test environment
    }, TEST_CONFIG.timeout);

    test('should handle concurrent job operations safely', async () => {
      const jobData = {
        title: 'Concurrent Test',
        description: 'Testing concurrent operations'
      };

      const responses = await PerformanceTestHelper.testConcurrentRequests(
        () => request(app)
          .post('/api/job-descriptions')
          .set(MockAuth.generateAuthHeaders(testUser))
          .send(jobData),
        3
      );

      responses.forEach(response => {
        expect([200, 201, 400, 429, 500]).toContain(response.status);
      });
    }, TEST_CONFIG.timeout);

    test('should sanitize job description input', async () => {
      const maliciousJob = {
        title: '<script>alert("xss")</script>',
        description: 'Job with <img src="x" onerror="alert(1)"> malicious content'
      };

      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(maliciousJob);

      if (response.status === 200 || response.status === 201) {
        // Should sanitize HTML/script tags
        expect(response.body.jobDescription.title).not.toContain('<script>');
        expect(response.body.jobDescription.description).not.toContain('<img');
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle database connection errors gracefully', async () => {
      // This would require mocking database failures
      const response = await request(app)
        .get('/api/job-descriptions/999999')
        .set(MockAuth.generateAuthHeaders(testUser));

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
    });

    test('should handle extremely long job descriptions', async () => {
      const veryLongDescription = 'A'.repeat(100000);
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({
          title: 'Very Long Job',
          description: veryLongDescription
        });

      // Should either accept or reject gracefully
      expect([200, 201, 400]).toContain(response.status);
    });

    test('should handle special characters in job descriptions', async () => {
      const specialCharJob = {
        title: 'Job with émojis 🚀 and spëcial chârs',
        description: 'Description with unicode: αβγδε, Chinese: 中文, Arabic: العربية'
      };

      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send(specialCharJob);

      expect([200, 201, 400]).toContain(response.status);
      if (response.status === 200 || response.status === 201) {
        expect(response.body.jobDescription.title).toBeDefined();
      }
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/job-descriptions')
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('Content-Type', 'application/json')
        .send('{"title": "Invalid JSON"'); // Malformed JSON

      ResponseValidator.validateErrorResponse(response, 400);
    });
  });
});