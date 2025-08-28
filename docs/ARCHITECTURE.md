# EvalMatch System Architecture

## 🏗️ Overview

EvalMatch is a production-ready AI-powered recruitment platform built with a modern, scalable architecture. The system is designed for high availability, security, and performance with comprehensive testing coverage.

## 📊 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Layer                              │
├─────────────────────────────────────────────────────────────┤
│  React Frontend (TypeScript)                               │
│  ├─ shadcn/ui Components                                   │
│  ├─ Tailwind CSS Styling                                   │
│  ├─ Firebase Authentication                                │
│  └─ Wouter Routing                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway Layer                         │
├─────────────────────────────────────────────────────────────┤
│  Express.js Server (Node.js + TypeScript)                  │
│  ├─ Rate Limiting & Security Middleware                    │
│  ├─ Input Validation & Sanitization                        │
│  ├─ Authentication & Authorization                          │
│  └─ Error Handling & Logging                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │  Resume Service │ │   Job Service   │ │Analysis Service ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │  Batch Service  │ │  Admin Service  │ │  User Service   ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                AI Processing Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Multi-Provider AI System                                  │
│  ├─ OpenAI GPT-4 (Primary)                                │
│  ├─ Anthropic Claude (Secondary)                           │
│  └─ Groq (High-speed processing)                           │
│                                                            │
│  AI Operations                                             │
│  ├─ Resume Analysis & Skill Extraction                     │
│  ├─ Job Matching & Scoring                                 │
│  ├─ Bias Detection & Fairness Analysis                     │
│  └─ Interview Question Generation                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │   PostgreSQL    │ │   Redis Cache   │ │ File Storage    ││
│  │   (Primary DB)  │ │ (Performance)   │ │   (Uploads)     ││
│  │                 │ │                 │ │                 ││
│  │ ├─ Users        │ │ ├─ API Cache    │ │ ├─ Resumes      ││
│  │ ├─ Resumes      │ │ ├─ Session Data │ │ └─ Documents    ││
│  │ ├─ Jobs         │ │ └─ AI Results   │ │                 ││
│  │ └─ Analysis     │ │                 │ │                 ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

## 🏛️ Core Components

### 1. Frontend Architecture

#### **Technology Stack**
- **React 18**: Modern React with hooks and concurrent features
- **TypeScript**: Strict type safety with comprehensive type definitions
- **Tailwind CSS**: Utility-first styling with design system
- **shadcn/ui**: High-quality, accessible component library
- **Wouter**: Lightweight routing for SPA navigation
- **Firebase Auth**: User authentication and session management

#### **Key Features**
- **Component Architecture**: Modular, reusable components
- **State Management**: React Context + custom hooks
- **Error Boundaries**: Comprehensive error handling
- **Responsive Design**: Mobile-first, accessible UI
- **Progressive Enhancement**: Works without JavaScript

#### **Directory Structure**
```
client/src/
├── components/        # Reusable UI components
│   ├── ui/           # shadcn/ui base components
│   ├── analysis/     # Analysis-specific components
│   ├── auth/         # Authentication components
│   └── layout/       # Layout components
├── hooks/            # Custom React hooks
├── pages/            # Route components
├── contexts/         # React contexts
└── lib/              # Utility functions
```

### 2. Backend Architecture

#### **Technology Stack**
- **Node.js + Express**: High-performance server runtime
- **TypeScript**: Strict typing with advanced patterns
- **PostgreSQL**: Primary database with ACID compliance
- **Drizzle ORM**: Type-safe database operations
- **Redis**: Caching and session storage
- **Firebase Admin**: Authentication verification

#### **Service Layer Pattern**
```typescript
// Service interface example
export interface ResumeService {
  uploadResume(file: Buffer, metadata: ResumeMetadata): Promise<Result<Resume, ResumeError>>;
  analyzeResume(resumeId: string): Promise<Result<Analysis, AnalysisError>>;
  getResumes(userId: string): Promise<Result<Resume[], DatabaseError>>;
}
```

#### **Result Pattern Implementation**
```typescript
// Type-safe error handling without try/catch
export type Result<T, E = Error> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};

// Usage example
const result = await resumeService.analyzeResume(resumeId);
if (result.success) {
  console.log(result.data); // TypeScript knows this is Analysis
} else {
  console.error(result.error); // TypeScript knows this is AnalysisError
}
```

### 3. AI Processing Layer

#### **Multi-Provider Architecture**
```typescript
interface AIProvider {
  analyzeResume(content: string): Promise<Result<ResumeAnalysis, AIError>>;
  generateQuestions(resume: Resume, job: Job): Promise<Result<Question[], AIError>>;
  detectBias(jobDescription: string): Promise<Result<BiasAnalysis, AIError>>;
}

class TieredAIProvider implements AIProvider {
  constructor(
    private primary: OpenAIProvider,
    private secondary: AnthropicProvider,
    private fallback: GroqProvider
  ) {}
  
  async analyzeResume(content: string): Promise<Result<ResumeAnalysis, AIError>> {
    // Try primary, fallback to secondary, then fallback
    const result = await this.primary.analyzeResume(content);
    if (result.success) return result;
    
    return this.secondary.analyzeResume(content);
  }
}
```

#### **Caching Strategy**
- **L1 Cache**: In-memory for frequently accessed data
- **L2 Cache**: Redis for API responses and AI results  
- **L3 Cache**: Database query result caching
- **TTL Strategy**: Different expiration times by data type

### 4. Database Architecture

#### **Schema Design**
```sql
-- Core entities with optimized relationships
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE resumes (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  content TEXT,
  analyzed_data JSONB,
  file_hash VARCHAR(64) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  analyzed_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE analysis_results (
  id SERIAL PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  resume_id INTEGER REFERENCES resumes(id) ON DELETE CASCADE,
  match_percentage DECIMAL(5,2) NOT NULL,
  analysis_data JSONB NOT NULL,
  confidence_score DECIMAL(5,4),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### **Performance Indexes**
```sql
-- Optimized indexes for common queries
CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_analysis_job_resume ON analysis_results(job_id, resume_id);
CREATE INDEX idx_resumes_file_hash ON resumes(file_hash);
CREATE INDEX idx_analysis_confidence ON analysis_results(confidence_score DESC);
```

## 🔒 Security Architecture

### 1. Input Validation & Sanitization

#### **Multi-Layer Validation**
```typescript
// Request validation pipeline
export class SecurityValidator {
  static validateRequest(req: Request): Result<ValidatedRequest, ValidationError> {
    const sanitizedBody = this.sanitizeObject(req.body);
    const validatedParams = this.validateParams(req.params);
    const cleanedFiles = this.validateFiles(req.files);
    
    return {
      success: true,
      data: { body: sanitizedBody, params: validatedParams, files: cleanedFiles }
    };
  }
  
  static sanitizeString(input: string, options: SanitizeOptions): string {
    // DOMPurify + custom patterns + length limits + encoding
  }
  
  static validateFileContent(buffer: Buffer, expectedType: string): boolean {
    // Magic number validation + content scanning + size limits
  }
}
```

### 2. Authentication & Authorization

#### **Firebase Authentication Integration**
```typescript
// JWT verification middleware
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      id: decodedToken.uid,
      email: decodedToken.email!,
      name: decodedToken.name || 'Unknown'
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
```

### 3. Rate Limiting & DDoS Protection

```typescript
// Intelligent rate limiting
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.path.startsWith('/api/analysis')) return 20; // Analysis endpoints
    if (req.path.startsWith('/api/resumes')) return 50;  // Upload endpoints
    return 100; // General endpoints
  },
  message: { error: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});
```

## ⚡ Performance Architecture

### 1. Caching Strategy

#### **Redis Caching Implementation**
```typescript
export class CacheManager {
  private redis: Redis;
  
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 3600
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const data = await fetcher();
    await this.redis.setex(key, ttl, JSON.stringify(data));
    return data;
  }
  
  // Cache invalidation patterns
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

#### **Cache Hierarchy**
- **API Response Cache**: 5-minute TTL for frequently accessed endpoints
- **AI Analysis Cache**: 1-hour TTL for AI processing results
- **Database Query Cache**: 15-minute TTL for complex queries
- **User Session Cache**: 24-hour TTL for authentication data

### 2. Parallel Processing

#### **Batch Operations**
```typescript
export class BatchProcessor {
  async processResumes(
    resumes: Resume[],
    concurrency: number = 5
  ): Promise<Result<AnalysisResult[], BatchError>> {
    const chunks = this.chunkArray(resumes, concurrency);
    const results: AnalysisResult[] = [];
    
    for (const chunk of chunks) {
      const promises = chunk.map(resume => this.processResume(resume));
      const chunkResults = await Promise.allSettled(promises);
      
      // Handle partial failures gracefully
      for (const result of chunkResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          results.push(result.value.data);
        }
      }
    }
    
    return { success: true, data: results };
  }
}
```

### 3. Database Optimization

#### **Query Optimization**
```typescript
// Optimized queries with proper indexing
export class QueryBuilder {
  static buildAnalysisQuery(filters: AnalysisFilters) {
    return db
      .select({
        id: analysisResults.id,
        matchPercentage: analysisResults.matchPercentage,
        resumeId: analysisResults.resumeId,
        jobId: analysisResults.jobId,
        confidenceScore: analysisResults.confidenceScore,
        resumeFilename: resumes.filename,
        jobTitle: jobs.title,
      })
      .from(analysisResults)
      .innerJoin(resumes, eq(analysisResults.resumeId, resumes.id))
      .innerJoin(jobs, eq(analysisResults.jobId, jobs.id))
      .where(and(
        eq(jobs.userId, filters.userId),
        gte(analysisResults.matchPercentage, filters.minMatch || 0),
        gte(analysisResults.confidenceScore, filters.minConfidence || 0)
      ))
      .orderBy(desc(analysisResults.matchPercentage))
      .limit(filters.limit || 50);
  }
}
```

## 🧪 Testing Architecture

### 1. Test Pyramid Structure

#### **Test Categories (143 total tests)**
- **Unit Tests**: 60-70% (Individual functions, utilities)
- **Integration Tests**: 20-30% (API endpoints, database operations)
- **E2E Tests**: 5-10% (Complete user workflows)
- **Security Tests**: Critical (Input validation, threat protection)
- **Performance Tests**: Critical (Load testing, benchmarks)

### 2. Test Infrastructure

#### **Test Database Strategy**
```typescript
// Isolated test database with automatic cleanup
export class TestDatabase {
  static async setup(): Promise<void> {
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS test_${Date.now()}`);
    await migrate(db, { migrationsFolder: './migrations' });
  }
  
  static async cleanup(): Promise<void> {
    await db.execute(sql`DROP SCHEMA test_${Date.now()} CASCADE`);
  }
}
```

#### **Mock Strategy**
```typescript
// Comprehensive mocking for AI providers
export const mockOpenAI = {
  chat: {
    completions: {
      create: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Mock AI response' } }]
      })
    }
  }
};
```

## 🚀 Deployment Architecture

### 1. Container Strategy

#### **Multi-stage Docker Build**
```dockerfile
# Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Runtime stage
FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

### 2. Environment Configuration

#### **Railway Deployment**
```yaml
# railway.toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"
startCommand = "npm start"

[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[[services]]
name = "evalmatch-app"
source = "."
```

### 3. Health Monitoring

#### **Health Check System**
```typescript
export const healthCheck = {
  '/api/health': () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version,
  }),
  
  '/api/health/detailed': async () => ({
    status: 'healthy',
    services: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      ai_providers: await checkAIProviders(),
    }
  })
};
```

## 📊 Monitoring & Observability

### 1. Metrics Collection

```typescript
// Performance monitoring
export class MetricsCollector {
  static recordAPICall(endpoint: string, duration: number, status: number): void {
    metrics.counter('api_requests_total', { endpoint, status }).inc();
    metrics.histogram('api_request_duration_seconds', { endpoint }).observe(duration);
  }
  
  static recordAIOperation(provider: string, operation: string, tokens: number): void {
    metrics.counter('ai_operations_total', { provider, operation }).inc();
    metrics.histogram('ai_tokens_used', { provider }).observe(tokens);
  }
}
```

### 2. Error Tracking

```typescript
// Comprehensive error logging
export class ErrorLogger {
  static logError(error: Error, context: ErrorContext): void {
    const errorData = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userId: context.userId,
      endpoint: context.endpoint,
      requestId: context.requestId,
    };
    
    // Send to logging service
    logger.error('Application Error', errorData);
  }
}
```

## 🔗 Integration Points

### 1. External Services

#### **AI Provider Integration**
- **OpenAI**: Primary analysis and processing
- **Anthropic**: Secondary validation and bias detection
- **Groq**: High-speed processing for real-time features

#### **Authentication**
- **Firebase Auth**: User authentication and session management
- **JWT Tokens**: Secure API access

#### **Infrastructure**
- **Railway**: Production deployment and hosting
- **PostgreSQL**: Primary data storage
- **Redis**: Caching and session storage

### 2. API Design

#### **RESTful API Standards**
```typescript
// Consistent API response format
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}
```

## 📈 Scalability Considerations

### 1. Horizontal Scaling

#### **Stateless Design**
- All state stored in database or Redis
- No server-side session storage
- Load balancer compatible

#### **Database Scaling**
- Read replicas for query distribution
- Connection pooling for efficiency
- Query optimization with proper indexing

### 2. Performance Optimization

#### **Caching Strategy**
- Multi-level caching (memory, Redis, CDN)
- Cache invalidation patterns
- Cache warming strategies

#### **Resource Management**
- Memory usage monitoring
- Connection pool management
- Garbage collection optimization

---

This architecture provides a solid foundation for a scalable, secure, and maintainable AI-powered recruitment platform with comprehensive testing and monitoring capabilities.