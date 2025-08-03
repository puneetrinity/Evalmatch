/**
 * Comprehensive Unit Tests for useBatchManager Hook
 * 
 * Tests all functionality including:
 * - Hook initialization and state management
 * - Batch creation, validation, and reset functions
 * - State persistence and recovery
 * - Error handling and retry mechanisms
 * - React Query integration
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { useBatchManager } from '@/hooks/useBatchManager';
import { apiRequest } from '@/lib/queryClient';
import type { SessionId, ApiResult, ResumeListResponse } from '@shared/api-contracts';
import type { 
  BatchValidationResult, 
  ValidateBatchResponse,
  BatchStatusResponse,
  ClaimBatchResponse,
  DeleteBatchResponse 
} from '@shared/batch-validation-types';

// ===== MOCKS =====

// Mock React Query client
const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Mock toast notifications
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
  toast: jest.fn(),
}));

// Mock API requests
jest.mock('@/lib/queryClient', () => ({
  apiRequest: jest.fn(),
  queryClient: {
    invalidateQueries: jest.fn(),
  },
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

// ===== TEST HELPERS =====

const createWrapper = () => {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

const mockApiRequest = apiRequest as jest.MockedFunction<typeof apiRequest>;
const mockToast = toast as jest.MockedFunction<typeof toast>;

// Test data
const mockSessionId: SessionId = 'session_test123' as SessionId;
const mockBatchId = 'batch_test456';
const mockUserId = 'user_test789';

const mockResumeListResponse: ResumeListResponse = {
  resumes: [
    { id: '1', filename: 'resume1.pdf', status: 'processed' },
    { id: '2', filename: 'resume2.pdf', status: 'processed' },
  ],
  total: 2,
  batchId: mockBatchId,
  sessionId: mockSessionId,
};

const mockValidationResult: BatchValidationResult = {
  isValid: true,
  resumeCount: 2,
  details: {
    sessionValid: true,
    batchExists: true,
    resumesFound: true,
    integrityCheck: true,
  },
};

// ===== TEST SUITES =====

describe('useBatchManager Hook', () => {
  let wrapper: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
    wrapper = createWrapper();
  });

  // ===== INITIALIZATION TESTS =====

  describe('Initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      expect(result.current.currentBatchId).toBeNull();
      expect(result.current.sessionId).toBeNull();
      expect(result.current.batchStatus).toBe('initializing');
      expect(result.current.resumeCount).toBe(0);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isBatchValid).toBe(false);
      expect(result.current.canProceedToAnalysis).toBe(false);
    });

    it('should initialize with custom config', () => {
      const customConfig = {
        maxRetries: 5,
        retryDelay: 2000,
        validationTimeout: 15000,
        staleThreshold: 60,
        autoValidate: false,
        autoRecover: false,
      };

      const { result } = renderHook(() => useBatchManager(customConfig), { wrapper });

      expect(result.current.config).toEqual(expect.objectContaining(customConfig));
    });

    it('should create new batch on initialization when autoRecover is false', async () => {
      const { result } = renderHook(
        () => useBatchManager({ autoRecover: false }), 
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.batchStatus).not.toBe('initializing');
      });

      expect(result.current.currentBatchId).toBeTruthy();
      expect(result.current.sessionId).toBeTruthy();
      expect(result.current.batchStatus).toBe('ready');
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New batch created',
        })
      );
    });

    it('should attempt recovery on initialization when autoRecover is true', async () => {
      const persistedData = {
        batchId: mockBatchId,
        sessionId: mockSessionId,
        timestamp: Date.now(),
        resumeCount: 2,
        lastValidated: Date.now(),
        version: '1.0.0',
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(persistedData));

      // Mock successful validation
      mockApiRequest.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: mockResumeListResponse,
          }),
          { status: 200 }
        )
      );

      const { result } = renderHook(
        () => useBatchManager({ autoRecover: true }), 
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.batchStatus).toBe('ready');
      });

      expect(result.current.currentBatchId).toBe(mockBatchId);
      expect(result.current.sessionId).toBe(mockSessionId);
      expect(result.current.resumeCount).toBe(2);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Batch recovered',
        })
      );
    });
  });

  // ===== BATCH CREATION TESTS =====

  describe('Batch Creation', () => {
    it('should create new batch with generated IDs', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      let newBatchId: string;
      await act(async () => {
        newBatchId = result.current.createNewBatch();
      });

      expect(newBatchId!).toBeTruthy();
      expect(result.current.currentBatchId).toBe(newBatchId!);
      expect(result.current.sessionId).toBeTruthy();
      expect(result.current.batchStatus).toBe('ready');
      expect(result.current.resumeCount).toBe(0);
      expect(result.current.error).toBeNull();
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('should reuse existing session when creating new batch', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      const firstSessionId = result.current.sessionId;

      await act(async () => {
        result.current.createNewBatch();
      });

      expect(result.current.sessionId).toBe(firstSessionId);
      expect(result.current.currentBatchId).not.toBe(result.current.currentBatchId);
    });
  });

  // ===== VALIDATION TESTS =====

  describe('Batch Validation', () => {
    it('should validate batch successfully with server validation', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      // Set up batch state
      await act(async () => {
        result.current.createNewBatch();
      });

      // Mock successful server validation
      const serverValidationResponse: ValidateBatchResponse = {
        success: true,
        data: {
          valid: true,
          ownership: {
            userId: mockUserId,
            sessionId: mockSessionId,
            resumeCount: 2,
            isOrphaned: false,
          },
          securityFlags: [],
          errors: [],
          integrityChecks: {
            sessionValid: true,
            batchExists: true,
            resumesFound: true,
            integrityCheck: true,
          },
        },
        message: 'Validation successful',
      };

      mockApiRequest.mockResolvedValueOnce(
        new Response(JSON.stringify(serverValidationResponse), { status: 200 })
      );

      let validationResult: BatchValidationResult;
      await act(async () => {
        validationResult = await result.current.validateBatch();
      });

      expect(validationResult!.isValid).toBe(true);
      expect(validationResult!.resumeCount).toBe(2);
      expect(result.current.serverValidated).toBe(true);
      expect(result.current.ownership).toEqual(serverValidationResponse.data.ownership);
    });

    it('should fallback to legacy validation when server validation fails', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      // Mock server validation failure
      mockApiRequest
        .mockRejectedValueOnce(new Error('Server unavailable'))
        // Mock successful legacy validation
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              data: mockResumeListResponse,
            }),
            { status: 200 }
          )
        );

      let validationResult: BatchValidationResult;
      await act(async () => {
        validationResult = await result.current.validateBatch();
      });

      expect(validationResult!.isValid).toBe(true);
      expect(validationResult!.resumeCount).toBe(2);
    });

    it('should handle validation timeout', async () => {
      const { result } = renderHook(
        () => useBatchManager({ validationTimeout: 100 }), 
        { wrapper }
      );

      await act(async () => {
        result.current.createNewBatch();
      });

      // Mock slow response that will timeout
      mockApiRequest.mockImplementationOnce(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      let validationResult: BatchValidationResult;
      await act(async () => {
        validationResult = await result.current.validateBatch();
      });

      expect(validationResult!.isValid).toBe(false);
      expect(validationResult!.error).toContain('timeout');
    });

    it('should retry validation on failure', async () => {
      const { result } = renderHook(
        () => useBatchManager({ maxRetries: 2 }), 
        { wrapper }
      );

      await act(async () => {
        result.current.createNewBatch();
      });

      // Mock first call fails, second succeeds
      mockApiRequest
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              success: true,
              data: mockResumeListResponse,
            }),
            { status: 200 }
          )
        );

      let validationResult: BatchValidationResult;
      await act(async () => {
        validationResult = await result.current.validateBatch();
      });

      expect(validationResult!.isValid).toBe(true);
      expect(mockApiRequest).toHaveBeenCalledTimes(2);
    });

    it('should handle validation without batch ID or session ID', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      let validationResult: BatchValidationResult;
      await act(async () => {
        validationResult = await result.current.validateBatch();
      });

      expect(validationResult!.isValid).toBe(false);
      expect(validationResult!.error).toContain('missing batch ID or session ID');
    });
  });

  // ===== ERROR HANDLING TESTS =====

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      mockApiRequest.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.validateBatch();
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.type).toBe('network_error');
      expect(result.current.batchStatus).toBe('error');
    });

    it('should provide error recovery suggestions', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      mockApiRequest.mockRejectedValue(new Error('Batch not found'));

      await act(async () => {
        await result.current.validateBatch();
      });

      expect(result.current.error?.suggestions).toContain('Start a new upload session');
      expect(result.current.error?.retryable).toBe(true);
    });

    it('should clear errors when requested', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      mockApiRequest.mockRejectedValue(new Error('Test error'));

      await act(async () => {
        await result.current.validateBatch();
      });

      expect(result.current.error).toBeTruthy();

      await act(async () => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.retryCount).toBe(0);
    });
  });

  // ===== PERSISTENCE TESTS =====

  describe('State Persistence', () => {
    it('should save batch state to localStorage', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'evalmatch_batch_state',
        expect.stringContaining(result.current.currentBatchId!)
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'currentUploadSession',
        result.current.sessionId
      );
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'currentBatchId',
        result.current.currentBatchId
      );
    });

    it('should handle localStorage errors gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      // Should not throw error, just log warning
      expect(result.current.currentBatchId).toBeTruthy();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should ignore stale persisted data', async () => {
      const staleData = {
        batchId: mockBatchId,
        sessionId: mockSessionId,
        timestamp: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago
        resumeCount: 2,
        lastValidated: Date.now() - (2 * 60 * 60 * 1000),
        version: '1.0.0',
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(staleData));

      const { result } = renderHook(
        () => useBatchManager({ autoRecover: true, staleThreshold: 30 }), 
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.batchStatus).toBe('ready');
      });

      // Should create new batch instead of using stale data
      expect(result.current.currentBatchId).not.toBe(mockBatchId);
    });

    it('should ignore version mismatch in persisted data', async () => {
      const oldVersionData = {
        batchId: mockBatchId,
        sessionId: mockSessionId,
        timestamp: Date.now(),
        resumeCount: 2,
        lastValidated: Date.now(),
        version: '0.9.0', // Old version
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldVersionData));

      const { result } = renderHook(
        () => useBatchManager({ autoRecover: true }), 
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.batchStatus).toBe('ready');
      });

      expect(result.current.currentBatchId).not.toBe(mockBatchId);
    });
  });

  // ===== BATCH RESET TESTS =====

  describe('Batch Reset', () => {
    it('should reset batch state completely', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      const originalBatchId = result.current.currentBatchId;

      await act(async () => {
        result.current.resetBatch();
      });

      await waitFor(() => {
        expect(result.current.currentBatchId).not.toBe(originalBatchId);
      });

      expect(result.current.batchStatus).toBe('ready');
      expect(result.current.resumeCount).toBe(0);
      expect(result.current.error).toBeNull();
      expect(mockLocalStorage.removeItem).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Session reset',
        })
      );
    });

    it('should create new batch after reset', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      await act(async () => {
        result.current.resetBatch();
      });

      // Wait for automatic new batch creation
      await waitFor(() => {
        expect(result.current.currentBatchId).toBeTruthy();
        expect(result.current.batchStatus).toBe('ready');
      });
    });
  });

  // ===== ENHANCED SERVER OPERATIONS TESTS =====

  describe('Enhanced Server Operations', () => {
    it('should get batch status from server', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      const mockStatusResponse: BatchStatusResponse = {
        success: true,
        data: 'ready',
        message: 'Batch is ready',
      };

      mockApiRequest.mockResolvedValueOnce(
        new Response(JSON.stringify(mockStatusResponse), { status: 200 })
      );

      let status: any;
      await act(async () => {
        status = await result.current.getBatchStatusFromServer(
          result.current.currentBatchId!,
          result.current.sessionId!
        );
      });

      expect(status).toBe('ready');
      expect(mockApiRequest).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('/status'),
        undefined,
        expect.objectContaining({
          'X-Session-ID': result.current.sessionId,
        })
      );
    });

    it('should claim orphaned batch', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      const mockClaimResponse: ClaimBatchResponse = {
        success: true,
        data: {
          batchId: mockBatchId,
          resumeCount: 3,
          message: 'Batch claimed successfully',
        },
        message: 'Claim successful',
      };

      mockApiRequest.mockResolvedValueOnce(
        new Response(JSON.stringify(mockClaimResponse), { status: 200 })
      );

      let claimResult: any;
      await act(async () => {
        claimResult = await result.current.claimBatch(
          mockBatchId,
          mockSessionId,
          mockUserId
        );
      });

      expect(claimResult.success).toBe(true);
      expect(claimResult.resumeCount).toBe(3);
      expect(result.current.currentBatchId).toBe(mockBatchId);
      expect(result.current.sessionId).toBe(mockSessionId);
      expect(result.current.resumeCount).toBe(3);
    });

    it('should delete batch', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      const currentBatchId = result.current.currentBatchId;

      const mockDeleteResponse: DeleteBatchResponse = {
        success: true,
        data: {
          batchId: currentBatchId!,
          message: 'Batch deleted successfully',
          deletedItems: {
            resumes: 2,
            analysis: 1,
          },
        },
        message: 'Delete successful',
      };

      mockApiRequest.mockResolvedValueOnce(
        new Response(JSON.stringify(mockDeleteResponse), { status: 200 })
      );

      let deleteResult: any;
      await act(async () => {
        deleteResult = await result.current.deleteBatch(
          currentBatchId!,
          result.current.sessionId!
        );
      });

      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedItems).toBeTruthy();
      expect(result.current.currentBatchId).toBeNull();
    });
  });

  // ===== REACT QUERY INTEGRATION TESTS =====

  describe('React Query Integration', () => {
    it('should fetch resumes when batch is ready', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      mockApiRequest.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: mockResumeListResponse,
          }),
          { status: 200 }
        )
      );

      await waitFor(() => {
        expect(result.current.resumesData).toBeTruthy();
      });

      expect(result.current.resumesData?.resumes).toHaveLength(2);
    });

    it('should sync resume count from server', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      const updatedResponse = {
        ...mockResumeListResponse,
        resumes: [
          ...mockResumeListResponse.resumes,
          { id: '3', filename: 'resume3.pdf', status: 'processed' },
        ],
        total: 3,
      };

      mockApiRequest.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: updatedResponse,
          }),
          { status: 200 }
        )
      );

      await waitFor(() => {
        expect(result.current.resumeCount).toBe(3);
      });
    });

    it('should refetch resumes when requested', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      mockApiRequest.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: mockResumeListResponse,
          }),
          { status: 200 }
        )
      );

      await act(async () => {
        await result.current.refetchResumes();
      });

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
    });
  });

  // ===== UTILITY FUNCTIONS TESTS =====

  describe('Utility Functions', () => {
    it('should validate batch ID format', () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      expect(result.current.isValidBatchId('batch_valid123')).toBe(true);
      expect(result.current.isValidBatchId('invalid')).toBe(false);
      expect(result.current.isValidBatchId('')).toBe(false);
    });

    it('should validate session ID format', () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      expect(result.current.isValidSessionId('session_valid123')).toBe(true);
      expect(result.current.isValidSessionId('invalid')).toBe(false);
      expect(result.current.isValidSessionId('')).toBe(false);
    });

    it('should provide batch status information', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      const status = result.current.getBatchStatus();

      expect(status.currentBatchId).toBe(result.current.currentBatchId);
      expect(status.sessionId).toBe(result.current.sessionId);
      expect(status.isValid).toBe(false); // No resumes yet
      expect(status.canProceedToAnalysis).toBe(false);
    });

    it('should detect stale batches', async () => {
      const { result } = renderHook(
        () => useBatchManager({ staleThreshold: 1 }), // 1 minute threshold
        { wrapper }
      );

      await act(async () => {
        result.current.createNewBatch();
      });

      // Manually set lastValidated to be old
      const oldDate = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      Object.defineProperty(result.current, 'lastValidated', {
        value: oldDate,
        writable: true,
      });

      expect(result.current.isStale).toBe(true);
    });
  });

  // ===== AUTO-VALIDATION TESTS =====

  describe('Auto-validation', () => {
    it('should auto-validate stale batches when enabled', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(
        () => useBatchManager({ 
          autoValidate: true, 
          staleThreshold: 1 // 1 minute
        }),
        { wrapper }
      );

      await act(async () => {
        result.current.createNewBatch();
      });

      // Mock validation call
      mockApiRequest.mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: mockResumeListResponse,
          }),
          { status: 200 }
        )
      );

      // Fast-forward time to trigger auto-validation
      act(() => {
        jest.advanceTimersByTime(70000); // 70 seconds
      });

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });

    it('should not auto-validate when disabled', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(
        () => useBatchManager({ autoValidate: false }),
        { wrapper }
      );

      await act(async () => {
        result.current.createNewBatch();
      });

      act(() => {
        jest.advanceTimersByTime(70000);
      });

      expect(mockApiRequest).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // ===== EDGE CASES AND ERROR SCENARIOS =====

  describe('Edge Cases', () => {
    it('should handle malformed localStorage data', async () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const { result } = renderHook(
        () => useBatchManager({ autoRecover: true }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.batchStatus).toBe('ready');
      });

      // Should create new batch when recovery fails
      expect(result.current.currentBatchId).toBeTruthy();
    });

    it('should handle API response with invalid format', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      mockApiRequest.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { invalid: 'format' }, // Invalid response format
          }),
          { status: 200 }
        )
      );

      let validationResult: BatchValidationResult;
      await act(async () => {
        validationResult = await result.current.validateBatch();
      });

      expect(validationResult!.isValid).toBe(false);
      expect(validationResult!.error).toContain('Invalid response format');
    });

    it('should handle concurrent batch operations', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      mockApiRequest.mockImplementation(
        () => new Promise(resolve => 
          setTimeout(() => resolve(
            new Response(
              JSON.stringify({
                success: true,
                data: mockResumeListResponse,
              }),
              { status: 200 }
            )
          ), 100)
        )
      );

      // Start multiple validation calls
      const validationPromises = [
        result.current.validateBatch(),
        result.current.validateBatch(),
        result.current.validateBatch(),
      ];

      await act(async () => {
        await Promise.all(validationPromises);
      });

      // Should not cause issues with concurrent operations
      expect(result.current.error).toBeNull();
    });

    it('should handle browser going offline', async () => {
      const { result } = renderHook(() => useBatchManager(), { wrapper });

      await act(async () => {
        result.current.createNewBatch();
      });

      // Simulate offline
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      mockApiRequest.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await result.current.validateBatch();
      });

      expect(result.current.error?.type).toBe('network_error');
    });
  });
});