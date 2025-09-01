/**
 * My Jobs Error Handling - Comprehensive Error Types and Handlers
 * Extends the existing error system with job-specific error handling
 */

import { AppError, AppValidationError, AppNotFoundError, AppBusinessLogicError, AppExternalServiceError } from './errors';

// ===== MY JOBS SPECIFIC ERROR CODES =====

export const MyJobsErrorCodes = {
  // Job Status Errors
  JOB_ALREADY_ARCHIVED: 'JOB_ALREADY_ARCHIVED',
  JOB_STATUS_TRANSITION_INVALID: 'JOB_STATUS_TRANSITION_INVALID',
  JOB_TEMPLATE_CREATION_FAILED: 'JOB_TEMPLATE_CREATION_FAILED',
  JOB_TEMPLATE_NOT_ACCESSIBLE: 'JOB_TEMPLATE_NOT_ACCESSIBLE',
  
  // Resume Association Errors
  RESUME_ASSOCIATION_FAILED: 'RESUME_ASSOCIATION_FAILED',
  RESUME_ALREADY_ASSOCIATED: 'RESUME_ALREADY_ASSOCIATED',
  RESUME_NOT_ASSOCIATED: 'RESUME_NOT_ASSOCIATED',
  ASSOCIATION_LIMIT_EXCEEDED: 'ASSOCIATION_LIMIT_EXCEEDED',
  
  // Bulk Operation Errors
  BULK_OPERATION_PARTIAL_FAILURE: 'BULK_OPERATION_PARTIAL_FAILURE',
  BULK_OPERATION_LIMIT_EXCEEDED: 'BULK_OPERATION_LIMIT_EXCEEDED',
  BULK_OPERATION_INVALID: 'BULK_OPERATION_INVALID',
  
  // Analytics Errors
  ANALYTICS_UNAVAILABLE: 'ANALYTICS_UNAVAILABLE',
  ANALYTICS_COMPUTATION_FAILED: 'ANALYTICS_COMPUTATION_FAILED',
  INSIGHTS_GENERATION_FAILED: 'INSIGHTS_GENERATION_FAILED',
  
  // Search Errors
  SEARCH_QUERY_INVALID: 'SEARCH_QUERY_INVALID',
  SEARCH_FACET_UNAVAILABLE: 'SEARCH_FACET_UNAVAILABLE',
  SEARCH_TIMEOUT: 'SEARCH_TIMEOUT',
  
  // Performance Errors
  JOB_PROCESSING_OVERLOADED: 'JOB_PROCESSING_OVERLOADED',
  ANALYSIS_QUEUE_FULL: 'ANALYSIS_QUEUE_FULL',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
} as const;

// ===== JOB-SPECIFIC ERROR CLASSES =====

export class JobStatusError extends AppBusinessLogicError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, MyJobsErrorCodes.JOB_STATUS_TRANSITION_INVALID, context);
    this.name = 'JobStatusError';
  }

  static alreadyArchived(jobId: number): JobStatusError {
    return new JobStatusError(
      `Job ${jobId} is archived and cannot be modified`,
      { jobId, currentStatus: 'archived' }
    );
  }

  static invalidTransition(fromStatus: string, toStatus: string, jobId: number): JobStatusError {
    return new JobStatusError(
      `Cannot transition job from ${fromStatus} to ${toStatus}`,
      { jobId, fromStatus, toStatus }
    );
  }
}

export class ResumeAssociationError extends AppBusinessLogicError {
  constructor(message: string, code: string = MyJobsErrorCodes.RESUME_ASSOCIATION_FAILED, context?: Record<string, any>) {
    super(message, code, context);
    this.name = 'ResumeAssociationError';
  }

  static alreadyAssociated(resumeId: number, jobId: number): ResumeAssociationError {
    return new ResumeAssociationError(
      `Resume ${resumeId} is already associated with job ${jobId}`,
      MyJobsErrorCodes.RESUME_ALREADY_ASSOCIATED,
      { resumeId, jobId }
    );
  }

  static notAssociated(resumeId: number, jobId: number): ResumeAssociationError {
    return new ResumeAssociationError(
      `Resume ${resumeId} is not associated with job ${jobId}`,
      MyJobsErrorCodes.RESUME_NOT_ASSOCIATED,
      { resumeId, jobId }
    );
  }

  static limitExceeded(jobId: number, currentCount: number, maxAllowed: number): ResumeAssociationError {
    return new ResumeAssociationError(
      `Job ${jobId} has reached the maximum number of resume associations (${maxAllowed})`,
      MyJobsErrorCodes.ASSOCIATION_LIMIT_EXCEEDED,
      { jobId, currentCount, maxAllowed }
    );
  }

  static associationFailed(resumeIds: number[], jobId: number, reason: string): ResumeAssociationError {
    return new ResumeAssociationError(
      `Failed to associate resumes with job ${jobId}: ${reason}`,
      MyJobsErrorCodes.RESUME_ASSOCIATION_FAILED,
      { resumeIds, jobId, reason }
    );
  }
}

export class BulkOperationError extends AppBusinessLogicError {
  constructor(message: string, code: string = MyJobsErrorCodes.BULK_OPERATION_PARTIAL_FAILURE, context?: Record<string, any>) {
    super(message, code, context);
    this.name = 'BulkOperationError';
  }

  static partialFailure(operation: string, totalCount: number, failedCount: number, errors: Array<{ id: number; error: string }>): BulkOperationError {
    return new BulkOperationError(
      `Bulk ${operation} completed with ${failedCount}/${totalCount} failures`,
      MyJobsErrorCodes.BULK_OPERATION_PARTIAL_FAILURE,
      { operation, totalCount, failedCount, errors }
    );
  }

  static limitExceeded(operation: string, requestedCount: number, maxAllowed: number): BulkOperationError {
    return new BulkOperationError(
      `Bulk ${operation} requested ${requestedCount} items, maximum allowed is ${maxAllowed}`,
      MyJobsErrorCodes.BULK_OPERATION_LIMIT_EXCEEDED,
      { operation, requestedCount, maxAllowed }
    );
  }

  static invalidOperation(operation: string, reason: string): BulkOperationError {
    return new BulkOperationError(
      `Invalid bulk operation '${operation}': ${reason}`,
      MyJobsErrorCodes.BULK_OPERATION_INVALID,
      { operation, reason }
    );
  }
}

export class JobAnalyticsError extends AppExternalServiceError {
  constructor(message: string, code: string = MyJobsErrorCodes.ANALYTICS_UNAVAILABLE, context?: Record<string, any>) {
    super(message, 'Analytics', 'computation', context);
    this.code = code;
    this.name = 'JobAnalyticsError';
  }

  static unavailable(jobId: number, reason: string): JobAnalyticsError {
    return new JobAnalyticsError(
      `Analytics unavailable for job ${jobId}: ${reason}`,
      MyJobsErrorCodes.ANALYTICS_UNAVAILABLE,
      { jobId, reason }
    );
  }

  static computationFailed(jobId: number, error: string): JobAnalyticsError {
    return new JobAnalyticsError(
      `Analytics computation failed for job ${jobId}: ${error}`,
      MyJobsErrorCodes.ANALYTICS_COMPUTATION_FAILED,
      { jobId, error }
    );
  }

  static insightsGenerationFailed(jobId: number, error: string): JobAnalyticsError {
    return new JobAnalyticsError(
      `Insights generation failed for job ${jobId}: ${error}`,
      MyJobsErrorCodes.INSIGHTS_GENERATION_FAILED,
      { jobId, error }
    );
  }
}

export class JobSearchError extends AppExternalServiceError {
  constructor(message: string, code: string = MyJobsErrorCodes.SEARCH_QUERY_INVALID, context?: Record<string, any>) {
    super(message, 'Search', 'query', context);
    this.code = code;
    this.name = 'JobSearchError';
  }

  static invalidQuery(query: string, reason: string): JobSearchError {
    return new JobSearchError(
      `Invalid search query '${query}': ${reason}`,
      MyJobsErrorCodes.SEARCH_QUERY_INVALID,
      { query, reason }
    );
  }

  static facetUnavailable(facet: string): JobSearchError {
    return new JobSearchError(
      `Search facet '${facet}' is not available`,
      MyJobsErrorCodes.SEARCH_FACET_UNAVAILABLE,
      { facet }
    );
  }

  static timeout(query: string, timeoutMs: number): JobSearchError {
    return new JobSearchError(
      `Search query '${query}' timed out after ${timeoutMs}ms`,
      MyJobsErrorCodes.SEARCH_TIMEOUT,
      { query, timeoutMs }
    );
  }
}

export class JobTemplateError extends AppBusinessLogicError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, MyJobsErrorCodes.JOB_TEMPLATE_CREATION_FAILED, context);
    this.name = 'JobTemplateError';
  }

  static creationFailed(reason: string, sourceJobId?: number): JobTemplateError {
    return new JobTemplateError(
      `Template creation failed: ${reason}`,
      { reason, sourceJobId }
    );
  }

  static notAccessible(templateId: number, userId: string): JobTemplateError {
    return new JobTemplateError(
      `Template ${templateId} is not accessible to user ${userId}`,
      { templateId, userId }
    );
  }
}

export class JobPerformanceError extends AppExternalServiceError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'Performance', 'overload', context);
    this.code = MyJobsErrorCodes.JOB_PROCESSING_OVERLOADED;
    this.name = 'JobPerformanceError';
  }

  static processingOverloaded(operation: string, currentLoad: number, maxLoad: number): JobPerformanceError {
    return new JobPerformanceError(
      `Job processing overloaded for operation '${operation}': ${currentLoad}/${maxLoad}`,
      { operation, currentLoad, maxLoad }
    );
  }

  static analysisQueueFull(queueSize: number, maxSize: number): JobPerformanceError {
    const error = new JobPerformanceError(
      `Analysis queue is full: ${queueSize}/${maxSize}`,
      { queueSize, maxSize }
    );
    error.code = MyJobsErrorCodes.ANALYSIS_QUEUE_FULL;
    return error;
  }

  static concurrentModification(resourceId: number, resourceType: string): JobPerformanceError {
    const error = new JobPerformanceError(
      `Concurrent modification detected for ${resourceType} ${resourceId}`,
      { resourceId, resourceType }
    );
    error.code = MyJobsErrorCodes.CONCURRENT_MODIFICATION;
    return error;
  }
}

// ===== ERROR HANDLER UTILITIES =====

/**
 * Determine appropriate HTTP status code for My Jobs errors
 */
export function getMyJobsErrorStatusCode(error: AppError): number {
  if (error instanceof JobStatusError) {
    return 400; // Bad Request - invalid state transition
  }
  
  if (error instanceof ResumeAssociationError) {
    switch (error.code) {
      case MyJobsErrorCodes.RESUME_ALREADY_ASSOCIATED:
        return 409; // Conflict
      case MyJobsErrorCodes.RESUME_NOT_ASSOCIATED:
        return 404; // Not Found
      case MyJobsErrorCodes.ASSOCIATION_LIMIT_EXCEEDED:
        return 429; // Too Many Requests
      default:
        return 400; // Bad Request
    }
  }
  
  if (error instanceof BulkOperationError) {
    switch (error.code) {
      case MyJobsErrorCodes.BULK_OPERATION_LIMIT_EXCEEDED:
        return 429; // Too Many Requests
      case MyJobsErrorCodes.BULK_OPERATION_PARTIAL_FAILURE:
        return 207; // Multi-Status
      default:
        return 400; // Bad Request
    }
  }
  
  if (error instanceof JobAnalyticsError) {
    switch (error.code) {
      case MyJobsErrorCodes.ANALYTICS_UNAVAILABLE:
        return 503; // Service Unavailable
      case MyJobsErrorCodes.ANALYTICS_COMPUTATION_FAILED:
      case MyJobsErrorCodes.INSIGHTS_GENERATION_FAILED:
        return 500; // Internal Server Error
      default:
        return 400; // Bad Request
    }
  }
  
  if (error instanceof JobSearchError) {
    switch (error.code) {
      case MyJobsErrorCodes.SEARCH_TIMEOUT:
        return 504; // Gateway Timeout
      case MyJobsErrorCodes.SEARCH_FACET_UNAVAILABLE:
        return 404; // Not Found
      default:
        return 400; // Bad Request
    }
  }
  
  if (error instanceof JobTemplateError) {
    return error.code === MyJobsErrorCodes.JOB_TEMPLATE_NOT_ACCESSIBLE ? 403 : 400;
  }
  
  if (error instanceof JobPerformanceError) {
    switch (error.code) {
      case MyJobsErrorCodes.JOB_PROCESSING_OVERLOADED:
      case MyJobsErrorCodes.ANALYSIS_QUEUE_FULL:
        return 503; // Service Unavailable
      case MyJobsErrorCodes.CONCURRENT_MODIFICATION:
        return 409; // Conflict
      default:
        return 500; // Internal Server Error
    }
  }
  
  // Fallback to generic error status code determination
  if (error instanceof AppNotFoundError) return 404;
  if (error instanceof AppValidationError) return 400;
  if (error instanceof AppBusinessLogicError) return 400;
  if (error instanceof AppExternalServiceError) return 503;
  
  return 500; // Internal Server Error
}

/**
 * Convert My Jobs errors to user-friendly messages
 */
export function getMyJobsUserFriendlyMessage(error: AppError): string {
  if (error instanceof JobStatusError) {
    if (error.code === MyJobsErrorCodes.JOB_ALREADY_ARCHIVED) {
      return 'This job has been archived and cannot be modified. Please create a new job or restore it from archives.';
    }
    return 'The job status cannot be changed at this time. Please check the current status and try again.';
  }
  
  if (error instanceof ResumeAssociationError) {
    switch (error.code) {
      case MyJobsErrorCodes.RESUME_ALREADY_ASSOCIATED:
        return 'This resume is already associated with the job. No action needed.';
      case MyJobsErrorCodes.RESUME_NOT_ASSOCIATED:
        return 'This resume is not associated with the job. Please add it first.';
      case MyJobsErrorCodes.ASSOCIATION_LIMIT_EXCEEDED:
        return 'You have reached the maximum number of resumes for this job. Consider upgrading your plan for higher limits.';
      default:
        return 'Unable to associate resume with job. Please try again or contact support.';
    }
  }
  
  if (error instanceof BulkOperationError) {
    if (error.code === MyJobsErrorCodes.BULK_OPERATION_PARTIAL_FAILURE) {
      return 'Some operations completed successfully, but others failed. Check the details below.';
    }
    if (error.code === MyJobsErrorCodes.BULK_OPERATION_LIMIT_EXCEEDED) {
      return 'Too many items selected for bulk operation. Please select fewer items and try again.';
    }
    return 'The bulk operation could not be completed. Please try again or contact support.';
  }
  
  if (error instanceof JobAnalyticsError) {
    switch (error.code) {
      case MyJobsErrorCodes.ANALYTICS_UNAVAILABLE:
        return 'Analytics are not available for this job yet. Please try again after running some analyses.';
      case MyJobsErrorCodes.ANALYTICS_COMPUTATION_FAILED:
        return 'Unable to compute analytics at this time. Please try again later.';
      case MyJobsErrorCodes.INSIGHTS_GENERATION_FAILED:
        return 'AI insights are temporarily unavailable. Basic analytics are still available.';
      default:
        return 'Analytics are temporarily unavailable. Please try again later.';
    }
  }
  
  if (error instanceof JobSearchError) {
    if (error.code === MyJobsErrorCodes.SEARCH_TIMEOUT) {
      return 'Search took too long to complete. Please try a simpler search query.';
    }
    return 'Unable to complete search. Please check your search terms and try again.';
  }
  
  if (error instanceof JobTemplateError) {
    if (error.code === MyJobsErrorCodes.JOB_TEMPLATE_NOT_ACCESSIBLE) {
      return 'This template is not available to your account. Please choose a different template.';
    }
    return 'Unable to create job template. Please check your input and try again.';
  }
  
  if (error instanceof JobPerformanceError) {
    switch (error.code) {
      case MyJobsErrorCodes.JOB_PROCESSING_OVERLOADED:
        return 'Our servers are currently busy. Please try again in a few minutes.';
      case MyJobsErrorCodes.ANALYSIS_QUEUE_FULL:
        return 'Analysis queue is full. Your request will be processed shortly.';
      case MyJobsErrorCodes.CONCURRENT_MODIFICATION:
        return 'This job was modified by another user. Please refresh and try again.';
      default:
        return 'Service is temporarily unavailable. Please try again later.';
    }
  }
  
  // Fallback to original error message
  return error.message || 'An unexpected error occurred. Please try again or contact support.';
}

/**
 * Generate recovery suggestions for My Jobs errors
 */
export function getMyJobsRecoveryActions(error: AppError): string[] {
  const actions: string[] = [];
  
  if (error instanceof JobStatusError) {
    actions.push('Check the current job status');
    actions.push('Verify you have permission to modify this job');
    if (error.code === MyJobsErrorCodes.JOB_ALREADY_ARCHIVED) {
      actions.push('Create a duplicate of this job to continue working');
      actions.push('Contact an administrator to restore from archives');
    }
  }
  
  if (error instanceof ResumeAssociationError) {
    if (error.code === MyJobsErrorCodes.ASSOCIATION_LIMIT_EXCEEDED) {
      actions.push('Remove some existing resume associations');
      actions.push('Upgrade your plan for higher limits at dashboard.evalmatch.com/billing');
    } else {
      actions.push('Verify the resume exists and is accessible');
      actions.push('Try associating resumes one at a time');
    }
  }
  
  if (error instanceof BulkOperationError) {
    actions.push('Try processing fewer items at once');
    actions.push('Check individual item permissions');
    actions.push('Retry failed operations individually');
  }
  
  if (error instanceof JobAnalyticsError) {
    actions.push('Ensure the job has associated resume analyses');
    actions.push('Try refreshing the page and accessing analytics again');
    actions.push('Contact support if analytics remain unavailable');
  }
  
  if (error instanceof JobSearchError) {
    actions.push('Simplify your search query');
    actions.push('Remove advanced filters and try again');
    actions.push('Check your internet connection');
  }
  
  if (error instanceof JobTemplateError) {
    actions.push('Verify template permissions');
    actions.push('Try creating a template from a different source job');
    actions.push('Contact support for template access issues');
  }
  
  if (error instanceof JobPerformanceError) {
    actions.push('Wait a few minutes and try again');
    actions.push('Try during off-peak hours');
    actions.push('Contact support if issues persist');
  }
  
  // Common fallback actions
  if (actions.length === 0) {
    actions.push('Refresh the page and try again');
    actions.push('Check your internet connection');
    actions.push('Contact support if the problem persists');
  }
  
  return actions;
}

/**
 * Create standardized error response for My Jobs APIs
 */
export function createMyJobsErrorResponse(error: AppError) {
  return {
    success: false,
    error: error.code,
    message: getMyJobsUserFriendlyMessage(error),
    details: {
      originalError: error.message,
      context: error.context || {},
      recoveryActions: getMyJobsRecoveryActions(error),
      supportId: `mj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Wrap async operations with My Jobs error handling
 */
export async function withMyJobsErrorHandling<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // If it's already a My Jobs error, re-throw as-is
    if (error instanceof JobStatusError || 
        error instanceof ResumeAssociationError ||
        error instanceof BulkOperationError ||
        error instanceof JobAnalyticsError ||
        error instanceof JobSearchError ||
        error instanceof JobTemplateError ||
        error instanceof JobPerformanceError) {
      throw error;
    }
    
    // Convert other errors to appropriate My Jobs errors
    if (error instanceof AppError) {
      throw error;
    }
    
    // Convert unknown errors to generic App errors with context
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new AppExternalServiceError(
      `${operationName} failed: ${errorMessage}`,
      'MyJobs',
      operationName,
      { ...context, originalError: errorMessage }
    );
  }
}

// ===== ERROR MONITORING INTEGRATION =====

/**
 * Log My Jobs errors with structured data for monitoring
 */
export function logMyJobsError(error: AppError, request?: any, userId?: string) {
  const errorData = {
    errorType: error.constructor.name,
    errorCode: error.code,
    message: error.message,
    context: error.context,
    userId,
    endpoint: request?.url,
    method: request?.method,
    userAgent: request?.get?.('User-Agent'),
    timestamp: new Date().toISOString(),
  };
  
  // Log to monitoring service (integrate with your monitoring solution)
  console.error('[MyJobs Error]', errorData);
  
  // Send to error tracking service if available
  if (typeof process !== 'undefined' && process.env.ERROR_TRACKING_ENABLED === 'true') {
    // Integration with error tracking service (Sentry, Bugsnag, etc.)
    // errorTrackingService.captureException(error, errorData);
  }
}

/**
 * Middleware factory for My Jobs error handling
 */
export function createMyJobsErrorMiddleware() {
  return (error: any, req: any, res: any, next: any) => {
    // Log the error
    logMyJobsError(error, req, req.user?.uid);
    
    // Determine status code
    const statusCode = getMyJobsErrorStatusCode(error);
    
    // Create error response
    const errorResponse = createMyJobsErrorResponse(error);
    
    // Send response
    res.status(statusCode).json(errorResponse);
  };
}