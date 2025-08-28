/**
 * Database Mock for Integration Tests
 * Provides complete database mocking that mimics the real database interface
 */

import { jest } from '@jest/globals';

// Mock data storage
interface MockData {
  users: Map<string, any>;
  resumes: Map<number, any>;
  jobDescriptions: Map<number, any>;
  analysisResults: Map<number, any>;
  batches: Map<string, any>;
}

class MockDatabase {
  private static instance: MockDatabase;
  public data: MockData;
  private nextId: number = 1;

  constructor() {
    this.data = {
      users: new Map(),
      resumes: new Map(),
      jobDescriptions: new Map(),
      analysisResults: new Map(),
      batches: new Map(),
    };
  }

  static getInstance(): MockDatabase {
    if (!MockDatabase.instance) {
      MockDatabase.instance = new MockDatabase();
    }
    return MockDatabase.instance;
  }

  reset() {
    this.data = {
      users: new Map(),
      resumes: new Map(),
      jobDescriptions: new Map(),
      analysisResults: new Map(),
      batches: new Map(),
    };
    this.nextId = 1;
  }

  // Mock database query methods
  async query(sql: string, params?: any[]): Promise<{ rows: any[] }> {
    console.log(`Mock DB Query: ${sql.substring(0, 100)}...`);
    
    // Simple query parsing for testing
    if (sql.toLowerCase().includes('select 1')) {
      return { rows: [{ test: 1 }] };
    }
    
    if (sql.toLowerCase().includes('users')) {
      return { rows: Array.from(this.data.users.values()) };
    }
    
    if (sql.toLowerCase().includes('resumes')) {
      return { rows: Array.from(this.data.resumes.values()) };
    }
    
    if (sql.toLowerCase().includes('job_descriptions')) {
      return { rows: Array.from(this.data.jobDescriptions.values()) };
    }
    
    if (sql.toLowerCase().includes('analysis_results')) {
      return { rows: Array.from(this.data.analysisResults.values()) };
    }
    
    return { rows: [] };
  }

  async connect() {
    return {
      query: this.query.bind(this),
      release: () => {},
    };
  }

  // Helper methods for test data creation
  createUser(userData: any) {
    const user = {
      uid: userData.uid || `user_${this.nextId++}`,
      email: userData.email || `test${this.nextId}@example.com`,
      displayName: userData.displayName || `Test User ${this.nextId}`,
      emailVerified: userData.emailVerified ?? true,
      ...userData,
    };
    this.data.users.set(user.uid, user);
    return user;
  }

  createResume(resumeData: any) {
    const resume = {
      id: this.nextId++,
      userId: resumeData.userId,
      filename: resumeData.filename || `resume_${this.nextId}.pdf`,
      content: resumeData.content || 'Mock resume content',
      sessionId: resumeData.sessionId || `session_${Date.now()}`,
      batchId: resumeData.batchId || `batch_${Date.now()}`,
      fileSize: resumeData.fileSize || 1024,
      fileType: resumeData.fileType || 'application/pdf',
      createdAt: new Date(),
      ...resumeData,
    };
    this.data.resumes.set(resume.id, resume);
    
    // Update batch data
    if (resume.batchId) {
      const batch = this.data.batches.get(resume.batchId) || {
        batchId: resume.batchId,
        sessionId: resume.sessionId,
        userId: resume.userId,
        resumeCount: 0,
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      };
      batch.resumeCount++;
      this.data.batches.set(resume.batchId, batch);
    }
    
    return resume;
  }

  createJobDescription(jobData: any) {
    const job = {
      id: this.nextId++,
      userId: jobData.userId,
      title: jobData.title || 'Test Job',
      description: jobData.description || 'Test job description',
      requirements: jobData.requirements || ['JavaScript', 'React'],
      skills: jobData.skills || ['JavaScript', 'React'],
      experience: jobData.experience || '2+ years',
      createdAt: new Date(),
      ...jobData,
    };
    this.data.jobDescriptions.set(job.id, job);
    return job;
  }

  createAnalysisResult(analysisData: any) {
    const analysis = {
      id: this.nextId++,
      userId: analysisData.userId,
      resumeId: analysisData.resumeId,
      jobDescriptionId: analysisData.jobDescriptionId,
      matchPercentage: analysisData.matchPercentage || Math.floor(Math.random() * 100),
      matchedSkills: analysisData.matchedSkills || ['JavaScript'],
      missingSkills: analysisData.missingSkills || ['React'],
      candidateStrengths: analysisData.candidateStrengths || ['Good technical skills'],
      candidateWeaknesses: analysisData.candidateWeaknesses || ['Limited React experience'],
      confidenceLevel: analysisData.confidenceLevel || 'high',
      createdAt: new Date(),
      ...analysisData,
    };
    this.data.analysisResults.set(analysis.id, analysis);
    return analysis;
  }

  findResumesByBatch(batchId: string) {
    return Array.from(this.data.resumes.values()).filter(resume => resume.batchId === batchId);
  }

  findResumesByUser(userId: string) {
    return Array.from(this.data.resumes.values()).filter(resume => resume.userId === userId);
  }

  findBatch(batchId: string) {
    return this.data.batches.get(batchId);
  }

  updateBatchAccess(batchId: string) {
    const batch = this.data.batches.get(batchId);
    if (batch) {
      batch.lastAccessedAt = new Date();
    }
  }

  deleteBatch(batchId: string) {
    const resumes = this.findResumesByBatch(batchId);
    const resumeIds = resumes.map(r => r.id);
    const analysisResults = Array.from(this.data.analysisResults.values()).filter(result => 
      resumeIds.includes(result.resumeId)
    );

    // Delete resumes
    resumes.forEach(resume => this.data.resumes.delete(resume.id));
    
    // Delete analysis results
    analysisResults.forEach(result => this.data.analysisResults.delete(result.id));
    
    // Delete batch
    this.data.batches.delete(batchId);

    return {
      resumes: resumes.length,
      analysisResults: analysisResults.length,
      interviewQuestions: 0,
    };
  }
}

// Create mock functions for database operations
export const mockDatabase = MockDatabase.getInstance();

// Mock the database module
export const mockDatabaseModule = {
  getDatabase: jest.fn(() => ({
    query: mockDatabase.query.bind(mockDatabase),
  })),
  executeQuery: jest.fn(mockDatabase.query.bind(mockDatabase)),
  testConnection: jest.fn(() => Promise.resolve(true)),
  testDatabaseConnection: jest.fn(() => Promise.resolve({ 
    success: true, 
    message: 'Mock database connection successful' 
  })),
  isDatabaseAvailable: jest.fn(() => true),
  initializeDatabase: jest.fn(),
  closeDatabase: jest.fn(),
  getPool: jest.fn(() => ({
    connect: mockDatabase.connect.bind(mockDatabase),
    query: mockDatabase.query.bind(mockDatabase),
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  })),
};

// Setup function to configure mocks
export function setupDatabaseMock() {
  // Mock the database module using Jest
  jest.doMock('../../server/database/index', () => mockDatabaseModule);
  
  console.log('✅ Database mock configured for integration tests');
}

// Cleanup function
export function cleanupDatabaseMock() {
  mockDatabase.reset();
  jest.clearAllMocks();
  console.log('✅ Database mock cleaned up');
}

// Export the mock instance for direct use in tests
export { MockDatabase };