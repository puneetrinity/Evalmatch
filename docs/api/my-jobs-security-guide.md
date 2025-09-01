# My Jobs API Security Implementation Guide

## Overview

This guide outlines comprehensive security measures for the My Jobs API, addressing authentication, authorization, data protection, and threat mitigation while maintaining compliance with industry standards.

## 1. Authentication & Authorization

### 1.1 Multi-Layer Authentication

```typescript
interface AuthenticationLayer {
  // Layer 1: Firebase JWT Validation
  firebase: {
    tokenValidation: boolean;
    audienceValidation: string[];
    issuerValidation: string;
    algorithmValidation: string[];
  };
  
  // Layer 2: API Token Authentication (for SDK)
  apiToken: {
    tokenFormat: 'bearer' | 'api-key';
    rateLimitByToken: boolean;
    tokenRotation: boolean;
    tokenScoping: string[];
  };
  
  // Layer 3: Session-based Authentication (for direct API)
  session: {
    sessionTimeout: number;
    sessionRotation: boolean;
    concurrentSessionLimit: number;
  };
}

class MyJobsAuthManager {
  async validateRequest(req: Request): Promise<AuthResult> {
    // Extract authentication info
    const firebaseToken = this.extractFirebaseToken(req);
    const apiToken = this.extractApiToken(req);
    const sessionId = this.extractSessionId(req);
    
    // Multi-layer validation
    const authResults = await Promise.allSettled([
      this.validateFirebaseToken(firebaseToken),
      this.validateApiToken(apiToken),
      this.validateSession(sessionId),
    ]);
    
    // Require at least one successful authentication method
    const validAuth = authResults.find(result => 
      result.status === 'fulfilled' && result.value.valid
    );
    
    if (!validAuth) {
      throw new UnauthorizedError('No valid authentication method');
    }
    
    return validAuth.value;
  }
  
  private async validateFirebaseToken(token?: string): Promise<AuthResult> {
    if (!token) throw new Error('No Firebase token');
    
    try {
      const decodedToken = await admin.auth().verifyIdToken(token, true);
      
      // Additional security checks
      await this.checkTokenFreshness(decodedToken);
      await this.checkUserStatus(decodedToken.uid);
      
      return {
        valid: true,
        userId: decodedToken.uid,
        email: decodedToken.email,
        tier: await this.getUserTier(decodedToken.uid),
        permissions: await this.getUserPermissions(decodedToken.uid),
      };
    } catch (error) {
      throw new UnauthorizedError('Invalid Firebase token');
    }
  }
}
```

### 1.2 Fine-Grained Authorization

```typescript
interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

interface Role {
  name: string;
  permissions: Permission[];
  hierarchyLevel: number;
}

class MyJobsAuthorizationManager {
  private static roleHierarchy: Role[] = [
    {
      name: 'job_viewer',
      hierarchyLevel: 1,
      permissions: [
        { resource: 'job', action: 'read', conditions: { owner: true } },
        { resource: 'analytics', action: 'read', conditions: { owner: true, basic: true } },
      ]
    },
    {
      name: 'job_editor',
      hierarchyLevel: 2,
      permissions: [
        { resource: 'job', action: '*', conditions: { owner: true } },
        { resource: 'resume_association', action: '*', conditions: { owner: true } },
        { resource: 'analytics', action: 'read', conditions: { owner: true } },
      ]
    },
    {
      name: 'job_admin',
      hierarchyLevel: 3,
      permissions: [
        { resource: '*', action: '*', conditions: { owner: true } },
        { resource: 'bulk_operations', action: '*', conditions: { owner: true } },
        { resource: 'insights', action: 'read', conditions: { owner: true } },
      ]
    }
  ];
  
  async authorize(
    userId: string, 
    resource: string, 
    action: string, 
    context: Record<string, any> = {}
  ): Promise<boolean> {
    const userRole = await this.getUserRole(userId);
    const userTier = await this.getUserTier(userId);
    
    // Check role-based permissions
    const hasRolePermission = await this.checkRolePermission(
      userRole, resource, action, context
    );
    
    // Check tier-based permissions
    const hasTierPermission = await this.checkTierPermission(
      userTier, resource, action, context
    );
    
    // Check resource ownership
    const ownsResource = await this.checkResourceOwnership(
      userId, resource, context.resourceId
    );
    
    return hasRolePermission && hasTierPermission && ownsResource;
  }
  
  private async checkResourceOwnership(
    userId: string, 
    resource: string, 
    resourceId: any
  ): Promise<boolean> {
    switch (resource) {
      case 'job':
        const job = await jobService.getJobById(resourceId);
        return job?.userId === userId;
        
      case 'resume_association':
        const association = await associationService.getAssociation(resourceId);
        const jobOwnership = await this.checkResourceOwnership(
          userId, 'job', association?.jobId
        );
        return jobOwnership;
        
      case 'analytics':
      case 'insights':
        // Analytics belong to job owner
        return context.jobId ? 
          await this.checkResourceOwnership(userId, 'job', context.jobId) : 
          true; // User-level analytics
          
      default:
        return true; // Allow by default for unspecified resources
    }
  }
}
```

### 1.3 API Token Management

```typescript
interface ApiTokenConfig {
  format: {
    prefix: 'mj_'; // My Jobs prefix
    entropy: number; // 256 bits
    encoding: 'base64url';
  };
  
  scoping: {
    defaultScopes: string[];
    availableScopes: string[];
    scopeValidation: boolean;
  };
  
  lifecycle: {
    maxTokensPerUser: number;
    defaultExpiry: string; // '30d'
    maxExpiry: string; // '1y'
    rotationReminder: string; // '7d'
  };
}

class ApiTokenManager {
  async generateToken(userId: string, options: TokenGenerationOptions): Promise<ApiToken> {
    // Validate user permissions
    await this.validateTokenCreationPermission(userId);
    
    // Check token limits
    await this.checkTokenLimits(userId);
    
    // Generate cryptographically secure token
    const tokenValue = await this.generateSecureToken();
    const tokenId = this.generateTokenId();
    
    // Create token record
    const token = await this.createTokenRecord({
      id: tokenId,
      userId,
      value: await this.hashToken(tokenValue),
      scopes: this.validateScopes(options.scopes),
      expiresAt: this.calculateExpiry(options.expiresIn),
      metadata: {
        createdFrom: options.origin,
        userAgent: options.userAgent,
        ipAddress: options.ipAddress,
      }
    });
    
    // Return token (only time the raw value is exposed)
    return {
      id: token.id,
      token: `${TOKEN_PREFIX}${tokenValue}`,
      scopes: token.scopes,
      expiresAt: token.expiresAt,
    };
  }
  
  async validateToken(tokenValue: string): Promise<TokenValidationResult> {
    // Extract and validate token format
    if (!tokenValue.startsWith(TOKEN_PREFIX)) {
      throw new InvalidTokenError('Invalid token format');
    }
    
    const rawToken = tokenValue.substring(TOKEN_PREFIX.length);
    const tokenHash = await this.hashToken(rawToken);
    
    // Lookup token record
    const tokenRecord = await this.findTokenByHash(tokenHash);
    if (!tokenRecord) {
      throw new InvalidTokenError('Token not found');
    }
    
    // Validate token status
    await this.validateTokenStatus(tokenRecord);
    
    // Update last used timestamp
    await this.updateLastUsed(tokenRecord.id);
    
    return {
      valid: true,
      userId: tokenRecord.userId,
      scopes: tokenRecord.scopes,
      tokenId: tokenRecord.id,
    };
  }
  
  private async generateSecureToken(): Promise<string> {
    // Generate 256 bits of entropy
    const buffer = await crypto.randomBytes(32);
    return buffer.toString('base64url');
  }
  
  private async hashToken(token: string): Promise<string> {
    // Use SHA-256 for token hashing
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
```

## 2. Data Protection & Privacy

### 2.1 Data Classification

```typescript
enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted'
}

interface DataClassificationRules {
  [DataClassification.PUBLIC]: {
    encryption: false;
    auditLevel: 'basic';
    retentionPeriod: 'indefinite';
  };
  
  [DataClassification.INTERNAL]: {
    encryption: true;
    encryptionLevel: 'aes-256';
    auditLevel: 'standard';
    retentionPeriod: '7y';
  };
  
  [DataClassification.CONFIDENTIAL]: {
    encryption: true;
    encryptionLevel: 'aes-256-gcm';
    auditLevel: 'detailed';
    retentionPeriod: '5y';
    accessLogging: true;
  };
  
  [DataClassification.RESTRICTED]: {
    encryption: true;
    encryptionLevel: 'aes-256-gcm';
    auditLevel: 'comprehensive';
    retentionPeriod: '3y';
    accessLogging: true;
    approvalRequired: true;
  };
}

class DataClassifier {
  static classifyJobData(job: JobWithMetrics): Record<string, DataClassification> {
    return {
      id: DataClassification.PUBLIC,
      title: DataClassification.INTERNAL,
      description: DataClassification.CONFIDENTIAL,
      requirements: DataClassification.CONFIDENTIAL,
      analyzedData: DataClassification.CONFIDENTIAL,
      metrics: DataClassification.INTERNAL,
      analytics: DataClassification.RESTRICTED,
      insights: DataClassification.RESTRICTED,
    };
  }
  
  static classifyAnalyticsData(): DataClassification {
    // Analytics contain aggregated insights about hiring patterns
    return DataClassification.RESTRICTED;
  }
  
  static classifyResumeData(): DataClassification {
    // Resume data contains PII
    return DataClassification.RESTRICTED;
  }
}
```

### 2.2 Field-Level Encryption

```typescript
class FieldLevelEncryption {
  private static encryptionKey = process.env.FIELD_ENCRYPTION_KEY;
  
  static async encryptField(value: string, classification: DataClassification): Promise<string> {
    if (classification === DataClassification.PUBLIC) {
      return value; // No encryption needed
    }
    
    const algorithm = this.getEncryptionAlgorithm(classification);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, this.encryptionKey);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${algorithm}:${iv.toString('hex')}:${encrypted}`;
  }
  
  static async decryptField(encryptedValue: string): Promise<string> {
    const [algorithm, ivHex, encrypted] = encryptedValue.split(':');
    
    if (!algorithm || !ivHex || !encrypted) {
      return encryptedValue; // Assume unencrypted
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipher(algorithm, this.encryptionKey);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  private static getEncryptionAlgorithm(classification: DataClassification): string {
    switch (classification) {
      case DataClassification.INTERNAL:
        return 'aes-256-cbc';
      case DataClassification.CONFIDENTIAL:
      case DataClassification.RESTRICTED:
        return 'aes-256-gcm';
      default:
        return 'aes-256-cbc';
    }
  }
}
```

### 2.3 Data Masking & Anonymization

```typescript
class DataMasking {
  static maskJobData(job: JobWithMetrics, viewerRole: string): Partial<JobWithMetrics> {
    const masked = { ...job };
    
    switch (viewerRole) {
      case 'analytics_viewer':
        // Mask PII but keep analytical value
        masked.title = this.maskTitle(job.title);
        masked.description = this.maskDescription(job.description);
        delete masked.requirements; // Remove detailed requirements
        break;
        
      case 'external_auditor':
        // Heavy masking for compliance audits
        masked.title = '[MASKED]';
        masked.description = `Job in ${job.analyzedData?.department || 'Unknown'} department`;
        delete masked.requirements;
        delete mapped.analyzedData;
        break;
        
      case 'support_agent':
        // Partial masking for support purposes
        masked.description = this.truncateDescription(job.description, 200);
        break;
    }
    
    return masked;
  }
  
  private static maskTitle(title: string): string {
    // Replace company-specific terms but keep role information
    return title
      .replace(/\b[A-Z][a-z]*\s*(?:Inc|Corp|LLC|Ltd)\b/g, '[COMPANY]')
      .replace(/\b[A-Z]{2,}\b/g, '[ACRONYM]');
  }
  
  private static maskDescription(description: string): string {
    // Remove identifying information while preserving structure
    return description
      .replace(/\b[A-Z][a-z]*\s*(?:Inc|Corp|LLC|Ltd)\b/g, '[COMPANY]')
      .replace(/\b\d{1,5}\s+[A-Z][a-z]*\s+(?:Street|Ave|Road|Blvd)\b/g, '[ADDRESS]')
      .replace(/\b\d{3}-\d{3}-\d{4}\b/g, '[PHONE]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
  }
}
```

## 3. Input Validation & Sanitization

### 3.1 Comprehensive Input Validation

```typescript
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

class MyJobsInputValidator {
  // Job creation validation with security constraints
  static createJobSchema = z.object({
    title: z.string()
      .min(1, 'Title is required')
      .max(200, 'Title too long')
      .refine(this.validateSafeText, 'Title contains potentially harmful content'),
    
    description: z.string()
      .min(10, 'Description too short')
      .max(10000, 'Description too long')
      .refine(this.validateRichText, 'Description contains invalid HTML'),
    
    requirements: z.array(
      z.string()
        .max(500, 'Requirement too long')
        .refine(this.validateSafeText, 'Requirement contains harmful content')
    ).max(50, 'Too many requirements'),
    
    tags: z.array(
      z.string()
        .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Invalid tag format')
        .max(50, 'Tag too long')
    ).max(20, 'Too many tags'),
  });
  
  // Search query validation
  static searchQuerySchema = z.object({
    query: z.string()
      .max(200, 'Search query too long')
      .refine(this.validateSearchQuery, 'Invalid search query'),
    
    filters: z.object({
      status: z.array(z.enum(['active', 'draft', 'archived', 'template'])).optional(),
      skills: z.array(
        z.string().regex(/^[a-zA-Z0-9\s\+\#\.\-]+$/, 'Invalid skill format')
      ).max(10, 'Too many skill filters').optional(),
      dateRange: z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
      }).refine(data => new Date(data.start) <= new Date(data.end), 'Invalid date range').optional(),
    }).optional(),
  });
  
  private static validateSafeText(text: string): boolean {
    // Check for potential script injection
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(text));
  }
  
  private static validateRichText(text: string): boolean {
    // Allow safe HTML tags only
    const cleaned = DOMPurify.sanitize(text, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: [],
    });
    
    // Text should not change significantly after sanitization
    const originalLength = text.length;
    const cleanedLength = cleaned.length;
    
    return (cleanedLength / originalLength) > 0.95; // Allow 5% shrinkage
  }
  
  private static validateSearchQuery(query: string): boolean {
    // Prevent SQL injection and other attacks in search
    const dangerousPatterns = [
      /['";]/,
      /\b(union|select|insert|update|delete|drop|alter)\b/i,
      /--/,
      /\/\*/,
    ];
    
    return !dangerousPatterns.some(pattern => pattern.test(query));
  }
}
```

### 3.2 File Upload Security

```typescript
interface FileSecurityConfig {
  allowedTypes: string[];
  maxSize: number;
  virusScanning: boolean;
  contentValidation: boolean;
  quarantinePolicy: string;
}

class FileUploadSecurity {
  private static config: FileSecurityConfig = {
    allowedTypes: ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxSize: 10 * 1024 * 1024, // 10MB
    virusScanning: true,
    contentValidation: true,
    quarantinePolicy: 'isolate_and_notify',
  };
  
  static async validateFile(file: Express.Multer.File): Promise<FileValidationResult> {
    const results: FileValidationResult = {
      valid: true,
      issues: [],
      metadata: {},
    };
    
    // File type validation
    if (!this.config.allowedTypes.includes(file.mimetype)) {
      results.valid = false;
      results.issues.push(`File type ${file.mimetype} not allowed`);
    }
    
    // Size validation
    if (file.size > this.config.maxSize) {
      results.valid = false;
      results.issues.push(`File size ${file.size} exceeds limit ${this.config.maxSize}`);
    }
    
    // Content validation
    if (this.config.contentValidation) {
      const contentValidation = await this.validateFileContent(file);
      if (!contentValidation.valid) {
        results.valid = false;
        results.issues.push(...contentValidation.issues);
      }
    }
    
    // Virus scanning
    if (this.config.virusScanning) {
      const virusScanResult = await this.scanForVirus(file);
      if (!virusScanResult.clean) {
        results.valid = false;
        results.issues.push('File contains malicious content');
        await this.quarantineFile(file, virusScanResult);
      }
    }
    
    return results;
  }
  
  private static async validateFileContent(file: Express.Multer.File): Promise<ValidationResult> {
    // Check file magic bytes against declared MIME type
    const magicBytes = file.buffer.slice(0, 16);
    const expectedSignature = this.getMagicBytesForMimeType(file.mimetype);
    
    if (!this.matchesMagicBytes(magicBytes, expectedSignature)) {
      return {
        valid: false,
        issues: ['File content does not match declared type'],
      };
    }
    
    // Additional content validation based on file type
    switch (file.mimetype) {
      case 'application/pdf':
        return this.validatePdfContent(file.buffer);
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.validateDocumentContent(file.buffer);
      default:
        return { valid: true, issues: [] };
    }
  }
  
  private static async scanForVirus(file: Express.Multer.File): Promise<VirusScanResult> {
    // Integration with virus scanning service
    // This is a placeholder - integrate with actual AV service
    try {
      const scanResult = await virusScanningService.scan(file.buffer);
      return {
        clean: scanResult.clean,
        threats: scanResult.threats || [],
        scanDate: new Date(),
      };
    } catch (error) {
      // Fail secure - if we can't scan, consider it potentially unsafe
      return {
        clean: false,
        threats: ['Unable to complete virus scan'],
        scanDate: new Date(),
      };
    }
  }
}
```

## 4. API Security Headers & CORS

### 4.1 Security Headers Configuration

```typescript
const securityHeadersConfig = {
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://secure.gravatar.com'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.evalmatch.com'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  
  // HSTS (HTTP Strict Transport Security)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubdomains: true,
    preload: true,
  },
  
  // Other security headers
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  
  // API-specific headers
  custom: {
    'X-API-Version': '1.0',
    'X-Rate-Limit-Remaining': 'dynamic',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  },
};
```

### 4.2 CORS Configuration

```typescript
const corsConfig = {
  // Allowed origins (environment-specific)
  origin: (origin: string, callback: Function) => {
    const allowedOrigins = {
      development: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://dev.evalmatch.com',
      ],
      production: [
        'https://evalmatch.app',
        'https://recruitment-corner.scholavar.com',
        'https://app.evalmatch.com',
      ],
    };
    
    const environment = process.env.NODE_ENV || 'development';
    const allowed = allowedOrigins[environment] || [];
    
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  
  // Allowed methods
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  
  // Allowed headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Requested-With',
    'X-Client-Version',
  ],
  
  // Exposed headers
  exposedHeaders: [
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
    'X-Total-Count',
    'X-Page-Count',
  ],
  
  // Credentials support
  credentials: true,
  
  // Preflight cache
  maxAge: 86400, // 24 hours
};
```

## 5. Threat Mitigation

### 5.1 SQL Injection Prevention

```typescript
class SQLInjectionPrevention {
  // Use parameterized queries exclusively
  static buildSecureQuery(baseQuery: string, params: any[]): QueryConfig {
    return {
      text: baseQuery,
      values: params.map(param => this.sanitizeParameter(param)),
    };
  }
  
  private static sanitizeParameter(param: any): any {
    if (typeof param === 'string') {
      // Remove null bytes and other dangerous characters
      return param.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }
    
    if (typeof param === 'number') {
      // Validate numeric parameters
      if (!isFinite(param) || isNaN(param)) {
        throw new ValidationError('Invalid numeric parameter');
      }
      return param;
    }
    
    return param;
  }
  
  // Dynamic query building with whitelist validation
  static buildDynamicWhere(filters: Record<string, any>): QueryClause {
    const allowedColumns = [
      'user_id', 'status', 'created_at', 'updated_at', 'title'
    ];
    
    const clauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    Object.entries(filters).forEach(([column, value]) => {
      if (!allowedColumns.includes(column)) {
        throw new ValidationError(`Column ${column} not allowed in filters`);
      }
      
      clauses.push(`${column} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    });
    
    return {
      whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      parameters: params,
    };
  }
}
```

### 5.2 Cross-Site Scripting (XSS) Prevention

```typescript
class XSSPrevention {
  // Output encoding for different contexts
  static encodeForHTML(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
  
  static encodeForHTMLAttribute(input: string): string {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }
  
  static encodeForJSON(input: string): string {
    return input
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
  
  // Content Security Policy nonce generation
  static generateCSPNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }
  
  // Safe rich text processing
  static sanitizeRichText(input: string): string {
    return DOMPurify.sanitize(input, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4'],
      ALLOWED_ATTR: ['class'],
      ALLOW_DATA_ATTR: false,
    });
  }
}
```

### 5.3 Cross-Site Request Forgery (CSRF) Protection

```typescript
class CSRFProtection {
  private static tokenStore = new Map<string, CSRFToken>();
  
  static generateCSRFToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = Date.now() + (30 * 60 * 1000); // 30 minutes
    
    this.tokenStore.set(token, {
      userId,
      expiry,
      used: false,
    });
    
    return token;
  }
  
  static validateCSRFToken(token: string, userId: string): boolean {
    const storedToken = this.tokenStore.get(token);
    
    if (!storedToken) {
      return false;
    }
    
    if (storedToken.userId !== userId) {
      return false;
    }
    
    if (storedToken.expiry < Date.now()) {
      this.tokenStore.delete(token);
      return false;
    }
    
    if (storedToken.used) {
      return false;
    }
    
    // Mark token as used (one-time use)
    storedToken.used = true;
    
    return true;
  }
  
  // Middleware for CSRF protection
  static middleware(req: Request, res: Response, next: NextFunction) {
    // Skip CSRF for GET requests and API token authentication
    if (req.method === 'GET' || req.headers['x-api-key']) {
      return next();
    }
    
    const csrfToken = req.headers['x-csrf-token'] as string;
    const userId = req.user?.uid;
    
    if (!csrfToken || !userId) {
      return res.status(403).json({
        success: false,
        error: 'CSRF_TOKEN_MISSING',
        message: 'CSRF token required',
      });
    }
    
    if (!this.validateCSRFToken(csrfToken, userId)) {
      return res.status(403).json({
        success: false,
        error: 'CSRF_TOKEN_INVALID',
        message: 'Invalid or expired CSRF token',
      });
    }
    
    next();
  }
}
```

## 6. Security Monitoring & Incident Response

### 6.1 Security Event Monitoring

```typescript
interface SecurityEvent {
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  ipAddress: string;
  userAgent: string;
  endpoint: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

enum SecurityEventType {
  AUTHENTICATION_FAILURE = 'auth_failure',
  AUTHORIZATION_VIOLATION = 'authz_violation',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  MALICIOUS_INPUT_DETECTED = 'malicious_input',
  UNUSUAL_ACCESS_PATTERN = 'unusual_access',
}

class SecurityEventMonitor {
  private static events: SecurityEvent[] = [];
  
  static logSecurityEvent(event: Partial<SecurityEvent>): void {
    const fullEvent: SecurityEvent = {
      type: event.type!,
      severity: event.severity || 'medium',
      userId: event.userId,
      ipAddress: event.ipAddress!,
      userAgent: event.userAgent!,
      endpoint: event.endpoint!,
      timestamp: new Date(),
      metadata: event.metadata || {},
    };
    
    this.events.push(fullEvent);
    
    // Send to security monitoring service
    this.sendToMonitoringService(fullEvent);
    
    // Check for incident escalation
    this.checkForIncidentEscalation(fullEvent);
  }
  
  private static sendToMonitoringService(event: SecurityEvent): void {
    // Integration with security monitoring (SIEM)
    if (process.env.SECURITY_MONITORING_ENABLED === 'true') {
      securityMonitoringService.logEvent(event);
    }
    
    // Log to structured logging
    logger.warn('Security Event', {
      type: event.type,
      severity: event.severity,
      userId: event.userId,
      endpoint: event.endpoint,
      metadata: event.metadata,
    });
  }
  
  private static checkForIncidentEscalation(event: SecurityEvent): void {
    // Critical events require immediate escalation
    if (event.severity === 'critical') {
      this.escalateIncident(event);
      return;
    }
    
    // Pattern-based escalation
    const recentEvents = this.getRecentEvents(event.ipAddress, 300000); // 5 minutes
    const failureCount = recentEvents.filter(e => 
      e.type === SecurityEventType.AUTHENTICATION_FAILURE
    ).length;
    
    if (failureCount >= 10) {
      this.escalateIncident(event, 'Brute force attack detected');
    }
  }
  
  private static escalateIncident(event: SecurityEvent, reason?: string): void {
    const incident = {
      id: crypto.randomUUID(),
      type: 'security_incident',
      severity: event.severity,
      reason: reason || 'Critical security event',
      triggerEvent: event,
      timestamp: new Date(),
    };
    
    // Send to incident response system
    incidentResponseService.createIncident(incident);
    
    // Notify security team
    notificationService.notifySecurityTeam(incident);
  }
}
```

### 6.2 Automated Threat Response

```typescript
class AutomatedThreatResponse {
  private static blockedIPs = new Set<string>();
  private static suspiciousUsers = new Set<string>();
  
  static async respondToThreat(event: SecurityEvent): Promise<void> {
    switch (event.type) {
      case SecurityEventType.AUTHENTICATION_FAILURE:
        await this.handleAuthenticationFailure(event);
        break;
        
      case SecurityEventType.RATE_LIMIT_EXCEEDED:
        await this.handleRateLimitViolation(event);
        break;
        
      case SecurityEventType.MALICIOUS_INPUT_DETECTED:
        await this.handleMaliciousInput(event);
        break;
        
      case SecurityEventType.UNUSUAL_ACCESS_PATTERN:
        await this.handleUnusualAccess(event);
        break;
    }
  }
  
  private static async handleAuthenticationFailure(event: SecurityEvent): Promise<void> {
    const recentFailures = await this.countRecentFailures(event.ipAddress, 300000);
    
    if (recentFailures >= 10) {
      // Temporary IP block
      await this.blockIP(event.ipAddress, 3600000); // 1 hour
      
      // Notify security team
      await this.notifySecurityTeam('IP blocked due to brute force', event);
    } else if (recentFailures >= 5) {
      // Increase rate limiting for this IP
      await this.increaseRateLimit(event.ipAddress, 2); // 2x stricter
    }
  }
  
  private static async handleMaliciousInput(event: SecurityEvent): Promise<void> {
    if (event.userId) {
      // Flag user account for review
      this.suspiciousUsers.add(event.userId);
      
      // Require additional verification for future requests
      await this.requireAdditionalVerification(event.userId);
    }
    
    // Block IP temporarily
    await this.blockIP(event.ipAddress, 1800000); // 30 minutes
  }
  
  private static async blockIP(ipAddress: string, duration: number): Promise<void> {
    this.blockedIPs.add(ipAddress);
    
    // Set automatic unblock
    setTimeout(() => {
      this.blockedIPs.delete(ipAddress);
    }, duration);
    
    // Update WAF rules if available
    if (process.env.WAF_INTEGRATION_ENABLED === 'true') {
      await wafService.blockIP(ipAddress, duration);
    }
  }
  
  static isIPBlocked(ipAddress: string): boolean {
    return this.blockedIPs.has(ipAddress);
  }
  
  static isUserSuspicious(userId: string): boolean {
    return this.suspiciousUsers.has(userId);
  }
}
```

## 7. Compliance & Audit

### 7.1 GDPR Compliance

```typescript
class GDPRCompliance {
  // Data subject rights implementation
  static async handleDataSubjectRequest(
    type: DataSubjectRequestType, 
    userId: string
  ): Promise<DataSubjectResponse> {
    switch (type) {
      case 'ACCESS':
        return this.handleAccessRequest(userId);
      case 'PORTABILITY':
        return this.handlePortabilityRequest(userId);
      case 'RECTIFICATION':
        return this.handleRectificationRequest(userId);
      case 'ERASURE':
        return this.handleErasureRequest(userId);
      case 'RESTRICTION':
        return this.handleRestrictionRequest(userId);
      default:
        throw new Error('Unknown data subject request type');
    }
  }
  
  private static async handleAccessRequest(userId: string): Promise<DataExport> {
    const userData = {
      personalInfo: await this.getUserPersonalInfo(userId),
      jobs: await this.getUserJobs(userId),
      analytics: await this.getUserAnalytics(userId),
      apiTokens: await this.getUserTokens(userId),
      auditLogs: await this.getUserAuditLogs(userId),
    };
    
    return {
      format: 'JSON',
      data: userData,
      generated: new Date(),
      retention: '30 days',
    };
  }
  
  private static async handleErasureRequest(userId: string): Promise<ErasureResult> {
    // Check for legitimate interests that prevent erasure
    const preventErasure = await this.checkErasureObstacles(userId);
    if (preventErasure.length > 0) {
      return {
        completed: false,
        reason: 'Legal obligations prevent complete erasure',
        obstacles: preventErasure,
        partialErasure: await this.performPartialErasure(userId),
      };
    }
    
    // Perform complete erasure
    const erasureSteps = [
      () => this.deleteUserJobs(userId),
      () => this.deleteUserAnalytics(userId),
      () => this.deleteUserTokens(userId),
      () => this.anonymizeAuditLogs(userId),
      () => this.deleteUserAccount(userId),
    ];
    
    const results = await Promise.allSettled(erasureSteps.map(step => step()));
    
    return {
      completed: results.every(result => result.status === 'fulfilled'),
      deletedRecords: results.filter(r => r.status === 'fulfilled').length,
      errors: results.filter(r => r.status === 'rejected'),
      completedAt: new Date(),
    };
  }
  
  // Consent management
  static async recordConsent(userId: string, consentType: ConsentType): Promise<void> {
    const consent = {
      userId,
      type: consentType,
      granted: true,
      timestamp: new Date(),
      version: process.env.PRIVACY_POLICY_VERSION,
      ipAddress: this.getCurrentIPAddress(),
      method: 'explicit',
    };
    
    await consentStorage.recordConsent(consent);
  }
  
  static async checkConsent(userId: string, purpose: string): Promise<boolean> {
    const consent = await consentStorage.getLatestConsent(userId, purpose);
    
    return consent && 
           consent.granted && 
           !consent.withdrawn && 
           consent.version === process.env.PRIVACY_POLICY_VERSION;
  }
}
```

### 7.2 Audit Trail Implementation

```typescript
interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
}

class AuditTrail {
  private static auditQueue: AuditEvent[] = [];
  
  static async logEvent(event: Partial<AuditEvent>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      userId: event.userId,
      action: event.action!,
      resource: event.resource!,
      resourceId: event.resourceId,
      details: event.details || {},
      ipAddress: event.ipAddress!,
      userAgent: event.userAgent!,
      result: event.result || 'success',
      metadata: event.metadata,
    };
    
    this.auditQueue.push(auditEvent);
    
    // Batch write audit events for performance
    if (this.auditQueue.length >= 100) {
      await this.flushAuditQueue();
    }
  }
  
  private static async flushAuditQueue(): Promise<void> {
    if (this.auditQueue.length === 0) return;
    
    const events = [...this.auditQueue];
    this.auditQueue.length = 0;
    
    try {
      await auditStorage.batchInsert(events);
    } catch (error) {
      // Critical: audit logging must not fail
      console.error('Audit logging failed:', error);
      
      // Re-queue events for retry
      this.auditQueue.unshift(...events);
      
      // Alert administrators
      await this.alertAuditFailure(error);
    }
  }
  
  // Audit middleware for automatic logging
  static middleware(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const originalSend = res.send;
    
    res.send = function(body: any) {
      const endTime = Date.now();
      
      // Log the request
      AuditTrail.logEvent({
        userId: req.user?.uid,
        action: `${req.method} ${req.route?.path || req.path}`,
        resource: req.baseUrl || req.path,
        resourceId: req.params.id,
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          responseTime: endTime - startTime,
          statusCode: res.statusCode,
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || '',
        result: res.statusCode < 400 ? 'success' : 'failure',
      });
      
      return originalSend.call(this, body);
    };
    
    next();
  }
}
```

This comprehensive security guide ensures the My Jobs API meets enterprise security standards while maintaining usability and performance.