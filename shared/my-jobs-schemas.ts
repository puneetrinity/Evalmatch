/**
 * My Jobs Feature - Enhanced Schema Definitions
 * Extends existing schema with new types for advanced job management
 */

import { z } from "zod";
import { JobDescription, AnalysisResult, Resume } from './schema';

// ===== JOB STATUS MANAGEMENT =====

export const jobStatusSchema = z.enum(['active', 'draft', 'archived', 'template']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const statusChangeRequestSchema = z.object({
  status: jobStatusSchema,
  reason: z.string().optional(),
  notifyAssociatedUsers: z.boolean().default(false),
});

export const statusHistorySchema = z.object({
  id: z.number(),
  jobId: z.number(),
  previousStatus: jobStatusSchema,
  newStatus: jobStatusSchema,
  changedAt: z.string().datetime(),
  reason: z.string().optional(),
  changedBy: z.string(),
});

export type StatusChangeRequest = z.infer<typeof statusChangeRequestSchema>;
export type StatusHistory = z.infer<typeof statusHistorySchema>;

// ===== ENHANCED JOB TYPES =====

export const jobMetricsSchema = z.object({
  totalAnalyses: z.number().default(0),
  highMatchCount: z.number().default(0),   // >= 80% match
  mediumMatchCount: z.number().default(0), // 60-79% match
  lowMatchCount: z.number().default(0),    // < 60% match
  avgProcessingTime: z.number().optional(),
  lastProcessingDate: z.string().datetime().optional(),
});

export const jobPerformanceSchema = z.object({
  trend: z.enum(['improving', 'declining', 'stable']),
  weekOverWeekChange: z.number(), // percentage change
  monthOverMonthChange: z.number().optional(),
});

export const jobWithMetricsSchema = z.object({
  // Base job fields (from existing JobDescription)
  id: z.number(),
  userId: z.string(),
  title: z.string(),
  description: z.string(),
  requirements: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  experience: z.string().optional(),
  analyzedData: z.any().optional(), // AnalyzedJobData from existing schema
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  
  // Enhanced fields
  status: jobStatusSchema.default('active'),
  resumeCount: z.number().default(0),
  avgMatchScore: z.number().min(0).max(100).optional(),
  lastAnalysisDate: z.string().datetime().optional(),
  metrics: jobMetricsSchema,
  tags: z.array(z.string()).default([]),
  performance: jobPerformanceSchema.optional(),
});

export type JobMetrics = z.infer<typeof jobMetricsSchema>;
export type JobPerformance = z.infer<typeof jobPerformanceSchema>;
export type JobWithMetrics = z.infer<typeof jobWithMetricsSchema>;

// ===== JOB TEMPLATES =====

export const templateMetadataSchema = z.object({
  category: z.string(),
  industry: z.string().optional(),
  experienceLevel: z.enum(['entry', 'mid', 'senior', 'lead']),
  tags: z.array(z.string()),
  isPublic: z.boolean().default(false),
  usageCount: z.number().default(0),
  lastUsed: z.string().datetime().optional(),
});

export const jobTemplateSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  requirements: z.array(z.string()).default([]),
  templateMetadata: templateMetadataSchema,
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTemplateRequestSchema = z.object({
  sourceJobId: z.number().optional(),
  title: z.string().min(1).max(200),
  description: z.string().min(10).max(10000),
  requirements: z.array(z.string()).default([]),
  templateMetadata: templateMetadataSchema,
});

export type TemplateMetadata = z.infer<typeof templateMetadataSchema>;
export type JobTemplate = z.infer<typeof jobTemplateSchema>;
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

// ===== RESUME-JOB ASSOCIATIONS =====

export const resumeAssociationStatusSchema = z.enum(['analyzed', 'pending', 'failed']);

export const resumeJobAssociationSchema = z.object({
  id: z.number(),
  resumeId: z.number(),
  jobId: z.number(),
  status: resumeAssociationStatusSchema,
  matchScore: z.number().min(0).max(100).optional(),
  analysisDate: z.string().datetime().optional(),
  lastAnalysisId: z.number().optional(),
  tags: z.array(z.string()).default([]),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const associateResumesRequestSchema = z.object({
  resumeIds: z.array(z.number()).min(1),
  analyzeImmediately: z.boolean().default(true),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  tags: z.array(z.string()).default([]),
});

export const resumeWithAssociationSchema = z.object({
  id: z.number(),
  filename: z.string(),
  candidateName: z.string().optional(),
  analysisStatus: resumeAssociationStatusSchema,
  matchScore: z.number().min(0).max(100).optional(),
  analysisDate: z.string().datetime().optional(),
  lastAnalysisId: z.number().optional(),
  tags: z.array(z.string()).default([]),
  fileSize: z.number().optional(),
  uploadDate: z.string().datetime(),
});

export type ResumeAssociationStatus = z.infer<typeof resumeAssociationStatusSchema>;
export type ResumeJobAssociation = z.infer<typeof resumeJobAssociationSchema>;
export type AssociateResumesRequest = z.infer<typeof associateResumesRequestSchema>;
export type ResumeWithAssociation = z.infer<typeof resumeWithAssociationSchema>;

// ===== PAGINATION & FILTERING =====

export const paginationInfoSchema = z.object({
  page: z.number().min(1),
  limit: z.number().min(1).max(100),
  total: z.number().min(0),
  totalPages: z.number().min(0),
  hasMore: z.boolean(),
  hasPrevious: z.boolean(),
});

export const sortOptionsSchema = z.object({
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'resumeCount', 'avgMatchScore']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
}).refine(data => new Date(data.start) <= new Date(data.end), {
  message: "Start date must be before end date"
});

export const myJobsQuerySchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  status: jobStatusSchema.optional(),
  search: z.string().optional(),
  dateRange: dateRangeSchema.optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title', 'resumeCount', 'avgMatchScore']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  includeAnalytics: z.boolean().default(false),
  includeResumeCount: z.boolean().default(true),
  tags: z.array(z.string()).optional(),
});

export const filterSummarySchema = z.object({
  appliedFilters: z.object({
    status: z.string().optional(),
    dateRange: dateRangeSchema.optional(),
    search: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  availableFilters: z.object({
    statuses: z.array(z.object({
      status: z.string(),
      count: z.number(),
    })),
    skillTags: z.array(z.string()),
    experienceLevels: z.array(z.string()),
  }),
});

export type PaginationInfo = z.infer<typeof paginationInfoSchema>;
export type SortOptions = z.infer<typeof sortOptionsSchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
export type MyJobsQuery = z.infer<typeof myJobsQuerySchema>;
export type FilterSummary = z.infer<typeof filterSummarySchema>;

// ===== ANALYTICS & INSIGHTS =====

export const matchDistributionSchema = z.object({
  excellent: z.number().default(0), // >= 90
  good: z.number().default(0),      // 80-89
  fair: z.number().default(0),      // 60-79
  poor: z.number().default(0),      // < 60
});

export const skillAnalysisSchema = z.object({
  skill: z.string(),
  frequency: z.number(),
  avgMatchScore: z.number().min(0).max(100),
  marketDemand: z.enum(['high', 'medium', 'low']).optional(),
});

export const timeBasedMetricSchema = z.object({
  date: z.string().date(),
  candidatesAnalyzed: z.number().default(0),
  avgMatchScore: z.number().min(0).max(100).optional(),
  analysesCount: z.number().default(0),
});

export const dashboardAnalyticsSchema = z.object({
  overview: z.object({
    totalJobs: z.number(),
    activeJobs: z.number(),
    totalCandidates: z.number(),
    avgMatchScore: z.number().min(0).max(100).optional(),
    topPerformingJob: z.object({
      id: z.number(),
      title: z.string(),
      avgMatchScore: z.number().min(0).max(100),
    }).optional(),
  }),
  trends: z.object({
    matchScoreDistribution: matchDistributionSchema,
    activityOverTime: z.array(timeBasedMetricSchema),
    topSkills: z.array(skillAnalysisSchema),
  }),
  recommendations: z.array(z.string()),
});

export const jobPerformanceAnalyticsSchema = z.object({
  overview: z.object({
    totalCandidates: z.number(),
    avgMatchScore: z.number().min(0).max(100).optional(),
    topMatch: z.object({
      resumeId: z.number(),
      candidateName: z.string(),
      matchScore: z.number().min(0).max(100),
    }).optional(),
    recentActivity: z.number(),
  }),
  matchDistribution: matchDistributionSchema,
  skillAnalysis: z.object({
    mostMatchedSkills: z.array(skillAnalysisSchema),
    leastMatchedSkills: z.array(z.object({
      skill: z.string(),
      gapFrequency: z.number(),
    })),
  }),
  timeBasedMetrics: z.array(timeBasedMetricSchema),
  recommendations: z.array(z.string()),
});

export const optimizationSuggestionSchema = z.object({
  type: z.enum(['skill_requirements', 'experience_level', 'job_description', 'bias_reduction']),
  suggestion: z.string(),
  impact: z.enum(['low', 'medium', 'high']),
  effort: z.enum(['low', 'medium', 'high']),
  priority: z.number().min(1).max(10).default(5),
});

export const jobInsightsSchema = z.object({
  optimizationSuggestions: z.array(optimizationSuggestionSchema),
  marketComparison: z.object({
    skillsDemand: z.array(z.object({
      skill: z.string(),
      marketDemand: z.enum(['high', 'medium', 'low']),
      yourRequirement: z.boolean(),
    })),
    experienceLevelFit: z.object({
      suggested: z.string(),
      reasoning: z.string(),
    }),
  }),
  biasAnalysis: z.object({
    overallScore: z.number().min(0).max(100),
    flaggedAreas: z.array(z.string()),
    suggestions: z.array(z.string()),
  }),
});

export type MatchDistribution = z.infer<typeof matchDistributionSchema>;
export type SkillAnalysis = z.infer<typeof skillAnalysisSchema>;
export type TimeBasedMetric = z.infer<typeof timeBasedMetricSchema>;
export type DashboardAnalytics = z.infer<typeof dashboardAnalyticsSchema>;
export type JobPerformanceAnalytics = z.infer<typeof jobPerformanceAnalyticsSchema>;
export type OptimizationSuggestion = z.infer<typeof optimizationSuggestionSchema>;
export type JobInsights = z.infer<typeof jobInsightsSchema>;

// ===== BULK OPERATIONS =====

export const bulkOperationRequestSchema = z.object({
  operation: z.enum(['archive', 'delete', 'change_status', 'duplicate', 'export', 'reanalyze', 'tag']),
  jobIds: z.array(z.number()).min(1),
  options: z.object({
    // For 'change_status' operation
    newStatus: jobStatusSchema.optional(),
    // For 'duplicate' operation
    titlePrefix: z.string().optional(),
    // For 'export' operation
    format: z.enum(['csv', 'json', 'pdf']).optional(),
    includeAnalytics: z.boolean().optional(),
    // For 'tag' operation
    tags: z.array(z.string()).optional(),
    // For 'reanalyze' operation
    priority: z.enum(['low', 'normal', 'high']).optional(),
  }).optional(),
});

export const bulkOperationResultSchema = z.object({
  processedCount: z.number(),
  failedCount: z.number(),
  results: z.array(z.object({
    jobId: z.number(),
    success: z.boolean(),
    error: z.string().optional(),
    result: z.any().optional(),
  })),
  estimatedProcessingTime: z.number().optional(), // for async operations
});

export type BulkOperationRequest = z.infer<typeof bulkOperationRequestSchema>;
export type BulkOperationResult = z.infer<typeof bulkOperationResultSchema>;

// ===== JOB DUPLICATION =====

export const duplicateJobRequestSchema = z.object({
  title: z.string().optional(),
  status: z.enum(['draft', 'active']).default('draft'),
  copyResumes: z.boolean().default(false),
  copyAnalyses: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

export const duplicateJobResponseSchema = z.object({
  originalJob: z.any(), // JobDescription
  duplicatedJob: z.any(), // JobDescription
  copiedResumes: z.number().optional(),
  copiedAnalyses: z.number().optional(),
});

export type DuplicateJobRequest = z.infer<typeof duplicateJobRequestSchema>;
export type DuplicateJobResponse = z.infer<typeof duplicateJobResponseSchema>;

// ===== ADVANCED SEARCH =====

export const searchFacetSchema = z.object({
  value: z.string(),
  count: z.number(),
});

export const searchFiltersSchema = z.object({
  status: z.array(z.string()).optional(),
  dateRange: dateRangeSchema.optional(),
  skills: z.array(z.string()).optional(),
  experienceLevel: z.array(z.string()).optional(),
  resumeCountRange: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
  matchScoreRange: z.object({
    min: z.number().min(0).max(100),
    max: z.number().min(0).max(100),
  }).optional(),
  tags: z.array(z.string()).optional(),
});

export const advancedSearchRequestSchema = z.object({
  query: z.string(),
  filters: searchFiltersSchema.optional(),
  facets: z.array(z.string()).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['relevance', 'createdAt', 'updatedAt', 'title', 'avgMatchScore']).default('relevance'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const advancedSearchResponseSchema = z.object({
  jobs: z.array(jobWithMetricsSchema),
  pagination: paginationInfoSchema,
  facets: z.record(z.array(searchFacetSchema)).optional(),
  searchMetadata: z.object({
    totalMatches: z.number(),
    searchTime: z.number(),
    query: z.string(),
    appliedFilters: searchFiltersSchema.optional(),
  }),
});

export type SearchFacet = z.infer<typeof searchFacetSchema>;
export type SearchFilters = z.infer<typeof searchFiltersSchema>;
export type AdvancedSearchRequest = z.infer<typeof advancedSearchRequestSchema>;
export type AdvancedSearchResponse = z.infer<typeof advancedSearchResponseSchema>;

// ===== API RESPONSE WRAPPERS =====

export const successResponseSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  success: z.literal(true),
  status: z.enum(['ok', 'success']),
  message: z.string().optional(),
  data: dataSchema,
  timestamp: z.string().datetime(),
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
  details: z.any().optional(),
  timestamp: z.string().datetime(),
});

// Helper function to create typed success responses
export function createSuccessResponse<T>(data: T) {
  return {
    success: true as const,
    status: 'ok' as const,
    data,
    timestamp: new Date().toISOString(),
  };
}

// Helper function to create typed error responses
export function createErrorResponse(error: string, message: string, details?: any) {
  return {
    success: false as const,
    error,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
}

// Export commonly used response types
export type SuccessResponse<T> = {
  success: true;
  status: 'ok' | 'success';
  message?: string;
  data: T;
  timestamp: string;
};

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// ===== VALIDATION HELPERS =====

export const validateJobId = z.number().int().positive();
export const validateUserId = z.string().min(1);
export const validateResumeId = z.number().int().positive();

// Common validation functions
export function validatePaginationParams(page?: number, limit?: number) {
  return {
    page: Math.max(1, page || 1),
    limit: Math.min(100, Math.max(1, limit || 20)),
  };
}

export function validateDateRange(start?: string, end?: string) {
  if (!start || !end) return null;
  
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    throw new Error('Invalid date format');
  }
  
  if (startDate >= endDate) {
    throw new Error('Start date must be before end date');
  }
  
  return { start: startDate, end: endDate };
}

export function validateSortOptions(sortBy?: string, sortOrder?: string) {
  const validSortBy = ['createdAt', 'updatedAt', 'title', 'resumeCount', 'avgMatchScore'];
  const validSortOrder = ['asc', 'desc'];
  
  return {
    sortBy: validSortBy.includes(sortBy || '') ? sortBy : 'createdAt',
    sortOrder: validSortOrder.includes(sortOrder || '') ? sortOrder : 'desc',
  };
}