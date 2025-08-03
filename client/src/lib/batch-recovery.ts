/**
 * Comprehensive Batch Recovery System
 * Handles recovery workflows, conflict resolution, and progressive recovery
 */

import { BatchState, BatchError, BatchErrorType } from './batch-error-handling';
import { 
  PersistedBatchState, 
  batchPersistenceManager, 
  persistBatchState,
  restoreBatchState,
  STORAGE_VERSION 
} from './batch-persistence';
import { logger } from './error-handling';
import { apiRequest } from '@/lib/queryClient';

// Recovery configuration
export interface RecoveryConfig {
  maxRecoveryAttempts: number;
  recoveryTimeoutMs: number;
  enableProgressiveRecovery: boolean;
  enableConflictResolution: boolean;
  enableAutoRecovery: boolean;
  backupRetentionDays: number;
}

// Default recovery configuration
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRecoveryAttempts: 3,
  recoveryTimeoutMs: 30000, // 30 seconds
  enableProgressiveRecovery: true,
  enableConflictResolution: true,
  enableAutoRecovery: true,
  backupRetentionDays: 30,
};

// Recovery result types
export type RecoveryStatus = 
  | 'success' 
  | 'partial' 
  | 'failed' 
  | 'conflict' 
  | 'cancelled' 
  | 'timeout';

export interface RecoveryResult {
  status: RecoveryStatus;
  restoredState?: BatchState;
  conflictDetails?: ConflictInfo;
  partialData?: Partial<BatchState>;
  errorDetails?: BatchError;
  recoveredItems: string[];
  failedItems: string[];
  warnings: string[];
  metadata: {
    source: 'localStorage' | 'indexedDB' | 'server' | 'hybrid';
    timestamp: number;
    version: string;
    duration: number;
  };
}

// Conflict information
export interface ConflictInfo {
  type: 'version' | 'data' | 'ownership' | 'timestamp';
  localState: PersistedBatchState;
  remoteState?: any;
  conflictFields: string[];
  resolutionOptions: ConflictResolutionOption[];
}

export interface ConflictResolutionOption {
  id: string;
  label: string;
  description: string;
  action: 'use_local' | 'use_remote' | 'merge' | 'manual';
  risk: 'low' | 'medium' | 'high';
}

// Recovery source priority
export type RecoverySource = 'localStorage' | 'indexedDB' | 'server';

export const RECOVERY_SOURCE_PRIORITY: RecoverySource[] = [
  'localStorage',
  'indexedDB', 
  'server'
];

// Recovery workflow manager
export class BatchRecoveryManager {
  private config: RecoveryConfig;
  private activeRecoveries = new Map<string, Promise<RecoveryResult>>();

  constructor(config: Partial<RecoveryConfig> = {}) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  // Main recovery method - attempts to recover batch state from any available source
  async recoverBatchState(
    batchId: string,
    options: {
      sessionId?: string;
      userId?: string;
      preferredSource?: RecoverySource;
      allowPartialRecovery?: boolean;
      conflictResolution?: 'auto' | 'manual';
    } = {}
  ): Promise<RecoveryResult> {
    const startTime = Date.now();
    const logContext = { batchId, ...options };

    // Check if recovery is already in progress
    const existingRecovery = this.activeRecoveries.get(batchId);
    if (existingRecovery) {
      logger.info('Recovery already in progress, waiting for completion', logContext);
      return existingRecovery;
    }

    logger.info('Starting batch recovery', logContext);

    // Create recovery promise
    const recoveryPromise = this.performRecovery(batchId, options, startTime);
    this.activeRecoveries.set(batchId, recoveryPromise);

    try {
      const result = await recoveryPromise;
      logger.info('Batch recovery completed', {
        ...logContext,
        status: result.status,
        duration: result.metadata.duration,
        source: result.metadata.source,
        recoveredItems: result.recoveredItems.length,
        failedItems: result.failedItems.length,
      });
      return result;
    } finally {
      this.activeRecoveries.delete(batchId);
    }
  }

  // Internal recovery implementation
  private async performRecovery(
    batchId: string,
    options: {
      sessionId?: string;
      userId?: string;
      preferredSource?: RecoverySource;
      allowPartialRecovery?: boolean;
      conflictResolution?: 'auto' | 'manual';
    },
    startTime: number
  ): Promise<RecoveryResult> {
    const sources = options.preferredSource 
      ? [options.preferredSource, ...RECOVERY_SOURCE_PRIORITY.filter(s => s !== options.preferredSource)]
      : RECOVERY_SOURCE_PRIORITY;

    let lastError: Error | null = null;
    const attemptedSources: RecoverySource[] = [];
    const partialData: Partial<BatchState> = {};
    const recoveredItems: string[] = [];
    const failedItems: string[] = [];
    const warnings: string[] = [];

    // Try each source in priority order
    for (const source of sources) {
      if (Date.now() - startTime > this.config.recoveryTimeoutMs) {
        return this.createTimeoutResult(startTime, attemptedSources, partialData, recoveredItems, failedItems, warnings);
      }

      try {
        logger.debug(`Attempting recovery from ${source}`, { batchId, source });
        attemptedSources.push(source);

        const result = await this.recoverFromSource(batchId, source, options);
        
        if (result) {
          // Check for conflicts if we have multiple sources
          if (Object.keys(partialData).length > 0) {
            const conflictInfo = this.detectConflicts(partialData, result);
            if (conflictInfo && options.conflictResolution === 'manual') {
              return this.createConflictResult(startTime, conflictInfo, partialData, recoveredItems, failedItems, warnings);
            }

            // Auto-resolve conflicts if enabled
            if (conflictInfo && this.config.enableConflictResolution) {
              const resolved = await this.autoResolveConflicts(conflictInfo, result);
              Object.assign(partialData, resolved);
              warnings.push(`Conflicts auto-resolved between ${source} and previous sources`);
            } else {
              Object.assign(partialData, result);
            }
          } else {
            Object.assign(partialData, result);
          }

          recoveredItems.push(source);

          // If we have a complete state, return success
          if (this.isCompleteState(partialData)) {
            return this.createSuccessResult(
              startTime,
              partialData as BatchState,
              source,
              recoveredItems,
              failedItems,
              warnings
            );
          }
        }

      } catch (error) {
        logger.warn(`Recovery from ${source} failed`, { batchId, source, error });
        lastError = error as Error;
        failedItems.push(source);
        warnings.push(`Failed to recover from ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // If we have partial data and partial recovery is allowed
    if (Object.keys(partialData).length > 0 && options.allowPartialRecovery) {
      return this.createPartialResult(
        startTime,
        partialData,
        attemptedSources[0] || 'localStorage',
        recoveredItems,
        failedItems,
        warnings
      );
    }

    // Complete failure
    return this.createFailureResult(
      startTime,
      lastError || new Error('No recovery sources available'),
      attemptedSources[0] || 'localStorage',
      recoveredItems,
      failedItems,
      warnings
    );
  }

  // Recover from specific source
  private async recoverFromSource(
    batchId: string,
    source: RecoverySource,
    options: {
      sessionId?: string;
      userId?: string;
    }
  ): Promise<Partial<BatchState> | null> {
    switch (source) {
      case 'localStorage':
      case 'indexedDB':
        return this.recoverFromStorage(batchId);
      
      case 'server':
        return this.recoverFromServer(batchId, options.sessionId, options.userId);
      
      default:
        throw new Error(`Unknown recovery source: ${source}`);
    }
  }

  // Recover from local storage (localStorage or IndexedDB)
  private async recoverFromStorage(batchId: string): Promise<BatchState | null> {
    try {
      const persistedState = await restoreBatchState(batchId);
      return persistedState?.state || null;
    } catch (error) {
      logger.warn('Storage recovery failed', { batchId, error });
      return null;
    }
  }

  // Recover from server
  private async recoverFromServer(
    batchId: string,
    sessionId?: string,
    userId?: string
  ): Promise<Partial<BatchState> | null> {
    try {
      // Try to get batch status from server
      const response = await apiRequest('GET', `/api/batches/${batchId}/status`);
      
      if (!response.ok) {
        return null;
      }

      const serverData = await response.json();
      
      // Convert server response to BatchState format
      const batchState: Partial<BatchState> = {
        batchId: serverData.batchId,
        sessionId: serverData.sessionId || sessionId,
        status: 'ready', // Assume ready if server has data
        resumeCount: serverData.resumeCount || 0,
        lastValidated: Date.now(),
        isLoading: false,
        error: null,
      };

      return batchState;

    } catch (error) {
      logger.warn('Server recovery failed', { batchId, error });
      return null;
    }
  }

  // Detect conflicts between different data sources
  private detectConflicts(
    existingData: Partial<BatchState>,
    newData: Partial<BatchState>
  ): ConflictInfo | null {
    const conflictFields: string[] = [];

    // Check for data conflicts
    Object.keys(newData).forEach(key => {
      if (existingData.hasOwnProperty(key) && existingData[key as keyof BatchState] !== newData[key as keyof BatchState]) {
        conflictFields.push(key);
      }
    });

    if (conflictFields.length === 0) {
      return null;
    }

    // Create conflict resolution options
    const resolutionOptions: ConflictResolutionOption[] = [
      {
        id: 'use_newer',
        label: 'Use Newer Data',
        description: 'Use the data from the most recent source',
        action: 'use_remote',
        risk: 'low',
      },
      {
        id: 'use_existing',
        label: 'Keep Existing Data',
        description: 'Keep the currently loaded data',
        action: 'use_local',
        risk: 'low',
      },
      {
        id: 'merge_safe',
        label: 'Merge Safe Fields',
        description: 'Automatically merge non-conflicting fields',
        action: 'merge',
        risk: 'medium',
      },
      {
        id: 'manual_review',
        label: 'Manual Review',
        description: 'Manually choose which data to keep for each field',
        action: 'manual',
        risk: 'low',
      },
    ];

    return {
      type: 'data',
      localState: {
        version: STORAGE_VERSION,
        timestamp: Date.now(),
        batchId: existingData.batchId || '',
        sessionId: existingData.sessionId || '',
        state: existingData,
        metadata: {
          userAgent: navigator.userAgent,
          url: window.location.href,
          resumeCount: existingData.resumeCount || 0,
          lastActivity: Date.now(),
          syncStatus: 'conflict',
          checksum: '',
        },
      },
      remoteState: newData,
      conflictFields,
      resolutionOptions,
    };
  }

  // Auto-resolve conflicts based on predefined rules
  private async autoResolveConflicts(
    conflictInfo: ConflictInfo,
    newData: Partial<BatchState>
  ): Promise<Partial<BatchState>> {
    const resolved: Partial<BatchState> = { ...conflictInfo.localState.state };

    // Resolution rules (can be made configurable)
    for (const field of conflictInfo.conflictFields) {
      switch (field) {
        case 'lastValidated':
        case 'resumeCount':
          // Use newer/higher values for these fields
          resolved[field as keyof BatchState] = newData[field as keyof BatchState];
          break;
        
        case 'status':
          // Prefer 'ready' status over others
          if (newData.status === 'ready' || resolved.status !== 'ready') {
            resolved.status = newData.status;
          }
          break;
        
        case 'error':
          // Keep errors, don't overwrite with null
          if (newData.error && !resolved.error) {
            resolved.error = newData.error;
          }
          break;
        
        default:
          // Default to keeping existing data for unknown fields
          break;
      }
    }

    logger.info('Conflicts auto-resolved', {
      conflictFields: conflictInfo.conflictFields,
      resolutionStrategy: 'auto',
    });

    return resolved;
  }

  // Check if state is complete enough to be usable
  private isCompleteState(state: Partial<BatchState>): state is BatchState {
    const requiredFields: (keyof BatchState)[] = ['batchId', 'sessionId', 'status'];
    return requiredFields.every(field => state[field] !== undefined);
  }

  // Progressive recovery - attempt to recover individual components
  async progressiveRecovery(
    batchId: string,
    components: ('resumes' | 'analysis' | 'metadata')[] = ['resumes', 'analysis', 'metadata'],
    options: {
      sessionId?: string;
      userId?: string;
    } = {}
  ): Promise<{
    recovered: Record<string, any>;
    failed: string[];
    warnings: string[];
  }> {
    const recovered: Record<string, any> = {};
    const failed: string[] = [];
    const warnings: string[] = [];

    logger.info('Starting progressive recovery', { batchId, components });

    for (const component of components) {
      try {
        switch (component) {
          case 'resumes':
            const resumes = await this.recoverResumes(batchId, options);
            if (resumes) {
              recovered.resumes = resumes;
            } else {
              failed.push('resumes');
            }
            break;

          case 'analysis':
            const analysis = await this.recoverAnalysis(batchId, options);
            if (analysis) {
              recovered.analysis = analysis;
            } else {
              failed.push('analysis');
            }
            break;

          case 'metadata':
            const metadata = await this.recoverMetadata(batchId, options);
            if (metadata) {
              recovered.metadata = metadata;
            } else {
              failed.push('metadata');
            }
            break;
        }
      } catch (error) {
        logger.warn(`Failed to recover ${component}`, { batchId, component, error });
        failed.push(component);
        warnings.push(`Failed to recover ${component}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    logger.info('Progressive recovery completed', {
      batchId,
      recovered: Object.keys(recovered),
      failed,
      warnings: warnings.length,
    });

    return { recovered, failed, warnings };
  }

  // Recover resumes data
  private async recoverResumes(
    batchId: string,
    options: { sessionId?: string; userId?: string }
  ): Promise<any[] | null> {
    try {
      const response = await apiRequest('GET', `/api/resumes?batchId=${batchId}`);
      if (response.ok) {
        const data = await response.json();
        return data.resumes || null;
      }
    } catch (error) {
      logger.warn('Failed to recover resumes from server', { batchId, error });
    }
    return null;
  }

  // Recover analysis data
  private async recoverAnalysis(
    batchId: string,
    options: { sessionId?: string; userId?: string }
  ): Promise<any | null> {
    try {
      // Check for existing analysis results
      const response = await apiRequest('GET', `/api/analysis/analyze/1?batchId=${batchId}`);
      if (response.ok) {
        const data = await response.json();
        return data.results?.length > 0 ? data : null;
      }
    } catch (error) {
      logger.warn('Failed to recover analysis from server', { batchId, error });
    }
    return null;
  }

  // Recover metadata
  private async recoverMetadata(
    batchId: string,
    options: { sessionId?: string; userId?: string }
  ): Promise<any | null> {
    try {
      const response = await apiRequest('GET', `/api/batches/${batchId}/validate`);
      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      logger.warn('Failed to recover metadata from server', { batchId, error });
    }
    return null;
  }

  // Result creation methods
  private createSuccessResult(
    startTime: number,
    restoredState: BatchState,
    source: RecoverySource,
    recoveredItems: string[],
    failedItems: string[],
    warnings: string[]
  ): RecoveryResult {
    return {
      status: 'success',
      restoredState,
      recoveredItems,
      failedItems,
      warnings,
      metadata: {
        source,
        timestamp: Date.now(),
        version: STORAGE_VERSION,
        duration: Date.now() - startTime,
      },
    };
  }

  private createPartialResult(
    startTime: number,
    partialData: Partial<BatchState>,
    source: RecoverySource,
    recoveredItems: string[],
    failedItems: string[],
    warnings: string[]
  ): RecoveryResult {
    return {
      status: 'partial',
      partialData,
      recoveredItems,
      failedItems,
      warnings,
      metadata: {
        source,
        timestamp: Date.now(),
        version: STORAGE_VERSION,
        duration: Date.now() - startTime,
      },
    };
  }

  private createConflictResult(
    startTime: number,
    conflictDetails: ConflictInfo,
    partialData: Partial<BatchState>,
    recoveredItems: string[],
    failedItems: string[],
    warnings: string[]
  ): RecoveryResult {
    return {
      status: 'conflict',
      conflictDetails,
      partialData,
      recoveredItems,
      failedItems,
      warnings,
      metadata: {
        source: 'hybrid',
        timestamp: Date.now(),
        version: STORAGE_VERSION,
        duration: Date.now() - startTime,
      },
    };
  }

  private createFailureResult(
    startTime: number,
    error: Error,
    source: RecoverySource,
    recoveredItems: string[],
    failedItems: string[],
    warnings: string[]
  ): RecoveryResult {
    return {
      status: 'failed',
      errorDetails: new BatchError(
        BatchErrorType.BUSINESS_LOGIC,
        error.message,
        { originalError: error }
      ),
      recoveredItems,
      failedItems,
      warnings,
      metadata: {
        source,
        timestamp: Date.now(),
        version: STORAGE_VERSION,
        duration: Date.now() - startTime,
      },
    };
  }

  private createTimeoutResult(
    startTime: number,
    attemptedSources: RecoverySource[],
    partialData: Partial<BatchState>,
    recoveredItems: string[],
    failedItems: string[],
    warnings: string[]
  ): RecoveryResult {
    return {
      status: 'timeout',
      partialData: Object.keys(partialData).length > 0 ? partialData : undefined,
      recoveredItems,
      failedItems,
      warnings: [...warnings, 'Recovery timeout exceeded'],
      metadata: {
        source: attemptedSources[0] || 'localStorage',
        timestamp: Date.now(),
        version: STORAGE_VERSION,
        duration: Date.now() - startTime,
      },
    };
  }

  // Cleanup and cancel recovery
  cancelRecovery(batchId: string): boolean {
    const recovery = this.activeRecoveries.get(batchId);
    if (recovery) {
      this.activeRecoveries.delete(batchId);
      logger.info('Recovery cancelled', { batchId });
      return true;
    }
    return false;
  }

  // Get active recoveries
  getActiveRecoveries(): string[] {
    return Array.from(this.activeRecoveries.keys());
  }
}

// Global recovery manager instance
export const batchRecoveryManager = new BatchRecoveryManager();

// Helper functions for easy use
export const recoverBatchState = (
  batchId: string,
  options?: {
    sessionId?: string;
    userId?: string;
    preferredSource?: RecoverySource;
    allowPartialRecovery?: boolean;
    conflictResolution?: 'auto' | 'manual';
  }
) => batchRecoveryManager.recoverBatchState(batchId, options);

export const progressiveRecovery = (
  batchId: string,
  components?: ('resumes' | 'analysis' | 'metadata')[],
  options?: {
    sessionId?: string;
    userId?: string;
  }
) => batchRecoveryManager.progressiveRecovery(batchId, components, options);

export const cancelRecovery = (batchId: string) => 
  batchRecoveryManager.cancelRecovery(batchId);