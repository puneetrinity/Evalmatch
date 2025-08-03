/**
 * Resume Management Routes
 * Handles resume upload, retrieval, and management
 */

import { Router, Request, Response } from 'express';
import { authenticateUser } from '../middleware/auth';
import { secureUpload, validateUploadedFile } from '../middleware/upload';
import { uploadRateLimiter } from '../middleware/rate-limiter';
import { logger } from '../lib/logger';
import { storage } from '../storage';

const router = Router();

// Get all resumes for the authenticated user
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;
    const batchId = req.query.batchId as string;
    const userId = req.user!.uid;
    
    logger.info(`Getting resumes for user ${userId}${sessionId ? ` (session: ${sessionId})` : ''}${batchId ? ` (batch: ${batchId})` : ''}`);
    
    const resumes = await storage.getResumesByUserId(userId, sessionId, batchId);
    
    res.json({
      success: true,
      data: {
        resumes: resumes || [],
        totalCount: resumes?.length || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get resumes:', error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve resumes",
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
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
        error: "Invalid resume ID",
        message: "Resume ID must be a number",
        timestamp: new Date().toISOString()
      });
    }
    
    logger.info(`Getting resume ${resumeId} for user ${userId}`);
    
    const resume = await storage.getResumeById(resumeId, userId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: "Resume not found",
        message: "Resume not found or you don't have permission to access it",
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      data: resume,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get resume:', error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve resume",
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Upload and analyze new resume
router.post("/", 
  authenticateUser,
  uploadRateLimiter,
  secureUpload.single("file"),
  validateUploadedFile,
  async (req: Request, res: Response) => {
    const file = req.file;
    const userId = req.user!.uid;
    const sessionId = req.body.sessionId || req.headers['x-session-id'] as string;
    
    // Generate batch ID if not provided by client
    let batchId = req.body.batchId || req.headers['x-batch-id'] as string;
    const batchIdProvided = !!batchId;
    
    if (!batchId) {
      batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.info(`Generated batch ID for single resume upload`, {
        userId,
        batchId,
        filename: file?.originalname
      });
    } else {
      logger.info(`Using client-provided batch ID for single resume upload`, {
        userId,
        batchId,
        filename: file?.originalname
      });
    }
    
    if (!file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
        message: "Please select a resume file to upload",
        timestamp: new Date().toISOString()
      });
    }

    try {
      logger.info(`Processing resume upload for user ${userId}`, {
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        sessionId,
        batchId,
        batchIdGenerated: !batchIdProvided
      });

      // Parse document content
      const { parseDocument } = await import('../lib/document-parser');
      
      // Read file into buffer (since we're using disk storage)
      const fileBuffer = file.buffer || await import('fs').then(fs => fs.promises.readFile(file.path!));
      const content = await parseDocument(fileBuffer, file.mimetype);
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "Unable to parse resume",
          message: "The uploaded file appears to be empty or in an unsupported format",
          timestamp: new Date().toISOString()
        });
      }

      // Get user tier for AI analysis
      const { getUserTierInfo } = await import('../lib/user-tiers');
      const userTierInfo = getUserTierInfo(userId);

      // Analyze resume with AI
      const { analyzeResumeParallel } = await import('../lib/tiered-ai-provider');
      const analysis = await analyzeResumeParallel(content, userTierInfo);

      // Create resume record
      const resumeData = {
        userId,
        sessionId,
        batchId,
        filename: file.originalname,
        fileSize: file.size,
        fileType: file.mimetype,
        content,
        skills: analysis.skills || [],
        experience: analysis.experience || "0 years", // JSON string
        education: Array.isArray(analysis.education) ? analysis.education : [], // JSON array
        analyzedData: analysis
      };

      const resume = await storage.createResume(resumeData);
      
      logger.info(`Resume uploaded and analyzed successfully`, {
        resumeId: resume.id,
        userId,
        skillsCount: analysis.skills?.length || 0
      });

      res.json({
        success: true,
        data: {
          id: resume.id,
          filename: resume.filename,
          fileSize: resume.fileSize,
          fileType: resume.fileType,
          message: "Resume uploaded and analyzed successfully",
          processingTime: Date.now() - new Date(resume.createdAt).getTime()
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Resume upload/analysis failed:', error);
      
      // Provide specific error messages
      if (error instanceof Error) {
        if (error.message.includes('document parsing')) {
          return res.status(400).json({
            success: false,
            error: "Document parsing failed",
            message: "Unable to extract text from the uploaded file. Please ensure it's a valid PDF, Word document, or image.",
            timestamp: new Date().toISOString()
          });
        }
        
        if (error.message.includes('AI analysis')) {
          return res.status(503).json({
            success: false,
            error: "Analysis service unavailable",
            message: "The resume analysis service is temporarily unavailable. Please try again later.",
            timestamp: new Date().toISOString()
          });
        }
      }

      res.status(500).json({
        success: false,
        error: "Resume processing failed",
        message: error instanceof Error ? error.message : 'Unknown error occurred during resume processing',
        timestamp: new Date().toISOString()
      });
    }
  }
);

// Batch upload endpoint for multiple resumes
router.post("/batch",
  authenticateUser,
  uploadRateLimiter,
  secureUpload.array("files", 10), // Max 10 files
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    const userId = req.user!.uid;
    const sessionId = req.body.sessionId || req.headers['x-session-id'] as string;
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No files uploaded",
        message: "Please select resume files to upload",
        timestamp: new Date().toISOString()
      });
    }

    try {
      const batchStartTime = Date.now();
      logger.info('Starting batch resume upload processing', {
        userId,
        fileCount: files.length,
        sessionId: sessionId || null,
        fileDetails: files.map(f => ({
          originalname: f.originalname,
          mimetype: f.mimetype,
          size: f.size
        })),
        startTime: new Date(batchStartTime).toISOString()
      });

      // Generate unique batch ID for this upload
      let batchId = req.body.batchId || req.headers['x-batch-id'] as string;
      const batchIdProvided = !!batchId;
      
      if (!batchId) {
        batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        logger.info('Generated batch ID for batch resume upload', {
          userId,
          batchId,
          fileCount: files.length,
          sessionId: sessionId || null
        });
      } else {
        logger.info('Using client-provided batch ID for batch resume upload', {
          userId,
          batchId,
          fileCount: files.length,
          sessionId: sessionId || null
        });
      }

      // Get user tier info
      const { getUserTierInfo } = await import('../lib/user-tiers');
      const userTierInfo = getUserTierInfo(userId);

      // Parse document content from each file
      const { parseDocument } = await import('../lib/document-parser');
      const resumeInputs: Array<{
        filename: string;
        fileSize: number;
        fileType: string;
        content: string;
      }> = [];

      // Process each file to extract content
      for (const file of files) {
        try {
          // Read file into buffer (since we're using disk storage)
          const fileBuffer = file.buffer || await import('fs').then(fs => fs.promises.readFile(file.path!));
          const content = await parseDocument(fileBuffer, file.mimetype);
          
          if (!content || content.trim().length === 0) {
            logger.warn(`Skipping empty file: ${file.originalname}`);
            continue;
          }

          resumeInputs.push({
            filename: file.originalname,
            fileSize: file.size,
            fileType: file.mimetype,
            content
          });
        } catch (error) {
          logger.error(`Error parsing file ${file.originalname}:`, error);
          // Continue processing other files
        }
      }

      if (resumeInputs.length === 0) {
        return res.status(400).json({
          success: false,
          error: "No valid files to process",
          message: "All uploaded files appear to be empty or in unsupported formats",
          timestamp: new Date().toISOString()
        });
      }

      // Create resume records in database first
      const createdResumes = await Promise.all(
        resumeInputs.map(async (input) => {
          try {
            const resumeData = {
              userId,
              sessionId,
              batchId,
              filename: input.filename,
              fileSize: input.fileSize,
              fileType: input.fileType,
              content: input.content,
              skills: [], // Will be populated by analysis
              experience: "0 years", // Will be populated by analysis
              education: [], // Will be populated by analysis
              analyzedData: null // Will be populated by analysis
            };

            const resume = await storage.createResume(resumeData);
            return {
              id: resume.id,
              content: input.content,
              filename: input.filename,
              success: true
            };
          } catch (error) {
            logger.error(`Error creating resume record for ${input.filename}:`, error);
            return {
              id: -1,
              content: input.content,
              filename: input.filename,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      // Filter out failed resume creations
      const successfulResumes = createdResumes.filter(r => r.success);
      const failedResumes = createdResumes.filter(r => !r.success);

      if (successfulResumes.length === 0) {
        return res.status(500).json({
          success: false,
          error: "Failed to create resume records",
          message: "Could not save any resumes to the database",
          timestamp: new Date().toISOString()
        });
      }

      // Build BatchResumeInput array for the batch processor
      const batchResumeInputs = successfulResumes.map(resume => ({
        id: resume.id,
        content: resume.content,
        filename: resume.filename
      }));

      logger.info('Starting batch AI analysis processing', {
        userId,
        batchId,
        resumesToProcess: batchResumeInputs.length,
        userTier: {
          name: userTierInfo.name,
          model: userTierInfo.model,
          maxConcurrency: userTierInfo.maxConcurrency
        },
        resumeDetails: batchResumeInputs.map(r => ({
          id: r.id,
          filename: r.filename,
          contentLength: r.content?.length || 0
        }))
      });
      
      // Process resumes with AI analysis using the correct function signature
      const { processBatchResumes } = await import('../lib/batch-processor');
      const batchProcessStartTime = Date.now();
      const batchResult = await processBatchResumes(batchResumeInputs, userTierInfo);
      const batchProcessTime = Date.now() - batchProcessStartTime;
      
      logger.info('Batch AI analysis completed', {
        userId,
        batchId,
        processedCount: batchResult.processed,
        errorCount: batchResult.errors.length,
        batchProcessTime,
        totalBatchTime: batchResult.timeTaken,
        successRate: Math.round((batchResult.processed / batchResumeInputs.length) * 100)
      });

      // Prepare results compatible with the existing response format
      const results = [
        ...successfulResumes.map(resume => ({
          success: true as const,
          filename: resume.filename,
          resumeId: resume.id,
          analysis: null // Analysis results are stored in database by batch processor
        })),
        ...failedResumes.map(resume => ({
          success: false as const,
          filename: resume.filename,
          resumeId: undefined,
          analysis: null,
          error: resume.error || 'Failed to create resume record'
        }))
      ];

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      const totalBatchTime = Date.now() - batchStartTime;
      
      logger.info('Batch upload completed successfully', {
        userId,
        batchId,
        sessionId: sessionId || null,
        batchIdGenerated: !batchIdProvided,
        fileProcessing: {
          total: files.length,
          successful: successful.length,
          failed: failed.length,
          successRate: Math.round((successful.length / files.length) * 100)
        },
        aiAnalysisResult: {
          processed: batchResult.processed,
          analysisErrors: batchResult.errors.length,
          analysisTime: batchResult.timeTaken,
          analysisSuccessRate: Math.round((batchResult.processed / batchResumeInputs.length) * 100)
        },
        timing: {
          totalBatchTime,
          avgTimePerFile: Math.round(totalBatchTime / files.length),
          filesPerSecond: Math.round((files.length / totalBatchTime) * 1000)
        },
        userTier: userTierInfo.name,
        endTime: new Date().toISOString()
      });
      
      if (failed.length > 0) {
        logger.warn('Some files failed processing', {
          userId,
          batchId,
          failedCount: failed.length,
          failures: failed.map(f => ({
            filename: f.filename,
            error: (f as any).error
          }))
        });
      }
      
      if (batchResult.errors.length > 0) {
        logger.warn('Some AI analyses failed', {
          userId,
          batchId,
          analysisErrorCount: batchResult.errors.length,
          analysisErrors: batchResult.errors.map(e => ({
            resumeId: e.id,
            error: e.error
          }))
        });
      }

      res.json({
        success: true,
        data: {
          batchId,
          message: `Processed ${files.length} files: ${successful.length} successful, ${failed.length} failed`,
          results: {
            successful: successful.map(r => ({
              filename: r.filename,
              resumeId: r.resumeId,
              skillsCount: 0 // Skills will be populated by the batch processor
            })),
            failed: failed.map(r => ({
              filename: r.filename,
              error: (r as any).error
            }))
          },
          summary: {
            totalFiles: files.length,
            successfulUploads: successful.length,
            failedUploads: failed.length,
            batchAnalysisResult: {
              processed: batchResult.processed,
              timeTaken: batchResult.timeTaken,
              analysisErrors: batchResult.errors.length
            }
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const totalBatchTime = Date.now() - (batchStartTime || Date.now());
      
      logger.error('Batch resume upload failed catastrophically', {
        userId,
        batchId: batchId || 'not_generated',
        sessionId: sessionId || null,
        fileCount: files?.length || 0,
        totalBatchTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      });
      
      res.status(500).json({
        success: false,
        error: "Batch upload failed",
        message: error instanceof Error ? error.message : 'Unknown error occurred during batch processing',
        timestamp: new Date().toISOString()
      });
    }
  }
);

export default router;