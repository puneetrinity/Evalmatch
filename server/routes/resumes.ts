/**
 * Resume Management Routes
 * Handles resume upload, retrieval, and management
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { secureUpload, validateUploadedFile } from "../middleware/upload";
import { uploadRateLimiter } from "../middleware/rate-limiter";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import { resumeService } from "../services/resume-service";
import { isSuccess, isFailure } from "@shared/result-types";
import { getErrorStatusCode, getErrorCode, getErrorMessage, getErrorTimestamp } from "@shared/type-utilities";

const router = Router();

// Get all resumes for the authenticated user
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;
    const batchId = req.query.batchId as string;
    const userId = req.user!.uid;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const fileType = req.query.fileType as string;
    const hasAnalysis = req.query.hasAnalysis === 'true' ? true : req.query.hasAnalysis === 'false' ? false : undefined;

    // Use ResumeService to get user's resumes
    const result = await resumeService.getUserResumes({
      userId,
      sessionId,
      batchId,
      page,
      limit,
      fileType,
      hasAnalysis
    });

    if (isFailure(result)) {
      const statusCode = getErrorStatusCode(result.error, 500);
      return res.status(statusCode).json({
        success: false,
        error: getErrorCode(result.error),
        message: getErrorMessage(result.error),
        timestamp: getErrorTimestamp(result.error)
      });
    }

    const resumeData = result.data;

    res.json({
      success: true,
      data: {
        resumes: resumeData.resumes,
        pagination: resumeData.pagination,
        totalCount: resumeData.pagination.total,
        metadata: resumeData.metadata
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Resume retrieval route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR",
      message: "Failed to retrieve resumes",
      timestamp: new Date().toISOString(),
    });
  }
});

// Get specific resume by ID
router.get("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const resumeId = parseInt(req.params.id);
    const userId = req.user!.uid;

    if (isNaN(resumeId)) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Resume ID must be a number",
        timestamp: new Date().toISOString(),
      });
    }

    // Use ResumeService to get resume by ID
    const result = await resumeService.getResumeById(userId, resumeId);

    if (isFailure(result)) {
      const statusCode = getErrorStatusCode(result.error, 500);
      return res.status(statusCode).json({
        success: false,
        error: getErrorCode(result.error),
        message: getErrorMessage(result.error),
        timestamp: getErrorTimestamp(result.error)
      });
    }

    res.json({
      success: true,
      data: result.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Resume by ID retrieval route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR",
      message: "Failed to retrieve resume",
      timestamp: new Date().toISOString(),
    });
  }
});

// Upload and analyze new resume
router.post(
  "/",
  authenticateUser,
  uploadRateLimiter,
  secureUpload.single("file"),
  validateUploadedFile,
  async (req: Request, res: Response) => {
    const file = req.file;
    const userId = req.user!.uid;
    const sessionId = req.body.sessionId || (req.headers["x-session-id"] as string);
    const batchId = req.body.batchId || (req.headers["x-batch-id"] as string);
    const autoAnalyze = req.body.autoAnalyze !== 'false'; // Default to true

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Please select a resume file to upload",
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Convert multer file to ResumeService expected format
      const fileBuffer = file.buffer || 
        (await import("fs").then((fs) => fs.promises.readFile(file.path!)));

      // Use ResumeService to upload and process resume
      const result = await resumeService.uploadResume({
        userId,
        file: {
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: fileBuffer
        },
        sessionId,
        batchId,
        autoAnalyze
      });

      if (isFailure(result)) {
        const statusCode = getErrorStatusCode(result.error, 500);
        return res.status(statusCode).json({
          success: false,
          error: getErrorCode(result.error),
          message: getErrorMessage(result.error),
          timestamp: getErrorTimestamp(result.error)
        });
      }

      const resumeData = result.data;

      res.json({
        success: true,
        data: {
          id: resumeData.id,
          filename: resumeData.filename,
          fileSize: resumeData.fileSize,
          fileType: resumeData.fileType,
          uploadedAt: resumeData.uploadedAt,
          extractedText: resumeData.extractedText,
          analyzedData: resumeData.analyzedData,
          warnings: resumeData.warnings,
          processingTime: resumeData.processingTime,
          message: "Resume uploaded and processed successfully"
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Resume upload route failed:", error);
      res.status(500).json({
        success: false,
        error: "ROUTE_ERROR",
        message: "Failed to process resume upload",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Batch upload endpoint for multiple resumes
router.post(
  "/batch",
  authenticateUser,
  uploadRateLimiter,
  secureUpload.array("files", 10), // Max 10 files
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    const userId = req.user!.uid;
    const sessionId = req.body.sessionId || (req.headers["x-session-id"] as string);
    const batchId = req.body.batchId || (req.headers["x-batch-id"] as string);
    const autoAnalyze = req.body.autoAnalyze !== 'false'; // Default to true

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Please select resume files to upload",
        timestamp: new Date().toISOString(),
      });
    }

    try {
      // Convert multer files to ResumeService expected format
      const processedFiles: Array<{
        originalname: string;
        mimetype: string;
        size: number;
        buffer: Buffer;
      }> = [];

      for (const file of files) {
        const fileBuffer = file.buffer || 
          (await import("fs").then((fs) => fs.promises.readFile(file.path!)));
        
        processedFiles.push({
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          buffer: fileBuffer
        });
      }

      // Use ResumeService to upload batch of resumes
      const result = await resumeService.uploadResumesBatch({
        userId,
        files: processedFiles,
        sessionId,
        batchId,
        autoAnalyze
      });

      if (isFailure(result)) {
        const statusCode = getErrorStatusCode(result.error, 500);
        return res.status(statusCode).json({
          success: false,
          error: getErrorCode(result.error),
          message: getErrorMessage(result.error),
          timestamp: getErrorTimestamp(result.error)
        });
      }

      const batchData = result.data;

      res.json({
        success: true,
        data: {
          batchId: batchData.batchId,
          message: `Processed ${batchData.statistics.total} files: ${batchData.statistics.successful} successful, ${batchData.statistics.failed} failed`,
          results: {
            successful: batchData.successful.map((r) => ({
              filename: r.filename,
              resumeId: r.id,
              fileSize: r.fileSize,
              processingTime: r.processingTime,
              hasAnalysis: !!r.analyzedData
            })),
            failed: batchData.failed.map((f) => ({
              filename: f.filename,
              error: f.error,
              reason: f.reason
            }))
          },
          summary: {
            totalFiles: batchData.statistics.total,
            successfulUploads: batchData.statistics.successful,
            failedUploads: batchData.statistics.failed,
            totalSize: batchData.statistics.totalSize,
            processingTime: batchData.statistics.processingTime
          }
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Batch resume upload route failed:", error);
      res.status(500).json({
        success: false,
        error: "ROUTE_ERROR",
        message: "Failed to process batch resume upload",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
