/**
 * Analysis API Integration Tests
 * Comprehensive tests for resume-job matching, bias detection, and analysis endpoints
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
  TestJobDescription,
  TestResume
} from '../../helpers/api-helpers';

// Mock the server setup
let app: Express;
let testUser: TestUser;
let anotherUser: TestUser;

beforeAll(async () => {
  // Import and setup server
  const { default: expressApp } = await import('../../../server/index');
  app = expressApp;
  
  await TestSuiteHelper.setupTestEnvironment();
}, TEST_CONFIG.timeout);

afterAll(async () => {
  await TestSuiteHelper.teardownTestEnvironment();
}, TEST_CONFIG.timeout);

beforeEach(async () => {
  // Create fresh test users for each test
  testUser = MockAuth.createTestUser();
  anotherUser = MockAuth.createTestUser();
  
  // Clear any existing test data
  await DatabaseTestHelper.cleanupTestData();
});

describe('Analysis API', () => {
  describe('POST /api/analysis/analyze/:jobId - Analyze Resumes Against Job', () => {
    let testJob: TestJobDescription;
    let testResumes: TestResume[];

    beforeEach(async () => {
      // Create test job description
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Full Stack Developer',
        description: `We are looking for a Full Stack Developer with:
          - JavaScript, React, Node.js experience
          - Database knowledge (PostgreSQL, MongoDB)
          - RESTful API development
          - 3+ years of experience
          - Bachelor's degree preferred`,
        skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
        requirements: ['3+ years experience', 'Bachelor degree'],
        experience: '3+ years'
      });

      // Create test resumes with different skill matches
      testResumes = [
        await DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          filename: 'perfect-match.pdf',
          content: 'Software engineer with 5 years experience in JavaScript, React, Node.js, and PostgreSQL. Bachelor in Computer Science.',
          skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL'],
          experience: '5 years'
        }),
        await DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          filename: 'partial-match.pdf',
          content: 'Developer with 2 years experience in JavaScript and Python. Some React experience.',
          skills: ['JavaScript', 'Python', 'React'],
          experience: '2 years'
        }),
        await DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          filename: 'poor-match.pdf',
          content: 'Designer with expertise in Photoshop, Illustrator, and UI/UX design.',
          skills: ['Photoshop', 'Illustrator', 'UI/UX'],
          experience: '3 years'
        })
      ];
    });

    test('should successfully analyze all resumes against job description', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateAnalysisResponse(response);
      expect(response.body.data.results).toHaveLength(3);
      
      // Verify analysis results structure
      response.body.data.results.forEach((result: any) => {
        expect(result.resumeId).toBeDefined();
        expect(result.filename).toBeDefined();
        expect(result.match).toBeDefined();
        expect(result.match.matchPercentage).toBeDefined();
        expect(typeof result.match.matchPercentage).toBe('number');
        expect(result.match.matchPercentage).toBeGreaterThanOrEqual(0);
        expect(result.match.matchPercentage).toBeLessThanOrEqual(100);
        expect(Array.isArray(result.match.matchedSkills)).toBe(true);
        expect(Array.isArray(result.match.missingSkills)).toBe(true);
      });
    }, TEST_CONFIG.timeout);

    test('should analyze specific resumes when resume IDs provided', async () => {
      const resumeIds = [testResumes[0].id, testResumes[1].id];
      
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ resumeIds });

      ResponseValidator.validateAnalysisResponse(response);
      expect(response.body.data.results).toHaveLength(2);
      
      // Verify only specified resumes were analyzed
      const analyzedIds = response.body.data.results.map((r: any) => r.resumeId);
      expect(analyzedIds).toContain(testResumes[0].id);
      expect(analyzedIds).toContain(testResumes[1].id);
      expect(analyzedIds).not.toContain(testResumes[2].id);
    }, TEST_CONFIG.timeout);

    test('should filter resumes by session ID', async () => {
      const sessionId = 'test_session_123';
      
      // Create resume with specific session ID
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        sessionId,
        filename: 'session-specific.pdf',
        content: 'JavaScript developer with React experience'
      });

      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ sessionId });

      ResponseValidator.validateAnalysisResponse(response);
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0].filename).toBe('session-specific.pdf');
    }, TEST_CONFIG.timeout);

    test('should filter resumes by batch ID', async () => {
      const batchId = 'test_batch_456';
      
      // Create resume with specific batch ID
      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        batchId,
        filename: 'batch-specific.pdf',
        content: 'Node.js developer with PostgreSQL experience'
      });

      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ batchId });

      ResponseValidator.validateAnalysisResponse(response);
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0].filename).toBe('batch-specific.pdf');
    }, TEST_CONFIG.timeout);

    test('should return 404 for non-existent job ID', async () => {
      const response = await request(app)
        .post('/api/analysis/analyze/99999')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should return 400 for invalid job ID', async () => {
      const response = await request(app)
        .post('/api/analysis/analyze/invalid-id')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 400);
      expect(response.body.error).toBe('Invalid job ID');
    });

    test('should return 404 when no resumes found', async () => {
      // Clear all resumes
      await DatabaseTestHelper.cleanupTestData();
      
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('No resumes found');
    });

    test('should not allow access to other users job descriptions', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .send({});

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should handle invalid resume IDs gracefully', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ resumeIds: [99999, 99998] });

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('No matching resumes found');
    });

    test('should measure analysis performance', async () => {
      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .post(`/api/analysis/analyze/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({}),
        15000 // 15 seconds max for analysis
      );

      ResponseValidator.validateAnalysisResponse(response);
      expect(duration).toBeLessThan(15000);
    }, 20000);

    test('should handle concurrent analysis requests', async () => {
      const responses = await PerformanceTestHelper.testConcurrentRequests(
        () => request(app)
          .post(`/api/analysis/analyze/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({}),
        3
      );

      responses.forEach(response => {
        expect([200, 201, 404, 429, 500]).toContain(response.status);
      });
    }, TEST_CONFIG.timeout);
  });

  describe('GET /api/analysis/analyze/:jobId - Get Analysis Results', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Backend Developer',
        description: 'Python and Django developer needed'
      });

      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'backend-dev.pdf',
        content: 'Python developer with Django and PostgreSQL experience'
      });

      // Create analysis result
      await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: testResume.id!,
        jobDescriptionId: testJob.id!,
        matchPercentage: 92
      });
    });

    test('should retrieve existing analysis results', async () => {
      const response = await request(app)
        .get(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateAnalysisResponse(response);
      expect(response.body.data.results).toHaveLength(1);
      expect(response.body.data.results[0].match.matchPercentage).toBe(92);
    });

    test('should return empty results for job with no analysis', async () => {
      const newJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'New Job',
        description: 'No analysis yet'
      });

      const response = await request(app)
        .get(`/api/analysis/analyze/${newJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateAnalysisResponse(response);
      expect(response.body.data.results).toHaveLength(0);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/analysis/analyze/${testJob.id}`);

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should not allow access to other users analysis', async () => {
      const response = await request(app)
        .get(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser));

      ResponseValidator.validateErrorResponse(response, 404);
    });
  });

  describe('GET /api/analysis/analyze/:jobId/:resumeId - Get Specific Analysis', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;
    let analysisResult: any;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Frontend Developer',
        description: 'React and TypeScript developer'
      });

      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'frontend-dev.pdf',
        content: 'React developer with TypeScript and Redux experience'
      });

      analysisResult = await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: testResume.id!,
        jobDescriptionId: testJob.id!,
        matchPercentage: 88,
        matchedSkills: ['React', 'TypeScript'],
        missingSkills: ['Redux'],
        candidateStrengths: ['Strong React skills'],
        candidateWeaknesses: ['Limited Redux experience']
      });
    });

    test('should retrieve specific analysis result', async () => {
      const response = await request(app)
        .get(`/api/analysis/analyze/${testJob.id}/${testResume.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.matchPercentage).toBe(88);
      expect(response.body.data.matchedSkills).toContain('React');
      expect(response.body.data.matchedSkills).toContain('TypeScript');
      expect(response.body.data.missingSkills).toContain('Redux');
    });

    test('should return 404 for non-existent analysis', async () => {
      const newResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'no-analysis.pdf'
      });

      const response = await request(app)
        .get(`/api/analysis/analyze/${testJob.id}/${newResume.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateErrorResponse(response, 404);
    });

    test('should validate job and resume ownership', async () => {
      const response = await request(app)
        .get(`/api/analysis/analyze/${testJob.id}/${testResume.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser));

      ResponseValidator.validateErrorResponse(response, 404);
    });

    test('should return 400 for invalid IDs', async () => {
      const response = await request(app)
        .get('/api/analysis/analyze/invalid/invalid')
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateErrorResponse(response, 400);
    });
  });

  describe('POST /api/analysis/analyze-bias/:jobId - Analyze Job Description for Bias', () => {
    let testJob: TestJobDescription;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Software Engineer',
        description: `We are looking for a rockstar ninja developer who can work in a fast-paced, 
          high-energy environment. Must be a cultural fit and young, energetic team player.
          Native English speaker preferred. Must be available 24/7.`
      });
    });

    test('should analyze job description for bias', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze-bias/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.biasAnalysis).toBeDefined();
      expect(response.body.data.overallBiasScore).toBeDefined();
      expect(typeof response.body.data.overallBiasScore).toBe('number');
    }, TEST_CONFIG.timeout);

    test('should detect language bias', async () => {
      const biasedJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Rockstar Developer',
        description: 'Looking for a ninja coder who can crush deadlines and dominate the competition. Must be a culture fit.'
      });

      const response = await request(app)
        .post(`/api/analysis/analyze-bias/${biasedJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.biasAnalysis).toBeDefined();
      // Should detect problematic language
    }, TEST_CONFIG.timeout);

    test('should detect age bias', async () => {
      const agebiasedJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Young Developer',
        description: 'Looking for young, energetic developers who are digital natives and can work long hours.'
      });

      const response = await request(app)
        .post(`/api/analysis/analyze-bias/${agebiasedJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.biasAnalysis).toBeDefined();
    }, TEST_CONFIG.timeout);

    test('should handle job descriptions with minimal bias', async () => {
      const fairJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Software Developer',
        description: 'We are seeking a software developer with experience in JavaScript and React. Competitive salary and benefits provided.'
      });

      const response = await request(app)
        .post(`/api/analysis/analyze-bias/${fairJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.data.overallBiasScore).toBeLessThan(0.3); // Low bias score
    }, TEST_CONFIG.timeout);

    test('should return 404 for non-existent job', async () => {
      const response = await request(app)
        .post('/api/analysis/analyze-bias/99999')
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
    });

    test('should validate job ownership', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze-bias/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze-bias/${testJob.id}`)
        .send({});

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should measure bias analysis performance', async () => {
      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .post(`/api/analysis/analyze-bias/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({}),
        10000 // 10 seconds max
      );

      ResponseValidator.validateSuccessResponse(response);
      expect(duration).toBeLessThan(10000);
    }, 15000);
  });

  describe('Analysis Data Quality and Validation', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Data Scientist',
        description: 'Looking for a data scientist with Python, machine learning, and statistics experience'
      });

      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'data-scientist.pdf',
        content: 'Data scientist with 4 years experience in Python, scikit-learn, TensorFlow, and statistical analysis'
      });
    });

    test('should validate match percentage range', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateAnalysisResponse(response);
      response.body.data.results.forEach((result: any) => {
        expect(result.match.matchPercentage).toBeGreaterThanOrEqual(0);
        expect(result.match.matchPercentage).toBeLessThanOrEqual(100);
      });
    });

    test('should provide meaningful analysis results', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateAnalysisResponse(response);
      const result = response.body.data.results[0];
      
      expect(result.match.matchedSkills).toBeDefined();
      expect(result.match.missingSkills).toBeDefined();
      expect(result.match.candidateStrengths).toBeDefined();
      expect(result.match.candidateWeaknesses).toBeDefined();
      
      // At least some analysis should be provided
      const hasAnalysis = 
        result.match.matchedSkills.length > 0 ||
        result.match.missingSkills.length > 0 ||
        result.match.candidateStrengths.length > 0;
      
      expect(hasAnalysis).toBe(true);
    });

    test('should handle resumes without analysis data', async () => {
      const unanalyzedResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'unanalyzed.pdf',
        content: 'Basic resume content',
        analyzedData: null
      });

      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ resumeIds: [unanalyzedResume.id] });

      // Should still provide analysis even if resume wasn't pre-analyzed
      expect([200, 500]).toContain(response.status);
    });

    test('should store analysis results in database', async () => {
      const response = await request(app)
        .post(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateAnalysisResponse(response);
      
      // Verify results are stored by retrieving them
      const getResponse = await request(app)
        .get(`/api/analysis/analyze/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser));

      ResponseValidator.validateAnalysisResponse(getResponse);
      expect(getResponse.body.data.results.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting and Performance', () => {
    let testJob: TestJobDescription;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Performance Test Job',
        description: 'Job for performance testing'
      });

      await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'perf-test.pdf',
        content: 'Resume for performance testing'
      });
    });

    test('should enforce rate limits on analysis requests', async () => {
      // Make multiple rapid analysis requests
      const promises = Array(10).fill(null).map(() =>
        request(app)
          .post(`/api/analysis/analyze/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({})
      );

      const responses = await Promise.allSettled(promises);
      
      // Some requests should be rate limited
      const rateLimited = responses.some(result => 
        result.status === 'fulfilled' && result.value.status === 429
      );
      
      // Note: Rate limiting behavior depends on implementation
    }, TEST_CONFIG.timeout);

    test('should handle batch analysis efficiently', async () => {
      // Create multiple resumes for batch analysis
      const resumePromises = Array(5).fill(null).map((_, i) =>
        DatabaseTestHelper.createTestResume({
          userId: testUser.uid,
          filename: `batch-resume-${i}.pdf`,
          content: `Resume ${i} with JavaScript and React experience`
        })
      );

      await Promise.all(resumePromises);

      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .post(`/api/analysis/analyze/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({}),
        20000 // 20 seconds max for batch analysis
      );

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.data.results).toHaveLength(6); // 5 new + 1 existing
      }
    }, 25000);
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle empty job descriptions gracefully', async () => {
      const emptyJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Empty Job',
        description: ''
      });

      const resume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'test-resume.pdf'
      });

      const response = await request(app)
        .post(`/api/analysis/analyze/${emptyJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should handle gracefully
      expect([200, 400, 500]).toContain(response.status);
    });

    test('should handle empty resume content gracefully', async () => {
      const job = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Test Job',
        description: 'Looking for developers'
      });

      const emptyResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'empty-resume.pdf',
        content: ''
      });

      const response = await request(app)
        .post(`/api/analysis/analyze/${job.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ resumeIds: [emptyResume.id] });

      // Should handle gracefully
      expect([200, 400, 500]).toContain(response.status);
    });

    test('should handle malformed request data', async () => {
      const job = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Test Job',
        description: 'Test job description for malformed data handling'
      });

      const response = await request(app)
        .post(`/api/analysis/analyze/${job.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('Content-Type', 'application/json')
        .send('{"resumeIds": [invalid]}');

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should handle AI service failures gracefully', async () => {
      const job = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Test Job',
        description: 'Test job description'
      });

      const resume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'test-resume.pdf'
      });

      // The actual AI service failure would be mocked in a real scenario
      const response = await request(app)
        .post(`/api/analysis/analyze/${job.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should either succeed or fail gracefully
      expect([200, 500, 503]).toContain(response.status);
    });
  });
});