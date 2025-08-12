/**
 * Comprehensive API Integration Tests
 * Full integration testing of all API endpoints with real database and services
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { API_ROUTES, buildRoute } from '../../shared/api-contracts';
import { testFileData, testJobDescriptions, testResumeContent } from '../fixtures/test-data';

describe('Comprehensive API Integration Tests', () => {
  let app: any;
  let authToken: string;
  let testData: {
    users: any[];
    jobs: any[];
    resumes: any[];
    analyses: any[];
  } = {
    users: [],
    jobs: [],
    resumes: [],
    analyses: []
  };

  beforeAll(async () => {
    const { createFixedTestApp } = await import('../helpers/test-server-fixed');
    app = await createFixedTestApp();
    
    // Set up authentication
    authToken = 'mock-auth-token'; // In real tests, this would be a valid Firebase token
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    
    const { clearFixedTestApp } = await import('../helpers/test-server-fixed');
    await clearFixedTestApp();
  });

  describe('Health and System Endpoints', () => {
    test('GET /api/health - basic health check', async () => {
      const response = await request(app)
        .get(API_ROUTES.HEALTH.BASIC)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number)
      });
    });

    test('GET /api/health/detailed - detailed health status', async () => {
      const response = await request(app)
        .get(API_ROUTES.HEALTH.DETAILED)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
      expect(Array.isArray(response.body.checks)).toBe(true);
      
      // Verify essential services are checked
      const checkNames = response.body.checks.map((c: any) => c.name);
      expect(checkNames).toEqual(expect.arrayContaining(['database', 'storage']));
    });

    test('GET /api/migration-status - database migration status', async () => {
      const response = await request(app)
        .get(API_ROUTES.HEALTH.MIGRATION_STATUS)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('migrations');
      expect(Array.isArray(response.body.migrations)).toBe(true);
    });

    test('GET /api/ping - simple ping endpoint', async () => {
      const response = await request(app)
        .get(API_ROUTES.HEALTH.PING)
        .expect(200);

      expect(response.body).toEqual({ message: 'pong' });
    });
  });

  describe('Job Description Management', () => {
    test('POST /api/job-descriptions - create job description', async () => {
      const jobData = {
        title: 'Senior Full Stack Developer',
        description: testJobDescriptions[0].description
      };

      const response = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .send(jobData)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        jobDescription: {
          id: expect.any(Number),
          title: jobData.title,
          description: jobData.description,
          analyzedData: expect.any(Object),
          createdAt: expect.any(String)
        }
      });

      testData.jobs.push(response.body.jobDescription);
    });

    test('GET /api/job-descriptions - list job descriptions', async () => {
      const response = await request(app)
        .get(API_ROUTES.JOBS.LIST)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('jobs');
      expect(Array.isArray(response.body.jobs)).toBe(true);
      expect(response.body.jobs.length).toBeGreaterThan(0);
    });

    test('GET /api/job-descriptions/:id - get specific job description', async () => {
      const jobId = testData.jobs[0].id;
      
      const response = await request(app)
        .get(buildRoute(API_ROUTES.JOBS.GET_BY_ID, { id: jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: jobId,
        title: expect.any(String),
        description: expect.any(String),
        analyzedData: expect.any(Object)
      });
    });

    test('PATCH /api/job-descriptions/:id - update job description', async () => {
      const jobId = testData.jobs[0].id;
      const updateData = {
        description: 'Updated job description with new requirements including Docker and Kubernetes experience.'
      };

      const response = await request(app)
        .patch(buildRoute(API_ROUTES.JOBS.UPDATE, { id: jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        jobDescription: {
          id: jobId,
          description: expect.stringContaining('Updated job description')
        }
      });
    });

    test('DELETE /api/job-descriptions/:id - delete job description', async () => {
      // Create a job specifically for deletion
      const jobToDelete = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Job to Delete',
          description: 'This job will be deleted in the test'
        })
        .expect(200);

      const jobId = jobToDelete.body.jobDescription.id;

      const response = await request(app)
        .delete(buildRoute(API_ROUTES.JOBS.DELETE, { id: jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        message: expect.stringContaining('deleted')
      });

      // Verify job is actually deleted
      await request(app)
        .get(buildRoute(API_ROUTES.JOBS.GET_BY_ID, { id: jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('Resume Management', () => {
    test('POST /api/resumes - upload text resume', async () => {
      const resumeContent = testResumeContent.softwareEngineer;

      const response = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(resumeContent), 'software-engineer.txt')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        resume: {
          id: expect.any(Number),
          filename: 'software-engineer.txt',
          fileType: 'text/plain',
          content: expect.stringContaining('John Doe'),
          analyzedData: {
            name: expect.any(String),
            skills: expect.any(Array),
            experience: expect.any(String)
          }
        }
      });

      testData.resumes.push(response.body.resume);
    });

    test('POST /api/resumes - upload PDF resume', async () => {
      const pdfContent = createValidPDF(testResumeContent.dataScientist);

      const response = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', pdfContent, 'data-scientist.pdf')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        resume: {
          id: expect.any(Number),
          filename: 'data-scientist.pdf',
          fileType: 'application/pdf',
          content: expect.any(String),
          analyzedData: expect.any(Object)
        }
      });

      testData.resumes.push(response.body.resume);
    });

    test('POST /api/resumes - upload DOCX resume', async () => {
      const docxContent = createValidDOCX(testResumeContent.projectManager);

      const response = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', docxContent, 'project-manager.docx')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        resume: {
          id: expect.any(Number),
          filename: 'project-manager.docx',
          fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          content: expect.any(String),
          analyzedData: expect.any(Object)
        }
      });

      testData.resumes.push(response.body.resume);
    });

    test('GET /api/resumes - list resumes', async () => {
      const response = await request(app)
        .get(API_ROUTES.RESUMES.LIST)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'ok',
        resumes: expect.any(Array)
      });

      expect(response.body.resumes.length).toBeGreaterThanOrEqual(3);
      
      // Verify resume structure
      response.body.resumes.forEach((resume: any) => {
        expect(resume).toMatchObject({
          id: expect.any(Number),
          filename: expect.any(String),
          fileType: expect.any(String),
          analyzedData: expect.any(Object),
          createdAt: expect.any(String)
        });
      });
    });

    test('GET /api/resumes/:id - get specific resume', async () => {
      const resumeId = testData.resumes[0].id;

      const response = await request(app)
        .get(buildRoute(API_ROUTES.RESUMES.GET_BY_ID, { id: resumeId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: resumeId,
        filename: expect.any(String),
        content: expect.any(String),
        analyzedData: expect.any(Object)
      });
    });

    test('POST /api/resumes/batch - batch upload resumes', async () => {
      const batchFiles = [
        { content: 'Batch Resume 1 Content', filename: 'batch1.txt' },
        { content: 'Batch Resume 2 Content', filename: 'batch2.txt' },
        { content: 'Batch Resume 3 Content', filename: 'batch3.txt' }
      ];

      const request_builder = request(app)
        .post(API_ROUTES.RESUMES.BATCH_UPLOAD)
        .set('Authorization', `Bearer ${authToken}`);

      batchFiles.forEach(file => {
        request_builder.attach('files', Buffer.from(file.content), file.filename);
      });

      const response = await request_builder.expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        results: expect.any(Array),
        summary: {
          total: 3,
          successful: expect.any(Number),
          failed: expect.any(Number)
        }
      });

      expect(response.body.results.length).toBe(3);
      testData.resumes.push(...response.body.results.filter((r: any) => r.success).map((r: any) => r.resume));
    });
  });

  describe('Analysis Workflows', () => {
    test('POST /api/analysis/analyze-bias/:jobId - analyze job for bias', async () => {
      const jobId = testData.jobs[0].id;

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_BIAS, { jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        biasAnalysis: {
          hasBias: expect.any(Boolean),
          biasConfidenceScore: expect.any(Number),
          biasTypes: expect.any(Array),
          suggestions: expect.any(Array),
          fairnessScore: expect.any(Number)
        }
      });

      expect(response.body.biasAnalysis.biasConfidenceScore).toBeGreaterThanOrEqual(0);
      expect(response.body.biasAnalysis.biasConfidenceScore).toBeLessThanOrEqual(100);
    });

    test('POST /api/analysis/analyze/:jobId - run matching analysis', async () => {
      const jobId = testData.jobs[0].id;

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_JOB, { jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        results: expect.any(Array),
        summary: {
          totalCandidates: expect.any(Number),
          avgMatchPercentage: expect.any(Number),
          topSkills: expect.any(Array)
        }
      });

      // Verify each result structure
      response.body.results.forEach((result: any) => {
        expect(result).toMatchObject({
          resumeId: expect.any(Number),
          matchPercentage: expect.any(Number),
          matchedSkills: expect.any(Array),
          missingSkills: expect.any(Array),
          candidateStrengths: expect.any(Array),
          candidateWeaknesses: expect.any(Array),
          confidenceLevel: expect.any(String),
          fairnessMetrics: expect.any(Object)
        });

        expect(result.matchPercentage).toBeGreaterThanOrEqual(0);
        expect(result.matchPercentage).toBeLessThanOrEqual(100);
      });

      testData.analyses = response.body.results;
    });

    test('GET /api/analysis/analyze/:jobId - get analysis results', async () => {
      const jobId = testData.jobs[0].id;

      const response = await request(app)
        .get(buildRoute(API_ROUTES.ANALYSIS.GET_ANALYSIS, { jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        results: expect.any(Array)
      });

      expect(response.body.results.length).toBeGreaterThan(0);
    });

    test('GET /api/analysis/analyze/:jobId/:resumeId - get specific analysis', async () => {
      const jobId = testData.jobs[0].id;
      const resumeId = testData.resumes[0].id;

      const response = await request(app)
        .get(buildRoute(API_ROUTES.ANALYSIS.GET_ANALYSIS_BY_RESUME, { jobId, resumeId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        resumeId: resumeId,
        jobDescriptionId: jobId,
        matchPercentage: expect.any(Number),
        matchedSkills: expect.any(Array),
        candidateStrengths: expect.any(Array),
        confidenceLevel: expect.any(String)
      });
    });

    test('POST /api/analysis/interview-questions/:resumeId/:jobId - generate interview questions', async () => {
      const resumeId = testData.resumes[0].id;
      const jobId = testData.jobs[0].id;

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.GENERATE_INTERVIEW, { resumeId, jobId }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        questions: expect.any(Array)
      });

      expect(response.body.questions.length).toBeGreaterThan(0);

      // Verify question structure
      response.body.questions.forEach((question: any) => {
        expect(question).toMatchObject({
          category: expect.any(String),
          question: expect.any(String),
          difficulty: expect.stringMatching(/^(easy|medium|hard)$/),
          expectedAnswer: expect.any(String),
          skillsAssessed: expect.any(Array)
        });
      });
    });
  });

  describe('Batch Operations', () => {
    test('GET /api/batches - list batch operations', async () => {
      const response = await request(app)
        .get('/api/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        batches: expect.any(Array)
      });
    });

    test('POST /api/batches - create new batch', async () => {
      const batchData = {
        name: 'Integration Test Batch',
        description: 'Batch created during integration testing'
      };

      const response = await request(app)
        .post('/api/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .send(batchData)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'success',
        batch: {
          id: expect.any(String),
          name: batchData.name,
          description: batchData.description,
          status: 'pending',
          createdAt: expect.any(String)
        }
      });
    });

    test('GET /api/batches/:id - get batch details', async () => {
      // Create a batch first
      const batchResponse = await request(app)
        .post('/api/batches')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Batch Details',
          description: 'Testing batch details retrieval'
        })
        .expect(200);

      const batchId = batchResponse.body.batch.id;

      const response = await request(app)
        .get(`/api/batches/${batchId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: batchId,
        name: 'Test Batch Details',
        status: expect.any(String),
        createdAt: expect.any(String)
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle non-existent job ID', async () => {
      const response = await request(app)
        .get(buildRoute(API_ROUTES.JOBS.GET_BY_ID, { id: 999999 }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: expect.stringMatching(/not found/i)
      });
    });

    test('should handle non-existent resume ID', async () => {
      const response = await request(app)
        .get(buildRoute(API_ROUTES.RESUMES.GET_BY_ID, { id: 999999 }))
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: expect.stringMatching(/not found/i)
      });
    });

    test('should validate required fields in job creation', async () => {
      const response = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: '' }) // Missing description
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.any(String),
        details: expect.any(Object)
      });
    });

    test('should handle invalid file uploads', async () => {
      const response = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from(''), 'empty-file.txt') // Empty file
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.stringMatching(/empty|invalid|content/i)
      });
    });

    test('should handle analysis on non-existent job', async () => {
      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_JOB, { jobId: 999999 }))
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(404);

      expect(response.body).toMatchObject({
        error: expect.stringMatching(/not found|invalid.*job/i)
      });
    });

    test('should handle malformed request data', async () => {
      const response = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('invalid json string')
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.stringMatching(/invalid.*json|malformed/i)
      });
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle concurrent job creation', async () => {
      const concurrentJobs = Array(5).fill(null).map((_, i) => ({
        title: `Concurrent Job ${i}`,
        description: `Job ${i} created concurrently for testing`
      }));

      const promises = concurrentJobs.map(job =>
        request(app)
          .post(API_ROUTES.JOBS.CREATE)
          .set('Authorization', `Bearer ${authToken}`)
          .send(job)
          .expect(200)
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, i) => {
        expect(response.body.jobDescription.title).toBe(`Concurrent Job ${i}`);
      });
    });

    test('should handle concurrent resume uploads', async () => {
      const concurrentResumes = Array(3).fill(null).map((_, i) => ({
        content: `Concurrent Resume ${i} Content`,
        filename: `concurrent-resume-${i}.txt`
      }));

      const promises = concurrentResumes.map(resume =>
        request(app)
          .post(API_ROUTES.RESUMES.UPLOAD)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(resume.content), resume.filename)
          .expect(200)
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, i) => {
        expect(response.body.resume.filename).toBe(`concurrent-resume-${i}.txt`);
      });
    });

    test('should maintain data consistency during concurrent operations', async () => {
      const jobPromise = request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Consistency Test Job',
          description: 'Job for consistency testing'
        });

      const resumePromise = request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', Buffer.from('Consistency test resume'), 'consistency.txt');

      const [jobResponse, resumeResponse] = await Promise.all([jobPromise, resumePromise]);

      expect(jobResponse.status).toBe(200);
      expect(resumeResponse.status).toBe(200);

      // Both operations should have succeeded and created valid data
      expect(jobResponse.body.jobDescription.id).toBeTruthy();
      expect(resumeResponse.body.resume.id).toBeTruthy();
    });
  });

  // Helper functions
  function createValidPDF(content: string): Buffer {
    return Buffer.from(`%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length ${content.length + 20}
>>
stream
BT
/F1 12 Tf
72 720 Td
(${content.replace(/\n/g, ') Tj\\n72 700 Td\\n(')}) Tj
ET
endstream
endobj
xref
0 5
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
${400 + content.length}
%%EOF`);
  }

  function createValidDOCX(content: string): Buffer {
    // Simplified DOCX structure
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${content}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;
    
    // This is a simplified representation - real DOCX is a complex ZIP structure
    return Buffer.concat([
      Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00'),
      Buffer.from(xmlContent),
      Buffer.from('PK\x05\x06\x00\x00\x00\x00\x01\x00\x01\x00')
    ]);
  }

  async function cleanupTestData(): Promise<void> {
    // Clean up created test data
    for (const job of testData.jobs) {
      try {
        await request(app)
          .delete(buildRoute(API_ROUTES.JOBS.DELETE, { id: job.id }))
          .set('Authorization', `Bearer ${authToken}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
});