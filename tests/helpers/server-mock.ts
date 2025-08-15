/**
 * Server Mock for Integration Tests
 * Creates a lightweight Express app with all dependencies mocked
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { jest } from '@jest/globals';
import { mockDatabase, setupDatabaseMock } from './database-mock';

// Mock authentication middleware
export function mockAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  // Add mock user to request based on authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    
    try {
      // Simple JWT-like parsing for testing
      const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64').toString());
      (req as any).user = {
        uid: payload.uid,
        email: payload.email,
        emailVerified: payload.email_verified || true,
      };
      next();
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token',
        message: 'Authentication failed' 
      });
    }
  } else {
    return res.status(401).json({ 
      success: false, 
      error: 'No authorization header',
      message: 'Authentication required' 
    });
  }
}

// Mock Firebase admin
export const mockFirebaseAdmin = {
  auth: () => ({
    verifyIdToken: jest.fn().mockImplementation(async (token: string) => {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64').toString());
        return {
          uid: payload.uid,
          email: payload.email,
          email_verified: payload.email_verified || true,
        };
      } catch (error) {
        throw new Error('Invalid token');
      }
    }),
  }),
};

// Mock AI providers
export const mockAIProviders = {
  analyzeResume: jest.fn().mockResolvedValue({
    name: 'John Doe',
    skills: ['JavaScript', 'React', 'Node.js'],
    experience: ['3 years as Software Developer'],
    education: ['BS Computer Science'],
    contact: { email: 'john@example.com', phone: '555-0123', location: 'San Francisco' },
    analyzedData: {
      name: 'John Doe',
      skills: ['JavaScript', 'React', 'Node.js'],
      experience: ['3 years as Software Developer'],
      education: ['BS Computer Science'],
      contact: { email: 'john@example.com', phone: '555-0123', location: 'San Francisco' },
      summary: 'Experienced software developer',
      keyStrengths: ['JavaScript', 'React', 'Node.js'],
    }
  }),
  analyzeJobDescription: jest.fn().mockResolvedValue({
    requiredSkills: ['JavaScript', 'React'],
    preferredSkills: ['Node.js', 'TypeScript'],
    experienceLevel: '2-5 years',
    responsibilities: ['Develop web applications', 'Collaborate with team'],
    summary: 'Looking for a skilled frontend developer',
    analyzedData: {
      requiredSkills: ['JavaScript', 'React'],
      preferredSkills: ['Node.js', 'TypeScript'],
      experienceLevel: '2-5 years',
      responsibilities: ['Develop web applications', 'Collaborate with team'],
      summary: 'Looking for a skilled frontend developer',
      benefits: [],
      qualifications: [],
      companyInfo: { name: 'Test Company', size: 'medium', industry: 'Technology' },
      location: 'Remote'
    }
  }),
  analyzeMatch: jest.fn().mockResolvedValue({
    matchPercentage: 85,
    matchedSkills: ['JavaScript', 'React'],
    missingSkills: ['TypeScript'],
    candidateStrengths: ['Strong JavaScript skills', 'React experience'],
    candidateWeaknesses: ['Limited TypeScript experience'],
    recommendations: ['Consider learning TypeScript'],
    confidenceLevel: 'high',
  }),
  analyzeBias: jest.fn().mockResolvedValue({
    overallBiasScore: 0.2,
    biasAnalysis: {
      languageBias: { score: 0.1, issues: [] },
      genderBias: { score: 0.1, issues: [] },
      ageBias: { score: 0.2, issues: ['Terms like "energetic" may indicate age bias'] },
      culturalBias: { score: 0.1, issues: [] },
    },
    recommendations: ['Consider replacing "energetic" with more neutral language'],
  }),
} as any;

// Mock rate limiter with per-endpoint limits
const rateLimitCounters = new Map<string, number>();

export function mockRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip}_${req.path}_${req.method}`;
  const count = rateLimitCounters.get(key) || 0;
  rateLimitCounters.set(key, count + 1);
  
  // Different limits for different endpoints
  let limit = 30; // default
  if (req.path.includes('/validate')) limit = 30;
  if (req.path.includes('/claim')) limit = 3;
  if (req.path.includes('/cleanup')) limit = 10;
  if (req.method === 'DELETE') limit = 5;
  
  if (count > limit) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Rate limit exceeded'
    });
  }
  
  next();
}

// Create mock server with all necessary routes
export function createMockServer(): Express {
  const app = express();
  
  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  
  // Health check route (before auth middleware)
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0-test',
      environment: 'test'
    });
  });
  
  // Mock authentication middleware for all /api routes except health
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      return next();
    }
    return mockAuthMiddleware(req, res, next);
  });
  
  // Resumes routes
  app.get('/api/resumes', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { sessionId, batchId } = req.query;
      
      let resumes = mockDatabase.findResumesByUser(user.uid);
      
      if (sessionId) {
        resumes = resumes.filter(r => r.sessionId === sessionId);
      }
      
      if (batchId) {
        resumes = resumes.filter(r => r.batchId === batchId);
      }
      
      res.json({
        status: 'success',
        data: { resumes }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.post('/api/resumes', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { filename, content, sessionId, batchId } = req.body;
      
      const resume = mockDatabase.createResume({
        userId: user.uid,
        filename,
        content,
        sessionId,
        batchId,
      });
      
      res.json({
        status: 'success',
        data: resume
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error', 
        message: (error as Error).message
      });
    }
  });
  
  app.get('/api/resumes/:id', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      
      const resumeId = parseInt(id);
      if (isNaN(resumeId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid resume ID',
          message: 'Resume ID must be a number'
        });
      }
      
      const resumes = mockDatabase.findResumesByUser(user.uid);
      const resume = resumes.find(r => r.id === resumeId);
      
      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found',
          message: 'Resume not found'
        });
      }
      
      res.json({
        status: 'success',
        data: resume
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  // Job descriptions routes
  app.get('/api/job-descriptions', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      
      res.json({
        status: 'success',
        data: { jobDescriptions }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.post('/api/job-descriptions', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { title, description, requirements, skills, experience } = req.body;
      
      const jobDescription = mockDatabase.createJobDescription({
        userId: user.uid,
        title,
        description,
        requirements,
        skills,
        experience,
      });
      
      res.json({
        status: 'success',
        data: jobDescription
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.get('/api/job-descriptions/:id', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      
      const jobId = parseInt(id);
      if (isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job ID',
          message: 'Job ID must be a number'
        });
      }
      
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      const jobDescription = jobDescriptions.find(jd => jd.id === jobId);
      
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found',
          message: 'Job description not found'
        });
      }
      
      res.json({
        status: 'success',
        data: jobDescription
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  // Analysis routes
  app.post('/api/analysis/analyze/:jobId', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { jobId } = req.params;
      const { resumeIds, sessionId, batchId } = req.body;
      
      const jobIdNum = parseInt(jobId);
      if (isNaN(jobIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job ID',
          message: 'Job ID must be a number'
        });
      }
      
      // Check if job exists and belongs to user
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      const jobDescription = jobDescriptions.find(jd => jd.id === jobIdNum);
      
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found',
          message: 'Job description not found'
        });
      }
      
      // Get resumes to analyze
      let resumes = mockDatabase.findResumesByUser(user.uid);
      
      if (resumeIds && Array.isArray(resumeIds)) {
        resumes = resumes.filter(r => resumeIds.includes(r.id));
      } else if (sessionId) {
        resumes = resumes.filter(r => r.sessionId === sessionId);
      } else if (batchId) {
        resumes = resumes.filter(r => r.batchId === batchId);
      }
      
      if (resumes.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No resumes found',
          message: 'No resumes found'
        });
      }
      
      // Create analysis results
      const results = resumes.map(resume => {
        const analysis = mockDatabase.createAnalysisResult({
          userId: user.uid,
          resumeId: resume.id,
          jobDescriptionId: jobIdNum,
        });
        
        return {
          resumeId: resume.id,
          filename: resume.filename,
          match: {
            matchPercentage: analysis.matchPercentage,
            matchedSkills: analysis.matchedSkills,
            missingSkills: analysis.missingSkills,
            candidateStrengths: analysis.candidateStrengths,
            candidateWeaknesses: analysis.candidateWeaknesses,
          }
        };
      });
      
      res.json({
        status: 'success',
        data: {
          results,
          metadata: {
            totalResumes: resumes.length,
            analyzedAt: new Date().toISOString(),
            jobId: jobIdNum,
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.get('/api/analysis/analyze/:jobId', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { jobId } = req.params;
      
      const jobIdNum = parseInt(jobId);
      if (isNaN(jobIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job ID',
          message: 'Job ID must be a number'
        });
      }
      
      // Check if job exists and belongs to user
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      const jobDescription = jobDescriptions.find(jd => jd.id === jobIdNum);
      
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found',
          message: 'Job description not found'
        });
      }
      
      // Get existing analysis results
      const analysisResults = Array.from(mockDatabase.data.analysisResults.values())
        .filter((ar: any) => ar.jobDescriptionId === jobIdNum && ar.userId === user.uid);
      
      const results = analysisResults.map(analysis => {
        const resume = mockDatabase.data.resumes.get(analysis.resumeId);
        return {
          resumeId: analysis.resumeId,
          filename: resume?.filename || 'Unknown',
          match: {
            matchPercentage: analysis.matchPercentage,
            matchedSkills: analysis.matchedSkills,
            missingSkills: analysis.missingSkills,
            candidateStrengths: analysis.candidateStrengths,
            candidateWeaknesses: analysis.candidateWeaknesses,
          }
        };
      });
      
      res.json({
        status: 'success',
        data: {
          results,
          metadata: {
            totalResults: results.length,
            jobId: jobIdNum,
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.post('/api/analysis/analyze-bias/:jobId', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { jobId } = req.params;
      
      const jobIdNum = parseInt(jobId);
      if (isNaN(jobIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job ID',
          message: 'Job ID must be a number'
        });
      }
      
      // Check if job exists and belongs to user
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      const jobDescription = jobDescriptions.find(jd => jd.id === jobIdNum);
      
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found',
          message: 'Job description not found'
        });
      }
      
      // Mock bias analysis
      const biasAnalysis = await mockAIProviders.analyzeBias(jobDescription.description);
      
      res.json({
        status: 'success',
        data: biasAnalysis
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  // Analysis specific route
  app.get('/api/analysis/analyze/:jobId/:resumeId', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { jobId, resumeId } = req.params;
      
      const jobIdNum = parseInt(jobId);
      const resumeIdNum = parseInt(resumeId);
      
      if (isNaN(jobIdNum) || isNaN(resumeIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format',
          message: 'Job ID and Resume ID must be numbers'
        });
      }
      
      // Check if job exists and belongs to user
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      const jobDescription = jobDescriptions.find(jd => jd.id === jobIdNum);
      
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found',
          message: 'Job description not found'
        });
      }
      
      // Check if resume exists and belongs to user
      const resumes = mockDatabase.findResumesByUser(user.uid);
      const resume = resumes.find(r => r.id === resumeIdNum);
      
      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found',
          message: 'Resume not found'
        });
      }
      
      // Find existing analysis result
      const analysisResults = Array.from(mockDatabase.data.analysisResults.values())
        .filter((ar: any) => ar.jobDescriptionId === jobIdNum && ar.resumeId === resumeIdNum && ar.userId === user.uid);
      
      if (analysisResults.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Analysis not found',
          message: 'Analysis not found'
        });
      }
      
      const analysis = analysisResults[0];
      
      res.json({
        status: 'success',
        data: {
          matchPercentage: analysis.matchPercentage,
          matchedSkills: analysis.matchedSkills,
          missingSkills: analysis.missingSkills,
          candidateStrengths: analysis.candidateStrengths,
          candidateWeaknesses: analysis.candidateWeaknesses,
          confidenceLevel: analysis.confidenceLevel,
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  // Interview Questions routes
  app.post('/api/analysis/interview-questions/:resumeId/:jobId', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { resumeId, jobId } = req.params;
      const { difficulty, questionCount, includeSkillsBasedQuestions, includeBehavioralQuestions } = req.body;
      
      const resumeIdNum = parseInt(resumeId);
      const jobIdNum = parseInt(jobId);
      
      if (isNaN(resumeIdNum) || isNaN(jobIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format',
          message: 'Resume ID and Job ID must be numbers'
        });
      }
      
      // Check if resume exists and belongs to user
      const resumes = mockDatabase.findResumesByUser(user.uid);
      const resume = resumes.find(r => r.id === resumeIdNum);
      
      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found',
          message: 'Resume not found'
        });
      }
      
      // Check if job exists and belongs to user
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      const jobDescription = jobDescriptions.find(jd => jd.id === jobIdNum);
      
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found',
          message: 'Job description not found'
        });
      }
      
      // Generate mock interview questions
      const mockQuestions = [
        {
          id: 1,
          question: 'Can you explain your experience with React and how you\'ve used it in previous projects?',
          type: 'technical',
          difficulty: difficulty || 'medium',
          category: 'frontend',
          relatedSkills: ['React', 'JavaScript'],
          followUpQuestions: ['How do you handle state management in React?', 'What are React hooks and when do you use them?'],
        },
        {
          id: 2,
          question: 'Describe a challenging problem you solved in your previous role and how you approached it.',
          type: 'behavioral',
          difficulty: 'medium',
          category: 'problem-solving',
          relatedSkills: [],
          followUpQuestions: ['What would you do differently if you faced the same problem again?'],
        },
        {
          id: 3,
          question: 'How would you design a scalable REST API for an e-commerce platform?',
          type: 'system-design',
          difficulty: difficulty || 'hard',
          category: 'backend',
          relatedSkills: ['Node.js', 'API Design', 'PostgreSQL'],
          followUpQuestions: ['How would you handle authentication?', 'What caching strategies would you implement?'],
        },
      ];
      
      const filteredQuestions = mockQuestions.slice(0, questionCount || 10);
      
      res.json({
        status: 'success',
        data: {
          questions: filteredQuestions,
          metadata: {
            resumeId: resumeIdNum,
            jobId: jobIdNum,
            difficulty: difficulty || 'medium',
            questionCount: filteredQuestions.length,
            generatedAt: new Date().toISOString(),
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.get('/api/analysis/interview-questions/:resumeId/:jobId', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { resumeId, jobId } = req.params;
      
      const resumeIdNum = parseInt(resumeId);
      const jobIdNum = parseInt(jobId);
      
      if (isNaN(resumeIdNum) || isNaN(jobIdNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ID format',
          message: 'Resume ID and Job ID must be numbers'
        });
      }
      
      // Check ownership
      const resumes = mockDatabase.findResumesByUser(user.uid);
      const resume = resumes.find(r => r.id === resumeIdNum);
      
      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found',
          message: 'Resume not found'
        });
      }
      
      const jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      const jobDescription = jobDescriptions.find(jd => jd.id === jobIdNum);
      
      if (!jobDescription) {
        return res.status(404).json({
          success: false,
          error: 'Job description not found',
          message: 'Job description not found'
        });
      }
      
      // Return mock questions (in real app, these would be retrieved from database)
      const mockQuestions = [
        {
          id: 1,
          question: 'Can you explain your experience with React?',
          type: 'technical',
          difficulty: 'medium',
          category: 'frontend',
          relatedSkills: ['React', 'JavaScript'],
        },
      ];
      
      res.json({
        status: 'success',
        data: {
          questions: mockQuestions,
          metadata: {
            resumeId: resumeIdNum,
            jobId: jobIdNum,
            questionCount: mockQuestions.length,
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  // Batch routes
  app.get('/api/batches/:batchId/status', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { batchId } = req.params;
      const sessionId = req.headers['x-session-id'] as string;
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing session ID',
          message: 'X-Session-ID header is required'
        });
      }
      
      const batch = mockDatabase.findBatch(batchId);
      if (!batch || batch.userId !== user.uid || batch.sessionId !== sessionId) {
        return res.status(403).json({
          success: false,
          error: 'Batch access denied',
          code: 'BATCH_ACCESS_DENIED'
        });
      }
      
      const resumes = mockDatabase.findResumesByBatch(batchId);
      const analysisResults = Array.from(mockDatabase.data.analysisResults.values())
        .filter((ar: any) => resumes.some(r => r.id === ar.resumeId));
      
      // Check for corrupted data
      const hasCorruptedData = resumes.some(r => !r.content || r.content.trim() === '');
      
      mockDatabase.updateBatchAccess(batchId);
      
      res.json({
        status: 'success',
        data: {
          batchId,
          status: hasCorruptedData ? 'corrupted' : 'active',
          resumeCount: resumes.length,
          analysisCount: analysisResults.length,
          canClaim: false,
          integrityStatus: {
            resumesValid: !hasCorruptedData,
            metadataConsistent: true,
            dataCorrupted: hasCorruptedData,
          },
          createdAt: batch.createdAt,
          lastAccessedAt: batch.lastAccessedAt,
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.post('/api/batches/:batchId/claim', mockRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { batchId } = req.params;
      const { sessionId, userId, force } = req.body;
      
      if (!sessionId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'sessionId and userId are required'
        });
      }
      
      // Validate session ID format
      if (!/^session_\d+_[a-zA-Z0-9]+$/.test(sessionId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid session ID format',
          message: 'Session ID must match pattern: session_{timestamp}_{id}'
        });
      }
      
      const batch = mockDatabase.findBatch(batchId);
      if (!batch) {
        return res.status(404).json({
          success: false,
          error: 'Batch not found',
          code: 'BATCH_NOT_FOUND'
        });
      }
      
      // Check if batch can be claimed (or force claim)
      if (!force && batch.userId === user.uid) {
        return res.status(403).json({
          success: false,
          error: 'Cannot claim own batch',
          message: 'Cannot claim own batch'
        });
      }
      
      // Update batch ownership
      batch.userId = userId;
      batch.sessionId = sessionId;
      batch.lastAccessedAt = new Date();
      
      // Update related resumes
      const resumes = mockDatabase.findResumesByBatch(batchId);
      resumes.forEach(resume => {
        resume.userId = userId;
        resume.sessionId = sessionId;
      });
      
      res.json({
        status: 'success',
        data: {
          success: true,
          batchId,
          newSessionId: sessionId,
          resumeCount: resumes.length,
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.delete('/api/batches/:batchId', mockRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { batchId } = req.params;
      const sessionId = req.headers['x-session-id'] as string;
      
      const batch = mockDatabase.findBatch(batchId);
      if (!batch || batch.userId !== user.uid || batch.sessionId !== sessionId) {
        return res.status(403).json({
          success: false,
          error: 'Batch access denied',
          code: 'BATCH_ACCESS_DENIED'
        });
      }
      
      const deletedItems = mockDatabase.deleteBatch(batchId);
      
      res.json({
        status: 'success',
        data: {
          success: true,
          deletedItems
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.get('/api/batches/:batchId/resumes', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { batchId } = req.params;
      const sessionId = req.headers['x-session-id'] as string;
      
      const batch = mockDatabase.findBatch(batchId);
      if (!batch || batch.userId !== user.uid || batch.sessionId !== sessionId) {
        return res.status(403).json({
          success: false,
          error: 'Batch access denied',
          code: 'BATCH_ACCESS_DENIED'
        });
      }
      
      const resumes = mockDatabase.findResumesByBatch(batchId);
      
      const resumesWithAnalysis = resumes.map(resume => {
        const hasAnalysis = Array.from(mockDatabase.data.analysisResults.values())
          .some((ar: any) => ar.resumeId === resume.id);
        
        return {
          id: resume.id,
          filename: resume.filename,
          file_size: resume.fileSize,
          file_type: resume.fileType,
          created_at: resume.createdAt,
          has_analysis: hasAnalysis,
        };
      });
      
      mockDatabase.updateBatchAccess(batchId);
      
      res.json({
        status: 'success',
        data: {
          batchId,
          sessionId,
          resumeCount: resumes.length,
          resumes: resumesWithAnalysis,
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.get('/api/batches/cleanup-candidates', mockRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      // Mock cleanup candidates endpoint
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const candidates = Array.from(mockDatabase.data.batches.values())
        .filter((batch: any) => new Date(batch.lastAccessedAt) < cutoffDate)
        .slice(0, 100) // Limit to 100
        .map((batch: any) => ({
          batchId: batch.batchId,
          sessionId: batch.sessionId,
          resumeCount: batch.resumeCount,
          hoursInactive: Math.floor((Date.now() - new Date(batch.lastAccessedAt).getTime()) / (1000 * 60 * 60)),
        }));
      
      res.json({
        status: 'success',
        data: {
          candidateCount: candidates.length,
          cutoffDate: cutoffDate.toISOString(),
          candidates,
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.get('/api/batches/:batchId/validate', mockRateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { batchId } = req.params;
      const sessionId = req.headers['x-session-id'] as string;
      
      // Validate batch ID format
      if (!/^batch_\d+_[a-zA-Z0-9]+$/.test(batchId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid batch ID format',
          message: 'Batch ID must match pattern: batch_{timestamp}_{id}'
        });
      }
      
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Missing session ID',
          message: 'X-Session-ID header is required'
        });
      }
      
      const batch = mockDatabase.findBatch(batchId);
      if (!batch || batch.userId !== user.uid || batch.sessionId !== sessionId) {
        return res.status(403).json({
          success: false,
          error: 'Batch access denied',
          code: 'BATCH_ACCESS_DENIED'
        });
      }
      
      mockDatabase.updateBatchAccess(batchId);
      
      res.json({
        status: 'success',
        data: {
          valid: true,
          batchId,
          ownership: {
            userId: user.uid,
            sessionId,
          },
          integrityChecks: {
            resumesValid: true,
            metadataConsistent: true,
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  return app;
}

// Setup all mocks
export function setupServerMocks() {
  setupDatabaseMock();
  
  // Mock Firebase admin
  jest.doMock('firebase-admin', () => mockFirebaseAdmin);
  
  // Mock AI providers
  jest.doMock('../../server/lib/anthropic', () => mockAIProviders);
  jest.doMock('../../server/lib/openai', () => mockAIProviders);
  jest.doMock('../../server/lib/groq', () => mockAIProviders);
  
  console.log('✅ Server mocks configured for integration tests');
}

// Cleanup all mocks
export function cleanupServerMocks() {
  mockDatabase.reset();
  jest.clearAllMocks();
  console.log('✅ Server mocks cleaned up');
}