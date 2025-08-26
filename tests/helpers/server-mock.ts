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
  
  // Check if authorization header is missing
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized',
      message: 'Authentication required' 
    });
  }
  
  // Check if authorization header has Bearer prefix
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid authorization format',
      message: 'Authentication failed' 
    });
  }
  
  const token = authHeader.slice(7);
  
  // Check for empty token
  if (!token || token.trim().length === 0) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid token',
      message: 'Authentication failed' 
    });
  }
  
  // Check for malformed tokens or special cases
  if (token.includes('invalid') || 
      token.includes('expired') || 
      token.includes('malformed') ||
      token.includes('<script>') ||
      token.includes('\x00') ||
      token.includes('\n') ||
      token.includes('\r') ||
      token.includes('\t') ||
      token.length > 2000 ||
      token.length < 20) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid token',
      message: 'Authentication failed' 
    });
  }
  
  try {
    // Simple JWT-like parsing for testing
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    
    const payload = JSON.parse(Buffer.from(parts[1] || '', 'base64').toString());
    
    // Check for valid user ID
    if (!payload.uid || payload.uid.trim().length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token',
        message: 'Authentication failed' 
      });
    }
    
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
  // Skip rate limiting entirely in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }
  
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
      const { filename, content, sessionId, batchId, fileType } = req.body;
      
      // Validate required fields
      if (!filename && !req.file && !content) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
          message: 'File is required for resume upload'
        });
      }
      
      // Validate file type if provided
      if (fileType && !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'].includes(fileType)) {
        return res.status(400).json({
          success: false,
          error: 'Unsupported file type',
          message: 'Only PDF, DOCX, and TXT files are supported'
        });
      }
      
      // Sanitize filename
      let sanitizedFilename = filename || 'uploaded-resume.pdf';
      if (filename) {
        // Sanitize filename - remove path traversal attempts and invalid characters
        sanitizedFilename = filename.replace(/\.\./g, '').replace(/[\/\\]/g, '_');
      }
      
      const resume = mockDatabase.createResume({
        userId: user.uid,
        filename: sanitizedFilename,
        content: content || 'Mock resume content',
        sessionId,
        batchId,
        fileType: fileType || 'application/pdf',
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
          message: 'Resume ID must be a number',
          timestamp: new Date().toISOString()
        });
      }
      
      const resumes = mockDatabase.findResumesByUser(user.uid);
      const resume = resumes.find(r => r.id === resumeId);
      
      if (!resume) {
        return res.status(404).json({
          success: false,
          error: 'Resume not found',
          message: 'Resume not found',
          timestamp: new Date().toISOString()
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
  
  app.delete('/api/resumes/:id', async (req: Request, res: Response) => {
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
          message: 'Resume not found or access denied'
        });
      }
      
      // Remove resume from mock database
      mockDatabase.data.resumes.delete(resumeId);
      
      res.json({
        status: 'success',
        data: { message: 'Resume deleted successfully' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });
  
  app.post('/api/resumes/batch', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { files, sessionId, batchId } = req.body;
      
      // Validate required fields
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded',
          message: 'At least one file is required for batch upload'
        });
      }
      
      const uploadedResumes = [];
      const errors = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const resume = mockDatabase.createResume({
            userId: user.uid,
            filename: file.filename || `batch-resume-${i + 1}.pdf`,
            content: file.content || 'Mock batch resume content',
            sessionId: sessionId || `batch_session_${Date.now()}`,
            batchId: batchId || `batch_${Date.now()}`,
            fileType: file.fileType || 'application/pdf',
          });
          uploadedResumes.push(resume);
        } catch (error) {
          errors.push({
            filename: file.filename,
            error: (error as Error).message
          });
        }
      }
      
      res.json({
        status: 'success',
        data: {
          valid: true,
          batchId: batchId || `batch_${Date.now()}`,
          ownership: {
            userId: user.uid,
            sessionId: sessionId || `batch_session_${Date.now()}`,
          },
          results: {
            successful: uploadedResumes,
            failed: errors
          },
          summary: {
            totalFiles: files.length,
            successfulCount: uploadedResumes.length,
            failedCount: errors.length
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
  
  // Job descriptions routes
  app.get('/api/job-descriptions', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { limit, offset } = req.query;
      
      let jobDescriptions = Array.from(mockDatabase.data.jobDescriptions.values())
        .filter((jd: any) => jd.userId === user.uid);
      
      const totalCount = jobDescriptions.length;
      
      // Handle pagination with validation
      let parsedLimit = limit ? parseInt(limit as string) : undefined;
      let parsedOffset = offset ? parseInt(offset as string) : 0;
      
      // Validate and set defaults for invalid values
      if (parsedLimit !== undefined && (isNaN(parsedLimit) || parsedLimit <= 0)) {
        parsedLimit = totalCount; // Default to total count if invalid
      }
      
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        parsedOffset = 0; // Default to 0 if invalid
      }
      
      if (parsedLimit && parsedLimit > 0) {
        jobDescriptions = jobDescriptions.slice(parsedOffset, parsedOffset + parsedLimit);
      }
      
      res.json({
        status: 'success',
        data: jobDescriptions,
        jobDescriptions,
        count: totalCount,
        pagination: {
          limit: parsedLimit || totalCount,
          offset: parsedOffset,
          total: totalCount
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
  
  app.post('/api/job-descriptions', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      let { title, description, company, location, type, salary, requirements, skills, experience } = req.body;
      
      // Simple XSS sanitization - remove script tags and other dangerous content
      const sanitize = (str: string) => {
        if (typeof str !== 'string') return str;
        return str
          .replace(/<script[^>]*>.*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+="[^"]*"/gi, '');
      };
      
      if (title) title = sanitize(title);
      if (description) description = sanitize(description);
      if (company) company = sanitize(company);
      if (location) location = sanitize(location);
      
      // Validation
      if (!title) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job description data',
          message: 'Title is required'
        });
      }
      
      if (!description) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job description data',
          message: 'Description is required'
        });
      }
      
      // Validate title length
      if (title.length > 255) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job description data',
          message: 'Title too long (max 255 characters)'
        });
      }
      
      // Validate description length
      if (description.length > 10000) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job description data',
          message: 'Description too long (max 10000 characters)'
        });
      }
      
      const jobDescription = mockDatabase.createJobDescription({
        userId: user.uid,
        title,
        description,
        company,
        location,
        type,
        salary,
        requirements,
        skills,
        experience,
      });
      
      // Mock AI analysis
      const mockSkills = ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'];
      const mockRequirements = ['5+ years experience', 'Bachelor degree'];
      
      jobDescription.skills = jobDescription.skills || mockSkills;
      jobDescription.requirements = jobDescription.requirements || mockRequirements;
      
      const analysis = {
        skillsExtracted: mockSkills.length,
        requirementsIdentified: mockRequirements.length,
        experienceLevel: 'senior',
        analysisComplete: true
      };
      
      res.json({
        status: 'success',
        data: jobDescription,
        jobDescription,
        analysis
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
          error: 'Invalid job description ID',
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
        data: jobDescription,
        jobDescription: {
          ...jobDescription,
          isAnalyzed: true
        },
        isAnalyzed: true
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });

  app.patch('/api/job-descriptions/:id', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const updates = req.body;
      
      const jobId = parseInt(id);
      if (isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job description ID',
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
      
      // Validate updates
      if (updates.title !== undefined) {
        if (!updates.title) {
          return res.status(400).json({
            success: false,
            error: 'Invalid update data',
            message: 'Title cannot be empty'
          });
        }
        if (updates.title.length > 255) {
          return res.status(400).json({
            success: false,
            error: 'Invalid update data',
            message: 'Title too long'
          });
        }
      }
      
      if (updates.description !== undefined && updates.description.length > 10000) {
        return res.status(400).json({
          success: false,
          error: 'Invalid update data',
          message: 'Description too long'
        });
      }
      
      // Apply updates
      Object.assign(jobDescription, updates);
      jobDescription.updatedAt = new Date().toISOString();
      
      // Re-analyze if description was updated
      let reanalyzed = false;
      if (updates.description) {
        const mockSkills = ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'];
        const mockRequirements = ['5+ years experience', 'Bachelor degree'];
        jobDescription.skills = mockSkills;
        jobDescription.requirements = mockRequirements;
        reanalyzed = true;
      }
      
      res.json({
        status: 'success',
        data: jobDescription,
        jobDescription,
        reanalyzed
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: (error as Error).message
      });
    }
  });

  app.delete('/api/job-descriptions/:id', async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      
      const jobId = parseInt(id);
      if (isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid job description ID',
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
      
      // Delete job description
      mockDatabase.data.jobDescriptions.delete(jobId);
      
      // Delete related analysis results
      const analysisResults = Array.from(mockDatabase.data.analysisResults.values())
        .filter((ar: any) => ar.jobDescriptionId === jobId);
      analysisResults.forEach(ar => mockDatabase.data.analysisResults.delete(ar.id));
      
      res.json({
        status: 'success',
        data: {
          message: 'Job description deleted successfully',
          deletedItems: {
            jobDescription: 1,
            analysisResults: analysisResults.length
          }
        },
        message: 'Job description deleted successfully',
        deletedItems: {
          jobDescription: 1,
          analysisResults: analysisResults.length
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
          error: 'Invalid parameters',
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
      
      // Generate mock interview questions categorized by type
      const technicalQuestions = [
        {
          id: 1,
          question: 'Can you explain your experience with React and how you\'ve used it in previous projects?',
          type: 'technical',
          difficulty: difficulty || 'medium',
          category: 'technical',
          relatedSkills: ['React', 'JavaScript'],
          followUpQuestions: ['How do you handle state management in React?', 'What are React hooks and when do you use them?'],
        },
        {
          id: 2,
          question: 'How would you approach building a machine learning model in Python for data analysis?',
          type: 'technical',
          difficulty: difficulty || 'hard',
          category: 'technical',
          relatedSkills: ['Python', 'Machine Learning', 'Statistics'],
          followUpQuestions: ['What ML libraries would you use?', 'How do you validate model performance?'],
        },
      ];

      const experienceQuestions = [
        {
          id: 3,
          question: 'Describe a challenging problem you solved in your previous work experience and how you approached it.',
          type: 'behavioral',
          difficulty: 'medium',
          category: 'experience',
          relatedSkills: [],
          followUpQuestions: ['What would you do differently if you faced the same problem again?'],
        },
        {
          id: 4,
          question: 'Tell me about your experience working with a team on a complex project.',
          type: 'behavioral',
          difficulty: 'medium',
          category: 'experience',
          relatedSkills: [],
          followUpQuestions: ['How did you handle the situation?', 'What was the outcome?'],
        },
      ];

      const skillGapQuestions = [
        {
          id: 5,
          question: 'How would you approach improving your statistics knowledge for machine learning applications?',
          type: 'skill-gap',
          difficulty: 'medium',
          category: 'skill-gap',
          relatedSkills: ['Statistics', 'Mathematics'],
          followUpQuestions: ['What resources would you use?', 'How would you test your understanding?'],
        },
      ];

      const inclusionQuestions = [
        {
          id: 6,
          question: 'How do you promote team collaboration and ensure diverse perspectives are heard when you work with others on inclusive projects?',
          type: 'inclusion',
          difficulty: 'medium',
          category: 'inclusion',
          relatedSkills: [],
          followUpQuestions: ['Can you give an example?', 'How do you mentor junior developers?'],
        },
      ];

      // Mock match percentage based on resume/job analysis
      const mockMatchPercentage = 88;
      
      const responseData = {
        message: 'Interview questions generated successfully',
        resumeId: resumeIdNum,
        jobDescriptionId: jobIdNum,
        resumeName: resume.filename,
        jobTitle: jobDescription.title,
        matchPercentage: mockMatchPercentage,
        technicalQuestions,
        experienceQuestions,
        skillGapQuestions,
        inclusionQuestions,
        metadata: {
          resumeId: resumeIdNum,
          jobId: jobIdNum,
          difficulty: difficulty || 'medium',
          questionCount: technicalQuestions.length + experienceQuestions.length + skillGapQuestions.length + inclusionQuestions.length,
          generatedAt: new Date().toISOString(),
        }
      };

      res.json({
        status: 'success',
        data: responseData,
        ...responseData // Include properties directly for backward compatibility
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
          error: 'Invalid parameters',
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
      const technicalQuestions = [
        {
          id: 1,
          question: 'Can you explain your experience with React?',
          type: 'technical',
          difficulty: 'medium',
          category: 'technical',
          relatedSkills: ['React', 'JavaScript'],
        },
      ];

      const experienceQuestions = [
        {
          id: 2,
          question: 'Describe a challenging problem you solved in your work experience.',
          type: 'behavioral',
          difficulty: 'medium',
          category: 'experience',
          relatedSkills: [],
        },
      ];

      const skillGapQuestions = [
        {
          id: 3,
          question: 'How would you learn a new technology?',
          type: 'skill-gap',
          difficulty: 'medium',
          category: 'skill-gap',
          relatedSkills: [],
        },
      ];

      const inclusionQuestions = [
        {
          id: 4,
          question: 'How do you ensure diverse team collaboration and inclusive practices when you work with others?',
          type: 'inclusion',
          difficulty: 'medium',
          category: 'inclusion',
          relatedSkills: [],
        },
      ];
      
      const responseData = {
        message: 'Interview questions retrieved successfully',
        resumeId: resumeIdNum,
        jobDescriptionId: jobIdNum,
        resumeName: resume.filename,
        jobTitle: jobDescription.title,
        matchPercentage: 88,
        technicalQuestions,
        experienceQuestions,
        skillGapQuestions,
        inclusionQuestions,
        metadata: {
          resumeId: resumeIdNum,
          jobId: jobIdNum,
          questionCount: technicalQuestions.length + experienceQuestions.length + skillGapQuestions.length + inclusionQuestions.length,
        }
      };

      res.json({
        status: 'success',
        data: responseData,
        ...responseData // Include properties directly for backward compatibility
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
      if (!force) {
        if (batch.userId === user.uid) {
          return res.status(403).json({
            success: false,
            error: 'Cannot claim own batch',
            message: 'Cannot claim own batch'
          });
        }
        
        // Don't allow claiming active batches without force
        const lastAccess = new Date(batch.lastAccessedAt);
        const hoursSinceAccess = (Date.now() - lastAccess.getTime()) / (1000 * 60 * 60);
        if (hoursSinceAccess < 24) {
          return res.status(404).json({
            success: false,
            error: 'Batch not available for claiming',
            message: 'Batch is not orphaned'
          });
        }
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
      if (!/^batch_\d+_[a-zA-Z0-9_]+$/.test(batchId)) {
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
  
  // Error handling middleware for malformed JSON
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({
        success: false,
        error: 'Invalid JSON',
        message: 'Request body contains malformed JSON'
      });
    }
    next(err);
  });
  
  return app;
}

// Setup all mocks
export function setupServerMocks() {
  setupDatabaseMock();
  
  // Mock Firebase admin
  jest.doMock('firebase-admin', () => mockFirebaseAdmin);
  
  // Mock AI providers
  jest.doMock('@server/lib/anthropic', () => mockAIProviders);
  jest.doMock('@server/lib/openai', () => mockAIProviders);
  jest.doMock('@server/lib/groq', () => mockAIProviders);
  
  console.log('✅ Server mocks configured for integration tests');
}

// Cleanup all mocks
export function cleanupServerMocks() {
  mockDatabase.reset();
  jest.clearAllMocks();
  console.log('✅ Server mocks cleaned up');
}