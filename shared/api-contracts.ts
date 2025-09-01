/**
 * Single Source of Truth for API Routes and Type Definitions
 * 
 * This file defines ALL API routes and their corresponding types.
 * Both frontend and backend should import from this file.
 * This prevents API endpoint mismatches and ensures type safety.
 */

// Branded types for better type safety
export type UserId = string & { readonly _brand: 'UserId' };
export type SessionId = string & { readonly _brand: 'SessionId' };
export type ResumeId = number & { readonly _brand: 'ResumeId' };
export type JobId = number & { readonly _brand: 'JobId' };
export type AnalysisId = number & { readonly _brand: 'AnalysisId' };
export type FileHash = string & { readonly _brand: 'FileHash' };

// Utility type for creating branded types
export const createBrandedId = <T extends string | number, Brand extends string>(
  value: T
): T & { readonly _brand: Brand } => {
  return value as T & { readonly _brand: Brand };
};

// API Response wrapper types
export interface ApiResponse<T = unknown> {
  data: T;
  success: true;
  timestamp: string;
}

export interface ApiError {
  error: string;
  message: string;
  success: false;
  timestamp: string;
  code?: string;
  details?: Record<string, unknown>;
}

export type ApiResult<T = unknown> = ApiResponse<T> | ApiError;

// Type guard for API responses
export function isApiError(response: ApiResult): response is ApiError {
  return !response.success;
}

export function isApiSuccess<T>(response: ApiResult<T>): response is ApiResponse<T> {
  return response.success;
}

export const API_BASE = '/api';

export const API_ROUTES = {
  // Health & Status
  HEALTH: {
    BASIC: `${API_BASE}/health`,
    DETAILED: `${API_BASE}/health/detailed`,
    RAILWAY: `${API_BASE}/health/railway`,
    PING: `${API_BASE}/ping`,
    MIGRATION_STATUS: `${API_BASE}/migration-status`,
    DB_STATUS: `${API_BASE}/db-status`,
  },

  // Authentication
  AUTH: {
    LOGIN: `${API_BASE}/auth/login`,
    LOGOUT: `${API_BASE}/auth/logout`,
    PROFILE: `${API_BASE}/user/profile`,
    VALIDATE_TOKEN: `${API_BASE}/user/validate-token`,
  },

  // Resume Management
  RESUMES: {
    LIST: `${API_BASE}/resumes`,
    UPLOAD: `${API_BASE}/resumes`,
    GET_BY_ID: `${API_BASE}/resumes/:id`,
    BATCH_UPLOAD: `${API_BASE}/resumes/batch`,
  },

  // Job Description Management
  JOBS: {
    CREATE: `${API_BASE}/job-descriptions`,
    LIST: `${API_BASE}/job-descriptions`,
    GET_BY_ID: `${API_BASE}/job-descriptions/:id`,
    UPDATE: `${API_BASE}/job-descriptions/:id`,
    DELETE: `${API_BASE}/job-descriptions/:id`,
  },

  // Analysis
  ANALYSIS: {
    ANALYZE_JOB: `${API_BASE}/analysis/analyze/:jobId`,
    GET_ANALYSIS: `${API_BASE}/analysis/analyze/:jobId`,
    GET_ANALYSIS_BY_RESUME: `${API_BASE}/analysis/analyze/:jobId/:resumeId`,
    ANALYZE_BIAS: `${API_BASE}/analysis/analyze-bias/:jobId`,
    GENERATE_INTERVIEW: `${API_BASE}/analysis/interview-questions/:resumeId/:jobId`,
  },

  // Admin
  ADMIN: {
    USERS: `${API_BASE}/admin/users`,
    STATS: `${API_BASE}/admin/stats`,
    CLEANUP: `${API_BASE}/admin/cleanup`,
  },

  // Debug (Development only)
  DEBUG: {
    STATUS: `${API_BASE}/debug/status`,
    DB_TYPE: `${API_BASE}/debug/db-type`,
    ROUTES_INFO: `${API_BASE}/routes-info`,
  },
} as const;

// Enhanced type-safe route parameter replacement
export function buildRoute<T extends Record<string, string | number>>(
  route: string, 
  params: T
): string {
  let builtRoute = route;
  Object.entries(params).forEach(([key, value]) => {
    builtRoute = builtRoute.replace(`:${key}`, String(value));
  });
  return builtRoute;
}

// Type-safe route builders for specific endpoints
export const buildAnalysisRoute = (jobId: JobId, resumeId?: ResumeId): string => {
  const base = API_ROUTES.ANALYSIS.GET_ANALYSIS.replace(':jobId', String(jobId));
  return resumeId ? base.replace(':resumeId', String(resumeId)) : base;
};

export const buildResumeRoute = (resumeId: ResumeId): string => {
  return API_ROUTES.RESUMES.GET_BY_ID.replace(':id', String(resumeId));
};

export const buildJobRoute = (jobId: JobId): string => {
  return API_ROUTES.JOBS.GET_BY_ID.replace(':id', String(jobId));
};

// Validation helpers
export function isValidRoute(route: string): boolean {
  const allRoutes = Object.values(API_ROUTES).flatMap(group => 
    Object.values(group)
  );
  return allRoutes.some(r => {
    // Convert route pattern to regex
    const pattern = r.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(route);
  });
}

// Request/Response type definitions for API endpoints

// Health endpoint types
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  database?: {
    connected: boolean;
    connectionCount?: number;
    queryTime?: number;
  };
  services?: Record<string, 'up' | 'down' | 'degraded'>;
}

// Auth endpoint types
export interface LoginRequest {
  idToken: string;
  provider: 'google' | 'email';
}

export interface LoginResponse {
  user: {
    id: UserId;
    email: string;
    name: string;
    avatar?: string;
  };
  token: string;
  refreshToken?: string;
}

export interface ValidateTokenRequest {
  token: string;
}

export interface ValidateTokenResponse {
  valid: boolean;
  user?: {
    id: UserId;
    email: string;
    name: string;
  };
  expiresAt?: string;
}

// Resume endpoint types
export interface ResumeUploadRequest {
  file: File | Buffer;
  sessionId?: SessionId;
  userId?: UserId;
  batchId?: string;
  autoAnalyze?: boolean;
}

export interface ResumeListResponse {
  resumes: Array<{
    id: ResumeId;
    filename: string;
    fileSize: number;
    fileType: string;
    uploadedAt: string;
    analyzedData?: {
      skills?: string[];
      experience?: string;
      education?: string[];
    };
  }>;
  sessionId?: SessionId;
  totalCount: number;
}

export interface ResumeUploadResponse {
  resumeId: ResumeId;
  filename: string;
  status: 'uploaded' | 'processed';
  message?: string;
}

export interface ResumeListQuery {
  page?: number;
  limit?: number;
  search?: string;
  sessionId?: SessionId;
}

export interface ResumeItem {
  id: ResumeId;
  filename: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  analyzedData?: {
    skills?: string[];
    experience?: string;
    education?: string[];
  };
}

export interface ResumeDetailsResponse {
  id: ResumeId;
  filename: string;
  fileSize: number;
  fileType: string;
  content?: string;
  analyzedData: {
    name?: string;
    skills: string[];
    experience: string;
    education: string[];
    summary?: string;
    keyStrengths?: string[];
  };
  uploadedAt: string;
  updatedAt: string;
}

// Job description endpoint types
export interface JobCreateRequest {
  title: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  experience?: string;
  userId?: UserId;
}

export interface JobCreateResponse {
  jobId: JobId;
  title: string;
  status: 'created' | 'analyzed';
  message?: string;
}

export interface JobItem {
  id: JobId;
  title: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  experience?: string;
  createdAt: string;
  analyzedData?: {
    skills?: string[];
    requirements?: string[];
    experience?: string;
  };
}

export interface JobListResponse {
  jobs: Array<{
    id: JobId;
    title: string;
    description: string;
    createdAt: string;
    analyzedData?: {
      requiredSkills?: string[];
      preferredSkills?: string[];
      experienceLevel?: string;
    };
  }>;
  totalCount: number;
}

export interface JobDetailsResponse {
  id: JobId;
  title: string;
  description: string;
  requirements?: string[];
  skills?: string[];
  experience?: string;
  analyzedData: {
    requiredSkills: string[];
    preferredSkills: string[];
    experienceLevel: string;
    responsibilities: string[];
    summary: string;
  };
  createdAt: string;
  updatedAt: string;
}

// Analysis endpoint types
export interface AnalysisRequest {
  jobId: JobId;
  sessionId?: SessionId;
  userId?: UserId;
  resumeIds?: ResumeId[];
}

export interface MatchedSkill {
  skill: string;
  matchPercentage: number;
  category?: string;
  importance?: 'high' | 'medium' | 'low';
}

export interface FairnessMetrics {
  biasConfidenceScore: number;
  potentialBiasAreas: string[];
  fairnessAssessment: string;
  recommendations?: string[];
}

export interface MatchInsights {
  matchStrength: 'EXCELLENT' | 'STRONG' | 'MODERATE' | 'WEAK';
  overallScore: number;
  keyStrengths: string[];
  areasToExplore: string[];
  interviewFocus: string[];
  riskFactors: string[];
  domainExpertise?: {
    domain: string;
    level: 'Expert' | 'Experienced' | 'Familiar' | 'Limited';
    bonus: number;
  };
  summary: string;
}

export interface AnalysisResponse {
  analysisId: AnalysisId;
  jobId: JobId;
  results: Array<{
    resumeId: ResumeId;
    filename: string;
    candidateName?: string;
    matchPercentage: number;
    matchedSkills: MatchedSkill[];
    missingSkills: string[];
    candidateStrengths: string[];
    candidateWeaknesses: string[];
    recommendations: string[];
    confidenceLevel: 'low' | 'medium' | 'high';
    fairnessMetrics?: FairnessMetrics;
    scoringDimensions?: {
      skills: number;
      experience: number;
      education: number;
      semantic: number;
      overall: number;
    };
    matchInsights?: MatchInsights;
  }>;
  createdAt: string;
  processingTime: number;
}

// Type alias for backward compatibility
export type AnalysisResult = AnalysisResponse;

// Interview questions endpoint types
export interface InterviewQuestion {
  question: string;
  category: 'technical' | 'behavioral' | 'situational' | 'problem-solving';
  difficulty: 'easy' | 'medium' | 'hard';
  expectedAnswer: string;
  followUpQuestions?: string[];
  skillsAssessed?: string[];
}

export interface InterviewQuestionsRequest {
  resumeId: ResumeId;
  jobId: JobId;
  questionCount?: number;
  focusAreas?: string[];
}

export interface InterviewQuestionsResponse {
  resumeId: ResumeId;
  jobId: JobId;
  candidateName?: string;
  jobTitle: string;
  questions: InterviewQuestion[];
  preparationTips?: string[];
  estimatedDuration: number;
  createdAt: string;
}

// Admin endpoint types
export interface AdminUsersResponse {
  users: Array<{
    id: UserId;
    email: string;
    name: string;
    createdAt: string;
    lastLoginAt?: string;
    resumeCount: number;
    jobCount: number;
    analysisCount: number;
  }>;
  totalCount: number;
  activeUsers: number;
}

export interface AdminStatsResponse {
  totalUsers: number;
  totalResumes: number;
  totalJobs: number;
  totalAnalyses: number;
  dailyActiveUsers: number;
  systemHealth: {
    database: 'healthy' | 'degraded' | 'down';
    storage: 'healthy' | 'degraded' | 'down';
    aiProviders: Record<string, 'healthy' | 'degraded' | 'down'>;
  };
  resourceUsage: {
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
  };
}

// Error types for specific endpoints
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ApiValidationError extends ApiError {
  code: 'VALIDATION_ERROR';
  details: {
    validationErrors: ValidationError[];
  };
}

export interface ApiAuthError extends ApiError {
  code: 'AUTH_ERROR' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN';
}

export interface ApiNotFoundError extends ApiError {
  code: 'NOT_FOUND';
  details: {
    resource: string;
    id: string | number;
  };
}

// Export types for TypeScript
export type ApiRoutes = typeof API_ROUTES;
export type RouteGroup = keyof ApiRoutes;
export type Route<T extends RouteGroup> = keyof ApiRoutes[T];

// Type utilities for API responses
export type ExtractApiResponseData<T> = T extends ApiResponse<infer U> ? U : never;
export type ApiResponseOf<T> = ApiResponse<T>;
export type ApiResultOf<T> = ApiResult<T>;