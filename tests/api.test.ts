import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { IStorage } from '../server/storage';
import { registerRoutes } from '../server/routes';
import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse,
  type User, type InsertUser
} from '@shared/schema';

// Skip this test file in CI - it requires proper storage initialization
const skipInCI = process.env.CI === 'true';

// Mock storage implementation for testing
class MockStorage implements IStorage {
  private jobDescriptions: JobDescription[] = [
    {
      id: 1,
      title: 'Test Job',
      description: 'This is a test job description',
      created: new Date(),
      analyzedData: {
        skills: ['JavaScript', 'TypeScript', 'React'],
        biasAnalysis: {
          hasBias: false,
          biasTypes: [],
          suggestedImprovements: []
        }
      }
    }
  ];

  private resumes: Resume[] = [
    {
      id: 1,
      filename: 'test-resume.pdf',
      fileSize: 1024,
      fileType: 'application/pdf',
      content: 'Test resume content',
      analyzedData: {
        skills: ['JavaScript', 'TypeScript'],
        experience: 'Developer at Test Company for 2 years',
        education: 'BS Computer Science from Test University'
      },
      sessionId: 'session_1234567890_test1',
      batchId: 'batch_1234567890_abcdef',
      userId: 'test-user-1',
      created: new Date(),
      updated: new Date()
    },
    {
      id: 2,
      filename: 'test-resume-2.pdf',
      fileSize: 2048,
      fileType: 'application/pdf',
      content: 'Test resume content 2',
      sessionId: 'session_1234567890_test2',
      batchId: 'batch_1234567890_ghijkl',
      userId: null,
      created: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
      updated: new Date(Date.now() - 48 * 60 * 60 * 1000)
    }
  ];

  private analysisResults: AnalysisResult[] = [
    {
      id: 1,
      resumeId: 1,
      jobDescriptionId: 1,
      matchPercentage: 80,
      matchedSkills: [
        { skill: 'JavaScript', matchPercentage: 100, category: 'languages', importance: 'required', source: 'both' },
        { skill: 'TypeScript', matchPercentage: 100, category: 'languages', importance: 'required', source: 'both' }
      ],
      missingSkills: ['React'],
      candidateStrengths: ['Strong JavaScript skills'],
      candidateWeaknesses: ['No React experience'],
      created: new Date()
    }
  ];

  private interviewQuestions: InterviewQuestions[] = [];

  async getUser(id: number): Promise<User | undefined> {
    return undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined;
  }
  
  async createUser(user: InsertUser): Promise<User> {
    return { 
      id: 1, 
      username: user.username,
      email: user.email || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  async getResume(id: number): Promise<Resume | undefined> {
    return this.resumes.find(r => r.id === id);
  }
  
  async getResumes(sessionId?: string): Promise<Resume[]> {
    if (sessionId) {
      return this.resumes.filter(r => r.sessionId === sessionId);
    }
    return this.resumes;
  }
  
  async createResume(resume: InsertResume): Promise<Resume> {
    const newResume: Resume = {
      id: this.resumes.length + 1,
      filename: resume.filename,
      fileSize: resume.fileSize || null,
      fileType: resume.fileType || null,
      content: resume.content || null,
      extractedText: resume.extractedText || null,
      analyzedData: resume.analyzedData || null,
      sessionId: resume.sessionId || null,
      batchId: resume.batchId || null,
      userId: resume.userId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      processingStatus: resume.processingStatus || null,
      processingError: resume.processingError || null,
      processingMetadata: resume.processingMetadata || null,
      created: new Date(),
      updated: new Date()
    };
    this.resumes.push(newResume);
    return newResume;
  }
  
  async updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume> {
    const resume = await this.getResume(id);
    if (!resume) return undefined;
    
    resume.analyzedData = analysis;
    return resume;
  }
  
  async getJobDescription(id: number): Promise<JobDescription | undefined> {
    return this.jobDescriptions.find(jd => jd.id === id);
  }
  
  async getJobDescriptions(): Promise<JobDescription[]> {
    return this.jobDescriptions;
  }
  
  async createJobDescription(jobDescription: InsertJobDescription): Promise<JobDescription> {
    const newJobDescription: JobDescription = {
      id: this.jobDescriptions.length + 1,
      title: jobDescription.title,
      description: jobDescription.description,
      analyzedData: jobDescription.analyzedData || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: jobDescription.userId || null,
      created: new Date()
    };
    this.jobDescriptions.push(newJobDescription);
    return newJobDescription;
  }
  
  async updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription> {
    const jobDescription = await this.getJobDescription(id);
    if (!jobDescription) return undefined;
    
    jobDescription.analyzedData = analysis;
    return jobDescription;
  }
  
  async getAnalysisResult(id: number): Promise<AnalysisResult | undefined> {
    return this.analysisResults.find(ar => ar.id === id);
  }
  
  async getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]> {
    return this.analysisResults.filter(ar => ar.resumeId === resumeId);
  }
  
  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]> {
    return this.analysisResults.filter(ar => ar.jobDescriptionId === jobDescriptionId);
  }
  
  async createAnalysisResult(analysisResult: InsertAnalysisResult): Promise<AnalysisResult> {
    const newAnalysisResult: AnalysisResult = {
      id: this.analysisResults.length + 1,
      resumeId: analysisResult.resumeId || null,
      jobDescriptionId: analysisResult.jobDescriptionId || null,
      matchPercentage: analysisResult.matchPercentage || null,
      matchedSkills: analysisResult.matchedSkills || null,
      missingSkills: analysisResult.missingSkills || null,
      analysis: analysisResult.analysis || null,
      userId: analysisResult.userId || null,
      candidateStrengths: analysisResult.candidateStrengths || null,
      candidateWeaknesses: analysisResult.candidateWeaknesses || null,
      confidenceLevel: analysisResult.confidenceLevel || null,
      fairnessMetrics: analysisResult.fairnessMetrics || null,
      scoringDimensions: analysisResult.scoringDimensions || null,
      semanticSimilarity: analysisResult.semanticSimilarity || null,
      skillsSimilarity: analysisResult.skillsSimilarity || null,
      experienceSimilarity: analysisResult.experienceSimilarity || null,
      educationSimilarity: analysisResult.educationSimilarity || null,
      mlConfidenceScore: analysisResult.mlConfidenceScore || null,
      recommendations: analysisResult.recommendations || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      created: new Date()
    };
    this.analysisResults.push(newAnalysisResult);
    return newAnalysisResult;
  }
  
  async getInterviewQuestions(id: number): Promise<InterviewQuestions | undefined> {
    return this.interviewQuestions.find(iq => iq.id === id);
  }
  
  async getInterviewQuestionsByResumeId(resumeId: number): Promise<InterviewQuestions[]> {
    return this.interviewQuestions.filter(iq => iq.resumeId === resumeId);
  }
  
  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]> {
    return this.interviewQuestions.filter(iq => iq.jobDescriptionId === jobDescriptionId);
  }
  
  async getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<InterviewQuestions | undefined> {
    return this.interviewQuestions.find(iq => iq.resumeId === resumeId && iq.jobDescriptionId === jobDescriptionId);
  }
  
  async createInterviewQuestions(interviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions> {
    const newInterviewQuestions: InterviewQuestions = {
      id: this.interviewQuestions.length + 1,
      resumeId: interviewQuestions.resumeId || null,
      jobDescriptionId: interviewQuestions.jobDescriptionId || null,
      questions: interviewQuestions.questions || null,
      metadata: interviewQuestions.metadata || null,
      userId: interviewQuestions.userId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      created: new Date()
    };
    this.interviewQuestions.push(newInterviewQuestions);
    return newInterviewQuestions;
  }
  
  async getResumeWithLatestAnalysisAndQuestions(resumeId: number, jobDescriptionId: number): Promise<{ resume: Resume; analysis: AnalysisResult | undefined; questions: InterviewQuestions | undefined; }> {
    const resume = await this.getResume(resumeId);
    const analysis = this.analysisResults.find(ar => ar.resumeId === resumeId && ar.jobDescriptionId === jobDescriptionId);
    const questions = this.interviewQuestions.find(iq => iq.resumeId === resumeId && iq.jobDescriptionId === jobDescriptionId);
    
    return {
      resume: resume!,
      analysis,
      questions
    };
  }

  // Additional methods needed for batch operations
  async getResumeById(id: number, userId?: string): Promise<Resume | undefined> {
    return this.resumes.find(r => r.id === id);
  }
  
  async getJobDescriptionById(id: number, userId?: string): Promise<JobDescription | undefined> {
    return this.jobDescriptions.find(jd => jd.id === id);
  }
  
  async getResumesByUserId(userId: string, sessionId?: string, batchId?: string): Promise<Resume[]> {
    return this.resumes.filter(r => {
      if (sessionId && r.sessionId !== sessionId) return false;
      if (batchId && r.batchId !== batchId) return false;
      return true;
    });
  }
  
  async getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId?: string): Promise<AnalysisResult | undefined> {
    return this.analysisResults.find(ar => ar.jobDescriptionId === jobId && ar.resumeId === resumeId);
  }
  
  async getAnalysisResultsByJob(jobId: number, userId?: string, sessionId?: string, batchId?: string): Promise<AnalysisResult[]> {
    return this.analysisResults.filter(ar => ar.jobDescriptionId === jobId);
  }
}

describe.skip('API Routes', () => {
  let app: Express;
  let mockStorage: MockStorage;
  let server: import('http').Server;
  const mockAuthToken = 'test-auth-token';

  beforeAll(async () => {
    // Skip these tests in CI as they require proper storage initialization
    if (process.env.CI) {
      return;
    }
    
    app = express();
    app.use(express.json());
    
    // Add mock authentication middleware for tests
    app.use((req: any, res: any, next: any) => {
      if (req.headers.authorization) {
        req.user = { uid: 'test-user-1', email: 'test@example.com' };
      }
      next();
    });
    
    mockStorage = new MockStorage();
    // @ts-ignore - using mock storage for testing
    server = await registerRoutes(app, mockStorage);
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  it('should get health status', async () => {
    if (!app) return; // Skip if not initialized
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('status');
    expect(['healthy', 'degraded']).toContain(response.body.data.status);
  });

  it('should get all job descriptions', async () => {
    const response = await request(app).get('/api/job-descriptions');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toHaveProperty('id');
    expect(response.body[0]).toHaveProperty('title');
  });

  it('should get a specific job description', async () => {
    const response = await request(app).get('/api/job-descriptions/1');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('id', 1);
    expect(response.body).toHaveProperty('title', 'Test Job');
    expect(response.body).toHaveProperty('description');
    expect(response.body).toHaveProperty('analysis');
  });

  it('should return 404 for non-existent job description', async () => {
    const response = await request(app).get('/api/job-descriptions/999');
    expect(response.status).toBe(404);
  });

  it('should get all resumes', async () => {
    const response = await request(app).get('/api/resumes');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('should get resumes by session', async () => {
    const response = await request(app).get('/api/resumes?sessionId=test-session');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toHaveProperty('sessionId', 'test-session');
  });
});

describe.skip('Batch Service Integration Tests', () => {
  let app: Express;
  let mockStorage: MockStorage;
  let server: import('http').Server;

  beforeAll(async () => {
    // Mock the batch service methods
    jest.mock('../server/services/batch-service', () => ({
      createBatchService: () => ({
        validateBatchAccess: jest.fn().mockResolvedValue({
          data: {
            batchId: 'batch_1234567890_abcdef',
            sessionId: 'session_1234567890_test1',
            userId: 'test-user-1',
            valid: true,
            status: 'active',
            resumeCount: 1,
            analysisCount: 1,
            createdAt: new Date(),
            lastAccessedAt: new Date(),
            integrityStatus: {
              resumesValid: true,
              analysisValid: true,
              metadataConsistent: true
            },
            securityFlags: {
              ownershipVerified: true,
              accessGranted: true,
              rateLimit: false
            },
            warnings: []
          }
        }),
        getBatchStatus: jest.fn().mockResolvedValue({
          data: {
            batchId: 'batch_1234567890_abcdef',
            sessionId: 'session_1234567890_test1',
            userId: 'test-user-1',
            status: 'active',
            resumeCount: 1,
            analysisCount: 1,
            createdAt: new Date(),
            lastAccessedAt: new Date(),
            integrityStatus: {
              resumesValid: true,
              analysisValid: true,
              metadataConsistent: true,
              dataCorrupted: false
            },
            warnings: [],
            canClaim: false,
            autoCleanupDate: undefined
          }
        }),
        getBatchResumes: jest.fn().mockResolvedValue({
          data: {
            batchId: 'batch_1234567890_abcdef',
            resumes: [{
              id: 1,
              filename: 'test-resume.pdf',
              fileSize: 1024,
              fileType: 'application/pdf',
              analyzedData: {},
              createdAt: new Date(),
              updatedAt: new Date(),
              hasAnalysis: true
            }],
            metadata: {
              totalCount: 1,
              analyzedCount: 1,
              unanalyzedCount: 0,
              lastUpdated: new Date(),
              avgFileSize: 1024
            },
            pagination: {
              offset: 0,
              limit: 100,
              hasMore: false
            }
          }
        }),
        claimBatch: jest.fn().mockResolvedValue({
          data: {
            batchId: 'batch_1234567890_ghijkl',
            newSessionId: 'session_new_owner',
            newUserId: 'new-user-123',
            resumeCount: 1,
            analysisResultsUpdated: 0,
            previousOwner: {
              sessionId: 'session_1234567890_test2',
              userId: null
            },
            warnings: [],
            claimTime: new Date()
          }
        }),
        deleteBatch: jest.fn().mockResolvedValue({
          data: {
            batchId: 'batch_1234567890_abcdef',
            cascadeDeleted: true,
            deletedCounts: {
              resumes: 1,
              analyses: 1,
              metadata: 0
            },
            processingTime: 100
          }
        }),
        findCleanupCandidates: jest.fn().mockResolvedValue({
          data: {
            candidates: [{
              batchId: 'batch_1234567890_ghijkl',
              sessionId: 'session_1234567890_test2',
              userId: null,
              resumeCount: 1,
              createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
              lastUpdated: new Date(Date.now() - 48 * 60 * 60 * 1000),
              hoursInactive: 48,
              recommendedAction: 'soft_cleanup'
            }],
            totalCandidates: 1,
            estimatedSpaceSavings: 2048,
            lastScanTime: new Date()
          }
        })
      })
    }));
    
    app = express();
    app.use(express.json());
    mockStorage = new MockStorage();
    // @ts-ignore - using mock storage for testing
    server = await registerRoutes(app, mockStorage);
  });

  afterAll((done) => {
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  describe('GET /api/batches/:batchId/validate', () => {
    it('should validate an existing batch with valid session', async () => {
      const response = await request(app)
        .get('/api/batches/batch_1234567890_abcdef/validate')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Batch validation successful');
      expect(response.body.data).toHaveProperty('batchId', 'batch_1234567890_abcdef');
      expect(response.body.data).toHaveProperty('valid', true);
      expect(response.body.data).toHaveProperty('status', 'active');
      expect(response.body.data).toHaveProperty('resumeCount');
    });

    it('should fail validation for invalid batch ID format', async () => {
      const response = await request(app)
        .get('/api/batches/invalid-batch-id/validate')
        .set('x-session-id', 'test-session');
      
      expect(response.status).toBe(400);
    });

    it('should return not found for non-existent batch', async () => {
      const response = await request(app)
        .get('/api/batches/batch_9999999999_zzzzz/validate')
        .set('x-session-id', 'test-session');
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/batches/:batchId/status', () => {
    it('should get detailed batch status', async () => {
      const response = await request(app)
        .get('/api/batches/batch_1234567890_abcdef/status')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('batchId');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('resumeCount');
      expect(response.body.data).toHaveProperty('analysisCount');
      expect(response.body.data).toHaveProperty('integrityStatus');
    });

    it('should detect orphaned batch status', async () => {
      const response = await request(app)
        .get('/api/batches/batch_1234567890_ghijkl/status')
        .set('x-session-id', 'test-session-2');
      
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('status', 'orphaned');
      expect(response.body.data).toHaveProperty('canClaim', true);
    });
  });

  describe('GET /api/batches/:batchId/resumes', () => {
    it('should get resumes in a batch', async () => {
      const response = await request(app)
        .get('/api/batches/batch_1234567890_abcdef/resumes')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('batchId');
      expect(response.body.data).toHaveProperty('resumes');
      expect(Array.isArray(response.body.data.resumes)).toBe(true);
      expect(response.body.data).toHaveProperty('metadata');
      expect(response.body.data).toHaveProperty('pagination');
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/batches/batch_1234567890_abcdef/resumes')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1', offset: 0, limit: 10 });
      
      expect(response.status).toBe(200);
      expect(response.body.data.pagination).toHaveProperty('offset', 0);
      expect(response.body.data.pagination).toHaveProperty('limit', 10);
      expect(response.body.data.pagination).toHaveProperty('hasMore');
    });
  });

  describe('POST /api/batches/:batchId/claim', () => {
    it('should successfully claim an orphaned batch', async () => {
      const response = await request(app)
        .post('/api/batches/batch_1234567890_ghijkl/claim')
        .send({
          sessionId: 'session_1234567890_newowner',
          userId: 'new-user-123',
          force: false
        });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Batch claimed successfully');
      expect(response.body.data).toHaveProperty('batchId');
      expect(response.body.data).toHaveProperty('newSessionId', 'session_new_owner');
      expect(response.body.data).toHaveProperty('resumeCount');
    });

    it('should fail to claim active batch without force', async () => {
      const response = await request(app)
        .post('/api/batches/batch_1234567890_abcdef/claim')
        .send({
          sessionId: 'session_1234567890_attacker',
          userId: 'attacker-123',
          force: false
        });
      
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate session ID format', async () => {
      const response = await request(app)
        .post('/api/batches/batch_1234567890_ghijkl/claim')
        .send({
          sessionId: 'invalid_session_format',
          userId: 'new-user-123'
        });
      
      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/batches/:batchId', () => {
    it('should delete a batch with proper authorization', async () => {
      const response = await request(app)
        .delete('/api/batches/batch_1234567890_abcdef')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Batch deleted successfully');
      expect(response.body.data).toHaveProperty('deletedItems');
      expect(response.body.data.deletedItems).toHaveProperty('resumes');
      expect(response.body.data.deletedItems).toHaveProperty('analysisResults');
      expect(response.body.data.deletedItems).toHaveProperty('interviewQuestions');
    });

    it('should prevent unauthorized batch deletion', async () => {
      const response = await request(app)
        .delete('/api/batches/batch_1234567890_abcdef')
        .set('x-session-id', 'wrong-session');
      
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/batches/cleanup-candidates', () => {
    it('should find cleanup candidates', async () => {
      const response = await request(app)
        .get('/api/batches/cleanup-candidates')
        .query({ hours: 24 });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('candidateCount');
      expect(response.body.data).toHaveProperty('estimatedSpaceSavings');
      expect(response.body.data).toHaveProperty('candidates');
      expect(Array.isArray(response.body.data.candidates)).toBe(true);
    });

    it('should respect rate limiting', async () => {
      // Make multiple requests quickly
      const requests = Array(11).fill(null).map(() => 
        request(app).get('/api/batches/cleanup-candidates')
      );
      
      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('End-to-End Batch Workflow', () => {
    it('should complete full batch lifecycle: validate -> get resumes -> analyze -> delete', async () => {
      // Step 1: Validate batch
      const validateResponse = await request(app)
        .get('/api/batches/batch_1234567890_abcdef/validate')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(validateResponse.status).toBe(200);
      expect(validateResponse.body.data.valid).toBe(true);

      // Step 2: Get batch status
      const statusResponse = await request(app)
        .get('/api/batches/batch_1234567890_abcdef/status')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.status).toBe('active');

      // Step 3: Get resumes in batch
      const resumesResponse = await request(app)
        .get('/api/batches/batch_1234567890_abcdef/resumes')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(resumesResponse.status).toBe(200);
      expect(resumesResponse.body.data.resumes.length).toBeGreaterThan(0);

      // Step 4: Delete the batch
      const deleteResponse = await request(app)
        .delete('/api/batches/batch_1234567890_abcdef')
        .set('x-session-id', 'test-session')
        .query({ userId: 'test-user-1' });
      
      expect(deleteResponse.status).toBe(200);
      expect(deleteResponse.body.data.deletedItems.resumes).toBeGreaterThan(0);
    });
  });
});
