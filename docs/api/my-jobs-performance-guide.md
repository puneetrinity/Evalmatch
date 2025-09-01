# My Jobs API Performance Optimization Guide

## Overview

This guide outlines performance optimization strategies for the My Jobs API, ensuring scalable and responsive operation under high load while maintaining data consistency and user experience quality.

## 1. Caching Strategies

### 1.1 Multi-Level Caching Architecture

```typescript
interface CacheConfig {
  // L1: In-memory cache (Redis)
  redis: {
    ttl: number;
    keyPrefix: string;
    compression: boolean;
  };
  
  // L2: Application-level cache (Node.js Memory)
  memory: {
    maxSize: number;
    ttl: number;
  };
  
  // L3: Database query cache
  database: {
    prepared_statements: boolean;
    connection_pool_size: number;
  };
}
```

### 1.2 Endpoint-Specific Caching

```typescript
const CACHE_STRATEGIES = {
  // Job listings - frequently accessed, moderate freshness requirements
  '/my-jobs': {
    strategy: 'user-keyed',
    ttl: 300, // 5 minutes
    invalidation: ['job_created', 'job_updated', 'job_deleted'],
    compression: true,
  },
  
  // Analytics - expensive to compute, can tolerate staleness
  '/my-jobs/analytics': {
    strategy: 'user-keyed-with-params',
    ttl: 900, // 15 minutes
    invalidation: ['job_analysis_completed', 'bulk_operation_completed'],
    background_refresh: true,
  },
  
  // Job performance - very expensive, high staleness tolerance
  '/my-jobs/:id/performance': {
    strategy: 'resource-keyed',
    ttl: 1800, // 30 minutes
    invalidation: ['job_analysis_completed'],
    background_refresh: true,
    warmup_on_access: true,
  },
  
  // Templates - rarely change, high cache hit rate
  '/my-jobs/templates': {
    strategy: 'global-with-user-filter',
    ttl: 3600, // 1 hour
    invalidation: ['template_created', 'template_updated'],
    shared_cache: true,
  },
  
  // Search results - personalized, complex queries
  '/my-jobs/search': {
    strategy: 'query-hash-keyed',
    ttl: 120, // 2 minutes
    max_cache_size: 1000,
    lru_eviction: true,
  },
};
```

### 1.3 Cache Key Generation

```typescript
class MyJobsCacheKeyGenerator {
  static jobListing(userId: string, filters: any, page: number): string {
    const filterHash = this.hashObject(filters);
    return `mj:jobs:${userId}:${filterHash}:p${page}`;
  }
  
  static analytics(userId: string, period: string, jobIds?: number[]): string {
    const jobIdHash = jobIds ? this.hashArray(jobIds) : 'all';
    return `mj:analytics:${userId}:${period}:${jobIdHash}`;
  }
  
  static performance(jobId: number, period: string): string {
    return `mj:perf:${jobId}:${period}`;
  }
  
  static search(userId: string, query: string, filters: any): string {
    const searchHash = this.hashObject({ query, filters });
    return `mj:search:${userId}:${searchHash}`;
  }
  
  private static hashObject(obj: any): string {
    return require('crypto')
      .createHash('md5')
      .update(JSON.stringify(obj))
      .digest('hex')
      .substring(0, 8);
  }
  
  private static hashArray(arr: any[]): string {
    return this.hashObject(arr.sort());
  }
}
```

### 1.4 Cache Invalidation Strategies

```typescript
class MyJobsCacheInvalidator {
  private static invalidationMap = {
    job_created: ['mj:jobs:*', 'mj:analytics:*'],
    job_updated: ['mj:jobs:*', 'mj:perf:*', 'mj:search:*'],
    job_deleted: ['mj:jobs:*', 'mj:analytics:*', 'mj:search:*'],
    job_status_changed: ['mj:jobs:*', 'mj:analytics:*'],
    resume_associated: ['mj:jobs:*', 'mj:perf:*'],
    analysis_completed: ['mj:analytics:*', 'mj:perf:*'],
    bulk_operation_completed: ['mj:jobs:*', 'mj:analytics:*'],
  };
  
  static async invalidate(event: string, context: any = {}) {
    const patterns = this.invalidationMap[event] || [];
    
    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Pattern-based invalidation
        await this.invalidateByPattern(pattern, context);
      } else {
        // Specific key invalidation
        await redis.del(pattern);
      }
    }
  }
  
  private static async invalidateByPattern(pattern: string, context: any) {
    // Implement Redis pattern matching for bulk invalidation
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

## 2. Database Optimization

### 2.1 Index Strategy

```sql
-- Core job listing performance
CREATE INDEX CONCURRENTLY idx_jobs_user_status_created 
ON job_descriptions(user_id, status, created_at DESC) 
WHERE status != 'deleted';

-- Analytics queries
CREATE INDEX CONCURRENTLY idx_analysis_job_date 
ON analysis_results(job_description_id, created_at) 
WHERE match_percentage IS NOT NULL;

-- Resume associations
CREATE INDEX CONCURRENTLY idx_resume_job_associations 
ON resume_job_associations(job_id, status, created_at);

-- Full-text search
CREATE INDEX CONCURRENTLY idx_jobs_search_gin 
ON job_descriptions USING GIN(to_tsvector('english', title || ' ' || description));

-- Covering indexes for common queries
CREATE INDEX CONCURRENTLY idx_jobs_dashboard_covering 
ON job_descriptions(user_id, status, created_at DESC) 
INCLUDE (id, title, updated_at);
```

### 2.2 Query Optimization

```typescript
class OptimizedJobQueries {
  // Use prepared statements for common queries
  static async getJobsWithMetrics(userId: string, filters: JobFilters, pagination: Pagination) {
    const query = `
      SELECT 
        j.*,
        COALESCE(ra.resume_count, 0) as resume_count,
        COALESCE(aa.avg_match_score, 0) as avg_match_score,
        COALESCE(aa.analysis_count, 0) as total_analyses,
        aa.last_analysis_date
      FROM job_descriptions j
      LEFT JOIN LATERAL (
        SELECT 
          COUNT(*) as resume_count
        FROM resume_job_associations rja 
        WHERE rja.job_id = j.id
      ) ra ON true
      LEFT JOIN LATERAL (
        SELECT 
          ROUND(AVG(ar.match_percentage)::numeric, 2) as avg_match_score,
          COUNT(*) as analysis_count,
          MAX(ar.created_at) as last_analysis_date
        FROM analysis_results ar 
        WHERE ar.job_description_id = j.id 
        AND ar.match_percentage IS NOT NULL
      ) aa ON true
      WHERE j.user_id = $1 
      AND j.status = COALESCE($2, j.status)
      AND ($3::text IS NULL OR j.title ILIKE '%' || $3 || '%')
      ORDER BY j.${filters.sortBy} ${filters.sortOrder}
      LIMIT $4 OFFSET $5
    `;
    
    return db.query(query, [
      userId,
      filters.status,
      filters.search,
      pagination.limit,
      pagination.offset
    ]);
  }
  
  // Optimized analytics computation
  static async computeAnalytics(userId: string, period: string, jobIds?: number[]) {
    const query = `
      WITH job_metrics AS (
        SELECT 
          jd.id as job_id,
          jd.title,
          COUNT(ar.id) as total_analyses,
          AVG(ar.match_percentage) as avg_match_score,
          COUNT(CASE WHEN ar.match_percentage >= 80 THEN 1 END) as high_matches,
          COUNT(CASE WHEN ar.match_percentage BETWEEN 60 AND 79 THEN 1 END) as medium_matches,
          COUNT(CASE WHEN ar.match_percentage < 60 THEN 1 END) as low_matches
        FROM job_descriptions jd
        LEFT JOIN analysis_results ar ON ar.job_description_id = jd.id
        WHERE jd.user_id = $1
        AND ar.created_at >= NOW() - INTERVAL '${period}'
        ${jobIds ? 'AND jd.id = ANY($2)' : ''}
        GROUP BY jd.id, jd.title
      )
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN avg_match_score > 0 THEN 1 END) as active_jobs,
        SUM(total_analyses) as total_candidates,
        ROUND(AVG(avg_match_score)::numeric, 2) as overall_avg_score,
        SUM(high_matches) as high_matches,
        SUM(medium_matches) as medium_matches,
        SUM(low_matches) as low_matches
      FROM job_metrics
    `;
    
    const params = jobIds ? [userId, jobIds] : [userId];
    return db.query(query, params);
  }
}
```

### 2.3 Connection Pool Configuration

```typescript
const dbConfig = {
  // Production configuration
  pool: {
    min: 2,
    max: 20,
    acquireTimeoutMillis: 30000,
    createTimeoutMillis: 30000,
    destroyTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 200,
  },
  
  // Connection-level optimizations
  connection: {
    statement_timeout: '30s',
    lock_timeout: '10s',
    idle_in_transaction_session_timeout: '60s',
  },
  
  // Read replica configuration for analytics
  readReplica: {
    enabled: true,
    endpoints: ['/my-jobs/analytics', '/my-jobs/:id/performance'],
    fallbackToMaster: true,
    maxLag: 5000, // 5 seconds
  }
};
```

## 3. Request Optimization

### 3.1 Request Deduplication

```typescript
class RequestDeduplicator {
  private static pendingRequests = new Map<string, Promise<any>>();
  
  static async deduplicate<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key) as Promise<T>;
    }
    
    const promise = operation().finally(() => {
      this.pendingRequests.delete(key);
    });
    
    this.pendingRequests.set(key, promise);
    return promise;
  }
  
  static generateKey(userId: string, endpoint: string, params: any): string {
    return `${userId}:${endpoint}:${JSON.stringify(params)}`;
  }
}

// Usage in route handlers
app.get('/my-jobs', async (req, res) => {
  const key = RequestDeduplicator.generateKey(
    req.user.uid, 
    '/my-jobs', 
    req.query
  );
  
  const result = await RequestDeduplicator.deduplicate(key, () => 
    jobService.getUserJobsWithMetrics(req.user.uid, req.query)
  );
  
  res.json(result);
});
```

### 3.2 Response Compression

```typescript
const compressionConfig = {
  // Enable compression for large responses
  threshold: 1024, // Only compress responses > 1KB
  level: 6,        // Good balance of speed vs compression ratio
  
  // Selective compression by content type
  filter: (req: Request, res: Response) => {
    const contentType = res.getHeader('content-type') as string;
    return contentType?.includes('application/json') || false;
  },
  
  // Skip compression for small analytics responses
  skipCompression: {
    paths: ['/my-jobs/:id/insights'],
    condition: (res: Response) => {
      const contentLength = res.getHeader('content-length');
      return contentLength && parseInt(contentLength as string) < 2048;
    }
  }
};
```

### 3.3 Field Selection & Response Optimization

```typescript
interface JobResponseOptions {
  includeMetrics?: boolean;
  includeAnalytics?: boolean;
  includeResumes?: boolean;
  fields?: string[];
}

class OptimizedJobResponse {
  static build(job: Job, options: JobResponseOptions = {}) {
    const response: any = {
      id: job.id,
      title: job.title,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
    
    // Conditional field inclusion
    if (options.includeMetrics !== false) {
      response.metrics = job.metrics;
      response.resumeCount = job.resumeCount;
      response.avgMatchScore = job.avgMatchScore;
    }
    
    if (options.includeAnalytics) {
      response.analytics = job.analytics;
    }
    
    if (options.includeResumes) {
      response.associatedResumes = job.associatedResumes;
    }
    
    // Field filtering
    if (options.fields?.length) {
      return this.filterFields(response, options.fields);
    }
    
    return response;
  }
  
  private static filterFields(obj: any, fields: string[]): any {
    const filtered: any = {};
    fields.forEach(field => {
      if (obj.hasOwnProperty(field)) {
        filtered[field] = obj[field];
      }
    });
    return filtered;
  }
}
```

## 4. Pagination & Filtering Performance

### 4.1 Cursor-Based Pagination

```typescript
interface CursorPagination {
  cursor?: string;
  limit: number;
  direction: 'forward' | 'backward';
}

class CursorPaginationHandler {
  static encode(lastItem: any, sortBy: string): string {
    const value = lastItem[sortBy];
    const id = lastItem.id;
    return Buffer.from(`${value}:${id}`).toString('base64');
  }
  
  static decode(cursor: string): { value: any; id: number } {
    const decoded = Buffer.from(cursor, 'base64').toString();
    const [value, id] = decoded.split(':');
    return { value, id: parseInt(id) };
  }
  
  static buildQuery(pagination: CursorPagination, sortBy: string, sortOrder: 'asc' | 'desc') {
    if (!pagination.cursor) {
      return { where: '', params: [] };
    }
    
    const { value, id } = this.decode(pagination.cursor);
    const operator = sortOrder === 'asc' ? '>' : '<';
    const direction = pagination.direction === 'forward' ? operator : operator === '>' ? '<' : '>';
    
    return {
      where: `AND (${sortBy} ${direction} $? OR (${sortBy} = $? AND id ${direction} $?))`,
      params: [value, value, id]
    };
  }
}
```

### 4.2 Filter Index Utilization

```typescript
class FilterOptimizer {
  static optimizeJobFilters(filters: JobFilters): OptimizedFilter {
    // Reorder filters by selectivity (most selective first)
    const selectivityOrder = [
      'userId',    // Always present, highly selective
      'status',    // Medium selectivity
      'dateRange', // Can be highly selective
      'search',    // Usually least selective
    ];
    
    const optimized: OptimizedFilter = {
      whereClause: [],
      params: [],
      indexHints: [],
    };
    
    selectivityOrder.forEach(filterType => {
      if (filters[filterType]) {
        this.addFilterClause(optimized, filterType, filters[filterType]);
      }
    });
    
    return optimized;
  }
  
  private static addFilterClause(
    filter: OptimizedFilter, 
    type: string, 
    value: any
  ) {
    switch (type) {
      case 'userId':
        filter.whereClause.push('user_id = $?');
        filter.params.push(value);
        filter.indexHints.push('idx_jobs_user_status_created');
        break;
        
      case 'status':
        filter.whereClause.push('status = $?');
        filter.params.push(value);
        break;
        
      case 'dateRange':
        filter.whereClause.push('created_at BETWEEN $? AND $?');
        filter.params.push(value.start, value.end);
        break;
        
      case 'search':
        filter.whereClause.push('title ILIKE $? OR description ILIKE $?');
        filter.params.push(`%${value}%`, `%${value}%`);
        filter.indexHints.push('idx_jobs_search_gin');
        break;
    }
  }
}
```

## 5. Background Processing

### 5.1 Job Queue for Heavy Operations

```typescript
import { Queue, Worker } from 'bullmq';

// Analytics computation queue
const analyticsQueue = new Queue('my-jobs-analytics', {
  connection: redisConfig,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Background job types
interface AnalyticsJobData {
  userId: string;
  jobIds?: number[];
  period: string;
  cacheKey: string;
}

interface BulkOperationJobData {
  userId: string;
  operation: string;
  jobIds: number[];
  options: any;
  requestId: string;
}

// Queue heavy operations
class BackgroundJobManager {
  static async scheduleAnalyticsComputation(data: AnalyticsJobData) {
    return analyticsQueue.add('compute-analytics', data, {
      priority: 10,
      delay: 1000, // Small delay to batch similar requests
    });
  }
  
  static async scheduleBulkOperation(data: BulkOperationJobData) {
    return analyticsQueue.add('bulk-operation', data, {
      priority: 5,
      // Higher priority for user-facing operations
    });
  }
  
  static async scheduleInsightsGeneration(jobId: number, userId: string) {
    return analyticsQueue.add('generate-insights', { jobId, userId }, {
      priority: 1,
      delay: 5000, // Lower priority, can wait
    });
  }
}

// Background workers
const analyticsWorker = new Worker('my-jobs-analytics', async (job) => {
  switch (job.name) {
    case 'compute-analytics':
      return handleAnalyticsComputation(job.data);
    case 'bulk-operation':
      return handleBulkOperation(job.data);
    case 'generate-insights':
      return handleInsightsGeneration(job.data);
  }
}, {
  connection: redisConfig,
  concurrency: 5,
});
```

### 5.2 Smart Background Refresh

```typescript
class SmartCacheRefresh {
  private static refreshSchedule = new Map<string, number>();
  
  static async scheduleRefresh(cacheKey: string, computeFunction: Function) {
    const now = Date.now();
    const lastRefresh = this.refreshSchedule.get(cacheKey) || 0;
    
    // Avoid refreshing too frequently
    if (now - lastRefresh < 300000) { // 5 minutes
      return;
    }
    
    this.refreshSchedule.set(cacheKey, now);
    
    // Schedule background refresh
    setImmediate(async () => {
      try {
        const freshData = await computeFunction();
        await redis.setex(cacheKey, 1800, JSON.stringify(freshData));
      } catch (error) {
        console.error('Background refresh failed:', error);
      }
    });
  }
  
  static async warmupCache(userId: string) {
    const commonQueries = [
      () => jobService.getUserJobs(userId, { page: 1, limit: 20 }),
      () => jobService.getAnalytics(userId, '30d'),
    ];
    
    // Warm up cache with common queries
    commonQueries.forEach(query => {
      setImmediate(() => query().catch(console.error));
    });
  }
}
```

## 6. Rate Limiting & Throttling

### 6.1 Tiered Rate Limiting

```typescript
const rateLimitConfig = {
  // Tier-based limits
  tiers: {
    free: {
      '/my-jobs': { rpm: 30, burst: 10 },
      '/my-jobs/analytics': { rpm: 5, burst: 2 },
      '/my-jobs/search': { rpm: 20, burst: 5 },
      '/my-jobs/bulk-operations': { rpm: 2, burst: 1 },
    },
    pro: {
      '/my-jobs': { rpm: 120, burst: 30 },
      '/my-jobs/analytics': { rpm: 20, burst: 10 },
      '/my-jobs/search': { rpm: 60, burst: 20 },
      '/my-jobs/bulk-operations': { rpm: 10, burst: 5 },
    },
    enterprise: {
      '/my-jobs': { rpm: 300, burst: 100 },
      '/my-jobs/analytics': { rpm: 60, burst: 30 },
      '/my-jobs/search': { rpm: 180, burst: 60 },
      '/my-jobs/bulk-operations': { rpm: 30, burst: 15 },
    },
  },
  
  // Adaptive throttling based on load
  adaptive: {
    enabled: true,
    loadThreshold: 0.8, // Throttle at 80% capacity
    throttleRatio: 0.5,  // Reduce limits by 50%
  },
  
  // Circuit breaker for overload protection
  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    resetTimeout: 60000,
  },
};
```

### 6.2 Request Prioritization

```typescript
class RequestPrioritizer {
  private static priorityWeights = {
    // User-facing, real-time operations
    'GET:/my-jobs': 10,
    'POST:/my-jobs': 9,
    'PATCH:/my-jobs/:id': 8,
    
    // Analytics - can be slightly delayed
    'GET:/my-jobs/analytics': 6,
    'GET:/my-jobs/:id/performance': 5,
    
    // Search - interactive but can tolerate delay
    'GET:/my-jobs/search': 7,
    
    // Background operations
    'POST:/my-jobs/bulk-operations': 3,
    'GET:/my-jobs/:id/insights': 2,
  };
  
  static getPriority(method: string, path: string, userTier: string): number {
    const routeKey = `${method}:${path}`;
    const basePriority = this.priorityWeights[routeKey] || 5;
    
    // Boost priority for higher tier users
    const tierMultiplier = {
      'free': 1,
      'pro': 1.2,
      'enterprise': 1.5,
    }[userTier] || 1;
    
    return Math.floor(basePriority * tierMultiplier);
  }
}
```

## 7. Monitoring & Performance Metrics

### 7.1 Key Performance Indicators

```typescript
interface MyJobsPerformanceMetrics {
  // Response time metrics
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  
  // Throughput metrics
  requestsPerSecond: number;
  
  // Cache metrics
  cache: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
  };
  
  // Database metrics
  database: {
    queryTime: number;
    connectionPoolUsage: number;
    slowQueryCount: number;
  };
  
  // Business metrics
  business: {
    jobsCreatedPerHour: number;
    analyticsComputationsPerHour: number;
    searchQueriesPerHour: number;
    errorRate: number;
  };
}
```

### 7.2 Performance Alerting

```typescript
const performanceAlerts = {
  // Response time alerts
  responseTime: {
    warning: 1000,  // 1 second
    critical: 3000, // 3 seconds
  },
  
  // Cache performance alerts
  cacheHitRate: {
    warning: 0.7,  // 70%
    critical: 0.5, // 50%
  },
  
  // Database alerts
  dbConnectionPool: {
    warning: 0.8,  // 80% utilization
    critical: 0.95, // 95% utilization
  },
  
  // Error rate alerts
  errorRate: {
    warning: 0.05,  // 5%
    critical: 0.10, // 10%
  },
};
```

## 8. Implementation Checklist

### Phase 1: Basic Optimizations
- [ ] Implement Redis caching for job listings
- [ ] Add database indexes for common queries
- [ ] Set up connection pooling
- [ ] Implement basic rate limiting

### Phase 2: Advanced Optimizations
- [ ] Implement cursor-based pagination
- [ ] Add request deduplication
- [ ] Set up background job processing
- [ ] Implement smart cache refresh

### Phase 3: Monitoring & Tuning
- [ ] Add performance metrics collection
- [ ] Set up alerting for performance issues
- [ ] Implement adaptive rate limiting
- [ ] Add A/B testing for optimization strategies

### Phase 4: Scaling
- [ ] Implement read replicas for analytics
- [ ] Add CDN for static responses
- [ ] Implement horizontal scaling
- [ ] Add circuit breakers for external services

This performance guide ensures the My Jobs API can handle high loads while maintaining excellent user experience and system reliability.