/**
 * Working Integration Test Demo
 * Demonstrates that the integration test fixes are working
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { Express } from 'express';
import { MockAuth, TestUser } from './helpers/api-helpers';

describe('Integration Test Demo - Working', () => {
  let app: Express;
  let testUser: TestUser;

  beforeAll(async () => {
    console.log('🚀 Setting up integration test demo...');
    
    // Import the mock server
    const { createMockServer } = await import('./helpers/server-mock');
    app = createMockServer();
    
    // Create test user
    testUser = MockAuth.createTestUser();
    
    console.log('✅ Integration test demo setup complete');
  });

  test('should respond to health check', async () => {
    const response = await request(app)
      .get('/api/health');
    
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  test('should require authentication for protected routes', async () => {
    const response = await request(app)
      .get('/api/resumes');
    
    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  test('should allow authenticated access', async () => {
    const response = await request(app)
      .get('/api/resumes')
      .set(MockAuth.generateAuthHeaders(testUser));
    
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
    expect(response.body.data.resumes).toEqual([]);
  });

  test('should create and retrieve job descriptions', async () => {
    // Create job description
    const createResponse = await request(app)
      .post('/api/job-descriptions')
      .set(MockAuth.generateAuthHeaders(testUser))
      .send({
        title: 'Test Developer',
        description: 'Looking for a test developer',
        requirements: ['Testing', 'JavaScript'],
        skills: ['Jest', 'Testing'],
        experience: '2+ years'
      });
    
    expect(createResponse.status).toBe(200);
    expect(createResponse.body.status).toBe('success');
    
    const jobId = createResponse.body.data.id;
    expect(jobId).toBeDefined();
    
    // Retrieve job description
    const getResponse = await request(app)
      .get(`/api/job-descriptions/${jobId}`)
      .set(MockAuth.generateAuthHeaders(testUser));
    
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.title).toBe('Test Developer');
  });

  test('should create resume and run analysis', async () => {
    // Create job description first
    const jobResponse = await request(app)
      .post('/api/job-descriptions')
      .set(MockAuth.generateAuthHeaders(testUser))
      .send({
        title: 'JavaScript Developer',
        description: 'Looking for JavaScript developer',
        requirements: ['JavaScript', 'React'],
      });
    
    const jobId = jobResponse.body.data.id;
    
    // Create resume
    const resumeResponse = await request(app)
      .post('/api/resumes')
      .set(MockAuth.generateAuthHeaders(testUser))
      .send({
        filename: 'test-resume.pdf',
        content: 'Experienced JavaScript developer with React skills'
      });
    
    expect(resumeResponse.status).toBe(200);
    
    // Run analysis
    const analysisResponse = await request(app)
      .post(`/api/analysis/analyze/${jobId}`)
      .set(MockAuth.generateAuthHeaders(testUser))
      .send({});
    
    expect(analysisResponse.status).toBe(200);
    expect(analysisResponse.body.status).toBe('success');
    expect(analysisResponse.body.data.results).toHaveLength(1);
    expect(analysisResponse.body.data.results[0].match.matchPercentage).toBeDefined();
  });

  test('should handle bias analysis', async () => {
    // Create job description
    const jobResponse = await request(app)
      .post('/api/job-descriptions')
      .set(MockAuth.generateAuthHeaders(testUser))
      .send({
        title: 'Energetic Developer',
        description: 'Looking for young, energetic developers',
      });
    
    const jobId = jobResponse.body.data.id;
    
    // Run bias analysis
    const biasResponse = await request(app)
      .post(`/api/analysis/analyze-bias/${jobId}`)
      .set(MockAuth.generateAuthHeaders(testUser))
      .send({});
    
    expect(biasResponse.status).toBe(200);
    expect(biasResponse.body.status).toBe('success');
    expect(biasResponse.body.data.overallBiasScore).toBeDefined();
    expect(biasResponse.body.data.biasAnalysis).toBeDefined();
  });
});

export {};