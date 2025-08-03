/**
 * Database Mock Tests
 * Test the mock database functionality to ensure it works correctly
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockDatabase, DatabaseTestHelper } from '../../helpers/api-helpers';

describe('Mock Database', () => {
  beforeEach(() => {
    MockDatabase.reset();
  });

  describe('User Operations', () => {
    it('should create and find users', async () => {
      const userData = {
        uid: 'test_user_123',
        email: 'test@example.com',
        displayName: 'Test User',
        emailVerified: true,
      };

      const createdUser = await MockDatabase.createUser(userData);
      
      expect(createdUser.uid).toBe(userData.uid);
      expect(createdUser.email).toBe(userData.email);
      expect(createdUser.displayName).toBe(userData.displayName);

      const foundUser = await MockDatabase.findUser(userData.uid);
      expect(foundUser).toEqual(createdUser);
    });

    it('should return null for non-existent users', async () => {
      const user = await MockDatabase.findUser('non_existent');
      expect(user).toBeNull();
    });
  });

  describe('Resume Operations', () => {
    it('should create resumes and update batch counts', async () => {
      const batchId = 'batch_test_123';
      const sessionId = 'session_test_456';
      const userId = 'user_test_789';

      const resumeData = {
        userId,
        sessionId,
        batchId,
        filename: 'test_resume.pdf',
        content: 'Test resume content',
      };

      const createdResume = await MockDatabase.createResume(resumeData);
      
      expect(createdResume.id).toBeDefined();
      expect(createdResume.filename).toBe(resumeData.filename);
      expect(createdResume.batchId).toBe(batchId);

      // Check batch was created/updated
      const batch = await MockDatabase.findBatch(batchId);
      expect(batch).toBeDefined();
      expect(batch.resumeCount).toBe(1);
    });

    it('should find resumes by batch', async () => {
      const batchId = 'batch_test_multi';
      const sessionId = 'session_test_multi';
      const userId = 'user_test_multi';

      // Create multiple resumes in same batch
      await MockDatabase.createResume({
        userId, sessionId, batchId,
        filename: 'resume1.pdf',
      });
      
      await MockDatabase.createResume({
        userId, sessionId, batchId,
        filename: 'resume2.pdf',
      });

      const resumes = await MockDatabase.findResumesByBatch(batchId);
      expect(resumes).toHaveLength(2);
      expect(resumes[0].filename).toBe('resume1.pdf');
      expect(resumes[1].filename).toBe('resume2.pdf');
    });
  });

  describe('Query Execution', () => {
    it('should handle basic queries', async () => {
      const result = await MockDatabase.executeQuery('SELECT 1 as test');
      expect(result).toEqual([{ test: 1 }]);
    });

    it('should return empty array for unknown queries', async () => {
      const result = await MockDatabase.executeQuery('SELECT * FROM unknown_table');
      expect(result).toEqual([]);
    });
  });

  describe('Connection Testing', () => {
    it('should always return successful connection', async () => {
      const isConnected = await MockDatabase.testConnection();
      expect(isConnected).toBe(true);
    });

    it('should return success for database connection test', async () => {
      const result = await MockDatabase.testDatabaseConnection();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Mock database connection successful');
      expect(result.details).toBeDefined();
    });
  });
});

describe('Database Test Helper', () => {
  beforeEach(async () => {
    await DatabaseTestHelper.cleanupTestData();
  });

  it('should seed test data successfully', async () => {
    const seedData = await DatabaseTestHelper.seedTestData();
    
    expect(seedData.user).toBeDefined();
    expect(seedData.job).toBeDefined();
    expect(seedData.resumes).toHaveLength(2);
    expect(seedData.batchId).toBeDefined();
    expect(seedData.sessionId).toBeDefined();

    // Verify data was actually created
    const foundUser = await MockDatabase.findUser(seedData.user.uid);
    expect(foundUser).toEqual(seedData.user);
  });

  it('should create test users through helper', async () => {
    const userData = { email: 'helper-test@example.com' };
    const user = await DatabaseTestHelper.createTestUser(userData);
    
    expect(user.email).toBe(userData.email);
    expect(user.uid).toBeDefined();
  });

  it('should find created test resumes', async () => {
    // Seed some data first
    const seedData = await DatabaseTestHelper.seedTestData();
    
    // Find a resume
    const foundResume = await DatabaseTestHelper.findTestResume(
      seedData.batchId, 
      'john_doe_resume.pdf'
    );
    
    expect(foundResume).toBeDefined();
    expect(foundResume?.filename).toBe('john_doe_resume.pdf');
  });
});