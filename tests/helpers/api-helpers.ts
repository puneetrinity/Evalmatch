/**
 * API Test Helpers
 * Common utilities for API integration testing with Express and Supertest
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';

// Test configuration
export const TEST_CONFIG = {
  timeout: 30000,
  dbConnectionString: process.env.TEST_DATABASE_URL || 'sqlite::memory:',
  jwtSecret: 'test-jwt-secret-key',
  maxFileSize: 10 * 1024 * 1024, // 10MB
};

// Test user interface
export interface TestUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  firebaseToken?: string;
}

// Test resume interface
export interface TestResume {
  id?: number;
  userId: string;
  sessionId?: string;
  batchId?: string;
  filename: string;
  content?: string;
  fileSize?: number;
  fileType?: string;
  skills?: string[];
  experience?: string;
  education?: string[];
  analyzedData?: any;
  createdAt?: string;
}

// Test job description interface
export interface TestJobDescription {
  id?: number;
  userId: string;
  title: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  experience?: string;
  analyzedData?: any;
  createdAt?: string;
}

// Test analysis result interface
export interface TestAnalysisResult {
  id?: number;
  userId: string;
  resumeId: number;
  jobDescriptionId: number;
  overallMatch?: number;
  skillsMatch?: any;
  matchPercentage?: number;
  matchedSkills?: string[];
  missingSkills?: string[];
  candidateStrengths?: string[];
  candidateWeaknesses?: string[];
  confidenceLevel?: number;
  analysis?: any;
  createdAt?: string;
}

// Mock authentication utilities
export class MockAuth {
  static createTestUser(overrides: Partial<TestUser> = {}): TestUser {
    const timestamp = Date.now();
    return {
      uid: `test_user_${timestamp}`,
      email: `test_${timestamp}@example.com`,
      displayName: `Test User ${timestamp}`,
      emailVerified: true,
      ...overrides,
    };
  }

  static generateAuthHeaders(user: TestUser): Record<string, string> {
    const token = jwt.sign(
      {
        uid: user.uid,
        email: user.email,
        email_verified: user.emailVerified,
      },
      TEST_CONFIG.jwtSecret,
      { expiresIn: '1h' }
    );

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  static mockFirebaseAuth() {
    // Mock Firebase Auth for testing
    return {
      verify: jest.fn().mockImplementation((token: string) => {
        try {
          const decoded = jwt.verify(token.replace('Bearer ', ''), TEST_CONFIG.jwtSecret);
          return Promise.resolve(decoded);
        } catch (error) {
          return Promise.reject(new Error('Invalid token'));
        }
      }),
    };
  }
}

// Database test helper
export class DatabaseTestHelper {
  static async setupTestEnvironment() {
    initializeMockDatabase();
    console.log('✅ Mock database environment set up');
  }

  static async teardownTestEnvironment() {
    MockDatabase.reset();
    console.log('✅ Mock database environment torn down');
  }

  static async cleanupTestData() {
    MockDatabase.reset();
    console.log('✅ Mock database data cleaned up');
  }

  static async createTestResume(data: Omit<TestResume, 'id' | 'createdAt'>): Promise<TestResume> {
    const resume = await MockDatabase.createResume(data);
    console.log(`Created test resume: ${resume.filename} (ID: ${resume.id})`);
    return resume;
  }

  static async createTestJobDescription(data: Omit<TestJobDescription, 'id' | 'createdAt'>): Promise<TestJobDescription> {
    const jobDescription = await MockDatabase.createJobDescription(data);
    console.log(`Created test job description: ${jobDescription.title} (ID: ${jobDescription.id})`);
    return jobDescription;
  }

  static async createTestAnalysisResult(data: Omit<TestAnalysisResult, 'id' | 'createdAt'>): Promise<TestAnalysisResult> {
    const analysisResult = await MockDatabase.createAnalysisResult(data);
    console.log(`Created test analysis result (ID: ${analysisResult.id})`);
    return analysisResult;
  }

  static async findTestResume(batchId: string, filename: string): Promise<TestResume | null> {
    const resumes = await MockDatabase.findResumesByBatch(batchId);
    const found = resumes.find(resume => resume.filename === filename);
    console.log(`Finding test resume: ${filename} in batch ${batchId} - ${found ? 'found' : 'not found'}`);
    return found || null;
  }

  static async createTestUser(userData: Partial<TestUser> = {}): Promise<TestUser> {
    const user = await MockDatabase.createUser(userData);
    console.log(`Created test user: ${user.email} (ID: ${user.uid})`);
    return user;
  }

  static async findTestUser(uid: string): Promise<TestUser | null> {
    return await MockDatabase.findUser(uid);
  }

  static async seedTestData() {
    // Create some default test data
    const testUser = await MockDatabase.createUser({
      uid: 'test_user_123',
      email: 'test@example.com',
      displayName: 'Test User',
    });

    const testJob = await MockDatabase.createJobDescription({
      userId: testUser.uid,
      title: 'Senior Software Engineer',
      description: 'Looking for an experienced software engineer with React and Node.js skills',
      requirements: ['React', 'Node.js', 'TypeScript'],
    });

    const batchId = `batch_${Date.now()}_test`;
    const sessionId = `session_${Date.now()}_test`;

    const testResume1 = await MockDatabase.createResume({
      userId: testUser.uid,
      sessionId,
      batchId,
      filename: 'john_doe_resume.pdf',
      content: 'Senior Software Engineer with 5 years experience in React, Node.js, and TypeScript',
    });

    const testResume2 = await MockDatabase.createResume({
      userId: testUser.uid,
      sessionId,
      batchId,
      filename: 'jane_smith_resume.pdf',
      content: 'Full-stack developer with experience in JavaScript, Python, and React',
    });

    await MockDatabase.createAnalysisResult({
      userId: testUser.uid,
      resumeId: testResume1.id!,
      jobDescriptionId: testJob.id!,
      overallMatch: 85,
      skillsMatch: { React: 90, 'Node.js': 85, TypeScript: 80 },
    });

    console.log('✅ Test data seeded successfully');
    
    return {
      user: testUser,
      job: testJob,
      resumes: [testResume1, testResume2],
      batchId,
      sessionId,
    };
  }
}

// Response validation utilities
export class ResponseValidator {
  static validateSuccessResponse(response: any) {
    if (response.status !== 200) {
      throw new Error(`Expected status 200, got ${response.status}`);
    }
    if (response.body?.status !== 'success') {
      throw new Error(`Expected success status, got ${response.body?.status}`);
    }
    if (!response.body?.data) {
      throw new Error('Expected data property in response body');
    }
  }

  static validateErrorResponse(response: any, expectedStatus: number) {
    if (response.status !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
    }
    if (response.body?.success !== false) {
      throw new Error(`Expected success to be false, got ${response.body?.success}`);
    }
    if (!response.body?.message) {
      throw new Error('Expected message property in response body');
    }
  }

  static validateBatchResponse(response: any, expectedBatchId?: string) {
    this.validateSuccessResponse(response);
    if (expectedBatchId && response.body.data?.batchId !== expectedBatchId) {
      throw new Error(`Expected batchId ${expectedBatchId}, got ${response.body.data?.batchId}`);
    }
    if (response.body.data?.valid === undefined) {
      throw new Error('Expected valid property in response data');
    }
    if (!response.body.data?.ownership) {
      throw new Error('Expected ownership property in response data');
    }
  }

  static validateAnalysisResponse(response: any) {
    this.validateSuccessResponse(response);
    if (!response.body.data?.results) {
      throw new Error('Expected results property in response data');
    }
    if (!Array.isArray(response.body.data.results)) {
      throw new Error('Expected results to be an array');
    }
    if (!response.body.data?.metadata) {
      throw new Error('Expected metadata property in response data');
    }
  }

  static validateResumeResponse(response: any) {
    this.validateSuccessResponse(response);
  }

  static validateJobResponse(response: any) {
    this.validateSuccessResponse(response);
  }
}

// Performance testing utilities
export class PerformanceTestHelper {
  static async measureEndpointPerformance(
    requestFn: () => Promise<any>,
    maxDurationMs: number
  ): Promise<{ response: any; duration: number }> {
    const startTime = Date.now();
    const response = await requestFn();
    const duration = Date.now() - startTime;
    
    console.log(`Endpoint responded in ${duration}ms (max: ${maxDurationMs}ms)`);
    return { response, duration };
  }

  static async measureMultipleRequests(
    requestFn: () => Promise<any>,
    requestCount: number
  ): Promise<{ responses: any[]; totalDuration: number; averageDuration: number }> {
    const startTime = Date.now();
    const promises = Array(requestCount).fill(null).map(() => requestFn());
    const responses = await Promise.all(promises);
    const totalDuration = Date.now() - startTime;
    const averageDuration = totalDuration / requestCount;
    
    console.log(`${requestCount} requests completed in ${totalDuration}ms (avg: ${averageDuration.toFixed(2)}ms)`);
    return { responses, totalDuration, averageDuration };
  }

  static async testConcurrentRequests(
    requestFn: () => Promise<any>,
    concurrencyLevel: number
  ): Promise<any[]> {
    const promises = Array(concurrencyLevel).fill(null).map(() => requestFn());
    return Promise.all(promises);
  }
}

// File testing utilities
export class FileTestHelper {
  static createTestFile(filename: string, size: number = 1024): Buffer {
    return Buffer.alloc(size, 'test content');
  }

  static createLargeFile(size: number): Buffer {
    return Buffer.alloc(size, 'x');
  }

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
    app: any,
    user: TestUser,
    endpoint: string,
    filename: string = 'test-resume.pdf',
    fileBuffer?: Buffer,
    additionalFields: Record<string, string> = {}
  ): Promise<any> {
    const buffer = fileBuffer || this.createTestPDFBuffer();
    const authHeaders = MockAuth.generateAuthHeaders(user);

    // This is a mock implementation - in real tests this would use supertest
    return {
      status: 200,
      body: {
        success: true,
        data: {
          id: Date.now(),
          filename,
          fileSize: buffer.length,
          fileType: 'application/pdf'
        }
      }
    };
  }

  static async uploadMultipleTestFiles(
    app: any,
    user: TestUser,
    endpoint: string,
    files: Array<{ filename: string; buffer: Buffer }>,
    additionalFields: Record<string, string> = {}
  ): Promise<any> {
    const authHeaders = MockAuth.generateAuthHeaders(user);

    // This is a mock implementation
    return {
      status: 200,
      body: {
        success: true,
        data: {
          files: files.map((file, index) => ({
            id: Date.now() + index,
            filename: file.filename,
            fileSize: file.buffer.length,
            fileType: 'application/pdf'
          }))
        }
      }
    };
  }
}

// Test suite helper for common setup/teardown
export class TestSuiteHelper {
  static async setupTestEnvironment() {
    await DatabaseTestHelper.setupTestEnvironment();
    
    // Mock global fetch
    global.fetch = jest.fn();
    
    // Mock console methods to reduce noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  }

  static async teardownTestEnvironment() {
    await DatabaseTestHelper.teardownTestEnvironment();
    
    // Restore console methods
    jest.restoreAllMocks();
  }

  static createBatchTestData(userId: string, count = 3) {
    const timestamp = Date.now();
    const batchId = `batch_${timestamp}_test`;
    const sessionId = `session_${timestamp}_test`;
    
    const resumes = Array(count).fill(null).map((_, i) => ({
      userId,
      sessionId,
      batchId,
      filename: `test-resume-${i + 1}.pdf`,
      content: `Mock resume content ${i + 1}`,
      fileSize: 1024 * (i + 1),
      fileType: 'application/pdf',
    }));
    
    return { batchId, sessionId, resumes };
  }
}

// Rate limiting test utilities
export class RateLimitTestHelper {
  static async testRateLimit(
    requestFn: () => Promise<any>,
    maxRequests: number,
    timeWindowMs: number
  ): Promise<{ rateLimited: boolean; responses: any[] }> {
    const requests = maxRequests + 5; // Exceed the limit
    const promises = Array(requests).fill(null).map(() => requestFn());
    
    const responses = await Promise.allSettled(promises);
    const rateLimited = responses.some(result => 
      result.status === 'fulfilled' && result.value.status === 429
    );
    
    console.log(`Rate limit test: ${requests} requests, rate limited: ${rateLimited}`);
    return { 
      rateLimited, 
      responses: responses.map(r => r.status === 'fulfilled' ? r.value : r.reason)
    };
  }
}

// Error simulation utilities
export class ErrorSimulator {
  static simulateNetworkError() {
    return jest.fn().mockRejectedValue(new Error('Network connection failed'));
  }

  static simulateTimeoutError() {
    return jest.fn().mockRejectedValue(new Error('Request timeout'));
  }

  static simulateDatabaseError() {
    return jest.fn().mockRejectedValue(new Error('Database connection failed'));
  }

  static simulateAuthError() {
    return jest.fn().mockRejectedValue(new Error('Authentication failed'));
  }
}

// Mock Database Implementation
export class MockDatabase {
  private static users = new Map<string, any>();
  private static resumes = new Map<number, any>();
  private static jobDescriptions = new Map<number, any>();
  private static analysisResults = new Map<number, any>();
  private static batches = new Map<string, any>();
  private static nextId = 1;

  // Reset all data
  static reset() {
    this.users.clear();
    this.resumes.clear();
    this.jobDescriptions.clear();
    this.analysisResults.clear();
    this.batches.clear();
    this.nextId = 1;
  }

  // User operations
  static async createUser(userData: Partial<TestUser>): Promise<TestUser> {
    const user: TestUser = {
      uid: userData.uid || `user_${this.nextId++}`,
      email: userData.email || `test${this.nextId}@example.com`,
      displayName: userData.displayName || `Test User ${this.nextId}`,
      emailVerified: userData.emailVerified ?? true,
    };
    this.users.set(user.uid, user);
    return user;
  }

  static async findUser(uid: string): Promise<TestUser | null> {
    return this.users.get(uid) || null;
  }

  // Resume operations
  static async createResume(resumeData: Omit<TestResume, 'id'>): Promise<TestResume> {
    const resume: TestResume = {
      id: this.nextId++,
      content: 'Mock resume content',
      fileSize: 1024,
      fileType: 'application/pdf',
      sessionId: resumeData.sessionId || `session_${Date.now()}_${this.nextId}`,
      batchId: resumeData.batchId || `batch_${Date.now()}_${this.nextId}`,
      createdAt: new Date().toISOString(),
      ...resumeData,
    };
    this.resumes.set(resume.id!, resume);
    
    // Update batch resume count
    if (resume.batchId) {
      const batch = this.batches.get(resume.batchId);
      if (batch) {
        batch.resumeCount = (batch.resumeCount || 0) + 1;
      } else {
        this.batches.set(resume.batchId, {
          batchId: resume.batchId,
          sessionId: resume.sessionId,
          userId: resume.userId,
          resumeCount: 1,
          createdAt: new Date(),
          lastAccessedAt: new Date(),
        });
      }
    }
    
    return resume;
  }

  static async findResume(id: number): Promise<TestResume | null> {
    return this.resumes.get(id) || null;
  }

  static async findResumesByBatch(batchId: string): Promise<TestResume[]> {
    return Array.from(this.resumes.values()).filter(resume => resume.batchId === batchId);
  }

  static async findResumesByUser(userId: string): Promise<TestResume[]> {
    return Array.from(this.resumes.values()).filter(resume => resume.userId === userId);
  }

  // Job description operations
  static async createJobDescription(jobData: Omit<TestJobDescription, 'id'>): Promise<TestJobDescription> {
    const job: TestJobDescription = {
      id: this.nextId++,
      requirements: ['JavaScript', 'React'],
      createdAt: new Date().toISOString(),
      ...jobData,
    };
    this.jobDescriptions.set(job.id!, job);
    return job;
  }

  static async findJobDescription(id: number): Promise<TestJobDescription | null> {
    return this.jobDescriptions.get(id) || null;
  }

  // Analysis result operations
  static async createAnalysisResult(analysisData: Omit<TestAnalysisResult, 'id'>): Promise<TestAnalysisResult> {
    const analysis: TestAnalysisResult = {
      id: this.nextId++,
      overallMatch: Math.floor(Math.random() * 100),
      skillsMatch: { JavaScript: 90, React: 85 },
      createdAt: new Date().toISOString(),
      ...analysisData,
    };
    this.analysisResults.set(analysis.id!, analysis);
    return analysis;
  }

  static async findAnalysisResult(id: number): Promise<TestAnalysisResult | null> {
    return this.analysisResults.get(id) || null;
  }

  static async findAnalysisResultsByResume(resumeId: number): Promise<TestAnalysisResult[]> {
    return Array.from(this.analysisResults.values()).filter(result => result.resumeId === resumeId);
  }

  // Batch operations
  static async findBatch(batchId: string): Promise<any | null> {
    return this.batches.get(batchId) || null;
  }

  static async updateBatchAccess(batchId: string): Promise<void> {
    const batch = this.batches.get(batchId);
    if (batch) {
      batch.lastAccessedAt = new Date();
    }
  }

  static async deleteBatch(batchId: string): Promise<{ resumes: number; analysisResults: number; interviewQuestions: number }> {
    const resumes = Array.from(this.resumes.values()).filter(resume => resume.batchId === batchId);
    const resumeIds = resumes.map(r => r.id!);
    const analysisResults = Array.from(this.analysisResults.values()).filter(result => 
      resumeIds.includes(result.resumeId)
    );

    // Delete resumes
    resumes.forEach(resume => this.resumes.delete(resume.id!));
    
    // Delete analysis results
    analysisResults.forEach(result => this.analysisResults.delete(result.id!));
    
    // Delete batch
    this.batches.delete(batchId);

    return {
      resumes: resumes.length,
      analysisResults: analysisResults.length,
      interviewQuestions: 0,
    };
  }

  // Query execution mock
  static async executeQuery<T = unknown>(query: string, params?: unknown[]): Promise<T[]> {
    console.log(`Mock query: ${query.substring(0, 100)}...`);
    
    // Simple query parsing for common operations
    if (query.toLowerCase().includes('select 1')) {
      return [{ test: 1 } as T];
    }
    
    if (query.toLowerCase().includes('users')) {
      return Array.from(this.users.values()) as T[];
    }
    
    if (query.toLowerCase().includes('resumes')) {
      return Array.from(this.resumes.values()) as T[];
    }
    
    if (query.toLowerCase().includes('job_descriptions')) {
      return Array.from(this.jobDescriptions.values()) as T[];
    }
    
    return [] as T[];
  }

  // Connection testing
  static async testConnection(): Promise<boolean> {
    return true;
  }

  static async testDatabaseConnection(): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    return {
      success: true,
      message: 'Mock database connection successful',
      details: {
        connectionCount: 1,
        queryTime: 5,
      },
    };
  }
}

// Database test helper functions
export const initializeMockDatabase = () => {
  MockDatabase.reset();
  
  // Initialize mock database without using jest.doMock
  // The database mocking will be handled in individual test files
};

// Mock middleware for testing
export const mockAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Add mock user to request
  (req as any).user = {
    uid: 'test_user_123',
    email: 'test@example.com',
    emailVerified: true,
  };
  next();
};

export const mockRateLimitMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Simple mock rate limiting
  const rateLimitKey = `${req.ip}_${req.path}`;
  // In real implementation, this would check against a store
  next();
};

// Validation helpers
export const ValidationHelpers = {
  isValidBatchId: (batchId: string): boolean => {
    return /^batch_\d+_[a-zA-Z0-9]+$/.test(batchId);
  },

  isValidSessionId: (sessionId: string): boolean => {
    return /^session_\d+_[a-zA-Z0-9]+$/.test(sessionId);
  },

  isValidEmail: (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
};

// Export commonly used mock data
export const MOCK_DATA = {
  validBatchId: 'batch_1234567890_abc123',
  validSessionId: 'session_1234567890_def456',
  invalidBatchId: 'invalid_batch_format',
  invalidSessionId: 'invalid_session_format',
  
  sampleJobDescription: {
    title: 'Senior Software Engineer',
    description: 'Looking for an experienced software engineer...',
    requirements: ['JavaScript', 'React', 'Node.js', 'TypeScript'],
  },
  
  sampleAnalysisResult: {
    overallMatch: 85,
    skillsMatch: {
      JavaScript: 90,
      React: 88,
      'Node.js': 82,
      TypeScript: 80,
    },
    confidenceLevel: 'high',
  },
};