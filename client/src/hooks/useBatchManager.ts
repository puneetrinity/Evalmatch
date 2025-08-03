/**
 * Centralized Batch Management Hook
 * 
 * This hook consolidates all batch-related logic that was previously scattered
 * across upload.tsx and analysis.tsx files. It provides comprehensive batch
 * lifecycle management, validation, persistence, and error handling.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { 
  AppError,
  NetworkError,
  ValidationError,
  BusinessLogicError,
  SystemError,
  createNetworkError,
  createValidationError,
  createBusinessLogicError,
  createSystemError,
  convertFetchError,
  convertHttpError,
  isRetryableError,
  getRetryDelay,
  showErrorToast,
  ErrorSeverity,
  ErrorCategory,
  CircuitBreakerState
} from '@/lib/error-handling';
import type {
  SessionId,
  ResumeListResponse,
  ApiResult,
} from '@shared/api-contracts';
import { isApiSuccess } from '@shared/api-contracts';
import { isResumeListResponse } from '@shared/type-guards';
import type {
  BatchValidationResult,
  BatchStatus,
  BatchOwnership,
  BatchOperationResponse,
  ValidateBatchResponse,
  BatchStatusResponse,
  ClaimBatchResponse,
  DeleteBatchResponse,
  BatchErrorCode,
  BatchSecurityFlag,
} from '@shared/batch-validation-types';
import {
  isBatchValidationResult,
  isBatchStatus,
  isValidBatchIdFormat,
  isValidSessionIdFormat,
  createBatchId,
  createSessionId,
} from '@shared/batch-validation-types';

// ===== TYPE DEFINITIONS =====

export interface BatchState {
  currentBatchId: string | null;
  sessionId: SessionId | null;
  status: BatchStatus;
  resumeCount: number;
  isLoading: boolean;
  error: BatchError | null;
  lastValidated: Date | null;
  retryCount: number;
  // Enhanced ownership and security features
  ownership: BatchOwnership | null;
  securityFlags: string[];
  canClaim: boolean;
  isOrphaned: boolean;
  serverValidated: boolean;
}

export type BatchStatus = 
  | 'initializing'     // Setting up new batch
  | 'loading'          // Loading existing batch data
  | 'ready'            // Batch is ready for operations
  | 'validating'       // Validating batch integrity
  | 'error'            // Batch has errors
  | 'stale'            // Batch data may be outdated
  | 'corrupted'        // Batch data is corrupted
  | 'orphaned'         // Batch is orphaned (can be claimed)
  | 'expired'          // Batch has exceeded age limit
  | 'unauthorized';    // User not authorized for batch

export interface BatchError {
  type: BatchErrorType;
  message: string;
  code?: string;
  retryable: boolean;
  suggestions: string[];
  timestamp: Date;
}

export type BatchErrorType = 
  | 'network_error'
  | 'validation_failed'
  | 'batch_not_found'
  | 'session_invalid'
  | 'permission_denied'
  | 'corrupted_data'
  | 'server_error'
  | 'timeout_error'
  | 'ownership_error'
  | 'security_error'
  | 'claim_failed'
  | 'delete_failed';

export interface BatchValidationResult {
  isValid: boolean;
  resumeCount: number;
  error?: string;
  details?: {
    sessionValid: boolean;
    batchExists: boolean;
    resumesFound: boolean;
    integrityCheck: boolean;
  };
}

export interface BatchManagerConfig {
  maxRetries: number;
  retryDelay: number;
  validationTimeout: number;
  staleThreshold: number; // minutes
  persistenceKey: string;
  autoValidate: boolean;
  autoRecover: boolean;
}

export interface BatchPersistenceData {
  batchId: string;
  sessionId: SessionId;
  timestamp: number;
  resumeCount: number;
  lastValidated: number;
  version: string;
}

// ===== CONFIGURATION =====

const DEFAULT_CONFIG: BatchManagerConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  validationTimeout: 10000,
  staleThreshold: 30, // 30 minutes
  persistenceKey: 'evalmatch_batch_state',
  autoValidate: true,
  autoRecover: true,
};

const BATCH_VERSION = '1.0.0';
const SESSION_STORAGE_KEY = 'currentUploadSession';
const BATCH_STORAGE_KEY = 'currentBatchId';

// ===== BATCH MANAGER HOOK =====

export function useBatchManager(config: Partial<BatchManagerConfig> = {}) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const { toast } = useToast();
  
  // ===== STATE MANAGEMENT =====
  
  const [batchState, setBatchState] = useState<BatchState>({
    currentBatchId: null,
    sessionId: null,
    status: 'initializing',
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
  });

  // Track initialization to prevent duplicate effects
  const initializationRef = useRef(false);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ===== UTILITY FUNCTIONS =====

  const createBatchError = (
    type: BatchErrorType,
    message: string,
    code?: string,
    retryable: boolean = true,
    suggestions: string[] = []
  ): BatchError => ({
    type,
    message,
    code,
    retryable,
    suggestions: suggestions.length > 0 ? suggestions : getDefaultSuggestions(type),
    timestamp: new Date(),
  });

  const getDefaultSuggestions = (type: BatchErrorType): string[] => {
    switch (type) {
      case 'network_error':
        return ['Check your internet connection', 'Try refreshing the page'];
      case 'validation_failed':
        return ['Upload resumes first', 'Create a new batch'];
      case 'batch_not_found':
        return ['Start a new upload session', 'Check if files were uploaded'];
      case 'session_invalid':
        return ['Reset the session', 'Clear browser cache'];
      case 'corrupted_data':
        return ['Reset the session', 'Contact support if problem persists'];
      case 'timeout_error':
        return ['Try again', 'Check your connection speed'];
      case 'ownership_error':
        return ['Verify session ID', 'Try claiming the batch if orphaned'];
      case 'security_error':
        return ['Check permissions', 'Contact administrator'];
      case 'claim_failed':
        return ['Try again later', 'Verify batch is claimable'];
      case 'delete_failed':
        return ['Try again', 'Check batch permissions'];
      default:
        return ['Try again', 'Contact support if problem persists'];
    }
  };

  const generateBatchId = (): string => {
    return createBatchId();
  };

  const generateSessionId = (): SessionId => {
    return createSessionId();
  };

  const updateState = (updates: Partial<BatchState>) => {
    setBatchState(prev => ({ ...prev, ...updates }));
  };

  const clearError = () => {
    updateState({ error: null, retryCount: 0 });
  };

  // ===== PERSISTENCE FUNCTIONS =====

  const saveBatchToPersistence = (batchId: string, sessionId: SessionId, resumeCount: number) => {
    try {
      const persistenceData: BatchPersistenceData = {
        batchId,
        sessionId,
        timestamp: Date.now(),
        resumeCount,
        lastValidated: Date.now(),
        version: BATCH_VERSION,
      };
      
      localStorage.setItem(fullConfig.persistenceKey, JSON.stringify(persistenceData));
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
      localStorage.setItem(BATCH_STORAGE_KEY, batchId);
      
      console.log(`[BATCH PERSISTENCE] Saved batch state: ${batchId} with ${resumeCount} resumes`);
    } catch (error) {
      console.warn('[BATCH PERSISTENCE] Failed to save batch state:', error);
    }
  };

  const loadBatchFromPersistence = (): BatchPersistenceData | null => {
    try {
      const stored = localStorage.getItem(fullConfig.persistenceKey);
      if (!stored) return null;

      const data: BatchPersistenceData = JSON.parse(stored);
      
      // Check if data is stale
      const age = Date.now() - data.timestamp;
      const staleThreshold = fullConfig.staleThreshold * 60 * 1000; // Convert to milliseconds
      
      if (age > staleThreshold) {
        console.log(`[BATCH PERSISTENCE] Batch data is stale (${Math.round(age / 60000)}min old), ignoring`);
        return null;
      }

      // Check version compatibility
      if (data.version !== BATCH_VERSION) {
        console.log(`[BATCH PERSISTENCE] Version mismatch, ignoring stored data`);
        return null;
      }

      console.log(`[BATCH PERSISTENCE] Loaded batch state: ${data.batchId}`);
      return data;
    } catch (error) {
      console.warn('[BATCH PERSISTENCE] Failed to load batch state:', error);
      return null;
    }
  };

  const clearBatchPersistence = () => {
    try {
      localStorage.removeItem(fullConfig.persistenceKey);
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(BATCH_STORAGE_KEY);
      console.log('[BATCH PERSISTENCE] Cleared batch state');
    } catch (error) {
      console.warn('[BATCH PERSISTENCE] Failed to clear batch state:', error);
    }
  };

  // ===== VALIDATION FUNCTIONS =====

  // Enhanced server-side batch validation
  const validateBatchWithServer = useCallback(async (
    batchId: string,
    sessionId: SessionId
  ): Promise<BatchValidationResult> => {
    try {
      console.log(`[BATCH VALIDATION] Server validation for batch: ${batchId}`);
      
      const response = await apiRequest(
        "GET",
        `/api/batches/${batchId}/validate`,
        undefined,
        {
          'X-Session-ID': sessionId,
        }
      );
      
      const result = await response.json() as ValidateBatchResponse;
      
      if (result.success && result.data) {
        const serverValidation: BatchValidationResult = {
          isValid: result.data.valid,
          resumeCount: result.data.ownership?.resumeCount || 0,
          details: result.data.integrityChecks,
          error: result.data.errors.length > 0 ? result.data.errors.join('; ') : undefined,
        };
        
        // Update batch state with server validation results
        updateState({
          ownership: result.data.ownership,
          securityFlags: result.data.securityFlags,
          serverValidated: true,
          canClaim: result.data.ownership?.isOrphaned || false,
          isOrphaned: result.data.ownership?.isOrphaned || false,
        });
        
        console.log(`[BATCH VALIDATION] ✅ Server validation successful for batch ${batchId}`);
        return serverValidation;
      } else {
        throw new Error(result.message || 'Server validation failed');
      }
      
    } catch (error) {
      console.error(`[BATCH VALIDATION] ❌ Server validation failed for batch ${batchId}:`, error);
      
      updateState({
        serverValidated: false,
        securityFlags: ['VALIDATION_ERROR'],
      });
      
      return {
        isValid: false,
        resumeCount: 0,
        error: error instanceof Error ? error.message : 'Server validation error',
      };
    }
  }, []);

  // Get detailed batch status from server
  const getBatchStatusFromServer = useCallback(async (
    batchId: string,
    sessionId: SessionId
  ): Promise<BatchStatus | null> => {
    try {
      console.log(`[BATCH STATUS] Getting server status for batch: ${batchId}`);
      
      const response = await apiRequest(
        "GET",
        `/api/batches/${batchId}/status`,
        undefined,
        {
          'X-Session-ID': sessionId,
        }
      );
      
      const result = await response.json() as BatchStatusResponse;
      
      if (result.success && result.data && isBatchStatus(result.data)) {
        console.log(`[BATCH STATUS] ✅ Server status retrieved for batch ${batchId}`);
        return result.data;
      } else {
        throw new Error(result.message || 'Failed to get batch status');
      }
      
    } catch (error) {
      console.error(`[BATCH STATUS] ❌ Failed to get server status for batch ${batchId}:`, error);
      return null;
    }
  }, []);

  // Claim orphaned batch
  const claimBatch = useCallback(async (
    batchId: string,
    newSessionId: SessionId,
    userId?: string,
    force: boolean = false
  ): Promise<{ success: boolean; message: string; resumeCount?: number }> => {
    try {
      console.log(`[BATCH CLAIM] Attempting to claim batch: ${batchId}`);
      
      const response = await apiRequest(
        "POST",
        `/api/batches/${batchId}/claim`,
        {
          sessionId: newSessionId,
          userId,
          force,
        }
      );
      
      const result = await response.json() as ClaimBatchResponse;
      
      if (result.success && result.data) {
        console.log(`[BATCH CLAIM] ✅ Successfully claimed batch ${batchId}`);
        
        // Update local state with new ownership
        updateState({
          sessionId: newSessionId,
          currentBatchId: batchId,
          resumeCount: result.data.resumeCount,
          status: 'ready',
          canClaim: false,
          isOrphaned: false,
          lastValidated: new Date(),
        });
        
        // Save to persistence
        saveBatchToPersistence(batchId, newSessionId, result.data.resumeCount);
        
        return {
          success: true,
          message: result.data.message,
          resumeCount: result.data.resumeCount,
        };
      } else {
        throw new Error(result.message || 'Claim request failed');
      }
      
    } catch (error) {
      console.error(`[BATCH CLAIM] ❌ Failed to claim batch ${batchId}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Claim failed',
      };
    }
  }, []);

  // Delete batch and all associated data
  const deleteBatch = useCallback(async (
    batchId: string,
    sessionId: SessionId
  ): Promise<{ success: boolean; message: string; deletedItems?: any }> => {
    try {
      console.log(`[BATCH DELETE] Attempting to delete batch: ${batchId}`);
      
      const response = await apiRequest(
        "DELETE",
        `/api/batches/${batchId}`,
        undefined,
        {
          'X-Session-ID': sessionId,
        }
      );
      
      const result = await response.json() as DeleteBatchResponse;
      
      if (result.success && result.data) {
        console.log(`[BATCH DELETE] ✅ Successfully deleted batch ${batchId}`);
        
        // Clear local state if this was the current batch
        if (batchState.currentBatchId === batchId) {
          resetBatch();
        }
        
        return {
          success: true,
          message: result.data.message,
          deletedItems: result.data.deletedItems,
        };
      } else {
        throw new Error(result.message || 'Delete request failed');
      }
      
    } catch (error) {
      console.error(`[BATCH DELETE] ❌ Failed to delete batch ${batchId}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Delete failed',
      };
    }
  }, [batchState.currentBatchId]);

  const validateBatchIntegrity = useCallback(async (
    batchId: string, 
    sessionId: SessionId, 
    retries: number = fullConfig.maxRetries
  ): Promise<BatchValidationResult> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[BATCH VALIDATION] Attempt ${attempt}/${retries} - Validating batch ${batchId}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), fullConfig.validationTimeout);
        
        try {
          const response = await apiRequest(
            "GET", 
            `/api/resumes?sessionId=${sessionId}&batchId=${batchId}`
          );
          const data = await response.json() as ApiResult<ResumeListResponse>;
          
          clearTimeout(timeoutId);
          
          if (isApiSuccess(data) && isResumeListResponse(data.data)) {
            const resumeCount = data.data.resumes?.length || 0;
            console.log(`[BATCH VALIDATION] ✅ Batch ${batchId} validated - ${resumeCount} resumes found`);
            
            return {
              isValid: true,
              resumeCount,
              details: {
                sessionValid: true,
                batchExists: true,
                resumesFound: resumeCount > 0,
                integrityCheck: true,
              },
            };
          }
          
          if (attempt === retries) {
            const error = `Invalid response format: ${data.message || 'Unknown error'}`;
            console.log(`[BATCH VALIDATION] ❌ Final attempt failed for batch ${batchId}: ${error}`);
            return {
              isValid: false,
              resumeCount: 0,
              error,
              details: {
                sessionValid: true,
                batchExists: false,
                resumesFound: false,
                integrityCheck: false,
              },
            };
          }
          
          console.log(`[BATCH VALIDATION] ⚠️ Attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, fullConfig.retryDelay));
          
        } finally {
          clearTimeout(timeoutId);
        }
        
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          const timeoutError = 'Validation timeout - server took too long to respond';
          console.log(`[BATCH VALIDATION] ⏰ Timeout on attempt ${attempt}`);
          
          if (attempt === retries) {
            return {
              isValid: false,
              resumeCount: 0,
              error: timeoutError,
              details: {
                sessionValid: false,
                batchExists: false,
                resumesFound: false,
                integrityCheck: false,
              },
            };
          }
        } else {
          if (attempt === retries) {
            const errorMsg = error instanceof Error ? error.message : 'Network error';
            console.log(`[BATCH VALIDATION] ❌ Final attempt failed for batch ${batchId}: ${errorMsg}`);
            return {
              isValid: false,
              resumeCount: 0,
              error: errorMsg,
              details: {
                sessionValid: false,
                batchExists: false,
                resumesFound: false,
                integrityCheck: false,
              },
            };
          }
          
          console.log(`[BATCH VALIDATION] ⚠️ Attempt ${attempt} failed with error, retrying...`, error);
        }
        
        await new Promise(resolve => setTimeout(resolve, fullConfig.retryDelay));
      }
    }
    
    return {
      isValid: false,
      resumeCount: 0,
      error: 'Max retries exceeded',
      details: {
        sessionValid: false,
        batchExists: false,
        resumesFound: false,
        integrityCheck: false,
      },
    };
  }, [fullConfig.maxRetries, fullConfig.retryDelay, fullConfig.validationTimeout]);

  // ===== QUERY HOOKS =====

  const { data: resumesData, refetch: refetchResumes } = useQuery<ResumeListResponse>({
    queryKey: ["/api/resumes", batchState.sessionId, batchState.currentBatchId],
    queryFn: async ({ queryKey }): Promise<ResumeListResponse> => {
      const endpoint = queryKey[0] as string;
      const currentSessionId = queryKey[1] as SessionId;
      const currentBatch = queryKey[2] as string;
      
      console.log(`[RESUMES QUERY] Fetching resumes for session: ${currentSessionId}, batch: ${currentBatch}`);
      
      const params = new URLSearchParams();
      if (currentSessionId) params.append('sessionId', currentSessionId);
      if (currentBatch) params.append('batchId', currentBatch);
      
      const url = `${endpoint}?${params.toString()}`;
      const response = await apiRequest("GET", url);
      const data = await response.json() as ApiResult<ResumeListResponse>;
      
      if (isApiSuccess(data)) {
        if (isResumeListResponse(data.data)) {
          console.log(`[RESUMES QUERY] ✅ Found ${data.data.resumes?.length || 0} resumes for batch ${currentBatch}`);
          return data.data;
        }
        throw new Error('Invalid resume list response format');
      }
      throw new Error(data.message || 'Failed to fetch resumes');
    },
    enabled: !!batchState.sessionId && !!batchState.currentBatchId && batchState.status === 'ready',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // ===== MUTATION HOOKS =====

  const validationMutation = useMutation<BatchValidationResult, Error, { batchId: string; sessionId: SessionId }>({
    mutationFn: async ({ batchId, sessionId }) => {
      updateState({ status: 'validating', isLoading: true });
      return await validateBatchIntegrity(batchId, sessionId);
    },
    onSuccess: (result, { batchId }) => {
      if (result.isValid) {
        updateState({
          status: 'ready',
          isLoading: false,
          resumeCount: result.resumeCount,
          lastValidated: new Date(),
          error: null,
          retryCount: 0,
        });
        
        // Save successful validation to persistence
        if (batchState.sessionId) {
          saveBatchToPersistence(batchId, batchState.sessionId, result.resumeCount);
        }
        
        console.log(`[BATCH VALIDATION] ✅ Batch ${batchId} validation successful`);
      } else {
        const error = createBatchError(
          'validation_failed',
          result.error || 'Batch validation failed',
          'VALIDATION_FAILED',
          true,
          ['Upload resumes first', 'Create a new batch', 'Check your session']
        );
        
        updateState({
          status: 'error',
          isLoading: false,
          error,
          retryCount: batchState.retryCount + 1,
        });
        
        console.log(`[BATCH VALIDATION] ❌ Batch ${batchId} validation failed: ${result.error}`);
      }
    },
    onError: (error, { batchId }) => {
      const batchError = createBatchError(
        'network_error',
        error.message || 'Failed to validate batch',
        'NETWORK_ERROR',
        true
      );
      
      updateState({
        status: 'error',
        isLoading: false,
        error: batchError,
        retryCount: batchState.retryCount + 1,
      });
      
      console.log(`[BATCH VALIDATION] ❌ Validation error for batch ${batchId}:`, error);
    },
  });

  // ===== CORE FUNCTIONS =====

  const createNewBatch = useCallback((): string => {
    console.log('[BATCH MANAGER] Creating new batch...');
    
    const newBatchId = generateBatchId();
    let currentSessionId = batchState.sessionId;
    
    // Create new session if we don't have one
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      console.log(`[BATCH MANAGER] Created new session: ${currentSessionId}`);
    }
    
    updateState({
      currentBatchId: newBatchId,
      sessionId: currentSessionId,
      status: 'ready',
      resumeCount: 0,
      isLoading: false,
      error: null,
      lastValidated: new Date(),
      retryCount: 0,
    });
    
    // Save to localStorage
    saveBatchToPersistence(newBatchId, currentSessionId, 0);
    
    console.log(`[BATCH MANAGER] ✅ Created new batch: ${newBatchId}`);
    
    toast({
      title: "New batch created",
      description: `Created batch ${newBatchId.slice(-8)} for uploads.`,
    });
    
    return newBatchId;
  }, [batchState.sessionId, toast]);

  const validateBatch = useCallback(async (batchId?: string): Promise<BatchValidationResult> => {
    const targetBatchId = batchId || batchState.currentBatchId;
    const targetSessionId = batchState.sessionId;
    
    if (!targetBatchId || !targetSessionId) {
      const error = 'Cannot validate batch: missing batch ID or session ID';
      console.log(`[BATCH MANAGER] ❌ ${error}`);
      return {
        isValid: false,
        resumeCount: 0,
        error,
      };
    }
    
    console.log(`[BATCH MANAGER] Starting validation for batch: ${targetBatchId}`);
    
    // Use enhanced server-side validation first
    try {
      const serverValidation = await validateBatchWithServer(targetBatchId, targetSessionId);
      
      if (serverValidation.isValid) {
        console.log(`[BATCH MANAGER] ✅ Server validation successful for batch: ${targetBatchId}`);
        return serverValidation;
      }
      
      // If server validation fails, check if batch is claimable
      if (batchState.canClaim || batchState.isOrphaned) {
        console.log(`[BATCH MANAGER] ⚠️ Batch may be claimable: ${targetBatchId}`);
        updateState({ status: 'orphaned' });
      } else {
        console.log(`[BATCH MANAGER] ❌ Server validation failed for batch: ${targetBatchId}`);
        updateState({ status: 'error' });
      }
      
      return serverValidation;
      
    } catch (error) {
      console.log(`[BATCH MANAGER] ⚠️ Server validation unavailable, falling back to legacy validation`);
      
      // Fallback to legacy validation if server is unavailable
      return new Promise((resolve) => {
        validationMutation.mutate(
          { batchId: targetBatchId, sessionId: targetSessionId },
          {
            onSuccess: (result) => resolve(result),
            onError: () => resolve({
              isValid: false,
              resumeCount: 0,
              error: 'Validation failed due to network error',
            }),
          }
        );
      });
    }
  }, [batchState.currentBatchId, batchState.sessionId, batchState.canClaim, batchState.isOrphaned, validateBatchWithServer, validationMutation]);

  const preserveExistingBatch = useCallback(async (): Promise<boolean> => {
    if (!batchState.currentBatchId || !batchState.sessionId) {
      console.log('[BATCH MANAGER] No existing batch to preserve');
      return false;
    }
    
    console.log(`[BATCH MANAGER] Attempting to preserve batch: ${batchState.currentBatchId}`);
    
    const validation = await validateBatch();
    
    if (validation.isValid && validation.resumeCount > 0) {
      console.log(`[BATCH MANAGER] ✅ Preserved existing batch with ${validation.resumeCount} resumes`);
      
      toast({
        title: "Batch preserved",
        description: `Continuing with ${validation.resumeCount} existing resumes.`,
      });
      
      return true;
    }
    
    console.log('[BATCH MANAGER] ❌ Cannot preserve batch - no valid resumes found');
    return false;
  }, [batchState.currentBatchId, batchState.sessionId, validateBatch, toast]);

  const resetBatch = useCallback(() => {
    console.log('[BATCH MANAGER] Resetting batch and session...');
    
    // Clear validation timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
      validationTimeoutRef.current = null;
    }
    
    // Clear persistence
    clearBatchPersistence();
    
    // Reset state
    updateState({
      currentBatchId: null,
      sessionId: null,
      status: 'initializing',
      resumeCount: 0,
      isLoading: false,
      error: null,
      lastValidated: null,
      retryCount: 0,
    });
    
    // Invalidate queries
    queryClient.invalidateQueries({ queryKey: ["/api/resumes"] });
    
    console.log('[BATCH MANAGER] ✅ Batch reset complete');
    
    toast({
      title: "Session reset",
      description: "Started fresh with a new upload session.",
    });
    
    // Create new batch immediately
    setTimeout(() => createNewBatch(), 100);
  }, [createNewBatch, toast]);

  const getBatchStatus = useCallback(() => {
    return {
      ...batchState,
      isValid: batchState.status === 'ready' && batchState.resumeCount > 0,
      canProceedToAnalysis: batchState.status === 'ready' && batchState.resumeCount > 0,
      isStale: batchState.lastValidated && 
        (Date.now() - batchState.lastValidated.getTime()) > (fullConfig.staleThreshold * 60 * 1000),
    };
  }, [batchState, fullConfig.staleThreshold]);

  const recoverBatch = useCallback(async (): Promise<boolean> => {
    console.log('[BATCH MANAGER] Attempting batch recovery...');
    
    updateState({ status: 'loading', isLoading: true });
    
    // Try to load from persistence
    const persistedData = loadBatchFromPersistence();
    
    if (persistedData) {
      console.log(`[BATCH MANAGER] Found persisted batch: ${persistedData.batchId}`);
      
      updateState({
        currentBatchId: persistedData.batchId,
        sessionId: persistedData.sessionId,
        resumeCount: persistedData.resumeCount,
        lastValidated: new Date(persistedData.lastValidated),
      });
      
      // Validate the recovered batch
      const validation = await validateBatch(persistedData.batchId);
      
      if (validation.isValid) {
        console.log(`[BATCH MANAGER] ✅ Successfully recovered batch with ${validation.resumeCount} resumes`);
        
        toast({
          title: "Batch recovered",
          description: `Recovered previous session with ${validation.resumeCount} resumes.`,
        });
        
        return true;
      } else {
        console.log('[BATCH MANAGER] ❌ Recovered batch failed validation, creating new batch');
      }
    }
    
    // Recovery failed, create new batch
    createNewBatch();
    return false;
  }, [validateBatch, createNewBatch, toast]);

  // ===== INITIALIZATION EFFECT =====

  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;
    
    const initializeBatch = async () => {
      console.log('[BATCH MANAGER] Initializing batch manager...');
      
      updateState({ status: 'loading', isLoading: true });
      
      // Try to recover existing batch if auto-recovery is enabled
      if (fullConfig.autoRecover) {
        const recovered = await recoverBatch();
        if (recovered) return;
      }
      
      // No recovery or recovery failed, create new batch
      createNewBatch();
    };
    
    initializeBatch().catch(error => {
      console.error('[BATCH MANAGER] Initialization error:', error);
      
      const batchError = createBatchError(
        'server_error',
        'Failed to initialize batch manager',
        'INIT_ERROR',
        true
      );
      
      updateState({
        status: 'error',
        isLoading: false,
        error: batchError,
      });
    });
  }, [fullConfig.autoRecover, recoverBatch, createNewBatch]);

  // ===== AUTO-VALIDATION EFFECT =====

  useEffect(() => {
    if (!fullConfig.autoValidate || batchState.status !== 'ready' || !batchState.currentBatchId || !batchState.sessionId) {
      return;
    }
    
    // Check if batch needs validation
    const needsValidation = !batchState.lastValidated || 
      (Date.now() - batchState.lastValidated.getTime()) > (fullConfig.staleThreshold * 60 * 1000);
    
    if (needsValidation) {
      console.log('[BATCH MANAGER] Auto-validating batch due to staleness');
      
      validationTimeoutRef.current = setTimeout(() => {
        validateBatch();
      }, 1000);
    }
    
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
        validationTimeoutRef.current = null;
      }
    };
  }, [batchState.status, batchState.currentBatchId, batchState.sessionId, batchState.lastValidated, fullConfig.autoValidate, fullConfig.staleThreshold, validateBatch]);

  // ===== RESUME COUNT SYNC EFFECT =====

  useEffect(() => {
    if (resumesData?.resumes && batchState.status === 'ready') {
      const serverResumeCount = resumesData.resumes.length;
      
      if (serverResumeCount !== batchState.resumeCount) {
        console.log(`[BATCH MANAGER] Syncing resume count: ${batchState.resumeCount} → ${serverResumeCount}`);
        
        updateState({ resumeCount: serverResumeCount });
        
        // Update persistence
        if (batchState.currentBatchId && batchState.sessionId) {
          saveBatchToPersistence(batchState.currentBatchId, batchState.sessionId, serverResumeCount);
        }
      }
    }
  }, [resumesData?.resumes, batchState.resumeCount, batchState.status, batchState.currentBatchId, batchState.sessionId]);

  // ===== CLEANUP EFFECT =====

  useEffect(() => {
    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, []);

  // ===== PUBLIC API =====

  return {
    // State
    currentBatchId: batchState.currentBatchId,
    sessionId: batchState.sessionId,
    batchStatus: batchState.status,
    resumeCount: batchState.resumeCount,
    isLoading: batchState.isLoading || validationMutation.isPending,
    error: batchState.error,
    lastValidated: batchState.lastValidated,
    
    // Enhanced ownership and security features
    ownership: batchState.ownership,
    securityFlags: batchState.securityFlags,
    canClaim: batchState.canClaim,
    isOrphaned: batchState.isOrphaned,
    serverValidated: batchState.serverValidated,
    
    // Actions
    createNewBatch,
    validateBatch,
    resetBatch,
    getBatchStatus,
    
    // Enhanced server-side operations
    validateBatchWithServer,
    getBatchStatusFromServer,
    claimBatch,
    deleteBatch,
    
    // Recovery
    recoverBatch,
    preserveExistingBatch,
    clearError,
    
    // Utils
    isBatchValid: batchState.status === 'ready' && batchState.resumeCount > 0,
    canProceedToAnalysis: batchState.status === 'ready' && batchState.resumeCount > 0,
    isStale: batchState.lastValidated && 
      (Date.now() - batchState.lastValidated.getTime()) > (fullConfig.staleThreshold * 60 * 1000),
    
    // Enhanced validation utilities
    isValidBatchId: (id: string) => isValidBatchIdFormat(id),
    isValidSessionId: (id: string) => isValidSessionIdFormat(id),
    
    // Data
    resumesData,
    refetchResumes,
    
    // Configuration
    config: fullConfig,
  };
}

// ===== EXPORT TYPES =====

export type BatchManager = ReturnType<typeof useBatchManager>;