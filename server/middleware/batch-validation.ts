/**
 * Batch Validation Middleware
 * 
 * Comprehensive middleware for validating batch ownership, integrity, and security.
 * Ensures only authorized users can access their batches and prevents data leakage.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getDatabase, executeQuery } from '../database/index.js';
import { logger } from '../config/logger.js';
import rateLimit from 'express-rate-limit';
import type { SessionId } from '@shared/api-contracts';
import {
  enhancedErrorHandler,
  batchErrorHandler,
  asyncErrorHandler,
} from './error-handler';
import {
  createValidationError,
  createAuthError,
  createForbiddenError,
  createNotFoundError,
  createDatabaseError,
  createError,
  AppError,
} from './global-error-handler';

// Enhanced batch validation types
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

// Validation schemas
const batchIdSchema = z.string()
  .min(1, 'Batch ID is required')
  .max(100, 'Batch ID too long')
  .regex(/^batch_[0-9]+_[a-z0-9]+$/, 'Invalid batch ID format');

const sessionIdSchema = z.string()
  .min(1, 'Session ID is required')
  .max(100, 'Session ID too long')
  .regex(/^session_[0-9]+_[a-z0-9]+$/, 'Invalid session ID format');

// Rate limiters
const batchValidationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // Maximum 20 validation requests per minute per IP
  message: 'Too many batch validation requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const batchClaimRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Maximum 3 claim attempts per 5 minutes per IP
  message: 'Too many batch claim attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const ORPHANED_BATCH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BATCH_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Sanitize batch ID input to prevent injection attacks
 */
function sanitizeBatchId(batchId: string): string {
  // Remove any non-alphanumeric characters except underscores
  const sanitized = batchId.replace(/[^a-zA-Z0-9_]/g, '');
  
  // Ensure it follows expected format
  if (!sanitized.startsWith('batch_')) {
    throw new Error('Invalid batch ID format');
  }
  
  return sanitized.substring(0, 100); // Limit length
}

/**
 * Sanitize session ID input to prevent injection attacks
 */
function sanitizeSessionId(sessionId: string): string {
  // Remove any non-alphanumeric characters except underscores
  const sanitized = sessionId.replace(/[^a-zA-Z0-9_]/g, '');
  
  // Ensure it follows expected format
  if (!sanitized.startsWith('session_')) {
    throw new Error('Invalid session ID format');
  }
  
  return sanitized.substring(0, 100); // Limit length
}

/**
 * Calculate security risk score based on various factors
 */
function calculateRiskScore(context: Partial<BatchSecurityContext>): number {
  let score = 0;
  
  // Check for suspicious patterns
  if (context.userAgent && context.userAgent.includes('bot')) score += 30;
  if (!context.userId) score += 20; // Anonymous access is higher risk
  if (context.accessType === 'delete') score += 25;
  if (context.accessType === 'claim') score += 15;
  
  // Additional checks could include:
  // - Geolocation analysis
  // - Rate limiting patterns
  // - Known malicious IPs
  
  return Math.min(score, 100);
}

/**
 * Get batch ownership information with integrity checks and enhanced error handling
 */
async function getBatchOwnership(batchId: string, sessionId?: SessionId): Promise<BatchOwnership | null> {
  try {
    // Sanitize inputs with enhanced validation
    const safeBatchId = sanitizeBatchId(batchId);
    const safeSessionId = sessionId ? sanitizeSessionId(sessionId) : null;
    
    // Query for resumes in this batch
    const resumeQuery = `
      SELECT 
        COUNT(*) as resume_count,
        MIN(created_at) as earliest_created,
        MAX(updated_at) as latest_updated,
        session_id,
        user_id,
        batch_id
      FROM resumes 
      WHERE batch_id = $1
      ${safeSessionId ? 'AND session_id = $2' : ''}
      GROUP BY session_id, user_id, batch_id
    `;
    
    const params = safeSessionId ? [safeBatchId, safeSessionId] : [safeBatchId];
    const resumeResults = await executeQuery(resumeQuery, params);
    
    if (resumeResults.length === 0) {
      return null; // Batch doesn't exist
    }
    
    const batchData = resumeResults[0] as any;
    const now = new Date();
    const createdAt = new Date(batchData.earliest_created);
    const lastAccessedAt = new Date(batchData.latest_updated);
    
    // Check if batch is orphaned (no recent activity)
    const timeSinceLastAccess = now.getTime() - lastAccessedAt.getTime();
    const isOrphaned = timeSinceLastAccess > ORPHANED_BATCH_THRESHOLD_MS;
    
    // Check if batch is too old
    const batchAge = now.getTime() - createdAt.getTime();
    const isValid = batchAge < MAX_BATCH_AGE_MS;
    
    // Perform metadata integrity check
    const integrityQuery = `
      SELECT 
        COUNT(DISTINCT session_id) as session_count,
        COUNT(DISTINCT user_id) as user_count,
        COUNT(*) as total_resumes
      FROM resumes 
      WHERE batch_id = $1
    `;
    
    const integrityResults = await executeQuery(integrityQuery, [safeBatchId]);
    const integrityData = integrityResults[0] as any;
    
    // Batch should have consistent session and user IDs
    const metadataIntegrityCheck = 
      (integrityData as any).session_count === 1 && 
      (integrityData as any).user_count <= 1 &&
      (integrityData as any).total_resumes > 0;
    
    return {
      batchId: safeBatchId,
      sessionId: (batchData as any).session_id as SessionId,
      userId: (batchData as any).user_id || undefined,
      resumeCount: parseInt((batchData as any).resume_count),
      createdAt,
      lastAccessedAt,
      isOrphaned,
      isValid,
      metadataIntegrityCheck,
    };
    
  } catch (error) {
    // Enhanced error handling with proper categorization
    const dbError = createDatabaseError(
      'Failed to retrieve batch ownership information',
      {
        operation: 'getBatchOwnership',
        batchId: batchId.substring(0, 20) + '...',
        sessionId: sessionId?.substring(0, 20) + '...',
        originalError: error instanceof Error ? error.message : String(error),
        sqlState: (error as any)?.code,
      }
    );
    
    logger.error('Batch ownership query failed:', {
      error: dbError,
      context: {
        batchId: batchId.substring(0, 20) + '...',
        sessionId: sessionId?.substring(0, 20) + '...',
        hasSessionId: !!sessionId,
      },
    });
    
    throw dbError;
  }
}

/**
 * Validate batch integrity and ownership with comprehensive error handling
 */
export async function validateBatchOwnership(
  batchId: string,
  sessionId: SessionId,
  userId?: string
): Promise<BatchValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const securityFlags: string[] = [];
  
  try {
    // Enhanced input validation with detailed error reporting
    try {
      batchIdSchema.parse(batchId);
    } catch (error) {
      const validationError = createValidationError(
        'Invalid batch ID format provided',
        {
          field: 'batchId',
          expectedFormat: 'batch_[timestamp]_[randomId]',
          actualValue: batchId?.substring(0, 20) + '...',
          validationRule: 'batchIdSchema',
        }
      );
      
      errors.push(validationError.message);
      securityFlags.push('INVALID_BATCH_ID_FORMAT');
      
      logger.warn('Batch ID validation failed:', {
        batchId: batchId?.substring(0, 20) + '...',
        error: validationError,
      });
    }
    
    try {
      sessionIdSchema.parse(sessionId);
    } catch (error) {
      const validationError = createValidationError(
        'Invalid session ID format provided',
        {
          field: 'sessionId',
          expectedFormat: 'session_[timestamp]_[randomId]',
          actualValue: sessionId?.substring(0, 20) + '...',
          validationRule: 'sessionIdSchema',
        }
      );
      
      errors.push(validationError.message);
      securityFlags.push('INVALID_SESSION_ID_FORMAT');
      
      logger.warn('Session ID validation failed:', {
        sessionId: sessionId?.substring(0, 20) + '...',
        error: validationError,
      });
    }
    
    if (errors.length > 0) {
      return {
        valid: false,
        batchId,
        ownership: null,
        errors,
        warnings,
        securityFlags,
        integrityChecks: {
          resumesExist: false,
          sessionMatches: false,
          userAuthorized: false,
          dataConsistent: false,
        },
      };
    }
    
    // Get batch ownership
    const ownership = await getBatchOwnership(batchId, sessionId);
    
    if (!ownership) {
      errors.push('Batch not found or no resumes associated with this batch');
      return {
        valid: false,
        batchId,
        ownership: null,
        errors,
        warnings,
        securityFlags,
        integrityChecks: {
          resumesExist: false,
          sessionMatches: false,
          userAuthorized: false,
          dataConsistent: false,
        },
      };
    }
    
    // Perform integrity checks
    const integrityChecks = {
      resumesExist: ownership.resumeCount > 0,
      sessionMatches: ownership.sessionId === sessionId,
      userAuthorized: !userId || !ownership.userId || ownership.userId === userId,
      dataConsistent: ownership.metadataIntegrityCheck,
    };
    
    // Check for issues
    if (!integrityChecks.resumesExist) {
      errors.push('No resumes found in batch');
    }
    
    if (!integrityChecks.sessionMatches) {
      errors.push('Session ID does not match batch ownership');
      securityFlags.push('SESSION_MISMATCH');
    }
    
    if (!integrityChecks.userAuthorized) {
      errors.push('User not authorized to access this batch');
      securityFlags.push('UNAUTHORIZED_ACCESS');
    }
    
    if (!integrityChecks.dataConsistent) {
      warnings.push('Batch metadata inconsistency detected');
      securityFlags.push('METADATA_INCONSISTENCY');
    }
    
    // Check batch validity
    if (!ownership.isValid) {
      warnings.push('Batch is too old and may be automatically cleaned up');
    }
    
    if (ownership.isOrphaned) {
      warnings.push('Batch appears to be orphaned (no recent activity)');
    }
    
    const isValid = errors.length === 0 && 
                   integrityChecks.resumesExist && 
                   integrityChecks.sessionMatches && 
                   integrityChecks.userAuthorized;
    
    return {
      valid: isValid,
      batchId,
      ownership,
      errors,
      warnings,
      securityFlags,
      integrityChecks,
    };
    
  } catch (error) {
    // Enhanced error handling for validation failures
    const validationError = (error instanceof Error && (error as any).isOperational) ? error : createError(
      'Internal batch validation error occurred',
      500,
      'BATCH_VALIDATION_ERROR',
      {
        operation: 'validateBatchOwnership',
        batchId: batchId?.substring(0, 20) + '...',
        sessionId: sessionId?.substring(0, 20) + '...',
        userId: userId?.substring(0, 10) + '...',
        originalError: error instanceof Error ? error.message : String(error),
      }
    );
    
    logger.error('Critical batch validation error:', {
      error: validationError,
      context: {
        batchId: batchId?.substring(0, 20) + '...',
        sessionId: sessionId?.substring(0, 20) + '...',
        userId: userId?.substring(0, 10) + '...',
        securityFlags,
        hasErrors: errors.length > 0,
        hasWarnings: warnings.length > 0,
      },
    });
    
    // Return structured error response
    return {
      valid: false,
      batchId,
      ownership: null,
      errors: [
        'Internal validation error occurred',
        ...((validationError as any).message ? [(validationError as any).message] : []),
      ],
      warnings: [
        ...warnings,
        'Validation process was interrupted - please try again',
      ],
      securityFlags: [
        ...securityFlags, 
        'VALIDATION_ERROR',
        'INTERNAL_ERROR',
      ],
      integrityChecks: {
        resumesExist: false,
        sessionMatches: false,
        userAuthorized: false,
        dataConsistent: false,
      },
    };
  }
}

/**
 * Log batch access for audit trail with enhanced error handling
 */
async function logBatchAccess(context: BatchSecurityContext): Promise<void> {
  try {
    // In a production system, this would go to a dedicated audit log table
    const auditLogEntry = {
      batchId: context.batchId.substring(0, 20) + '...',
      sessionId: context.sessionId.substring(0, 20) + '...',
      userId: context.userId?.substring(0, 10) + '...' || 'anonymous',
      accessType: context.accessType,
      riskScore: context.riskScore,
      flags: context.flags,
      timestamp: context.timestamp,
      ipAddress: context.ipAddress.replace(/\d+$/, 'XXX'), // Mask last octet for privacy
    };
    
    // Log with appropriate level based on flags
    const hasSecurityFlag = context.flags.some(flag => 
      flag.includes('SECURITY') || flag.includes('BLOCKED') || flag.includes('UNAUTHORIZED')
    );
    
    if (hasSecurityFlag) {
      logger.warn('Security-related batch access:', auditLogEntry);
    } else {
      logger.info('Batch access logged:', auditLogEntry);
    }
    
    // TODO: In production, store in dedicated audit table
    // await executeQuery(
    //   'INSERT INTO audit_logs (batch_id, session_id, user_id, access_type, risk_score, flags, ip_address, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())',
    //   [context.batchId, context.sessionId, context.userId, context.accessType, context.riskScore, JSON.stringify(context.flags), context.ipAddress]
    // );
    
  } catch (error) {
    // Use enhanced error handling
    const auditError = createDatabaseError(
      'Failed to log batch access for audit trail',
      {
        operation: 'audit_logging',
        batchId: context.batchId,
        accessType: context.accessType,
        originalError: error instanceof Error ? error.message : String(error),
      }
    );
    
    logger.error('Audit logging failed:', {
      error: auditError,
      context: {
        batchId: context.batchId.substring(0, 20) + '...',
        accessType: context.accessType,
      },
    });
  }
}

/**
 * Enhanced middleware for validating batch access with comprehensive error handling and rate limiting
 */
export function validateBatchAccess(accessType: 'read' | 'write' | 'delete' | 'claim' = 'read') {
  return asyncErrorHandler(async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Apply rate limiting based on access type
      if (accessType === 'claim') {
        batchClaimRateLimit(req, res, () => {});
      } else {
        batchValidationRateLimit(req, res, () => {});
      }
      
      // Extract batch and session IDs from request
      const batchId = req.params.batchId || req.body.batchId || req.query.batchId as string;
      const sessionId = req.headers['x-session-id'] as SessionId || req.body.sessionId || req.query.sessionId as SessionId;
      const userId = (req as any).user?.uid || req.body.userId || req.query.userId;
      
      if (!batchId) {
        const validationError = createValidationError(
          'Batch ID is required for this operation',
          {
            field: 'batchId',
            operation: accessType,
            endpoint: req.path,
          }
        );
        
        logger.warn('Batch access attempt without batch ID:', {
          error: validationError,
          context: {
            path: req.path,
            method: req.method,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            accessType,
          },
        });
        
        throw validationError;
      }
      
      if (!sessionId) {
        const authError = createAuthError(
          'Session ID is required for batch access'
        );
        
        logger.warn('Batch access attempt without session ID:', {
          error: authError,
          context: {
            batchId: batchId?.substring(0, 20) + '...',
            path: req.path,
            method: req.method,
            ip: req.ip,
            accessType,
          },
        });
        
        throw authError;
      }
      
      // Create security context
      const securityContext: BatchSecurityContext = {
        batchId,
        sessionId,
        userId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        timestamp: new Date(),
        accessType,
        riskScore: 0,
        flags: [],
      };
      
      // Calculate risk score
      securityContext.riskScore = calculateRiskScore(securityContext);
      
      // Block high-risk requests with enhanced security error
      if (securityContext.riskScore > 75) {
        const securityError = createForbiddenError(
          'Access denied due to elevated security risk'
        );
        securityError.code = 'HIGH_RISK_ACCESS';
        securityError.details = {
          riskScore: securityContext.riskScore,
          riskFactors: securityContext.flags,
          accessType,
        };
        
        securityContext.flags.push('HIGH_RISK_BLOCKED');
        await logBatchAccess(securityContext);
        
        logger.warn('High-risk batch access blocked:', {
          error: securityError,
          context: {
            batchId: batchId.substring(0, 20) + '...',
            riskScore: securityContext.riskScore,
            ip: req.ip,
            flags: securityContext.flags,
          },
        });
        
        throw securityError;
      }
      
      // Validate batch ownership
      const validation = await validateBatchOwnership(batchId, sessionId, userId);
      
      if (!validation.valid) {
        const accessError = createForbiddenError(
          'Access denied to batch - validation failed'
        );
        accessError.code = 'BATCH_ACCESS_DENIED';
        accessError.details = {
          validationErrors: validation.errors,
          securityFlags: validation.securityFlags,
          integrityChecks: validation.integrityChecks,
          accessType,
        };
        
        securityContext.flags.push(...validation.securityFlags);
        await logBatchAccess(securityContext);
        
        logger.warn('Unauthorized batch access attempt:', {
          error: accessError,
          context: {
            batchId: batchId.substring(0, 20) + '...',
            errors: validation.errors,
            securityFlags: validation.securityFlags,
            ip: req.ip,
            integrityChecks: validation.integrityChecks,
          },
        });
        
        throw accessError;
      }
      
      // Log successful access
      securityContext.flags.push('ACCESS_GRANTED');
      await logBatchAccess(securityContext);
      
      // Add validation result to request for use in route handlers
      req.batchValidation = validation;
      req.securityContext = securityContext;
      
      next();
      
    } catch (error) {
      // Enhanced error handling - errors are now thrown and caught by asyncErrorHandler
      // which will use the enhanced error handler middleware
      throw error;
    }
  });
}

/**
 * Update batch access timestamp with enhanced error handling
 */
export async function updateBatchAccess(batchId: string, sessionId: SessionId): Promise<void> {
  try {
    const safeBatchId = sanitizeBatchId(batchId);
    const safeSessionId = sanitizeSessionId(sessionId);
    
    const result = await executeQuery(
      'UPDATE resumes SET updated_at = NOW() WHERE batch_id = $1 AND session_id = $2',
      [safeBatchId, safeSessionId]
    );
    
    // Check if any rows were actually updated
    if ((result as any).rowCount === 0) {
      logger.warn('No resumes updated for batch access timestamp:', {
        batchId: safeBatchId.substring(0, 20) + '...',
        sessionId: safeSessionId.substring(0, 20) + '...',
        possibleCause: 'Batch may not exist or session mismatch',
      });
    } else {
      logger.debug('Updated batch access timestamp:', {
        batchId: safeBatchId.substring(0, 20) + '...',
        resumesUpdated: (result as any).rowCount,
      });
    }
    
  } catch (error) {
    // Enhanced error handling for database operations
    const dbError = createDatabaseError(
      'Failed to update batch access timestamp',
      {
        operation: 'updateBatchAccess',
        batchId: batchId?.substring(0, 20) + '...',
        sessionId: sessionId?.substring(0, 20) + '...',
        originalError: error instanceof Error ? error.message : String(error),
        sqlState: (error as any)?.code,
      }
    );
    
    logger.error('Batch access timestamp update failed:', {
      error: dbError,
      context: {
        batchId: batchId?.substring(0, 20) + '...',
        sessionId: sessionId?.substring(0, 20) + '...',
      },
    });
    
    // Don't throw - this is not critical enough to break the request
    // but log it for monitoring
  }
}

/**
 * Extended Express Request interface
 */
declare global {
  namespace Express {
    interface Request {
      batchValidation?: BatchValidationResult;
      securityContext?: BatchSecurityContext;
    }
  }
}

// Export types are defined above in the file