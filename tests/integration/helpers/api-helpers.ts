/**
 * API Test Helpers and Utilities
 * Comprehensive helper functions for integration testing
 */

import { Express } from 'express';
import request from 'supertest';
import { createReadStream } from 'fs';
import { join } from 'path';
import { storage } from '../../../server/storage.js';
import { logger } from '../../../server/lib/logger.js';

// Test data interfaces
export interface TestUser {
  uid: string;
  email: string;
  displayName: string;
  firebaseToken?: string;
}

export interface TestResume {
  id?: number;
  userId: string;
  sessionId: string;
  batchId: string;
  filename: string;
  fileSize: number;
  fileType: string;
  content: string;
  skills?: string[];
  experience?: string;
  education?: string[];
  analyzedData?: any;
}

export interface TestJobDescription {
  id?: number;
  userId: string;
  title: string;
  description: string;
  skills?: string[];
  requirements?: string[];
  experience?: string;
  analyzedData?: any;
}

export interface TestAnalysisResult {
  id?: number;
  userId: string;
  resumeId: number;
  jobDescriptionId: number;
  matchPercentage: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  candidateStrengths?: string[];
  candidateWeaknesses?: string[];
  confidenceLevel?: number;
  analysis?: any;
}

// Test configuration
export const TEST_CONFIG = {
  timeout: 30000,
  retries: 3,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  supportedFileTypes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'image/jpeg',
    'image/png'
  ]
};

// Mock Firebase authentication
export class MockAuth {
  private static mockUsers: Map<string, TestUser> = new Map();

  static createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    const testUser: TestUser = {
      uid: `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email: `test${Date.now()}@example.com`,
      displayName: 'Test User',
      firebaseToken: `mock_token_${Date.now()}`,
      ...overrides
    };
    
    this.mockUsers.set(testUser.uid, testUser);
    return testUser;
  }

  static getTestUser(uid: string): TestUser | undefined {
    return this.mockUsers.get(uid);
  }

  static clearTestUsers(): void {
    this.mockUsers.clear();
  }

  static generateAuthHeaders(user: TestUser): Record<string, string> {
    return {
      'Authorization': `Bearer ${user.firebaseToken}`,
      'X-User-ID': user.uid,
      'Content-Type': 'application/json'
    };
  }
}

// Database test helpers
export class DatabaseTestHelper {
  static async cleanupTestData(): Promise<void> {
    try {
      // Delete in correct order to avoid foreign key constraints
      await storage.executeQuery('DELETE FROM interview_questions WHERE resume_id IN (SELECT id FROM resumes WHERE user_id LIKE $1)', ['test_user_%']);
      await storage.executeQuery('DELETE FROM analysis_results WHERE user_id LIKE $1', ['test_user_%']);
      await storage.executeQuery('DELETE FROM resumes WHERE user_id LIKE $1', ['test_user_%']);
      await storage.executeQuery('DELETE FROM job_descriptions WHERE user_id LIKE $1', ['test_user_%']);
      
      logger.info('Test data cleanup completed');
    } catch (error) {
      logger.error('Test data cleanup failed:', error);
      throw error;
    }
  }

  static async createTestResume(resumeData: Partial<TestResume>): Promise<TestResume> {
    const defaultData: TestResume = {
      userId: MockAuth.createTestUser().uid,
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      batchId: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      filename: 'test-resume.pdf',
      fileSize: 1024,
      fileType: 'application/pdf',
      content: 'Test resume content with JavaScript, Python, and Node.js experience.',
      skills: ['JavaScript', 'Python', 'Node.js'],
      experience: '3 years',
      education: ['Bachelor of Computer Science'],
      analyzedData: {
        skills: ['JavaScript', 'Python', 'Node.js'],
        experience: '3 years',
        education: ['Bachelor of Computer Science']
      }
    };

    const testResume = { ...defaultData, ...resumeData };
    const created = await storage.createResume(testResume);
    return { ...testResume, id: created.id };
  }

  static async createTestJobDescription(jobData: Partial<TestJobDescription>): Promise<TestJobDescription> {
    const defaultData: TestJobDescription = {
      userId: MockAuth.createTestUser().uid,
      title: 'Software Developer',
      description: 'Looking for a software developer with experience in JavaScript, React, and Node.js.',
      skills: ['JavaScript', 'React', 'Node.js'],
      requirements: ['3+ years experience', 'Bachelor degree'],
      experience: '3+ years',
      analyzedData: {
        skills: ['JavaScript', 'React', 'Node.js'],
        requirements: ['3+ years experience', 'Bachelor degree'],
        experience: '3+ years'
      }
    };

    const testJob = { ...defaultData, ...jobData };
    const created = await storage.createJobDescription(testJob);
    return { ...testJob, id: created.id };
  }

  static async createTestAnalysisResult(analysisData: Partial<TestAnalysisResult>): Promise<TestAnalysisResult> {
    const defaultData: TestAnalysisResult = {
      userId: MockAuth.createTestUser().uid,
      resumeId: 1,
      jobDescriptionId: 1,
      matchPercentage: 85,
      matchedSkills: ['JavaScript', 'Node.js'],
      missingSkills: ['React'],
      candidateStrengths: ['Strong backend experience'],
      candidateWeaknesses: ['Limited frontend experience'],
      confidenceLevel: 0.9,
      analysis: {
        matchPercentage: 85,
        confidence: 0.9,
        reasoning: 'Good match based on technical skills'
      }
    };

    const testAnalysis = { ...defaultData, ...analysisData };
    const created = await storage.createAnalysisResult(testAnalysis);
    return { ...testAnalysis, id: created.id };
  }
}

// File upload helpers
export class FileTestHelper {
  static createTestPDFBuffer(): Buffer {
    // Simple PDF header - enough for testing file upload validation
    const pdfHeader = '%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000125 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n196\n%%EOF';
    return Buffer.from(pdfHeader);
  }

  static createTestDocxBuffer(): Buffer {
    // Minimal DOCX file structure (ZIP format with minimal content)
    const docxContent = 'UEsDBAoAAAAAAMNAaU0AAAAAAAAAAAAAAAAJAAAAZG9jUHJvcHMvUEsDBBQAAAAIAMNAaU27DQAABgEAAAkAAABkb2NQcm9wcy9hcHAueG1sTY/NCsIwEISfJXsPyf4hiLQpeKhQwYsXb22LFyEE2qRJrPj2mrS09uAwM9/szLJzQHYJz9YYrXghCUQIJ6217KLtK1lANl0uOJ0ulxgaWyYdcLSKZ1sljcR47e8xdGi1bCNJWIenJOCPWMRNw9oOOlTnR02hPYH2P5L16r7XGp4/8PuGgFCXnhOWYB+YUH9fCJFLhKh54z8lNBfr9fv1CQnJlNAgxqLiEFPcaKs7W8mfCQWbdDpE4JwqjTJSv3dA8j/2m50QG4Jrz5J35Hta/wBQSwMEFAAAAAgAw0BpTbsNAAAGAQAACQAAAGRvY1Byb3BzL2NvcmUueG1sTY/NCsIwEISfJXsPyf4hiLQpeKhQwYsXb22LFyEE2qRJrPj2mrS09uAwM9/szLJzQHYJz9YYrXghCUQIJ6217KLtK1lANl0uOJ0ulxgaWyYdcLSKZ1sljcR47e8xdGi1bCNJWIenJOCPWMRNw9oOOlTnR02hPYH2P5L16r7XGp4/8PuGgFCXnhOWYB+YUH9fCJFLhKh54z8lNBfr9fv1CQnJlNAgxqLiEFPcaKs7W8mfCQWbdDpE4JwqjTJSv3dA8j/2m50QG4Jrz5J35Hta/wBQSwECFAAKAAAAAADDQGlNAAAAAAAAAAAAAAAACQAAAAAAAAAAABAA/UFBAAAAZG9jUHJvcHMvUEsBAhQAFAAAAAgAw0BpTbsNAAAGAQAACQAAAAAAAAAAABAAfQFqAAAAZG9jUHJvcHMvYXBwLnhtbFBLAQIUABQAAAAIAMNAaU27DQAABgEAAAkAAAAAAAAAAAAQAH0B2wAAAGRvY1Byb3BzL2NvcmUueG1sUEsFBgAAAAADAAMAqwAAAEwBAAAAAA==';
    return Buffer.from(docxContent, 'base64');
  }

  static createTestImageBuffer(): Buffer {
    // 1x1 pixel PNG image
    const pngData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    return Buffer.from(pngData, 'base64');
  }

  static createTestTextFile(): Buffer {
    const content = `
John Doe
Software Developer

EXPERIENCE:
- 3 years of experience in JavaScript and Node.js
- Worked with React and Redux
- Database experience with PostgreSQL

EDUCATION:
- Bachelor of Computer Science from University

SKILLS:
- JavaScript
- Node.js
- React
- PostgreSQL
- Git
`;
    return Buffer.from(content);
  }

  static async uploadTestFile(
    app: Express,
    user: TestUser,
    endpoint: string,
    filename: string = 'test-resume.pdf',
    fileBuffer?: Buffer,
    additionalFields: Record<string, string> = {}
  ): Promise<request.Response> {
    const buffer = fileBuffer || this.createTestPDFBuffer();
    const authHeaders = MockAuth.generateAuthHeaders(user);

    const req = request(app)
      .post(endpoint)
      .set(authHeaders);

    // Add additional form fields
    Object.entries(additionalFields).forEach(([key, value]) => {
      req.field(key, value);
    });

    return req.attach('file', buffer, filename);
  }

  static async uploadMultipleTestFiles(
    app: Express,
    user: TestUser,
    endpoint: string,
    files: Array<{ filename: string; buffer: Buffer }>,
    additionalFields: Record<string, string> = {}
  ): Promise<request.Response> {
    const authHeaders = MockAuth.generateAuthHeaders(user);

    const req = request(app)
      .post(endpoint)
      .set(authHeaders);

    // Add additional form fields
    Object.entries(additionalFields).forEach(([key, value]) => {
      req.field(key, value);
    });

    // Attach multiple files
    files.forEach(({ filename, buffer }) => {
      req.attach('files', buffer, filename);
    });

    return req;
  }
}

// API response validation helpers
export class ResponseValidator {
  static validateSuccessResponse(response: request.Response, expectedStatus: number = 200): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.body.success).toBe(true);
    expect(response.body.timestamp || response.body.data?.timestamp).toBeDefined();
  }

  static validateErrorResponse(response: request.Response, expectedStatus: number): void {
    expect(response.status).toBe(expectedStatus);
    expect(response.body.success).toBe(false);
    expect(response.body.error || response.body.message).toBeDefined();
  }

  static validateResumeResponse(response: request.Response): void {
    this.validateSuccessResponse(response);
    expect(response.body.data).toBeDefined();
    
    const resume = response.body.data;
    expect(resume.id).toBeDefined();
    expect(resume.filename).toBeDefined();
    expect(resume.fileSize).toBeDefined();
    expect(resume.fileType).toBeDefined();
  }

  static validateJobResponse(response: request.Response): void {
    this.validateSuccessResponse(response);
    expect(response.body.jobDescription || response.body.data).toBeDefined();
    
    const job = response.body.jobDescription || response.body.data;
    expect(job.id).toBeDefined();
    expect(job.title).toBeDefined();
    expect(job.description).toBeDefined();
  }

  static validateAnalysisResponse(response: request.Response): void {
    this.validateSuccessResponse(response);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.results).toBeDefined();
    expect(Array.isArray(response.body.data.results)).toBe(true);
  }

  static validateBatchResponse(response: request.Response): void {
    this.validateSuccessResponse(response);
    expect(response.body.data).toBeDefined();
    expect(response.body.data.batchId).toBeDefined();
    expect(response.body.data.results).toBeDefined();
  }
}

// Performance testing helpers
export class PerformanceTestHelper {
  static async measureEndpointPerformance(
    testFn: () => Promise<request.Response>,
    maxDurationMs: number = 5000
  ): Promise<{ response: request.Response; duration: number }> {
    const startTime = Date.now();
    const response = await testFn();
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(maxDurationMs);
    return { response, duration };
  }

  static async testConcurrentRequests(
    testFn: () => Promise<request.Response>,
    concurrency: number = 5
  ): Promise<request.Response[]> {
    const promises = Array(concurrency).fill(null).map(() => testFn());
    return Promise.all(promises);
  }
}

// Mock external services
export class MockServiceHelper {
  static mockAIAnalysisSuccess() {
    // Mock successful AI analysis
    jest.mock('../../../server/lib/tiered-ai-provider.js', () => ({
      analyzeResumeParallel: jest.fn().mockResolvedValue({
        skills: ['JavaScript', 'Node.js', 'React'],
        experience: '3 years',
        education: ['Bachelor of Computer Science'],
        summary: 'Experienced software developer'
      }),
      analyzeJobDescription: jest.fn().mockResolvedValue({
        skills: ['JavaScript', 'React', 'Node.js'],
        requirements: ['3+ years experience'],
        experience: '3+ years',
        category: 'Software Development'
      }),
      analyzeMatch: jest.fn().mockResolvedValue({
        matchPercentage: 85,
        matchedSkills: ['JavaScript', 'Node.js'],
        missingSkills: ['React'],
        candidateStrengths: ['Strong backend experience'],
        candidateWeaknesses: ['Limited frontend experience'],
        confidenceLevel: 0.9
      })
    }));
  }

  static mockAIAnalysisFailure() {
    // Mock AI analysis failure
    jest.mock('../../../server/lib/tiered-ai-provider.js', () => ({
      analyzeResumeParallel: jest.fn().mockRejectedValue(new Error('AI service unavailable')),
      analyzeJobDescription: jest.fn().mockRejectedValue(new Error('AI service unavailable')),
      analyzeMatch: jest.fn().mockRejectedValue(new Error('AI service unavailable'))
    }));
  }

  static restoreAIMocks() {
    jest.restoreAllMocks();
  }
}

// Test suite utilities
export class TestSuiteHelper {
  static async setupTestEnvironment(): Promise<void> {
    // Clear any existing test data
    await DatabaseTestHelper.cleanupTestData();
    MockAuth.clearTestUsers();
    
    // Setup fresh test environment
    logger.info('Test environment setup completed');
  }

  static async teardownTestEnvironment(): Promise<void> {
    // Cleanup test data
    await DatabaseTestHelper.cleanupTestData();
    MockAuth.clearTestUsers();
    MockServiceHelper.restoreAIMocks();
    
    logger.info('Test environment teardown completed');
  }

  static createTestTimeout(ms: number = TEST_CONFIG.timeout): number {
    return ms;
  }

  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = TEST_CONFIG.retries,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }
}

// Export all utilities
export {
  TEST_CONFIG,
  MockAuth,
  DatabaseTestHelper,
  FileTestHelper,
  ResponseValidator,
  PerformanceTestHelper,
  MockServiceHelper,
  TestSuiteHelper
};