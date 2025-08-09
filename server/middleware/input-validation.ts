/**
 * Comprehensive Input Validation Middleware
 *
 * Provides secure input validation and sanitization for all API endpoints
 * Protects against XSS, injection attacks, and data integrity issues
 */

import { Request, Response, NextFunction } from "express";
import { z, ZodSchema, ZodError } from "zod";
import { SecurityValidator, SecureSchemas } from "@shared/security-validation";
import { logger } from "../config/logger";

// Enhanced security validation schemas
export const commonSchemas = {
  // User ID validation (Firebase UID format) with enhanced security
  userId: SecureSchemas.userId,

  // Enhanced email validation with sanitization
  email: SecureSchemas.secureEmail(),

  // Enhanced file validation with security checks
  filename: SecureSchemas.secureFilename(255),
  fileContent: z.string().max(50 * 1024 * 1024), // 50MB max
  fileSize: SecureSchemas.fileSize,
  mimeType: SecureSchemas.mimeType,

  // Enhanced text validation with comprehensive sanitization
  title: SecureSchemas.secureString(200, {
    allowSpecialChars: true,
    allowNewlines: false,
    preserveSpaces: true
  }),
  description: SecureSchemas.secureString(20000, {
    allowSpecialChars: true,
    allowNewlines: true,
    preserveSpaces: true
  }),

  // Enhanced numeric validation with bounds checking
  id: SecureSchemas.secureNumber({ min: 1, max: Number.MAX_SAFE_INTEGER, integer: true }),

  // Enhanced pagination with security limits
  page: SecureSchemas.secureNumber({ min: 1, max: 10000, integer: true }),
  limit: SecureSchemas.secureNumber({ min: 1, max: 100, integer: true }),

  // Enhanced search query with comprehensive sanitization
  searchQuery: SecureSchemas.secureString(200, {
    allowSpecialChars: false,
    allowNewlines: false,
    preserveSpaces: true
  }).optional(),

  // Enhanced job-related validation
  jobTitle: SecureSchemas.secureString(200, {
    allowSpecialChars: true,
    allowNewlines: false,
    preserveSpaces: true
  }),
  jobDescription: SecureSchemas.secureString(50000, {
    allowSpecialChars: true,
    allowNewlines: true,
    preserveSpaces: true
  }),
  requirements: SecureSchemas.secureStringArray({
    maxItems: 50,
    maxItemLength: 500,
    allowEmpty: false
  }),
  location: SecureSchemas.secureString(200, {
    allowSpecialChars: true,
    allowNewlines: false,
    preserveSpaces: true
  }).optional(),

  // Enhanced resume content validation
  resumeContent: SecureSchemas.secureString(100000, {
    allowSpecialChars: true,
    allowNewlines: true,
    preserveSpaces: true
  }),
  skills: SecureSchemas.secureStringArray({
    maxItems: 100,
    maxItemLength: 100,
    allowEmpty: false
  }),

  // Analysis parameters with bounds checking
  matchPercentage: SecureSchemas.secureNumber({ min: 0, max: 100 }),
  confidenceScore: SecureSchemas.secureNumber({ min: 0, max: 1 }),

  // Enhanced URL validation
  url: SecureSchemas.secureUrl(['http', 'https']),

  // Session and batch IDs with enhanced validation
  sessionId: SecureSchemas.sessionId,
  batchId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, "Invalid batch ID format"),

  // Enhanced password validation (when needed)
  password: z.string().refine((val) => {
    const result = SecurityValidator.validatePasswordStrength(val);
    return result.isValid;
  }, "Password does not meet security requirements"),
};

// Request validation schemas
export const validationSchemas = {
  // Resume endpoints
  uploadResume: z.object({
    body: z.object({
      filename: commonSchemas.filename,
      content: commonSchemas.resumeContent.optional(),
    }),
    files: z
      .object({
        resume: z.object({
          mimetype: z.enum([
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ]),
          size: z.number().max(10 * 1024 * 1024), // 10MB
        }),
      })
      .optional(),
  }),

  getResume: z.object({
    params: z.object({
      id: commonSchemas.id,
    }),
  }),

  // Job description endpoints with enhanced security
  createJob: z.object({
    body: z.object({
      title: commonSchemas.jobTitle,
      description: commonSchemas.jobDescription,
      requirements: commonSchemas.requirements.optional(),
      location: commonSchemas.location,
      salary: z
        .object({
          min: SecureSchemas.secureNumber({ min: 0, max: 10000000 }).optional(),
          max: SecureSchemas.secureNumber({ min: 0, max: 10000000 }).optional(),
          currency: z.string().length(3).regex(/^[A-Z]{3}$/).optional(),
        })
        .optional(),
      department: SecureSchemas.secureString(100, {
        allowSpecialChars: false,
        allowNewlines: false
      }).optional(),
      experienceLevel: z.enum(['entry', 'junior', 'mid', 'senior', 'lead', 'executive']).optional(),
    }),
  }),

  updateJob: z.object({
    params: z.object({
      id: commonSchemas.id,
    }),
    body: z.object({
      title: commonSchemas.jobTitle.optional(),
      description: commonSchemas.jobDescription.optional(),
      requirements: commonSchemas.requirements.optional(),
      location: commonSchemas.location,
      department: SecureSchemas.secureString(100, {
        allowSpecialChars: false,
        allowNewlines: false
      }).optional(),
      experienceLevel: z.enum(['entry', 'junior', 'mid', 'senior', 'lead', 'executive']).optional(),
    }),
  }),

  // Analysis endpoints
  analyzeResume: z.object({
    params: z.object({
      jobId: commonSchemas.id,
    }),
    body: z.object({
      resumeIds: z.array(commonSchemas.id).min(1).max(10),
      analysisType: z
        .enum(["basic", "detailed", "comprehensive"])
        .default("basic"),
      includeRecommendations: z.boolean().default(true),
    }),
  }),

  getAnalysis: z.object({
    params: z.object({
      jobId: commonSchemas.id,
    }),
    query: z.object({
      page: commonSchemas.page,
      limit: commonSchemas.limit,
      sortBy: z
        .enum(["created_at", "match_percentage", "title"])
        .default("created_at"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
      search: commonSchemas.searchQuery,
    }),
  }),

  // Interview endpoints
  generateQuestions: z.object({
    params: z.object({
      resumeId: commonSchemas.id,
      jobId: commonSchemas.id,
    }),
    body: z.object({
      questionTypes: z
        .array(z.enum(["technical", "behavioral", "situational"]))
        .min(1),
      difficulty: z.enum(["junior", "mid", "senior"]).default("mid"),
      count: z.number().int().min(1).max(20).default(10),
    }),
  }),

  // Enhanced user profile validation with comprehensive security
  updateProfile: z.object({
    body: z.object({
      displayName: SecureSchemas.secureString(100, {
        allowSpecialChars: false,
        allowNewlines: false,
        allowNumbers: true
      }).optional(),
      bio: SecureSchemas.secureString(1000, {
        allowSpecialChars: true,
        allowNewlines: true,
        preserveSpaces: true
      }).optional(),
      avatar: commonSchemas.url.optional(),
      preferences: z
        .object({
          emailNotifications: z.boolean().optional(),
          theme: z.enum(["light", "dark", "system"]).optional(),
          language: z.string().length(2).regex(/^[a-z]{2}$/).optional(),
          timezone: z.string().max(50).optional(),
        })
        .optional(),
    }),
  }),

  // Enhanced batch operations validation
  batchUpload: z.object({
    body: z.object({
      sessionId: commonSchemas.sessionId.optional(),
      batchId: commonSchemas.batchId.optional(),
      autoAnalyze: z.boolean().default(true),
    }),
    files: z.array(z.object({
      originalname: commonSchemas.filename,
      mimetype: commonSchemas.mimeType,
      size: commonSchemas.fileSize,
    })).min(1).max(10),
  }),

  // Enhanced search and filtering
  searchResumes: z.object({
    query: z.object({
      search: commonSchemas.searchQuery,
      skills: SecureSchemas.secureStringArray({
        maxItems: 20,
        maxItemLength: 50,
        allowEmpty: false
      }).optional(),
      experience: z.enum(['entry', 'junior', 'mid', 'senior', 'lead']).optional(),
      location: commonSchemas.location,
      dateFrom: z.string().datetime().optional(),
      dateTo: z.string().datetime().optional(),
      page: commonSchemas.page,
      limit: commonSchemas.limit,
      sortBy: z.enum(['created_at', 'match_percentage', 'filename']).default('created_at'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
    }),
  }),
};

/**
 * Enhanced validation middleware with comprehensive security features
 */
export function validateRequest(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    try {
      // Step 1: Rate limiting check
      const clientId = req.user?.uid || req.ip || 'anonymous';
      const rateLimitKey = `${clientId}:${req.path}:${req.method}`;
      
      if (!SecurityValidator.checkRateLimit(rateLimitKey, 100, 60000)) { // 100 requests per minute
        logger.warn("Rate limit exceeded during validation", {
          clientId,
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        });

        return res.status(429).json({
          error: "Rate Limit Exceeded",
          message: "Too many requests. Please slow down.",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: 60,
        });
      }

      // Step 2: Request size validation
      const contentLength = parseInt(req.headers["content-length"] || "0");
      if (contentLength > 50 * 1024 * 1024) { // 50MB limit
        logger.warn("Request size exceeded during validation", {
          size: contentLength,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        return res.status(413).json({
          error: "Payload Too Large",
          message: "Request size exceeds maximum allowed limit",
          code: "PAYLOAD_TOO_LARGE",
        });
      }

      // Step 3: Content Security Policy validation for text fields
      const requestData = { ...req.body, ...req.query };
      for (const [key, value] of Object.entries(requestData)) {
        if (typeof value === 'string' && value.length > 0) {
          if (!SecurityValidator.validateCSP(value)) {
            logger.warn("CSP validation failed", {
              field: key,
              path: req.path,
              method: req.method,
              ip: req.ip,
              suspiciousContent: value.substring(0, 100) + '...',
            });

            return res.status(400).json({
              error: "Security Violation",
              message: `Field '${key}' contains potentially dangerous content`,
              code: "CSP_VIOLATION",
            });
          }
        }
      }

      // Step 4: Validate and sanitize the request
      const validatedData = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
        files: req.files,
      });

      // Step 5: Additional security checks on validated data
      if (validatedData.body) {
        for (const [key, value] of Object.entries(validatedData.body)) {
          if (typeof value === 'string') {
            // Check for remaining dangerous patterns after sanitization
            if (value.includes('<script') || value.includes('javascript:') || value.includes('data:text/html')) {
              logger.error("Dangerous content found after sanitization", {
                field: key,
                path: req.path,
                method: req.method,
                ip: req.ip,
                content: value.substring(0, 100),
              });

              return res.status(400).json({
                error: "Security Error",
                message: "Content contains dangerous patterns",
                code: "DANGEROUS_CONTENT",
              });
            }
          }
        }
      }

      // Step 6: Replace request data with validated/sanitized data
      req.body = validatedData.body || {};
      req.params = validatedData.params || {};
      req.query = validatedData.query || {};

      // Step 7: Log successful validation
      const processingTime = Date.now() - startTime;
      
      if (process.env.NODE_ENV === "development") {
        logger.debug("Request validation successful", {
          path: req.path,
          method: req.method,
          validatedFields: Object.keys(validatedData),
          processingTimeMs: processingTime,
          clientId,
        });
      }

      // Track validation metrics
      if (processingTime > 1000) {
        logger.warn("Slow validation detected", {
          path: req.path,
          method: req.method,
          processingTimeMs: processingTime,
          clientId,
        });
      }

      next();
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
          receivedValue: err.input ? String(err.input).substring(0, 100) : undefined,
        }));

        logger.warn("Request validation failed", {
          path: req.path,
          method: req.method,
          errors: validationErrors,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
          processingTimeMs: processingTime,
          clientId: req.user?.uid || req.ip || 'anonymous',
        });

        return res.status(400).json({
          error: "Validation Error",
          message: "Request contains invalid or potentially malicious data",
          details: validationErrors.map(err => ({
            field: err.field,
            message: err.message,
            code: err.code
          })), // Don't include received values in response
          code: "VALIDATION_FAILED",
          timestamp: new Date().toISOString(),
        });
      }

      logger.error("Validation middleware error", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        path: req.path,
        method: req.method,
        ip: req.ip,
        processingTimeMs: processingTime,
        clientId: req.user?.uid || req.ip || 'anonymous',
      });

      return res.status(500).json({
        error: "Internal Server Error",
        message: "Validation processing failed",
        code: "VALIDATION_ERROR",
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Rate limiting based on user ID and endpoint
 */
export function createRateLimit(windowMs: number, maxRequests: number) {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.uid || req.ip;
    const key = `${userId}:${req.path}`;
    const now = Date.now();

    const userLimit = requestCounts.get(key);

    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new rate limit window
      requestCounts.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (userLimit.count >= maxRequests) {
      logger.warn("Rate limit exceeded", {
        userId: req.user?.uid || "anonymous",
        ip: req.ip,
        path: req.path,
        method: req.method,
        count: userLimit.count,
        limit: maxRequests,
      });

      return res.status(429).json({
        error: "Rate Limit Exceeded",
        message: `Too many requests. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000),
        code: "RATE_LIMIT_EXCEEDED",
      });
    }

    userLimit.count++;
    next();
  };
}

/**
 * Content-Type validation middleware
 */
export function validateContentType(expectedTypes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers["content-type"];

    if (
      !contentType ||
      !expectedTypes.some((type) => contentType.includes(type))
    ) {
      logger.warn("Invalid content type", {
        path: req.path,
        method: req.method,
        contentType,
        expected: expectedTypes,
        ip: req.ip,
      });

      return res.status(415).json({
        error: "Unsupported Media Type",
        message: `Content-Type must be one of: ${expectedTypes.join(", ")}`,
        code: "INVALID_CONTENT_TYPE",
      });
    }

    next();
  };
}

/**
 * Request size validation middleware
 */
export function validateRequestSize(maxSize: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers["content-length"] || "0");

    if (contentLength > maxSize) {
      logger.warn("Request too large", {
        path: req.path,
        method: req.method,
        size: contentLength,
        maxSize,
        ip: req.ip,
      });

      return res.status(413).json({
        error: "Payload Too Large",
        message: `Request size ${contentLength} bytes exceeds maximum ${maxSize} bytes`,
        code: "REQUEST_TOO_LARGE",
      });
    }

    next();
  };
}

// Export enhanced validation combinations with comprehensive security
export const validators = {
  // Core CRUD operations with enhanced security
  uploadResume: validateRequest(validationSchemas.uploadResume),
  getResume: validateRequest(validationSchemas.getResume),
  createJob: validateRequest(validationSchemas.createJob),
  updateJob: validateRequest(validationSchemas.updateJob),
  analyzeResume: validateRequest(validationSchemas.analyzeResume),
  getAnalysis: validateRequest(validationSchemas.getAnalysis),
  generateQuestions: validateRequest(validationSchemas.generateQuestions),
  updateProfile: validateRequest(validationSchemas.updateProfile),

  // Enhanced batch and search operations
  batchUpload: validateRequest(validationSchemas.batchUpload),
  searchResumes: validateRequest(validationSchemas.searchResumes),

  // Security-focused rate limits with different tiers
  rateLimitCritical: createRateLimit(60 * 1000, 5), // 5 requests per minute for critical operations
  rateLimitStrict: createRateLimit(60 * 1000, 10), // 10 requests per minute for sensitive operations
  rateLimitModerate: createRateLimit(60 * 1000, 30), // 30 requests per minute for normal operations
  rateLimitGenerous: createRateLimit(60 * 1000, 60), // 60 requests per minute for read operations
  rateLimitBulk: createRateLimit(60 * 1000, 100), // 100 requests per minute for bulk operations

  // Enhanced content type validators with security headers
  jsonOnlySecure: [
    validateContentType(["application/json"]),
    (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      next();
    }
  ],
  multipartOnlySecure: [
    validateContentType(["multipart/form-data"]),
    (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      next();
    }
  ],
  jsonOrMultipartSecure: [
    validateContentType(["application/json", "multipart/form-data"]),
    (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      next();
    }
  ],

  // Enhanced size validators with security logging
  tinyRequest: validateRequestSize(64 * 1024), // 64KB for small API requests
  smallRequest: validateRequestSize(1024 * 1024), // 1MB for forms
  mediumRequest: validateRequestSize(10 * 1024 * 1024), // 10MB for single files
  largeRequest: validateRequestSize(50 * 1024 * 1024), // 50MB for bulk operations
  
  // Legacy compatibility (deprecated - use enhanced versions above)
  jsonOnly: validateContentType(["application/json"]),
  multipartOnly: validateContentType(["multipart/form-data"]),
  jsonOrMultipart: validateContentType(["application/json", "multipart/form-data"]),
};
