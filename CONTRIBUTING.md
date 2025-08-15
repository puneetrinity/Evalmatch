# Contributing to EvalMatch

Thank you for your interest in contributing to EvalMatch! This guide will help you get started with contributing to our AI-powered recruitment platform.

## 🎯 Quick Overview

EvalMatch is a production-ready platform with enterprise-grade standards. All contributions must maintain our high quality, security, and performance standards.

## 🏗️ Development Setup

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Redis (optional, for caching)
- Git
- OpenAI API key

### Initial Setup

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/your-username/Evalmatch.git
   cd Evalmatch
   npm install
   ```

2. **Environment configuration**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

3. **Database setup**:
   ```bash
   npm run db:push
   npm run test  # Verify setup
   ```

4. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 📋 Contribution Guidelines

### Code Quality Standards

#### 1. **100% Test Coverage Requirement**
All contributions must include comprehensive tests:

- **Unit Tests**: For individual functions and components
- **Integration Tests**: For API endpoints and database operations  
- **Security Tests**: For any security-related changes
- **Performance Tests**: For performance-critical code

```bash
npm test                    # All tests must pass
npm run test:coverage      # Coverage must be >85%
npm run test:security      # Security tests must pass
```

#### 2. **TypeScript Standards**
- Strict TypeScript mode enabled
- No `any` types allowed
- Comprehensive type definitions
- Result pattern for error handling

```typescript
// ✅ Good - Proper typing with Result pattern
async function analyzeResume(file: Buffer): Promise<Result<ResumeAnalysis, AnalysisError>> {
  // Implementation
}

// ❌ Bad - Using any type
function processData(data: any): any {
  // Implementation
}
```

#### 3. **Security Requirements**
- All inputs must be validated using `SecurityValidator`
- SQL injection protection mandatory
- XSS prevention for all user content
- File upload validation required

```typescript
// ✅ Proper input validation
const sanitizedInput = SecurityValidator.sanitizeString(userInput, {
  maxLength: 1000,
  allowNumbers: true
});
```

### Development Workflow

#### 1. **Before Starting**
- Check existing issues and discussions
- Create an issue for significant changes
- Discuss architectural changes with maintainers

#### 2. **Development Process**
- Write tests first (TDD approach)
- Follow existing code patterns
- Update documentation
- Run linting and formatting

```bash
npm run lint              # Code style check
npm run format            # Auto-format code
npm run type-check        # TypeScript validation
```

#### 3. **Commit Standards**
Use conventional commits:

```bash
# Features
feat: add bias detection for job descriptions
feat(api): implement resume batch processing

# Bug fixes  
fix: resolve memory leak in PDF parsing
fix(auth): handle expired Firebase tokens

# Documentation
docs: update API documentation
docs(contributing): add security guidelines

# Tests
test: add integration tests for matching API
test(security): validate file upload sanitization
```

### Pull Request Process

#### 1. **Pre-submission Checklist**

- [ ] All tests pass (`npm test`)
- [ ] Code coverage >85% (`npm run test:coverage`)
- [ ] Security tests pass (`npm run test:security`)
- [ ] Performance benchmarks met (`npm run test:performance`)
- [ ] Documentation updated
- [ ] CHANGELOG.md updated

#### 2. **PR Requirements**

**Title Format**:
```
feat: Brief description of the feature
fix: Brief description of the bug fix
docs: Brief description of documentation changes
```

**PR Description Template**:
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature  
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] All tests passing
- [ ] Performance impact assessed

## Security
- [ ] Input validation implemented
- [ ] Security tests passing
- [ ] No security vulnerabilities introduced

## Documentation
- [ ] Code documented
- [ ] API documentation updated
- [ ] User documentation updated

## Screenshots (if applicable)
```

#### 3. **Review Process**

1. **Automated Checks**: All CI checks must pass
2. **Code Review**: At least one maintainer review required
3. **Security Review**: For security-related changes
4. **Performance Review**: For performance-critical changes

## 🏛️ Architecture Guidelines

### Directory Structure
```
├── client/             # Frontend React application
├── server/             # Backend Express.js application  
├── shared/             # Shared types and utilities
├── tests/              # Comprehensive test suite
└── docs/               # Documentation
```

### Key Architectural Principles

1. **Type Safety**: Comprehensive TypeScript usage
2. **Error Handling**: Result pattern for type-safe errors
3. **Security First**: Input validation and sanitization
4. **Performance**: Caching and optimization by design
5. **Testing**: Test-driven development approach

### API Design Standards

- RESTful API design
- Consistent response formats using `ApiResponse<T>`
- Comprehensive error handling
- Input validation on all endpoints
- Rate limiting and security middleware

## 🧪 Testing Standards

### Test Categories

Our testing pyramid ensures comprehensive coverage:

#### 1. **Unit Tests** (60-70% of tests)
- Individual function testing
- Component testing
- Business logic validation

```typescript
// Example unit test
describe('SecurityValidator', () => {
  it('should sanitize malicious input', () => {
    const maliciousInput = '<script>alert("xss")</script>';
    const result = SecurityValidator.sanitizeString(maliciousInput);
    expect(result).not.toContain('<script>');
  });
});
```

#### 2. **Integration Tests** (20-30% of tests)
- API endpoint testing
- Database integration
- Service integration

```typescript
// Example integration test
describe('Resume API', () => {
  it('should upload and analyze resume', async () => {
    const response = await request(app)
      .post('/api/resumes')
      .attach('file', testPDFBuffer, 'resume.pdf')
      .expect(200);
      
    expect(response.body.resume.analyzedData).toBeDefined();
  });
});
```

#### 3. **Security Tests** (Critical)
- Input validation testing
- Injection attack prevention
- File upload security

#### 4. **Performance Tests** (Critical)  
- Load testing
- Response time validation
- Memory usage testing

### Test Execution

```bash
npm test                     # All tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:security       # Security validation
npm run test:performance    # Performance benchmarks
npm run test:e2e           # End-to-end tests
```

## 🔒 Security Guidelines

### Input Validation
All user inputs must be validated:

```typescript
import { SecurityValidator } from '../shared/security-validation';

// Sanitize all string inputs
const cleanInput = SecurityValidator.sanitizeString(userInput);

// Validate email addresses
const email = SecurityValidator.sanitizeEmail(emailInput);

// Validate file uploads
const isValid = SecurityValidator.validateFileContent(fileBuffer, mimeType);
```

### Database Security
- Use parameterized queries only
- Implement input sanitization
- Apply least privilege principles

### API Security
- Rate limiting on all endpoints
- Authentication middleware
- CORS configuration
- Request size limits

## 📊 Performance Guidelines

### Performance Requirements
- API responses <15 seconds under normal load
- Memory usage <1GB for batch operations
- Support 50+ concurrent users
- Database queries optimized with indexes

### Optimization Techniques
- Redis caching for frequently accessed data
- Parallel processing for batch operations
- Database query optimization
- Memory leak prevention

## 📚 Documentation Standards

### Code Documentation
- JSDoc for all public functions
- Inline comments for complex logic
- Type definitions for all interfaces

### API Documentation
- OpenAPI/Swagger specifications
- Request/response examples
- Error code documentation

### User Documentation
- Clear setup instructions
- Feature usage guides
- Troubleshooting guides

## 🚀 Release Process

### Version Management
- Semantic versioning (semver)
- Changelog maintenance
- Release notes

### Deployment
- Staging environment testing
- Production deployment validation
- Rollback procedures

## 🤝 Community Guidelines

### Communication
- Be respectful and professional
- Provide constructive feedback
- Help fellow contributors

### Issue Reporting
- Use issue templates
- Provide reproduction steps
- Include system information

### Discussions
- Use GitHub Discussions for questions
- Search existing discussions first
- Provide helpful responses

## 🆘 Getting Help

### Resources
- [Architecture Guide](docs/ARCHITECTURE.md)
- [Testing Guide](COMPREHENSIVE_TESTING_GUIDE.md)
- [Security Guide](RUNTIME_SECURITY_ANALYSIS.md)
- [Performance Guide](PHASE_2_PERFORMANCE_COMPLETED.md)

### Contact
- GitHub Issues for bug reports
- GitHub Discussions for questions
- Email: dev@evalmatch.app

## 📄 License

By contributing to EvalMatch, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to EvalMatch! Your contributions help make recruitment more fair, efficient, and intelligent. 🎯