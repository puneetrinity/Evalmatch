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
    const userId = req.user!.uid;
    
    logger.info(`Getting resumes for user ${userId}${sessionId ? ` (session: ${sessionId})` : ''}`);
    
    const resumes = await storage.getResumesByUserId(userId, sessionId);
    
    res.json({
      success: true,
      data: {
        resumes: resumes || [],
        count: resumes?.length || 0
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
        sessionId
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
      logger.info(`Processing batch resume upload for user ${userId}`, {
        fileCount: files.length,
        sessionId
      });

      // Get user tier info
      const { getUserTierInfo } = await import('../lib/user-tiers');
      const userTierInfo = getUserTierInfo(userId);

      // Process files in parallel with proper error handling
      const { processBatchResumes } = await import('../lib/batch-processor');
      const results = await processBatchResumes(files, userId, sessionId, userTierInfo);

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      logger.info(`Batch upload completed`, {
        userId,
        total: files.length,
        successful: successful.length,
        failed: failed.length
      });

      res.json({
        success: true,
        data: {
          message: `Processed ${files.length} files: ${successful.length} successful, ${failed.length} failed`,
          results: {
            successful: successful.map(r => ({
              filename: r.filename,
              resumeId: r.resumeId,
              skillsCount: r.analysis?.skills?.length || 0
            })),
            failed: failed.map(r => ({
              filename: r.filename,
              error: r.error
            }))
          },
          summary: {
            totalFiles: files.length,
            successfulUploads: successful.length,
            failedUploads: failed.length,
            totalSkillsExtracted: successful.reduce((sum, r) => sum + (r.analysis?.skills?.length || 0), 0)
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Batch resume upload failed:', error);
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