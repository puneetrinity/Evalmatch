/**
 * BUSINESS LOGIC: Job Service Layer
 * Handles all job description-related operations with Result pattern integration
 * 
 * @fileoverview This service encapsulates all business logic related to job
 * description management, analysis, and processing. It provides a clean interface
 * between route handlers and data operations.
 * 
 * @example
 * ```typescript
 * const jobService = new JobService(storage);
 * 
 * // Create and analyze job description
 * const result = await jobService.createJobDescription({
 *   userId: 'user123',
 *   title: 'Senior Developer',
 *   description: 'Looking for experienced...',
 *   requirements: ['React', 'TypeScript']
 * });
 * 
 * // Get user's job descriptions
 * const jobs = await jobService.getUserJobDescriptions({
 *   userId: 'user123',
 *   page: 1,
 *   limit: 20
 * });
 * ```
 */

import { logger } from '../lib/logger';
import { getStorage, IStorage } from '../storage';
import { QueryBuilder } from '../lib/query-builder';
import { analyzeJobDescriptionWithCache } from '../lib/cached-ai-operations';
import { getUserTierInfo } from '../lib/user-tiers';
// import { detectJobBias } from '../lib/bias-detection'; // Function not implemented yet
import {
  Result,
  success,
  failure,
  isSuccess,
  isFailure,
  DatabaseResult,
  JobAnalysisResult
} from '@shared/result-types';
import {
  AppNotFoundError,
  AppValidationError,
  AppBusinessLogicError,
  AppExternalServiceError,
  toAppError
} from '@shared/errors';
import {
  AnalyzeJobDescriptionResponse,
  AnalyzedJobData,
  JobDescription,
  jobDescriptions
} from '@shared/schema';

// ===== SERVICE INTERFACES =====

/**
 * Options for creating a new job description
 */
export interface CreateJobOptions {
  userId: string;
  title: string;
  description: string;
  requirements?: string[];
  analyzeImmediately?: boolean;
  includeBiasAnalysis?: boolean;
}

/**
 * Options for retrieving job descriptions
 */
export interface GetJobsOptions {
  userId: string;
  page?: number;
  limit?: number;
  searchQuery?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Options for updating a job description
 */
export interface UpdateJobOptions {
  userId: string;
  jobId: number;
  title?: string;
  description?: string;
  requirements?: string[];
  reanalyze?: boolean;
}

/**
 * Job description creation result
 */
export interface JobCreationResult {
  job: JobDescription;
  analysis?: AnalyzeJobDescriptionResponse;
  biasAnalysis?: any;
  processingTime: number;
}

/**
 * Paginated job descriptions result
 */
export interface PaginatedJobsResult {
  jobs: JobDescription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ===== JOB SERVICE IMPLEMENTATION =====

/**
 * Job Service - Handles all job description-related business logic
 */
export class JobService {
  constructor(private storageProvider?: IStorage) {
    logger.info('JobService initialized');
  }

  private getStorageProvider(): IStorage {
    return this.storageProvider || getStorage();
  }

  /**
   * Create a new job description with optional immediate analysis
   */
  async createJobDescription(options: CreateJobOptions): Promise<JobAnalysisResult<JobCreationResult>> {
    const startTime = Date.now();
    
    try {
      logger.info('Creating job description', {
        userId: options.userId,
        title: options.title,
        hasDescription: !!options.description,
        descriptionLength: options.description?.length || 0,
        hasRequirements: !!(options.requirements?.length),
        analyzeImmediately: options.analyzeImmediately
      });

      // Validate inputs
      const validationResult = this.validateJobInput(options);
      if (isFailure(validationResult)) {
        return validationResult;
      }

      // Get user tier for analysis capabilities
      const userTier = await getUserTierInfo(options.userId);

      // Create job description record
      let jobDescription;
      try {
        jobDescription = await this.getStorageProvider().createJobDescription({
          userId: options.userId,
          title: options.title,
          description: options.description,
          requirements: options.requirements || []
        });
      } catch (error) {
        const appError = toAppError(error, 'job_creation');
        if (appError.code === 'VALIDATION_ERROR') {
          return failure(AppValidationError.requiredField('jobDescription'));
        } else {
          return failure(AppExternalServiceError.databaseFailure('job_creation', appError.message));
        }
      }

      const result: JobCreationResult = {
        job: jobDescription,
        processingTime: Date.now() - startTime
      };

      // Perform analysis if requested
      if (options.analyzeImmediately) {
        logger.info('Analyzing job description immediately', {
          jobId: jobDescription.id,
          userId: options.userId
        });

        const analysisResult = await analyzeJobDescriptionWithCache(
          options.title,
          options.description,
          userTier
        );

        if (isSuccess(analysisResult)) {
          result.analysis = analysisResult.data;
          
          // Update job with analysis results
          // Convert AnalyzeJobDescriptionResponse to AnalyzedJobData
          const analyzedData: AnalyzedJobData = analysisResult.data.analyzedData || {
            requiredSkills: analysisResult.data.requiredSkills || [],
            preferredSkills: analysisResult.data.preferredSkills || [],
            experienceLevel: analysisResult.data.experienceLevel || '',
            responsibilities: analysisResult.data.responsibilities || [],
            summary: analysisResult.data.summary || ''
          };
          
          await this.getStorageProvider().updateJobDescription(jobDescription.id, {
            analyzedData
          });
        } else {
          logger.warn('Job analysis failed but job was created', {
            jobId: jobDescription.id,
            analysisError: analysisResult.error.message
          });
        }

        // Bias analysis if requested
        if (options.includeBiasAnalysis) {
          try {
            // TODO: Implement bias detection functionality
            // const biasAnalysis = await detectJobBias(options.description);
            const biasAnalysis = null; // Placeholder until implementation
            result.biasAnalysis = biasAnalysis;
          } catch (error) {
            logger.warn('Bias analysis failed', {
              jobId: jobDescription.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      result.processingTime = Date.now() - startTime;
      
      logger.info('Job description created successfully', {
        jobId: jobDescription.id,
        userId: options.userId,
        hasAnalysis: !!result.analysis,
        hasBiasAnalysis: !!result.biasAnalysis,
        processingTime: result.processingTime
      });

      return success(result);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Job creation failed', {
        userId: options.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      });

      const appError = toAppError(error, 'job_creation');
      if (appError.code === 'VALIDATION_ERROR') {
        return failure(new AppValidationError(appError.message));
      } else {
        return failure(AppExternalServiceError.databaseFailure('job_creation', appError.message));
      }
    }
  }

  /**
   * Get paginated job descriptions for a user
   */
  async getUserJobDescriptions(options: GetJobsOptions): Promise<JobAnalysisResult<PaginatedJobsResult>> {
    try {
      logger.info('Retrieving user job descriptions', {
        userId: options.userId,
        page: options.page || 1,
        limit: options.limit || 20,
        hasSearchQuery: !!options.searchQuery,
        hasDateRange: !!options.dateRange
      });

      // Build query with filters
      const queryBuilder = QueryBuilder.forUser(options.userId);

      if (options.searchQuery) {
        // Use generic where method with LIKE operator for title search
        // TODO: Implement proper LIKE search in QueryBuilder
        // For now, we'll use exact match
        queryBuilder.where('title', options.searchQuery);
      }

      if (options.dateRange) {
        queryBuilder.dateRange('createdAt', options.dateRange.start, options.dateRange.end);
      }

      const page = options.page || 1;
      const limit = Math.min(options.limit || 20, 100); // Max 100 per page

      queryBuilder.paginate(page, limit);

      // Execute query
      let jobs, total;
      try {
        jobs = await queryBuilder.execute(jobDescriptions);
        // For now, we'll use the returned data length as total
        // TODO: Implement proper count functionality in QueryBuilder
        total = jobs.data.length;
      } catch (error) {
        const appError = toAppError(error, 'job_retrieval');
        if (appError.code === 'NOT_FOUND') {
          return failure(AppNotFoundError.resourceNotFound('jobs'));
        } else {
          return failure(AppExternalServiceError.databaseFailure('job_retrieval', appError.message));
        }
      }
      
      const result = {
        jobs: jobs.data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };

      logger.info('Job descriptions retrieved successfully', {
        userId: options.userId,
        count: result.jobs.length,
        total: result.total,
        page: result.page
      });

      return success(result);

    } catch (error) {
      logger.error('Job retrieval failed', {
        userId: options.userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const appError = toAppError(error, 'job_retrieval');
      if (appError.code === 'NOT_FOUND') {
        return failure(AppNotFoundError.resourceNotFound('jobs'));
      } else {
        return failure(AppExternalServiceError.databaseFailure('job_retrieval', appError.message));
      }
    }
  }

  /**
   * Get a specific job description by ID
   */
  async getJobDescriptionById(
    userId: string, 
    jobId: number
  ): Promise<JobAnalysisResult<JobDescription>> {
    try {
      logger.info('Retrieving job description by ID', {
        userId,
        jobId
      });

      let job;
      try {
        job = await this.getStorageProvider().getJobDescriptionById(jobId, userId);
        if (!job) {
          return failure(AppNotFoundError.jobDescription(jobId));
        }
      } catch (error) {
        const appError = toAppError(error, 'job_retrieval');
        if (appError.code === 'NOT_FOUND') {
          return failure(AppNotFoundError.jobDescription(jobId));
        } else {
          return failure(AppExternalServiceError.databaseFailure('job_retrieval', appError.message));
        }
      }

      logger.info('Job description retrieved successfully', {
        userId,
        jobId,
        title: job.title
      });

      return success(job);

    } catch (error) {
      logger.error('Job retrieval by ID failed', {
        userId,
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const appError = toAppError(error, 'job_retrieval');
      if (appError.code === 'NOT_FOUND') {
        return failure(AppNotFoundError.jobDescription(jobId));
      } else {
        return failure(AppExternalServiceError.databaseFailure('job_retrieval', appError.message));
      }
    }
  }

  /**
   * Update a job description
   */
  async updateJobDescription(options: UpdateJobOptions): Promise<JobAnalysisResult<JobDescription>> {
    try {
      logger.info('Updating job description', {
        userId: options.userId,
        jobId: options.jobId,
        hasTitle: !!options.title,
        hasDescription: !!options.description,
        hasRequirements: !!(options.requirements?.length),
        reanalyze: options.reanalyze
      });

      // Get existing job to verify ownership
      const existingJobResult = await this.getJobDescriptionById(options.userId, options.jobId);
      if (isFailure(existingJobResult)) {
        return existingJobResult;
      }

      // Prepare update data
      const updateData: Partial<JobDescription> = {};
      if (options.title) updateData.title = options.title;
      if (options.description) updateData.description = options.description;
      if (options.requirements) updateData.requirements = options.requirements;

      // Update job description
      let updatedJob;
      try {
        updatedJob = await this.getStorageProvider().updateJobDescription(
          options.jobId, 
          updateData
        );
        
        if (!updatedJob) {
          return failure(AppNotFoundError.jobDescription(options.jobId));
        }
      } catch (error) {
        const appError = toAppError(error, 'job_update');
        if (appError.code === 'VALIDATION_ERROR') {
          return failure(new AppValidationError(appError.message));
        } else {
          return failure(AppExternalServiceError.databaseFailure('job_update', appError.message));
        }
      }

      // Re-analyze if requested
      if (options.reanalyze && options.description) {
        logger.info('Re-analyzing updated job description', {
          jobId: options.jobId,
          userId: options.userId
        });

        const userTier = await getUserTierInfo(options.userId);
        const analysisResult = await analyzeJobDescriptionWithCache(
          updatedJob.title,
          options.description,
          userTier
        );

        if (isSuccess(analysisResult)) {
          // Convert AnalyzeJobDescriptionResponse to AnalyzedJobData
          const analyzedData: AnalyzedJobData = analysisResult.data.analyzedData || {
            requiredSkills: analysisResult.data.requiredSkills || [],
            preferredSkills: analysisResult.data.preferredSkills || [],
            experienceLevel: analysisResult.data.experienceLevel || '',
            responsibilities: analysisResult.data.responsibilities || [],
            summary: analysisResult.data.summary || ''
          };
          
          await this.getStorageProvider().updateJobDescription(options.jobId, {
            analyzedData
          });
        }
      }

      logger.info('Job description updated successfully', {
        userId: options.userId,
        jobId: options.jobId,
        reanalyzed: options.reanalyze
      });

      return success(updatedJob);

    } catch (error) {
      logger.error('Job update failed', {
        userId: options.userId,
        jobId: options.jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const appError = toAppError(error, 'job_update');
      if (appError.code === 'VALIDATION_ERROR') {
        return failure(new AppValidationError(appError.message));
      } else {
        return failure(AppExternalServiceError.databaseFailure('job_update', appError.message));
      }
    }
  }

  /**
   * Delete a job description
   */
  async deleteJobDescription(
    userId: string, 
    jobId: number
  ): Promise<JobAnalysisResult<boolean>> {
    try {
      logger.info('Deleting job description', {
        userId,
        jobId
      });

      // Verify ownership before deletion
      const existingJobResult = await this.getJobDescriptionById(userId, jobId);
      if (isFailure(existingJobResult)) {
        return failure(existingJobResult.error);
      }

      // Delete job description
      try {
        await this.getStorageProvider().deleteJobDescription(jobId);
        // The storage layer doesn't return a boolean for confirmation
        // If no error is thrown, deletion was successful
      } catch (error) {
        const appError = toAppError(error, 'job_deletion');
        if (appError.code === 'NOT_FOUND') {
          return failure(AppNotFoundError.jobDescription(jobId));
        } else {
          return failure(AppExternalServiceError.databaseFailure('job_deletion', appError.message));
        }
      }

      logger.info('Job description deleted successfully', {
        userId,
        jobId
      });

      return success(true);

    } catch (error) {
      logger.error('Job deletion failed', {
        userId,
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const appError = toAppError(error, 'job_deletion');
      if (appError.code === 'NOT_FOUND') {
        return failure(AppNotFoundError.jobDescription(jobId));
      } else {
        return failure(AppExternalServiceError.databaseFailure('job_deletion', appError.message));
      }
    }
  }

  /**
   * Analyze job description for bias and requirements
   */
  async analyzeJobDescription(
    userId: string,
    jobId: number
  ): Promise<JobAnalysisResult<AnalyzeJobDescriptionResponse>> {
    try {
      logger.info('Analyzing job description', {
        userId,
        jobId
      });

      // Get job description
      const jobResult = await this.getJobDescriptionById(userId, jobId);
      if (isFailure(jobResult)) {
        return failure(jobResult.error);
      }

      const job = jobResult.data;
      const userTier = await getUserTierInfo(userId);

      // Perform analysis
      const analysisResult = await analyzeJobDescriptionWithCache(
        job.title,
        job.description,
        userTier
      );

      if (isFailure(analysisResult)) {
        logger.error('Job description analysis failed', {
          userId,
          jobId,
          error: analysisResult.error.message
        });
        return analysisResult;
      }

      // Update job with analysis results
      // Convert AnalyzeJobDescriptionResponse to AnalyzedJobData
      const analyzedData: AnalyzedJobData = analysisResult.data.analyzedData || {
        requiredSkills: analysisResult.data.requiredSkills || [],
        preferredSkills: analysisResult.data.preferredSkills || [],
        experienceLevel: analysisResult.data.experienceLevel || '',
        responsibilities: analysisResult.data.responsibilities || [],
        summary: analysisResult.data.summary || ''
      };
      
      await this.getStorageProvider().updateJobDescription(jobId, {
        analyzedData
      });

      logger.info('Job description analyzed successfully', {
        userId,
        jobId,
        skillsFound: analysisResult.data.skills?.length || 0
      });

      return success(analysisResult.data);

    } catch (error) {
      logger.error('Job analysis failed', {
        userId,
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      const appError = toAppError(error, 'job_analysis');
      if (appError.code === 'VALIDATION_ERROR') {
        return failure(new AppValidationError(appError.message));
      } else {
        return failure(AppExternalServiceError.aiProviderFailure('JobAnalysis', 'analysis', appError.message));
      }
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Validate job input parameters
   */
  private validateJobInput(options: CreateJobOptions): JobAnalysisResult<boolean> {
    if (!options.userId?.trim()) {
      return failure(AppValidationError.requiredField('userId'));
    }

    if (!options.title?.trim()) {
      return failure(AppValidationError.requiredField('title'));
    }

    if (!options.description?.trim()) {
      return failure(AppValidationError.requiredField('description'));
    }

    if (options.title.length > 200) {
      return failure(new AppValidationError('Job title too long (max 200 characters)', 'title'));
    }

    if (options.description.length > 10000) {
      return failure(new AppValidationError('Job description too long (max 10,000 characters)', 'description'));
    }

    if (options.requirements && options.requirements.length > 50) {
      return failure(new AppValidationError('Too many requirements (max 50)', 'requirements'));
    }

    return success(true);
  }
}

// ===== SINGLETON EXPORT =====

/**
 * Singleton JobService instance
 */
export const jobService = new JobService();

/**
 * Convenience functions for common operations
 */
export async function createJobWithAnalysis(
  userId: string,
  title: string,
  description: string,
  requirements?: string[]
): Promise<JobAnalysisResult<JobCreationResult>> {
  return await jobService.createJobDescription({
    userId,
    title,
    description,
    requirements,
    analyzeImmediately: true,
    includeBiasAnalysis: true
  });
}

export async function getUserJobs(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<JobAnalysisResult<PaginatedJobsResult>> {
  return await jobService.getUserJobDescriptions({
    userId,
    page,
    limit
  });
}