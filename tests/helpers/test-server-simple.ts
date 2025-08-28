/**
 * Simplified Test Server for Integration Tests
 * This server mocks problematic dependencies and provides a clean testing environment
 */

import express from "express";
import cors from "cors";
import { API_ROUTES } from "../../shared/api-contracts";

interface TestData {
  jobs: Array<{ id: number; title: string; description: string; userId: string; createdAt: string }>;
  resumes: Array<{ id: number; filename: string; content?: string; userId: string; createdAt: string }>;
  analyses: Array<{ 
    id: number; 
    jobId: number; 
    resumeId: number; 
    matchPercentage: number; 
    matchedSkills: any[]; 
    missingSkills: string[];
    candidateStrengths: string[];
    candidateWeaknesses: string[];
    recommendations: string[];
    confidenceLevel: string;
    createdAt: string;
  }>;
  interviewQuestions: Array<{
    id: number;
    resumeId: number;
    jobId: number;
    questions: any[];
    createdAt: string;
  }>;
}

let appInstance: express.Application | null = null;
let nextId = 1;

// Test data storage
const testData: TestData = {
  jobs: [],
  resumes: [],
  analyses: [],
  interviewQuestions: []
};

// Use existing Express Request type from auth middleware
// No need to redeclare - it's already defined in server/middleware/auth.ts

// Mock authentication middleware
const mockAuth = (req: any, res: any, next: any) => {
  // Set mock user for all requests (matching server interface)
  req.user = {
    uid: 'test-user-123',
    email: 'test@example.com',
    emailVerified: true,
    displayName: 'Test User',
    photoURL: undefined
  };
  next();
};

export async function createIntegrationTestApp(): Promise<express.Application> {
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

  // Mock authentication for all routes
  app.use('/api', mockAuth);

  // Health endpoints
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: 'test'
    });
  });

  app.get('/api/health/detailed', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: { status: 'connected', type: 'mock' },
      memory: process.memoryUsage(),
      environment: 'test'
    });
  });

  app.get('/api/migration-status', (req, res) => {
    res.json({
      status: 'up-to-date',
      appliedMigrations: ['test-migration-001'],
      pendingMigrations: []
    });
  });

  // Job Description endpoints
  app.post('/api/job-descriptions', (req, res) => {
    const { title, description, requirements, skills, experience } = req.body;
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }
    
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Title and description are required'
      });
    }

    const job = {
      id: nextId++,
      title,
      description,
      requirements: requirements || [],
      skills: skills || [],
      experience: experience || '',
      userId: req.user.uid,
      createdAt: new Date().toISOString()
    };
    
    testData.jobs.push(job);
    
    res.json({
      status: 'success',
      data: job
    });
  });

  app.get('/api/job-descriptions/:id', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const id = parseInt(req.params.id);
    const user = req.user; // TypeScript assertion after null check
    const job = testData.jobs.find(j => j.id === id && j.userId === user.uid);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        message: 'Job description not found or you don\'t have permission to access it'
      });
    }
    
    res.json({
      status: 'success',
      data: job
    });
  });

  app.patch('/api/job-descriptions/:id', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const id = parseInt(req.params.id);
    const jobIndex = testData.jobs.findIndex(j => j.id === id && j.userId === req.user.uid);
    
    if (jobIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    const updates = req.body;
    testData.jobs[jobIndex] = { ...testData.jobs[jobIndex], ...updates };
    
    res.json({
      status: 'success',
      data: testData.jobs[jobIndex]
    });
  });

  app.delete('/api/job-descriptions/:id', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const id = parseInt(req.params.id);
    const jobIndex = testData.jobs.findIndex(j => j.id === id && j.userId === req.user.uid);
    
    if (jobIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    testData.jobs.splice(jobIndex, 1);
    res.json({ status: 'success' });
  });

  // Resume endpoints
  app.post('/api/resumes', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const { filename, content } = req.body;
    
    if (!filename) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        message: 'Filename is required'
      });
    }

    const resume = {
      id: nextId++,
      filename,
      content: content || '',
      userId: req.user.uid,
      createdAt: new Date().toISOString()
    };
    
    testData.resumes.push(resume);
    
    res.json({
      status: 'success',
      data: { resume }
    });
  });

  app.get('/api/resumes', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const userResumes = testData.resumes.filter(r => r.userId === req.user.uid);
    res.json({
      status: 'success',
      data: { resumes: userResumes }
    });
  });

  app.get('/api/resumes/:id', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const id = parseInt(req.params.id);
    const resume = testData.resumes.find(r => r.id === id && r.userId === req.user.uid);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }
    
    res.json({
      status: 'success',
      data: resume
    });
  });

  // Analysis endpoints
  app.post('/api/analysis/analyze-bias/:jobId', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const jobId = parseInt(req.params.jobId);
    const job = testData.jobs.find(j => j.id === jobId && j.userId === req.user.uid);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      status: 'success',
      data: {
        overallBiasScore: 0.1,
        biasAnalysis: {
          hasBias: false,
          biasConfidenceScore: 0.1,
          potentialBiasAreas: [],
          fairnessAssessment: 'No significant bias detected'
        }
      }
    });
  });

  app.post('/api/analysis/analyze/:jobId', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const jobId = parseInt(req.params.jobId);
    const job = testData.jobs.find(j => j.id === jobId && j.userId === req.user.uid);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    // Create mock analysis results
    const userResumes = testData.resumes.filter(r => r.userId === req.user.uid);
    const results = userResumes.map(resume => {
      const analysis = {
        resumeId: resume.id,
        filename: resume.filename,
        candidateName: 'Test Candidate',
        match: {
          matchPercentage: Math.floor(Math.random() * 40) + 60, // 60-100%
          matchedSkills: [
            { skill: 'JavaScript', matchPercentage: 95 },
            { skill: 'React', matchPercentage: 90 }
          ],
          missingSkills: ['Docker', 'Kubernetes'],
          candidateStrengths: ['Strong JavaScript skills', 'Good React experience'],
          candidateWeaknesses: ['Limited DevOps experience'],
          confidenceLevel: 'high' as const
        }
      };

      // Store the analysis
      testData.analyses.push({
        id: nextId++,
        jobId,
        resumeId: resume.id,
        matchPercentage: analysis.match.matchPercentage,
        matchedSkills: analysis.match.matchedSkills,
        missingSkills: analysis.match.missingSkills,
        candidateStrengths: analysis.match.candidateStrengths,
        candidateWeaknesses: analysis.match.candidateWeaknesses,
        recommendations: ['Consider for technical interview'],
        confidenceLevel: analysis.match.confidenceLevel,
        createdAt: new Date().toISOString()
      });

      return analysis;
    });
    
    res.json({
      status: 'success',
      data: { results }
    });
  });

  app.get('/api/analysis/analyze/:jobId', (req, res) => {
    const jobId = parseInt(req.params.jobId);
    const analyses = testData.analyses.filter(a => a.jobId === jobId);
    
    res.json({
      status: 'success',
      data: { results: analyses }
    });
  });

  app.post('/api/analysis/interview-questions/:resumeId/:jobId', (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    const resumeId = parseInt(req.params.resumeId);
    const jobId = parseInt(req.params.jobId);
    
    const resume = testData.resumes.find(r => r.id === resumeId && r.userId === req.user.uid);
    const job = testData.jobs.find(j => j.id === jobId && j.userId === req.user.uid);
    
    if (!resume || !job) {
      return res.status(404).json({
        success: false,
        error: 'Resume or job not found'
      });
    }

    const questions = [
      {
        question: 'Can you explain your experience with JavaScript?',
        category: 'technical',
        difficulty: 'medium',
        expectedAnswer: 'Should demonstrate understanding of JavaScript fundamentals'
      },
      {
        question: 'Describe a challenging project you worked on.',
        category: 'behavioral',
        difficulty: 'medium',
        expectedAnswer: 'Should provide specific examples of problem-solving'
      }
    ];

    const interviewQuestions = {
      id: nextId++,
      resumeId,
      jobId,
      questions,
      createdAt: new Date().toISOString()
    };

    testData.interviewQuestions.push(interviewQuestions);
    
    res.json({
      status: 'success',
      data: { questions }
    });
  });

  // Handle invalid job IDs
  app.post('/api/analysis/analyze-bias/invalid', (req, res) => {
    res.status(400).json({
      success: false,
      error: 'Invalid job ID',
      message: 'Job ID must be a valid number'
    });
  });

  // Catch-all for unhandled routes
  app.use((req, res) => {
    res.status(404).json({ 
      success: false,
      error: 'Endpoint not found',
      path: req.path,
      method: req.method 
    });
  });

  // Global error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Test server error:', err);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: err.message 
    });
  });

  appInstance = app;
  return app;
}

export function clearIntegrationTestApp(): void {
  appInstance = null;
  // Clear test data
  testData.jobs.length = 0;
  testData.resumes.length = 0;
  testData.analyses.length = 0;
  testData.interviewQuestions.length = 0;
  nextId = 1;
}

export function getIntegrationTestData(): TestData {
  return testData;
}