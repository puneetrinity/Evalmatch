/**
 * Job Description Management Routes
 * Handles job description creation, retrieval, and management
 * Updated to use JobService for improved maintainability and testability
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import { validators } from "../middleware/input-validation";
import { insertJobDescriptionSchema } from "@shared/schema";
import { logger } from "../lib/logger";
import { createJobService } from "../services/job-service";
import { getStorage } from "../storage";
import { isFailure } from "@shared/result-types";
import { getErrorStatusCode, getErrorCode, getErrorMessage, getErrorTimestamp } from "@shared/type-utilities";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     JobDescriptionInput:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           minLength: 1
 *           maxLength: 200
 *           example: "Senior Full Stack Developer"
 *         description:
 *           type: string
 *           minLength: 50
 *           example: "We are seeking a talented Senior Full Stack Developer to join our dynamic team..."
 *         requirements:
 *           type: array
 *           items:
 *             type: string
 *           example: ["5+ years React experience", "Node.js expertise", "Bachelor's degree"]
 *       required:
 *         - title
 *         - description
 *
 *     JobListResponse:
 *       allOf:
 *         - $ref: '#/components/schemas/ApiResponse'
 *         - type: object
 *           properties:
 *             data:
 *               type: object
 *               properties:
 *                 jobs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/JobDescription'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 12 }
 *                     totalPages: { type: integer, example: 1 }
 */

/**
 * @swagger
 * /job-descriptions:
 *   post:
 *     tags: [Job Descriptions]
 *     summary: Create a new job description
 *     description: |
 *       Create a new job description with automatic AI analysis to extract skills, 
 *       requirements, and experience levels. The job description is immediately 
 *       analyzed to enable efficient candidate matching.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/JobDescriptionInput'
 *           example:
 *             title: "Senior Full Stack Developer"
 *             description: "We are seeking a talented Senior Full Stack Developer to join our dynamic team. You will be responsible for developing and maintaining both frontend and backend systems using modern technologies."
 *             requirements:
 *               - "5+ years of experience in full-stack development"
 *               - "Proficiency in React and Node.js"
 *               - "Experience with PostgreSQL databases"
 *               - "Bachelor's degree in Computer Science or related field"
 *     responses:
 *       200:
 *         description: Job description created successfully
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
 *                         jobDescription:
 *                           allOf:
 *                             - $ref: '#/components/schemas/JobDescription'
 *                             - type: object
 *                               properties:
 *                                 skills:
 *                                   type: array
 *                                   items: { type: string }
 *                                   example: ["React", "Node.js", "PostgreSQL", "JavaScript"]
 *                                 analyzedData:
 *                                   type: object
 *                                   description: "AI analysis results"
 *                         analysis:
 *                           type: object
 *                           properties:
 *                             skillsExtracted: { type: integer, example: 4 }
 *                             requirementsFound: { type: integer, example: 4 }
 *                             experienceLevel: { type: string, example: "Senior (5+ years)" }
 *                         processingTime:
 *                           type: number
 *                           description: "Analysis processing time in milliseconds"
 *                           example: 1250
 *             example:
 *               success: true
 *               data:
 *                 jobDescription:
 *                   id: 456
 *                   title: "Senior Full Stack Developer"
 *                   description: "We are seeking a talented Senior Full Stack Developer..."
 *                   skills: ["React", "Node.js", "PostgreSQL", "JavaScript"]
 *                   requirements: ["5+ years experience", "React proficiency", "Node.js expertise"]
 *                   experience: "Senior (5+ years)"
 *                   createdAt: "2025-01-14T10:40:00.000Z"
 *                   userId: "firebase_user_123"
 *                 analysis:
 *                   skillsExtracted: 4
 *                   requirementsFound: 4
 *                   experienceLevel: "Senior (5+ years)"
 *                 processingTime: 1250
 *               timestamp: "2025-01-14T10:40:00.000Z"
 *       400:
 *         description: Invalid input data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             examples:
 *               missingTitle:
 *                 summary: Missing title
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "VALIDATION_ERROR"
 *                     message: "Job title is required"
 *                   timestamp: "2025-01-14T10:40:00.000Z"
 *               shortDescription:
 *                 summary: Description too short
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "VALIDATION_ERROR"
 *                     message: "Job description must be at least 50 characters long"
 *                   timestamp: "2025-01-14T10:40:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Create new job description
router.post("/", authenticateUser, validators.createJob, async (req: Request, res: Response) => {
  try {
    // Validate request body
    const jobDescData = validateRequest(insertJobDescriptionSchema, req.body);
    const userId = req.user!.uid;

    // Create JobService instance with current storage
    const storage = getStorage();
    const jobServiceInstance = createJobService(storage);
    
    // Use JobService to create job with analysis
    const result = await jobServiceInstance.createJobDescription({
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
router.get("/", authenticateUser, validators.getAnalysis, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const limit = parseInt(req.query.limit as string) || 20;
    const page = parseInt(req.query.page as string) || 1;
    const searchQuery = req.query.search as string;

    // Create JobService instance with current storage
    const storage = getStorage();
    const jobServiceInstance = createJobService(storage);
    
    // Use JobService to get paginated results
    const result = await jobServiceInstance.getUserJobDescriptions({
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
router.get("/:id", authenticateUser, validators.getResume, async (req: Request, res: Response) => {
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

    // Create JobService instance with current storage
    const storage = getStorage();
    const jobServiceInstance = createJobService(storage);
    
    // Use JobService to get job by ID
    const result = await jobServiceInstance.getJobDescriptionById(userId, jobId);

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
router.patch("/:id", authenticateUser, validators.updateJob, async (req: Request, res: Response) => {
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

    // Create JobService instance with current storage
    const storage = getStorage();
    const jobServiceInstance = createJobService(storage);
    
    // Use JobService to update job description
    const result = await jobServiceInstance.updateJobDescription({
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
router.delete("/:id", authenticateUser, validators.getResume, async (req: Request, res: Response) => {
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

    // Create JobService instance with current storage
    const storage = getStorage();
    const jobServiceInstance = createJobService(storage);
    
    // Use JobService to delete job description
    const result = await jobServiceInstance.deleteJobDescription(userId, jobId);

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
