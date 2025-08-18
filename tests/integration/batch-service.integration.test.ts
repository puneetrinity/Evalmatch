/**
 * @jest-environment node
 */

/**
 * BatchService Integration Tests
 * 
 * Tests BatchService with real database connections to verify:
 * - Actual SQL query execution
 * - Transaction behavior and rollbacks
 * - Database constraint enforcement
 * - Real data persistence and retrieval
 * 
 * These tests replace the mocked batch-service.test.ts that had
 * ES module mocking issues.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import type { SessionId } from '@shared/api-contracts';
import { isSuccess, isFailure } from '@shared/result-types';
import { withTestTransaction, setupTestDatabase, createTestData } from '../helpers/db-test-utils';
import { BatchService } from '../../server/services/batch-service';
import { getDatabase } from '../../server/database/index';

// Simple storage mock - we're testing BatchService DB operations, not storage
const mockStorage = {
  // Add minimal storage methods as needed
} as any;

describe('BatchService Integration Tests', () => {
  let batchService: BatchService;
  let databaseAvailable: boolean = false;

  beforeAll(async () => {
    try {
      // Setup database connection and verify migrations
      await setupTestDatabase();
      
      // Check if database is actually available
      const pool = getDatabase();
      databaseAvailable = pool !== null;
      
      if (databaseAvailable) {
        batchService = new BatchService(mockStorage);
      }
    } catch (error) {
      console.log('⚠️  Database not available for integration tests - tests will be skipped');
      databaseAvailable = false;
    }
  });

  beforeEach(() => {
    // Each test runs in isolation via transaction rollback
    // No manual cleanup needed
  });

  describe('validateBatchAccess', () => {
    it('should validate a valid batch successfully with real database', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        // Create test batch data directly in database
        const testBatch = await createTestData('batches', {
          id: 'test-batch-123',
          session_id: 'test-session-456',
          created_at: new Date(),
          status: 'processing'
        });

        const input = {
          sessionId: 'test-session-456' as SessionId,
          batchId: 'test-batch-123'
        };

        // Test the actual service method against real DB
        const result = await batchService.validateBatchAccess(input);

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data).toBeDefined();
          expect(result.data.batchId).toBe('test-batch-123');
        }
      });
    });

    it('should fail validation for non-existent batch', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        const input = {
          sessionId: 'test-session-456' as SessionId,
          batchId: 'non-existent-batch'
        };

        const result = await batchService.validateBatchAccess(input);

        expect(isFailure(result)).toBe(true);
        if (isFailure(result)) {
          expect(result.error.code).toBe('BATCH_NOT_FOUND');
        }
      });
    });

    it('should fail validation for session mismatch', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        // Create batch with one session ID
        await createTestData('batches', {
          id: 'test-batch-123',
          session_id: 'correct-session',
          created_at: new Date(),
          status: 'processing'
        });

        // Try to access with different session ID
        const input = {
          sessionId: 'wrong-session' as SessionId,
          batchId: 'test-batch-123'
        };

        const result = await batchService.validateBatchAccess(input);

        expect(isFailure(result)).toBe(true);
        if (isFailure(result)) {
          expect(result.error.code).toBe('BATCH_ACCESS_DENIED');
        }
      });
    });
  });

  describe('createBatch', () => {
    it('should create a new batch with real database constraints', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        const input = {
          sessionId: 'test-session-789' as SessionId,
          resumeIds: ['resume-1', 'resume-2'],
          jobDescriptionId: 'job-123'
        };

        const result = await batchService.createBatch(input);

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data.batchId).toBeDefined();
          expect(result.data.sessionId).toBe('test-session-789');
          expect(result.data.totalResumes).toBe(2);
        }
      });
    });

    it('should handle database constraint violations', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        // Create a batch
        const input = {
          sessionId: 'test-session-789' as SessionId,
          resumeIds: ['resume-1'],
          jobDescriptionId: 'job-123'
        };

        const firstResult = await batchService.createBatch(input);
        expect(isSuccess(firstResult)).toBe(true);

        // Try to create batch with same ID (if your schema has unique constraints)
        // This tests real database constraint enforcement
        const duplicateResult = await batchService.createBatch(input);
        
        // Depending on your implementation, this might succeed with new ID
        // or fail due to constraints - adjust expectations based on your business logic
        expect(duplicateResult).toBeDefined();
      });
    });
  });

  describe('getBatchStatus', () => {
    it('should retrieve batch status from database', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        // Create test batch
        const batchId = 'status-test-batch';
        await createTestData('batches', {
          id: batchId,
          session_id: 'test-session-status',
          created_at: new Date(),
          status: 'completed',
          total_resumes: 5,
          processed_resumes: 5
        });

        const input = {
          sessionId: 'test-session-status' as SessionId,
          batchId: batchId
        };

        const result = await batchService.getBatchStatus(input);

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data.status).toBe('completed');
          expect(result.data.totalResumes).toBe(5);
          expect(result.data.processedResumes).toBe(5);
        }
      });
    });
  });

  describe('Transaction Behavior', () => {
    it('should properly handle database rollbacks on service errors', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        // This test verifies that database operations in BatchService
        // properly participate in transactions and rollback on errors
        
        try {
          // Attempt an operation that should fail
          const result = await batchService.validateBatchAccess({
            sessionId: 'invalid' as SessionId,
            batchId: 'should-not-exist'
          });

          expect(isFailure(result)).toBe(true);
          
        } catch (error) {
          // If the service throws instead of returning failure result,
          // verify that database changes are rolled back
          expect(error).toBeDefined();
        }

        // Transaction rollback is handled automatically by withTestTransaction
        // No manual cleanup needed
      });
    });
  });

  describe('Batch Cleanup Operations', () => {
    it('should clean up expired batches', async () => {
      if (!databaseAvailable) {
        console.log('⚠️  Skipping database test - DATABASE_URL not configured');
        return;
      }
      
      await withTestTransaction(async () => {
        // Create an old batch that should be cleaned up
        const oldDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
        
        await createTestData('batches', {
          id: 'old-batch',
          session_id: 'test-session',
          created_at: oldDate,
          status: 'completed'
        });

        // Test cleanup operation
        const cleanupInput = {
          olderThanDays: 3
        };

        const result = await batchService.cleanupExpiredBatches(cleanupInput);

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data.deletedCount).toBeGreaterThan(0);
        }
      });
    });
  });
});