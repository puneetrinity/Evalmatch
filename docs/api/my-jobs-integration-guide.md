# My Jobs API Integration Guide

## Overview

This guide outlines how the new My Jobs API integrates with existing EvalMatch endpoints, ensuring backward compatibility, smooth data migration, and seamless user experience transitions.

## 1. Existing API Mapping

### 1.1 Current Endpoint Mapping

```typescript
// Current endpoints → New My Jobs endpoints
const endpointMigrationMap = {
  // Job Management
  'GET /api/job-descriptions': 'GET /api/v1/my-jobs',
  'POST /api/job-descriptions': 'POST /api/v1/my-jobs',
  'GET /api/job-descriptions/:id': 'GET /api/v1/my-jobs/:id',
  'PATCH /api/job-descriptions/:id': 'PATCH /api/v1/my-jobs/:id',
  'DELETE /api/job-descriptions/:id': 'DELETE /api/v1/my-jobs/:id',
  
  // Analysis Integration
  'POST /api/analysis/analyze/:jobId': 'POST /api/v1/my-jobs/:id/analyze',
  'GET /api/analysis/results/:jobId': 'GET /api/v1/my-jobs/:id/analytics',
  
  // Interview Questions
  'GET /api/analysis/interview-questions/:resumeId/:jobId': 'GET /api/v1/my-jobs/:jobId/resumes/:resumeId/interview-questions',
  
  // New Enhanced Endpoints (no legacy equivalent)
  'GET /api/v1/my-jobs/analytics': '[NEW] Dashboard analytics',
  'POST /api/v1/my-jobs/:id/duplicate': '[NEW] Job duplication',
  'GET /api/v1/my-jobs/templates': '[NEW] Job templates',
  'POST /api/v1/my-jobs/:id/resumes/associate': '[NEW] Resume association',
  'GET /api/v1/my-jobs/search': '[NEW] Advanced search',
};
```

### 1.2 Response Format Evolution

```typescript
// Legacy job-descriptions response
interface LegacyJobResponse {
  success: boolean;
  data: {
    jobDescription: JobDescription;
    // Limited metadata
  };
  timestamp: string;
}

// Enhanced My Jobs response
interface EnhancedJobResponse {
  success: boolean;
  data: {
    job: JobWithMetrics; // Enhanced with metrics
    statusHistory?: StatusHistory[]; // New
    associatedResumes?: ResumeWithAssociation[]; // New
    analytics?: JobAnalytics; // New
    insights?: JobInsights; // New
  };
  timestamp: string;
}

// Backward compatibility adapter
class ResponseAdapter {
  static adaptJobResponse(enhancedResponse: EnhancedJobResponse): LegacyJobResponse {
    return {
      success: enhancedResponse.success,
      data: {
        jobDescription: {
          id: enhancedResponse.data.job.id,
          title: enhancedResponse.data.job.title,
          description: enhancedResponse.data.job.description,
          requirements: enhancedResponse.data.job.requirements,
          skills: enhancedResponse.data.job.skills,
          experience: enhancedResponse.data.job.experience,
          analyzedData: enhancedResponse.data.job.analyzedData,
          createdAt: enhancedResponse.data.job.createdAt,
          updatedAt: enhancedResponse.data.job.updatedAt,
          userId: enhancedResponse.data.job.userId,
        }
      },
      timestamp: enhancedResponse.timestamp,
    };
  }
}
```

## 2. Data Migration Strategy

### 2.1 Schema Migration Plan

```sql
-- Phase 1: Add new columns to existing tables
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

-- Phase 2: Create new tables for enhanced features
CREATE TABLE IF NOT EXISTS job_status_history (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES job_descriptions(id) ON DELETE CASCADE,
  previous_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  changed_at TIMESTAMP DEFAULT NOW(),
  changed_by TEXT NOT NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS resume_job_associations (
  id SERIAL PRIMARY KEY,
  resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES job_descriptions(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  priority VARCHAR(10) DEFAULT 'normal',
  tags JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(resume_id, job_id)
);

CREATE TABLE IF NOT EXISTS job_templates (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requirements JSONB DEFAULT '[]',
  template_metadata JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Phase 3: Create indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_descriptions_status ON job_descriptions(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_descriptions_tags ON job_descriptions USING GIN(tags);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_job_associations_job_id ON resume_job_associations(job_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resume_job_associations_status ON resume_job_associations(status);
```

### 2.2 Data Migration Script

```typescript
interface MigrationContext {
  batchSize: number;
  dryRun: boolean;
  continueOnError: boolean;
}

class MyJobsDataMigration {
  static async migrateExistingData(context: MigrationContext = { batchSize: 1000, dryRun: false, continueOnError: true }): Promise<MigrationResult> {
    const migrationStart = Date.now();
    const results: MigrationResult = {
      totalJobs: 0,
      migratedJobs: 0,
      failedJobs: 0,
      createdAssociations: 0,
      errors: [],
    };
    
    try {
      // Step 1: Migrate job descriptions to new schema
      await this.migrateJobDescriptions(context, results);
      
      // Step 2: Create resume-job associations from existing analyses
      await this.createResumeJobAssociations(context, results);
      
      // Step 3: Populate job metrics from existing data
      await this.populateJobMetrics(context, results);
      
      // Step 4: Create default status history
      await this.createDefaultStatusHistory(context, results);
      
      const migrationEnd = Date.now();
      results.duration = migrationEnd - migrationStart;
      
      logger.info('My Jobs migration completed', results);
      
    } catch (error) {
      logger.error('Migration failed', error);
      results.fatalError = error.message;
    }
    
    return results;
  }
  
  private static async migrateJobDescriptions(
    context: MigrationContext, 
    results: MigrationResult
  ): Promise<void> {
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const jobs = await db.query(`
        SELECT id, user_id, title, description, requirements, created_at
        FROM job_descriptions 
        WHERE status IS NULL OR status = ''
        ORDER BY id 
        LIMIT $1 OFFSET $2
      `, [context.batchSize, offset]);
      
      if (jobs.rows.length === 0) {
        hasMore = false;
        continue;
      }
      
      for (const job of jobs.rows) {
        try {
          results.totalJobs++;
          
          // Determine initial status based on creation date and usage
          const status = await this.determineJobStatus(job.id, job.created_at);
          
          // Extract tags from description and requirements
          const tags = await this.extractJobTags(job.description, job.requirements);
          
          if (!context.dryRun) {
            await db.query(`
              UPDATE job_descriptions 
              SET status = $1, tags = $2, updated_at = NOW()
              WHERE id = $3
            `, [status, JSON.stringify(tags), job.id]);
          }
          
          results.migratedJobs++;
          
        } catch (error) {
          results.failedJobs++;
          results.errors.push({
            jobId: job.id,
            step: 'migrate_job_descriptions',
            error: error.message,
          });
          
          if (!context.continueOnError) {
            throw error;
          }
        }
      }
      
      offset += context.batchSize;
    }
  }
  
  private static async createResumeJobAssociations(
    context: MigrationContext,
    results: MigrationResult
  ): Promise<void> {
    // Create associations based on existing analysis results
    const analysisQuery = `
      SELECT DISTINCT ar.resume_id, ar.job_description_id, ar.created_at,
             r.user_id as resume_user_id, j.user_id as job_user_id
      FROM analysis_results ar
      JOIN resumes r ON r.id = ar.resume_id
      JOIN job_descriptions j ON j.id = ar.job_description_id
      WHERE r.user_id = j.user_id  -- Only associate if same user owns both
      ORDER BY ar.created_at
    `;
    
    const analyses = await db.query(analysisQuery);
    
    for (const analysis of analyses.rows) {
      try {
        // Check if association already exists
        const existingAssociation = await db.query(`
          SELECT id FROM resume_job_associations 
          WHERE resume_id = $1 AND job_id = $2
        `, [analysis.resume_id, analysis.job_description_id]);
        
        if (existingAssociation.rows.length === 0) {
          if (!context.dryRun) {
            await db.query(`
              INSERT INTO resume_job_associations 
              (resume_id, job_id, status, created_at, updated_at)
              VALUES ($1, $2, 'analyzed', $3, $3)
            `, [analysis.resume_id, analysis.job_description_id, analysis.created_at]);
          }
          
          results.createdAssociations++;
        }
      } catch (error) {
        results.errors.push({
          resumeId: analysis.resume_id,
          jobId: analysis.job_description_id,
          step: 'create_associations',
          error: error.message,
        });
        
        if (!context.continueOnError) {
          throw error;
        }
      }
    }
  }
  
  private static async determineJobStatus(jobId: number, createdAt: Date): Promise<JobStatus> {
    // Check if job has recent analysis activity
    const recentAnalyses = await db.query(`
      SELECT COUNT(*) as count 
      FROM analysis_results 
      WHERE job_description_id = $1 
      AND created_at > NOW() - INTERVAL '30 days'
    `, [jobId]);
    
    const analysisCount = parseInt(recentAnalyses.rows[0].count);
    const daysSinceCreation = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    
    if (analysisCount > 0) {
      return 'active';
    } else if (daysSinceCreation > 90) {
      return 'archived';
    } else {
      return 'draft';
    }
  }
  
  private static async extractJobTags(description: string, requirements: string[]): Promise<string[]> {
    const tags: Set<string> = new Set();
    
    // Extract technology keywords
    const techKeywords = [
      'javascript', 'typescript', 'react', 'node', 'python', 'java', 'aws', 
      'docker', 'kubernetes', 'sql', 'nosql', 'mongodb', 'postgresql'
    ];
    
    const fullText = `${description} ${requirements?.join(' ') || ''}`.toLowerCase();
    
    techKeywords.forEach(keyword => {
      if (fullText.includes(keyword)) {
        tags.add(keyword);
      }
    });
    
    // Extract experience level
    if (fullText.includes('senior')) tags.add('senior');
    if (fullText.includes('junior')) tags.add('junior');
    if (fullText.includes('lead')) tags.add('lead');
    if (fullText.includes('principal')) tags.add('principal');
    
    // Extract work arrangement
    if (fullText.includes('remote')) tags.add('remote');
    if (fullText.includes('hybrid')) tags.add('hybrid');
    if (fullText.includes('on-site') || fullText.includes('onsite')) tags.add('onsite');
    
    return Array.from(tags).slice(0, 10); // Limit to 10 tags
  }
}
```

## 3. Backward Compatibility Layer

### 3.1 Legacy API Proxy

```typescript
class LegacyAPIProxy {
  // Intercept legacy requests and route to new endpoints
  static setupLegacyRoutes(app: Express): void {
    // Legacy job descriptions endpoints
    app.get('/api/job-descriptions', this.proxyToMyJobs);
    app.post('/api/job-descriptions', this.proxyJobCreation);
    app.get('/api/job-descriptions/:id', this.proxyJobRetrieval);
    app.patch('/api/job-descriptions/:id', this.proxyJobUpdate);
    app.delete('/api/job-descriptions/:id', this.proxyJobDeletion);
  }
  
  private static async proxyToMyJobs(req: Request, res: Response): Promise<void> {
    try {
      // Transform legacy query params to new format
      const transformedQuery = this.transformLegacyQuery(req.query);
      
      // Call new My Jobs endpoint
      const response = await myJobsService.getUserJobs(req.user!.uid, transformedQuery);
      
      // Transform response back to legacy format
      const legacyResponse = this.transformToLegacyFormat(response);
      
      // Add deprecation headers
      res.set({
        'X-API-Deprecated': 'true',
        'X-API-Deprecation-Date': '2025-12-31',
        'X-API-Sunset-Date': '2026-06-30',
        'X-API-Migration-Guide': 'https://docs.evalmatch.com/api/my-jobs-migration',
      });
      
      res.json(legacyResponse);
      
    } catch (error) {
      // Ensure errors are formatted consistently
      const legacyError = this.transformErrorToLegacyFormat(error);
      res.status(legacyError.statusCode).json(legacyError);
    }
  }
  
  private static transformLegacyQuery(query: any): MyJobsQuery {
    return {
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 20,
      search: query.search,
      sortBy: query.sortBy === 'date' ? 'createdAt' : query.sortBy,
      sortOrder: query.order === 'asc' ? 'asc' : 'desc',
      includeAnalytics: false, // Legacy didn't include analytics
      includeResumeCount: true, // New default
    };
  }
  
  private static transformToLegacyFormat(response: any): any {
    // Transform new response format to legacy format
    return {
      success: response.success,
      data: {
        jobDescriptions: response.data.jobs.map((job: JobWithMetrics) => ({
          id: job.id,
          title: job.title,
          description: job.description,
          requirements: job.requirements,
          skills: job.skills,
          experience: job.experience,
          analyzedData: job.analyzedData,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          userId: job.userId,
          // Hide new fields from legacy clients
        })),
        pagination: {
          page: response.data.pagination.page,
          limit: response.data.pagination.limit,
          total: response.data.pagination.total,
          totalPages: response.data.pagination.totalPages,
        }
      },
      timestamp: response.timestamp,
    };
  }
}
```

### 3.2 Feature Flag System

```typescript
interface FeatureFlags {
  myJobsEnabled: boolean;
  myJobsAnalytics: boolean;
  myJobsTemplates: boolean;
  myJobsBulkOperations: boolean;
  legacyEndpointsDeprecation: boolean;
}

class FeatureFlagManager {
  private static flags: FeatureFlags = {
    myJobsEnabled: true,
    myJobsAnalytics: true,
    myJobsTemplates: true,
    myJobsBulkOperations: true,
    legacyEndpointsDeprecation: false,
  };
  
  static isEnabled(feature: keyof FeatureFlags): boolean {
    return this.flags[feature] || false;
  }
  
  static middleware(feature: keyof FeatureFlags) {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.isEnabled(feature)) {
        return res.status(503).json({
          success: false,
          error: 'FEATURE_DISABLED',
          message: `Feature ${feature} is currently disabled`,
          timestamp: new Date().toISOString(),
        });
      }
      next();
    };
  }
  
  // Dynamic feature flag loading from environment/database
  static async loadFeatureFlags(): Promise<void> {
    try {
      const flagsFromEnv = {
        myJobsEnabled: process.env.MY_JOBS_ENABLED === 'true',
        myJobsAnalytics: process.env.MY_JOBS_ANALYTICS === 'true',
        myJobsTemplates: process.env.MY_JOBS_TEMPLATES === 'true',
        myJobsBulkOperations: process.env.MY_JOBS_BULK_OPS === 'true',
        legacyEndpointsDeprecation: process.env.LEGACY_DEPRECATION === 'true',
      };
      
      // Load from database for dynamic flags
      const dbFlags = await this.loadFlagsFromDatabase();
      
      this.flags = { ...this.flags, ...flagsFromEnv, ...dbFlags };
      
      logger.info('Feature flags loaded', this.flags);
      
    } catch (error) {
      logger.error('Failed to load feature flags, using defaults', error);
    }
  }
}
```

## 4. Client Migration Strategy

### 4.1 SDK Migration Guide

```typescript
// Old SDK usage
const oldSDK = {
  // Legacy job creation
  async createJob(jobData: JobInput): Promise<JobResponse> {
    return this.post('/api/job-descriptions', jobData);
  },
  
  // Legacy job listing
  async getJobs(page: number = 1, limit: number = 20): Promise<JobListResponse> {
    return this.get(`/api/job-descriptions?page=${page}&limit=${limit}`);
  }
};

// New SDK with backward compatibility
class EvalMatchSDK {
  // Backward compatible methods
  async createJob(jobData: JobInput): Promise<JobResponse> {
    // Use new endpoint but maintain compatible response
    const response = await this.myJobs.create(jobData);
    return this.transformToLegacyFormat(response);
  }
  
  async getJobs(page: number = 1, limit: number = 20): Promise<JobListResponse> {
    const response = await this.myJobs.list({ page, limit });
    return this.transformToLegacyFormat(response);
  }
  
  // New My Jobs namespace
  myJobs = {
    async list(options: MyJobsQuery): Promise<MyJobsResponse> {
      return this.post('/api/v1/my-jobs', {}, { params: options });
    },
    
    async create(jobData: CreateJobRequest): Promise<JobWithMetrics> {
      return this.post('/api/v1/my-jobs', jobData);
    },
    
    async get(id: number): Promise<JobWithMetrics> {
      return this.get(`/api/v1/my-jobs/${id}`);
    },
    
    async update(id: number, updates: Partial<JobWithMetrics>): Promise<JobWithMetrics> {
      return this.patch(`/api/v1/my-jobs/${id}`, updates);
    },
    
    async delete(id: number): Promise<void> {
      return this.delete(`/api/v1/my-jobs/${id}`);
    },
    
    // New enhanced features
    async getAnalytics(options?: AnalyticsOptions): Promise<DashboardAnalytics> {
      return this.get('/api/v1/my-jobs/analytics', { params: options });
    },
    
    async duplicate(id: number, options: DuplicateJobRequest): Promise<DuplicateJobResponse> {
      return this.post(`/api/v1/my-jobs/${id}/duplicate`, options);
    },
    
    async associateResumes(jobId: number, resumeIds: number[]): Promise<AssociationResponse> {
      return this.post(`/api/v1/my-jobs/${jobId}/resumes/associate`, { resumeIds });
    },
    
    async search(query: AdvancedSearchRequest): Promise<AdvancedSearchResponse> {
      return this.get('/api/v1/my-jobs/search', { params: query });
    },
  };
}
```

### 4.2 Frontend Migration Path

```typescript
// Migration helper for React applications
class MyJobsMigrationHelper {
  // Gradual migration with feature flags
  static useJobsAPI() {
    const [useNewAPI, setUseNewAPI] = useState(
      localStorage.getItem('use-new-jobs-api') === 'true'
    );
    
    const jobsAPI = useMemo(() => {
      if (useNewAPI) {
        return new MyJobsAPI();
      } else {
        return new LegacyJobsAPI();
      }
    }, [useNewAPI]);
    
    const enableNewAPI = useCallback(() => {
      setUseNewAPI(true);
      localStorage.setItem('use-new-jobs-api', 'true');
    }, []);
    
    return { jobsAPI, useNewAPI, enableNewAPI };
  }
  
  // Component wrapper for gradual migration
  static JobsPageWrapper({ children }: { children: React.ReactNode }) {
    const { jobsAPI, useNewAPI, enableNewAPI } = this.useJobsAPI();
    
    return (
      <JobsAPIProvider value={jobsAPI}>
        {!useNewAPI && (
          <MigrationBanner onEnableNewAPI={enableNewAPI} />
        )}
        {children}
      </JobsAPIProvider>
    );
  }
}

// Migration banner component
function MigrationBanner({ onEnableNewAPI }: { onEnableNewAPI: () => void }) {
  const [dismissed, setDismissed] = useState(
    localStorage.getItem('migration-banner-dismissed') === 'true'
  );
  
  if (dismissed) return null;
  
  return (
    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-blue-900">
            New My Jobs Features Available!
          </h4>
          <p className="text-blue-700 text-sm">
            Try our enhanced job management with analytics, templates, and bulk operations.
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={onEnableNewAPI}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            Try New Features
          </button>
          <button
            onClick={() => {
              setDismissed(true);
              localStorage.setItem('migration-banner-dismissed', 'true');
            }}
            className="text-blue-600 px-4 py-2 rounded text-sm hover:text-blue-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
```

## 5. Testing Integration

### 5.1 Compatibility Test Suite

```typescript
describe('My Jobs API Compatibility', () => {
  describe('Legacy Endpoint Compatibility', () => {
    it('should maintain backward compatibility for job creation', async () => {
      const legacyJobData = {
        title: 'Test Job',
        description: 'Test description',
        requirements: ['Skill 1', 'Skill 2'],
      };
      
      // Test legacy endpoint
      const legacyResponse = await request(app)
        .post('/api/job-descriptions')
        .set('Authorization', `Bearer ${testToken}`)
        .send(legacyJobData);
        
      // Test new endpoint
      const newResponse = await request(app)
        .post('/api/v1/my-jobs')
        .set('Authorization', `Bearer ${testToken}`)
        .send(legacyJobData);
      
      // Responses should have same core structure
      expect(legacyResponse.body.data.jobDescription.title)
        .toEqual(newResponse.body.data.job.title);
        
      expect(legacyResponse.body.data.jobDescription.description)
        .toEqual(newResponse.body.data.job.description);
    });
    
    it('should handle legacy query parameters correctly', async () => {
      const legacyQuery = {
        page: 2,
        limit: 10,
        search: 'developer',
        sortBy: 'date',
        order: 'desc',
      };
      
      const response = await request(app)
        .get('/api/job-descriptions')
        .query(legacyQuery)
        .set('Authorization', `Bearer ${testToken}`);
        
      expect(response.status).toBe(200);
      expect(response.body.data.pagination.page).toBe(2);
      expect(response.body.data.pagination.limit).toBe(10);
    });
  });
  
  describe('Data Migration Validation', () => {
    it('should correctly migrate existing job descriptions', async () => {
      // Create a job using legacy format
      const legacyJob = await createLegacyJob({
        title: 'Migration Test Job',
        description: 'Test description for migration',
      });
      
      // Run migration
      await MyJobsDataMigration.migrateExistingData({ dryRun: false });
      
      // Verify migration results
      const migratedJob = await request(app)
        .get(`/api/v1/my-jobs/${legacyJob.id}`)
        .set('Authorization', `Bearer ${testToken}`);
        
      expect(migratedJob.body.data.job.status).toBeDefined();
      expect(migratedJob.body.data.job.tags).toBeDefined();
      expect(migratedJob.body.data.job.metrics).toBeDefined();
    });
  });
  
  describe('Feature Flag Integration', () => {
    it('should respect feature flags for new endpoints', async () => {
      // Disable My Jobs analytics
      await FeatureFlagManager.setFlag('myJobsAnalytics', false);
      
      const response = await request(app)
        .get('/api/v1/my-jobs/analytics')
        .set('Authorization', `Bearer ${testToken}`);
        
      expect(response.status).toBe(503);
      expect(response.body.error).toBe('FEATURE_DISABLED');
    });
  });
});
```

### 5.2 Migration Validation Tests

```typescript
describe('Migration Validation', () => {
  let migrationContext: MigrationContext;
  
  beforeEach(() => {
    migrationContext = {
      batchSize: 10,
      dryRun: true,
      continueOnError: true,
    };
  });
  
  it('should preserve all existing job data during migration', async () => {
    // Create test jobs with legacy format
    const testJobs = await createTestJobs(5);
    
    // Run migration in dry-run mode
    const result = await MyJobsDataMigration.migrateExistingData(migrationContext);
    
    expect(result.totalJobs).toBe(5);
    expect(result.failedJobs).toBe(0);
    
    // Verify original data is unchanged
    for (const job of testJobs) {
      const originalJob = await getJobById(job.id);
      expect(originalJob.title).toBe(job.title);
      expect(originalJob.description).toBe(job.description);
    }
  });
  
  it('should handle migration errors gracefully', async () => {
    // Create a job with invalid data that will cause migration to fail
    const invalidJob = await createJobWithInvalidData();
    
    const result = await MyJobsDataMigration.migrateExistingData(migrationContext);
    
    expect(result.failedJobs).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].jobId).toBe(invalidJob.id);
  });
  
  it('should create correct resume-job associations', async () => {
    // Create job and resume with existing analysis
    const job = await createTestJob();
    const resume = await createTestResume();
    const analysis = await createAnalysisResult(resume.id, job.id);
    
    // Run migration
    migrationContext.dryRun = false;
    const result = await MyJobsDataMigration.migrateExistingData(migrationContext);
    
    // Verify association was created
    const association = await getResumeJobAssociation(resume.id, job.id);
    expect(association).toBeDefined();
    expect(association.status).toBe('analyzed');
    expect(result.createdAssociations).toBeGreaterThan(0);
  });
});
```

## 6. Deployment Strategy

### 6.1 Phased Rollout Plan

```typescript
interface DeploymentPhase {
  name: string;
  duration: string;
  features: string[];
  userPercentage: number;
  rollbackCriteria: RollbackCriteria;
}

const deploymentPhases: DeploymentPhase[] = [
  {
    name: 'Phase 1: Internal Testing',
    duration: '1 week',
    features: ['basic-my-jobs-endpoints', 'legacy-compatibility'],
    userPercentage: 0, // Internal only
    rollbackCriteria: {
      errorRate: 0.01,
      responseTime: 2000,
      userComplaints: 0,
    },
  },
  
  {
    name: 'Phase 2: Beta Users',
    duration: '2 weeks',
    features: ['all-endpoints', 'feature-flags'],
    userPercentage: 5, // Beta users only
    rollbackCriteria: {
      errorRate: 0.05,
      responseTime: 3000,
      userComplaints: 5,
    },
  },
  
  {
    name: 'Phase 3: Gradual Rollout',
    duration: '4 weeks',
    features: ['all-endpoints', 'migration-tools'],
    userPercentage: 25, // Gradual increase to 100%
    rollbackCriteria: {
      errorRate: 0.02,
      responseTime: 2500,
      userComplaints: 20,
    },
  },
  
  {
    name: 'Phase 4: Full Deployment',
    duration: 'ongoing',
    features: ['all-endpoints', 'legacy-deprecation-warnings'],
    userPercentage: 100,
    rollbackCriteria: {
      errorRate: 0.03,
      responseTime: 3000,
      userComplaints: 50,
    },
  },
];
```

### 6.2 Rollback Procedures

```typescript
class RollbackManager {
  static async executeRollback(phase: string, reason: string): Promise<RollbackResult> {
    const rollbackStart = Date.now();
    
    try {
      // Step 1: Disable new endpoints
      await FeatureFlagManager.setFlag('myJobsEnabled', false);
      
      // Step 2: Route all traffic to legacy endpoints
      await this.enableLegacyRouting();
      
      // Step 3: Revert database changes if necessary
      await this.revertDatabaseChanges(phase);
      
      // Step 4: Clear caches
      await this.clearRelatedCaches();
      
      // Step 5: Notify stakeholders
      await this.notifyRollback(phase, reason);
      
      const rollbackEnd = Date.now();
      
      return {
        success: true,
        duration: rollbackEnd - rollbackStart,
        phase,
        reason,
        timestamp: new Date(),
      };
      
    } catch (error) {
      logger.error('Rollback failed', { phase, reason, error });
      
      // Emergency fallback
      await this.emergencyFallback();
      
      throw error;
    }
  }
  
  private static async enableLegacyRouting(): Promise<void> {
    // Update load balancer configuration to route to legacy endpoints
    await loadBalancer.updateRouting({
      '/api/v1/my-jobs': { enabled: false },
      '/api/job-descriptions': { enabled: true, weight: 100 },
    });
  }
  
  private static async revertDatabaseChanges(phase: string): Promise<void> {
    switch (phase) {
      case 'Phase 2':
        // Revert Phase 2 schema changes
        await this.revertSchemaChanges(['add_status_column', 'add_tags_column']);
        break;
        
      case 'Phase 3':
        // Revert more extensive changes
        await this.revertSchemaChanges(['create_associations_table', 'create_templates_table']);
        break;
        
      default:
        logger.info('No database rollback needed for phase', phase);
    }
  }
}
```

This comprehensive integration guide ensures a smooth transition from the existing API to the enhanced My Jobs system while maintaining backward compatibility and minimizing disruption to existing users.