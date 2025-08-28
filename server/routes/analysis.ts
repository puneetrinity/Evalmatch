/**
 * Analysis and Matching Routes
 * Handles resume-job matching, interview generation, and bias detection
 * Updated to use service layer for better maintainability and testability
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { logger } from "../lib/logger";
import { getStorage } from "../storage";
import { createAnalysisService } from "../services/analysis-service";
import { validators } from "../middleware/input-validation";
import {
  isFailure
} from "@shared/result-types";
import { getErrorStatusCode, getErrorCode, getErrorMessage, getErrorTimestamp } from "@shared/type-utilities";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     AnalysisRequest:
 *       type: object
 *       properties:
 *         resumeIds:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array of resume IDs to analyze (optional - if not provided, analyzes all user resumes)
 *           example: [123, 124, 125]
 *         sessionId:
 *           type: string
 *           description: Optional session ID for grouping
 *           example: "session_123"
 *         batchId:
 *           type: string
 *           description: Optional batch ID for bulk operations
 *           example: "batch_456"
 *
 *     BiasAnalysisRequest:
 *       type: object
 *       properties:
 *         includeRecommendations:
 *           type: boolean
 *           description: Include bias reduction recommendations
 *           default: true
 *           example: true
 */

/**
 * @swagger
 * /analysis/analyze/{jobId}:
 *   post:
 *     tags: [Analysis]
 *     summary: Analyze resumes against job description
 *     description: |
 *       Perform AI-powered analysis of resumes against a specific job description.
 *       Returns matching scores, skill matches, strengths, and improvement areas.
 *       Can analyze specific resumes or all user resumes if no IDs provided.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/JobIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AnalysisRequest'
 *           example:
 *             resumeIds: [123, 124, 125]
 *             sessionId: "session_123"
 *             batchId: "batch_456"
 *     responses:
 *       200:
 *         description: Analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     analysisId:
 *                       type: integer
 *                       example: 789
 *                     jobId:
 *                       type: integer
 *                       example: 456
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AnalysisResult'
 *             example:
 *               success: true
 *               analysisId: 789
 *               jobId: 456
 *               results:
 *                 - resumeId: 123
 *                   filename: "john_doe_resume.pdf"
 *                   candidateName: "John Doe"
 *                   matchPercentage: 87.5
 *                   matchedSkills: ["React", "Node.js", "JavaScript"]
 *                   missingSkills: ["Docker", "Kubernetes"]
 *                   candidateStrengths: ["Strong React experience", "Full-stack capabilities"]
 *                   candidateWeaknesses: ["Limited DevOps experience"]
 *                   overallScore: 87.5
 *                   confidenceScore: 92.3
 *                   analyzedAt: "2025-01-14T10:45:00.000Z"
 *               timestamp: "2025-01-14T10:45:00.000Z"
 *       400:
 *         description: Invalid job ID or request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               error:
 *                 code: "VALIDATION_ERROR"
 *                 message: "Job ID must be a number"
 *               timestamp: "2025-01-14T10:45:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Job description not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               error:
 *                 code: "JOB_NOT_FOUND"
 *                 message: "Job description not found or access denied"
 *               timestamp: "2025-01-14T10:45:00.000Z"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Analyze resumes against a job description
router.post(
  "/analyze/:jobId",
  authenticateUser,
  validators.analyzeResume,
  async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const userId = req.user!.uid;
      const sessionId = req.body.sessionId;
      const batchId = req.body.batchId;
      const resumeIds = req.body.resumeIds;

      if (isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: "Job ID must be a number",
          timestamp: new Date().toISOString(),
        });
      }

      // Get storage instance and create analysis service
      const storage = getStorage();
      const analysisService = createAnalysisService(storage);
      
      // Use AnalysisService for batch analysis
      const result = await analysisService.analyzeResumesBatch({
        userId,
        jobId,
        sessionId,
        batchId,
        resumeIds
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

      const analysisData = result.data;

      // Convert service result to API response format (frontend expects results directly)
      res.json({
        success: true,
        analysisId: analysisData.analysisId,
        jobId: analysisData.jobId,
        results: analysisData.results.map((r) => ({
          resumeId: r.resumeId,
          filename: r.filename,
          candidateName: r.candidateName,
          matchPercentage: r.matchPercentage,
          matchedSkills: r.matchedSkills,
          missingSkills: r.missingSkills,
          candidateStrengths: r.candidateStrengths,
          candidateWeaknesses: r.candidateWeaknesses,
          recommendations: r.recommendations,
          confidenceLevel: r.confidenceLevel,
          analysisId: r.analysisId,
          error: r.error
        })),
        createdAt: analysisData.createdAt,
        processingTime: analysisData.processingTime,
        statistics: analysisData.statistics,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error("Analysis route failed", {
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        error: error instanceof Error ? error.message : "Unknown error"
      });

      res.status(500).json({
        success: false,
        error: "ROUTE_ERROR",
        message: "Analysis request failed",
        timestamp: new Date().toISOString(),
      });
    }
  },
);


// Get analysis results for a job
router.get(
  "/analyze/:jobId",
  authenticateUser,
  validators.getAnalysis,
  async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const userId = req.user!.uid;
      const sessionId = req.query.sessionId as string;
      const batchId = req.query.batchId as string;

      if (isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: "Job ID must be a number",
          timestamp: new Date().toISOString(),
        });
      }

      // Get storage instance and create analysis service
      const storage = getStorage();
      const analysisService = createAnalysisService(storage);
      
      // Use AnalysisService to get results
      const result = await analysisService.getAnalysisResults(userId, jobId, sessionId, batchId);

      if (isFailure(result)) {
        const statusCode = getErrorStatusCode(result.error, 500);
        return res.status(statusCode).json({
          success: false,
          error: getErrorCode(result.error),
          message: getErrorMessage(result.error),
          timestamp: getErrorTimestamp(result.error)
        });
      }

      const analysisData = result.data;

      // Convert service result to API response format (frontend expects results directly)
      res.json({
        success: true,
        analysisId: analysisData.analysisId,
        jobId: analysisData.jobId,
        results: analysisData.results.map((r) => ({
          resumeId: r.resumeId,
          filename: r.filename,
          candidateName: r.candidateName,
          matchPercentage: r.matchPercentage,
          matchedSkills: r.matchedSkills,
          missingSkills: r.missingSkills,
          candidateStrengths: r.candidateStrengths,
          candidateWeaknesses: r.candidateWeaknesses,
          recommendations: r.recommendations,
          confidenceLevel: r.confidenceLevel,
          analysisId: r.analysisId
        })),
        createdAt: analysisData.createdAt,
        processingTime: analysisData.processingTime,
        statistics: analysisData.statistics,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error("Analysis results retrieval route failed", {
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        sessionId: (req.query.sessionId as string) || null,
        batchId: (req.query.batchId as string) || null,
        error: error instanceof Error ? error.message : "Unknown error"
      });

      res.status(500).json({
        success: false,
        error: "ROUTE_ERROR",
        message: "Failed to retrieve analysis results",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Get specific analysis result
router.get(
  "/analyze/:jobId/:resumeId",
  authenticateUser,
  validators.rateLimitModerate,
  async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const resumeId = parseInt(req.params.resumeId);
      const userId = req.user!.uid;

      if (isNaN(jobId) || isNaN(resumeId)) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: "Job ID and Resume ID must be numbers",
          timestamp: new Date().toISOString(),
        });
      }

      const storage = getStorage();
      const analysisResult = await storage.getAnalysisResultByJobAndResume(
        jobId,
        resumeId,
        userId,
      );

      if (!analysisResult) {
        return res.status(404).json({
          success: false,
          error: "NOT_FOUND",
          message: "Analysis result not found or you don't have permission to access it",
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        status: "ok",
        match: {
          matchPercentage: analysisResult.matchPercentage,
          matchedSkills: analysisResult.matchedSkills || [],
          missingSkills: analysisResult.missingSkills || [],
          candidateStrengths: analysisResult.candidateStrengths || [],
          candidateWeaknesses: analysisResult.candidateWeaknesses || [],
          confidenceLevel: analysisResult.confidenceLevel,
          fairnessMetrics: analysisResult.fairnessMetrics,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to get analysis result:", error);
      res.status(500).json({
        success: false,
        error: "INTERNAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Failed to retrieve analysis result",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Generate interview questions
router.post(
  "/interview-questions/:resumeId/:jobId",
  authenticateUser,
  validators.generateQuestions,
  async (req: Request, res: Response) => {
    try {
      const resumeId = parseInt(req.params.resumeId);
      const jobId = parseInt(req.params.jobId);
      const userId = req.user!.uid;
      const sessionId = req.body.sessionId || (req.query.sessionId as string);

      if (isNaN(resumeId) || isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: "Resume ID and Job ID must be numbers",
          timestamp: new Date().toISOString(),
        });
      }

      // Get storage instance and create analysis service
      const storage = getStorage();
      const analysisService = createAnalysisService(storage);
      
      // Use AnalysisService to generate interview questions
      const result = await analysisService.generateInterviewQuestions({
        userId,
        resumeId,
        jobId,
        sessionId
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

      const questionsData = result.data;

      // Convert service result to API response format (frontend expects properties directly)
      res.json({
        success: true,
        status: "success",
        message: "Interview questions generated successfully",
        id: Date.now(),
        resumeId: questionsData.resumeId,
        resumeName: `Resume ${questionsData.resumeId}`, // Default name, could be improved with actual filename
        jobDescriptionId: questionsData.jobId,
        jobTitle: `Job ${questionsData.jobId}`, // Default title, could be improved with actual job title
        matchPercentage: 75, // Default match percentage, could be retrieved from analysis
        technicalQuestions: questionsData.questions || [],
        experienceQuestions: [], // These would be categorized from questionsData.questions
        skillGapQuestions: [], // These would be categorized from questionsData.questions  
        inclusionQuestions: [], // These would be categorized from questionsData.questions
        metadata: questionsData.metadata,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error("Interview question generation route failed", {
        resumeId: parseInt(req.params.resumeId),
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        sessionId: req.body.sessionId || (req.query.sessionId as string) || null,
        error: error instanceof Error ? error.message : "Unknown error"
      });

      res.status(500).json({
        success: false,
        error: "ROUTE_ERROR",
        message: "Failed to generate interview questions",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

/**
 * @swagger
 * /analysis/analyze-bias/{jobId}:
 *   post:
 *     tags: [Bias Detection]
 *     summary: Analyze job description for bias
 *     description: |
 *       Analyze a job description for potential bias in language, requirements, and tone.
 *       Identifies problematic language patterns and provides recommendations for improvement.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/JobIdParam'
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BiasAnalysisRequest'
 *           example:
 *             includeRecommendations: true
 *     responses:
 *       200:
 *         description: Bias analysis completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/BiasAnalysis'
 *             example:
 *               success: true
 *               status: "success"
 *               message: "Bias analysis completed"
 *               data:
 *                 jobId: 456
 *                 overallBiasScore: 15.2
 *                 biasCategories:
 *                   - category: "gender"
 *                     score: 25.0
 *                     examples: ["young professional", "competitive environment"]
 *                   - category: "age"
 *                     score: 10.5
 *                     examples: ["digital native", "energetic team"]
 *                 suggestions:
 *                   - "Replace 'young professional' with 'early-career professional'"
 *                   - "Use inclusive language for team culture descriptions"
 *                 analyzedAt: "2025-01-14T10:50:00.000Z"
 *               timestamp: "2025-01-14T10:50:00.000Z"
 *       400:
 *         description: Invalid job ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               error:
 *                 code: "VALIDATION_ERROR"
 *                 message: "Job ID must be a number"
 *               timestamp: "2025-01-14T10:50:00.000Z"
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: Job description not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *             example:
 *               success: false
 *               error:
 *                 code: "JOB_NOT_FOUND"
 *                 message: "Job description not found or access denied"
 *               timestamp: "2025-01-14T10:50:00.000Z"
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// Analyze bias in job description
router.post(
  "/analyze-bias/:jobId",
  authenticateUser,
  validators.rateLimitModerate,
  async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const userId = req.user!.uid;

      if (isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          error: "VALIDATION_ERROR",
          message: "Job ID must be a number",
          timestamp: new Date().toISOString(),
        });
      }

      // Get storage instance and create analysis service
      const storage = getStorage();
      const analysisService = createAnalysisService(storage);
      
      // Use AnalysisService to perform bias analysis
      const result = await analysisService.analyzeBias({
        userId,
        jobId
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

      const biasData = result.data;

      // Convert service result to API response format (maintaining backward compatibility)
      res.json({
        success: true,
        status: "success",
        message: "Bias analysis completed",
        jobId: biasData.jobId,
        biasAnalysis: biasData.biasAnalysis,
        suggestions: biasData.suggestions,
        overallBiasScore: biasData.overallBiasScore,
        analysisDate: biasData.analysisDate,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      logger.error("Bias analysis route failed", {
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        error: error instanceof Error ? error.message : "Unknown error"
      });

      res.status(500).json({
        success: false,
        error: "ROUTE_ERROR",
        message: "Failed to perform bias analysis",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
