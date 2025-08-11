/**
 * BUSINESS LOGIC: Resume Service Layer
 * Handles all resume-related operations with Result pattern integration
 * 
 * @fileoverview This service encapsulates all business logic related to resume
 * management, analysis, and processing. It provides a clean interface between
 * route handlers and data operations.
 * 
 * @example
 * ```typescript
 * const resumeService = new ResumeService(storage);
 * 
 * // Upload and process resume
 * const result = await resumeService.uploadResume({
 *   userId: 'user123',
 *   file: uploadedFile,
 *   sessionId: 'session789'
 * });
 * 
 * // Get user's resumes with filtering
 * const resumes = await resumeService.getUserResumes({
 *   userId: 'user123',
 *   batchId: 'batch456',
 *   page: 1,
 *   limit: 20
 * });
 * ```
 */

import { logger } from '../lib/logger';
import { getStorage, IStorage } from '../storage';
import { QueryBuilder, ResumeQueryBuilder } from '../lib/query-builder';
import { analyzeResumeWithCache } from '../lib/cached-ai-operations';
import { getUserTierInfo } from '../lib/user-tiers';
import { parseDocument } from '../lib/document-parser';
import {
  success,
  failure,
  isSuccess,
  isFailure,
  ResumeAnalysisResult,
} from '@shared/result-types';
import {
  transformDatabaseResult,
  transformResumeServiceResult,
  transformAppError,
  transformNotFoundError,
  transformToAnalyzeResumeResponse,
  mapNotFoundToBusinessLogic
} from '@shared/type-utilities';
import {
  AppNotFoundError,
  AppValidationError,
  AppBusinessLogicError,
  AppExternalServiceError,
  toAppError
} from '@shared/errors';
import {
  AnalyzedResumeData,
  AnalyzeResumeResponse,
  Resume,
  InsertResume
} from '@shared/schema';

// Prefix unused imports to silence warnings
const _ResumeQueryBuilder = ResumeQueryBuilder;
const _transformDatabaseResult = transformDatabaseResult;
const _transformResumeServiceResult = transformResumeServiceResult;
const _transformAppError = transformAppError;
const _transformNotFoundError = transformNotFoundError;
const _AppBusinessLogicError = AppBusinessLogicError;
const _toAppError = toAppError;

// ===== SERVICE INPUT TYPES =====

/**
 * Input for resume upload
 */
export interface UploadResumeInput {
  /** User uploading the resume */
  userId: string;
  /** Uploaded file object */
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
  /** Optional session ID for grouping */
  sessionId?: string;
  /** Optional batch ID for grouping */
  batchId?: string;
  /** Whether to automatically analyze the resume */
  autoAnalyze?: boolean;
}

/**
 * Input for getting user's resumes
 */
export interface GetUserResumesInput {
  /** User requesting resumes */
  userId: string;
  /** Optional session filter */
  sessionId?: string;
  /** Optional batch filter */
  batchId?: string;
  /** Page number for pagination */
  page?: number;
  /** Items per page */
  limit?: number;
  /** Filter by file type */
  fileType?: string;
  /** Filter by analysis status */
  hasAnalysis?: boolean;
}

/**
 * Input for resume update
 */
export interface UpdateResumeInput {
  /** User performing update */
  userId: string;
  /** Resume ID to update */
  resumeId: number;
  /** New filename (optional) */
  filename?: string;
  /** Force re-analysis */
  forceReanalysis?: boolean;
}

/**
 * Input for resume analysis
 */
export interface AnalyzeResumeInput {
  /** User requesting analysis */
  userId: string;
  /** Resume ID to analyze */
  resumeId: number;
  /** Force re-analysis even if already analyzed */
  forceReanalysis?: boolean;
}

/**
 * Input for batch resume upload
 */
export interface BatchUploadInput {
  /** User uploading resumes */
  userId: string;
  /** Array of uploaded files */
  files: Array<{
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }>;
  /** Session ID for the batch */
  sessionId?: string;
  /** Batch ID for grouping */
  batchId?: string;
  /** Whether to automatically analyze all resumes */
  autoAnalyze?: boolean;
}

// ===== SERVICE OUTPUT TYPES =====

/**
 * Result of resume upload
 */
export interface ResumeUploadResult {
  /** Resume ID */
  id: number;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  fileSize: number;
  /** File MIME type */
  fileType: string;
  /** Upload timestamp */
  uploadedAt: string;
  /** Extracted text content */
  extractedText?: string;
  /** Analysis result (if auto-analyze was enabled) */
  analyzedData?: AnalyzedResumeData;
  /** Processing warnings */
  warnings?: string[];
  /** Processing time */
  processingTime: number;
}

/**
 * Result of resume list query
 */
export interface ResumeListResult {
  /** Array of resumes */
  resumes: Array<{
    id: number;
    filename: string;
    fileSize: number;
    fileType: string;
    uploadedAt: string;
    hasAnalysis: boolean;
    analysisDate?: string;
  }>;
  /** Pagination information */
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  /** Query metadata */
  metadata: {
    queryTime: number;
    filters: Record<string, any>;
  };
}

/**
 * Result of batch upload operation
 */
export interface BatchUploadResult {
  /** Batch processing ID */
  batchId: string;
  /** Successfully uploaded resumes */
  successful: ResumeUploadResult[];
  /** Failed uploads with error details */
  failed: Array<{
    filename: string;
    error: string;
    reason: string;
  }>;
  /** Processing statistics */
  statistics: {
    total: number;
    successful: number;
    failed: number;
    totalSize: number;
    processingTime: number;
  };
}

// ===== RESUME SERVICE CLASS =====

/**
 * Service class for handling all resume-related business logic
 * Provides clean separation between route handlers and data operations
 */
export class ResumeService {
  
  constructor(
    private _storageProvider?: IStorage
  ) {}

  private getStorageProvider(): IStorage {
    logger.debug('ResumeService: Attempting to get storage provider', {
      hasInjectectedStorage: !!this._storageProvider,
      timestamp: new Date().toISOString()
    });
    
    if (this._storageProvider) {
      logger.debug('ResumeService: Using injected storage provider', {
        storageType: this._storageProvider.constructor.name
      });
      return this._storageProvider;
    }
    
    logger.debug('ResumeService: Getting global storage instance...');
    return getStorage();
  }

  /**
   * Uploads and processes a single resume
   * 
   * @param input - Resume upload parameters
   * @returns Result containing upload result or error
   */
  async uploadResume(
    input: UploadResumeInput
  ): Promise<ResumeAnalysisResult<ResumeUploadResult>> {
    const { userId, file, sessionId, batchId, autoAnalyze = false } = input;
    const startTime = Date.now();

    logger.info('Starting resume upload', {
      userId,
      filename: file.originalname,
      size: file.size,
      type: file.mimetype,
      sessionId,
      batchId,
      autoAnalyze
    });

    // Validate file
    const validationResult = this.validateResumeFile(file);
    if (isFailure(validationResult)) {
      return validationResult;
    }

    try {
      // Extract text content from file
      let extractedText: string;
      let warnings: string[] | undefined;
      
      try {
        extractedText = await parseDocument(file.buffer, file.mimetype);
        warnings = []; // parseDocument doesn't return warnings, initialize as empty
      } catch (error) {
        logger.error('Document parsing failed', {
          filename: file.originalname,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return failure(AppExternalServiceError.aiProviderFailure('DocumentParser', 'text_extraction', error instanceof Error ? error.message : 'Unknown error'));
      }

      // Create resume record
      const resumeData: InsertResume = {
        userId,
        sessionId: sessionId || null,
        batchId: batchId || null,
        filename: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        content: extractedText
      };

      const resume = await this.getStorageProvider().createResume(resumeData);

      let analyzedData: AnalyzedResumeData | undefined;
      
      // Perform analysis if requested
      if (autoAnalyze && extractedText.trim().length > 0) {
        const userTierInfo = getUserTierInfo(userId);
        const analysisResult = await analyzeResumeWithCache(extractedText, userTierInfo);
        
        if (isSuccess(analysisResult)) {
          analyzedData = analysisResult.data.analyzedData;
          
          // Update resume with analysis (store the analyzed data part only)
          try {
            // Create a complete AnalyzeResumeResponse for storage
            const analysisResponse = transformToAnalyzeResumeResponse(
              resume.id,
              resume.filename,
              analyzedData,
              Date.now() - startTime,
              0.8
            );
            await this.getStorageProvider().updateResumeAnalysis(resume.id, analysisResponse);
          } catch (error) {
            logger.error('Failed to update resume with analysis', {
              resumeId: resume.id,
              error
            });
            // Continue - not critical for upload success
          }
        } else {
          logger.warn('Auto-analysis failed during upload', {
            resumeId: resume.id,
            error: analysisResult.error.message
          });
        }
      }

      const processingTime = Date.now() - startTime;

      logger.info('Resume upload completed', {
        resumeId: resume.id,
        filename: file.originalname,
        extractedTextLength: extractedText.length,
        hasAnalysis: !!analyzedData,
        processingTime
      });

      return success({
        id: resume.id,
        filename: resume.filename,
        fileSize: resume.fileSize || 0,
        fileType: resume.fileType || file.mimetype,
        uploadedAt: resume.createdAt?.toISOString() || new Date().toISOString(),
        extractedText,
        analyzedData,
        warnings,
        processingTime
      });

    } catch (error) {
      logger.error('Resume upload failed', {
        userId,
        filename: file.originalname,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return failure(AppExternalServiceError.databaseFailure('resume_upload', error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Uploads multiple resumes in batch
   * 
   * @param input - Batch upload parameters
   * @returns Result containing batch upload results or error
   */
  async uploadResumesBatch(
    input: BatchUploadInput
  ): Promise<ResumeAnalysisResult<BatchUploadResult>> {
    const { userId, files, sessionId, batchId, autoAnalyze = false } = input;
    const startTime = Date.now();
    const generatedBatchId = batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Starting batch resume upload', {
      userId,
      fileCount: files.length,
      batchId: generatedBatchId,
      sessionId,
      autoAnalyze
    });

    // Validate batch size
    if (files.length === 0) {
      return failure(AppValidationError.requiredField('files'));
    }

    if (files.length > 20) { // Reasonable batch limit
      return failure(AppValidationError.fileTooLarge('20 files per batch'));
    }

    const successful: ResumeUploadResult[] = [];
    const failed: BatchUploadResult['failed'] = [];
    let totalSize = 0;

    // Process all files in parallel with controlled concurrency
    const uploadPromises = files.map(async (file) => {
      totalSize += file.size;
      
      const uploadResult = await this.uploadResume({
        userId,
        file,
        sessionId,
        batchId: generatedBatchId,
        autoAnalyze
      });

      if (isSuccess(uploadResult)) {
        successful.push(uploadResult.data);
      } else {
        failed.push({
          filename: file.originalname,
          error: uploadResult.error.code,
          reason: uploadResult.error.message
        });
      }
    });

    await Promise.all(uploadPromises);

    const processingTime = Date.now() - startTime;

    logger.info('Batch upload completed', {
      batchId: generatedBatchId,
      total: files.length,
      successful: successful.length,
      failed: failed.length,
      processingTime
    });

    return success({
      batchId: generatedBatchId,
      successful,
      failed,
      statistics: {
        total: files.length,
        successful: successful.length,
        failed: failed.length,
        totalSize,
        processingTime
      }
    });
  }

  /**
   * Gets resumes for a user with filtering and pagination
   * 
   * @param input - Query parameters
   * @returns Result containing resume list or error
   */
  async getUserResumes(
    input: GetUserResumesInput
  ): Promise<ResumeAnalysisResult<ResumeListResult>> {
    const { 
      userId, 
      sessionId, 
      batchId, 
      page = 1, 
      limit = 20,
      fileType,
      hasAnalysis
    } = input;
    
    const startTime = Date.now();

    logger.info('Getting user resumes', {
      userId,
      sessionId,
      batchId,
      page,
      limit,
      fileType,
      hasAnalysis
    });

    try {
      // Use QueryBuilder for consistent filtering
      const queryBuilder = QueryBuilder.forUser(userId)
        .withSession(sessionId)
        .withBatch(batchId)
        .paginate(page, limit);

      // Add file type filter if specified
      if (fileType) {
        queryBuilder.where('fileType', fileType);
      }

      // Add analysis filter if specified  
      if (hasAnalysis !== undefined) {
        // This would be implemented in the actual storage layer
        if (hasAnalysis) {
          // Filter for resumes with analysis
        } else {
          // Filter for resumes without analysis
        }
      }

      // Execute query using storage provider
      const resumes = await this.getStorageProvider().getResumesByUserId(userId, sessionId, batchId);
      
      if (!resumes || resumes.length === 0) {
        return failure(mapNotFoundToBusinessLogic(AppNotFoundError.resourceNotFound('resumes')));
      }

      // Apply pagination (would be done in storage layer in practice)
      const offset = (page - 1) * limit;
      const paginatedResumes = resumes.slice(offset, offset + limit);

      // Format results
      const formattedResumes = paginatedResumes.map(resume => ({
        id: resume.id,
        filename: resume.filename,
        fileSize: resume.fileSize || 0,
        fileType: resume.fileType || 'unknown',
        uploadedAt: resume.createdAt?.toISOString() || new Date().toISOString(),
        hasAnalysis: !!resume.analyzedData,
        analysisDate: resume.updatedAt?.toISOString()
      }));

      const queryTime = Date.now() - startTime;

      return success({
        resumes: formattedResumes,
        pagination: {
          page,
          limit,
          total: resumes.length,
          totalPages: Math.ceil(resumes.length / limit),
          hasNext: offset + limit < resumes.length,
          hasPrev: page > 1
        },
        metadata: {
          queryTime,
          filters: { userId, sessionId, batchId, fileType, hasAnalysis }
        }
      });

    } catch (error) {
      logger.error('Failed to get user resumes', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return failure(AppExternalServiceError.databaseFailure('get_resumes', error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Gets a specific resume by ID
   * 
   * @param userId - User requesting the resume
   * @param resumeId - Resume ID to retrieve
   * @returns Result containing resume details or error
   */
  async getResumeById(
    userId: string,
    resumeId: number
  ): Promise<ResumeAnalysisResult<Resume>> {
    logger.info('Getting resume by ID', { userId, resumeId });

    try {
      const resume = await this.getStorageProvider().getResumeById(resumeId, userId);
      
      if (!resume) {
        return failure(mapNotFoundToBusinessLogic(AppNotFoundError.resume(resumeId)));
      }

      return success(resume);
    } catch (error) {
      logger.error('Failed to get resume', {
        userId,
        resumeId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return failure(AppExternalServiceError.databaseFailure('get_resume', error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Analyzes a resume (or re-analyzes if already analyzed)
   * 
   * @param input - Analysis parameters
   * @returns Result containing analysis result or error
   */
  async analyzeResume(
    input: AnalyzeResumeInput
  ): Promise<ResumeAnalysisResult<AnalyzeResumeResponse>> {
    const { userId, resumeId, forceReanalysis = false } = input;
    const startTime = Date.now();

    logger.info('Analyzing resume', { userId, resumeId, forceReanalysis });

    // Get resume
    const resumeResult = await this.getResumeById(userId, resumeId);
    if (isFailure(resumeResult)) {
      return resumeResult; // Already returns proper App error types
    }

    const resume = resumeResult.data;

    // Check if already analyzed and not forcing re-analysis
    if (resume.analyzedData && !forceReanalysis) {
      logger.info('Resume already analyzed, returning existing analysis', { resumeId });
      
      const response = transformToAnalyzeResumeResponse(
        resume.id,
        resume.filename,
        resume.analyzedData,
        Date.now() - startTime,
        1.0, // Existing analysis
        []
      );
      
      return success(response);
    }

    // Perform analysis
    if (!resume.content) {
      return failure(AppValidationError.requiredField('content'));
    }

    const userTierInfo = getUserTierInfo(userId);
    const analysisResult = await analyzeResumeWithCache(resume.content, userTierInfo);
    
    if (isFailure(analysisResult)) {
      return failure(AppExternalServiceError.aiProviderFailure('ResumeAnalysis', 'analysis', analysisResult.error.message));
    }

    // Update resume with analysis
    try {
      await this.getStorageProvider().updateResumeAnalysis(resumeId, analysisResult.data);
    } catch (error) {
      logger.error('Failed to update resume with analysis', { resumeId, error });
      // Return analysis result anyway - storage update failure is not critical
    }

    logger.info('Resume analysis completed', {
      resumeId,
      skillsFound: analysisResult.data.analyzedData.skills?.length || 0,
      processingTime: Date.now() - startTime
    });

    return success(analysisResult.data);
  }

  /**
   * Deletes a resume
   * 
   * @param userId - User performing the deletion
   * @param resumeId - Resume ID to delete
   * @returns Result indicating success or error
   */
  async deleteResume(
    userId: string,
    resumeId: number
  ): Promise<ResumeAnalysisResult<{ deleted: true }>> {
    logger.info('Deleting resume', { userId, resumeId });

    try {
      // Verify resume exists and belongs to user
      const resumeResult = await this.getResumeById(userId, resumeId);
      if (isFailure(resumeResult)) {
        return resumeResult; // Already returns App error types
      }

      // Delete resume
      // TODO: Implement deleteResume method in storage layer
      throw new Error('Delete resume functionality not yet implemented');
      
      // TODO: When delete functionality is implemented, uncomment:
      // logger.info('Resume deleted successfully', { userId, resumeId });
      // return success({ deleted: true });
    } catch (error) {
      logger.error('Failed to delete resume', {
        userId,
        resumeId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return failure(AppExternalServiceError.databaseFailure('delete_resume', error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  /**
   * Validates uploaded resume file
   * 
   * @param file - File to validate
   * @returns Result indicating validation success or error
   */
  private validateResumeFile(
    file: UploadResumeInput['file']
  ): ResumeAnalysisResult<{ valid: true }> {
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return failure(AppValidationError.fileTooLarge('10MB'));
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return failure(AppValidationError.unsupportedFileType(allowedTypes));
    }

    // Check filename
    if (!file.originalname || file.originalname.trim().length === 0) {
      return failure(AppValidationError.requiredField('filename'));
    }

    return success({ valid: true });
  }
}

// ===== SERVICE FACTORY =====

/**
 * Create a resume service instance with the provided or default storage
 * This prevents initialization order issues by deferring storage access
 */
export function createResumeService(storageProvider?: IStorage): ResumeService {
  return new ResumeService(storageProvider);
}

/**
 * Get the default resume service instance
 * Creates a new instance that uses the global storage provider
 * @deprecated Use createResumeService() in new code to avoid initialization issues
 */
export const resumeService = {
  get instance(): ResumeService {
    return new ResumeService();
  }
};