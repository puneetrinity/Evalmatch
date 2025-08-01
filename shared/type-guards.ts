/**
 * Type Guards and Runtime Validation Utilities
 * 
 * This file provides comprehensive type guards for validating data
 * at runtime, ensuring type safety across the application boundary.
 */

import { z } from 'zod';
import type {
  UserId,
  SessionId,
  ResumeId,
  JobId,
  AnalysisId,
  FileHash,
  ApiResponse,
  ApiError,
  ApiResult,
  HealthResponse,
  LoginRequest,
  LoginResponse,
  ValidateTokenRequest,
  ValidateTokenResponse,
  ResumeUploadRequest,
  ResumeListResponse,
  ResumeDetailsResponse,
  JobCreateRequest,
  JobListResponse,
  JobDetailsResponse,
  AnalysisRequest,
  AnalysisResponse,
  InterviewQuestionsRequest,
  InterviewQuestionsResponse,
  AdminUsersResponse,
  AdminStatsResponse,
  MatchedSkill,
  FairnessMetrics,
  InterviewQuestion,
  ValidationError,
} from './api-contracts';

// Base type guards for primitive types
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isArray<T>(value: unknown, itemGuard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(itemGuard);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

export function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

// Branded type guards
export function isUserId(value: unknown): value is UserId {
  return isNonEmptyString(value);
}

export function isSessionId(value: unknown): value is SessionId {
  return isNonEmptyString(value);
}

export function isResumeId(value: unknown): value is ResumeId {
  return isPositiveNumber(value);
}

export function isJobId(value: unknown): value is JobId {
  return isPositiveNumber(value);
}

export function isAnalysisId(value: unknown): value is AnalysisId {
  return isPositiveNumber(value);
}

export function isFileHash(value: unknown): value is FileHash {
  return isNonEmptyString(value) && /^[a-f0-9]{32,64}$/i.test(value);
}

// Email validation
export function isValidEmail(value: unknown): value is string {
  return isString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// URL validation
export function isValidUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Date string validation (ISO 8601)
export function isValidDateString(value: unknown): value is string {
  return isString(value) && !isNaN(Date.parse(value));
}

// File type validation
export function isValidFileType(value: unknown): value is string {
  return isString(value) && /^(application|image|text)\/[\w.-]+$/.test(value);
}

// API Response type guards
export function isApiResponse<T>(
  value: unknown,
  dataGuard: (data: unknown) => data is T
): value is ApiResponse<T> {
  return (
    isObject(value) &&
    'success' in value &&
    value.success === true &&
    'data' in value &&
    dataGuard(value.data) &&
    'timestamp' in value &&
    isValidDateString(value.timestamp)
  );
}

export function isApiError(value: unknown): value is ApiError {
  return (
    isObject(value) &&
    'success' in value &&
    value.success === false &&
    'error' in value &&
    isNonEmptyString(value.error) &&
    'message' in value &&
    isNonEmptyString(value.message) &&
    'timestamp' in value &&
    isValidDateString(value.timestamp)
  );
}

export function isApiResult<T>(
  value: unknown,
  dataGuard: (data: unknown) => data is T
): value is ApiResult<T> {
  return isApiResponse(value, dataGuard) || isApiError(value);
}

// Health response type guard
export function isHealthResponse(value: unknown): value is HealthResponse {
  if (!isObject(value)) return false;
  
  return (
    'status' in value &&
    isString(value.status) &&
    ['healthy', 'degraded', 'unhealthy'].includes(value.status) &&
    'timestamp' in value &&
    isValidDateString(value.timestamp) &&
    'uptime' in value &&
    isNonNegativeNumber(value.uptime) &&
    'version' in value &&
    isNonEmptyString(value.version)
  );
}

// Authentication type guards
export function isLoginRequest(value: unknown): value is LoginRequest {
  return (
    isObject(value) &&
    'idToken' in value &&
    isNonEmptyString(value.idToken) &&
    'provider' in value &&
    isString(value.provider) &&
    ['google', 'email'].includes(value.provider)
  );
}

export function isLoginResponse(value: unknown): value is LoginResponse {
  if (!isObject(value)) return false;
  
  return (
    'user' in value &&
    isObject(value.user) &&
    'id' in value.user &&
    isUserId(value.user.id) &&
    'email' in value.user &&
    isValidEmail(value.user.email) &&
    'name' in value.user &&
    isNonEmptyString(value.user.name) &&
    'token' in value &&
    isNonEmptyString(value.token)
  );
}

export function isValidateTokenRequest(value: unknown): value is ValidateTokenRequest {
  return (
    isObject(value) &&
    'token' in value &&
    isNonEmptyString(value.token)
  );
}

export function isValidateTokenResponse(value: unknown): value is ValidateTokenResponse {
  if (!isObject(value)) return false;
  
  return (
    'valid' in value &&
    isBoolean(value.valid) &&
    (!('user' in value) || (
      isObject(value.user) &&
      'id' in value.user &&
      isUserId(value.user.id) &&
      'email' in value.user &&
      isValidEmail(value.user.email) &&
      'name' in value.user &&
      isNonEmptyString(value.user.name)
    ))
  );
}

// Resume type guards
export function isResumeListResponse(value: unknown): value is ResumeListResponse {
  if (!isObject(value)) return false;
  
  return (
    'resumes' in value &&
    isArray(value.resumes, (item): item is any => (
      isObject(item) &&
      'id' in item &&
      isResumeId(item.id) &&
      'filename' in item &&
      isNonEmptyString(item.filename) &&
      'fileSize' in item &&
      isNonNegativeNumber(item.fileSize) &&
      'fileType' in item &&
      isValidFileType(item.fileType) &&
      'uploadedAt' in item &&
      isValidDateString(item.uploadedAt)
    )) &&
    'totalCount' in value &&
    isNonNegativeNumber(value.totalCount)
  );
}

export function isResumeDetailsResponse(value: unknown): value is ResumeDetailsResponse {
  if (!isObject(value)) return false;
  
  return (
    'id' in value &&
    isResumeId(value.id) &&
    'filename' in value &&
    isNonEmptyString(value.filename) &&
    'fileSize' in value &&
    isNonNegativeNumber(value.fileSize) &&
    'fileType' in value &&
    isValidFileType(value.fileType) &&
    'analyzedData' in value &&
    isObject(value.analyzedData) &&
    'skills' in value.analyzedData &&
    isArray(value.analyzedData.skills, isString) &&
    'experience' in value.analyzedData &&
    isString(value.analyzedData.experience) &&
    'education' in value.analyzedData &&
    isArray(value.analyzedData.education, isString) &&
    'uploadedAt' in value &&
    isValidDateString(value.uploadedAt) &&
    'updatedAt' in value &&
    isValidDateString(value.updatedAt)
  );
}

// Job type guards
export function isJobCreateRequest(value: unknown): value is JobCreateRequest {
  return (
    isObject(value) &&
    'title' in value &&
    isNonEmptyString(value.title) &&
    'description' in value &&
    isNonEmptyString(value.description)
  );
}

export function isJobListResponse(value: unknown): value is JobListResponse {
  if (!isObject(value)) return false;
  
  return (
    'jobs' in value &&
    isArray(value.jobs, (item): item is any => (
      isObject(item) &&
      'id' in item &&
      isJobId(item.id) &&
      'title' in item &&
      isNonEmptyString(item.title) &&
      'description' in item &&
      isNonEmptyString(item.description) &&
      'createdAt' in item &&
      isValidDateString(item.createdAt)
    )) &&
    'totalCount' in value &&
    isNonNegativeNumber(value.totalCount)
  );
}

export function isJobDetailsResponse(value: unknown): value is JobDetailsResponse {
  if (!isObject(value)) return false;
  
  return (
    'id' in value &&
    isJobId(value.id) &&
    'title' in value &&
    isNonEmptyString(value.title) &&
    'description' in value &&
    isNonEmptyString(value.description) &&
    'analyzedData' in value &&
    isObject(value.analyzedData) &&
    'requiredSkills' in value.analyzedData &&
    isArray(value.analyzedData.requiredSkills, isString) &&
    'preferredSkills' in value.analyzedData &&
    isArray(value.analyzedData.preferredSkills, isString) &&
    'experienceLevel' in value.analyzedData &&
    isNonEmptyString(value.analyzedData.experienceLevel) &&
    'createdAt' in value &&
    isValidDateString(value.createdAt) &&
    'updatedAt' in value &&
    isValidDateString(value.updatedAt)
  );
}

// Analysis type guards
export function isMatchedSkill(value: unknown): value is MatchedSkill {
  return (
    isObject(value) &&
    'skill' in value &&
    isNonEmptyString(value.skill) &&
    'matchPercentage' in value &&
    isNumber(value.matchPercentage) &&
    value.matchPercentage >= 0 &&
    value.matchPercentage <= 100
  );
}

export function isFairnessMetrics(value: unknown): value is FairnessMetrics {
  return (
    isObject(value) &&
    'biasConfidenceScore' in value &&
    isNumber(value.biasConfidenceScore) &&
    value.biasConfidenceScore >= 0 &&
    value.biasConfidenceScore <= 100 &&
    'potentialBiasAreas' in value &&
    isArray(value.potentialBiasAreas, isString) &&
    'fairnessAssessment' in value &&
    isNonEmptyString(value.fairnessAssessment)
  );
}

export function isAnalysisRequest(value: unknown): value is AnalysisRequest {
  return (
    isObject(value) &&
    'jobId' in value &&
    isJobId(value.jobId)
  );
}

export function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (!isObject(value)) return false;
  
  return (
    'analysisId' in value &&
    isAnalysisId(value.analysisId) &&
    'jobId' in value &&
    isJobId(value.jobId) &&
    'results' in value &&
    isArray(value.results, (result): result is any => (
      isObject(result) &&
      'resumeId' in result &&
      isResumeId(result.resumeId) &&
      'filename' in result &&
      isNonEmptyString(result.filename) &&
      'matchPercentage' in result &&
      isNumber(result.matchPercentage) &&
      result.matchPercentage >= 0 &&
      result.matchPercentage <= 100 &&
      'matchedSkills' in result &&
      isArray(result.matchedSkills, isMatchedSkill) &&
      'missingSkills' in result &&
      isArray(result.missingSkills, isString) &&
      'candidateStrengths' in result &&
      isArray(result.candidateStrengths, isString) &&
      'candidateWeaknesses' in result &&
      isArray(result.candidateWeaknesses, isString) &&
      'recommendations' in result &&
      isArray(result.recommendations, isString) &&
      'confidenceLevel' in result &&
      isString(result.confidenceLevel) &&
      ['low', 'medium', 'high'].includes(result.confidenceLevel)
    )) &&
    'createdAt' in value &&
    isValidDateString(value.createdAt) &&
    'processingTime' in value &&
    isNonNegativeNumber(value.processingTime)
  );
}

// Interview questions type guards
export function isInterviewQuestion(value: unknown): value is InterviewQuestion {
  return (
    isObject(value) &&
    'question' in value &&
    isNonEmptyString(value.question) &&
    'category' in value &&
    isString(value.category) &&
    ['technical', 'behavioral', 'situational', 'cultural'].includes(value.category) &&
    'difficulty' in value &&
    isString(value.difficulty) &&
    ['easy', 'medium', 'hard'].includes(value.difficulty) &&
    'expectedAnswer' in value &&
    isNonEmptyString(value.expectedAnswer)
  );
}

export function isInterviewQuestionsRequest(value: unknown): value is InterviewQuestionsRequest {
  return (
    isObject(value) &&
    'resumeId' in value &&
    isResumeId(value.resumeId) &&
    'jobId' in value &&
    isJobId(value.jobId)
  );
}

export function isInterviewQuestionsResponse(value: unknown): value is InterviewQuestionsResponse {
  if (!isObject(value)) return false;
  
  return (
    'resumeId' in value &&
    isResumeId(value.resumeId) &&
    'jobId' in value &&
    isJobId(value.jobId) &&
    'jobTitle' in value &&
    isNonEmptyString(value.jobTitle) &&
    'questions' in value &&
    isArray(value.questions, isInterviewQuestion) &&
    'estimatedDuration' in value &&
    isPositiveNumber(value.estimatedDuration) &&
    'createdAt' in value &&
    isValidDateString(value.createdAt)
  );
}

// Environment variable type guards
export function isValidDatabaseUrl(value: unknown): value is string {
  return isString(value) && (
    value.startsWith('postgres://') ||
    value.startsWith('postgresql://') ||
    value.startsWith('file:') ||
    value === ':memory:'
  );
}

export function isValidPort(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 1 && value <= 65535;
}

export function isValidLogLevel(value: unknown): value is string {
  return isString(value) && ['error', 'warn', 'info', 'debug', 'trace'].includes(value.toLowerCase());
}

export function isValidNodeEnv(value: unknown): value is string {
  return isString(value) && ['development', 'test', 'production'].includes(value.toLowerCase());
}

// File validation type guards
export function isValidFileSize(size: unknown, maxSize: number = 10 * 1024 * 1024): boolean {
  return isNonNegativeNumber(size) && size <= maxSize;
}

export function isValidFilename(value: unknown): value is string {
  return isNonEmptyString(value) && !/[<>:"/\\|?*]/.test(value) && value.length <= 255;
}

export function isSupportedFileType(mimetype: unknown): boolean {
  const supportedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];
  return isString(mimetype) && supportedTypes.includes(mimetype);
}

// External API validation type guards
export function isFirebaseIdToken(value: unknown): boolean {
  return isNonEmptyString(value) && value.split('.').length === 3;
}

export function isValidApiKey(value: unknown): value is string {
  return isNonEmptyString(value) && value.length >= 16;
}

// Validation utilities
export function validateRequired<T>(value: T | null | undefined, fieldName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

export function validateArray<T>(
  value: unknown,
  itemValidator: (item: unknown) => item is T,
  fieldName: string
): T[] {
  if (!isArray(value, itemValidator)) {
    throw new Error(`${fieldName} must be a valid array`);
  }
  return value;
}

export function validateObject<T>(
  value: unknown,
  validator: (obj: unknown) => obj is T,
  fieldName: string
): T {
  if (!validator(value)) {
    throw new Error(`${fieldName} is not a valid object`);
  }
  return value;
}

// Zod schemas for runtime validation
export const UserIdSchema = z.string().min(1);
export const SessionIdSchema = z.string().min(1);
export const ResumeIdSchema = z.number().int().positive();
export const JobIdSchema = z.number().int().positive();
export const AnalysisIdSchema = z.number().int().positive();

export const FileUploadSchema = z.object({
  originalname: z.string().min(1),
  mimetype: z.string().refine(isSupportedFileType, 'Unsupported file type'),
  size: z.number().nonnegative().max(10 * 1024 * 1024, 'File too large'),
  buffer: z.instanceof(Buffer).optional(),
  path: z.string().optional(),
});

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    success: z.literal(true),
    timestamp: z.string().datetime(),
  });

export const ApiErrorSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
  success: z.literal(false),
  timestamp: z.string().datetime(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

// Export a validation function factory
export function createValidator<T>(
  schema: z.ZodSchema<T>
): (data: unknown) => { success: true; data: T } | { success: false; error: string } {
  return (data: unknown) => {
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      return { success: false, error: result.error.message };
    }
  };
}