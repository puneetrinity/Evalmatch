# EvalMatch - AI-Powered Recruitment Platform

> **Comprehensive guide for AI assistants working with this codebase**

EvalMatch is a production-ready AI-powered recruitment platform providing intelligent resume analysis, job matching, bias detection, and interview question generation. Built with enterprise-grade security, performance (143/143 tests passing, 85%+ coverage), and scalability.

---

## Quick Reference

### Key Commands
```bash
npm run dev              # Start development server (React + Express)
npm run build            # Production build (client + server + migrations)
npm test                 # Run all tests
npm run lint             # Lint server code
npm run db:migrate       # Run database migrations
npm run docs:generate    # Generate API documentation
```

### Important Paths
- **Server Entry**: `server/index.ts`
- **Client Entry**: `client/src/main.tsx`
- **Database Schema**: `shared/schema.ts`
- **API Routes**: `server/routes/`
- **Shared Types**: `shared/`
- **Tests**: `tests/`

---

## Git Remotes & Deployment

### Multiple Deployment Targets
```bash
# Main EvalMatch App (evalmatch.app)
git push origin main

# Scholavar Recruitment Corner (recruitment-corner.scholavar.com)
git push new-origin main
```

**Remotes:**
- `origin` → `github.com/puneetrinity/Evalmatch.git` → Railway: evalmatch.app
- `new-origin` → `github.com/puneetrinity/improved-EvalMatch.git` → Railway: recruitment-corner.scholavar.com
- `improved` → `github.com/puneetrinity/improve-Evalmatch.git` (legacy)

**Important**: Same codebase deploys to both environments via Railway.

---

## Project Architecture

### Directory Structure
```
.
├── client/                          # React frontend
│   ├── src/
│   │   ├── components/              # UI components (shadcn/ui based)
│   │   │   ├── analysis/            # Analysis visualization
│   │   │   ├── auth/                # Authentication UI
│   │   │   ├── credits/             # Credit management
│   │   │   ├── layout/              # Layout components
│   │   │   ├── onboarding/          # User onboarding
│   │   │   └── ui/                  # shadcn/ui primitives
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── use-analysis.ts      # Analysis operations
│   │   │   ├── use-auth-simple.tsx  # Firebase auth hook
│   │   │   ├── use-credits.ts       # Credit management
│   │   │   ├── use-job-descriptions.ts
│   │   │   ├── use-resumes.ts
│   │   │   └── useBatchManager.ts   # Batch processing (35KB)
│   │   ├── contexts/                # React contexts
│   │   ├── lib/                     # Client utilities
│   │   │   ├── firebase.ts          # Firebase client config
│   │   │   ├── error-handling.ts    # Error management
│   │   │   ├── storage-manager.ts   # Client-side storage
│   │   │   └── queryClient.ts       # TanStack Query config
│   │   ├── pages/                   # Route pages
│   │   └── styles/                  # CSS styles
│   └── public/                      # Static assets
│
├── server/                          # Express backend
│   ├── index.ts                     # Main server entry (18KB)
│   ├── routes/                      # API endpoints
│   │   ├── analysis.ts              # /api/analysis/* (38KB)
│   │   ├── resumes.ts               # /api/resumes/* (24KB)
│   │   ├── jobs.ts                  # /api/jobs/* (16KB)
│   │   ├── batches.ts               # /api/batches/*
│   │   ├── credits.ts               # /api/credits/* (24KB)
│   │   ├── tokens.ts                # /api/tokens/*
│   │   ├── admin.ts                 # /api/admin/* (40KB)
│   │   ├── auth-tracking.ts         # Auth tracking
│   │   ├── health.ts                # Health checks (19KB)
│   │   ├── user.ts                  # User management
│   │   └── webhooks.ts              # External webhooks
│   ├── services/                    # Business logic layer
│   │   ├── analysis-service.ts      # Core analysis logic (46KB)
│   │   ├── batch-service.ts         # Batch processing (34KB)
│   │   ├── credit-service.ts        # Credit management (32KB)
│   │   ├── job-service.ts           # Job operations (24KB)
│   │   ├── resume-service.ts        # Resume operations (24KB)
│   │   ├── token-usage.ts           # Token tracking
│   │   └── embedding-service.ts     # Semantic embeddings
│   ├── lib/                         # Core utilities (75+ files)
│   │   ├── groq.ts                  # Groq AI integration (83KB)
│   │   ├── openai.ts                # OpenAI integration (69KB)
│   │   ├── anthropic.ts             # Anthropic integration (62KB)
│   │   ├── hybrid-match-analyzer.ts # Ensemble AI scoring (71KB)
│   │   ├── document-parser.ts       # PDF/DOCX parsing (45KB)
│   │   ├── secure-upload.ts         # File security (40KB)
│   │   ├── skill-processor.ts       # Skill extraction
│   │   ├── bias-detection.ts        # Bias analysis
│   │   ├── enhanced-scoring.ts      # Match scoring
│   │   ├── circuit-breaker.ts       # Resilience patterns
│   │   ├── redis-cache.ts           # Redis caching
│   │   ├── batch-processor.ts       # Batch operations
│   │   └── firebase-admin.ts        # Firebase server SDK
│   ├── middleware/                  # Express middleware
│   │   ├── auth.ts                  # Firebase token verification
│   │   ├── health-checks.ts         # Railway health (78KB)
│   │   ├── input-validation.ts      # Zod validation (22KB)
│   │   ├── global-error-handler.ts  # Error handling
│   │   ├── rate-limiter.ts          # API rate limiting
│   │   └── batch-validation.ts      # Batch request validation
│   ├── ai/                          # AI provider abstraction
│   │   ├── providers/               # Provider implementations
│   │   ├── provider-registry.ts     # Provider management
│   │   └── provider-router.ts       # Request routing
│   ├── config/                      # Configuration
│   │   ├── unified-config.ts        # Central config (22KB)
│   │   ├── swagger-config.ts        # API documentation
│   │   └── db-config.ts             # Database config
│   ├── database/                    # Database layer
│   │   └── index.ts                 # Drizzle connection (57KB)
│   ├── migrations/                  # SQL migrations
│   ├── services/                    # Business services
│   ├── workers/                     # Background workers
│   └── types/                       # Server-specific types
│
├── shared/                          # Shared code (client + server)
│   ├── schema.ts                    # Drizzle DB schema (32KB, 18 tables)
│   ├── api-contracts.ts             # API type contracts
│   ├── errors.ts                    # Error class hierarchy
│   ├── result-types.ts              # Result<T,E> pattern
│   ├── security-validation.ts       # Security validators
│   ├── type-guards.ts               # Runtime type guards
│   ├── env-validation.ts            # Environment validation
│   └── runtime-validation.ts        # Runtime checks
│
├── sdks/typescript/                 # TypeScript SDK
│   ├── src/                         # SDK source
│   ├── package.json                 # SDK dependencies
│   └── README.md                    # SDK documentation
│
├── tests/                           # Test suite (143+ tests)
│   ├── unit/                        # Unit tests
│   │   ├── server/                  # Server unit tests
│   │   ├── shared/                  # Shared code tests
│   │   └── hooks/                   # React hook tests
│   ├── integration/                 # Integration tests
│   │   ├── api/                     # API integration
│   │   ├── analysis-parity.test.ts  # AI consistency
│   │   └── firebase-auth-integration.test.ts
│   ├── e2e/                         # End-to-end tests
│   ├── security/                    # Security tests (83 tests)
│   ├── performance/                 # Performance benchmarks
│   ├── load/                        # Load testing
│   ├── fixtures/                    # Test fixtures
│   └── helpers/                     # Test utilities
│
├── scripts/                         # Development scripts
│   ├── deploy-migrations.js         # Migration deployment
│   ├── comprehensive-test-runner.js # Test orchestration
│   ├── performance-monitor.js       # Performance tracking
│   └── railway-monitor.js           # Railway monitoring
│
├── docs/                            # Documentation
├── .github/workflows/               # CI/CD pipelines
│   ├── ci.yml                       # Main CI
│   ├── railway-deploy.yml           # Railway deployment
│   └── typescript-sdk-ci.yml        # SDK CI
└── Dockerfile.railway               # Railway container config
```

---

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite 7** for build tooling
- **Tailwind CSS 3** for styling
- **shadcn/ui** component library (Radix primitives)
- **TanStack Query** for data fetching
- **Wouter** for routing
- **Recharts** for data visualization
- **Firebase** client SDK for auth

### Backend
- **Express.js** with TypeScript
- **Drizzle ORM** with PostgreSQL
- **Firebase Admin SDK** for auth verification
- **Multer** for file uploads
- **Redis** (ioredis) for caching
- **BullMQ** for job queues
- **Pino** for structured logging
- **Swagger/OpenAPI** for API docs

### AI Integration
- **OpenAI** (GPT-4) - Primary provider
- **Anthropic** (Claude) - Secondary provider
- **Groq** (LLaMA) - High-speed processing
- **Xenova Transformers** - Local embeddings

### Database Schema (18 Tables)
```typescript
// Core tables (shared/schema.ts)
users                    // User accounts
userIdentityMapping      // OAuth identity mapping
resumes                  // Resume storage
jobDescriptions          // Job postings
analysisResults          // Match analysis results
interviewQuestions       // Generated questions

// Skill system
skillCategories          // Skill taxonomy
skillsTable              // Individual skills
skillMemory              // Learned skill patterns
skillMemoryStats         // Skill statistics
skillPromotionLog        // Skill learning log

// Usage & billing
userCredits              // Credit balance
creditTransactions       // Credit history
userApiLimits            // API rate limits
apiCallLogs              // API usage tracking
userTokens               // API tokens
usageStatistics          // Usage metrics
aiTokenUsageLogs         // AI token consumption
```

---

## Core Patterns & Conventions

### 1. Result Pattern (NO try/catch for business logic)
```typescript
// From shared/result-types.ts
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Usage pattern
async function analyzeResume(file: File): Promise<Result<AnalysisData, AnalysisError>> {
  const validationResult = validateFile(file);
  if (!validationResult.success) {
    return { success: false, error: validationResult.error };
  }

  const data = await processFile(file);
  return { success: true, data };
}

// Consuming results
const result = await analyzeResume(file);
if (!result.success) {
  // Handle error with full type info
  logger.error('Analysis failed', { error: result.error });
  return;
}
// result.data is fully typed here
```

### 2. Error Handling Hierarchy
```typescript
// From shared/errors.ts - 7 specialized error classes
import {
  ValidationError,      // HTTP 400 - Bad input
  AuthenticationError,  // HTTP 401 - Auth failed
  AuthorizationError,   // HTTP 403 - No permission
  NotFoundError,        // HTTP 404 - Resource missing
  ConflictError,        // HTTP 409 - State conflict
  RateLimitError,       // HTTP 429 - Too many requests
  ServiceError          // HTTP 500 - Internal error
} from '../shared/errors';

// Each error includes:
// - Timestamp
// - Error code
// - Context details
// - HTTP status mapping
```

### 3. Input Validation with Zod
```typescript
// All external input validated with Zod schemas
import { z } from 'zod';
import { createInsertSchema } from 'drizzle-zod';

// Database schema generates Zod validators
const insertResumeSchema = createInsertSchema(resumes);

// Custom validation schemas
const analysisRequestSchema = z.object({
  resumeId: z.string().uuid(),
  jobId: z.string().uuid(),
  options: z.object({
    includeQuestions: z.boolean().default(false),
    biasCheck: z.boolean().default(true)
  }).optional()
});
```

### 4. Service Layer Pattern
```typescript
// Routes delegate to services (thin controllers)
// server/routes/analysis.ts
router.post('/analyze', async (req, res) => {
  const result = await analysisService.performAnalysis(req.body);
  if (!result.success) {
    throw result.error;
  }
  res.json(result.data);
});

// server/services/analysis-service.ts
class AnalysisService {
  async performAnalysis(input: AnalysisInput): Promise<Result<Analysis>> {
    // Business logic here
    // Uses other services, AI providers, database
  }
}
```

### 5. AI Provider Abstraction
```typescript
// Multi-provider with fallback
// server/ai/provider-router.ts
const providerRouter = new ProviderRouter([
  { provider: openaiProvider, priority: 1 },
  { provider: anthropicProvider, priority: 2 },
  { provider: groqProvider, priority: 3 }
]);

// Automatic fallback on failure
const result = await providerRouter.route(request);

// Hybrid scoring (70% LLM, 30% ML)
// server/lib/hybrid-match-analyzer.ts
const score = weightedAverage(llmScore * 0.7, mlScore * 0.3);
```

### 6. Database Operations (Drizzle ORM)
```typescript
// Type-safe queries
import { db } from '../database';
import { resumes, analysisResults } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

// Insert
const [newResume] = await db.insert(resumes)
  .values({ userId, content, fileName })
  .returning();

// Query with joins
const results = await db.select()
  .from(analysisResults)
  .leftJoin(resumes, eq(analysisResults.resumeId, resumes.id))
  .where(eq(analysisResults.userId, userId))
  .orderBy(desc(analysisResults.createdAt));
```

---

## Development Workflow

### Starting Development
```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Fill in: DATABASE_URL, PR_OPEN_API_KEY, VITE_FIREBASE_* vars

# 3. Run migrations
npm run db:migrate

# 4. Start dev server
npm run dev
# Opens React on http://localhost:5173
# API on http://localhost:5000
```

### Running Tests
```bash
# All tests
npm test

# Specific test suites
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e          # End-to-end (Playwright)
npm run test:security     # Security validation
npm run test:performance  # Performance benchmarks
npm run test:load         # Load testing

# With coverage
npm run test:unit:coverage

# Memory-optimized (for CI)
npm run test:memory-optimized
```

### Building for Production
```bash
# Full production build
npm run build
# Creates:
# - dist/ (client bundle)
# - build/ (server bundle)
# - build/migrations/ (DB migrations)

# Start production
npm start
```

### Database Operations
```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Dry run (preview changes)
npm run db:migrate:dry

# Interactive DB studio
npm run db:studio
```

### Code Quality
```bash
# Linting
npm run lint              # Check for issues
npm run lint:fix          # Auto-fix issues

# Type checking
npm run check             # TypeScript compilation check

# API documentation
npm run docs:generate     # Generate Swagger docs
npm run docs:validate     # Validate API specs
```

---

## Environment Configuration

### Required Variables
```bash
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:pass@host:5432/evalmatch"

# AI Providers (at least one required)
PR_OPEN_API_KEY="sk-..."           # OpenAI API key
PR_ANTHROPIC_API_KEY="sk-ant-..."  # Optional: Anthropic
PR_GROQ_API_KEY="gsk_..."          # Optional: Groq

# Firebase Auth
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="project.firebaseapp.com"
VITE_FIREBASE_PROJECT_ID="project-id"
FIREBASE_SERVICE_ACCOUNT_KEY_PATH="./serviceAccountKey.json"
```

### Optional Performance Variables
```bash
# Redis caching (50% API reduction)
REDIS_URL="redis://localhost:6379"

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL="info"  # debug, info, warn, error
NODE_ENV="development"  # or production
```

---

## API Endpoints Structure

### Authentication
All authenticated endpoints require Firebase JWT token:
```typescript
Authorization: Bearer <firebase-jwt-token>
```

### Main Routes
```
POST   /api/resumes/upload           # Upload resume (PDF/DOCX/TXT)
GET    /api/resumes                   # List user resumes
DELETE /api/resumes/:id              # Delete resume

POST   /api/jobs                      # Create job description
GET    /api/jobs                      # List job descriptions
PUT    /api/jobs/:id                  # Update job
DELETE /api/jobs/:id                  # Delete job

POST   /api/analysis/analyze          # Perform match analysis
GET    /api/analysis                  # List analysis history
GET    /api/analysis/:id             # Get analysis details

POST   /api/batches                   # Create batch analysis
GET    /api/batches/:id/status       # Check batch status

GET    /api/credits/balance           # Get credit balance
GET    /api/credits/transactions      # Transaction history

GET    /api/health                    # Health check
GET    /api/health/detailed          # Detailed health metrics
```

### Swagger Documentation
API docs available at `/api-docs` when running in development mode.

---

## Performance Optimizations

### Server-Side
- **Redis Caching**: 50% API call reduction, configurable TTL
- **Parallel Processing**: 10x batch operation speed
- **Circuit Breakers**: Automatic failover for AI providers
- **Connection Pooling**: Database connection management
- **Memory Optimization**: <1GB for large batch operations
- **Request Deduplication**: Prevents duplicate API calls

### Client-Side
- **TanStack Query**: Automatic caching and revalidation
- **Code Splitting**: Vite automatic chunk splitting
- **Prefetching**: Manifest-based chunk prefetch
- **IndexedDB**: Large data persistence
- **Optimistic Updates**: Immediate UI feedback

### Database
- **12 Performance Indexes**: Optimized for common queries
- **Composite Indexes**: Complex query optimization
- **Query Planning**: Efficient JOIN strategies

---

## Security Features

### Input Validation (83/83 security tests passing)
- Zod schema validation for all inputs
- XSS protection (DOMPurify)
- SQL injection prevention (Drizzle ORM)
- File type verification
- Content size limits
- Malicious content scanning

### Authentication
- Firebase JWT token verification
- Server-side token validation
- Rate limiting per user
- API token management

### Data Privacy
- GDPR-compliant data handling
- Audit logging for compliance
- Secure file storage
- Data encryption at rest

---

## Common Development Tasks

### Adding a New API Endpoint
1. Define Zod schema in `shared/` or route file
2. Create route handler in `server/routes/`
3. Implement business logic in `server/services/`
4. Add tests in `tests/integration/`
5. Update Swagger documentation

### Adding a New AI Provider
1. Implement provider in `server/ai/providers/`
2. Register in `server/ai/provider-registry.ts`
3. Configure routing in `server/ai/provider-router.ts`
4. Add fallback logic
5. Test with integration tests

### Database Schema Changes
1. Modify `shared/schema.ts`
2. Run `npm run db:generate` to create migration
3. Review generated SQL in `server/migrations/`
4. Test migration: `npm run db:migrate:dry`
5. Apply: `npm run db:migrate`

### Adding Frontend Components
1. Create component in `client/src/components/`
2. Use shadcn/ui primitives from `client/src/components/ui/`
3. Add hooks in `client/src/hooks/` if needed
4. Write tests in `tests/components/`
5. Follow Tailwind CSS conventions

---

## CI/CD Pipeline

### GitHub Actions Workflows

**ci.yml** - Main CI pipeline:
- Runs on every push/PR
- Linting and type checking
- Unit and integration tests
- Security scanning
- Coverage reporting

**railway-deploy.yml** - Railway deployment:
- Triggered on main branch
- Builds Docker image
- Deploys to Railway
- Runs health checks

**typescript-sdk-ci.yml** - SDK CI:
- SDK-specific tests
- Bundle size monitoring
- NPM publish preparation

### Pre-commit Hooks
The project uses automated quality gates before commits.

---

## Debugging & Monitoring

### Logging (Pino)
```typescript
import { logger } from '../config/logger';

logger.info('Analysis started', { resumeId, jobId });
logger.error('Analysis failed', { error, context });
logger.debug('Cache hit', { key, ttl });
```

### Health Checks
```bash
# Basic health
curl http://localhost:5000/api/health

# Detailed metrics
curl http://localhost:5000/api/health/detailed

# Railway-specific
curl http://localhost:5000/api/health/railway
```

### Performance Monitoring
- Memory monitor: `server/lib/memory-monitor.ts`
- Metrics collector: `server/lib/metrics-collector.ts`
- Performance middleware: `server/middleware/performance.ts`

---

## SDK Development

The TypeScript SDK (`sdks/typescript/`) provides a client library for external integration:

```bash
cd sdks/typescript
npm install
npm test
npm run build
```

**Features:**
- Type-safe API client
- Request deduplication
- Circuit breaker pattern
- Multi-layer caching
- Error handling with context

---

## Important Conventions

### DO
- Use Result pattern for error handling
- Validate all inputs with Zod
- Write tests for new features (85%+ coverage)
- Use services for business logic
- Follow existing file naming conventions
- Add comprehensive logging
- Handle AI provider failures gracefully

### DON'T
- Use try/catch for business logic (use Result pattern)
- Store secrets in code (use environment variables)
- Skip input validation
- Create circular dependencies between modules
- Modify production data directly
- Ignore TypeScript errors
- Deploy without running tests

---

## Troubleshooting

### Common Issues

**Database Connection Issues**
```bash
# Check DATABASE_URL is correct
# Ensure PostgreSQL is running
# Test connection:
npm run db:studio
```

**AI Provider Errors**
```bash
# Check API keys in .env
# Verify rate limits haven't been exceeded
# Check circuit breaker state in logs
```

**Build Failures**
```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install

# Check TypeScript errors
npm run check
```

**Test Failures**
```bash
# Run in isolation
npm run test:unit -- --runInBand

# Check for memory issues
npm run test:memory-optimized
```

---

## Resources

- **README.md** - Project overview and quick start
- **CONTRIBUTING.md** - Contribution guidelines
- **docs/** - Detailed documentation
- **CHANGELOG.md** - Version history
- **API Docs** - http://localhost:5000/api-docs (dev mode)

---

*Last updated: November 2025 | Tests: 143/143 passing | Coverage: 85%+*
