/**
 * Analysis and Matching Routes
 * Handles resume-job matching, interview generation, and bias detection
 * Updated to use service layer for better maintainability and testability
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { logger } from "../lib/logger";
import { storage } from "../storage";
import { analysisService } from "../services/analysis-service";
import {
  AnalyzedResumeData,
  AnalyzedJobData,
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResult,
  SkillMatch
} from "@shared/schema";
import {
  isSuccess,
  isFailure
} from "@shared/result-types";
import { getErrorStatusCode, getErrorCode, getErrorMessage, getErrorTimestamp } from "@shared/type-utilities";
import {
  AppNotFoundError,
  AppValidationError,
  AppExternalServiceError,
  toAppError
} from "@shared/errors";

const router = Router();

// Analyze resumes against a job description
router.post(
  "/analyze/:jobId",
  authenticateUser,
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

      // Convert service result to API response format (maintaining backward compatibility)
      res.json({
        success: true,
        analysis: {
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
          statistics: analysisData.statistics
        },
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

      // Convert service result to API response format (maintaining backward compatibility)
      res.json({
        success: true,
        data: {
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
          statistics: analysisData.statistics
        },
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
  async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      const resumeId = parseInt(req.params.resumeId);
      const userId = req.user!.uid;

      if (isNaN(jobId) || isNaN(resumeId)) {
        return res.status(400).json({
          error: "Invalid parameters",
          message: "Job ID and Resume ID must be numbers",
        });
      }

      const analysisResult = await storage.getAnalysisResultByJobAndResume(
        jobId,
        resumeId,
        userId,
      );

      if (!analysisResult) {
        return res.status(404).json({
          error: "Analysis result not found",
          message:
            "Analysis result not found or you don't have permission to access it",
        });
      }

      res.json({
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
      });
    } catch (error) {
      logger.error("Failed to get analysis result:", error);
      res.status(500).json({
        error: "Failed to retrieve analysis result",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// Generate interview questions
router.post(
  "/interview-questions/:resumeId/:jobId",
  authenticateUser,
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

      // Convert service result to API response format (maintaining backward compatibility)
      res.json({
        success: true,
        status: "success",
        message: "Interview questions generated successfully",
        data: {
          id: Date.now(),
          resumeId: questionsData.resumeId,
          jobDescriptionId: questionsData.jobId,
          questions: questionsData.questions || [],
          metadata: questionsData.metadata
        },
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

// Analyze bias in job description
router.post(
  "/analyze-bias/:jobId",
  authenticateUser,
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
        data: {
          jobId: biasData.jobId,
          biasAnalysis: biasData.biasAnalysis,
          suggestions: biasData.suggestions,
          overallBiasScore: biasData.overallBiasScore,
          analysisDate: biasData.analysisDate
        },
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
