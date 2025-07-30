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
          explanation: 'No bias detected',
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
        experience: [
          { title: 'Developer', company: 'Test Company', duration: '2 years' }
        ],
        education: [
          { degree: 'BS Computer Science', institution: 'Test University' }
        ]
      },
      sessionId: 'test-session',
      created: new Date()
    }
  ];

  private analysisResults: AnalysisResult[] = [
    {
      id: 1,
      resumeId: 1,
      jobDescriptionId: 1,
      matchPercentage: 80,
      matchedSkills: [
        { skill: 'JavaScript', matchPercentage: 100 },
        { skill: 'TypeScript', matchPercentage: 100 }
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
    return { id: 1, ...user };
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
    const newResume = {
      id: this.resumes.length + 1,
      created: new Date(),
      ...resume
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
    const newJobDescription = {
      id: this.jobDescriptions.length + 1,
      created: new Date(),
      ...jobDescription
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
    const newAnalysisResult = {
      id: this.analysisResults.length + 1,
      created: new Date(),
      ...analysisResult
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
    const newInterviewQuestions = {
      id: this.interviewQuestions.length + 1,
      created: new Date(),
      ...interviewQuestions
    };
    this.interviewQuestions.push(newInterviewQuestions);
    return newInterviewQuestions;
  }
  
  async getResumeWithLatestAnalysisAndQuestions(resumeId: number, jobDescriptionId: number): Promise<{ resume: Resume; analysis: AnalysisResult | undefined; interviewQuestions: InterviewQuestions | undefined; }> {
    const resume = await this.getResume(resumeId);
    const analysis = this.analysisResults.find(ar => ar.resumeId === resumeId && ar.jobDescriptionId === jobDescriptionId);
    const questions = this.interviewQuestions.find(iq => iq.resumeId === resumeId && iq.jobDescriptionId === jobDescriptionId);
    
    return {
      resume: resume!,
      analysis,
      interviewQuestions: questions
    };
  }
}

describe('API Routes', () => {
  let app: Express;
  let mockStorage: MockStorage;
  let server: import('http').Server;

  beforeAll(async () => {
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

  it('should get health status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
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