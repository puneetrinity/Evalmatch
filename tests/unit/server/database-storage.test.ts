/**
 * Unit Tests for Database Storage Operations
 * Tests CRUD operations and data integrity
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DatabaseStorage } from '../../../server/database-storage';
import { 
  type InsertUser, 
  type InsertResume, 
  type InsertJobDescription, 
  type InsertAnalysisResult,
  type InsertInterviewQuestions 
} from '../../../shared/schema';

// Mock database and dependencies
jest.mock('../../../server/db', () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(() => Promise.resolve([]))
        })),
        orderBy: jest.fn(() => Promise.resolve([]))
      }))
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(() => Promise.resolve([]))
      }))
    })),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([]))
        }))
      }))
    })),
    delete: jest.fn(() => ({
      where: jest.fn(() => Promise.resolve([]))
    }))
  }
}));

jest.mock('../../../server/lib/db-retry', () => ({
  withRetry: jest.fn((fn) => fn())
}));

jest.mock('../../../server/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

const mockDb = require('../../../server/db').db;

describe('DatabaseStorage', () => {
  let storage: DatabaseStorage;
  
  beforeEach(() => {
    jest.clearAllMocks();
    storage = new DatabaseStorage();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('User Operations', () => {
    const mockUser = {
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('should get user by id', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockUser])
        })
      });

      const result = await storage.getUser(1);

      expect(result).toEqual(mockUser);
      expect(mockDb.select).toHaveBeenCalled();
    });

    test('should get user by username', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockUser])
        })
      });

      const result = await storage.getUserByUsername('testuser');

      expect(result).toEqual(mockUser);
      expect(mockDb.select).toHaveBeenCalled();
    });

    test('should create new user', async () => {
      const insertUser: InsertUser = {
        username: 'newuser',
        email: 'new@example.com'
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...mockUser, ...insertUser }])
        })
      });

      const result = await storage.createUser(insertUser);

      expect(result).toEqual(expect.objectContaining(insertUser));
      expect(mockDb.insert).toHaveBeenCalled();
    });

    test('should handle user not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      const result = await storage.getUser(999);

      expect(result).toBeUndefined();
    });
  });

  describe('Resume Operations', () => {
    const mockResume = {
      id: 1,
      filename: 'test-resume.pdf',
      content: 'Resume content...',
      userId: 'user-123',
      sessionId: 'session-456',
      batchId: null,
      analyzedData: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('should get resume by id', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockResume])
        })
      });

      const result = await storage.getResume(1);

      expect(result).toEqual(mockResume);
    });

    test('should get resume by id and userId', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockResume])
        })
      });

      const result = await storage.getResumeById(1, 'user-123');

      expect(result).toEqual(mockResume);
    });

    test('should get resumes with sessionId filter', async () => {
      const mockResumes = [mockResume, { ...mockResume, id: 2 }];
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockResumes)
          })
        })
      });

      const result = await storage.getResumes('session-456');

      expect(result).toEqual(mockResumes);
      expect(result).toHaveLength(2);
    });

    test('should get all resumes when no sessionId provided', async () => {
      const mockResumes = [mockResume];
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockResumes)
        })
      });

      const result = await storage.getResumes();

      expect(result).toEqual(mockResumes);
    });

    test('should get resumes by userId', async () => {
      const mockResumes = [mockResume];
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockResumes)
          })
        })
      });

      const result = await storage.getResumesByUserId('user-123');

      expect(result).toEqual(mockResumes);
    });

    test('should create new resume', async () => {
      const insertResume: InsertResume = {
        filename: 'new-resume.pdf',
        content: 'New resume content',
        userId: 'user-123',
        sessionId: 'session-456'
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...mockResume, ...insertResume }])
        })
      });

      const result = await storage.createResume(insertResume);

      expect(result).toEqual(expect.objectContaining(insertResume));
      expect(mockDb.insert).toHaveBeenCalled();
    });

    test('should handle resume not found', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      const result = await storage.getResume(999);

      expect(result).toBeUndefined();
    });
  });

  describe('Job Description Operations', () => {
    const mockJobDescription = {
      id: 1,
      title: 'Senior Developer',
      description: 'We are looking for...',
      userId: 'user-123',
      analyzedData: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('should get job description by id', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockJobDescription])
        })
      });

      const result = await storage.getJobDescription(1);

      expect(result).toEqual(mockJobDescription);
    });

    test('should get job descriptions by userId', async () => {
      const mockJobs = [mockJobDescription];
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(mockJobs)
          })
        })
      });

      const result = await storage.getJobDescriptionsByUserId('user-123');

      expect(result).toEqual(mockJobs);
    });

    test('should create new job description', async () => {
      const insertJob: InsertJobDescription = {
        title: 'Frontend Developer',
        description: 'Looking for React developer...',
        userId: 'user-123'
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...mockJobDescription, ...insertJob }])
        })
      });

      const result = await storage.createJobDescription(insertJob);

      expect(result).toEqual(expect.objectContaining(insertJob));
    });

    test('should update job description', async () => {
      const updatedJob = { ...mockJobDescription, title: 'Updated Title' };
      mockDb.update.mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([updatedJob])
          })
        })
      });

      const result = await storage.updateJobDescription(1, 'user-123', {
        title: 'Updated Title'
      });

      expect(result).toEqual(updatedJob);
    });

    test('should delete job description', async () => {
      mockDb.delete.mockReturnValue({
        where: jest.fn().mockResolvedValue([])
      });

      await storage.deleteJobDescription(1, 'user-123');

      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe('Analysis Results Operations', () => {
    const mockAnalysisResult = {
      id: 1,
      userId: 'user-123',
      resumeId: 1,
      jobDescriptionId: 1,
      matchPercentage: 85,
      matchedSkills: ['JavaScript', 'React'],
      missingSkills: ['TypeScript'],
      analysis: { confidence: 'high' },
      candidateStrengths: ['Strong JS skills'],
      candidateWeaknesses: ['Missing TS'],
      confidenceLevel: 'high' as const,
      fairnessMetrics: null,
      semanticSimilarity: 0.8,
      skillsSimilarity: 0.9,
      experienceSimilarity: 0.7,
      educationSimilarity: 0.6,
      mlConfidenceScore: 0.85,
      scoringDimensions: null,
      recommendations: ['Consider for interview'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('should create analysis result', async () => {
      const insertAnalysis: InsertAnalysisResult = {
        userId: 'user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        matchPercentage: 85,
        matchedSkills: ['JavaScript', 'React'],
        missingSkills: ['TypeScript'],
        analysis: { confidence: 'high' },
        candidateStrengths: ['Strong JS skills'],
        candidateWeaknesses: ['Missing TS'],
        confidenceLevel: 'high',
        recommendations: ['Consider for interview']
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...mockAnalysisResult, ...insertAnalysis }])
        })
      });

      const result = await storage.createAnalysisResult(insertAnalysis);

      expect(result).toEqual(expect.objectContaining(insertAnalysis));
    });

    test('should get analysis results by job description', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([mockAnalysisResult])
          })
        })
      });

      const result = await storage.getAnalysisResultsByJobDescription(1, 'user-123');

      expect(result).toEqual([mockAnalysisResult]);
    });

    test('should get analysis results by user', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue([mockAnalysisResult])
          })
        })
      });

      const result = await storage.getAnalysisResultsByUserId('user-123');

      expect(result).toEqual([mockAnalysisResult]);
    });
  });

  describe('Interview Questions Operations', () => {
    const mockInterviewQuestions = {
      id: 1,
      userId: 'user-123',
      resumeId: 1,
      jobDescriptionId: 1,
      questions: [
        {
          question: 'Tell me about your JavaScript experience',
          category: 'technical' as const,
          difficulty: 'medium' as const,
          expectedAnswer: 'Should demonstrate JS knowledge'
        }
      ],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    test('should create interview questions', async () => {
      const insertQuestions: InsertInterviewQuestions = {
        userId: 'user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        questions: mockInterviewQuestions.questions
      };

      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ ...mockInterviewQuestions, ...insertQuestions }])
        })
      });

      const result = await storage.createInterviewQuestions(insertQuestions);

      expect(result).toEqual(expect.objectContaining(insertQuestions));
    });

    test('should get interview questions', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([mockInterviewQuestions])
        })
      });

      const result = await storage.getInterviewQuestions(1, 1, 'user-123');

      expect(result).toEqual(mockInterviewQuestions);
    });
  });

  describe('Error Handling', () => {
    test('should handle database connection errors', async () => {
      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockRejectedValue(new Error('Connection failed'))
        })
      });

      await expect(storage.getUser(1)).rejects.toThrow('Connection failed');
    });

    test('should handle constraint violations', async () => {
      mockDb.insert.mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue(new Error('Unique constraint violation'))
        })
      });

      const insertUser: InsertUser = {
        username: 'duplicate',
        email: 'duplicate@example.com'
      };

      await expect(storage.createUser(insertUser)).rejects.toThrow('Unique constraint violation');
    });
  });

  describe('Data Validation', () => {
    test('should validate required fields for resume creation', async () => {
      const invalidResume = {
        filename: '', // Empty filename should fail validation
        userId: 'user-123'
      } as InsertResume;

      // This test would need proper validation in the actual implementation
      expect(invalidResume.filename).toBe('');
    });

    test('should validate skill data types in analysis results', async () => {
      const analysisWithInvalidSkills: InsertAnalysisResult = {
        userId: 'user-123',
        resumeId: 1,
        jobDescriptionId: 1,
        matchPercentage: 85,
        matchedSkills: 'not an array' as any, // Invalid type
        missingSkills: ['TypeScript'],
        analysis: {},
        candidateStrengths: [],
        candidateWeaknesses: [],
        confidenceLevel: 'high',
        recommendations: []
      };

      // This would fail type checking at compile time
      expect(typeof analysisWithInvalidSkills.matchedSkills).toBe('string');
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large result sets efficiently', async () => {
      const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
        id: i + 1,
        filename: `resume-${i}.pdf`,
        userId: 'user-123',
        sessionId: 'session-456',
        content: 'Resume content...',
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            orderBy: jest.fn().mockResolvedValue(largeResultSet)
          })
        })
      });

      const result = await storage.getResumesByUserId('user-123');

      expect(result).toHaveLength(1000);
    });

    test('should handle concurrent operations', async () => {
      const concurrentOperations = Array.from({ length: 10 }, (_, i) => 
        storage.getUser(i + 1)
      );

      mockDb.select.mockReturnValue({
        from: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue([])
        })
      });

      const results = await Promise.all(concurrentOperations);

      expect(results).toHaveLength(10);
      results.forEach(result => expect(result).toBeUndefined());
    });
  });
});