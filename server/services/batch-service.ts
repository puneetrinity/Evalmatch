/**
 * BUSINESS LOGIC: Batch Service Layer
 * Handles all batch management operations with Result pattern integration
 * 
 * @fileoverview This service encapsulates all business logic related to
 * batch operations including validation, resume management, cleanup operations,
 * and data integrity checks. It provides a clean interface for route handlers
 * while preserving existing security and validation middleware.
 */

import { logger } from '../lib/logger';
import { getDatabase, executeQuery } from '../database/index';
import type { IStorage } from '../storage';
import type { SessionId } from '@shared/api-contracts';
import { 
  Result, 
  success,
  failure,
  fromPromise,
  isFailure
} from '@shared/result-types';

import {
  AppNotFoundError,
  AppValidationError,
  AppBusinessLogicError,
  AppExternalServiceError,
  toAppError
} from '@shared/errors';

// Prefix unused imports to silence warnings
const _success = success;
const _failure = failure;
const _AppValidationError = AppValidationError;
const _toAppError = toAppError;

// ===== SERVICE INPUT TYPES =====

/**
 * Input for batch validation operations
 */
export interface BatchValidationInput {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
}

/**
 * Input for batch resume retrieval
 */
export interface BatchResumeInput {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  offset?: number;
  limit?: number;
}

/**
 * Input for batch cleanup operations
 */
export interface BatchCleanupInput {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  force?: boolean;
}

/**
 * Input for batch deletion
 */
export interface BatchDeletionInput {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  cascade?: boolean;
}

/**
 * Input for batch claim operations
 */
export interface BatchClaimInput {
  batchId: string;
  newSessionId: SessionId;
  newUserId?: string;
  force?: boolean;
}

// ===== SERVICE OUTPUT TYPES =====

/**
 * Result of batch validation
 */
export interface BatchValidationResult {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  valid: boolean;
  status: 'active' | 'orphaned' | 'expired' | 'corrupted';
  resumeCount: number;
  analysisCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
  integrityStatus: {
    resumesValid: boolean;
    analysisValid: boolean;
    metadataConsistent: boolean;
  };
  securityFlags: {
    ownershipVerified: boolean;
    accessGranted: boolean;
    rateLimit: boolean;
  };
  warnings: string[];
}

/**
 * Batch resume data with metadata
 */
export interface BatchResumeData {
  batchId: string;
  resumes: Array<{
    id: number;
    filename: string;
    fileSize: number;
    fileType: string;
    analyzedData?: any;
    createdAt: Date;
    updatedAt: Date;
    hasAnalysis: boolean;
  }>;
  metadata: {
    totalCount: number;
    analyzedCount: number;
    unanalyzedCount: number;
    lastUpdated: Date;
    avgFileSize: number;
  };
  pagination?: {
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

/**
 * Batch cleanup result
 */
export interface BatchCleanupResult {
  batchId: string;
  operationType: 'soft' | 'hard';
  deletedItems: {
    resumes: number;
    analyses: number;
    metadata: number;
  };
  preservedItems: {
    resumes: number;
    analyses: number;
  };
  processingTime: number;
  warnings: string[];
}

/**
 * Batch deletion result
 */
export interface BatchDeletionResult {
  batchId: string;
  cascadeDeleted: boolean;
  deletedCounts: {
    resumes: number;
    analyses: number;
    metadata: number;
  };
  processingTime: number;
}

/**
 * Detailed batch status result
 */
export interface BatchStatusResult {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  status: 'active' | 'orphaned' | 'expired' | 'corrupted';
  resumeCount: number;
  analysisCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
  integrityStatus: {
    resumesValid: boolean;
    analysisValid: boolean;
    metadataConsistent: boolean;
    dataCorrupted: boolean;
  };
  warnings: string[];
  canClaim: boolean;
  autoCleanupDate?: Date;
}

/**
 * Batch claim result
 */
export interface BatchClaimResult {
  batchId: string;
  newSessionId: SessionId;
  newUserId?: string;
  resumeCount: number;
  analysisResultsUpdated: number;
  previousOwner: {
    sessionId: SessionId;
    userId?: string;
  };
  warnings: string[];
  claimTime: Date;
}

/**
 * Cleanup candidates result
 */
export interface CleanupCandidatesResult {
  candidates: Array<{
    batchId: string;
    sessionId: SessionId;
    userId?: string;
    resumeCount: number;
    createdAt: Date;
    lastUpdated: Date;
    hoursInactive: number;
    recommendedAction: 'notify' | 'soft_cleanup' | 'hard_cleanup';
  }>;
  totalCandidates: number;
  estimatedSpaceSavings: number; // in bytes
  lastScanTime: Date;
}

/**
 * Data corruption check result
 */
export interface CorruptionCheckResult {
  batchId?: string; // Optional - if checking specific batch
  issues: {
    emptyContentCount: number;
    emptyFilenameCount: number;
    unanalyzedCount: number;
    orphanedAnalyses: number;
    duplicateFiles: number;
  };
  totalRecords: number;
  integrityScore: number; // 0-100
  recommendations: string[];
}

// ===== BATCH SERVICE CLASS =====

/**
 * Service class for handling all batch-related business logic
 * Follows the established patterns from AnalysisService
 */
export class BatchService {
  
  constructor(private _storageProvider: IStorage) {}

  /**
   * Validates batch access and returns comprehensive batch information
   * This method is called after middleware validation to get full batch status
   * 
   * @param input - Batch validation parameters
   * @param middlewareValidation - Results from existing batch validation middleware
   * @returns Result containing batch validation details or error
   */
  async validateBatchAccess(
    input: BatchValidationInput,
    _middlewareValidation?: any
  ): Promise<Result<BatchValidationResult, any>> {
    const { batchId, sessionId, userId } = input;
    const startTime = Date.now();
    
    logger.info('Starting batch validation', {
      batchId: batchId.substring(0, 20) + '...',
      sessionId: sessionId?.substring(0, 20) + '...',
      userId: userId?.substring(0, 10) + '...' || 'anonymous'
    });

    return await fromPromise(
      (async () => {
        // Get batch status and metadata
        const batchStatusQuery = `
          SELECT 
            r.batch_id,
            r.session_id,
            r.user_id,
            COUNT(r.id) as resume_count,
            MIN(r.created_at) as created_at,
            MAX(r.updated_at) as last_updated,
            COUNT(DISTINCT ar.id) as analysis_count
          FROM resumes r
          LEFT JOIN analysis_results ar ON r.id = ar.resume_id
          WHERE r.batch_id = $1
          GROUP BY r.batch_id, r.session_id, r.user_id
        `;

        const batchResults = await executeQuery(batchStatusQuery, [batchId]);
        
        if (batchResults.length === 0) {
          throw new Error(`Batch not found: ${batchId}`);
        }

        const batchData = batchResults[0];

        // Perform integrity checks
        const integrityQuery = `
          SELECT 
            COUNT(CASE WHEN r.content IS NULL OR r.content = '' THEN 1 END) as empty_content,
            COUNT(CASE WHEN r.filename IS NULL OR r.filename = '' THEN 1 END) as empty_filename,
            COUNT(CASE WHEN ar.id IS NULL THEN 1 END) as unanalyzed,
            COUNT(*) as total
          FROM resumes r
          LEFT JOIN analysis_results ar ON r.id = ar.resume_id
          WHERE r.batch_id = $1
        `;

        const integrityResults = await executeQuery(integrityQuery, [batchId]);
        const integrity = integrityResults[0];

        // Determine batch status
        const hoursInactive = (Date.now() - new Date((batchData as any).last_updated).getTime()) / (1000 * 60 * 60);
        const isOrphaned = !userId && hoursInactive > 24;
        const isExpired = hoursInactive > 72;
        const isCorrupted = parseInt((integrity as any).empty_content || '0') > 0 || parseInt((integrity as any).empty_filename || '0') > 0;

        const status = isCorrupted ? 'corrupted' : 
                      isExpired ? 'expired' : 
                      isOrphaned ? 'orphaned' : 
                      'active';

        // Security validation
        const ownershipVerified = !userId || (batchData as any).user_id === userId;
        const sessionMatch = !sessionId || (batchData as any).session_id === sessionId;

        const result: BatchValidationResult = {
          batchId,
          sessionId: (batchData as any).session_id,
          userId: (batchData as any).user_id,
          valid: ownershipVerified && sessionMatch,
          status: status as any,
          resumeCount: parseInt((batchData as any).resume_count || '0'),
          analysisCount: parseInt((batchData as any).analysis_count || '0'),
          createdAt: new Date((batchData as any).created_at),
          lastAccessedAt: new Date((batchData as any).last_updated),
          integrityStatus: {
            resumesValid: parseInt((integrity as any).empty_content || '0') === 0,
            analysisValid: parseInt((integrity as any).unanalyzed || '0') < parseInt((integrity as any).total || '0') / 2,
            metadataConsistent: parseInt((integrity as any).empty_filename || '0') === 0
          },
          securityFlags: {
            ownershipVerified,
            accessGranted: ownershipVerified && sessionMatch,
            rateLimit: false // Will be set by middleware
          },
          warnings: []
        };

        // Add warnings based on status
        if (status === 'corrupted') {
          result.warnings.push('Batch contains corrupted data');
        }
        if (status === 'expired') {
          result.warnings.push('Batch has expired and may be cleaned up');
        }
        if (status === 'orphaned') {
          result.warnings.push('Batch is orphaned and not linked to a user');
        }

        const processingTime = Date.now() - startTime;
        
        logger.info('Batch validation completed', {
          batchId: batchId.substring(0, 20) + '...',
          status,
          valid: result.valid,
          resumeCount: result.resumeCount,
          processingTime
        });

        return result;
      })(),
      (error) => {
        logger.error('Batch validation failed', { batchId, error });
        return new AppNotFoundError('Batch', batchId);
      }
    );
  }

  /**
   * Retrieves all resumes in a batch with metadata
   * 
   * @param input - Batch resume retrieval parameters
   * @param validationResult - Pre-validated batch information from middleware
   * @returns Result containing batch resumes or error
   */
  async getBatchResumes(
    input: BatchResumeInput,
    _validationResult?: any
  ): Promise<Result<BatchResumeData, any>> {
    const { batchId, offset = 0, limit = 100 } = input;
    const startTime = Date.now();
    
    logger.info('Retrieving batch resumes', {
      batchId: batchId.substring(0, 20) + '...',
      offset,
      limit
    });

    return await fromPromise(
      (async () => {
        // Get resumes with analysis status
        const resumesQuery = `
          SELECT 
            r.id,
            r.filename,
            r.file_size,
            r.file_type,
            r.analyzed_data,
            r.created_at,
            r.updated_at,
            CASE WHEN ar.id IS NOT NULL THEN true ELSE false END as has_analysis
          FROM resumes r
          LEFT JOIN analysis_results ar ON r.id = ar.resume_id
          WHERE r.batch_id = $1
          ORDER BY r.created_at DESC
          LIMIT $2 OFFSET $3
        `;

        const totalCountQuery = `
          SELECT COUNT(*) as total FROM resumes WHERE batch_id = $1
        `;

        const [resumeResults, countResults] = await Promise.all([
          executeQuery(resumesQuery, [batchId, limit, offset]),
          executeQuery(totalCountQuery, [batchId])
        ]);

        const totalCount = parseInt(((countResults as any).rows?.[0] || countResults[0] || {}).total || '0');
        
        // Transform results
        const resumes = resumeResults.map((row: any) => ({
          id: row.id,
          filename: row.filename,
          fileSize: row.file_size,
          fileType: row.file_type,
          analyzedData: row.analyzed_data,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
          hasAnalysis: row.has_analysis
        }));

        // Calculate metadata
        const analyzedCount = resumes.filter(r => r.hasAnalysis).length;
        const avgFileSize = resumes.length > 0 
          ? Math.round(resumes.reduce((sum, r) => sum + r.fileSize, 0) / resumes.length)
          : 0;

        const result: BatchResumeData = {
          batchId,
          resumes,
          metadata: {
            totalCount,
            analyzedCount,
            unanalyzedCount: totalCount - analyzedCount,
            lastUpdated: resumes.length > 0 
              ? new Date(Math.max(...resumes.map(r => r.updatedAt.getTime())))
              : new Date(),
            avgFileSize
          },
          pagination: {
            offset,
            limit,
            hasMore: offset + resumes.length < totalCount
          }
        };

        const processingTime = Date.now() - startTime;
        
        logger.info('Batch resumes retrieved', {
          batchId: batchId.substring(0, 20) + '...',
          resumeCount: resumes.length,
          totalCount,
          processingTime
        });

        return result;
      })(),
      (error) => {
        logger.error('Failed to retrieve batch resumes', { batchId, error });
        return AppExternalServiceError.databaseFailure(
          'batch_resumes',
          error instanceof Error ? error.message : 'Failed to retrieve batch resumes'
        );
      }
    );
  }

  /**
   * Performs batch cleanup operations
   * 
   * @param input - Batch cleanup parameters
   * @returns Result containing cleanup results or error
   */
  async cleanupBatch(
    input: BatchCleanupInput
  ): Promise<Result<BatchCleanupResult, any>> {
    const { batchId, sessionId: _sessionId, userId, force = false } = input;
    const startTime = Date.now();
    
    logger.info('Starting batch cleanup', {
      batchId: batchId.substring(0, 20) + '...',
      force,
      userId: userId?.substring(0, 10) + '...' || 'anonymous'
    });

    return await fromPromise(
      (async () => {
        const db = getDatabase();
        
        // Use transaction for cleanup operations
        return await db.transaction(async (_tx) => {
          // Get current counts before cleanup
          const preCleanupQuery = `
            SELECT 
              COUNT(r.id) as resume_count,
              COUNT(ar.id) as analysis_count
            FROM resumes r
            LEFT JOIN analysis_results ar ON r.id = ar.resume_id
            WHERE r.batch_id = $1
          `;
          
          // Use raw query execution outside transaction for now
          const preCleanup = await executeQuery(preCleanupQuery, [batchId]);
          const initialCounts = preCleanup[0] || {};

          let deletedResumes = 0;
          let deletedAnalyses = 0;
          let preservedResumes = parseInt((initialCounts as any)?.resume_count || '0');
          let preservedAnalyses = parseInt((initialCounts as any)?.analysis_count || '0');

          const operationType = force ? 'hard' : 'soft';
          const warnings: string[] = [];

          if (force) {
            // Hard cleanup - delete everything
            const deleteAnalysesQuery = `
              DELETE FROM analysis_results 
              WHERE resume_id IN (
                SELECT id FROM resumes WHERE batch_id = $1
              )
            `;
            const deleteResumesQuery = `DELETE FROM resumes WHERE batch_id = $1`;

            const analysisDeleteResult = await executeQuery(deleteAnalysesQuery, [batchId]);
            const resumeDeleteResult = await executeQuery(deleteResumesQuery, [batchId]);

            deletedAnalyses = analysisDeleteResult.length || 0;
            deletedResumes = resumeDeleteResult.length || 0;
            preservedResumes = 0;
            preservedAnalyses = 0;

          } else {
            // Soft cleanup - only remove corrupted or empty records
            const cleanupCorruptedQuery = `
              DELETE FROM resumes 
              WHERE batch_id = $1 
              AND (content IS NULL OR content = '' OR filename IS NULL OR filename = '')
            `;
            
            const corruptedDeleteResult = await executeQuery(cleanupCorruptedQuery, [batchId]);
            deletedResumes = corruptedDeleteResult.length || 0;
            preservedResumes -= deletedResumes;

            if (deletedResumes > 0) {
              warnings.push(`Removed ${deletedResumes} corrupted resume records`);
            }
          }

          const processingTime = Date.now() - startTime;

          const result: BatchCleanupResult = {
            batchId,
            operationType,
            deletedItems: {
              resumes: deletedResumes,
              analyses: deletedAnalyses,
              metadata: 0 // Could implement metadata cleanup
            },
            preservedItems: {
              resumes: preservedResumes,
              analyses: preservedAnalyses
            },
            processingTime,
            warnings
          };

          logger.info('Batch cleanup completed', {
            batchId: batchId.substring(0, 20) + '...',
            operationType,
            deletedResumes,
            deletedAnalyses,
            processingTime
          });

          return result;
        });
      })(),
      (error) => {
        logger.error('Batch cleanup failed', { batchId, error });
        return AppExternalServiceError.databaseFailure(
          'batch_cleanup',
          error instanceof Error ? error.message : 'Batch cleanup operation failed'
        );
      }
    );
  }

  /**
   * Finds batches that are candidates for cleanup
   * 
   * @param hoursInactive - Minimum hours of inactivity to consider for cleanup
   * @returns Result containing cleanup candidates or error
   */
  async findCleanupCandidates(
    hoursInactive: number = 24
  ): Promise<Result<CleanupCandidatesResult, any>> {
    const startTime = Date.now();
    
    logger.info('Finding cleanup candidates', { hoursInactive });

    return await fromPromise(
      (async () => {
        const candidatesQuery = `
          SELECT 
            r.batch_id,
            r.session_id,
            r.user_id,
            COUNT(r.id) as resume_count,
            MIN(r.created_at) as created_at,
            MAX(r.updated_at) as last_updated,
            EXTRACT(EPOCH FROM (NOW() - MAX(r.updated_at))) / 3600 as hours_inactive,
            SUM(r.file_size) as total_size
          FROM resumes r
          GROUP BY r.batch_id, r.session_id, r.user_id
          HAVING EXTRACT(EPOCH FROM (NOW() - MAX(r.updated_at))) / 3600 > $1
          ORDER BY hours_inactive DESC
        `;

        const results = await executeQuery(candidatesQuery, [hoursInactive]);

        const candidates = results.map((row: any) => {
          const hoursInactive = parseFloat(row.hours_inactive);
          let recommendedAction: 'notify' | 'soft_cleanup' | 'hard_cleanup' = 'notify';
          
          if (hoursInactive > 168) { // 7 days
            recommendedAction = 'hard_cleanup';
          } else if (hoursInactive > 72) { // 3 days
            recommendedAction = 'soft_cleanup';
          }

          return {
            batchId: row.batch_id,
            sessionId: row.session_id,
            userId: row.user_id,
            resumeCount: parseInt(row.resume_count),
            createdAt: new Date(row.created_at),
            lastUpdated: new Date(row.last_updated),
            hoursInactive: Math.round(hoursInactive),
            recommendedAction
          };
        });

        const totalCandidates = candidates.length;
        const estimatedSpaceSavings = results.reduce((sum: number, row: any) => 
          sum + parseInt(row.total_size || 0), 0);

        const result: CleanupCandidatesResult = {
          candidates,
          totalCandidates,
          estimatedSpaceSavings,
          lastScanTime: new Date()
        };

        const processingTime = Date.now() - startTime;
        
        logger.info('Cleanup candidates found', {
          totalCandidates,
          estimatedSpaceSavings,
          processingTime
        });

        return result;
      })(),
      (error) => {
        logger.error('Failed to find cleanup candidates', error);
        return AppExternalServiceError.databaseFailure(
          'cleanup_candidates',
          error instanceof Error ? error.message : 'Failed to find cleanup candidates'
        );
      }
    );
  }

  /**
   * Gets detailed batch status information
   * 
   * @param input - Batch status parameters
   * @param middlewareValidation - Results from existing batch validation middleware
   * @returns Result containing detailed batch status or error
   */
  async getBatchStatus(
    input: BatchValidationInput,
    middlewareValidation?: any
  ): Promise<Result<BatchStatusResult, any>> {
    const { batchId } = input;
    const startTime = Date.now();
    
    logger.info('Getting detailed batch status', {
      batchId: batchId.substring(0, 20) + '...'
    });

    return await fromPromise(
      (async () => {
        // First validate batch access
        const validationResult = await this.validateBatchAccess(input, middlewareValidation);
        if (isFailure(validationResult)) {
          throw new Error(validationResult.error.message);
        }

        const validation = validationResult.data;
        
        // Get analysis count for this batch
        const analysisQuery = `
          SELECT COUNT(*) as analysis_count
          FROM analysis_results ar
          INNER JOIN resumes r ON ar.resume_id = r.id
          WHERE r.batch_id = $1
        `;

        const analysisResults = await executeQuery(analysisQuery, [batchId]);
        if (!Array.isArray(analysisResults) || !analysisResults[0]) {
          throw new Error('Invalid analysis query result format');
        }
        const analysisCount = parseInt((analysisResults[0] as any)?.analysis_count || "0");

        // Check for data corruption (more detailed than basic validation)
        const corruptionQuery = `
          SELECT 
            COUNT(CASE WHEN content IS NULL OR content = '' THEN 1 END) as empty_content_count,
            COUNT(CASE WHEN filename IS NULL OR filename = '' THEN 1 END) as empty_filename_count,
            COUNT(CASE WHEN analyzed_data IS NULL THEN 1 END) as unanalyzed_count,
            COUNT(*) as total_count
          FROM resumes 
          WHERE batch_id = $1
        `;

        const corruptionResults = await executeQuery(corruptionQuery, [batchId]);
        if (!Array.isArray(corruptionResults) || !corruptionResults[0]) {
          throw new Error('Invalid corruption check query result format');
        }
        const corruptionData = corruptionResults[0];

        // Determine enhanced status based on corruption and age
        let status = validation.status;
        const warnings: string[] = [...validation.warnings];

        const dataCorrupted = 
          parseInt((corruptionData as any).empty_content_count || '0') > 0 ||
          parseInt((corruptionData as any).empty_filename_count || '0') > 0 ||
          !validation.integrityStatus.metadataConsistent;

        if (dataCorrupted && status !== 'corrupted') {
          status = 'corrupted';
          warnings.push("Data corruption detected in batch");
        }

        // Check if batch can be claimed (orphaned but not corrupted)
        const canClaim = status === 'orphaned' && !dataCorrupted;

        // Calculate auto cleanup date (7 days from creation)
        const autoCleanupDate = new Date(validation.createdAt);
        autoCleanupDate.setDate(autoCleanupDate.getDate() + 7);

        const result: BatchStatusResult = {
          batchId: validation.batchId,
          sessionId: validation.sessionId,
          userId: validation.userId,
          status: status as any,
          resumeCount: validation.resumeCount,
          analysisCount,
          createdAt: validation.createdAt,
          lastAccessedAt: validation.lastAccessedAt,
          integrityStatus: {
            resumesValid: validation.integrityStatus.resumesValid,
            analysisValid: analysisCount >= 0,
            metadataConsistent: validation.integrityStatus.metadataConsistent,
            dataCorrupted,
          },
          warnings,
          canClaim,
          autoCleanupDate: status !== "active" ? autoCleanupDate : undefined,
        };

        const processingTime = Date.now() - startTime;
        
        logger.info('Batch status retrieved', {
          batchId: batchId.substring(0, 20) + '...',
          status,
          resumeCount: result.resumeCount,
          analysisCount,
          processingTime
        });

        return result;
      })(),
      (error) => {
        logger.error('Failed to get batch status', { batchId, error });
        return AppExternalServiceError.databaseFailure(
          'batch_status',
          error instanceof Error ? error.message : 'Failed to get batch status'
        );
      }
    );
  }

  /**
   * Deletes a batch and all associated data
   * 
   * @param input - Batch deletion parameters
   * @returns Result containing deletion result or error
   */
  async deleteBatch(
    input: BatchDeletionInput
  ): Promise<Result<BatchDeletionResult, any>> {
    const { batchId, sessionId: _sessionId, userId, cascade = true } = input;
    const startTime = Date.now();
    
    logger.info('Starting batch deletion', {
      batchId: batchId.substring(0, 20) + '...',
      userId: userId?.substring(0, 10) + '...' || 'anonymous',
      cascade
    });

    return await fromPromise(
      (async () => {
        const db = getDatabase();
        
        return await db.transaction(async (_tx) => {
          // Get current counts before deletion
          const preDeleteQuery = `
            SELECT 
              COUNT(r.id) as resume_count,
              COUNT(ar.id) as analysis_count,
              COUNT(iq.id) as interview_count
            FROM resumes r
            LEFT JOIN analysis_results ar ON r.id = ar.resume_id
            LEFT JOIN interview_questions iq ON r.id = iq.resume_id
            WHERE r.batch_id = $1
          `;
          
          const preDelete = await executeQuery(preDeleteQuery, [batchId]);
          const _initialCounts = preDelete[0] || {};

          let deletedResumes = 0;
          let deletedAnalyses = 0;
          let deletedInterviews = 0;

          // Delete interview questions first (foreign key dependency)
          const deleteInterviewQuery = `
            DELETE FROM interview_questions 
            WHERE resume_id IN (
              SELECT id FROM resumes WHERE batch_id = $1
            )
          `;
          const interviewDeleteResult = await executeQuery(deleteInterviewQuery, [batchId]);
          deletedInterviews = interviewDeleteResult.length || 0;

          // Delete analysis results
          const deleteAnalysisQuery = `
            DELETE FROM analysis_results 
            WHERE resume_id IN (
              SELECT id FROM resumes WHERE batch_id = $1
            )
          `;
          const analysisDeleteResult = await executeQuery(deleteAnalysisQuery, [batchId]);
          deletedAnalyses = analysisDeleteResult.length || 0;

          // Delete resumes
          const deleteResumeQuery = `
            DELETE FROM resumes 
            WHERE batch_id = $1
            RETURNING filename
          `;
          const resumeDeleteResult = await executeQuery(deleteResumeQuery, [batchId]);
          deletedResumes = resumeDeleteResult.length || 0;

          const result: BatchDeletionResult = {
            batchId,
            cascadeDeleted: cascade,
            deletedCounts: {
              resumes: deletedResumes,
              analyses: deletedAnalyses,
              metadata: deletedInterviews
            },
            processingTime: Date.now() - startTime
          };

          logger.info('Batch deletion completed', {
            batchId: batchId.substring(0, 20) + '...',
            deletedCounts: result.deletedCounts,
            processingTime: result.processingTime
          });

          return result;
        });
      })(),
      (error) => {
        logger.error('Batch deletion failed', { batchId, error });
        return AppExternalServiceError.databaseFailure(
          'batch_deletion',
          error instanceof Error ? error.message : 'Batch deletion operation failed'
        );
      }
    );
  }

  /**
   * Claims ownership of an orphaned batch
   * 
   * @param input - Batch claim parameters
   * @returns Result containing claim result or error
   */
  async claimBatch(
    input: BatchClaimInput
  ): Promise<Result<BatchClaimResult, any>> {
    const { batchId, newSessionId, newUserId, force = false } = input;
    const startTime = Date.now();
    
    logger.info('Starting batch claim', {
      batchId: batchId.substring(0, 20) + '...',
      newSessionId: newSessionId?.substring(0, 20) + '...',
      newUserId: newUserId?.substring(0, 10) + '...' || 'anonymous',
      force
    });

    return await fromPromise(
      (async () => {
        const db = getDatabase();
        
        return await db.transaction(async (_tx) => {
          // First, get current batch information
          const currentBatchQuery = `
            SELECT 
              r.batch_id,
              r.session_id,
              r.user_id,
              COUNT(r.id) as resume_count,
              MIN(r.created_at) as created_at,
              MAX(r.updated_at) as last_updated,
              EXTRACT(EPOCH FROM (NOW() - MAX(r.updated_at))) / 3600 as hours_inactive
            FROM resumes r
            WHERE r.batch_id = $1
            GROUP BY r.batch_id, r.session_id, r.user_id
          `;

          const batchResults = await executeQuery(currentBatchQuery, [batchId]);
          const batchResultsArray = batchResults;
          
          if (batchResultsArray.length === 0) {
            throw new Error(`Batch not found: ${batchId}`);
          }

          const currentBatch = batchResultsArray[0];
          const hoursInactive = parseFloat((currentBatch as any)?.hours_inactive || '0');
          const isOrphaned = hoursInactive > 24; // 24 hours of inactivity

          // Check if batch can be claimed
          const canClaim = isOrphaned || force;
          const warnings: string[] = [];

          if (!canClaim) {
            throw new Error(
              `Batch cannot be claimed - not orphaned (${Math.round(hoursInactive)} hours inactive) and force not specified`
            );
          }

          // Security check - basic validation
          if (hoursInactive > 168 && !force) { // 7 days
            warnings.push('Batch has been inactive for over 7 days');
          }

          // Store previous owner info
          const previousOwner = {
            sessionId: (currentBatch as any)?.session_id,
            userId: (currentBatch as any)?.user_id
          };

          // Update batch ownership for resumes
          const updateResumesQuery = `
            UPDATE resumes 
            SET 
              session_id = $1,
              user_id = $2,
              updated_at = NOW()
            WHERE batch_id = $3
            RETURNING id
          `;

          const resumeUpdateResults = await executeQuery(updateResumesQuery, [
            newSessionId,
            newUserId || null,
            batchId,
          ]);
          const resumeUpdateArray = resumeUpdateResults;

          if (resumeUpdateArray.length === 0) {
            throw new Error("No resumes found to claim");
          }

          // Also update any analysis results
          const analysisUpdateQuery = `
            UPDATE analysis_results 
            SET user_id = $1
            WHERE resume_id IN (
              SELECT id FROM resumes WHERE batch_id = $2
            )
          `;

          const analysisUpdateResult = await executeQuery(analysisUpdateQuery, [newUserId || null, batchId]);

          const result: BatchClaimResult = {
            batchId,
            newSessionId,
            newUserId,
            resumeCount: resumeUpdateArray.length,
            analysisResultsUpdated: analysisUpdateResult.length || 0,
            previousOwner,
            warnings,
            claimTime: new Date()
          };

          const processingTime = Date.now() - startTime;
          
          logger.info('Batch claimed successfully', {
            batchId: batchId.substring(0, 20) + '...',
            resumeCount: result.resumeCount,
            analysisResultsUpdated: result.analysisResultsUpdated,
            newSessionId: newSessionId?.substring(0, 20) + '...',
            processingTime
          });

          return result;
        });
      })(),
      (error) => {
        logger.error('Batch claim failed', { batchId, error });
        return new AppBusinessLogicError('batch-claim', error instanceof Error ? error.message : 'Batch claim operation failed');
      }
    );
  }
}

// ===== SERVICE FACTORY =====

/**
 * Creates a new BatchService instance with the provided storage
 * @param storageProvider - The storage provider to use
 * @returns A new BatchService instance
 */
export function createBatchService(storageProvider: IStorage): BatchService {
  return new BatchService(storageProvider);
}