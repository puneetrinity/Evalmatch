/**
 * Simplified Test Server for E2E Testing
 * 
 * This test server bypasses problematic server dependencies by mocking
 * the complex database and configuration systems. It provides a minimal
 * Express app with mocked API endpoints for testing purposes.
 */

import express from "express";
import cors from "cors";
import { API_ROUTES } from "../shared/api-contracts";

interface MockData {
  jobs: Array<{ id: number; title: string; description: string; createdAt: string }>;
  resumes: Array<{ id: number; filename: string; content?: string; createdAt: string }>;
  analyses: Array<{ 
    id: number; 
    jobId: number; 
    resumeId: number; 
    matchPercentage: number; 
    matchedSkills: string[]; 
    missingSkills: string[];
    candidateStrengths: string[];
    candidateWeaknesses: string[];
    recommendations: string[];
    createdAt: string;
  }>;
  interviewQuestions: Array<{
    id: number;
    resumeId: number;
    jobId: number;
    questions: Array<{
      question: string;
      category: string;
      difficulty: string;
      expectedAnswer: string;
    }>;
    createdAt: string;
  }>;
}

let appInstance: express.Application | null = null;
let nextId = 1;

// Mock data storage
const mockData: MockData = {
  jobs: [],
  resumes: [],
  analyses: [],
  interviewQuestions: []
};

export async function createSimpleTestApp(): Promise<express.Application> {
  if (appInstance) {
    return appInstance;
  }

  const app = express();

  // Basic middleware
  app.use(cors({
    origin: true,
    credentials: true
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Mock Job Description endpoints
  app.post(API_ROUTES.JOBS.CREATE, (req, res) => {
    const { title, description } = req.body;
    const job = {
      id: nextId++,
      title,
      description,
      createdAt: new Date().toISOString()
    };
    mockData.jobs.push(job);
    
    res.json({
      status: 'success',
      jobDescription: job
    });
  });

  app.get(API_ROUTES.JOBS.GET_BY_ID.replace(':id', ':id'), (req, res) => {
    const id = parseInt(req.params.id);
    const job = mockData.jobs.find(j => j.id === id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  });

  app.delete(API_ROUTES.JOBS.DELETE.replace(':id', ':id'), (req, res) => {
    const id = parseInt(req.params.id);
    const index = mockData.jobs.findIndex(j => j.id === id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    mockData.jobs.splice(index, 1);
    res.json({ status: 'success' });
  });

  // Mock Resume endpoints
  app.post(API_ROUTES.RESUMES.UPLOAD, (req, res) => {
    // For multipart/form-data, we would normally use multer
    // For testing, we'll accept the content in the request body
    const filename = req.body.filename || 'test-resume.txt';
    const content = req.body.content;
    
    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: 'Resume content cannot be empty'
      });
    }
    
    const resume = {
      id: nextId++,
      filename,
      content,
      createdAt: new Date().toISOString()
    };
    mockData.resumes.push(resume);
    
    res.json({
      status: 'success',
      resume
    });
  });

  app.get(API_ROUTES.RESUMES.GET_BY_ID.replace(':id', ':id'), (req, res) => {
    const id = parseInt(req.params.id);
    const resume = mockData.resumes.find(r => r.id === id);
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }
    
    res.json(resume);
  });

  // Mock Analysis endpoints
  app.post(API_ROUTES.ANALYSIS.ANALYZE_BIAS.replace(':jobId', ':jobId'), (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const job = mockData.jobs.find(j => j.id === jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json({
      status: 'success',
      biasAnalysis: {
        hasBias: false,
        biasConfidenceScore: 0.1,
        potentialBiasAreas: [],
        fairnessAssessment: 'No significant bias detected'
      }
    });
  });

  app.post(API_ROUTES.ANALYSIS.ANALYZE_JOB.replace(':jobId', ':jobId'), (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const job = mockData.jobs.find(j => j.id === jobId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Create mock analysis results for all resumes
    const results = mockData.resumes.map(resume => {
      const analysis = {
        resumeId: resume.id,
        filename: resume.filename,
        candidateName: 'Test Candidate',
        matchPercentage: Math.floor(Math.random() * 40) + 60, // 60-100%
        matchedSkills: [
          { skill: 'React', matchPercentage: 95 },
          { skill: 'TypeScript', matchPercentage: 90 },
          { skill: 'JavaScript', matchPercentage: 100 }
        ],
        missingSkills: ['Docker', 'AWS'],
        candidateStrengths: [
          'Strong React experience',
          'Good TypeScript skills',
          'Solid JavaScript foundation'
        ],
        candidateWeaknesses: [
          'Limited cloud experience',
          'No DevOps background'
        ],
        recommendations: [
          'Consider for technical interview',
          'Assess cloud platform knowledge',
          'Strong frontend candidate'
        ],
        confidenceLevel: 'high' as const
      };

      // Store the analysis
      mockData.analyses.push({
        id: nextId++,
        jobId,
        resumeId: resume.id,
        matchPercentage: analysis.matchPercentage,
        matchedSkills: analysis.matchedSkills.map(s => s.skill),
        missingSkills: analysis.missingSkills,
        candidateStrengths: analysis.candidateStrengths,
        candidateWeaknesses: analysis.candidateWeaknesses,
        recommendations: analysis.recommendations,
        createdAt: new Date().toISOString()
      });

      return analysis;
    });
    
    res.json({
      status: 'success',
      results
    });
  });

  app.get(API_ROUTES.ANALYSIS.GET_ANALYSIS.replace(':jobId', ':jobId'), (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const analyses = mockData.analyses.filter(a => a.jobId === jobId);
    
    res.json({
      status: 'success',
      results: analyses
    });
  });

  app.get(API_ROUTES.ANALYSIS.GET_ANALYSIS_BY_RESUME.replace(':jobId', ':jobId').replace(':resumeId', ':resumeId'), (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const resumeId = parseInt(req.params.resumeId);
    const analysis = mockData.analyses.find(a => a.jobId === jobId && a.resumeId === resumeId);
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    res.json(analysis);
  });

  app.post(API_ROUTES.ANALYSIS.GENERATE_INTERVIEW.replace(':resumeId', ':resumeId').replace(':jobId', ':jobId'), (req, res) => {
    const resumeId = parseInt(req.params.resumeId);
    const jobId = parseInt(req.params.jobId);
    
    const resume = mockData.resumes.find(r => r.id === resumeId);
    const job = mockData.jobs.find(j => j.id === jobId);
    
    if (!resume || !job) {
      return res.status(404).json({ error: 'Resume or job not found' });
    }

    const questions = [
      {
        question: 'Can you explain your experience with React and how you have used it in previous projects?',
        category: 'technical',
        difficulty: 'medium',
        expectedAnswer: 'Should demonstrate understanding of React concepts like components, hooks, state management, and provide specific examples from their experience.'
      },
      {
        question: 'How do you handle state management in large React applications?',
        category: 'technical',
        difficulty: 'hard',
        expectedAnswer: 'Should mention tools like Redux, Context API, or other state management solutions and explain when to use each.'
      },
      {
        question: 'Describe a challenging project you worked on and how you overcame obstacles.',
        category: 'behavioral',
        difficulty: 'medium',
        expectedAnswer: 'Should provide specific examples demonstrating problem-solving skills and resilience.'
      }
    ];

    const interviewQuestions = {
      id: nextId++,
      resumeId,
      jobId,
      questions,
      createdAt: new Date().toISOString()
    };

    mockData.interviewQuestions.push(interviewQuestions);
    
    res.json({
      status: 'success',
      questions
    });
  });

  // Error handling for missing endpoints
  app.use((req, res) => {
    res.status(404).json({ 
      error: 'Endpoint not found',
      path: req.path,
      method: req.method 
    });
  });

  // Global error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Test server error:', err);
    res.status(500).json({ 
      error: 'Internal server error',
      message: err.message 
    });
  });

  appInstance = app;
  return app;
}

export function clearSimpleTestApp(): void {
  appInstance = null;
  // Clear mock data
  mockData.jobs.length = 0;
  mockData.resumes.length = 0;
  mockData.analyses.length = 0;
  mockData.interviewQuestions.length = 0;
  nextId = 1;
}

export function getMockData(): MockData {
  return mockData;
}