import { BatchService } from '../server/services/batch-service';
import { success, failure, isSuccess, isFailure } from '@shared/result-types';
import { AppNotFoundError } from '@shared/errors';
import type { SessionId } from '@shared/api-contracts';

// Mock dependencies
const mockExecuteQuery = jest.fn();
const mockTransaction = jest.fn();

jest.mock('../server/database/index', () => ({
  getDatabase: () => ({
    transaction: mockTransaction
  }),
  executeQuery: mockExecuteQuery
}));

jest.mock('../server/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('BatchService', () => {
  let batchService: BatchService;
  const mockStorage = {} as any;

  beforeEach(() => {
    batchService = new BatchService(mockStorage);
    jest.clearAllMocks();
  });

  describe('validateBatchAccess', () => {
    it('should validate a valid batch successfully', async () => {
      mockExecuteQuery.mockImplementation((query: string) => {
        if (query.includes('COUNT(r.id) as resume_count')) {
          return Promise.resolve([{
            batch_id: 'batch_123',
            session_id: 'session_123',
            user_id: 'user_123',
            resume_count: '5',
            created_at: new Date(),
            last_updated: new Date(),
            analysis_count: '3'
          }]);
        }
        if (query.includes('empty_content')) {
          return Promise.resolve([{
            empty_content: '0',
            empty_filename: '0',
            unanalyzed: '2',
            total: '5'
          }]);
        }
        return Promise.resolve([]);
      });

      const result = await batchService.validateBatchAccess({
        batchId: 'batch_123',
        sessionId: 'session_123' as SessionId,
        userId: 'user_123'
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.valid).toBe(true);
        expect(result.data.status).toBe('active');
        expect(result.data.resumeCount).toBe(5);
        expect(result.data.analysisCount).toBe(3);
      }
    });

    it('should return not found for non-existent batch', async () => {
      mockExecuteQuery.mockResolvedValue([]);

      const result = await batchService.validateBatchAccess({
        batchId: 'batch_not_exist',
        sessionId: 'session_123' as SessionId,
        userId: 'user_123'
      });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('getBatchResumes', () => {
    it('should retrieve batch resumes with pagination', async () => {
      mockExecuteQuery.mockImplementation((query: string) => {
        if (query.includes('ORDER BY r.created_at DESC')) {
          return Promise.resolve([
            {
              id: 1,
              filename: 'resume1.pdf',
              file_size: 1024,
              file_type: 'application/pdf',
              analyzed_data: null,
              created_at: new Date(),
              updated_at: new Date(),
              has_analysis: false
            },
            {
              id: 2,
              filename: 'resume2.pdf',
              file_size: 2048,
              file_type: 'application/pdf',
              analyzed_data: {},
              created_at: new Date(),
              updated_at: new Date(),
              has_analysis: true
            }
          ]);
        }
        if (query.includes('COUNT(*) as total')) {
          return Promise.resolve([{ total: '2' }]);
        }
        return Promise.resolve([]);
      });

      const result = await batchService.getBatchResumes({
        batchId: 'batch_123',
        sessionId: 'session_123' as SessionId,
        offset: 0,
        limit: 10
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.resumes).toHaveLength(2);
        expect(result.data.metadata.totalCount).toBe(2);
        expect(result.data.metadata.analyzedCount).toBe(1);
        expect(result.data.pagination?.hasMore).toBe(false);
      }
    });
  });

  describe('claimBatch', () => {
    it('should successfully claim an orphaned batch', async () => {
      mockTransaction.mockImplementation(async (fn: Function) => {
        const mockTx = {
          execute: jest.fn().mockImplementation((query: string) => {
            if (query.includes('GROUP BY r.batch_id')) {
              return Promise.resolve([{
                batch_id: 'batch_123',
                session_id: 'old_session',
                user_id: null,
                resume_count: '3',
                created_at: new Date(Date.now() - 48 * 60 * 60 * 1000),
                last_updated: new Date(Date.now() - 48 * 60 * 60 * 1000),
                hours_inactive: '48'
              }]);
            }
            if (query.includes('UPDATE resumes')) {
              return Promise.resolve([
                { id: 1 }, { id: 2 }, { id: 3 }
              ]);
            }
            if (query.includes('UPDATE analysis_results')) {
              return Promise.resolve({ rowsAffected: 2 });
            }
            return Promise.resolve([]);
          })
        };
        return fn(mockTx);
      });

      const result = await batchService.claimBatch({
        batchId: 'batch_123',
        newSessionId: 'new_session' as SessionId,
        newUserId: 'new_user',
        force: false
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.resumeCount).toBe(3);
        expect(result.data.analysisResultsUpdated).toBe(2);
        expect(result.data.newSessionId).toBe('new_session');
      }
    });
  });

  describe('deleteBatch', () => {
    it('should delete batch with cascade', async () => {
      mockTransaction.mockImplementation(async (fn: Function) => {
        const mockTx = {
          execute: jest.fn().mockImplementation((query: string) => {
            if (query.includes('COUNT(r.id) as resume_count')) {
              return Promise.resolve([{
                resume_count: '5',
                analysis_count: '3',
                interview_count: '2'
              }]);
            }
            if (query.includes('DELETE FROM interview_questions')) {
              return Promise.resolve({ rowsAffected: 2 });
            }
            if (query.includes('DELETE FROM analysis_results')) {
              return Promise.resolve({ rowsAffected: 3 });
            }
            if (query.includes('DELETE FROM resumes')) {
              return Promise.resolve([
                { filename: 'resume1.pdf' },
                { filename: 'resume2.pdf' },
                { filename: 'resume3.pdf' },
                { filename: 'resume4.pdf' },
                { filename: 'resume5.pdf' }
              ]);
            }
            return Promise.resolve([]);
          })
        };
        return fn(mockTx);
      });

      const result = await batchService.deleteBatch({
        batchId: 'batch_123',
        sessionId: 'session_123' as SessionId,
        userId: 'user_123',
        cascade: true
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.deletedCounts.resumes).toBe(5);
        expect(result.data.deletedCounts.analyses).toBe(3);
        expect(result.data.deletedCounts.metadata).toBe(2);
      }
    });
  });

  describe('findCleanupCandidates', () => {
    it('should find batches eligible for cleanup', async () => {
      mockExecuteQuery.mockResolvedValue([
        {
          batch_id: 'batch_old1',
          session_id: 'session_old1',
          user_id: null,
          resume_count: '10',
          created_at: new Date(Date.now() - 168 * 60 * 60 * 1000),
          last_updated: new Date(Date.now() - 168 * 60 * 60 * 1000),
          hours_inactive: '168',
          total_size: '10240'
        },
        {
          batch_id: 'batch_old2',
          session_id: 'session_old2',
          user_id: 'user_old',
          resume_count: '5',
          created_at: new Date(Date.now() - 72 * 60 * 60 * 1000),
          last_updated: new Date(Date.now() - 72 * 60 * 60 * 1000),
          hours_inactive: '72',
          total_size: '5120'
        }
      ]);

      const result = await batchService.findCleanupCandidates(24);

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.totalCandidates).toBe(2);
        expect(result.data.estimatedSpaceSavings).toBe(15360);
        expect(result.data.candidates[0].recommendedAction).toBe('hard_cleanup');
        expect(result.data.candidates[1].recommendedAction).toBe('soft_cleanup');
      }
    });
  });
});