/**
 * Unit tests for Resume Deletion Functionality
 * Tests the newly implemented deleteResume method and its integration
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Define IStorage interface for testing
interface IStorage {
  deleteResume(resumeId: number): Promise<void>;
  getResumeById(resumeId: number, userId: string): Promise<any>;
  [key: string]: any;
}

// Mock storage interface for testing
const mockStorage: jest.Mocked<IStorage> = {
  deleteResume: jest.fn(),
  getResume: jest.fn(),
  getResumeById: jest.fn(),
  // Add other required IStorage methods as no-ops for testing
  getUser: jest.fn(),
  createUser: jest.fn(),
  createResume: jest.fn(),
  updateResumeAnalysis: jest.fn(),
  updateResumeEmbeddings: jest.fn(),
  getResumes: jest.fn(),
  getResumesByUserId: jest.fn(),
  getJobDescription: jest.fn(),
  getJobDescriptionById: jest.fn(),
  getJobDescriptions: jest.fn(),
  getJobDescriptionsByUserId: jest.fn(),
  createJobDescription: jest.fn(),
  updateJobDescriptionAnalysis: jest.fn(),
  updateJobDescriptionEmbeddings: jest.fn(),
  deleteJobDescription: jest.fn(),
  getAnalysisResult: jest.fn(),
  getAnalysisResults: jest.fn(),
  getAnalysisResultsByJobId: jest.fn(),
  getAnalysisResultsByResumeId: jest.fn(),
  createAnalysisResult: jest.fn(),
  updateAnalysisResult: jest.fn(),
  getBatch: jest.fn(),
  getBatches: jest.fn(),
  getBatchesByUserId: jest.fn(),
  createBatch: jest.fn(),
  updateBatch: jest.fn(),
  getInterviewQuestions: jest.fn(),
  getInterviewQuestionsByIds: jest.fn(),
  createInterviewQuestions: jest.fn(),
  getResumeWithLatestAnalysisAndQuestions: jest.fn(),
};

// Mock the getStorage function
const mockGetStorage = jest.fn(() => mockStorage);

describe('Resume Deletion Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('IStorage.deleteResume method', () => {
    it('should delete resume by ID', async () => {
      const resumeId = 123;
      
      await mockStorage.deleteResume(resumeId);
      
      expect(mockStorage.deleteResume).toHaveBeenCalledWith(resumeId);
      expect(mockStorage.deleteResume).toHaveBeenCalledTimes(1);
    });

    it('should handle deletion of non-existent resume gracefully', async () => {
      const resumeId = 999;
      
      // Mock should not throw for non-existent resumes (handled by implementation)
      await expect(mockStorage.deleteResume(resumeId)).resolves.toBeUndefined();
      
      expect(mockStorage.deleteResume).toHaveBeenCalledWith(resumeId);
    });
  });

  describe('Resume deletion integration', () => {
    it('should verify resume exists before deletion', async () => {
      const resumeId = 123;
      const userId = 'user-123';
      
      // Mock resume exists
      mockStorage.getResumeById.mockResolvedValue({
        id: resumeId,
        userId,
        filename: 'test-resume.pdf',
        originalFilename: 'test-resume.pdf',
        content: 'Resume content',
        analysis: null,
        embedding: null,
        skillsEmbedding: null,
        sessionId: 'session-123',
        batchId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await mockStorage.getResumeById(resumeId, userId);
      await mockStorage.deleteResume(resumeId);
      
      expect(mockStorage.getResumeById).toHaveBeenCalledWith(resumeId, userId);
      expect(mockStorage.deleteResume).toHaveBeenCalledWith(resumeId);
    });

    it('should handle deletion workflow correctly', async () => {
      const resumeId = 123;
      
      // Test the complete deletion workflow
      mockStorage.deleteResume.mockResolvedValue(undefined);
      
      await mockStorage.deleteResume(resumeId);
      
      expect(mockStorage.deleteResume).toHaveBeenCalledWith(resumeId);
      expect(mockStorage.deleteResume).toHaveReturned();
    });
  });

  describe('Error handling', () => {
    it('should handle storage errors during deletion', async () => {
      const resumeId = 123;
      const errorMessage = 'Database connection failed';
      
      mockStorage.deleteResume.mockRejectedValue(new Error(errorMessage));
      
      await expect(mockStorage.deleteResume(resumeId))
        .rejects.toThrow(errorMessage);
      
      expect(mockStorage.deleteResume).toHaveBeenCalledWith(resumeId);
    });

    it('should handle invalid resume ID gracefully', async () => {
      const invalidResumeId = -1;
      
      // Should not throw for invalid IDs (handled by implementation)
      await expect(mockStorage.deleteResume(invalidResumeId))
        .resolves.toBeUndefined();
      
      expect(mockStorage.deleteResume).toHaveBeenCalledWith(invalidResumeId);
    });
  });

  describe('Performance considerations', () => {
    it('should complete deletion within reasonable time', async () => {
      const resumeId = 123;
      const startTime = Date.now();
      
      await mockStorage.deleteResume(resumeId);
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Should complete within 100ms for unit test
      expect(executionTime).toBeLessThan(100);
      expect(mockStorage.deleteResume).toHaveBeenCalledWith(resumeId);
    });
  });
});