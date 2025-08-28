/**
 * Resume Management Routes
 * Handles resume upload, retrieval, and management
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { secureUpload, validateUploadedFile } from "../middleware/upload";
import { uploadRateLimiter } from "../middleware/rate-limiter";
import { validators } from "../middleware/input-validation";
import { logger } from "../lib/logger";
import { createResumeService } from "../services/resume-service";
import { getStorage } from "../storage";
import { isFailure } from "@shared/result-types";
import { getErrorStatusCode, getErrorCode, getErrorMessage, getErrorTimestamp } from "@shared/type-utilities";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ResumeListResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponse'
 *         - type: object
 *           properties:
 *             data:
 *               type: object
 *               properties:
 *                 resumes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Resume'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 45 }
 *                     totalPages: { type: integer, example: 3 }
 */

/**
 * @swagger
 * /resumes:
 *   get:
 *     tags: [Resumes]
 *     summary: Get all resumes for authenticated user
 *     description: |
 *       Retrieve all resumes uploaded by the authenticated user with optional filtering and pagination.
 *       Supports filtering by file type, analysis status, session, and batch.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         description: Page number for pagination
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *       - name: limit
 *         in: query
 *         description: Number of resumes per page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *           example: 20
 *       - name: fileType
 *         in: query
 *         description: Filter by file type
 *         schema:
 *           type: string
 *           enum: [pdf, docx, txt]
 *           example: pdf
 *       - name: hasAnalysis
 *         in: query
 *         description: Filter by analysis status
 *         schema:
 *           type: boolean
 *           example: true
 *       - name: sessionId
 *         in: query
 *         description: Filter by session ID
 *         schema:
 *           type: string
 *           example: "session_123"
 *       - name: batchId
 *         in: query
 *         description: Filter by batch ID
 *         schema:
 *           type: string
 *           example: "batch_456"
 *     responses:
 *       200:
 *         description: Resumes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ResumeListResponse'
 *             example:
 *               success: true
 *               data:
 *                 resumes:
 *                   - id: 123
 *                     filename: "john_doe_resume.pdf"
 *                     originalName: "John Doe Resume.pdf"
 *                     fileSize: 245760
 *                     mimeType: "application/pdf"
 *                     status: "analyzed"
 *                     uploadedAt: "2025-01-14T10:30:00.000Z"
 *                     userId: "firebase_user_123"
 *                 pagination:
 *                   page: 1
 *                   limit: 20
 *                   total: 45
 *                   totalPages: 3
 *               timestamp: "2025-01-14T10:30:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Get all resumes for the authenticated user
router.get("/", authenticateUser, validators.getResumes, async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;
    const batchId = req.query.batchId as string;
    const userId = req.user!.uid;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const fileType = req.query.fileType as string;
    const hasAnalysis = req.query.hasAnalysis === 'true' ? true : req.query.hasAnalysis === 'false' ? false : undefined;

    // Create ResumeService instance with current storage
    const storage = getStorage();
    const resumeServiceInstance = createResumeService(storage);
    
    // Use ResumeService to get user's resumes
    const result = await resumeServiceInstance.getUserResumes({
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

/**
 * @swagger
 * /resumes/{id}:
 *   get:
 *     tags: [Resumes]
 *     summary: Get specific resume by ID
 *     description: |
 *       Retrieve a specific resume by its ID. Only the owner of the resume can access it.
 *       Returns full resume details including extracted content.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/ResumeId'
 *     responses:
 *       200:
 *         description: Resume retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         resume:
 *                           $ref: '#/components/schemas/Resume'
 *             example:
 *               success: true
 *               data:
 *                 resume:
 *                   id: 123
 *                   filename: "john_doe_resume.pdf"
 *                   originalName: "John Doe Resume.pdf"
 *                   content: "John Doe\nSoftware Engineer\n5 years of experience..."
 *                   fileSize: 245760
 *                   mimeType: "application/pdf"
 *                   status: "analyzed"
 *                   uploadedAt: "2025-01-14T10:30:00.000Z"
 *                   userId: "firebase_user_123"
 *               timestamp: "2025-01-14T10:30:00.000Z"
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Resume not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               error:
 *                 code: "RESUME_NOT_FOUND"
 *                 message: "Resume not found or access denied"
 *               timestamp: "2025-01-14T10:30:00.000Z"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Get specific resume by ID
router.get("/:id", authenticateUser, validators.getResume, async (req: Request, res: Response) => {
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

    // Create ResumeService instance with current storage
    const storage = getStorage();
    const resumeServiceInstance = createResumeService(storage);
    
    // Use ResumeService to get resume by ID
    const result = await resumeServiceInstance.getResumeById(userId, resumeId);

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
/**
 * @swagger
 * /resumes:
 *   post:
 *     tags: [Resumes]
 *     summary: Upload a resume
 *     description: |
 *       Upload a resume file for processing and analysis. Supports PDF, DOCX, and TXT formats.
 *       Files are automatically processed and analyzed unless explicitly disabled.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Resume file (PDF, DOCX, or TXT)
 *               sessionId:
 *                 type: string
 *                 description: Optional session identifier for grouping uploads
 *                 example: "session_123"
 *               batchId:
 *                 type: string
 *                 description: Optional batch identifier for bulk operations
 *                 example: "batch_456"
 *               autoAnalyze:
 *                 type: boolean
 *                 description: Whether to automatically analyze the resume after upload
 *                 default: true
 *                 example: true
 *             required:
 *               - file
 *           encoding:
 *             file:
 *               contentType: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain
 *     responses:
 *       200:
 *         description: Resume uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         resume:
 *                           $ref: '#/components/schemas/Resume'
 *                         processing:
 *                           type: object
 *                           properties:
 *                             contentExtracted: { type: boolean, example: true }
 *                             analysisStarted: { type: boolean, example: true }
 *                             estimatedTime: { type: string, example: "30 seconds" }
 *             example:
 *               success: true
 *               data:
 *                 resume:
 *                   id: 124
 *                   filename: "new_resume.pdf"
 *                   originalName: "New Resume.pdf"
 *                   fileSize: 245760
 *                   mimeType: "application/pdf"
 *                   status: "processing"
 *                   uploadedAt: "2025-01-14T10:35:00.000Z"
 *                   userId: "firebase_user_123"
 *                 processing:
 *                   contentExtracted: true
 *                   analysisStarted: true
 *                   estimatedTime: "30 seconds"
 *               timestamp: "2025-01-14T10:35:00.000Z"
 *       400:
 *         description: Invalid file or validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             examples:
 *               noFile:
 *                 summary: No file provided
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "VALIDATION_ERROR"
 *                     message: "Please select a resume file to upload"
 *                   timestamp: "2025-01-14T10:35:00.000Z"
 *               invalidFormat:
 *                 summary: Unsupported file format
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "FILE_FORMAT_ERROR"
 *                     message: "Only PDF, DOCX, and TXT files are supported"
 *                   timestamp: "2025-01-14T10:35:00.000Z"
 *               fileTooLarge:
 *                 summary: File size exceeds limit
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "FILE_TOO_LARGE"
 *                     message: "File size cannot exceed 10MB"
 *                   timestamp: "2025-01-14T10:35:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       413:
 *         description: File too large
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       429:
 *         $ref: '#/components/responses/RateLimitError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post(
  "/",
  authenticateUser,
  uploadRateLimiter,
  secureUpload.single("file"),
  validateUploadedFile,
  validators.uploadResume,
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
      // ROBUST FILE READING: Handle diskStorage multer files with comprehensive error handling
      let fileBuffer: Buffer;
      
      if (file.buffer) {
        // Memory storage (unlikely but handle gracefully)
        fileBuffer = file.buffer;
        logger.info("Using file buffer from memory storage", { filename: file.originalname });
      } else if (file.path) {
        // Disk storage - read from filesystem with robust error handling
        try {
          const fs = await import("fs");
          
          // Verify file exists and is accessible before reading
          await fs.promises.access(file.path, fs.constants.R_OK);
          
          // Get file stats to ensure it's a valid file
          const stats = await fs.promises.stat(file.path);
          if (!stats.isFile() || stats.size === 0) {
            throw new Error(`Invalid file: size=${stats.size}, isFile=${stats.isFile()}`);
          }
          
          // Read file with proper error handling
          fileBuffer = await fs.promises.readFile(file.path);
          
          logger.info("Successfully read file from disk storage", { 
            filename: file.originalname,
            path: file.path,
            size: stats.size,
            actualSize: fileBuffer.length
          });
          
        } catch (fileError) {
          logger.error("Failed to read uploaded file from disk", {
            filename: file.originalname,
            filePath: file.path,
            error: fileError instanceof Error ? fileError.message : 'Unknown error',
            userId
          });
          
          return res.status(400).json({
            success: false,
            error: "FILE_READ_ERROR",
            message: "Unable to process uploaded file. Please try uploading again.",
            details: `File reading failed: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        logger.error("No file buffer or path available", { 
          filename: file.originalname,
          hasBuffer: !!file.buffer,
          hasPath: !!file.path,
          userId
        });
        
        return res.status(400).json({
          success: false,
          error: "INVALID_FILE_STATE",
          message: "File upload failed - no accessible file data",
          timestamp: new Date().toISOString(),
        });
      }

      // Create ResumeService instance with current storage
      const storage = getStorage();
      const resumeServiceInstance = createResumeService(storage);
      
      // Use ResumeService to upload and process resume
      const result = await resumeServiceInstance.uploadResume({
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
  validators.rateLimitModerate,
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
        try {
          // ROBUST FILE READING for batch uploads
          let fileBuffer: Buffer;
          
          if (file.buffer) {
            fileBuffer = file.buffer;
          } else if (file.path) {
            const fs = await import("fs");
            
            // Verify file exists and is accessible
            await fs.promises.access(file.path, fs.constants.R_OK);
            const stats = await fs.promises.stat(file.path);
            
            if (!stats.isFile() || stats.size === 0) {
              throw new Error(`Invalid file: ${file.originalname}`);
            }
            
            fileBuffer = await fs.promises.readFile(file.path);
          } else {
            throw new Error(`No file data available for: ${file.originalname}`);
          }
          
          processedFiles.push({
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: fileBuffer
          });
          
        } catch (fileError) {
          logger.error("Failed to read file in batch upload", {
            filename: file.originalname,
            error: fileError instanceof Error ? fileError.message : 'Unknown error',
            userId
          });
          
          // For batch uploads, we can skip failed files and continue
          // The batch service will handle individual file failures
          continue;
        }
      }

      // Create ResumeService instance with current storage
      const storage = getStorage();
      const resumeServiceInstance = createResumeService(storage);
      
      // Use ResumeService to upload batch of resumes
      const result = await resumeServiceInstance.uploadResumesBatch({
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
