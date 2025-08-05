/**
 * Runtime Validation for Critical Data Flows
 * 
 * This module provides runtime validation utilities that ensure
 * data integrity across API boundaries and critical operations.
 */

import { z } from 'zod';
import type {
  UserId,
  SessionId,
  ResumeId,
  JobId,
  AnalysisId,
  FileHash,
  EmailAddress,
  ValidationResult,
  Result,
} from './utility-types';

// Core validation schemas
export const UserIdValidation = z.string().min(1, 'User ID cannot be empty');
export const SessionIdValidation = z.string().min(1, 'Session ID cannot be empty');
export const ResumeIdValidation = z.number().int().positive('Resume ID must be positive');
export const JobIdValidation = z.number().int().positive('Job ID must be positive');
export const AnalysisIdValidation = z.number().int().positive('Analysis ID must be positive');
export const EmailValidation = z.string().email('Invalid email format');
export const UrlValidation = z.string().url('Invalid URL format');

// File validation schemas
export const FileHashValidation = z.string().regex(/^[a-f0-9]{32,64}$/i, 'Invalid file hash format');
export const FileSizeValidation = z.number().nonnegative().max(50 * 1024 * 1024, 'File too large (max 50MB)');
export const FilenameValidation = z.string()
  .min(1, 'Filename cannot be empty')
  .max(255, 'Filename too long')
  .regex(/^[^<>:"/\\|?*\x00-\x1f]+$/, 'Filename contains invalid characters');

export const SupportedMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const MimeTypeValidation = z.enum(SupportedMimeTypes);

// File upload validation schema
export const FileUploadValidation = z.object({
  originalname: FilenameValidation,
  mimetype: MimeTypeValidation,
  size: FileSizeValidation,
  buffer: z.instanceof(Buffer).optional(),
  path: z.string().optional(),
}).refine(data => data.buffer || data.path, {
  message: 'File must have either buffer or path',
});

// API request validation schemas
export const PaginationValidation = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const SearchValidation = z.object({
  query: z.string().min(1).max(500).optional(),
  filters: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  dateRange: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }).optional(),
});

// Resume and job validation schemas
export const SkillValidation = z.string().min(1).max(100).trim();
export const SkillArrayValidation = z.array(SkillValidation).min(1).max(200);

export const ResumeAnalysisValidation = z.object({
  name: z.string().min(1).max(200),
  skills: SkillArrayValidation,
  experience: z.string().min(1).max(10000),
  education: z.array(z.string().min(1).max(200)),
  summary: z.string().min(10).max(2000),
  keyStrengths: z.array(z.string().min(1).max(200)),
  contactInfo: z.object({
    email: EmailValidation.optional(),
    phone: z.string().regex(/^[\+]?[1-9][\d]{0,15}$/).optional(),
    location: z.string().min(1).max(100).optional(),
    linkedin: UrlValidation.optional(),
  }).optional(),
});

export const JobAnalysisValidation = z.object({
  requiredSkills: SkillArrayValidation,
  preferredSkills: z.array(SkillValidation).max(100),
  experienceLevel: z.string().min(1).max(50),
  responsibilities: z.array(z.string().min(1).max(500)).min(1).max(50),
  summary: z.string().min(10).max(2000),
  department: z.string().min(1).max(100).optional(),
  location: z.string().min(1).max(100).optional(),
  workArrangement: z.enum(['remote', 'hybrid', 'onsite']).optional(),
});

// Analysis result validation schemas
export const MatchedSkillValidation = z.object({
  skill: z.string().min(1),
  matchPercentage: z.number().min(0).max(100),
  category: z.string().min(1),
  importance: z.enum(['critical', 'important', 'nice-to-have']),
  source: z.enum(['exact', 'semantic', 'inferred']),
});

export const ScoringDimensionsValidation = z.object({
  skills: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  education: z.number().min(0).max(100),
  semantic: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
});

export const FairnessMetricsValidation = z.object({
  biasConfidenceScore: z.number().min(0).max(100),
  potentialBiasAreas: z.array(z.string().min(1)),
  fairnessAssessment: z.string().min(10),
  demographicBlindSpots: z.array(z.string()).optional(),
  inclusivityScore: z.number().min(0).max(100).optional(),
  recommendations: z.array(z.string().min(1)).optional(),
});

export const AnalysisResultValidation = z.object({
  resumeId: ResumeIdValidation,
  filename: FilenameValidation,
  candidateName: z.string().min(1).max(200).optional(),
  matchPercentage: z.number().min(0).max(100),
  matchedSkills: z.array(MatchedSkillValidation),
  missingSkills: z.array(z.string().min(1)),
  candidateStrengths: z.array(z.string().min(1)),
  candidateWeaknesses: z.array(z.string().min(1)),
  recommendations: z.array(z.string().min(1)),
  confidenceLevel: z.enum(['low', 'medium', 'high']),
  scoringDimensions: ScoringDimensionsValidation.optional(),
  fairnessMetrics: FairnessMetricsValidation.optional(),
});

// Interview question validation
export const InterviewQuestionValidation = z.object({
  question: z.string().min(10).max(1000),
  category: z.enum(['technical', 'behavioral', 'situational', 'problem-solving']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  expectedAnswer: z.string().min(10).max(2000),
  followUpQuestions: z.array(z.string().min(5).max(500)).optional(),
  skillsAssessed: z.array(SkillValidation).min(1),
  timeAllotted: z.number().positive().optional(),
  evaluationCriteria: z.array(z.string().min(5).max(200)).optional(),
});

// Environment variable validation
export const DatabaseConfigValidation = z.object({
  DATABASE_URL: z.string().url().optional(),
  DB_TYPE: z.enum(['postgresql', 'sqlite', 'memory']).default('postgresql'),
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_SSL: z.coerce.boolean().default(false),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
});

export const ServerConfigValidation = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SESSION_SECRET: z.string().min(32, 'Session secret must be at least 32 characters'),
});

// API response validation
export const ApiResponseValidation = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    success: z.literal(true),
    timestamp: z.string().datetime(),
  });

export const ApiErrorValidation = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
  success: z.literal(false),
  timestamp: z.string().datetime(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

// Validation utility functions
export function validateWithSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  errorContext?: string
): ValidationResult<T> {
  try {
    const validatedData = schema.parse(data);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
        value: 'input' in err ? err.input : undefined,
      }));
      
      return {
        success: false,
        errors: errors.map(err => ({
          ...err,
          message: errorContext ? `${errorContext}: ${err.message}` : err.message,
        })),
      };
    }
    
    return {
      success: false,
      errors: [{
        field: 'unknown',
        message: errorContext ? `${errorContext}: ${(error as Error).message}` : (error as Error).message,
        code: 'UNKNOWN_ERROR',
      }],
    };
  }
}

export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Result<T, z.ZodError> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// Validation middleware helpers
export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    const result = validateWithSchema(schema, data, 'Request validation failed');
    if (!result.success) {
      const message = result.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || 'Validation failed';
      throw new Error(message);
    }
    return result.data!;
  };
}

export function validateResponse<T>(schema: z.ZodSchema<T>) {
  return (data: unknown): T => {
    const result = validateWithSchema(schema, data, 'Response validation failed');
    if (!result.success) {
      const message = result.errors?.map(e => `${e.field}: ${e.message}`).join(', ') || 'Response validation failed';
      throw new Error(message);
    }
    return result.data!;
  };
}

// File-specific validation functions
export function validateUploadedFile(file: unknown): ValidationResult<{
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
  path?: string;
}> {
  return validateWithSchema(FileUploadValidation, file, 'File upload validation');
}

export function validateFileSize(size: number, maxSize: number = 50 * 1024 * 1024): boolean {
  return size > 0 && size <= maxSize;
}

export function validateMimeType(mimetype: string): boolean {
  return SupportedMimeTypes.includes(mimetype as any);
}

export function validateFilename(filename: string): boolean {
  return FilenameValidation.safeParse(filename).success;
}

// ID validation functions
export function validateUserId(id: unknown): id is UserId {
  return UserIdValidation.safeParse(id).success;
}

export function validateSessionId(id: unknown): id is SessionId {
  return SessionIdValidation.safeParse(id).success;
}

export function validateResumeId(id: unknown): id is ResumeId {
  return ResumeIdValidation.safeParse(id).success;
}

export function validateJobId(id: unknown): id is JobId {
  return JobIdValidation.safeParse(id).success;
}

export function validateEmail(email: unknown): email is EmailAddress {
  return EmailValidation.safeParse(email).success;
}

// Bulk validation functions
export function validateSkillArray(skills: unknown): ValidationResult<string[]> {
  return validateWithSchema(SkillArrayValidation, skills, 'Skills validation');
}

export function validateAnalysisResults(results: unknown): ValidationResult<Array<any>> {
  const schema = z.array(AnalysisResultValidation);
  return validateWithSchema(schema, results, 'Analysis results validation');
}

export function validateInterviewQuestions(questions: unknown): ValidationResult<Array<any>> {
  const schema = z.array(InterviewQuestionValidation);
  return validateWithSchema(schema, questions, 'Interview questions validation');
}

// Security validation functions
export function validatePasswordStrength(password: string): ValidationResult<string> {
  const schema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character');
  
  return validateWithSchema(schema, password, 'Password validation');
}

export function validateApiKey(key: unknown): boolean {
  return typeof key === 'string' && key.length >= 16 && /^[A-Za-z0-9_-]+$/.test(key);
}

export function validateBearerToken(token: unknown): boolean {
  return typeof token === 'string' && token.length > 0 && !/\s/.test(token);
}

// Rate limiting validation
export function validateRateLimitConfig(config: unknown): ValidationResult<{
  windowMs: number;
  maxRequests: number;
}> {
  const schema = z.object({
    windowMs: z.number().positive(),
    maxRequests: z.number().positive(),
  });
  
  return validateWithSchema(schema, config, 'Rate limit configuration validation');
}

// JSON validation utilities
export function validateJson<T>(
  jsonString: string,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  try {
    const parsed = JSON.parse(jsonString);
    return validateWithSchema(schema, parsed, 'JSON validation');
  } catch (error) {
    return {
      success: false,
      errors: [{
        field: 'json',
        message: 'Invalid JSON format',
        code: 'INVALID_JSON',
      }],
    };
  }
}

// Environment-specific validation
export function validateProductionEnvironment(env: Record<string, string | undefined>): ValidationResult<void> {
  const requiredKeys = [
    'DATABASE_URL',
    'SESSION_SECRET',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
  ];
  
  const missing = requiredKeys.filter(key => !env[key]);
  
  if (missing.length > 0) {
    return {
      success: false,
      errors: missing.map(key => ({
        field: key,
        message: `Required environment variable ${key} is missing`,
        code: 'MISSING_ENV_VAR',
      })),
    };
  }
  
  return { success: true };
}

// Data sanitization functions
export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, maxLength);
}

export function sanitizeSkills(skills: string[]): string[] {
  return skills
    .map(skill => sanitizeString(skill, 100))
    .filter(skill => skill.length > 0)
    .slice(0, 200); // Limit total number of skills
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Export all validation schemas for reuse
export const ValidationSchemas = {
  UserId: UserIdValidation,
  SessionId: SessionIdValidation,
  ResumeId: ResumeIdValidation,
  JobId: JobIdValidation,
  Email: EmailValidation,
  FileUpload: FileUploadValidation,
  ResumeAnalysis: ResumeAnalysisValidation,
  JobAnalysis: JobAnalysisValidation,
  AnalysisResult: AnalysisResultValidation,
  InterviewQuestion: InterviewQuestionValidation,
  Pagination: PaginationValidation,
  Search: SearchValidation,
} as const;