/**
 * Job Description Management Routes
 * Handles job description creation, retrieval, and management
 * Updated to use JobService for improved maintainability and testability
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import { insertJobDescriptionSchema } from "@shared/schema";
import { logger } from "../lib/logger";
import { jobService } from "../services/job-service";
import { isSuccess, isFailure } from "@shared/result-types";
import { getErrorStatusCode, getErrorCode, getErrorMessage, getErrorTimestamp } from "@shared/type-utilities";

const router = Router();

// Create new job description
router.post("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const jobDescData = validateRequest(insertJobDescriptionSchema, req.body);
    const userId = req.user!.uid;

    // Use JobService to create job with analysis
    const result = await jobService.createJobDescription({
      userId,
      title: jobDescData.title,
      description: jobDescData.description,
      requirements: jobDescData.requirements || [],
      analyzeImmediately: true,
      includeBiasAnalysis: false
    });

    if (isFailure(result)) {
      // Handle different error types appropriately using type-safe utilities
      const statusCode = getErrorStatusCode(result.error, 500);
      return res.status(statusCode).json({
        success: false,
        error: getErrorCode(result.error),
        message: getErrorMessage(result.error),
        timestamp: getErrorTimestamp(result.error)
      });
    }

    const { job, analysis, processingTime } = result.data;

    // Return successful response
    res.json({
      success: true,
      status: "success",
      message: "Job description created and analyzed successfully",
      data: {
        jobDescription: {
          id: job.id,
          title: job.title,
          description: job.description,
          skills: analysis?.skills || [],
          requirements: analysis?.requirements || [],
          experience: analysis?.experience,
          analyzedData: analysis,
          createdAt: job.createdAt,
        },
        analysis: analysis ? {
          skillsExtracted: analysis.skills?.length || 0,
          requirementsFound: analysis.requirements?.length || 0,
          experienceLevel: analysis.experience || "Not specified",
        } : undefined,
        processingTime
      }
    });

  } catch (error) {
    logger.error("Job description creation route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR",
      message: "Failed to create job description",
      timestamp: new Date().toISOString()
    });
  }
});

// Get all job descriptions for the authenticated user
router.get("/", authenticateUser, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const searchQuery = req.query.search as string;

    // Use JobService to get paginated results
    const result = await jobService.getUserJobDescriptions({
      userId,
      page,
      limit,
      searchQuery
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

    const { jobs, total, totalPages } = result.data;

    res.json({
      success: true,
      status: "ok",
      data: {
        jobDescriptions: jobs,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
        }
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Job descriptions retrieval route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR",
      message: "Failed to retrieve job descriptions",
      timestamp: new Date().toISOString()
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
        success: false,
        error: "VALIDATION_ERROR",
        message: "Job description ID must be a number",
        timestamp: new Date().toISOString()
      });
    }

    // Use JobService to get job by ID
    const result = await jobService.getJobDescriptionById(userId, jobId);

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
      status: "ok",
      data: {
        jobDescription: result.data,
        isAnalyzed: !!result.data.analyzedData,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Job description retrieval by ID route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR", 
      message: "Failed to retrieve job description",
      timestamp: new Date().toISOString()
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
        success: false,
        error: "VALIDATION_ERROR",
        message: "Job description ID must be a number",
        timestamp: new Date().toISOString()
      });
    }

    // Use JobService to update job description
    const result = await jobService.updateJobDescription({
      userId,
      jobId,
      title: req.body.title,
      description: req.body.description,
      requirements: req.body.requirements,
      reanalyze: !!req.body.description // Re-analyze if description changed
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

    res.json({
      success: true,
      status: "success",
      message: "Job description updated successfully",
      data: {
        jobDescription: result.data,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Job description update route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR",
      message: "Failed to update job description",
      timestamp: new Date().toISOString()
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
        success: false,
        error: "VALIDATION_ERROR",
        message: "Job description ID must be a number",
        timestamp: new Date().toISOString()
      });
    }

    // Use JobService to delete job description
    const result = await jobService.deleteJobDescription(userId, jobId);

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
      status: "success",
      message: "Job description deleted successfully",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Job description deletion route failed:", error);
    res.status(500).json({
      success: false,
      error: "ROUTE_ERROR",
      message: "Failed to delete job description",
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
