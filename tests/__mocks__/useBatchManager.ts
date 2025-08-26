/**
 * Mock for useBatchManager hook
 */

// Re-export all the types that the batch-persistence test needs
export interface BatchState {
  currentBatchId: string | null;
  sessionId: string | null;
  status: LocalBatchStatus;
  resumeCount: number;
  isLoading: boolean;
  error: BatchError | null;
  lastValidated: Date | null;
  retryCount: number;
  ownership: any | null;
  securityFlags: string[];
  canClaim: boolean;
  isOrphaned: boolean;
  serverValidated: boolean;
}

export type LocalBatchStatus = 
  | 'initializing'
  | 'loading'
  | 'ready'
  | 'validating'
  | 'error'
  | 'stale'
  | 'corrupted'
  | 'orphaned'
  | 'expired'
  | 'unauthorized';

export interface BatchError {
  type: BatchErrorType;
  message: string;
  code?: string;
  retryable: boolean;
  suggestions: string[];
  timestamp: Date;
}

export type BatchErrorType = 
  | 'NETWORK_ERROR'
  | 'VALIDATION_ERROR'
  | 'SECURITY_ERROR'
  | 'CORRUPTION_ERROR'
  | 'TIMEOUT_ERROR'
  | 'PERMISSION_ERROR'
  | 'UNKNOWN_ERROR';

export interface LocalBatchValidationResult {
  isValid: boolean;
  batchId: string;
  sessionId: string;
  resumeCount: number;
  issues: string[];
  canProceed: boolean;
  requiresReload: boolean;
  validatedAt: Date;
}

// Mock the hook itself - create mock functions without jest (will be mocked by tests)
export const useBatchManager = () => ({
  batchState: {
    currentBatchId: null,
    sessionId: null,
    status: 'ready' as LocalBatchStatus,
    resumeCount: 0,
    isLoading: false,
    error: null,
    lastValidated: null,
    retryCount: 0,
    ownership: null,
    securityFlags: [],
    canClaim: false,
    isOrphaned: false,
    serverValidated: false,
  },
  validateBatch: () => {},
  initializeBatch: () => {},
  claimBatch: () => {},
  clearBatch: () => {},
  refreshBatch: () => {},
});