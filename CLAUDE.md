# EvalMatch Project Documentation & Development Guide

> **Comprehensive guide for AI-powered recruitment platform development**

## Git Remotes
This repository has multiple remotes configured:

- **origin**: `https://github.com/puneetrinity/Evalmatch.git`
  - Main Evalmatch repository
  - Deployed to: `evalmatch.app` on Railway

- **improved**: `https://github.com/puneetrinity/improve-Evalmatch.git`
  - Improved Evalmatch repository (older remote name)
  
- **new-origin**: `https://github.com/puneetrinity/improved-EvalMatch.git`
  - Current improved Evalmatch repository
  - Deployed to: `recruitment-corner.scholavar.com` on Railway

## Deployment Instructions

### For Scholavar Recruitment Corner
When pushing changes for Scholavar recruitment corner:
```bash
git push new-origin main
```
This pushes to the `improved-EvalMatch` repository which is deployed to `recruitment-corner.scholavar.com`

### For Main Evalmatch App
When pushing changes for the main Evalmatch app:
```bash
git push origin main
```
This pushes to the main `Evalmatch` repository which is deployed to `evalmatch.app`

## Important Notes
- Both applications are deployed on Railway
- The same local codebase is used for both deployments
- Use the appropriate remote when pushing changes based on which app you want to update

---

## 🏗️ **Key Architectural Patterns**

### **Core System Patterns**
- **Result Pattern**: Sophisticated `Result<T, E>` pattern instead of try/catch for predictable error handling
- **Type Safety**: Extensive TypeScript with custom error classes and Zod validation
- **AI Abstraction**: Multi-provider AI setup (OpenAI, Anthropic, Groq) with intelligent fallback strategies
- **Performance Focus**: Redis caching and parallel processing implementations

### **SDK Architecture Patterns**
- **Circuit Breaker Pattern**: Resilient service calls with failure thresholds (5 failures) and 60s recovery timeout
- **Interceptor Chain**: Middleware pattern for request/response processing with authentication, timing, and debug logging
- **Request Deduplication**: Promise coalescence to prevent duplicate API calls (prevents 90%+ of duplicates)
- **Multi-layer Caching**: Memory + IndexedDB with TTL-based expiration and LRU eviction

### **Error Handling Philosophy**
- **Context-Rich Errors**: Every error includes request ID, timing, circuit breaker state, and recovery actions
- **Graceful Degradation**: Systems continue operating with reduced functionality when services fail
- **Proactive Error Prevention**: Circuit breakers and retry logic with exponential backoff [100ms, 500ms, 1s, 2s, 5s]
- **Developer-Friendly Messages**: Errors include actionable guidance ("Check your plan limits at dashboard.evalmatch.com/billing")

---

## 🎯 **Specific Project Context**

### **Document Processing Architecture**
- **Resume/Job Description Parsing**: Secure PDF/DOCX processing with validation
- **Security Validation**: Input sanitization, file type verification, content scanning
- **Multi-format Support**: PDF, DOCX, TXT with consistent extraction patterns
- **Performance Optimization**: Parallel processing for batch operations

### **Database Architecture**
- **Drizzle ORM**: Type-safe database operations with PostgreSQL
- **Schema Structure**: Users, resumes, job_descriptions, analyses, batches with proper foreign keys
- **Migration Strategy**: Versioned migrations with rollback support
- **Connection Management**: Pooling and retry logic for Railway PostgreSQL

### **Testing Infrastructure**
- **Comprehensive Coverage**: 74+ unit tests with 83%+ coverage (Target: 85%+)
- **Testing Strategy**: Unit (Vitest), Integration (Real DB), MSW for API mocking
- **Mock Service Worker**: Realistic API testing without actual network calls
- **Performance Testing**: Bundle size monitoring, request timing benchmarks

### **Deployment Patterns**
- **Railway-Specific**: Multiple remotes for different environments
- **Environment Management**: Separate configs for production vs staging
- **Health Monitoring**: Custom health checks for Railway infrastructure
- **Database Migration**: Safe schema changes in production Railway environment

---

## 🔧 **Code Standards & Patterns**

### **Result Type System**
```typescript
// Preferred pattern throughout codebase
export type Result<T, E = Error> = {
  success: true;
  data: T;
} | {
  success: false;
  error: E;
};

// Usage example
async function processResume(file: File): Promise<Result<ResumeData, ProcessingError>> {
  // Implementation returns Result instead of throwing
}
```

### **AI Integration Patterns**
- **Provider Fallback Chain**: Primary → Secondary → Tertiary provider switching
- **Cost Optimization**: Intelligent routing based on request complexity and user tier
- **Response Caching**: AI response caching to reduce API costs (80%+ cache hit rate)
- **Performance Tiering**: Different AI providers for different user subscription levels

### **File Organization Standards**
```
├── server/                 # Backend API and services
│   ├── lib/               # Core business logic
│   ├── routes/            # API endpoints
│   ├── services/          # Business services
│   └── middleware/        # Request processing
├── client/                # Frontend React application
│   ├── src/components/    # Reusable UI components
│   ├── src/hooks/         # Custom React hooks
│   └── src/lib/           # Client-side utilities
├── shared/                # Shared types and utilities
├── sdks/typescript/       # SDK development
└── tests/                 # Comprehensive test suite
```

### **Testing Requirements**
- **Unit Tests**: All core business logic must have unit tests (85%+ coverage)
- **Integration Tests**: Database operations and API endpoints
- **MSW Integration**: All external API calls mocked with realistic responses
- **Performance Tests**: Bundle size limits (<50KB for SDK), request timing benchmarks

---

## ⚡ **Performance & Optimization Standards**

### **Bundle Optimization**
- **Tree-shaking**: Enabled with `sideEffects: false` for optimal bundle sizes
- **Multi-format Builds**: ESM, CJS, UMD with proper type definitions
- **Size Monitoring**: Automated alerts when bundles exceed 50KB threshold
- **Source Maps**: Generated for debugging in development

### **Caching Strategies**
- **API Response Caching**: Redis for server-side, Memory + IndexedDB for client-side
- **Cache Invalidation**: TTL-based with smart invalidation on data changes
- **Cache Performance**: Monitor hit rates (target: 80%+ for repeated requests)
- **Offline Support**: Progressive Web App capabilities with cache fallbacks

### **Request Optimization**
- **Deduplication**: Prevent duplicate API calls within same request cycle
- **Batch Processing**: Group multiple operations for efficiency
- **Compression**: Response compression and optimal payload sizes
- **Connection Pooling**: Database and external API connection management

---

## 🛡️ **Security & Compliance Standards**

### **Data Protection**
- **Input Validation**: Zod schemas for all external inputs
- **File Security**: Virus scanning, file type verification, size limits
- **Authentication**: Firebase Auth with proper token validation
- **Authorization**: Role-based access control with proper permissions

### **Enterprise Readiness**
- **Compliance Support**: GDPR, SOX, HIPAA considerations built into architecture
- **Audit Logging**: Comprehensive logging for compliance and debugging
- **Security Scanning**: Dependency vulnerability checks in CI/CD
- **Supply Chain Security**: NPM provenance and trusted dependency management

---

## 🚀 **Development Workflow Standards**

### **Quality Gates**
- **Pre-commit Hooks**: Automated linting, type checking, test running
- **CI/CD Pipeline**: Comprehensive testing, security scanning, automated deployments
- **Performance Monitoring**: Automated regression detection and alerting
- **Code Review**: Required for all changes with architectural review for major changes

### **Documentation Requirements**
- **API Documentation**: Auto-generated with 100% coverage requirement
- **Interactive Examples**: All SDK features must have working CodeSandbox examples
- **Migration Guides**: Required for any breaking changes
- **Performance Impact**: Document performance implications of architectural decisions

### **Multi-Repository Strategy**
- **SDK Development**: Independent versioning and release cycles from main application
- **Cross-Repository Testing**: Integration tests across main app and SDK
- **Documentation Sync**: Keep SDK docs aligned with main application features
- **Dependency Management**: Careful coordination of shared dependencies

---

## 📋 **Development Commands & Workflows**

### **Common Development Tasks**
```bash
# Run full test suite
npm test

# Start development with hot reload
npm run dev

# Build for production
npm run build

# Run type checking
npm run type-check

# Run linting
npm run lint

# Generate API documentation
npm run docs:generate
```

### **SDK Development Workflow**
```bash
# Navigate to SDK directory
cd sdks/typescript

# Install dependencies
npm install

# Run SDK-specific tests
npm test

# Build SDK for distribution
npm run build

# Test SDK integration with main app
npm run test:integration
```