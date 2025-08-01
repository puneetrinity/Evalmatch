/**
 * Comprehensive Input Validation Middleware
 * 
 * Provides secure input validation and sanitization for all API endpoints
 * Protects against XSS, injection attacks, and data integrity issues
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import DOMPurify from 'isomorphic-dompurify';
import { logger } from '../config/logger';

// Common validation schemas
export const commonSchemas = {
  // User ID validation (Firebase UID format)
  userId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid user ID format'),
  
  // Email validation
  email: z.string().email('Invalid email format').max(254),
  
  // File validation
  filename: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid filename'),
  fileContent: z.string().max(10 * 1024 * 1024), // 10MB max
  
  // Text fields with XSS protection
  title: z.string().min(1).max(200).transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })),
  description: z.string().min(1).max(10000).transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })),
  
  // Numeric IDs
  id: z.coerce.number().int().positive(),
  
  // Pagination
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  
  // Search/filter strings
  searchQuery: z.string().max(100).transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })).optional(),
  
  // Job description specific
  jobTitle: z.string().min(1).max(100).transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })),
  jobDescription: z.string().min(50).max(20000).transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })),
  
  // Resume specific
  resumeContent: z.string().min(100).max(50000),
  skills: z.array(z.string().max(50)).max(50),
  
  // Analysis parameters
  matchPercentage: z.number().min(0).max(100),
  confidenceScore: z.number().min(0).max(1),
};

// Request validation schemas
export const validationSchemas = {
  // Resume endpoints
  uploadResume: z.object({
    body: z.object({
      filename: commonSchemas.filename,
      content: commonSchemas.resumeContent.optional(),
    }),
    files: z.object({
      resume: z.object({
        mimetype: z.enum(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
        size: z.number().max(10 * 1024 * 1024), // 10MB
      })
    }).optional()
  }),
  
  getResume: z.object({
    params: z.object({
      id: commonSchemas.id,
    })
  }),
  
  // Job description endpoints
  createJob: z.object({
    body: z.object({
      title: commonSchemas.jobTitle,
      description: commonSchemas.jobDescription,
      requirements: z.array(z.string().max(200)).max(20).optional(),
      location: z.string().max(100).optional(),
      salary: z.object({
        min: z.number().min(0).optional(),
        max: z.number().min(0).optional(),
        currency: z.string().length(3).optional(),
      }).optional(),
    })
  }),
  
  updateJob: z.object({
    params: z.object({
      id: commonSchemas.id,
    }),
    body: z.object({
      title: commonSchemas.jobTitle.optional(),
      description: commonSchemas.jobDescription.optional(),
      requirements: z.array(z.string().max(200)).max(20).optional(),
      location: z.string().max(100).optional(),
    })
  }),
  
  // Analysis endpoints
  analyzeResume: z.object({
    params: z.object({
      jobId: commonSchemas.id,
    }),
    body: z.object({
      resumeIds: z.array(commonSchemas.id).min(1).max(10),
      analysisType: z.enum(['basic', 'detailed', 'comprehensive']).default('basic'),
      includeRecommendations: z.boolean().default(true),
    })
  }),
  
  getAnalysis: z.object({
    params: z.object({
      jobId: commonSchemas.id,
    }),
    query: z.object({
      page: commonSchemas.page,
      limit: commonSchemas.limit,
      sortBy: z.enum(['created_at', 'match_percentage', 'title']).default('created_at'),
      sortOrder: z.enum(['asc', 'desc']).default('desc'),
      search: commonSchemas.searchQuery,
    })
  }),
  
  // Interview endpoints
  generateQuestions: z.object({
    params: z.object({
      resumeId: commonSchemas.id,
      jobId: commonSchemas.id,
    }),
    body: z.object({
      questionTypes: z.array(z.enum(['technical', 'behavioral', 'situational'])).min(1),
      difficulty: z.enum(['junior', 'mid', 'senior']).default('mid'),
      count: z.number().int().min(1).max(20).default(10),
    })
  }),
  
  // User profile endpoints
  updateProfile: z.object({
    body: z.object({
      displayName: z.string().min(1).max(100).transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })).optional(),
      bio: z.string().max(500).transform(val => DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })).optional(),
      preferences: z.object({
        emailNotifications: z.boolean().optional(),
        theme: z.enum(['light', 'dark', 'system']).optional(),
        language: z.string().length(2).optional(),
      }).optional(),
    })
  }),
};

/**
 * Create validation middleware for a specific schema
 */
export function validateRequest(schema: ZodSchema) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate and sanitize the request
      const validatedData = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
        files: req.files,
      });
      
      // Replace request data with validated/sanitized data
      req.body = validatedData.body || {};
      req.params = validatedData.params || {};
      req.query = validatedData.query || {};
      
      // Log successful validation in development
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Request validation successful', {
          path: req.path,
          method: req.method,
          validatedFields: Object.keys(validatedData),
        });
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));
        
        logger.warn('Request validation failed', {
          path: req.path,
          method: req.method,
          errors: validationErrors,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
        
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Request contains invalid or malicious data',
          details: validationErrors,
          code: 'VALIDATION_FAILED',
        });
      }
      
      logger.error('Validation middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
        method: req.method,
      });
      
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Validation processing failed',
        code: 'VALIDATION_ERROR',
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
      logger.warn('Rate limit exceeded', {
        userId: req.user?.uid || 'anonymous',
        ip: req.ip,
        path: req.path,
        method: req.method,
        count: userLimit.count,
        limit: maxRequests,
      });
      
      return res.status(429).json({
        error: 'Rate Limit Exceeded',
        message: `Too many requests. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds.`,
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000),
        code: 'RATE_LIMIT_EXCEEDED',
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
    const contentType = req.headers['content-type'];
    
    if (!contentType || !expectedTypes.some(type => contentType.includes(type))) {
      logger.warn('Invalid content type', {
        path: req.path,
        method: req.method,
        contentType,
        expected: expectedTypes,
        ip: req.ip,
      });
      
      return res.status(415).json({
        error: 'Unsupported Media Type',
        message: `Content-Type must be one of: ${expectedTypes.join(', ')}`,
        code: 'INVALID_CONTENT_TYPE',
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
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      logger.warn('Request too large', {
        path: req.path,
        method: req.method,
        size: contentLength,
        maxSize,
        ip: req.ip,
      });
      
      return res.status(413).json({
        error: 'Payload Too Large',
        message: `Request size ${contentLength} bytes exceeds maximum ${maxSize} bytes`,
        code: 'REQUEST_TOO_LARGE',
      });
    }
    
    next();
  };
}

// Export commonly used validation combinations
export const validators = {
  uploadResume: validateRequest(validationSchemas.uploadResume),
  getResume: validateRequest(validationSchemas.getResume),
  createJob: validateRequest(validationSchemas.createJob),
  updateJob: validateRequest(validationSchemas.updateJob),
  analyzeResume: validateRequest(validationSchemas.analyzeResume),
  getAnalysis: validateRequest(validationSchemas.getAnalysis),
  generateQuestions: validateRequest(validationSchemas.generateQuestions),
  updateProfile: validateRequest(validationSchemas.updateProfile),
  
  // Rate limits
  rateLimitStrict: createRateLimit(60 * 1000, 10), // 10 requests per minute
  rateLimitModerate: createRateLimit(60 * 1000, 30), // 30 requests per minute
  rateLimitGenerous: createRateLimit(60 * 1000, 100), // 100 requests per minute
  
  // Content type validators
  jsonOnly: validateContentType(['application/json']),
  multipartOnly: validateContentType(['multipart/form-data']),
  jsonOrMultipart: validateContentType(['application/json', 'multipart/form-data']),
  
  // Size validators
  smallRequest: validateRequestSize(1024 * 1024), // 1MB
  mediumRequest: validateRequestSize(10 * 1024 * 1024), // 10MB
  largeRequest: validateRequestSize(50 * 1024 * 1024), // 50MB
};