# Input Validation & Security Implementation

## Overview

EvalMatch implements comprehensive defense-in-depth security validation across the entire application stack. This document details the multi-layer security framework that protects against various attack vectors while maintaining 100% security test coverage.

## 🛡️ Security Architecture

### Multi-Layer Protection
```
┌─────────────────────────────────────────┐
│         Client-Side Validation          │
├─────────────────────────────────────────┤
│      API Gateway Input Sanitization     │
├─────────────────────────────────────────┤
│      Business Logic Validation          │
├─────────────────────────────────────────┤
│      Database Security Layer            │
└─────────────────────────────────────────┘
```

### Core Security Features

#### 🔐 **Input Sanitization**
- **DOMPurify Integration**: Enterprise-grade HTML sanitization
- **Custom Pattern Removal**: SQL injection, XSS, command injection protection
- **Character Filtering**: Dangerous character removal with context awareness
- **Length Limits**: Configurable input size restrictions

#### 🗃️ **File Upload Security**
- **Magic Number Validation**: True file type verification beyond extensions
- **Malicious Content Detection**: Pattern-based threat detection
- **Size Limitations**: Configurable file size restrictions (10MB default)
- **Quarantine System**: Suspicious file isolation and investigation

#### 🔍 **Attack Pattern Detection**
- **XSS Prevention**: Script tag removal, event handler sanitization
- **SQL Injection**: Parameterized queries, dangerous pattern removal
- **Path Traversal**: Directory navigation attack prevention
- **Command Injection**: System command pattern detection

## 🔧 Implementation Details

### SecurityValidator Class

```typescript
// Core sanitization with comprehensive options
export class SecurityValidator {
  static sanitizeString(input: unknown, options: {
    maxLength?: number;
    allowNewlines?: boolean;
    preserveSpaces?: boolean;
    allowNumbers?: boolean;
    allowSpecialChars?: boolean;
  } = {}): string {
    // Multi-stage sanitization pipeline
    let sanitized = DOMPurify.sanitize(input, SECURITY_CONFIG);
    sanitized = this.removeDangerousPatterns(sanitized);
    // Additional filtering based on options
    return sanitized.trim();
  }
}
```

### Dangerous Pattern Removal

```typescript
// Comprehensive threat pattern detection
private static removeDangerousPatterns(input: string): string {
  let cleaned = input;
  
  // Script-based attacks
  cleaned = cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleaned = cleaned.replace(/javascript:/gi, '');
  cleaned = cleaned.replace(/vbscript:/gi, '');
  cleaned = cleaned.replace(/on\w+\s*=/gi, '');
  
  // SQL injection patterns
  cleaned = cleaned.replace(/(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b/gi, '');
  cleaned = cleaned.replace(/(')|(\\')|(;)|(--)|(\\|)|(\\*)|(%)|(<)|(>)|(\\{)|(\\})|(\\[)|(\\])/g, '');
  
  // Command injection prevention
  cleaned = cleaned.replace(/(\\||&|;|\\$|`|>|<|\\n|\\r)/g, '');
  
  // Path traversal prevention
  cleaned = cleaned.replace(/\\.\\.\\//g, '');
  cleaned = cleaned.replace(/\\.\\.\\\\/g, '');
  
  return cleaned;
}
```

### File Content Validation

```typescript
// File security with magic number verification
static validateFileContent(buffer: Buffer, expectedMimeType: string, maxSize: number = 10485760): boolean {
  // Size validation
  if (buffer.length > maxSize) return false;
  
  // Magic number validation for file types
  const magicNumbers = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
    'application/msword': [0xD0, 0xCF, 0x11, 0xE0], // DOC
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [0x50, 0x4B, 0x03, 0x04], // DOCX
    'text/plain': null
  };
  
  const expectedMagic = magicNumbers[expectedMimeType];
  if (expectedMagic) {
    const fileHeader = Array.from(buffer.slice(0, expectedMagic.length));
    return expectedMagic.every((byte, index) => fileHeader[index] === byte);
  }
  
  return true;
}
```

## 📊 Security Test Coverage

### Test Categories (83/83 Tests Passing)

#### **Input Validation Tests**
- String sanitization with various attack patterns
- Email validation and normalization  
- Number validation with bounds checking
- Array validation with item limits

#### **File Security Tests**
- Magic number verification for all supported formats
- Malicious file content detection
- File size and type validation
- Upload rate limiting

#### **Attack Prevention Tests**
- XSS attack vector testing (20+ patterns)
- SQL injection prevention (15+ patterns)
- Command injection protection
- Path traversal attack prevention

#### **Advanced Security Tests**
- Password strength validation
- Rate limiting effectiveness
- Content Security Policy validation
- JSON validation with size limits

### Example Security Test

```typescript
describe('Advanced File Security', () => {
  test('should detect and reject malicious PDF content', async () => {
    const maliciousPDF = createMaliciousPDFBuffer();
    
    const response = await request(app)
      .post('/api/resumes')
      .attach('file', maliciousPDF, 'malicious.pdf');
    
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('File validation failed');
  });
  
  test('should handle XSS attempts in job descriptions', async () => {
    const xssAttempt = '<script>alert("xss")</script>Legitimate content';
    
    const response = await request(app)
      .post('/api/job-descriptions')
      .send({ 
        title: 'Test Job',
        description: xssAttempt 
      });
    
    expect(response.status).toBe(200);
    expect(response.body.jobDescription.description).not.toContain('<script>');
    expect(response.body.jobDescription.description).toContain('Legitimate content');
  });
});
```

## 🔐 Authentication & Authorization

### Firebase Integration
- JWT token verification on all protected endpoints
- User session management with automatic refresh
- Role-based access control for admin functions
- Rate limiting per authenticated user

### Middleware Implementation

```typescript
// Authentication middleware with comprehensive validation
export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ 
      error: 'Authentication required',
      code: 'AUTH_TOKEN_MISSING' 
    });
  }
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      id: decodedToken.uid,
      email: decodedToken.email!,
      name: decodedToken.name || 'Unknown'
    };
    
    // Rate limiting per user
    const rateLimitKey = `auth:${decodedToken.uid}`;
    if (!SecurityValidator.checkRateLimit(rateLimitKey, 100, 900000)) {
      return res.status(429).json({ 
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED' 
      });
    }
    
    next();
  } catch (error) {
    return res.status(401).json({ 
      error: 'Invalid authentication token',
      code: 'AUTH_TOKEN_INVALID' 
    });
  }
};
```

## 🚫 Rate Limiting

### Intelligent Rate Limiting
- Different limits for different endpoint types
- User-based and IP-based limiting
- Sliding window implementation
- Automatic cleanup of expired records

```typescript
// Rate limiting with configurable windows
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    if (req.path.startsWith('/api/analysis')) return 20; // Analysis endpoints
    if (req.path.startsWith('/api/resumes')) return 50;  // Upload endpoints
    return 100; // General endpoints
  },
  message: { 
    error: 'Too many requests',
    retryAfter: '15 minutes',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
```

## 🔍 Monitoring & Logging

### Security Event Logging
- All security validation failures logged
- Failed authentication attempts tracked
- File upload security events recorded
- Rate limiting violations monitored

### Alerting System
- Real-time security event notifications
- Pattern-based attack detection
- Automated threat response capabilities
- Security metrics dashboard

## 📈 Performance Impact

### Optimization Strategies
- **Cached Validation Results**: Repeated validation caching
- **Efficient Pattern Matching**: Optimized regex performance
- **Parallel Processing**: Multiple validation checks in parallel
- **Memory Management**: Automatic cleanup of validation artifacts

### Performance Metrics
- Validation overhead: <50ms per request
- File scanning: <2 seconds for 10MB files
- Memory usage: <100MB for concurrent validations
- Cache hit ratio: >80% for repeat validations

## 🔄 Security Updates

### Continuous Improvement
- Regular security pattern updates
- New threat vector additions
- Performance optimization cycles
- Security test expansion

### Maintenance Schedule
- **Weekly**: Security pattern updates
- **Monthly**: Vulnerability assessment
- **Quarterly**: Full security audit
- **Annually**: Penetration testing

## 📚 Related Documentation

- [Security Privacy Report](privacy-report.md) - Privacy compliance and data protection
- [Security Implementation](implementation.md) - Runtime security analysis
- [Testing Guide](../testing/strategy.md) - Security testing procedures
- [Architecture](../ARCHITECTURE.md) - Security architecture overview

---

**Security Status**: ✅ **83/83 Security Tests Passing**  
**Last Updated**: January 2025  
**Security Review**: Current