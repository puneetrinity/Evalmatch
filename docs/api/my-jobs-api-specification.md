# My Jobs API Specification

## Overview

The My Jobs API extends the existing job management system with enhanced dashboard capabilities, job status management, resume-job associations, and advanced analytics. This API follows RESTful principles and maintains consistency with the existing EvalMatch API architecture.

## Base URLs
- Production: `https://evalmatch.app/api/v1`
- Legacy: `https://evalmatch.app/api` (deprecated)

## Authentication
All endpoints require Firebase authentication via Bearer token:
```
Authorization: Bearer <firebase_jwt_token>
```

## Common Response Structure

### Success Response
```json
{
  "success": true,
  "status": "ok" | "success",
  "message": "Optional success message",
  "data": {},
  "timestamp": "2025-01-14T10:40:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {}, // Optional additional context
  "timestamp": "2025-01-14T10:40:00.000Z"
}
```

## 1. My Jobs Dashboard Endpoints

### GET /my-jobs
Retrieve jobs with advanced filtering, searching, and analytics

**Query Parameters:**
```typescript
{
  page?: number = 1;
  limit?: number = 20; // Max 100
  status?: 'active' | 'draft' | 'archived' | 'template';
  search?: string; // Search in title and description
  dateRange?: {
    start: string; // ISO date
    end: string;   // ISO date
  };
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'resumeCount' | 'avgMatchScore';
  sortOrder?: 'asc' | 'desc' = 'desc';
  includeAnalytics?: boolean = false;
  includeResumeCount?: boolean = true;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    jobs: JobWithMetrics[],
    pagination: PaginationInfo,
    analytics?: DashboardAnalytics,
    filters: FilterSummary
  }
}
```

**JobWithMetrics Schema:**
```typescript
interface JobWithMetrics extends JobDescription {
  status: 'active' | 'draft' | 'archived' | 'template';
  resumeCount: number;
  avgMatchScore?: number;
  lastAnalysisDate?: string;
  metrics: {
    totalAnalyses: number;
    highMatchCount: number; // Match score >= 80
    mediumMatchCount: number; // Match score 60-79
    lowMatchCount: number; // Match score < 60
  };
  tags?: string[];
}
```

### GET /my-jobs/analytics
Get comprehensive job analytics and insights

**Query Parameters:**
```typescript
{
  period?: '7d' | '30d' | '90d' | '1y' = '30d';
  jobIds?: number[]; // Specific jobs to analyze
  includeComparison?: boolean = false;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    overview: {
      totalJobs: number;
      activeJobs: number;
      totalCandidates: number;
      avgMatchScore: number;
      topPerformingJob: {
        id: number;
        title: string;
        avgMatchScore: number;
      };
    },
    trends: {
      matchScoreDistribution: {
        high: number; // >= 80
        medium: number; // 60-79
        low: number; // < 60
      },
      activityOverTime: Array<{
        date: string;
        analysesCount: number;
        avgMatchScore: number;
      }>,
      topSkills: Array<{
        skill: string;
        frequency: number;
        avgMatchScore: number;
      }>
    },
    recommendations: string[]
  }
}
```

## 2. Enhanced Job Management Endpoints

### PATCH /my-jobs/:id/status
Update job status with automatic workflow transitions

**Path Parameters:**
- `id: number` - Job description ID

**Request Body:**
```typescript
{
  status: 'active' | 'draft' | 'archived' | 'template';
  reason?: string; // Optional reason for status change
  notifyAssociatedUsers?: boolean = false;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    job: JobDescription,
    statusHistory: Array<{
      previousStatus: string;
      newStatus: string;
      changedAt: string;
      reason?: string;
    }>
  }
}
```

### POST /my-jobs/:id/duplicate
Create a copy of an existing job

**Path Parameters:**
- `id: number` - Job description ID to duplicate

**Request Body:**
```typescript
{
  title?: string; // Override title, defaults to "Copy of {original}"
  status?: 'draft' | 'active' = 'draft';
  copyResumes?: boolean = false; // Copy associated resumes
  copyAnalyses?: boolean = false; // Copy analysis results
  tags?: string[]; // Additional tags for the copy
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    originalJob: JobDescription,
    duplicatedJob: JobDescription,
    copiedResumes?: number,
    copiedAnalyses?: number
  }
}
```

### POST /my-jobs/templates
Create a job template from existing job

**Request Body:**
```typescript
{
  sourceJobId?: number; // Create from existing job
  title: string;
  description: string;
  requirements?: string[];
  templateMetadata: {
    category: string;
    industry?: string;
    experienceLevel: 'entry' | 'mid' | 'senior' | 'lead';
    tags: string[];
    isPublic: boolean = false;
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    template: JobTemplate,
    canBeShared: boolean
  }
}
```

### GET /my-jobs/templates
List available job templates

**Query Parameters:**
```typescript
{
  category?: string;
  industry?: string;
  experienceLevel?: string;
  includePublic?: boolean = true;
  page?: number = 1;
  limit?: number = 20;
}
```

## 3. Resume-Job Association Endpoints

### GET /my-jobs/:id/resumes
Get resumes associated with a specific job

**Path Parameters:**
- `id: number` - Job description ID

**Query Parameters:**
```typescript
{
  page?: number = 1;
  limit?: number = 20;
  status?: 'analyzed' | 'pending' | 'failed';
  minMatchScore?: number;
  maxMatchScore?: number;
  sortBy?: 'matchScore' | 'analysisDate' | 'candidateName';
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    resumes: Array<{
      id: number;
      filename: string;
      candidateName?: string;
      analysisStatus: 'analyzed' | 'pending' | 'failed';
      matchScore?: number;
      analysisDate?: string;
      lastAnalysisId?: number;
      tags?: string[];
    }>,
    pagination: PaginationInfo,
    summary: {
      totalResumes: number;
      analyzedCount: number;
      pendingCount: number;
      failedCount: number;
      avgMatchScore?: number;
    }
  }
}
```

### POST /my-jobs/:id/resumes/associate
Associate resumes with a job

**Path Parameters:**
- `id: number` - Job description ID

**Request Body:**
```typescript
{
  resumeIds: number[];
  analyzeImmediately?: boolean = true;
  priority?: 'low' | 'normal' | 'high' = 'normal';
  tags?: string[]; // Tags for this association
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    associatedCount: number;
    duplicatesSkipped: number;
    analysisJobsCreated?: number;
    estimatedProcessingTime?: number; // seconds
  }
}
```

### DELETE /my-jobs/:id/resumes/:resumeId
Remove resume association from job

**Path Parameters:**
- `id: number` - Job description ID
- `resumeId: number` - Resume ID to dissociate

**Query Parameters:**
```typescript
{
  deleteAnalyses?: boolean = false; // Also delete analysis results
}
```

### POST /my-jobs/:id/resumes/bulk-operations
Perform bulk operations on associated resumes

**Path Parameters:**
- `id: number` - Job description ID

**Request Body:**
```typescript
{
  operation: 'reanalyze' | 'dissociate' | 'tag' | 'export';
  resumeIds: number[];
  options?: {
    // For 'tag' operation
    tags?: string[];
    // For 'export' operation
    format?: 'csv' | 'json' | 'pdf';
    // For 'reanalyze' operation
    priority?: 'low' | 'normal' | 'high';
  }
}
```

## 4. Enhanced Job Creation & Updates

### POST /my-jobs/from-existing
Create new job pre-populated from existing job

**Request Body:**
```typescript
{
  sourceJobId: number;
  title: string;
  modifications?: {
    description?: string;
    requirements?: string[];
    addRequirements?: string[];
    removeRequirements?: string[];
  };
  copyResumes?: boolean = false;
  analyzeImmediately?: boolean = true;
}
```

### PATCH /my-jobs/:id
Enhanced job update with change tracking

**Path Parameters:**
- `id: number` - Job description ID

**Request Body:**
```typescript
{
  title?: string;
  description?: string;
  requirements?: string[];
  status?: 'active' | 'draft' | 'archived' | 'template';
  tags?: string[];
  reanalyze?: boolean = false;
  trackChanges?: boolean = true;
  changeReason?: string;
}
```

**Response includes change history:**
```typescript
{
  success: true,
  data: {
    job: JobDescription,
    changes?: Array<{
      field: string;
      oldValue: any;
      newValue: any;
      changedAt: string;
      reason?: string;
    }>,
    reanalysisTriggered?: boolean
  }
}
```

## 5. Job Performance & Analytics Endpoints

### GET /my-jobs/:id/performance
Get detailed performance metrics for a specific job

**Path Parameters:**
- `id: number` - Job description ID

**Query Parameters:**
```typescript
{
  period?: '7d' | '30d' | '90d' = '30d';
  includeComparisons?: boolean = false;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    overview: {
      totalCandidates: number;
      avgMatchScore: number;
      topMatch: {
        resumeId: number;
        candidateName: string;
        matchScore: number;
      };
      recentActivity: number; // Last 7 days
    },
    matchDistribution: {
      excellent: number; // >= 90
      good: number; // 80-89
      fair: number; // 60-79
      poor: number; // < 60
    },
    skillAnalysis: {
      mostMatchedSkills: Array<{
        skill: string;
        matchFrequency: number;
        avgMatchScore: number;
      }>,
      leastMatchedSkills: Array<{
        skill: string;
        gapFrequency: number;
      }>
    },
    timeBasedMetrics: Array<{
      date: string;
      candidatesAnalyzed: number;
      avgMatchScore: number;
    }>,
    recommendations: string[]
  }
}
```

### GET /my-jobs/:id/insights
AI-powered job insights and optimization suggestions

**Response:**
```typescript
{
  success: true,
  data: {
    optimizationSuggestions: Array<{
      type: 'skill_requirements' | 'experience_level' | 'job_description' | 'bias_reduction';
      suggestion: string;
      impact: 'low' | 'medium' | 'high';
      effort: 'low' | 'medium' | 'high';
    }>,
    marketComparison: {
      skillsDemand: Array<{
        skill: string;
        marketDemand: 'high' | 'medium' | 'low';
        yourRequirement: boolean;
      }>,
      experienceLevelFit: {
        suggested: string;
        reasoning: string;
      }
    },
    biasAnalysis: {
      overallScore: number;
      flaggedAreas: string[];
      suggestions: string[];
    }
  }
}
```

## 6. Bulk Operations Endpoints

### POST /my-jobs/bulk-operations
Perform operations on multiple jobs

**Request Body:**
```typescript
{
  operation: 'archive' | 'delete' | 'change_status' | 'duplicate' | 'export';
  jobIds: number[];
  options?: {
    // For 'change_status' operation
    newStatus?: 'active' | 'draft' | 'archived' | 'template';
    // For 'duplicate' operation
    titlePrefix?: string;
    // For 'export' operation
    format?: 'csv' | 'json' | 'pdf';
    includeAnalytics?: boolean;
  }
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    processedCount: number;
    failedCount: number;
    results: Array<{
      jobId: number;
      success: boolean;
      error?: string;
      result?: any;
    }>;
  }
}
```

## 7. Search & Discovery Endpoints

### GET /my-jobs/search
Advanced search across jobs with faceted filtering

**Query Parameters:**
```typescript
{
  query: string; // Full-text search
  filters?: {
    status?: string[];
    dateRange?: { start: string; end: string };
    skills?: string[];
    experienceLevel?: string[];
    resumeCountRange?: { min: number; max: number };
    matchScoreRange?: { min: number; max: number };
    tags?: string[];
  };
  facets?: string[]; // Return faceted counts for specified fields
  page?: number = 1;
  limit?: number = 20;
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    jobs: JobWithMetrics[],
    pagination: PaginationInfo,
    facets?: {
      [facetName: string]: Array<{
        value: string;
        count: number;
      }>;
    },
    searchMetadata: {
      totalMatches: number;
      searchTime: number;
      query: string;
      appliedFilters: any;
    }
  }
}
```

## Schema Definitions

### JobWithMetrics
```typescript
interface JobWithMetrics extends JobDescription {
  status: 'active' | 'draft' | 'archived' | 'template';
  resumeCount: number;
  avgMatchScore?: number;
  lastAnalysisDate?: string;
  metrics: {
    totalAnalyses: number;
    highMatchCount: number;
    mediumMatchCount: number;
    lowMatchCount: number;
  };
  tags?: string[];
  performance?: {
    trend: 'improving' | 'declining' | 'stable';
    weekOverWeekChange: number;
  };
}
```

### PaginationInfo
```typescript
interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  hasPrevious: boolean;
}
```

### FilterSummary
```typescript
interface FilterSummary {
  appliedFilters: {
    status?: string;
    dateRange?: { start: string; end: string };
    search?: string;
  };
  availableFilters: {
    statuses: Array<{ status: string; count: number }>;
    skillTags: string[];
    experienceLevels: string[];
  };
}
```

## Error Codes

### Job-Specific Error Codes
- `JOB_NOT_FOUND`: Job not found or access denied
- `JOB_ALREADY_ARCHIVED`: Cannot modify archived job
- `JOB_TEMPLATE_INVALID`: Template creation failed
- `RESUME_ASSOCIATION_FAILED`: Failed to associate resume with job
- `DUPLICATE_ASSOCIATION`: Resume already associated with job
- `BULK_OPERATION_PARTIAL_FAILURE`: Some operations in bulk request failed
- `ANALYTICS_UNAVAILABLE`: Analytics data not available for this job
- `TEMPLATE_NOT_ACCESSIBLE`: Template access denied

## Rate Limiting

### Endpoint-Specific Limits
- `GET /my-jobs`: 60 requests/minute
- `GET /my-jobs/analytics`: 20 requests/minute
- `POST /my-jobs/:id/duplicate`: 10 requests/minute
- `POST /my-jobs/bulk-operations`: 5 requests/minute
- All other endpoints: 30 requests/minute

## Performance Considerations

### Caching Strategy
- Job listings: 5-minute cache with user-specific keys
- Analytics data: 15-minute cache
- Template listings: 1-hour cache
- Search results: 2-minute cache

### Pagination Limits
- Default page size: 20 items
- Maximum page size: 100 items
- Deep pagination (page > 100) requires cursor-based pagination

### Response Optimization
- Include only requested fields using field selection
- Lazy load expensive analytics data
- Use compressed responses for large datasets
- Implement request deduplication for identical queries

## Backward Compatibility

All existing `/api/job-descriptions` endpoints remain functional. The new My Jobs API is designed as an enhancement layer that:

1. Extends existing functionality without breaking changes
2. Provides richer data structures while maintaining core compatibility  
3. Offers progressive enhancement for advanced features
4. Supports both legacy and new client implementations

Clients can migrate incrementally by adopting new endpoints as needed while maintaining existing integrations.