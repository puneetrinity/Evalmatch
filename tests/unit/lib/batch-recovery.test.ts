/**
 * Comprehensive Unit Tests for Batch Recovery System
 * 
 * Tests all functionality including:
 * - Recovery from different sources (localStorage, IndexedDB, server)
 * - Conflict detection and resolution
 * - Progressive recovery workflows
 * - Timeout and cancellation scenarios
 * - Partial recovery scenarios
 */

import {
  BatchRecoveryManager,
  RecoveryResult,
  RecoveryStatus,
  ConflictInfo,
  ConflictResolutionOption,
  RecoverySource,
  RECOVERY_SOURCE_PRIORITY,
  DEFAULT_RECOVERY_CONFIG,
  batchRecoveryManager,
  recoverBatchState,
  progressiveRecovery,
  cancelRecovery,
} from '@/lib/batch-recovery';
import { BatchError } from '@/lib/batch-error-handling';
import { 
  PersistedBatchState, 
  restoreBatchState,
  STORAGE_VERSION 
} from '@/lib/batch-persistence';

// Mock types that don't exist
interface BatchState {
  currentBatchId: string | null;
  sessionId: string | null;
  status: string;
  resumeCount: number;
  isLoading: boolean;
  error: any | null;
  lastValidated: Date | null;
  retryCount: number;
  ownership: any | null;
  securityFlags: string[];
  canClaim: boolean;
  isOrphaned: boolean;
  serverValidated: boolean;
}

// Mock logger
const logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};
import { apiRequest } from '@/lib/queryClient';

// ===== MOCKS =====

// Mock logger
jest.mock('@/lib/error-handling', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock API requests
jest.mock('@/lib/queryClient', () => ({
  apiRequest: jest.fn(),
}));

// Mock batch persistence
jest.mock('@/lib/batch-persistence', () => ({
  ...jest.requireActual('@/lib/batch-persistence'),
  restoreBatchState: jest.fn(),
  STORAGE_VERSION: '1.2.0',
}));

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const mockRestoreBatchState = restoreBatchState as jest.MockedFunction<typeof restoreBatchState>;

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// ===== TEST DATA =====

const mockBatchId = 'batch_test123';
const mockSessionId = 'session_test456';
const mockUserId = 'user_test789';

const mockBatchState: BatchState = {
  currentBatchId: mockBatchId,
  sessionId: mockSessionId as any,
  status: 'ready',
  resumeCount: 3,
  isLoading: false,
  error: null,
  lastValidated: new Date(),
  retryCount: 0,
  ownership: null,
  securityFlags: [],
  canClaim: false,
  isOrphaned: false,
  serverValidated: true,
};

const mockPersistedState: PersistedBatchState = {
  version: STORAGE_VERSION,
  timestamp: Date.now(),
  batchId: mockBatchId,
  sessionId: mockSessionId,
  userId: mockUserId,
  state: mockBatchState,
  metadata: {
    userAgent: 'Test User Agent',
    url: 'https://test.example.com',
    resumeCount: 3,
    lastActivity: Date.now(),
    syncStatus: 'synced',
    checksum: 'test_checksum',
  },
};

const mockServerBatchData = {
  batchId: mockBatchId,
  sessionId: mockSessionId,
  resumeCount: 5,
  status: 'ready',
  lastUpdated: new Date().toISOString(),
};

const mockResumesData = [
  { id: '1', filename: 'resume1.pdf', status: 'processed' },
  { id: '2', filename: 'resume2.pdf', status: 'processed' },
  { id: '3', filename: 'resume3.pdf', status: 'processed' },
];

const mockAnalysisData = {
  results: [
    { id: '1', score: 85, skills: ['JavaScript', 'React'] },
    { id: '2', score: 92, skills: ['Python', 'Django'] },
  ],
};

// ===== TEST HELPERS =====

const createMockResponse = (data: any, status = 200) => {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: { 'Content-Type': 'application/json' },
    })
  );
};

const setupSuccessfulApiMocks = () => {
  mockApiRequest
    .mockResolvedValueOnce(createMockResponse(mockServerBatchData)) // Batch status
    .mockResolvedValueOnce(createMockResponse({ resumes: mockResumesData })) // Resumes
    .mockResolvedValueOnce(createMockResponse(mockAnalysisData)) // Analysis
    .mockResolvedValueOnce(createMockResponse({ metadata: 'test' })); // Metadata
};

// ===== TEST SUITES =====

describe('Batch Recovery System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===== BATCH RECOVERY MANAGER TESTS =====

  describe('BatchRecoveryManager', () => {
    let recoveryManager: BatchRecoveryManager;

    beforeEach(() => {
      recoveryManager = new BatchRecoveryManager({
        maxRecoveryAttempts: 3,
        recoveryTimeoutMs: 10000,
        enableProgressiveRecovery: true,
        enableConflictResolution: true,
        enableAutoRecovery: true,
        backupRetentionDays: 7,
      });
    });

    it('should initialize with correct default configuration', () => {
      const defaultManager = new BatchRecoveryManager();
      
      expect(defaultManager['config']).toEqual(DEFAULT_RECOVERY_CONFIG);
    });

    it('should prevent duplicate recovery operations', async () => {
      mockRestoreBatchState.mockResolvedValue(mockPersistedState);

      // Start first recovery
      const firstRecovery = recoveryManager.recoverBatchState(mockBatchId);

      // Start second recovery immediately
      const secondRecovery = recoveryManager.recoverBatchState(mockBatchId);

      const [result1, result2] = await Promise.all([firstRecovery, secondRecovery]);

      expect(result1).toBe(result2); // Should be the same promise result
      expect(logger.info).toHaveBeenCalledWith(
        'Recovery already in progress, waiting for completion',
        expect.any(Object)
      );
    });

    it('should recover successfully from localStorage', async () => {
      mockRestoreBatchState.mockResolvedValue(mockPersistedState);

      const result = await recoveryManager.recoverBatchState(mockBatchId);

      expect(result.status).toBe('success');
      expect(result.restoredState).toEqual(mockBatchState);
      expect(result.metadata.source).toBe('localStorage');
      expect(result.recoveredItems).toContain('localStorage');
    });

    it('should recover from server when localStorage fails', async () => {
      mockRestoreBatchState.mockResolvedValue(null);
      mockApiRequest.mockResolvedValue(createMockResponse(mockServerBatchData));

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        sessionId: mockSessionId,
        userId: mockUserId,
      });

      expect(result.status).toBe('success');
      expect(result.metadata.source).toBe('server');
      expect(result.restoredState?.resumeCount).toBe(5);
    });

    it('should handle recovery timeout', async () => {
      // Mock slow operation that will timeout
      mockRestoreBatchState.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(null), 15000))
      );

      const recoveryPromise = recoveryManager.recoverBatchState(mockBatchId);

      // Fast-forward past timeout
      jest.advanceTimersByTime(11000);

      const result = await recoveryPromise;

      expect(result.status).toBe('timeout');
      expect(result.warnings).toContain('Recovery timeout exceeded');
    });

    it('should handle partial recovery', async () => {
      // Mock partial data from localStorage
      const partialState = { ...mockBatchState, resumeCount: 0 };
      const partialPersistedState = { ...mockPersistedState, state: partialState };
      
      mockRestoreBatchState.mockResolvedValue(partialPersistedState);

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        allowPartialRecovery: true,
      });

      expect(result.status).toBe('partial');
      expect(result.partialData).toEqual(partialState);
      expect(result.recoveredItems).toContain('localStorage');
    });

    it('should detect and handle conflicts', async () => {
      // Mock conflicting data from different sources
      const localState = { ...mockBatchState, resumeCount: 3 };
      const serverState = { ...mockBatchState, resumeCount: 5 };

      mockRestoreBatchState.mockResolvedValue({
        ...mockPersistedState,
        state: localState,
      });

      mockApiRequest.mockResolvedValue(
        createMockResponse({
          ...mockServerBatchData,
          resumeCount: 5,
        })
      );

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        sessionId: mockSessionId,
        conflictResolution: 'manual',
      });

      expect(result.status).toBe('conflict');
      expect(result.conflictDetails).toBeTruthy();
      expect(result.conflictDetails!.conflictFields).toContain('resumeCount');
    });

    it('should auto-resolve conflicts when enabled', async () => {
      const localState = { ...mockBatchState, resumeCount: 3 };
      
      mockRestoreBatchState.mockResolvedValue({
        ...mockPersistedState,
        state: localState,
      });

      mockApiRequest.mockResolvedValue(
        createMockResponse({
          ...mockServerBatchData,
          resumeCount: 5,
        })
      );

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        sessionId: mockSessionId,
        conflictResolution: 'auto',
      });

      expect(result.status).toBe('success');
      expect(result.restoredState?.resumeCount).toBe(5); // Should use newer value
      expect(result.warnings).toContain(expect.stringContaining('Conflicts auto-resolved'));
    });

    it('should respect preferred source order', async () => {
      mockApiRequest.mockResolvedValue(createMockResponse(mockServerBatchData));
      mockRestoreBatchState.mockResolvedValue(null);

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        preferredSource: 'server',
        sessionId: mockSessionId,
      });

      expect(result.status).toBe('success');
      expect(result.metadata.source).toBe('server');
    });

    it('should handle all sources failing', async () => {
      mockRestoreBatchState.mockResolvedValue(null);
      mockApiRequest.mockRejectedValue(new Error('Server unavailable'));

      const result = await recoveryManager.recoverBatchState(mockBatchId);

      expect(result.status).toBe('failed');
      expect(result.errorDetails).toBeTruthy();
      expect(result.failedItems).toEqual(['localStorage', 'indexedDB', 'server']);
    });

    it('should cancel recovery when requested', async () => {
      // Start a recovery
      const recoveryPromise = recoveryManager.recoverBatchState(mockBatchId);

      // Cancel it immediately
      const cancelled = recoveryManager.cancelRecovery(mockBatchId);

      expect(cancelled).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(
        'Recovery cancelled',
        { batchId: mockBatchId }
      );
    });

    it('should track active recoveries', () => {
      // No active recoveries initially
      expect(recoveryManager.getActiveRecoveries()).toEqual([]);

      // Start recovery
      mockRestoreBatchState.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(null), 1000))
      );

      recoveryManager.recoverBatchState(mockBatchId);

      expect(recoveryManager.getActiveRecoveries()).toContain(mockBatchId);
    });
  });

  // ===== PROGRESSIVE RECOVERY TESTS =====

  describe('Progressive Recovery', () => {
    let recoveryManager: BatchRecoveryManager;

    beforeEach(() => {
      recoveryManager = new BatchRecoveryManager();
    });

    it('should recover all components successfully', async () => {
      setupSuccessfulApiMocks();

      const result = await recoveryManager.progressiveRecovery(mockBatchId, [
        'resumes',
        'analysis',
        'metadata',
      ], {
        sessionId: mockSessionId,
        userId: mockUserId,
      });

      expect(result.recovered.resumes).toEqual(mockResumesData);
      expect(result.recovered.analysis).toEqual(mockAnalysisData);
      expect(result.recovered.metadata).toBeTruthy();
      expect(result.failed).toEqual([]);
    });

    it('should handle partial component recovery', async () => {
      mockApiRequest
        .mockResolvedValueOnce(createMockResponse({ resumes: mockResumesData })) // Resumes success
        .mockRejectedValueOnce(new Error('Analysis not found')) // Analysis fails
        .mockResolvedValueOnce(createMockResponse({ metadata: 'test' })); // Metadata success

      const result = await recoveryManager.progressiveRecovery(mockBatchId, [
        'resumes',
        'analysis',
        'metadata',
      ]);

      expect(result.recovered.resumes).toEqual(mockResumesData);
      expect(result.recovered.metadata).toBeTruthy();
      expect(result.failed).toContain('analysis');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should use default components when none specified', async () => {
      setupSuccessfulApiMocks();

      const result = await recoveryManager.progressiveRecovery(mockBatchId);

      expect(Object.keys(result.recovered)).toEqual(
        expect.arrayContaining(['resumes', 'analysis', 'metadata'])
      );
    });

    it('should handle server errors gracefully', async () => {
      mockApiRequest.mockRejectedValue(new Error('Server error'));

      const result = await recoveryManager.progressiveRecovery(mockBatchId, [
        'resumes',
        'analysis',
        'metadata',
      ]);

      expect(result.recovered).toEqual({});
      expect(result.failed).toEqual(['resumes', 'analysis', 'metadata']);
      expect(result.warnings.length).toBe(3);
    });
  });

  // ===== CONFLICT RESOLUTION TESTS =====

  describe('Conflict Resolution', () => {
    let recoveryManager: BatchRecoveryManager;

    beforeEach(() => {
      recoveryManager = new BatchRecoveryManager();
    });

    it('should detect data conflicts correctly', () => {
      const existingData = { 
        resumeCount: 3, 
        status: 'ready',
        lastValidated: new Date('2023-01-01'),
      };
      const newData = { 
        resumeCount: 5, 
        status: 'ready',
        lastValidated: new Date('2023-01-02'),
      };

      const conflictInfo = (recoveryManager as any).detectConflicts(existingData, newData);

      expect(conflictInfo).toBeTruthy();
      expect(conflictInfo.conflictFields).toContain('resumeCount');
      expect(conflictInfo.conflictFields).toContain('lastValidated');
      expect(conflictInfo.conflictFields).not.toContain('status');
    });

    it('should return null when no conflicts exist', () => {
      const existingData = { resumeCount: 3, status: 'ready' };
      const newData = { resumeCount: 3, status: 'ready' };

      const conflictInfo = (recoveryManager as any).detectConflicts(existingData, newData);

      expect(conflictInfo).toBeNull();
    });

    it('should provide appropriate resolution options', () => {
      const existingData = { resumeCount: 3 };
      const newData = { resumeCount: 5 };

      const conflictInfo = (recoveryManager as any).detectConflicts(existingData, newData);

      expect(conflictInfo.resolutionOptions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'use_newer', action: 'use_remote' }),
          expect.objectContaining({ id: 'use_existing', action: 'use_local' }),
          expect.objectContaining({ id: 'merge_safe', action: 'merge' }),
          expect.objectContaining({ id: 'manual_review', action: 'manual' }),
        ])
      );
    });

    it('should auto-resolve conflicts with correct priority', async () => {
      const conflictInfo: ConflictInfo = {
        type: 'data',
        localState: mockPersistedState,
        remoteState: { ...mockBatchState, resumeCount: 5, status: 'ready' },
        conflictFields: ['resumeCount', 'status'],
        resolutionOptions: [],
      };

      const resolved = await (recoveryManager as any).autoResolveConflicts(
        conflictInfo,
        { resumeCount: 5, status: 'ready' }
      );

      expect(resolved.resumeCount).toBe(5); // Should use newer/higher value
      expect(resolved.status).toBe('ready'); // Should prefer 'ready' status
    });

    it('should preserve errors during conflict resolution', async () => {
      const localError = new Error('Local error');
      const conflictInfo: ConflictInfo = {
        type: 'data',
        localState: {
          ...mockPersistedState,
          state: { ...mockBatchState, error: localError },
        },
        remoteState: { ...mockBatchState, error: null },
        conflictFields: ['error'],
        resolutionOptions: [],
      };

      const resolved = await (recoveryManager as any).autoResolveConflicts(
        conflictInfo,
        { error: null }
      );

      expect(resolved.error).toBe(localError); // Should keep existing error
    });
  });

  // ===== RECOVERY SOURCE TESTS =====

  describe('Recovery Sources', () => {
    let recoveryManager: BatchRecoveryManager;

    beforeEach(() => {
      recoveryManager = new BatchRecoveryManager();
    });

    it('should recover from localStorage/IndexedDB', async () => {
      mockRestoreBatchState.mockResolvedValue(mockPersistedState);

      const result = await (recoveryManager as any).recoverFromStorage(mockBatchId);

      expect(result).toEqual(mockBatchState);
      expect(mockRestoreBatchState).toHaveBeenCalledWith(mockBatchId);
    });

    it('should handle storage recovery failure', async () => {
      mockRestoreBatchState.mockRejectedValue(new Error('Storage error'));

      const result = await (recoveryManager as any).recoverFromStorage(mockBatchId);

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Storage recovery failed',
        expect.any(Object)
      );
    });

    it('should recover from server', async () => {
      mockApiRequest.mockResolvedValue(createMockResponse(mockServerBatchData));

      const result = await (recoveryManager as any).recoverFromServer(
        mockBatchId,
        mockSessionId,
        mockUserId
      );

      expect(result).toBeTruthy();
      expect(result.batchId).toBe(mockBatchId);
      expect(result.resumeCount).toBe(5);
    });

    it('should handle server recovery failure', async () => {
      mockApiRequest.mockResolvedValue(new Response('Not Found', { status: 404 }));

      const result = await (recoveryManager as any).recoverFromServer(
        mockBatchId,
        mockSessionId,
        mockUserId
      );

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        'Server recovery failed',
        expect.any(Object)
      );
    });

    it('should handle network errors during server recovery', async () => {
      mockApiRequest.mockRejectedValue(new Error('Network error'));

      const result = await (recoveryManager as any).recoverFromServer(
        mockBatchId,
        mockSessionId,
        mockUserId
      );

      expect(result).toBeNull();
    });
  });

  // ===== PROGRESSIVE COMPONENT RECOVERY TESTS =====

  describe('Component Recovery', () => {
    let recoveryManager: BatchRecoveryManager;

    beforeEach(() => {
      recoveryManager = new BatchRecoveryManager();
    });

    it('should recover resumes from server', async () => {
      mockApiRequest.mockResolvedValue(
        createMockResponse({ resumes: mockResumesData })
      );

      const result = await (recoveryManager as any).recoverResumes(mockBatchId, {
        sessionId: mockSessionId,
      });

      expect(result).toEqual(mockResumesData);
      expect(mockApiRequest).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining(`/resumes?batchId=${mockBatchId}`)
      );
    });

    it('should recover analysis from server', async () => {
      mockApiRequest.mockResolvedValue(createMockResponse(mockAnalysisData));

      const result = await (recoveryManager as any).recoverAnalysis(mockBatchId, {
        sessionId: mockSessionId,
      });

      expect(result).toEqual(mockAnalysisData);
      expect(mockApiRequest).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining(`/analysis/analyze/1?batchId=${mockBatchId}`)
      );
    });

    it('should handle empty analysis results', async () => {
      mockApiRequest.mockResolvedValue(
        createMockResponse({ results: [] })
      );

      const result = await (recoveryManager as any).recoverAnalysis(mockBatchId, {});

      expect(result).toBeNull();
    });

    it('should recover metadata from server', async () => {
      const mockMetadata = { validation: true, integrity: 'ok' };
      mockApiRequest.mockResolvedValue(createMockResponse(mockMetadata));

      const result = await (recoveryManager as any).recoverMetadata(mockBatchId, {
        sessionId: mockSessionId,
      });

      expect(result).toEqual(mockMetadata);
      expect(mockApiRequest).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining(`/batches/${mockBatchId}/validate`)
      );
    });
  });

  // ===== HELPER FUNCTIONS TESTS =====

  describe('Helper Functions', () => {
    beforeEach(() => {
      // Clear the active recoveries map
      batchRecoveryManager['activeRecoveries'].clear();
    });

    it('should use global recovery manager instance', async () => {
      mockRestoreBatchState.mockResolvedValue(mockPersistedState);

      const result = await recoverBatchState(mockBatchId);

      expect(result.status).toBe('success');
      expect(result.restoredState).toEqual(mockBatchState);
    });

    it('should handle recovery with options', async () => {
      mockRestoreBatchState.mockResolvedValue(null);
      mockApiRequest.mockResolvedValue(createMockResponse(mockServerBatchData));

      const result = await recoverBatchState(mockBatchId, {
        preferredSource: 'server',
        sessionId: mockSessionId,
        allowPartialRecovery: true,
        conflictResolution: 'auto',
      });

      expect(result.status).toBe('success');
      expect(result.metadata.source).toBe('server');
    });

    it('should handle progressive recovery with default options', async () => {
      setupSuccessfulApiMocks();

      const result = await progressiveRecovery(mockBatchId);

      expect(Object.keys(result.recovered)).toHaveLength(3);
      expect(result.failed).toEqual([]);
    });

    it('should cancel recovery using helper function', () => {
      // Start a recovery to have something to cancel
      mockRestoreBatchState.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(null), 1000))
      );

      recoverBatchState(mockBatchId);

      const cancelled = cancelRecovery(mockBatchId);

      expect(cancelled).toBe(true);
    });

    it('should return false when cancelling non-existent recovery', () => {
      const cancelled = cancelRecovery('non_existent_batch');

      expect(cancelled).toBe(false);
    });
  });

  // ===== INTEGRATION TESTS =====

  describe('Integration Tests', () => {
    let recoveryManager: BatchRecoveryManager;

    beforeEach(() => {
      recoveryManager = new BatchRecoveryManager({
        maxRecoveryAttempts: 2,
        recoveryTimeoutMs: 5000,
        enableProgressiveRecovery: true,
        enableConflictResolution: true,
      });
    });

    it('should handle complete recovery workflow', async () => {
      // Setup storage failure, server success
      mockRestoreBatchState.mockResolvedValue(null);
      mockApiRequest.mockResolvedValue(createMockResponse(mockServerBatchData));

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        sessionId: mockSessionId,
        userId: mockUserId,
      });

      expect(result.status).toBe('success');
      expect(result.restoredState?.currentBatchId).toBe(mockBatchId);
      expect(result.metadata.source).toBe('server');
      expect(result.metadata.duration).toBeGreaterThan(0);
    });

    it('should handle complex conflict resolution scenario', async () => {
      const localState = {
        ...mockBatchState,
        resumeCount: 3,
        lastValidated: new Date('2023-01-01'),
        status: 'error' as const,
      };

      const serverState = {
        ...mockServerBatchData,
        resumeCount: 5,
        lastValidated: new Date('2023-01-02'),
        status: 'ready',
      };

      mockRestoreBatchState.mockResolvedValue({
        ...mockPersistedState,
        state: localState,
      });

      mockApiRequest.mockResolvedValue(createMockResponse(serverState));

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        sessionId: mockSessionId,
        conflictResolution: 'auto',
      });

      expect(result.status).toBe('success');
      expect(result.restoredState?.resumeCount).toBe(5); // Newer value
      expect(result.restoredState?.status).toBe('ready'); // Preferred status
    });

    it('should handle recovery with progressive fallback', async () => {
      // Main recovery fails
      mockRestoreBatchState.mockResolvedValue(null);
      mockApiRequest.mockRejectedValue(new Error('Server unavailable'));

      // But progressive recovery succeeds partially
      mockApiRequest
        .mockRejectedValueOnce(new Error('Server unavailable')) // Initial failure
        .mockResolvedValueOnce(createMockResponse({ resumes: mockResumesData })) // Resumes succeed
        .mockRejectedValueOnce(new Error('Analysis unavailable')) // Analysis fails
        .mockResolvedValueOnce(createMockResponse({ metadata: 'recovered' })); // Metadata succeeds

      const mainResult = await recoveryManager.recoverBatchState(mockBatchId);
      expect(mainResult.status).toBe('failed');

      const progressiveResult = await recoveryManager.progressiveRecovery(mockBatchId);
      expect(progressiveResult.recovered.resumes).toEqual(mockResumesData);
      expect(progressiveResult.failed).toContain('analysis');
    });

    it('should handle concurrent recovery operations safely', async () => {
      mockRestoreBatchState.mockResolvedValue(mockPersistedState);

      const recoveries = Array.from({ length: 3 }, () =>
        recoveryManager.recoverBatchState(mockBatchId)
      );

      const results = await Promise.all(recoveries);

      // All should return the same result
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
      expect(results[0].status).toBe('success');
    });

    it('should clean up properly after timeout', async () => {
      mockRestoreBatchState.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(null), 10000))
      );

      const recoveryPromise = recoveryManager.recoverBatchState(mockBatchId);

      expect(recoveryManager.getActiveRecoveries()).toContain(mockBatchId);

      // Fast-forward past timeout
      jest.advanceTimersByTime(6000);

      const result = await recoveryPromise;

      expect(result.status).toBe('timeout');
      expect(recoveryManager.getActiveRecoveries()).not.toContain(mockBatchId);
    });
  });

  // ===== ERROR SCENARIOS TESTS =====

  describe('Error Scenarios', () => {
    let recoveryManager: BatchRecoveryManager;

    beforeEach(() => {
      recoveryManager = new BatchRecoveryManager();
    });

    it('should handle corrupted persisted state', async () => {
      const corruptedState = {
        ...mockPersistedState,
        state: {
          currentBatchId: 'corrupted',
          sessionId: 'corrupted',
          status: 'corrupted',
          resumeCount: 0,
        } as BatchState,
      };

      mockRestoreBatchState.mockResolvedValue(corruptedState);

      const result = await recoveryManager.recoverBatchState(mockBatchId);

      expect(result.status).toBe('failed');
    });

    it('should handle API rate limiting', async () => {
      mockApiRequest.mockResolvedValue(
        new Response('Rate limited', { status: 429 })
      );

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        sessionId: mockSessionId,
      });

      expect(result.status).toBe('failed');
      expect(result.failedItems).toContain('server');
    });

    it('should handle malformed server responses', async () => {
      mockApiRequest.mockResolvedValue(
        new Response('invalid json {', { status: 200 })
      );

      const result = await recoveryManager.recoverBatchState(mockBatchId, {
        sessionId: mockSessionId,
      });

      expect(result.status).toBe('failed');
    });

    it('should handle maximum retry exhaustion', async () => {
      const shortRetryManager = new BatchRecoveryManager({
        maxRecoveryAttempts: 1,
        recoveryTimeoutMs: 10000,
      });

      mockRestoreBatchState.mockRejectedValue(new Error('Storage error'));
      mockApiRequest.mockRejectedValue(new Error('Network error'));

      const result = await shortRetryManager.recoverBatchState(mockBatchId);

      expect(result.status).toBe('failed');
      expect(result.failedItems.length).toBeGreaterThan(0);
    });
  });
});