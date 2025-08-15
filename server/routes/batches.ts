/**
 * Batch Management Routes
 *
 * Comprehensive server-side batch validation endpoints with ownership verification,
 * security features, and data integrity checks. These routes work with the batch
 * validation middleware to ensure secure and reliable batch management.
 */

import express from "express";
import { z } from "zod";
import { logger } from "../lib/logger";
import {
  validateBatchAccess,
  updateBatchAccess,
} from "../middleware/batch-validation";
import rateLimit from "express-rate-limit";
import type { SessionId } from "@shared/api-contracts";
import { createBatchService } from "../services/batch-service";
import { handleRouteResult } from "../lib/route-error-handler";
import { getStorage } from "../storage";

const router = express.Router();

// Database query result interfaces
interface _ResumeQueryResult {
  id: number;
  filename: string;
  file_size: number;
  file_type: string;
  analyzed_data?: object;
  created_at: string;
  updated_at: string;
  has_analysis: boolean;
}

interface _CleanupCandidateQueryResult {
  batch_id: string;
  session_id: string;
  user_id: string | null;
  resume_count: string;
  created_at: string;
  last_updated: string;
  hours_inactive: string;
}

interface _AnalysisCountResult {
  analysis_count: string;
}

interface _CorruptionCheckResult {
  empty_content_count: string;
  empty_filename_count: string;
  unanalyzed_count: string;
  total_count: string;
}

// Enhanced batch status interface
interface _BatchStatus {
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

// Legacy interfaces - kept for route response compatibility
interface _BatchClaimResult {
  success: boolean;
  message: string;
  batchId: string;
  newSessionId?: SessionId;
  resumeCount: number;
  warnings: string[];
}

interface _BatchDeletionResult {
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

// Rate limiting configurations - Skip during testing
const isTestEnv = process.env.NODE_ENV === 'test';

const batchOperationsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isTestEnv ? 10000 : 30, // Much higher limit for tests
  skip: isTestEnv ? () => true : undefined, // Skip rate limiting in test environment
  message: "Too many batch operation requests. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

const batchClaimRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTestEnv ? 10000 : 3, // Much higher limit for tests
  skip: isTestEnv ? () => true : undefined, // Skip rate limiting in test environment
  message: "Too many batch claim attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const batchDeleteRateLimit = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: isTestEnv ? 10000 : 5, // Much higher limit for tests
  skip: isTestEnv ? () => true : undefined, // Skip rate limiting in test environment
  message: "Too many batch deletion attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Type guards for database results
// Internal type-guards no longer used; remove to satisfy linter

/**
 * GET /api/batches/:batchId/validate
 * Validate batch ownership and integrity
 */
router.get(
  "/:batchId/validate",
  batchOperationsRateLimit,
  validateBatchAccess("read"),
  async (req: express.Request, res: express.Response) => {
    const { batchId } = batchIdParamSchema.parse(req.params);
    const sessionId =
      (req.headers["x-session-id"] as SessionId) ||
      (req.query.sessionId as SessionId);
    const userId = (req as unknown as { user?: { uid: string } }).user?.uid || (req.query.userId as string);

    logger.info("Batch validation request:", {
      batchId: batchId.substring(0, 20) + "...",
      sessionId: sessionId?.substring(0, 20) + "...",
      userId: userId?.substring(0, 10) + "..." || "anonymous",
      ip: req.ip,
    });

    // Create batch service and validate
    const storage = getStorage();
    const batchService = createBatchService(storage);
    
    const result = await batchService.validateBatchAccess(
      { batchId, sessionId, userId },
      req.batchValidation
    );

    handleRouteResult(result, res, (data) => {
      // Update batch access timestamp if validation successful
      if (data.valid) {
        updateBatchAccess(batchId, sessionId).catch(error => {
          logger.warn('Failed to update batch access timestamp', { batchId, error });
        });
      }

      res.json({
        success: data.valid,
        message: data.valid 
          ? "Batch validation successful"
          : "Batch validation failed",
        data: {
          batchId: data.batchId,
          valid: data.valid,
          status: data.status,
          resumeCount: data.resumeCount,
          analysisCount: data.analysisCount,
          ownership: {
            sessionId: data.sessionId,
            userId: data.userId
          },
          integrityChecks: data.integrityStatus,
          securityFlags: data.securityFlags,
          warnings: data.warnings,
          timestamp: new Date().toISOString(),
        },
      });
    });
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
    const { batchId } = batchIdParamSchema.parse(req.params);
    const validation = req.batchValidation;

    if (!validation?.valid || !validation.ownership) {
      return res.status(403).json({
        success: false,
        message: "Cannot get status for invalid or unauthorized batch",
        code: "BATCH_ACCESS_DENIED",
      });
    }

    const sessionId = validation.ownership.sessionId;
    const userId = validation.ownership.userId;

    logger.info("Batch status request:", {
      batchId: batchId.substring(0, 20) + "...",
      userId: userId?.substring(0, 10) + "..." || "anonymous",
    });

    // Create batch service and get status
    const storage = getStorage();
    const batchService = createBatchService(storage);
    
    const result = await batchService.getBatchStatus(
      { batchId, sessionId, userId },
      validation
    );

    handleRouteResult(result, res, (data) => {
      // Update access timestamp
      updateBatchAccess(batchId, sessionId).catch(error => {
        logger.warn('Failed to update batch access timestamp', { batchId, error });
      });

      res.json({
        success: true,
        message: "Batch status retrieved successfully",
        data: {
          batchId: data.batchId,
          sessionId: data.sessionId,
          userId: data.userId,
          status: data.status,
          resumeCount: data.resumeCount,
          createdAt: data.createdAt.toISOString(),
          lastAccessedAt: data.lastAccessedAt.toISOString(),
          analysisCount: data.analysisCount,
          integrityStatus: data.integrityStatus,
          warnings: data.warnings,
          canClaim: data.canClaim,
          autoCleanupDate: data.autoCleanupDate?.toISOString(),
        },
      });
    });
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
    const { batchId } = batchIdParamSchema.parse(req.params);
    const { sessionId, userId, force } = claimBatchSchema.parse(req.body);

    logger.info("Batch claim attempt:", {
      batchId: batchId.substring(0, 20) + "...",
      newSessionId: sessionId.substring(0, 20) + "...",
      userId: userId?.substring(0, 10) + "..." || "anonymous",
      force,
      ip: req.ip,
    });

    // Create batch service and attempt claim
    const storage = getStorage();
    const batchService = createBatchService(storage);
    
    const result = await batchService.claimBatch({
      batchId,
      newSessionId: sessionId as SessionId,
      newUserId: userId,
      force
    });

    handleRouteResult(result, res, (data) => {
      logger.info("Batch claimed successfully:", {
        batchId: batchId.substring(0, 20) + "...",
        resumeCount: data.resumeCount,
        newSessionId: sessionId.substring(0, 20) + "...",
      });

      res.json({
        success: true,
        message: "Batch claimed successfully",
        data: {
          success: true,
          message: `Successfully claimed batch with ${data.resumeCount} resumes`,
          batchId: data.batchId,
          newSessionId: data.newSessionId,
          resumeCount: data.resumeCount,
          warnings: data.warnings,
        },
      });
    });
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
    const { batchId } = batchIdParamSchema.parse(req.params);
    const validation = req.batchValidation;

    if (!validation?.valid || !validation.ownership) {
      return res.status(403).json({
        success: false,
        message: "Cannot delete invalid or unauthorized batch",
        code: "BATCH_ACCESS_DENIED",
      });
    }

    const sessionId = validation.ownership.sessionId;
    const userId = validation.ownership.userId;

    logger.info("Batch deletion request:", {
      batchId: batchId.substring(0, 20) + "...",
      userId: userId?.substring(0, 10) + "..." || "anonymous",
      resumeCount: validation.ownership.resumeCount,
      ip: req.ip,
    });

    // Create batch service and delete batch
    const storage = getStorage();
    const batchService = createBatchService(storage);
    
    const result = await batchService.deleteBatch({
      batchId,
      sessionId,
      userId,
      cascade: true
    });

    handleRouteResult(result, res, (data) => {
      logger.info("Batch deleted successfully:", {
        batchId: batchId.substring(0, 20) + "...",
        deletedCounts: data.deletedCounts,
      });

      res.json({
        success: true,
        message: "Batch deleted successfully",
        data: {
          success: true,
          message: `Batch deleted successfully`,
          deletedItems: {
            resumes: data.deletedCounts.resumes,
            analysisResults: data.deletedCounts.analyses,
            interviewQuestions: data.deletedCounts.metadata,
          },
          warnings: validation.warnings,
        },
      });
    });
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
    const { batchId } = batchIdParamSchema.parse(req.params);
    const validation = req.batchValidation;
    
    // Check validation from middleware
    if (!validation?.valid || !validation.ownership) {
      return res.status(403).json({
        success: false,
        message: "Cannot access resumes for invalid or unauthorized batch",
        code: "BATCH_ACCESS_DENIED",
      });
    }

    // Get pagination parameters
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000); // Max 1000

    const sessionId = validation.ownership.sessionId;
    const userId = validation.ownership.userId;

    // Create batch service and get resumes
    const storage = getStorage();
    const batchService = createBatchService(storage);
    
    const result = await batchService.getBatchResumes(
      { batchId, sessionId, userId, offset, limit },
      validation
    );

    handleRouteResult(result, res, (data) => {
      // Update access timestamp
      updateBatchAccess(batchId, sessionId).catch(error => {
        logger.warn('Failed to update batch access timestamp', { batchId, error });
      });

      res.json({
        success: true,
        message: "Batch resumes retrieved successfully",
        data: {
          batchId: data.batchId,
          sessionId,
          resumeCount: data.resumes.length,
          totalCount: data.metadata.totalCount,
          resumes: data.resumes.map(resume => ({
            id: resume.id,
            filename: resume.filename,
            file_size: resume.fileSize,
            file_type: resume.fileType,
            analyzed_data: resume.analyzedData,
            created_at: resume.createdAt,
            updated_at: resume.updatedAt,
            has_analysis: resume.hasAnalysis,
          })),
          metadata: data.metadata,
          pagination: data.pagination,
        },
      });
    });
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
    max: isTestEnv ? 10000 : 10, // Much higher limit for tests
    skip: isTestEnv ? () => true : undefined, // Skip rate limiting in test environment
    message: "Too many cleanup candidate requests. Please slow down.",
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req: express.Request, res: express.Response) => {
    logger.info("Cleanup candidates request:", {
      ip: req.ip,
    });

    // Create batch service and find candidates
    const storage = getStorage();
    const batchService = createBatchService(storage);
    
    const hoursInactive = parseInt(req.query.hours as string) || 168; // Default 7 days (168 hours)
    const result = await batchService.findCleanupCandidates(hoursInactive);

    handleRouteResult(result, res, (data) => {
      res.json({
        success: true,
        message: "Cleanup candidates retrieved successfully",
        data: {
          candidateCount: data.totalCandidates,
          estimatedSpaceSavings: data.estimatedSpaceSavings,
          lastScanTime: data.lastScanTime.toISOString(),
          candidates: data.candidates.map((candidate) => ({
            batchId: candidate.batchId,
            sessionId: candidate.sessionId,
            userId: candidate.userId,
            resumeCount: candidate.resumeCount,
            createdAt: candidate.createdAt.toISOString(),
            lastUpdated: candidate.lastUpdated.toISOString(),
            hoursInactive: candidate.hoursInactive,
            recommendedAction: candidate.recommendedAction,
          })),
        },
      });
    });
  },
);

export default router;
