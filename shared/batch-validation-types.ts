/**
 * Batch Validation and Ownership Types
 * 
 * Shared TypeScript interfaces and types for batch validation, ownership,
 * and security features. Used by both client and server components.
 */

import type { SessionId } from './api-contracts';

// Core batch ownership interface
export interface BatchOwnership {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  resumeCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
  isOrphaned: boolean;
  isValid: boolean;
  metadataIntegrityCheck: boolean;
}

// Batch validation result
export interface BatchValidationResult {
  valid: boolean;
  batchId: string;
  ownership: BatchOwnership | null;
  errors: string[];
  warnings: string[];
  securityFlags: string[];
  integrityChecks: {
    resumesExist: boolean;
    sessionMatches: boolean;
    userAuthorized: boolean;
    dataConsistent: boolean;
  };
}

// Security context for batch operations
export interface BatchSecurityContext {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  accessType: 'read' | 'write' | 'delete' | 'claim';
  riskScore: number;
  flags: string[];
}

// Enhanced batch status
export interface BatchStatus {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  status: 'active' | 'orphaned' | 'expired' | 'corrupted';
  resumeCount: number;
  createdAt: Date;
  lastAccessedAt: Date;
  analysisCount: number;
  integrityStatus: {
    resumesValid: boolean;
    analysisValid: boolean;
    metadataConsistent: boolean;
    dataCorrupted: boolean;
  };
  warnings: string[];
  canClaim: boolean;
  autoCleanupDate?: Date;
}

// Batch claim result
export interface BatchClaimResult {
  success: boolean;
  message: string;
  batchId: string;
  newSessionId?: SessionId;
  resumeCount: number;
  warnings: string[];
}

// Batch deletion result
export interface BatchDeletionResult {
  success: boolean;
  message: string;
  deletedItems: {
    resumes: number;
    analysisResults: number;
    interviewQuestions: number;
  };
  warnings: string[];
}

// Batch operation response wrapper
export interface BatchOperationResponse<T = unknown> {
  success: boolean;
  message: string;
  code?: string;
  data?: T;
  errors?: string[];
  warnings?: string[];
  securityFlags?: string[];
  timestamp?: string;
}

// Batch resume info (for listing resumes in batch)
export interface BatchResumeInfo {
  id: number;
  filename: string;
  fileSize?: number;
  fileType?: string;
  analyzedData?: any;
  createdAt: Date;
  updatedAt: Date;
  hasAnalysis: boolean;
}

// Batch cleanup candidate
export interface BatchCleanupCandidate {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  resumeCount: number;
  createdAt: Date;
  lastUpdated: Date;
  hoursInactive: number;
}

// Batch validation API request types
export interface ValidateBatchRequest {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
}

export interface ClaimBatchRequest {
  sessionId: SessionId;
  userId?: string;
  force?: boolean;
}

// API response types for batch operations
export type ValidateBatchResponse = BatchOperationResponse<{
  batchId: string;
  valid: boolean;
  ownership: BatchOwnership | null;
  integrityChecks: BatchValidationResult['integrityChecks'];
  errors: string[];
  warnings: string[];
  securityFlags: string[];
  timestamp: string;
}>;

export type BatchStatusResponse = BatchOperationResponse<BatchStatus>;

export type ClaimBatchResponse = BatchOperationResponse<BatchClaimResult>;

export type DeleteBatchResponse = BatchOperationResponse<BatchDeletionResult>;

export type BatchResumesResponse = BatchOperationResponse<{
  batchId: string;
  sessionId: SessionId;
  resumeCount: number;
  resumes: BatchResumeInfo[];
}>;

export type CleanupCandidatesResponse = BatchOperationResponse<{
  candidateCount: number;
  cutoffDate: string;
  candidates: BatchCleanupCandidate[];
}>;

// Security and validation error codes
export enum BatchErrorCode {
  // Validation errors
  MISSING_BATCH_ID = 'MISSING_BATCH_ID',
  MISSING_SESSION_ID = 'MISSING_SESSION_ID',
  INVALID_BATCH_ID_FORMAT = 'INVALID_BATCH_ID_FORMAT',
  INVALID_SESSION_ID_FORMAT = 'INVALID_SESSION_ID_FORMAT',
  
  // Access errors
  BATCH_NOT_FOUND = 'BATCH_NOT_FOUND',
  BATCH_ACCESS_DENIED = 'BATCH_ACCESS_DENIED',
  SESSION_MISMATCH = 'SESSION_MISMATCH',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  
  // Security errors
  HIGH_RISK_ACCESS = 'HIGH_RISK_ACCESS',
  SECURITY_CLAIM_DENIED = 'SECURITY_CLAIM_DENIED',
  METADATA_INCONSISTENCY = 'METADATA_INCONSISTENCY',
  
  // Operation errors
  BATCH_NOT_CLAIMABLE = 'BATCH_NOT_CLAIMABLE',
  NO_RESUMES_FOUND = 'NO_RESUMES_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CLAIM_ERROR = 'CLAIM_ERROR',
  DELETION_ERROR = 'DELETION_ERROR',
  STATUS_ERROR = 'STATUS_ERROR',
  RESUMES_ERROR = 'RESUMES_ERROR',
  CLEANUP_ERROR = 'CLEANUP_ERROR',
}

// Security flags
export enum BatchSecurityFlag {
  // Format validation flags
  INVALID_BATCH_ID_FORMAT = 'INVALID_BATCH_ID_FORMAT',
  INVALID_SESSION_ID_FORMAT = 'INVALID_SESSION_ID_FORMAT',
  
  // Access control flags
  SESSION_MISMATCH = 'SESSION_MISMATCH',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  HIGH_RISK_BLOCKED = 'HIGH_RISK_BLOCKED',
  
  // Data integrity flags
  METADATA_INCONSISTENCY = 'METADATA_INCONSISTENCY',
  DATA_CORRUPTION = 'DATA_CORRUPTION',
  
  // Access granted flag
  ACCESS_GRANTED = 'ACCESS_GRANTED',
  
  // General validation error
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

// Batch status enums
export enum BatchStatusType {
  ACTIVE = 'active',
  ORPHANED = 'orphaned',
  EXPIRED = 'expired',
  CORRUPTED = 'corrupted',
}

export enum BatchAccessType {
  READ = 'read',
  WRITE = 'write',
  DELETE = 'delete',
  CLAIM = 'claim',
}

// Rate limiting configuration for batch operations
export interface BatchRateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: any) => string;
  message?: string;
}

// Configuration constants
export const BATCH_VALIDATION_CONSTANTS = {
  ORPHANED_THRESHOLD_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_BATCH_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  HIGH_RISK_THRESHOLD: 75,
  MAX_BATCH_ID_LENGTH: 100,
  MAX_SESSION_ID_LENGTH: 100,
  
  // Rate limiting
  VALIDATION_RATE_LIMIT: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
  CLAIM_RATE_LIMIT: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 3,
  },
  DELETE_RATE_LIMIT: {
    windowMs: 2 * 60 * 1000, // 2 minutes
    maxRequests: 5,
  },
} as const;

// Type guards
export function isBatchValidationResult(obj: any): obj is BatchValidationResult {
  return obj && 
    typeof obj.valid === 'boolean' &&
    typeof obj.batchId === 'string' &&
    Array.isArray(obj.errors) &&
    Array.isArray(obj.warnings) &&
    Array.isArray(obj.securityFlags) &&
    obj.integrityChecks &&
    typeof obj.integrityChecks.resumesExist === 'boolean' &&
    typeof obj.integrityChecks.sessionMatches === 'boolean' &&
    typeof obj.integrityChecks.userAuthorized === 'boolean' &&
    typeof obj.integrityChecks.dataConsistent === 'boolean';
}

export function isBatchOwnership(obj: any): obj is BatchOwnership {
  return obj &&
    typeof obj.batchId === 'string' &&
    typeof obj.sessionId === 'string' &&
    typeof obj.resumeCount === 'number' &&
    obj.createdAt instanceof Date &&
    obj.lastAccessedAt instanceof Date &&
    typeof obj.isOrphaned === 'boolean' &&
    typeof obj.isValid === 'boolean' &&
    typeof obj.metadataIntegrityCheck === 'boolean';
}

export function isBatchStatus(obj: any): obj is BatchStatus {
  return obj &&
    typeof obj.batchId === 'string' &&
    typeof obj.sessionId === 'string' &&
    ['active', 'orphaned', 'expired', 'corrupted'].includes(obj.status) &&
    typeof obj.resumeCount === 'number' &&
    obj.createdAt instanceof Date &&
    obj.lastAccessedAt instanceof Date &&
    typeof obj.analysisCount === 'number' &&
    obj.integrityStatus &&
    typeof obj.canClaim === 'boolean';
}

// Utility functions
export function createBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export function createSessionId(): SessionId {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 10)}` as SessionId;
}

export function isValidBatchIdFormat(batchId: string): boolean {
  return /^batch_[0-9]+_[a-z0-9]+$/.test(batchId);
}

export function isValidSessionIdFormat(sessionId: string): boolean {
  return /^session_[0-9]+_[a-z0-9]+$/.test(sessionId);
}

export function calculateBatchAge(createdAt: Date): number {
  return Date.now() - createdAt.getTime();
}

export function isBatchOrphaned(lastAccessedAt: Date): boolean {
  const timeSinceLastAccess = Date.now() - lastAccessedAt.getTime();
  return timeSinceLastAccess > BATCH_VALIDATION_CONSTANTS.ORPHANED_THRESHOLD_MS;
}

export function isBatchExpired(createdAt: Date): boolean {
  const batchAge = calculateBatchAge(createdAt);
  return batchAge > BATCH_VALIDATION_CONSTANTS.MAX_BATCH_AGE_MS;
}

export function sanitizeBatchId(batchId: string): string {
  const sanitized = batchId.replace(/[^a-zA-Z0-9_]/g, '');
  
  if (!sanitized.startsWith('batch_')) {
    throw new Error('Invalid batch ID format');
  }
  
  return sanitized.substring(0, BATCH_VALIDATION_CONSTANTS.MAX_BATCH_ID_LENGTH);
}

export function sanitizeSessionId(sessionId: string): string {
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_]/g, '');
  
  if (!sanitized.startsWith('session_')) {
    throw new Error('Invalid session ID format');
  }
  
  return sanitized.substring(0, BATCH_VALIDATION_CONSTANTS.MAX_SESSION_ID_LENGTH);
}