/**
 * Analysis and Matching Routes
 * Handles resume-job matching, interview generation, and bias detection
 */

import { Router, Request, Response } from 'express';
import { authenticateUser } from '../middleware/auth';
import { logger } from '../lib/logger';
import { storage } from '../storage';

const router = Router();

// Analyze resumes against a job description
router.post("/analyze/:jobId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const userId = req.user!.uid;
    const sessionId = req.body.sessionId;
    const batchId = req.body.batchId; // Batch ID to filter resumes
    const resumeIds = req.body.resumeIds; // Array of resume IDs to analyze

    if (isNaN(jobId)) {
      return res.status(400).json({
        error: "Invalid job ID",
        message: "Job ID must be a number"
      });
    }

    logger.info(`Starting analysis for job ${jobId}, user ${userId}${sessionId ? `, session ${sessionId}` : ''}${batchId ? `, batch ${batchId}` : ''}`);

    // Get job description
    const jobDescription = await storage.getJobDescriptionById(jobId, userId);
    if (!jobDescription) {
      return res.status(404).json({
        error: "Job description not found",
        message: "Job description not found or you don't have permission to access it"
      });
    }

    // Get user's resumes (prioritize batchId filtering over sessionId)
    let resumes = await storage.getResumesByUserId(userId, sessionId, batchId);
    if (!resumes || resumes.length === 0) {
      return res.status(404).json({
        error: "No resumes found",
        message: "Please upload at least one resume before running analysis"
      });
    }

    // Filter by specific resume IDs if provided
    if (resumeIds && Array.isArray(resumeIds) && resumeIds.length > 0) {
      resumes = resumes.filter(resume => resumeIds.includes(resume.id));
      logger.info(`Filtered to ${resumes.length} resumes based on provided IDs: ${resumeIds.join(', ')}`);
      
      if (resumes.length === 0) {
        return res.status(404).json({
          error: "No matching resumes found",
          message: "None of the specified resume IDs were found for your account"
        });
      }
    }

    logger.info(`Found ${resumes.length} resumes to analyze against job ${jobId}`);

    // Get user tier info
    const { getUserTierInfo } = await import('../lib/user-tiers');
    const userTierInfo = getUserTierInfo(userId);

    // Use parallel processing for better performance (5-10x faster)
    const { processBatchMatches } = await import('../lib/batch-processor');
    const { analyzeMatch, analyzeJobDescription } = await import('../lib/tiered-ai-provider');
    
    // Prepare batch inputs
    const batchResumes = resumes.map(resume => ({
      id: resume.id,
      content: resume.content || '',
      filename: resume.filename
    }));
    
    const batchJobs = [{
      id: jobId,
      title: jobDescription.title,
      description: jobDescription.description
    }];

    logger.info(`Processing ${resumes.length} resumes in parallel against job ${jobId}`);
    
    // Get or create job analysis first (shared for all resumes)
    let jobAnalysis = jobDescription.analyzedData;
    if (!jobAnalysis) {
      jobAnalysis = await analyzeJobDescription(
        jobDescription.title,
        jobDescription.description,
        userTierInfo
      );
      
      // Update job with analysis asynchronously
      storage.updateJobDescriptionAnalysis(jobId, jobAnalysis).catch(error => {
        logger.warn('Failed to update job analysis in database:', error);
      });
    }

    // Process all resume-job matches in parallel
    const results = [];
    const matchPromises = resumes.map(async (resume) => {
      try {
        // Get or create resume analysis
        let resumeAnalysis = resume.analyzedData;
        if (!resumeAnalysis && resume.content) {
          const { analyzeResumeParallel } = await import('../lib/tiered-ai-provider');
          resumeAnalysis = await analyzeResumeParallel(resume.content, userTierInfo);
          
          // Update resume with analysis asynchronously
          storage.updateResumeAnalysis(resume.id, resumeAnalysis).catch(error => {
            logger.warn(`Failed to update resume ${resume.id} analysis in database:`, error);
          });
        }

        // Perform matching analysis
        const matchAnalysis = await analyzeMatch(
          resumeAnalysis,
          jobAnalysis,
          userTierInfo,
          resume.content,
          jobDescription.description
        );

        // Store analysis result
        const analysisResult = await storage.createAnalysisResult({
          userId,
          resumeId: resume.id,
          jobDescriptionId: jobId,
          matchPercentage: matchAnalysis.matchPercentage,
          matchedSkills: matchAnalysis.matchedSkills,
          missingSkills: matchAnalysis.missingSkills,
          candidateStrengths: matchAnalysis.candidateStrengths,
          candidateWeaknesses: matchAnalysis.candidateWeaknesses,
          confidenceLevel: matchAnalysis.confidenceLevel,
          fairnessMetrics: matchAnalysis.fairnessMetrics
        });

        logger.info(`Analysis result saved for resume ${resume.id}, job ${jobId}, match ${matchAnalysis.matchPercentage}%`);

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
            fairnessMetrics: matchAnalysis.fairnessMetrics
          },
          analysisId: analysisResult.id
        };

      } catch (resumeError) {
        logger.error(`Analysis failed for resume ${resume.id}:`, resumeError);
        
        return {
          resumeId: resume.id,
          filename: resume.filename,
          candidateName: resume.filename.replace(/\.[^/.]+$/, ""),
          match: {
            matchPercentage: 0,
            matchedSkills: [],
            missingSkills: [],
            candidateStrengths: [],
            candidateWeaknesses: [`Analysis failed: ${resumeError instanceof Error ? resumeError.message : 'Unknown error'}`],
            confidenceLevel: 'low' as const
          },
          analysisId: null,
          error: resumeError instanceof Error ? resumeError.message : 'Analysis failed'
        };
      }
    });

    // Wait for all parallel processing to complete
    const parallelResults = await Promise.all(matchPromises);
    results.push(...parallelResults);

    // Sort results by match percentage (highest first)
    results.sort((a, b) => (b.match?.matchPercentage || 0) - (a.match?.matchPercentage || 0));

    const successfulAnalyses = results.filter(r => !r.error);
    const failedAnalyses = results.filter(r => r.error);

    logger.info(`Analysis completed for job ${jobId}`, {
      totalResumes: resumes.length,
      successful: successfulAnalyses.length,
      failed: failedAnalyses.length,
      averageMatch: successfulAnalyses.length > 0 
        ? Math.round(successfulAnalyses.reduce((sum, r) => sum + (r.match?.matchPercentage || 0), 0) / successfulAnalyses.length)
        : 0
    });

    // Format response to match API contract expectations
    res.json({
      analysisId: Date.now(), // Generate analysis ID for tracking
      jobId: jobId,
      results: results.map(r => ({
        resumeId: r.resumeId,
        filename: r.filename,
        candidateName: r.candidateName,
        matchPercentage: r.match?.matchPercentage || 0,
        matchedSkills: r.match?.matchedSkills || [],
        missingSkills: r.match?.missingSkills || [],
        candidateStrengths: r.match?.candidateStrengths || [],
        candidateWeaknesses: r.match?.candidateWeaknesses || [],
        recommendations: [], // Add recommendations field
        confidenceLevel: r.match?.confidenceLevel || 'low',
        fairnessMetrics: r.match?.fairnessMetrics,
        scoringDimensions: r.match?.scoringDimensions
      })),
      createdAt: new Date().toISOString(),
      processingTime: Date.now() - Date.now() // TODO: Track actual processing time
    });

  } catch (error) {
    logger.error('Analysis failed:', error);
    res.status(500).json({
      error: "Analysis failed",
      message: error instanceof Error ? error.message : 'Unknown error occurred during analysis'
    });
  }
});

// Get analysis results for a job
router.get("/analyze/:jobId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const userId = req.user!.uid;
    const sessionId = req.query.sessionId as string;
    const batchId = req.query.batchId as string;

    if (isNaN(jobId)) {
      return res.status(400).json({
        error: "Invalid job ID",
        message: "Job ID must be a number"
      });
    }

    logger.info(`Getting analysis results for job ${jobId}, user ${userId}, session ${sessionId || 'none'}, batch ${batchId || 'none'}`);

    // Get job description
    const jobDescription = await storage.getJobDescriptionById(jobId, userId);
    if (!jobDescription) {
      return res.status(404).json({
        error: "Job description not found",
        message: "Job description not found or you don't have permission to access it"
      });
    }

    // Check for available resumes first (prioritize batchId filtering)
    const userResumes = await storage.getResumesByUserId(userId, sessionId, batchId);
    logger.info(`Found ${userResumes.length} resumes for user ${userId} with session ${sessionId || 'none'} and batch ${batchId || 'none'}`);

    // Get analysis results (prioritize batchId filtering)
    const analysisResults = await storage.getAnalysisResultsByJob(jobId, userId, sessionId, batchId);
    logger.info(`Found ${analysisResults.length} analysis results for job ${jobId}`);

    if (!analysisResults || analysisResults.length === 0) {
      return res.json({
        status: "ok",
        message: userResumes.length === 0 
          ? "No resumes found for analysis. Please upload resumes first."
          : "No analysis results found. Click 'Analyze Resumes' to run analysis.",
        jobDescriptionId: jobId,
        jobTitle: jobDescription.title,
        results: [],
        debug: {
          resumesAvailable: userResumes.length,
          sessionId: sessionId || 'none',
          batchId: batchId || 'none',
          analysisResultsFound: analysisResults.length
        }
      });
    }

    // Format results to match API contract expectations
    const formattedResults = analysisResults.map(result => ({
      resumeId: result.resumeId,
      filename: result.resume?.filename || `Resume ${result.resumeId}`,
      candidateName: result.resume?.filename?.replace(/\.[^/.]+$/, "") || `Candidate ${result.resumeId}`,
      matchPercentage: result.matchPercentage,
      matchedSkills: result.matchedSkills || [],
      missingSkills: result.missingSkills || [],
      candidateStrengths: result.candidateStrengths || [],
      candidateWeaknesses: result.candidateWeaknesses || [],
      recommendations: [], // Add recommendations field
      confidenceLevel: result.confidenceLevel || 'low',
      fairnessMetrics: result.fairnessMetrics,
      scoringDimensions: result.scoringDimensions
    }));

    // Sort by match percentage
    formattedResults.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));

    res.json({
      analysisId: Date.now(), // Generate analysis ID for tracking
      jobId: jobId,
      results: formattedResults,
      createdAt: new Date().toISOString(),
      processingTime: 0 // TODO: Track actual processing time
    });

  } catch (error) {
    logger.error('Failed to get analysis results:', error);
    res.status(500).json({
      error: "Failed to retrieve analysis results",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific analysis result
router.get("/analyze/:jobId/:resumeId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const resumeId = parseInt(req.params.resumeId);
    const userId = req.user!.uid;

    if (isNaN(jobId) || isNaN(resumeId)) {
      return res.status(400).json({
        error: "Invalid parameters",
        message: "Job ID and Resume ID must be numbers"
      });
    }

    const analysisResult = await storage.getAnalysisResultByJobAndResume(jobId, resumeId, userId);
    
    if (!analysisResult) {
      return res.status(404).json({
        error: "Analysis result not found",
        message: "Analysis result not found or you don't have permission to access it"
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
        fairnessMetrics: analysisResult.fairnessMetrics
      }
    });

  } catch (error) {
    logger.error('Failed to get analysis result:', error);
    res.status(500).json({
      error: "Failed to retrieve analysis result",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate interview questions
router.post("/interview-questions/:resumeId/:jobId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const resumeId = parseInt(req.params.resumeId);
    const jobId = parseInt(req.params.jobId);
    const userId = req.user!.uid;
    const sessionId = req.body.sessionId || req.query.sessionId as string;

    if (isNaN(resumeId) || isNaN(jobId)) {
      return res.status(400).json({
        error: "Invalid parameters",
        message: "Resume ID and Job ID must be numbers"
      });
    }

    logger.info(`Generating interview questions for resume ${resumeId}, job ${jobId}, user ${userId}`);

    // Get resume and job description
    const [resume, jobDescription] = await Promise.all([
      storage.getResumeById(resumeId, userId),
      storage.getJobDescriptionById(jobId, userId)
    ]);

    if (!resume) {
      return res.status(404).json({
        error: "Resume not found",
        message: "Resume not found or you don't have permission to access it"
      });
    }

    if (!jobDescription) {
      return res.status(404).json({
        error: "Job description not found",
        message: "Job description not found or you don't have permission to access it"
      });
    }

    // Get user tier info
    const { getUserTierInfo } = await import('../lib/user-tiers');
    const userTierInfo = getUserTierInfo(userId);

    // Get or generate analysis if needed
    let resumeAnalysis = resume.analyzedData;
    let jobAnalysis = jobDescription.analyzedData;
    let matchAnalysis;

    // Get existing analysis result if available
    const existingAnalysis = await storage.getAnalysisResultByJobAndResume(jobId, resumeId, userId);
    if (existingAnalysis) {
      matchAnalysis = {
        matchPercentage: existingAnalysis.matchPercentage,
        matchedSkills: existingAnalysis.matchedSkills || [],
        missingSkills: existingAnalysis.missingSkills || [],
        candidateStrengths: existingAnalysis.candidateStrengths || [],
        candidateWeaknesses: existingAnalysis.candidateWeaknesses || []
      };
    }

    // Generate missing analyses if needed
    if (!resumeAnalysis && resume.content) {
      const { analyzeResumeParallel } = await import('../lib/tiered-ai-provider');
      resumeAnalysis = await analyzeResumeParallel(resume.content, userTierInfo);
    }

    if (!jobAnalysis) {
      const { analyzeJobDescription } = await import('../lib/tiered-ai-provider');
      jobAnalysis = await analyzeJobDescription(
        jobDescription.title,
        jobDescription.description,
        userTierInfo
      );
    }

    if (!matchAnalysis) {
      const { analyzeMatch } = await import('../lib/tiered-ai-provider');
      matchAnalysis = await analyzeMatch(
        resumeAnalysis,
        jobAnalysis,
        userTierInfo,
        resume.content,
        jobDescription.description
      );
    }

    // Generate interview questions
    const { generateInterviewQuestions } = await import('../lib/tiered-ai-provider');
    const interviewQuestions = await generateInterviewQuestions(
      resumeAnalysis,
      jobAnalysis,
      matchAnalysis,
      userTierInfo
    );

    // Store interview questions
    await storage.createInterviewQuestions({
      userId,
      resumeId,
      jobDescriptionId: jobId,
      questions: interviewQuestions.questions || []
    });

    logger.info(`Interview questions generated successfully`, {
      resumeId,
      jobId,
      questionsCount: interviewQuestions.questions?.length || 0
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
      technicalQuestions: interviewQuestions.questions?.filter(q => q.category === 'technical') || [],
      experienceQuestions: interviewQuestions.questions?.filter(q => q.category === 'experience') || [],
      skillGapQuestions: interviewQuestions.questions?.filter(q => q.category === 'skill-gap') || [],
      inclusionQuestions: interviewQuestions.questions?.filter(q => q.category === 'inclusion') || []
    });

  } catch (error) {
    logger.error('Interview question generation failed:', error);
    res.status(500).json({
      error: "Failed to generate interview questions",
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Analyze bias in job description
router.post("/analyze-bias/:jobId", authenticateUser, async (req: Request, res: Response) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const userId = req.user!.uid;

    if (isNaN(jobId)) {
      return res.status(400).json({
        error: "Invalid job ID",
        message: "Job ID must be a number"
      });
    }

    logger.info(`Analyzing bias for job ${jobId}, user ${userId}`);

    // Get job description
    const jobDescription = await storage.getJobDescriptionById(jobId, userId);
    if (!jobDescription) {
      return res.status(404).json({
        error: "Job description not found",
        message: "Job description not found or you don't have permission to access it"
      });
    }

    // Get user tier info
    const { getUserTierInfo } = await import('../lib/user-tiers');
    const userTierInfo = getUserTierInfo(userId);

    // Perform bias analysis
    const { analyzeBias } = await import('../lib/tiered-ai-provider');
    const biasAnalysis = await analyzeBias(
      jobDescription.title,
      jobDescription.description,
      userTierInfo
    );

    logger.info(`Bias analysis completed for job ${jobId}`, {
      hasBias: biasAnalysis.hasBias,
      biasTypes: biasAnalysis.biasTypes?.length || 0
    });

    // Save bias analysis to storage
    try {
      await storage.updateJobDescriptionBiasAnalysis(jobId, biasAnalysis);
      logger.info(`Bias analysis saved for job ${jobId}`);
    } catch (storageError) {
      logger.error('Failed to save bias analysis to storage:', {
        error: storageError,
        errorMessage: storageError instanceof Error ? storageError.message : 'Unknown error',
        errorStack: storageError instanceof Error ? storageError.stack : undefined,
        jobId,
        biasAnalysisKeys: Object.keys(biasAnalysis || {})
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
        improvedDescription: biasAnalysis.improvedDescription || jobDescription.description,
        biasConfidenceScore: biasAnalysis.overallScore || (biasAnalysis.hasBias ? 60 : 95),
        fairnessAssessment: biasAnalysis.summary || 'Analysis completed'
      }
    };

    res.json(response);

  } catch (error) {
    logger.error('Bias analysis failed:', error);
    res.status(500).json({
      error: "Bias analysis failed",
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export default router;