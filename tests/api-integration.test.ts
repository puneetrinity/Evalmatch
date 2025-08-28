/**
 * API Integration Tests
 * Tests all API endpoints with real server and database
 */

import request from 'supertest';
import { API_ROUTES, buildRoute } from '../shared/api-contracts';

// Test configuration
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:5000',
  timeout: 10000,
};

describe('API Integration Tests', () => {
  let app: any;
  let testJobId: number;
  let testResumeId: number;

  beforeAll(async () => {
    // Import fixed test app
    const { createFixedTestApp } = await import('./helpers/test-server-fixed');
    app = await createFixedTestApp();
  });

  afterAll(async () => {
    // Clear test app and data
    const { clearFixedTestApp } = await import('./helpers/test-server-fixed');
    await clearFixedTestApp();
    
    if (global.gc) {
      global.gc();
    }
  });

  describe('Health Endpoints', () => {
    test('GET /api/health - should return health status', async () => {
      const response = await request(app)
        .get(API_ROUTES.HEALTH.BASIC)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /api/health/detailed - should return detailed health', async () => {
      const response = await request(app)
        .get(API_ROUTES.HEALTH.DETAILED)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(Array.isArray(response.body.checks)).toBe(true);
    });

    test('GET /api/migration-status - should return migration status', async () => {
      const response = await request(app)
        .get(API_ROUTES.HEALTH.MIGRATION_STATUS)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('migrations');
    });
  });

  describe('Job Description Workflow', () => {
    test('POST /api/job-descriptions - should create job description', async () => {
      const jobData = {
        title: 'Test Senior Developer',
        description: 'We are looking for a senior developer with React, Node.js, and TypeScript experience. The candidate should have 5+ years of experience building scalable web applications.'
      };

      const response = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .send(jobData)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('jobDescription');
      expect(response.body.data.jobDescription).toHaveProperty('id');
      expect(response.body.data.jobDescription.title).toBe(jobData.title);

      testJobId = response.body.data.jobDescription.id;
    });

    test('GET /api/job-descriptions/:id - should retrieve job description', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not set - create job test must run first');
      }

      const response = await request(app)
        .get(buildRoute(API_ROUTES.JOBS.GET_BY_ID, { id: testJobId }))
        .expect(200);

      expect(response.body).toHaveProperty('id', testJobId);
      expect(response.body).toHaveProperty('title', 'Test Senior Developer');
      expect(response.body).toHaveProperty('description');
    });

    test('PATCH /api/job-descriptions/:id - should update job description', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not set');
      }

      const updateData = {
        description: 'Updated description with additional requirements.'
      };

      const response = await request(app)
        .patch(buildRoute(API_ROUTES.JOBS.UPDATE, { id: testJobId }))
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.jobDescription.description).toContain('Updated description');
    });
  });

  describe('Resume Upload Workflow', () => {
    test('POST /api/resumes - should upload resume', async () => {
      const resumeContent = `John Doe
Senior Software Engineer
john.doe@email.com

SKILLS
- React, Redux, TypeScript
- Node.js, Express, GraphQL
- PostgreSQL, MongoDB
- AWS, Docker, Kubernetes

EXPERIENCE
Senior Software Engineer | TechCorp | 2020-Present
- Built scalable React applications
- Developed GraphQL APIs
- Led team of 4 developers`;

      const response = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .attach('file', Buffer.from(resumeContent), 'test-resume.txt')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('resume');
      expect(response.body.data.resume).toHaveProperty('id');
      expect(response.body.data.resume).toHaveProperty('filename');

      testResumeId = response.body.data.resume.id;
    });

    test('GET /api/resumes - should list resumes', async () => {
      const response = await request(app)
        .get(API_ROUTES.RESUMES.LIST)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('resumes');
      expect(Array.isArray(response.body.resumes)).toBe(true);
    });

    test('GET /api/resumes/:id - should retrieve specific resume', async () => {
      if (!testResumeId) {
        throw new Error('Test resume ID not set');
      }

      const response = await request(app)
        .get(buildRoute(API_ROUTES.RESUMES.GET_BY_ID, { id: testResumeId }))
        .expect(200);

      expect(response.body).toHaveProperty('id', testResumeId);
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('content');
    });
  });

  describe('Analysis Workflow', () => {
    test('POST /api/analysis/analyze-bias/:jobId - should analyze bias', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not set');
      }

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_BIAS, { jobId: testJobId }))
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('biasAnalysis');
      expect(response.body.biasAnalysis).toHaveProperty('hasBias');
      expect(response.body.biasAnalysis).toHaveProperty('biasConfidenceScore');
    });

    test('POST /api/analysis/analyze/:jobId - should run match analysis', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not set');
      }

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_JOB, { jobId: testJobId }))
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    test('GET /api/analysis/analyze/:jobId - should get analysis results', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not set');
      }

      const response = await request(app)
        .get(buildRoute(API_ROUTES.ANALYSIS.GET_ANALYSIS, { jobId: testJobId }))
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('results');
    });

    test('POST /api/analysis/interview-questions/:resumeId/:jobId - should generate interview questions', async () => {
      if (!testResumeId || !testJobId) {
        throw new Error('Test IDs not set');
      }

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.GENERATE_INTERVIEW, { 
          resumeId: testResumeId, 
          jobId: testJobId 
        }))
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('questions');
      expect(Array.isArray(response.body.questions)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('GET /api/job-descriptions/999999 - should handle not found', async () => {
      const response = await request(app)
        .get(buildRoute(API_ROUTES.JOBS.GET_BY_ID, { id: 999999 }))
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });

    test('POST /api/job-descriptions - should validate required fields', async () => {
      const response = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .send({ title: '' }) // Missing description
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('POST /api/analysis/analyze-bias/invalid - should handle invalid job ID', async () => {
      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_BIAS, { jobId: 'invalid' }))
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid job ID');
    });
  });

  describe('API Route Validation', () => {
    test('All defined routes should be accessible', async () => {
      // Test that all routes in our contract actually exist
      const testRoutes = [
        API_ROUTES.HEALTH.BASIC,
        API_ROUTES.JOBS.LIST,
        API_ROUTES.RESUMES.LIST,
      ];

      for (const route of testRoutes) {
        const response = await request(app).get(route);
        expect(response.status).not.toBe(404);
      }
    });
  });
});