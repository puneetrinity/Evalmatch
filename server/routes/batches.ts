/**
 * Batch Management Routes
 *
 * Comprehensive server-side batch validation endpoints with ownership verification,
 * security features, and data integrity checks. These routes work with the batch
 * validation middleware to ensure secure and reliable batch management.
 */

import express from "express";
import { z } from "zod";
import { getDatabase, executeQuery } from "../database/index";
import { logger } from "../config/logger";
import {
  validateBatchAccess,
  validateBatchOwnership,
  updateBatchAccess,
} from "../middleware/batch-validation";
import rateLimit from "express-rate-limit";
import type { SessionId } from "@shared/api-contracts";

const router = express.Router();

// Database query result interfaces
interface ResumeQueryResult {
  id: number;
  filename: string;
  file_size: number;
  file_type: string;
  analyzed_data?: any;
  created_at: string;
  updated_at: string;
  has_analysis: boolean;
}

interface CleanupCandidateQueryResult {
  batch_id: string;
  session_id: string;
  user_id: string | null;
  resume_count: string;
  created_at: string;
  last_updated: string;
  hours_inactive: string;
}

interface AnalysisCountResult {
  analysis_count: string;
}

interface CorruptionCheckResult {
  empty_content_count: string;
  empty_filename_count: string;
  unanalyzed_count: string;
  total_count: string;
}

// Enhanced batch status interface
interface BatchStatus {
  batchId: string;
  sessionId: SessionId;
  userId?: string;
  status: "active" | "orphaned" | "expired" | "corrupted";
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

interface BatchClaimResult {
  success: boolean;
  message: string;
  batchId: string;
  newSessionId?: SessionId;
  resumeCount: number;
  warnings: string[];
}

interface BatchDeletionResult {
  success: boolean;
  message: string;
  deletedItems: {
    resumes: number;
    analysisResults: number;
    interviewQuestions: number;
  };
  warnings: string[];
}

// Validation schemas
const batchIdParamSchema = z.object({
  batchId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^batch_[0-9]+_[a-z0-9]+$/, "Invalid batch ID format"),
});

const claimBatchSchema = z.object({
  sessionId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^session_[0-9]+_[a-z0-9]+$/, "Invalid session ID format"),
  userId: z.string().min(1).max(100).optional(),
  force: z.boolean().optional().default(false),
});

// Rate limiting configurations
const batchOperationsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 validation requests per minute
  message: "Too many batch operation requests. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

const batchClaimRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Maximum 3 claim attempts per 5 minutes
  message: "Too many batch claim attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const batchDeleteRateLimit = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 5, // Maximum 5 deletion attempts per 2 minutes
  message: "Too many batch deletion attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Type guards for database results
function isAnalysisCountResult(obj: unknown): obj is AnalysisCountResult {
  return typeof obj === 'object' && obj !== null && 'analysis_count' in obj;
}

function isCorruptionCheckResult(obj: unknown): obj is CorruptionCheckResult {
  return typeof obj === 'object' && obj !== null && 
    'empty_content_count' in obj && 
    'empty_filename_count' in obj && 
    'unanalyzed_count' in obj && 
    'total_count' in obj;
}

function isResumeQueryResult(obj: unknown): obj is ResumeQueryResult {
  return typeof obj === 'object' && obj !== null && 
    'id' in obj && 
    'filename' in obj && 
    'file_size' in obj && 
    'file_type' in obj;
}

function isCleanupCandidateQueryResult(obj: unknown): obj is CleanupCandidateQueryResult {
  return typeof obj === 'object' && obj !== null && 
    'batch_id' in obj && 
    'session_id' in obj && 
    'resume_count' in obj && 
    'created_at' in obj && 
    'last_updated' in obj && 
    'hours_inactive' in obj;
}

/**
 * GET /api/batches/:batchId/validate
 * Validate batch ownership and integrity
 */
router.get(
  "/:batchId/validate",
  batchOperationsRateLimit,
  validateBatchAccess("read"),
  async (req: express.Request, res: express.Response) => {
    try {
      const { batchId } = batchIdParamSchema.parse(req.params);
      const sessionId =
        (req.headers["x-session-id"] as SessionId) ||
        (req.query.sessionId as SessionId);
      const userId = (req as unknown as { user?: { uid: string } }).user?.uid || (req.query.userId as string);

      logger.info("Batch validation request:", {
        batchId: batchId.substring(0, 20) + "...",
        sessionId: sessionId?.substring(0, 20) + "...",
        userId:
          ((req as unknown as { user?: { uid: string } }).user?.uid || userId)?.substring(0, 10) + "..." ||
          "anonymous",
        ip: req.ip,
      });

      // Use the validation result from middleware
      const validation = req.batchValidation;
      if (!validation) {
        throw new Error("Batch validation middleware not executed");
      }

      // Update batch access timestamp
      if (validation.valid) {
        await updateBatchAccess(batchId, sessionId);
      }

      res.json({
        success: validation.valid,
        message: validation.valid
          ? "Batch validation successful"
          : "Batch validation failed",
        data: {
          batchId: validation.batchId,
          valid: validation.valid,
          ownership: validation.ownership,
          integrityChecks: validation.integrityChecks,
          errors: validation.errors,
          warnings: validation.warnings,
          securityFlags: validation.securityFlags,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error("Batch validation endpoint error:", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to validate batch",
        code: "VALIDATION_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

/**
 * GET /api/batches/:batchId/status
 * Get detailed batch status including analysis data
 */
router.get(
  "/:batchId/status",
  batchOperationsRateLimit,
  validateBatchAccess("read"),
  async (req: express.Request, res: express.Response) => {
    try {
      const { batchId } = batchIdParamSchema.parse(req.params);
      const validation = req.batchValidation;

      if (!validation?.valid || !validation.ownership) {
        return res.status(403).json({
          success: false,
          message: "Cannot get status for invalid or unauthorized batch",
          code: "BATCH_ACCESS_DENIED",
        });
      }

      logger.info("Batch status request:", {
        batchId: batchId.substring(0, 20) + "...",
        userId:
          validation.ownership.userId?.substring(0, 10) + "..." || "anonymous",
      });

      // Get analysis count for this batch
      const analysisQuery = `
        SELECT COUNT(*) as analysis_count
        FROM analysis_results ar
        INNER JOIN resumes r ON ar.resume_id = r.id
        WHERE r.batch_id = $1
      `;

      const analysisResults = await executeQuery(analysisQuery, [batchId]);
      if (!Array.isArray(analysisResults) || !analysisResults[0] || !isAnalysisCountResult(analysisResults[0])) {
        throw new Error('Invalid analysis query result format');
      }
      const analysisCount = parseInt(analysisResults[0].analysis_count || "0");

      // Check for data corruption
      const corruptionQuery = `
        SELECT 
          COUNT(CASE WHEN content IS NULL OR content = '' THEN 1 END) as empty_content_count,
          COUNT(CASE WHEN filename IS NULL OR filename = '' THEN 1 END) as empty_filename_count,
          COUNT(CASE WHEN analyzed_data IS NULL THEN 1 END) as unanalyzed_count,
          COUNT(*) as total_count
        FROM resumes 
        WHERE batch_id = $1
      `;

      const corruptionResults = await executeQuery(corruptionQuery, [batchId]);
      if (!Array.isArray(corruptionResults) || !corruptionResults[0] || !isCorruptionCheckResult(corruptionResults[0])) {
        throw new Error('Invalid corruption check query result format');
      }
      const corruptionData = corruptionResults[0];

      // Determine batch status
      let status: BatchStatus["status"] = "active";
      const warnings: string[] = [...validation.warnings];

      if (validation.ownership.isOrphaned) {
        status = "orphaned";
        warnings.push("Batch has been inactive for over 24 hours");
      }

      if (!validation.ownership.isValid) {
        status = "expired";
        warnings.push("Batch has exceeded maximum age limit");
      }

      const dataCorrupted =
        parseInt(corruptionData.empty_content_count) > 0 ||
        parseInt(corruptionData.empty_filename_count) > 0 ||
        !validation.ownership.metadataIntegrityCheck;

      if (dataCorrupted) {
        status = "corrupted";
        warnings.push("Data corruption detected in batch");
      }

      // Check if batch can be claimed (orphaned but not corrupted)
      const canClaim = status === "orphaned" && !dataCorrupted;

      // Calculate auto cleanup date (7 days from creation)
      const autoCleanupDate = new Date(validation.ownership.createdAt);
      autoCleanupDate.setDate(autoCleanupDate.getDate() + 7);

      const batchStatus: BatchStatus = {
        batchId: validation.batchId,
        sessionId: validation.ownership.sessionId,
        userId: validation.ownership.userId,
        status,
        resumeCount: validation.ownership.resumeCount,
        createdAt: validation.ownership.createdAt,
        lastAccessedAt: validation.ownership.lastAccessedAt,
        analysisCount,
        integrityStatus: {
          resumesValid: validation.integrityChecks.resumesExist,
          analysisValid: analysisCount >= 0,
          metadataConsistent: validation.integrityChecks.dataConsistent,
          dataCorrupted,
        },
        warnings,
        canClaim,
        autoCleanupDate: status !== "active" ? autoCleanupDate : undefined,
      };

      // Update access timestamp
      await updateBatchAccess(batchId, validation.ownership.sessionId);

      res.json({
        success: true,
        message: "Batch status retrieved successfully",
        data: batchStatus,
      });
    } catch (error) {
      logger.error("Batch status endpoint error:", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to get batch status",
        code: "STATUS_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

/**
 * POST /api/batches/:batchId/claim
 * Claim ownership of orphaned batch
 */
router.post(
  "/:batchId/claim",
  batchClaimRateLimit,
  async (req: express.Request, res: express.Response) => {
    try {
      const { batchId } = batchIdParamSchema.parse(req.params);
      const { sessionId, userId, force } = claimBatchSchema.parse(req.body);

      logger.info("Batch claim attempt:", {
        batchId: batchId.substring(0, 20) + "...",
        newSessionId: sessionId.substring(0, 20) + "...",
        userId: userId?.substring(0, 10) + "..." || "anonymous",
        force,
        ip: req.ip,
      });

      // First, validate current batch state (without session ID check for claiming)
      const currentOwnership = await validateBatchOwnership(
        batchId,
        sessionId as SessionId,
      );

      if (!currentOwnership.ownership) {
        return res.status(404).json({
          success: false,
          message: "Batch not found",
          code: "BATCH_NOT_FOUND",
        });
      }

      // Check if batch can be claimed
      const canClaim = currentOwnership.ownership.isOrphaned || force;

      if (!canClaim) {
        return res.status(403).json({
          success: false,
          message:
            "Batch cannot be claimed - not orphaned and force not specified",
          code: "BATCH_NOT_CLAIMABLE",
          data: {
            isOrphaned: currentOwnership.ownership.isOrphaned,
            lastAccessedAt: currentOwnership.ownership.lastAccessedAt,
          },
        });
      }

      // Security check - prevent claiming if there are too many security flags
      if (currentOwnership.securityFlags.length > 2) {
        return res.status(403).json({
          success: false,
          message: "Batch cannot be claimed due to security concerns",
          code: "SECURITY_CLAIM_DENIED",
          securityFlags: currentOwnership.securityFlags,
        });
      }

      // Update batch ownership
      const updateQuery = `
        UPDATE resumes 
        SET 
          session_id = $1,
          user_id = $2,
          updated_at = NOW()
        WHERE batch_id = $3
        RETURNING id, filename
      `;

      const updateResults = await executeQuery(updateQuery, [
        sessionId,
        userId || null,
        batchId,
      ]);

      if (updateResults.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No resumes found to claim",
          code: "NO_RESUMES_FOUND",
        });
      }

      // Also update any analysis results
      const analysisUpdateQuery = `
        UPDATE analysis_results 
        SET user_id = $1
        WHERE resume_id IN (
          SELECT id FROM resumes WHERE batch_id = $2
        )
      `;

      await executeQuery(analysisUpdateQuery, [userId || null, batchId]);

      const claimResult: BatchClaimResult = {
        success: true,
        message: `Successfully claimed batch with ${updateResults.length} resumes`,
        batchId,
        newSessionId: sessionId as SessionId,
        resumeCount: updateResults.length,
        warnings: currentOwnership.warnings,
      };

      logger.info("Batch claimed successfully:", {
        batchId: batchId.substring(0, 20) + "...",
        resumeCount: updateResults.length,
        newSessionId: sessionId.substring(0, 20) + "...",
      });

      res.json({
        success: true,
        message: "Batch claimed successfully",
        data: claimResult,
      });
    } catch (error) {
      logger.error("Batch claim endpoint error:", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to claim batch",
        code: "CLAIM_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

/**
 * DELETE /api/batches/:batchId
 * Delete batch and associated data
 */
router.delete(
  "/:batchId",
  batchDeleteRateLimit,
  validateBatchAccess("delete"),
  async (req: express.Request, res: express.Response) => {
    try {
      const { batchId } = batchIdParamSchema.parse(req.params);
      const validation = req.batchValidation;

      if (!validation?.valid || !validation.ownership) {
        return res.status(403).json({
          success: false,
          message: "Cannot delete invalid or unauthorized batch",
          code: "BATCH_ACCESS_DENIED",
        });
      }

      logger.info("Batch deletion request:", {
        batchId: batchId.substring(0, 20) + "...",
        userId:
          validation.ownership.userId?.substring(0, 10) + "..." || "anonymous",
        resumeCount: validation.ownership.resumeCount,
        ip: req.ip,
      });

      // Start transaction for safe deletion
      const db = getDatabase();

      // Delete interview questions first (foreign key dependency)
      const deleteInterviewQuery = `
        DELETE FROM interview_questions 
        WHERE resume_id IN (
          SELECT id FROM resumes WHERE batch_id = $1
        )
      `;
      const interviewDeleteResult = await executeQuery(deleteInterviewQuery, [
        batchId,
      ]);

      // Delete analysis results
      const deleteAnalysisQuery = `
        DELETE FROM analysis_results 
        WHERE resume_id IN (
          SELECT id FROM resumes WHERE batch_id = $1
        )
      `;
      const analysisDeleteResult = await executeQuery(deleteAnalysisQuery, [
        batchId,
      ]);

      // Delete resumes
      const deleteResumeQuery = `
        DELETE FROM resumes 
        WHERE batch_id = $1
        RETURNING filename
      `;
      const resumeDeleteResult = await executeQuery(deleteResumeQuery, [
        batchId,
      ]);

      const deletionResult: BatchDeletionResult = {
        success: true,
        message: `Batch deleted successfully`,
        deletedItems: {
          resumes: resumeDeleteResult.length,
          analysisResults: analysisDeleteResult.length || 0,
          interviewQuestions: interviewDeleteResult.length || 0,
        },
        warnings: validation.warnings,
      };

      logger.info("Batch deleted successfully:", {
        batchId: batchId.substring(0, 20) + "...",
        deletedItems: deletionResult.deletedItems,
      });

      res.json({
        success: true,
        message: "Batch deleted successfully",
        data: deletionResult,
      });
    } catch (error) {
      logger.error("Batch deletion endpoint error:", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to delete batch",
        code: "DELETION_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

/**
 * GET /api/batches/:batchId/resumes
 * Get resumes in batch with validation
 */
router.get(
  "/:batchId/resumes",
  batchOperationsRateLimit,
  validateBatchAccess("read"),
  async (req: express.Request, res: express.Response) => {
    try {
      const { batchId } = batchIdParamSchema.parse(req.params);
      const validation = req.batchValidation;

      if (!validation?.valid || !validation.ownership) {
        return res.status(403).json({
          success: false,
          message: "Cannot access resumes for invalid or unauthorized batch",
          code: "BATCH_ACCESS_DENIED",
        });
      }

      // Get resumes with analysis status
      const resumesQuery = `
        SELECT 
          r.id,
          r.filename,
          r.file_size,
          r.file_type,
          r.analyzed_data,
          r.created_at,
          r.updated_at,
          CASE WHEN ar.id IS NOT NULL THEN true ELSE false END as has_analysis
        FROM resumes r
        LEFT JOIN analysis_results ar ON r.id = ar.resume_id
        WHERE r.batch_id = $1
        ORDER BY r.created_at DESC
      `;

      const resumesResult = await executeQuery(resumesQuery, [batchId]);
      if (!Array.isArray(resumesResult)) {
        throw new Error('Invalid resumes query result format');
      }
      const resumes = resumesResult.filter((resume): resume is ResumeQueryResult => isResumeQueryResult(resume));
      if (resumes.length !== resumesResult.length) {
        logger.warn('Some resume records had invalid format', { batchId, expected: resumesResult.length, valid: resumes.length });
      }

      // Update access timestamp
      await updateBatchAccess(batchId, validation.ownership.sessionId);

      res.json({
        success: true,
        message: "Batch resumes retrieved successfully",
        data: {
          batchId: validation.batchId,
          sessionId: validation.ownership.sessionId,
          resumeCount: resumes.length,
          resumes: resumes.map(resume => ({
            ...resume,
            analyzedData: resume.analyzed_data, // Standardize field name
          })),
        },
      });
    } catch (error) {
      logger.error("Batch resumes endpoint error:", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to get batch resumes",
        code: "RESUMES_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

/**
 * GET /api/batches/cleanup-candidates
 * Get batches that are candidates for cleanup (admin endpoint)
 */
router.get(
  "/cleanup-candidates",
  rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute
    message: "Too many cleanup candidate requests. Please slow down.",
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req: express.Request, res: express.Response) => {
    try {
      // This would typically require admin authentication
      // For now, we'll implement basic IP-based rate limiting

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 days ago

      const cleanupQuery = `
        SELECT 
          batch_id,
          session_id,
          user_id,
          COUNT(*) as resume_count,
          MIN(created_at) as created_at,
          MAX(updated_at) as last_updated,
          EXTRACT(EPOCH FROM (NOW() - MAX(updated_at))) / 3600 as hours_inactive
        FROM resumes
        WHERE created_at < $1
        GROUP BY batch_id, session_id, user_id
        HAVING MAX(updated_at) < $1
        ORDER BY MAX(updated_at) ASC
        LIMIT 100
      `;

      const candidatesResult = await executeQuery(cleanupQuery, [cutoffDate]);
      if (!Array.isArray(candidatesResult)) {
        throw new Error('Invalid cleanup candidates query result format');
      }
      const candidates = candidatesResult.filter((candidate): candidate is CleanupCandidateQueryResult => isCleanupCandidateQueryResult(candidate));
      if (candidates.length !== candidatesResult.length) {
        logger.warn('Some cleanup candidate records had invalid format', { expected: candidatesResult.length, valid: candidates.length });
      }

      res.json({
        success: true,
        message: "Cleanup candidates retrieved successfully",
        data: {
          candidateCount: candidates.length,
          cutoffDate: cutoffDate.toISOString(),
          candidates: candidates.map((candidate) => ({
            batchId: candidate.batch_id,
            sessionId: candidate.session_id,
            userId: candidate.user_id,
            resumeCount: parseInt(candidate.resume_count),
            createdAt: candidate.created_at,
            lastUpdated: candidate.last_updated,
            hoursInactive: Math.round(parseFloat(candidate.hours_inactive)),
          })),
        },
      });
    } catch (error) {
      logger.error("Cleanup candidates endpoint error:", {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to get cleanup candidates",
        code: "CLEANUP_ERROR",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);

export default router;
