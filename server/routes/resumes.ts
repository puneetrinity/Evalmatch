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
      status: "ok",
      resumes: resumes || [],
      count: resumes?.length || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get resumes:', error);
    res.status(500).json({
      error: "Failed to retrieve resumes",
      message: error instanceof Error ? error.message : 'Unknown error'
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
        error: "Invalid resume ID",
        message: "Resume ID must be a number"
      });
    }
    
    logger.info(`Getting resume ${resumeId} for user ${userId}`);
    
    const resume = await storage.getResumeById(resumeId, userId);
    
    if (!resume) {
      return res.status(404).json({
        error: "Resume not found",
        message: "Resume not found or you don't have permission to access it"
      });
    }
    
    res.json({
      status: "ok",
      resume,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get resume:', error);
    res.status(500).json({
      error: "Failed to retrieve resume",
      message: error instanceof Error ? error.message : 'Unknown error'
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
        error: "No file uploaded",
        message: "Please select a resume file to upload"
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
      const content = await parseDocument(file.path || file.buffer!, file.mimetype);
      
      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          error: "Unable to parse resume",
          message: "The uploaded file appears to be empty or in an unsupported format"
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
        status: "success",
        message: "Resume uploaded and analyzed successfully",
        resume: {
          id: resume.id,
          filename: resume.filename,
          skills: resume.skills,
          experience: resume.experience,
          education: resume.education,
          analyzedData: resume.analyzedData,
          createdAt: resume.createdAt
        },
        analysis: {
          skillsExtracted: analysis.skills?.length || 0,
          experienceDetected: analysis.experience !== "0 years",
          educationFound: (analysis.education?.length || 0) > 0
        }
      });

    } catch (error) {
      logger.error('Resume upload/analysis failed:', error);
      
      // Provide specific error messages
      if (error instanceof Error) {
        if (error.message.includes('document parsing')) {
          return res.status(400).json({
            error: "Document parsing failed",
            message: "Unable to extract text from the uploaded file. Please ensure it's a valid PDF, Word document, or image."
          });
        }
        
        if (error.message.includes('AI analysis')) {
          return res.status(503).json({
            error: "Analysis service unavailable",
            message: "The resume analysis service is temporarily unavailable. Please try again later."
          });
        }
      }

      res.status(500).json({
        error: "Resume processing failed",
        message: error instanceof Error ? error.message : 'Unknown error occurred during resume processing'
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
        error: "No files uploaded",
        message: "Please select resume files to upload"
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
        status: "completed",
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
      });

    } catch (error) {
      logger.error('Batch resume upload failed:', error);
      res.status(500).json({
        error: "Batch upload failed",
        message: error instanceof Error ? error.message : 'Unknown error occurred during batch processing'
      });
    }
  }
);

export default router;