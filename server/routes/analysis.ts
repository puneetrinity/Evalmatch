/**
 * Analysis and Matching Routes
 * Handles resume-job matching, interview generation, and bias detection
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { logger } from "../lib/logger";
import { storage } from "../storage";

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
      const batchId = req.body.batchId; // Batch ID to filter resumes
      const resumeIds = req.body.resumeIds; // Array of resume IDs to analyze

      if (isNaN(jobId)) {
        return res.status(400).json({
          error: "Invalid job ID",
          message: "Job ID must be a number",
        });
      }

      const analysisStartTime = Date.now(); // Add timing for overall analysis
      logger.info(
        `Starting analysis for job ${jobId}, user ${userId}${sessionId ? `, session ${sessionId}` : ""}${batchId ? `, batch ${batchId}` : ""}`,
      );

      // Get job description
      const jobDescription = await storage.getJobDescriptionById(jobId, userId);
      if (!jobDescription) {
        return res.status(404).json({
          error: "Job description not found",
          message:
            "Job description not found or you don't have permission to access it",
        });
      }

      // Get user's resumes (batchId takes priority over sessionId for consistent filtering)
      let resumes = await storage.getResumesByUserId(
        userId,
        sessionId,
        batchId,
      );
      if (!resumes || resumes.length === 0) {
        return res.status(404).json({
          error: "No resumes found",
          message: "Please upload at least one resume before running analysis",
        });
      }

      // Filter by specific resume IDs if provided
      if (resumeIds && Array.isArray(resumeIds) && resumeIds.length > 0) {
        resumes = resumes.filter((resume) => resumeIds.includes(resume.id));
        logger.info(
          `Filtered to ${resumes.length} resumes based on provided IDs: ${resumeIds.join(", ")}`,
        );

        if (resumes.length === 0) {
          return res.status(404).json({
            error: "No matching resumes found",
            message:
              "None of the specified resume IDs were found for your account",
          });
        }
      }

      logger.info(
        `Found ${resumes.length} resumes to analyze against job ${jobId}`,
      );

      // Get user tier info
      const { getUserTierInfo } = await import("../lib/user-tiers");
      const userTierInfo = getUserTierInfo(userId);

      // Use parallel processing for better performance (5-10x faster)
      const { processBatchMatches } = await import("../lib/batch-processor");
      const { analyzeMatch, analyzeJobDescription } = await import(
        "../lib/tiered-ai-provider"
      );
      // Use any types for now to resolve compilation issues
      type AnalyzedResumeData = any;
      type AnalyzedJobData = any;
      type AnalyzeResumeResponse = any;
      type AnalyzeJobDescriptionResponse = any;

      // Prepare batch inputs
      const batchResumes = resumes.map((resume) => ({
        id: resume.id,
        content: resume.content || "",
        filename: resume.filename,
      }));

      const batchJobs = [
        {
          id: jobId,
          title: jobDescription.title,
          description: jobDescription.description,
        },
      ];

      logger.info(
        `Processing ${resumes.length} resumes in parallel against job ${jobId}`,
      );

      // Get or create job analysis first (shared for all resumes)
      let jobAnalysis = jobDescription.analyzedData;
      if (!jobAnalysis) {
        const jobResponse = await analyzeJobDescription(
          jobDescription.title,
          jobDescription.description,
          userTierInfo,
        );
        jobAnalysis = jobResponse as any;

        // Update job with analysis synchronously to ensure data consistency
        try {
          await storage.updateJobDescriptionAnalysis(jobId, jobAnalysis as any);
          logger.debug("Successfully updated job analysis", { jobId });
        } catch (error) {
          logger.error("Failed to update job analysis in database", {
            jobId,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          // Don't fail the entire request, but log the issue
        }
      }

      // Process all resume-job matches in parallel
      const results = [];
      const matchPromises = resumes.map(async (resume) => {
        const resumeProcessStartTime = Date.now(); // Add timing for individual resume processing
        try {
          // Get or create resume analysis
          let resumeAnalysis = resume.analyzedData;
          if (!resumeAnalysis && resume.content) {
            const { analyzeResumeParallel } = await import(
              "../lib/tiered-ai-provider"
            );
            const resumeResponse = await analyzeResumeParallel(
              resume.content,
              userTierInfo,
            );
            resumeAnalysis = resumeResponse as any;

            // Update resume with analysis synchronously to ensure data consistency
            try {
              await storage.updateResumeAnalysis(resume.id, resumeAnalysis as any);
              logger.debug("Successfully updated resume analysis", { 
                resumeId: resume.id 
              });
            } catch (error) {
              logger.error("Failed to update resume analysis in database", {
                resumeId: resume.id,
                error: error instanceof Error ? error.message : "Unknown error",
              });
              // Don't fail the entire request, but log the issue
            }
          }

          // Perform hybrid matching analysis
          logger.debug("Starting hybrid match analysis", {
            resumeId: resume.id,
            jobId: jobId,
            hasContent: !!(resume.content && jobDescription.description),
          });

          const matchAnalysisStartTime = Date.now();
          
          // Use the new hybrid analyzer
          const { analyzeMatchHybrid } = await import("../lib/hybrid-match-analyzer");
          const hybridResult = await analyzeMatchHybrid(
            resumeAnalysis as any,
            jobAnalysis as any,
            userTierInfo,
            resume.content || "",
            jobDescription.description,
          );
          
          // Convert hybrid result to expected format for backward compatibility
          const matchAnalysis = {
            matchPercentage: hybridResult.matchPercentage,
            matchedSkills: hybridResult.matchedSkills,
            missingSkills: hybridResult.missingSkills,
            candidateStrengths: hybridResult.candidateStrengths,
            candidateWeaknesses: hybridResult.candidateWeaknesses,
            confidenceLevel: hybridResult.confidenceLevel,
            fairnessMetrics: hybridResult.fairnessMetrics,
            scoringDimensions: hybridResult.scoringDimensions,
            analysisMethod: hybridResult.analysisMethod,
            confidence: hybridResult.confidence,
            matchInsights: hybridResult.matchInsights,
            // Include integrated bias detection results
            biasDetection: hybridResult.biasDetection,
          };
          
          const matchAnalysisTime = Date.now() - matchAnalysisStartTime;

          logger.debug("Hybrid match analysis completed", {
            resumeId: resume.id,
            jobId: jobId,
            matchPercentage: matchAnalysis.matchPercentage,
            matchedSkills: matchAnalysis.matchedSkills?.length || 0,
            missingSkills: matchAnalysis.missingSkills?.length || 0,
            analysisMethod: matchAnalysis.analysisMethod,
            confidence: matchAnalysis.confidence,
            analysisTime: matchAnalysisTime,
          });

          // Store analysis result
          logger.debug("Storing analysis result", {
            resumeId: resume.id,
            jobId: jobId,
            matchPercentage: matchAnalysis.matchPercentage,
          });

          const dbStoreStartTime = Date.now();
          const analysisResult = await storage.createAnalysisResult({
            userId,
            resumeId: resume.id,
            jobDescriptionId: jobId,
            matchPercentage: matchAnalysis.matchPercentage,
            matchedSkills: matchAnalysis.matchedSkills,
            missingSkills: matchAnalysis.missingSkills,
            analysis: matchAnalysis, // Provide the full analysis object for the required field
            candidateStrengths: matchAnalysis.candidateStrengths,
            candidateWeaknesses: matchAnalysis.candidateWeaknesses,
            confidenceLevel: matchAnalysis.confidenceLevel,
            fairnessMetrics: matchAnalysis.fairnessMetrics,
            semanticSimilarity: matchAnalysis.scoringDimensions?.semantic || null,
            skillsSimilarity: matchAnalysis.scoringDimensions?.skills || null,
            experienceSimilarity: matchAnalysis.scoringDimensions?.experience || null,
            educationSimilarity: matchAnalysis.scoringDimensions?.education || null,
            mlConfidenceScore: matchAnalysis.confidence || null,
            scoringDimensions: matchAnalysis.scoringDimensions || null,
            recommendations: hybridResult.recommendations || [],
          });
          const dbStoreTime = Date.now() - dbStoreStartTime;
          const totalResumeTime = Date.now() - resumeProcessStartTime;

          logger.info("Resume analysis completed successfully", {
            resumeId: resume.id,
            filename: resume.filename,
            jobId: jobId,
            matchPercentage: matchAnalysis.matchPercentage,
            analysisResultId: analysisResult.id,
            dbStoreTime,
            totalProcessingTime: totalResumeTime,
          });

          return {
            resumeId: resume.id,
            filename: resume.filename,
            candidateName: resume.filename.replace(/\.[^/.]+$/, ""), // Remove extension
            match: {
              matchPercentage: matchAnalysis.matchPercentage,
              matchedSkills: matchAnalysis.matchedSkills || [],
              missingSkills: matchAnalysis.missingSkills || [],
              candidateStrengths: matchAnalysis.candidateStrengths || [],
              candidateWeaknesses: matchAnalysis.candidateWeaknesses || [],
              confidenceLevel: matchAnalysis.confidenceLevel,
              fairnessMetrics: matchAnalysis.fairnessMetrics,
              matchInsights: matchAnalysis.matchInsights,
            },
            analysisId: analysisResult.id,
          };
        } catch (resumeError) {
          const totalResumeTime = Date.now() - resumeProcessStartTime;
          logger.error("Resume analysis failed", {
            resumeId: resume.id,
            filename: resume.filename,
            jobId: jobId,
            error:
              resumeError instanceof Error
                ? resumeError.message
                : "Unknown error",
            errorStack:
              resumeError instanceof Error ? resumeError.stack : undefined,
            processingTime: totalResumeTime,
          });

          return {
            resumeId: resume.id,
            filename: resume.filename,
            candidateName: resume.filename.replace(/\.[^/.]+$/, ""),
            match: {
              matchPercentage: 0,
              matchedSkills: [],
              missingSkills: [],
              candidateStrengths: [],
              candidateWeaknesses: [
                `Analysis failed: ${resumeError instanceof Error ? resumeError.message : "Unknown error"}`,
              ],
              confidenceLevel: "low" as const,
            },
            analysisId: null,
            error:
              resumeError instanceof Error
                ? resumeError.message
                : "Analysis failed",
          };
        }
      });

      // Wait for all parallel processing to complete
      logger.debug("Waiting for all resume analyses to complete");
      const parallelResults = await Promise.all(matchPromises);
      results.push(...parallelResults);
      const totalAnalysisTime = Date.now() - analysisStartTime;

      // Sort results by match percentage (highest first)
      results.sort(
        (a, b) =>
          (b.match?.matchPercentage || 0) - (a.match?.matchPercentage || 0),
      );

      const successfulAnalyses = results.filter((r) => !r.error);
      const failedAnalyses = results.filter((r) => r.error);
      const averageMatch =
        successfulAnalyses.length > 0
          ? Math.round(
              successfulAnalyses.reduce(
                (sum, r) => sum + (r.match?.matchPercentage || 0),
                0,
              ) / successfulAnalyses.length,
            )
          : 0;

      logger.info("Analysis processing completed", {
        jobId,
        userId,
        sessionId: sessionId || null,
        batchId: batchId || null,
        totalResumes: resumes.length,
        successful: successfulAnalyses.length,
        failed: failedAnalyses.length,
        successRate: Math.round(
          (successfulAnalyses.length / resumes.length) * 100,
        ),
        averageMatch,
        totalTime: totalAnalysisTime,
        avgTimePerResume: Math.round(totalAnalysisTime / resumes.length),
        userTier: userTierInfo.name,
        endTime: new Date().toISOString(),
      });

      if (failedAnalyses.length > 0) {
        logger.warn("Some analyses failed", {
          jobId,
          failedCount: failedAnalyses.length,
          failures: failedAnalyses.map((f) => ({
            resumeId: f.resumeId,
            filename: f.filename,
            error: f.error,
          })),
        });
      }

      // Format response to match API contract expectations
      const analysisId = Date.now();

      logger.info("Sending analysis response", {
        analysisId,
        jobId,
        resultCount: results.length,
        successfulCount: successfulAnalyses.length,
        failedCount: failedAnalyses.length,
        processingTime: totalAnalysisTime,
      });

      res.json({
        success: true,
        data: {
          analysisId,
          jobId: jobId,
          results: results.map((r) => ({
          resumeId: r.resumeId,
          filename: r.filename,
          candidateName: r.candidateName,
          matchPercentage: r.match?.matchPercentage || 0,
          matchedSkills: (r.match?.matchedSkills || []).map((skill: any) => 
            typeof skill === 'string' 
              ? { skill, matchPercentage: 85 } // Default match percentage for string skills
              : skill
          ),
          missingSkills: r.match?.missingSkills || [],
          candidateStrengths: r.match?.candidateStrengths || [],
          candidateWeaknesses: r.match?.candidateWeaknesses || [],
          recommendations: [], // Add recommendations field
          confidenceLevel: r.match?.confidenceLevel || "low",
          fairnessMetrics: r.match?.fairnessMetrics,
          scoringDimensions: (r.match as any)?.scoringDimensions || {},
          matchInsights: (r.match as any)?.matchInsights,
        })),
          createdAt: new Date().toISOString(),
          processingTime: totalAnalysisTime,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Analysis request failed catastrophically", {
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        sessionId: req.body.sessionId || null,
        batchId: req.body.batchId || null,
        resumeIds: req.body.resumeIds || null,
        error: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name || 'UnknownError',
      });

      // Return a proper API error response
      res.status(500).json({
        success: false,
        error: "Analysis failed",
        message:
          error instanceof Error
            ? error.message
            : "Unknown error occurred during analysis",
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
          error: "Invalid job ID",
          message: "Job ID must be a number",
        });
      }

      logger.info("Getting analysis results request", {
        jobId,
        userId,
        sessionId: sessionId || null,
        batchId: batchId || null,
        timestamp: new Date().toISOString(),
      });

      // Get job description
      const jobDescription = await storage.getJobDescriptionById(jobId, userId);
      if (!jobDescription) {
        return res.status(404).json({
          error: "Job description not found",
          message:
            "Job description not found or you don't have permission to access it",
        });
      }

      // Check for available resumes first (batchId takes priority over sessionId)
      const resumeFetchStartTime = Date.now();
      const userResumes = await storage.getResumesByUserId(
        userId,
        sessionId,
        batchId,
      );
      const resumeFetchTime = Date.now() - resumeFetchStartTime;

      logger.info("Available resumes fetched", {
        userId,
        sessionId: sessionId || null,
        batchId: batchId || null,
        resumesFound: userResumes.length,
        fetchTime: resumeFetchTime,
        resumeDetails: userResumes.map((r) => ({
          id: r.id,
          filename: r.filename,
          createdAt: r.createdAt,
        })),
      });

      // Get analysis results (batchId takes priority over sessionId)
      const analysisFetchStartTime = Date.now();
      const analysisResults = await storage.getAnalysisResultsByJob(
        jobId,
        userId,
        sessionId,
        batchId,
      );
      const analysisFetchTime = Date.now() - analysisFetchStartTime;

      logger.info("Analysis results fetched", {
        jobId,
        userId,
        sessionId: sessionId || null,
        batchId: batchId || null,
        analysisResultsFound: analysisResults.length,
        fetchTime: analysisFetchTime,
        resultSummary: {
          resumeIds: analysisResults.map((r) => r.resumeId),
          averageMatch:
            analysisResults.length > 0
              ? Math.round(
                  analysisResults.reduce(
                    (sum, r) => sum + (r.matchPercentage || 0),
                    0,
                  ) / analysisResults.length,
                )
              : 0,
          highestMatch: Math.max(
            ...analysisResults.map((r) => r.matchPercentage || 0),
            0,
          ),
          lowestMatch: Math.min(
            ...analysisResults.map((r) => r.matchPercentage || 100),
            100,
          ),
        },
      });

      if (!analysisResults || analysisResults.length === 0) {
        logger.info("No analysis results found", {
          jobId,
          userId,
          sessionId: sessionId || null,
          batchId: batchId || null,
          resumesAvailable: userResumes.length,
          reason: userResumes.length === 0 ? "no_resumes" : "no_analysis_run",
        });

        return res.json({
          status: "ok",
          message:
            userResumes.length === 0
              ? "No resumes found for analysis. Please upload resumes first."
              : "No analysis results found. Click 'Analyze Resumes' to run analysis.",
          jobDescriptionId: jobId,
          jobTitle: jobDescription.title,
          results: [],
          debug: {
            resumesAvailable: userResumes.length,
            sessionId: sessionId || "none",
            batchId: batchId || "none",
            analysisResultsFound: analysisResults.length,
          },
        });
      }

      // Format results to match API contract expectations
      const formattedResults = analysisResults.map((result) => ({
        resumeId: result.resumeId,
        filename:
          (result as any).resume?.filename || `Resume ${result.resumeId}`,
        candidateName:
          (result as any).resume?.filename?.replace(/\.[^/.]+$/, "") ||
          `Candidate ${result.resumeId}`,
        matchPercentage: result.matchPercentage,
        matchedSkills: (result.matchedSkills || []).map((skill: any) => 
          typeof skill === 'string' 
            ? { skill, matchPercentage: 85 } // Default match percentage for string skills
            : skill
        ),
        missingSkills: result.missingSkills || [],
        candidateStrengths: result.candidateStrengths || [],
        candidateWeaknesses: result.candidateWeaknesses || [],
        recommendations: [], // Add recommendations field
        confidenceLevel: result.confidenceLevel || "low",
        fairnessMetrics: result.fairnessMetrics,
        scoringDimensions: (result as any).scoringDimensions || {},
      }));

      // Sort by match percentage
      formattedResults.sort(
        (a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0),
      );
      const totalRequestTime =
        Date.now() - analysisFetchStartTime + resumeFetchTime;

      logger.info("Sending analysis results response", {
        jobId,
        userId,
        sessionId: sessionId || null,
        batchId: batchId || null,
        resultCount: formattedResults.length,
        totalRequestTime,
        topMatch: formattedResults[0]?.matchPercentage || 0,
      });

      res.json({
        analysisId: Date.now(), // Generate analysis ID for tracking
        jobId: jobId,
        results: formattedResults,
        createdAt: new Date().toISOString(),
        processingTime: totalRequestTime,
      });
    } catch (error) {
      logger.error("Failed to get analysis results", {
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        sessionId: (req.query.sessionId as string) || null,
        batchId: (req.query.batchId as string) || null,
        error: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      });

      res.status(500).json({
        error: "Failed to retrieve analysis results",
        message: error instanceof Error ? error.message : "Unknown error",
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
          error: "Invalid parameters",
          message: "Resume ID and Job ID must be numbers",
        });
      }

      logger.info("Starting interview question generation", {
        resumeId,
        jobId,
        userId,
        sessionId: sessionId || null,
        timestamp: new Date().toISOString(),
      });

      // Get resume and job description
      const [resume, jobDescription] = await Promise.all([
        storage.getResumeById(resumeId, userId),
        storage.getJobDescriptionById(jobId, userId),
      ]);

      if (!resume) {
        return res.status(404).json({
          error: "Resume not found",
          message: "Resume not found or you don't have permission to access it",
        });
      }

      if (!jobDescription) {
        return res.status(404).json({
          error: "Job description not found",
          message:
            "Job description not found or you don't have permission to access it",
        });
      }

      // Get user tier info
      const { getUserTierInfo } = await import("../lib/user-tiers");
      const userTierInfo = getUserTierInfo(userId);

      // Get or generate analysis if needed
      let resumeAnalysis = resume.analyzedData;
      let jobAnalysis = jobDescription.analyzedData;
      let matchAnalysis;

      // Get existing analysis result if available
      const existingAnalysis = await storage.getAnalysisResultByJobAndResume(
        jobId,
        resumeId,
        userId,
      );
      if (existingAnalysis) {
        matchAnalysis = {
          matchPercentage: existingAnalysis.matchPercentage,
          matchedSkills: existingAnalysis.matchedSkills || [],
          missingSkills: existingAnalysis.missingSkills || [],
          candidateStrengths: existingAnalysis.candidateStrengths || [],
          candidateWeaknesses: existingAnalysis.candidateWeaknesses || [],
        };
      }

      // Generate missing analyses if needed
      if (!resumeAnalysis && resume.content) {
        const { analyzeResumeParallel } = await import(
          "../lib/tiered-ai-provider"
        );
        const resumeResponse = await analyzeResumeParallel(
          resume.content,
          userTierInfo,
        );
        resumeAnalysis = resumeResponse.analyzedData;
      }

      if (!jobAnalysis) {
        const { analyzeJobDescription } = await import(
          "../lib/tiered-ai-provider"
        );
        const jobResponse = await analyzeJobDescription(
          jobDescription.title,
          jobDescription.description,
          userTierInfo,
        );
        jobAnalysis = jobResponse.analyzedData;
      }

      if (!matchAnalysis) {
        // Use hybrid analyzer for interview questions as well
        const { analyzeMatchHybrid } = await import("../lib/hybrid-match-analyzer");
        const hybridResult = await analyzeMatchHybrid(
          resumeAnalysis as any,
          jobAnalysis as any,
          userTierInfo,
          resume.content || "",
          jobDescription.description,
        );
        
        // Convert to expected format
        matchAnalysis = {
          matchPercentage: hybridResult.matchPercentage,
          matchedSkills: hybridResult.matchedSkills,
          missingSkills: hybridResult.missingSkills,
          candidateStrengths: hybridResult.candidateStrengths,
          candidateWeaknesses: hybridResult.candidateWeaknesses,
        };
      }

      // Generate interview questions
      const { generateInterviewQuestions } = await import(
        "../lib/tiered-ai-provider"
      );
      const interviewQuestions = await generateInterviewQuestions(
        resumeAnalysis as any,
        jobAnalysis as any,
        matchAnalysis as any,
        userTierInfo,
      );

      // Store interview questions
      await storage.createInterviewQuestions({
        userId,
        resumeId,
        jobDescriptionId: jobId,
        questions: interviewQuestions.questions || [],
      });

      logger.info("Interview questions generated successfully", {
        resumeId,
        jobId,
        userId,
        sessionId: sessionId || null,
        questionsCount: interviewQuestions.questions?.length || 0,
        questionBreakdown: {
          technical:
            interviewQuestions.questions?.filter(
              (q) => q.category === "technical",
            ).length || 0,
          experience:
            interviewQuestions.questions?.filter(
              (q) => (q.category as any) === "experience",
            ).length || 0,
          skillGap:
            interviewQuestions.questions?.filter(
              (q) => (q.category as any) === "skill-gap",
            ).length || 0,
          inclusion:
            interviewQuestions.questions?.filter(
              (q) => (q.category as any) === "inclusion",
            ).length || 0,
        },
        matchPercentage: matchAnalysis.matchPercentage,
      });

      res.json({
        status: "success",
        message: "Interview questions generated successfully",
        id: Date.now(), // Simple ID for frontend compatibility
        resumeId,
        resumeName: resume.filename,
        jobDescriptionId: jobId,
        jobTitle: jobDescription.title,
        matchPercentage: matchAnalysis.matchPercentage,
        technicalQuestions:
          interviewQuestions.questions?.filter(
            (q) => q.category === "technical",
          ) || [],
        experienceQuestions:
          interviewQuestions.questions?.filter(
            (q) => (q.category as any) === "experience",
          ) || [],
        skillGapQuestions:
          interviewQuestions.questions?.filter(
            (q) => (q.category as any) === "skill-gap",
          ) || [],
        inclusionQuestions:
          interviewQuestions.questions?.filter(
            (q) => (q.category as any) === "inclusion",
          ) || [],
      });
    } catch (error) {
      logger.error("Interview question generation failed", {
        resumeId: parseInt(req.params.resumeId),
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        sessionId:
          req.body.sessionId || (req.query.sessionId as string) || null,
        error: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      });

      res.status(500).json({
        error: "Failed to generate interview questions",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
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
          error: "Invalid job ID",
          message: "Job ID must be a number",
        });
      }

      logger.info("Starting bias analysis", {
        jobId,
        userId,
        timestamp: new Date().toISOString(),
      });

      // Get job description
      const jobDescription = await storage.getJobDescriptionById(jobId, userId);
      if (!jobDescription) {
        return res.status(404).json({
          error: "Job description not found",
          message:
            "Job description not found or you don't have permission to access it",
        });
      }

      // Get user tier info
      const { getUserTierInfo } = await import("../lib/user-tiers");
      const userTierInfo = getUserTierInfo(userId);

      // Perform bias analysis
      const { analyzeBias } = await import("../lib/tiered-ai-provider");
      const biasAnalysis = await analyzeBias(
        jobDescription.title,
        jobDescription.description,
        userTierInfo,
      );

      logger.info("Bias analysis completed", {
        jobId,
        userId,
        hasBias: biasAnalysis.hasBias,
        biasTypes: biasAnalysis.biasTypes?.length || 0,
        biasedPhrasesCount: biasAnalysis.biasedPhrases?.length || 0,
        suggestionsCount: biasAnalysis.suggestions?.length || 0,
        overallScore: biasAnalysis.overallScore,
        summary:
          biasAnalysis.summary?.substring(0, 100) +
          ((biasAnalysis.summary?.length || 0) > 100 ? "..." : ""),
      });

      // Save bias analysis to storage
      const storageStartTime = Date.now();
      try {
        await storage.updateJobDescriptionBiasAnalysis(jobId, biasAnalysis);
        const storageTime = Date.now() - storageStartTime;

        logger.info("Bias analysis saved to storage", {
          jobId,
          storageTime,
        });
      } catch (storageError) {
        const storageTime = Date.now() - storageStartTime;

        logger.error("Failed to save bias analysis to storage", {
          jobId,
          userId,
          error:
            storageError instanceof Error
              ? storageError.message
              : "Unknown error",
          errorStack:
            storageError instanceof Error ? storageError.stack : undefined,
          biasAnalysisKeys: Object.keys(biasAnalysis || {}),
          storageTime,
        });
        // Continue with response even if storage fails
      }

      // Format response to match frontend expectations
      const response = {
        status: "success",
        message: "Bias analysis completed",
        biasAnalysis: {
          hasBias: biasAnalysis.hasBias,
          biasTypes: biasAnalysis.biasTypes || [],
          biasedPhrases: biasAnalysis.biasedPhrases || [],
          suggestions: biasAnalysis.suggestions || [],
          improvedDescription:
            biasAnalysis.improvedDescription || jobDescription.description,
          biasConfidenceScore:
            biasAnalysis.overallScore || (biasAnalysis.hasBias ? 60 : 95),
          fairnessAssessment: biasAnalysis.summary || "Analysis completed",
        },
      };

      res.json(response);
    } catch (error) {
      logger.error("Bias analysis failed", {
        jobId: parseInt(req.params.jobId),
        userId: req.user?.uid,
        error: error instanceof Error ? error.message : "Unknown error",
        errorStack: error instanceof Error ? error.stack : undefined,
      });

      res.status(500).json({
        error: "Bias analysis failed",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
    }
  },
);

export default router;

