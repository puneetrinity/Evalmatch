/**
 * Job Description Management Routes  
 * Handles job description creation, retrieval, and management
 */

import { Router, Request, Response } from 'express';
import { authenticateUser } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { insertJobDescriptionSchema } from '@shared/schema';
import { logger } from '../lib/logger';
import { storage } from '../storage';

const router = Router();

// Create new job description
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const jobDescData = validateRequest(insertJobDescriptionSchema, req.body);
    
    const userId = req.user!.uid;
    
    logger.info(`Creating job description for user ${userId}`, {
      title: jobDescData.title,
      descriptionLength: jobDescData.description?.length || 0
    });

    // Get user tier info for AI analysis
    const { getUserTierInfo } = await import('../lib/user-tiers');
    const userTierInfo = getUserTierInfo(userId);

    // Create job description record
    const jobDescription = await storage.createJobDescription({
      title: jobDescData.title,
      description: jobDescData.description,
      userId: userId,
      requirements: jobDescData.requirements || null,
      skills: jobDescData.skills || null,
      experience: jobDescData.experience || null
    });

    logger.info(`Job description created with ID ${jobDescription.id}`);

    // Analyze job description with AI
    try {
      const { analyzeJobDescription } = await import('../lib/tiered-ai-provider');
      const analysis = await analyzeJobDescription(
        jobDescription.title,
        jobDescription.description,
        userTierInfo
      );

      // Update job description with analysis
      await storage.updateJobDescriptionAnalysis(jobDescription.id, analysis);
      
      logger.info(`Job description ${jobDescription.id} analyzed successfully`, {
        skillsFound: analysis.skills?.length || 0,
        requirementsFound: analysis.requirements?.length || 0
      });

      res.json({
        status: "success",
        message: "Job description created and analyzed successfully",
        jobDescription: {
          id: jobDescription.id,
          title: jobDescription.title,
          description: jobDescription.description,
          skills: analysis.skills || [],
          requirements: analysis.requirements || [],
          experience: analysis.experience,
          analyzedData: analysis,
          createdAt: jobDescription.createdAt
        },
        analysis: {
          skillsExtracted: analysis.skills?.length || 0,
          requirementsFound: analysis.requirements?.length || 0,
          experienceLevel: analysis.experience || 'Not specified'
        }
      });

    } catch (analysisError) {
      logger.error(`Job analysis failed for job ${jobDescription.id}:`, analysisError);
      
      // Return job description even if analysis fails
      res.json({
        status: "partial_success",
        message: "Job description created, but analysis failed. You can still use it for matching.",
        jobDescription: {
          id: jobDescription.id,
          title: jobDescription.title,
          description: jobDescription.description,
          createdAt: jobDescription.createdAt
        },
        warning: "AI analysis temporarily unavailable"
      });
    }

  } catch (error) {
    logger.error('Job description creation failed:', error);
    
    if (error instanceof Error && error.message.includes('validation')) {
      return res.status(400).json({
        error: "Invalid job description data",
        message: error.message
      });
    }

    res.status(500).json({
      error: "Failed to create job description",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all job descriptions for the authenticated user
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    logger.info(`Getting job descriptions for user ${userId}`, { limit, offset });
    
    const allJobDescriptions = await storage.getJobDescriptionsByUserId(userId);
    // Apply pagination manually since the storage interface doesn't support it
    const jobDescriptions = allJobDescriptions.slice(offset, offset + limit);
    
    res.json({
      status: "ok",
      jobDescriptions: jobDescriptions || [],
      count: jobDescriptions?.length || 0,
      pagination: {
        limit,
        offset,
        hasMore: (jobDescriptions?.length || 0) === limit
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get job descriptions:', error);
    res.status(500).json({
      error: "Failed to retrieve job descriptions",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific job description by ID
router.get("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.id);
    const userId = req.user!.uid;
    
    if (isNaN(jobId)) {
      return res.status(400).json({
        error: "Invalid job description ID",
        message: "Job description ID must be a number"
      });
    }
    
    logger.info(`Getting job description ${jobId} for user ${userId}`);
    
    const jobDescription = await storage.getJobDescriptionById(jobId, userId);
    
    if (!jobDescription) {
      return res.status(404).json({
        error: "Job description not found",
        message: "Job description not found or you don't have permission to access it"
      });
    }
    
    res.json({
      status: "ok",
      jobDescription,
      isAnalyzed: !!jobDescription.analyzedData,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get job description:', error);
    res.status(500).json({
      error: "Failed to retrieve job description",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update job description
router.patch("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.id);
    const userId = req.user!.uid;
    
    if (isNaN(jobId)) {
      return res.status(400).json({
        error: "Invalid job description ID",
        message: "Job description ID must be a number"
      });
    }

    // Validate that user owns this job description
    const existingJob = await storage.getJobDescriptionById(jobId, userId);
    if (!existingJob) {
      return res.status(404).json({
        error: "Job description not found",
        message: "Job description not found or you don't have permission to modify it"
      });
    }

    logger.info(`Updating job description ${jobId} for user ${userId}`);

    // Update job description
    const updatedJob = await storage.updateJobDescription(jobId, req.body);
    
    // If description was changed, re-analyze
    if (req.body.description && req.body.description !== existingJob.description) {
      try {
        const { getUserTierInfo } = await import('../lib/user-tiers');
        const userTierInfo = getUserTierInfo(userId);
        
        const { analyzeJobDescription } = await import('../lib/tiered-ai-provider');
        const analysis = await analyzeJobDescription(
          updatedJob.title,
          updatedJob.description,
          userTierInfo
        );

        await storage.updateJobDescriptionAnalysis(jobId, analysis);
        
        logger.info(`Job description ${jobId} re-analyzed after update`);
      } catch (analysisError) {
        logger.error(`Re-analysis failed for updated job ${jobId}:`, analysisError);
        // Continue without failing the update
      }
    }

    res.json({
      status: "success",
      message: "Job description updated successfully",
      jobDescription: updatedJob
    });

  } catch (error) {
    logger.error('Job description update failed:', error);
    res.status(500).json({
      error: "Failed to update job description",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete job description
router.delete("/:id", authenticateUser, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.id);
    const userId = req.user!.uid;
    
    if (isNaN(jobId)) {
      return res.status(400).json({
        error: "Invalid job description ID",
        message: "Job description ID must be a number"
      });
    }

    // Validate that user owns this job description
    const existingJob = await storage.getJobDescriptionById(jobId, userId);
    if (!existingJob) {
      return res.status(404).json({
        error: "Job description not found",
        message: "Job description not found or you don't have permission to delete it"
      });
    }

    logger.info(`Deleting job description ${jobId} for user ${userId}`);

    await storage.deleteJobDescription(jobId);
    
    res.json({
      status: "success",
      message: "Job description deleted successfully"
    });

  } catch (error) {
    logger.error('Job description deletion failed:', error);
    res.status(500).json({
      error: "Failed to delete job description",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;