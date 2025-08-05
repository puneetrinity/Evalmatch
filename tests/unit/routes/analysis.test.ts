/**
 * Unit Tests for Analysis Routes
 * Tests the API endpoints for resume-job matching analysis
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// Mock dependencies before importing the route
jest.mock('../../../server/storage', () => ({
  getStorage: jest.fn(() => ({
    getJobDescriptionByIdAndUserId: jest.fn(),
    getResumesByUserId: jest.fn(),
    createAnalysisResult: jest.fn(),
    getAnalysisResultsByJobDescription: jest.fn()
  }))
}));

jest.mock('../../../server/lib/hybrid-match-analyzer', () => ({
  analyzeMatchHybrid: jest.fn()
}));

jest.mock('../../../server/lib/bias-detection', () => ({
  detectMatchingBias: jest.fn()
}));

jest.mock('../../../server/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const mockStorage = {
  getJobDescriptionByIdAndUserId: jest.fn(),
  getResumesByUserId: jest.fn(),
  createAnalysisResult: jest.fn(),
  getAnalysisResultsByJobDescription: jest.fn()
};

const mockAnalyzeMatchHybrid = require('../../../server/lib/hybrid-match-analyzer').analyzeMatchHybrid as jest.MockedFunction<any>;
const mockDetectMatchingBias = require('../../../server/lib/bias-detection').detectMatchingBias as jest.MockedFunction<any>;

// Import after mocking
require('../../../server/storage').getStorage.mockReturnValue(mockStorage);

describe('Analysis Routes', () => {
  let app: express.Application;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create Express app with the analysis routes
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req: any, res, next) => {
      req.user = {
        uid: 'test-user-123',
        email: 'test@example.com',
        emailVerified: true
      };
      next();
    });
    
    // Import and use the analysis routes
    const analysisRouter = require('../../../server/routes/analysis').default;
    app.use('/api/analysis', analysisRouter);
  });

  describe('POST /api/analysis/analyze/:jobId', () => {
    const mockJobDescription = {
      id: 1,
      title: 'Senior Developer',
      description: 'We are looking for a senior developer with React and Node.js experience',
      userId: 'test-user-123',
      analyzedData: {
        skills: ['React', 'Node.js', 'TypeScript'],
        experience: 'Senior level (5+ years)'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockResumes = [
      {
        id: 1,
        filename: 'resume1.pdf',
        content: 'Senior developer with React and Node.js experience...',
        userId: 'test-user-123',
        analyzedData: {
          skills: ['React', 'Node.js', 'JavaScript'],
          experience: '5 years experience',
          education: ['BS Computer Science']
        },
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 2,
        filename: 'resume2.pdf',
        content: 'Frontend developer with Angular experience...',
        userId: 'test-user-123',
        analyzedData: {
          skills: ['Angular', 'TypeScript', 'CSS'],
          experience: '3 years experience',
          education: ['BS Information Technology']
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    const mockAnalysisResult = {
      matchPercentage: 85,
      matchedSkills: [
        { skill: 'React', matchPercentage: 95, category: 'technical', importance: 'important', source: 'semantic' },
        { skill: 'Node.js', matchPercentage: 90, category: 'technical', importance: 'important', source: 'semantic' }
      ],
      missingSkills: ['TypeScript'],
      candidateStrengths: ['Strong React experience', 'Good Node.js background'],
      candidateWeaknesses: ['Missing TypeScript knowledge'],
      confidenceLevel: 'high' as const,
      fairnessMetrics: {
        biasConfidenceScore: 0.1,
        potentialBiasAreas: [],
        fairnessAssessment: 'No significant bias detected'
      },
      scoringDimensions: {
        skills: 85,
        experience: 80,
        education: 75,
        semantic: 70,
        overall: 85
      },
      analysisMethod: 'hybrid' as const,
      confidence: 0.9,
      recommendations: ['Consider for technical interview']
    };

    test('should analyze resumes for job successfully', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue(mockJobDescription);
      mockStorage.getResumesByUserId.mockResolvedValue(mockResumes);
      mockAnalyzeMatchHybrid.mockResolvedValue(mockAnalysisResult);
      mockStorage.createAnalysisResult.mockResolvedValue({
        id: 1,
        ...mockAnalysisResult,
        userId: 'test-user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const response = await request(app)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toHaveLength(2); // Should analyze both resumes
      
      const firstResult = response.body.results[0];
      expect(firstResult).toHaveProperty('resumeId', 1);
      expect(firstResult).toHaveProperty('filename', 'resume1.pdf');
      expect(firstResult).toHaveProperty('match');
      expect(firstResult.match).toHaveProperty('matchPercentage', 85);
      expect(firstResult.match).toHaveProperty('matchedSkills');
      expect(firstResult.match).toHaveProperty('missingSkills');
      expect(firstResult.match).toHaveProperty('candidateStrengths');
      expect(firstResult.match).toHaveProperty('candidateWeaknesses');
      expect(firstResult.match).toHaveProperty('confidenceLevel', 'high');
    });

    test('should handle job not found', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/analysis/analyze/999')
        .send({})
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Job description not found');
    });

    test('should handle no resumes found', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue(mockJobDescription);
      mockStorage.getResumesByUserId.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'No resumes found');
    });

    test('should handle analysis failure gracefully', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue(mockJobDescription);
      mockStorage.getResumesByUserId.mockResolvedValue(mockResumes);
      mockAnalyzeMatchHybrid.mockRejectedValue(new Error('Analysis service unavailable'));

      const response = await request(app)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Analysis failed');
    });

    test('should include all required fields in database storage', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue(mockJobDescription);
      mockStorage.getResumesByUserId.mockResolvedValue([mockResumes[0]]);
      mockAnalyzeMatchHybrid.mockResolvedValue(mockAnalysisResult);
      mockStorage.createAnalysisResult.mockResolvedValue({
        id: 1,
        ...mockAnalysisResult,
        userId: 'test-user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await request(app)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(200);

      expect(mockStorage.createAnalysisResult).toHaveBeenCalledWith({
        userId: 'test-user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        matchPercentage: 85,
        matchedSkills: mockAnalysisResult.matchedSkills,
        missingSkills: mockAnalysisResult.missingSkills,
        analysis: mockAnalysisResult,
        candidateStrengths: mockAnalysisResult.candidateStrengths,
        candidateWeaknesses: mockAnalysisResult.candidateWeaknesses,
        confidenceLevel: mockAnalysisResult.confidenceLevel,
        fairnessMetrics: mockAnalysisResult.fairnessMetrics,
        semanticSimilarity: mockAnalysisResult.scoringDimensions.semantic / 100,
        skillsSimilarity: mockAnalysisResult.scoringDimensions.skills / 100,
        experienceSimilarity: mockAnalysisResult.scoringDimensions.experience / 100,
        educationSimilarity: mockAnalysisResult.scoringDimensions.education / 100,
        mlConfidenceScore: mockAnalysisResult.confidence,
        scoringDimensions: mockAnalysisResult.scoringDimensions,
        recommendations: mockAnalysisResult.recommendations
      });
    });
  });

  describe('GET /api/analysis/analyze/:jobId', () => {
    const mockAnalysisResults = [
      {
        id: 1,
        userId: 'test-user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        matchPercentage: 85,
        matchedSkills: ['React', 'Node.js'],
        missingSkills: ['TypeScript'],
        candidateStrengths: ['Strong React skills'],
        candidateWeaknesses: ['Missing TypeScript'],
        confidenceLevel: 'high' as const,
        recommendations: ['Consider for interview'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    test('should retrieve existing analysis results', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue({
        id: 1,
        title: 'Senior Developer',
        userId: 'test-user-123'
      });
      mockStorage.getAnalysisResultsByJobDescription.mockResolvedValue(mockAnalysisResults);

      const response = await request(app)
        .get('/api/analysis/analyze/1')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('results');
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0]).toHaveProperty('matchPercentage', 85);
    });

    test('should handle job not found for retrieval', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/analysis/analyze/999')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Job description not found');
    });

    test('should return empty results when no analyses exist', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue({
        id: 1,
        title: 'Senior Developer',
        userId: 'test-user-123'
      });
      mockStorage.getAnalysisResultsByJobDescription.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/analysis/analyze/1')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body.results).toHaveLength(0);
    });
  });

  describe('POST /api/analysis/analyze-bias/:jobId', () => {
    const mockBiasAnalysis = {
      hasBias: false,
      biasScore: 0.1,
      detectedBiases: [],
      fairnessMetrics: {
        biasConfidenceScore: 0.1,
        potentialBiasAreas: [],
        fairnessAssessment: 'No significant bias detected'
      }
    };

    test('should analyze job description for bias', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue({
        id: 1,
        title: 'Senior Developer',
        description: 'We are looking for a senior developer...',
        userId: 'test-user-123'
      });
      mockDetectMatchingBias.mockResolvedValue(mockBiasAnalysis);

      const response = await request(app)
        .post('/api/analysis/analyze-bias/1')
        .send({})
        .expect(200);

      expect(response.body).toHaveProperty('status', 'success');
      expect(response.body).toHaveProperty('overallBiasScore', 0.1);
      expect(response.body).toHaveProperty('biasAnalysis');
      expect(response.body.biasAnalysis).toHaveProperty('hasBias', false);
      expect(response.body.biasAnalysis).toHaveProperty('biasConfidenceScore', 0.1);
    });

    test('should handle job not found for bias analysis', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/analysis/analyze-bias/999')
        .send({})
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Job description not found');
    });

    test('should handle bias analysis failure', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue({
        id: 1,
        title: 'Senior Developer',
        description: 'We are looking for a senior developer...',
        userId: 'test-user-123'
      });
      mockDetectMatchingBias.mockRejectedValue(new Error('Bias analysis service unavailable'));

      const response = await request(app)
        .post('/api/analysis/analyze-bias/1')
        .send({})
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Bias analysis failed');
    });
  });

  describe('Input Validation', () => {
    test('should validate jobId parameter is numeric', async () => {
      const response = await request(app)
        .post('/api/analysis/analyze/invalid-id')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle missing authentication', async () => {
      // Create app without auth middleware
      const noAuthApp = express();
      noAuthApp.use(express.json());
      
      const analysisRouter = require('../../../server/routes/analysis').default;
      noAuthApp.use('/api/analysis', analysisRouter);

      const response = await request(noAuthApp)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle timeout errors', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const response = await request(app)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should provide helpful error messages', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue({
        id: 1,
        title: 'Senior Developer',
        userId: 'test-user-123'
      });
      mockStorage.getResumesByUserId.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/analysis/analyze/1')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('No resumes found');
      expect(response.body.message).toContain('upload resumes');
    });
  });

  describe('Performance and Rate Limiting', () => {
    test('should handle concurrent analysis requests', async () => {
      mockStorage.getJobDescriptionByIdAndUserId.mockResolvedValue({
        id: 1,
        title: 'Senior Developer',
        userId: 'test-user-123'
      });
      mockStorage.getResumesByUserId.mockResolvedValue([{
        id: 1,
        filename: 'resume.pdf',
        userId: 'test-user-123',
        analyzedData: { skills: ['React'] },
        createdAt: new Date(),
        updatedAt: new Date()
      }]);
      mockAnalyzeMatchHybrid.mockResolvedValue({
        matchPercentage: 80,
        matchedSkills: [],
        missingSkills: [],
        candidateStrengths: [],
        candidateWeaknesses: [],
        confidenceLevel: 'medium',
        scoringDimensions: { skills: 80, experience: 80, education: 80, semantic: 80, overall: 80 },
        analysisMethod: 'hybrid',
        confidence: 0.8,
        recommendations: []
      });
      mockStorage.createAnalysisResult.mockResolvedValue({
        id: 1,
        userId: 'test-user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        matchPercentage: 80,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Send multiple concurrent requests
      const requests = Array.from({ length: 5 }, () => 
        request(app).post('/api/analysis/analyze/1').send({})
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('success');
      });
    });
  });
});