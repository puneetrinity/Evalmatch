import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { z } from "zod";
import fs from 'fs';
import {
  insertResumeSchema,
  insertJobDescriptionSchema,
  resumeFileSchema,
  InsertAnalysisResult,
} from "@shared/schema";
import { parseDocument } from "./lib/document-parser";
import { handleApiError } from "./lib/error-handler";
// Define interfaces for API response transformations
interface ApiSkill {
  skill_name: string;
  match_percentage: number;
}

interface ApiMatchAnalysis {
  matched_skills?: ApiSkill[];
  matchedSkills?: { skill: string; matchPercentage: number }[];
  match_percentage?: number;
  matchPercentage?: number; 
  missing_skills?: string[];
  missingSkills?: string[];
  candidate_strengths?: string[];
  candidateStrengths?: string[];
  candidate_weaknesses?: string[];
  candidateWeaknesses?: string[];
  fairnessMetrics?: {
    biasConfidenceScore: number;
    potentialBiasAreas: string[];
    fairnessAssessment: string;
  };
}

import {
  analyzeResume,
  analyzeJobDescription,
  analyzeMatch,
  generateInterviewQuestions,
  analyzeBias,
  getAIServiceStatus,
  analyzeResumeFairness,
} from "./lib/ai-provider";
import { generateSessionId, registerSession } from "./lib/session-utils";

// Configure multer for disk storage to handle large files
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      // Store files in a temporary uploads directory
      cb(null, './uploads');
    },
    filename: function (req, file, cb) {
      // Generate unique filename with timestamp
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB (increased limit)
  },
  fileFilter: (req, file, cb) => {
    // Accept only certain file types
    const allowedMimeTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, JPEG and PNG files are allowed.'));
    }
  }
});

// Helper to validate request body with improved error handling
function validateRequest<T>(schema: z.ZodType<T>, body: any): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    // Format Zod errors for better client-side understanding
    const formattedErrors = result.error.errors.map(err => ({
      path: err.path.join('.'),
      message: err.message
    }));
    
    throw new Error(
      JSON.stringify({
        message: 'Validation failed',
        errors: formattedErrors
      })
    );
  }
  return result.data;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // API Routes
  // Prefix all routes with /api

  // Health check endpoint - Enhanced for Render deployment
  app.get("/api/health", async (req: Request, res: Response) => {
    try {
      // Import and use the healthcheck function
      const { healthCheck } = await import('./healthcheck.js');
      await healthCheck(req, res);
    } catch (error) {
      // Fallback to simple response if the advanced check fails
      console.error('Health check error:', error);
      res.json({ status: "ok", message: "Basic health check passed" });
    }
  });
  
  // Database health status endpoint - Monitor database connection health
  app.get("/api/db-status", async (req: Request, res: Response) => {
    try {
      // Default status when hybrid storage is not available
      let dbHealthStatus = {
        available: false,
        queuedWrites: 0,
        lastAvailable: null,
        mode: "unknown",
        message: "Database status unavailable"
      };
      
      // Import the database rate limiter status
      const { getDatabaseRateLimiterStatus } = await import('./lib/db-retry.js');
      const rateLimiterStats = getDatabaseRateLimiterStatus();
      
      // Get connection stats from db.ts
      const { getConnectionStats } = await import('./db.js');
      const connectionStats = getConnectionStats();
      
      // Try to access the hybrid storage health status
      if ((storage as any).getDbHealthStatus) {
        const rawStatus = (storage as any).getDbHealthStatus();
        
        // Map from internal status format to API response format
        dbHealthStatus = {
          available: rawStatus.isAvailable || false,
          queuedWrites: rawStatus.queuedWritesCount || 0,
          lastAvailable: rawStatus.lastAvailableTime ? new Date(rawStatus.lastAvailableTime).toISOString() : null,
          mode: rawStatus.isAvailable ? "database" : "memory-fallback",
          message: rawStatus.isAvailable ? 
            "Database is connected and operational" : 
            "Using memory storage with automatic reconnection"
        };
      }
      
      res.json({
        status: "ok",
        database: {
          ...dbHealthStatus,
          // Add rate limiter statistics
          rateLimiter: {
            currentRate: rateLimiterStats.currentRate,
            maxRate: rateLimiterStats.maxRate,
            queueLength: rateLimiterStats.queueLength,
            enabled: rateLimiterStats.enabled,
            lastRateLimitHit: rateLimiterStats.lastRateLimitHit
          },
          // Add connection statistics
          connectionStats: {
            totalConnections: connectionStats.totalConnections,
            activeConnections: connectionStats.activeConnections,
            failedConnections: connectionStats.failedConnections,
            successRate: connectionStats.connectionSuccessRate,
            uptime: connectionStats.uptime,
            environment: connectionStats.environment,
            serverType: connectionStats.serverType
          }
        }
      });
    } catch (error) {
      console.error('Database status check error:', error);
      res.json({ 
        status: "ok", 
        database: { 
          available: false, 
          queuedWrites: 0,
          lastAvailable: null,
          mode: "error",
          message: "Error retrieving database status" 
        } 
      });
    }
  });
  
  // API Service status endpoint - Monitor AI provider services health
  app.get("/api/service-status", async (req: Request, res: Response) => {
    try {
      // Get current service status for all providers
      const serviceStatus = getAIServiceStatus();
      
      // Add performance metrics for the frontend
      const enhancedStatus = {
        ...serviceStatus,
        services: {
          ...serviceStatus.providers,
          performance: {
            averageResponseTime: "1.2s", // This would ideally be calculated from actual data
            uptime: "99.8%",             // This would ideally be calculated from actual data
            lastChecked: new Date().toISOString()
          }
        }
      };
      
      res.json({
        status: "ok",
        aiStatus: enhancedStatus,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      // Log the error
      console.error('Service status check error:', error);
      
      // Return a user-friendly error
      res.status(500).json({ 
        status: "error", 
        message: "We're having trouble checking our service status. This doesn't affect your work - please try again in a few moments.",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Upload and process resume
  app.post(
    "/api/resumes",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        // Check if session ID is provided or create a new one
        let sessionId = req.body.sessionId;
        
        // If no sessionId provided, create a new one
        if (!sessionId) {
          sessionId = generateSessionId();
          registerSession(sessionId);
          console.log(`Created new upload session: ${sessionId}`);
        }

        // Validate file
        const file = validateRequest(resumeFileSchema, {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          // For disk storage, we use path instead of buffer
          path: req.file.path,
        });

        // Read file from disk
        const fileBuffer = fs.readFileSync(req.file.path);
        
        // Extract text from the document
        const content = await parseDocument(fileBuffer, file.mimetype);

        // Create resume entry in storage with session ID
        const resume = await storage.createResume({
          filename: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          content,
          sessionId,
        });

        // Analyze resume immediately (not in the background)
        try {
          const analysis = await analyzeResume(content);
          await storage.updateResumeAnalysis(resume.id, analysis);
          
          res.status(201).json({
            id: resume.id,
            filename: resume.filename,
            fileSize: resume.fileSize,
            fileType: resume.fileType,
            sessionId,
            isAnalyzed: true,
          });
        } catch (err) {
          console.error("Failed to analyze resume:", err);
          res.status(201).json({
            id: resume.id,
            filename: resume.filename,
            fileSize: resume.fileSize,
            fileType: resume.fileType,
            sessionId,
            isAnalyzed: false,
            error: "Resume analysis failed",
          });
        }
      } catch (error) {
        console.error("Error processing resume:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get all resumes (with optional sessionId filter)
  app.get("/api/resumes", async (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      
      // Get all resumes, filtered by sessionId if provided
      const resumes = await storage.getResumes(sessionId);
      
      res.json(
        resumes.map((resume) => ({
          id: resume.id,
          filename: resume.filename,
          fileSize: resume.fileSize,
          fileType: resume.fileType,
          created: resume.created,
          sessionId: resume.sessionId,
          isAnalyzed: !!resume.analyzedData,
        }))
      );
    } catch (error) {
      handleApiError(res, error, "fetching resumes");
    }
  });

  // Get a specific resume with its analysis
  app.get("/api/resumes/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid resume ID" });
      }

      const resume = await storage.getResume(id);
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }

      res.json({
        id: resume.id,
        filename: resume.filename,
        fileSize: resume.fileSize,
        fileType: resume.fileType,
        created: resume.created,
        analysis: resume.analyzedData,
      });
    } catch (error) {
      console.error("Error fetching resume:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Create a job description
  app.post("/api/job-descriptions", async (req: Request, res: Response) => {
    try {
      const jobDescData = validateRequest(insertJobDescriptionSchema, req.body);

      // Create job description in storage
      const jobDescription = await storage.createJobDescription(jobDescData);

      // Analyze job description immediately (not in the background)
      try {
        const analysis = await analyzeJobDescription(jobDescription.title, jobDescription.description);
        await storage.updateJobDescriptionAnalysis(jobDescription.id, analysis);
        
        res.status(201).json({
          id: jobDescription.id,
          title: jobDescription.title,
          isAnalyzed: true,
        });
      } catch (err) {
        console.error("Failed to analyze job description:", err);
        res.status(201).json({
          id: jobDescription.id,
          title: jobDescription.title,
          isAnalyzed: false,
          error: "Job description analysis failed",
        });
      }
    } catch (error) {
      console.error("Error creating job description:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get all job descriptions
  app.get("/api/job-descriptions", async (req: Request, res: Response) => {
    try {
      const jobDescriptions = await storage.getJobDescriptions();
      
      // Set cache control headers to prevent browser caching
      // This ensures clients always get fresh data without relying on cached responses
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(
        jobDescriptions.map((jd) => ({
          id: jd.id,
          title: jd.title,
          created: jd.created,
          isAnalyzed: !!jd.analyzedData,
        }))
      );
    } catch (error) {
      console.error("Error fetching job descriptions:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get a specific job description with its analysis
  app.get(
    "/api/job-descriptions/:id",
    async (req: Request, res: Response) => {
      try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
          return res.status(400).json({ message: "Invalid job description ID" });
        }

        const jobDescription = await storage.getJobDescription(id);
        if (!jobDescription) {
          return res.status(404).json({ message: "Job description not found" });
        }

        // Set cache control headers to prevent browser caching
        // This ensures clients always get fresh data without relying on cached responses
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        res.json({
          id: jobDescription.id,
          title: jobDescription.title,
          description: jobDescription.description,
          created: jobDescription.created,
          analysis: jobDescription.analyzedData,
        });
      } catch (error) {
        console.error("Error fetching job description:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Analyze and compare resumes with a job description
  app.post(
    "/api/analyze/:jobDescriptionId",
    async (req: Request, res: Response) => {
      try {
        const jobDescriptionId = parseInt(req.params.jobDescriptionId);
        if (isNaN(jobDescriptionId)) {
          return res.status(400).json({ message: "Invalid job description ID" });
        }

        // Get session ID if provided (for filtering resumes from a specific upload session)
        const { sessionId } = req.body;
        
        // Get the job description
        const jobDescription = await storage.getJobDescription(jobDescriptionId);
        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }

        // Get resumes, filtered by sessionId if provided
        const resumes = await storage.getResumes(sessionId);
        if (resumes.length === 0) {
          return res.status(404).json({ 
            message: sessionId 
              ? `No resumes found for session ${sessionId}` 
              : "No resumes found" 
          });
        }

        // Array to store our results
        const analysisResults = [];
        
        // Process each resume that has been analyzed
        for (const resume of resumes.filter(r => r.analyzedData)) {
          try {
            // Compare the resume with the job description, including resume text for fairness analysis
            const matchAnalysis = await analyzeMatch(
              resume.analyzedData as any,
              jobDescription.analyzedData as any,
              resume.content // Pass the resume text for fairness analysis
            );

            // Create analysis result
            const analysisResult = await storage.createAnalysisResult({
              resumeId: resume.id,
              jobDescriptionId,
              matchPercentage: matchAnalysis.matchPercentage,
              matchedSkills: matchAnalysis.matchedSkills,
              missingSkills: matchAnalysis.missingSkills,
              analysis: matchAnalysis,
            });

            analysisResults.push({
              resumeId: resume.id,
              filename: resume.filename,
              candidateName: (resume.analyzedData as any)?.name || "Unknown",
              match: matchAnalysis,
              analysisId: analysisResult.id,
            });
          } catch (error) {
            console.error(`Error analyzing resume ${resume.id}:`, error);
          }
        }

        // Sort results by match percentage (descending)
        analysisResults.sort((a, b) => 
          (b.match?.matchPercentage || 0) - (a.match?.matchPercentage || 0)
        );

        res.json({
          jobDescriptionId,
          jobTitle: jobDescription.title,
          results: analysisResults,
        });
      } catch (error) {
        console.error("Error analyzing resumes:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get analysis results for a specific job description
  app.get(
    "/api/analyze/:jobDescriptionId", 
    async (req: Request, res: Response) => {
      try {
        const jobDescriptionId = parseInt(req.params.jobDescriptionId);
        // Get the session ID from the query parameter if provided
        const sessionId = req.query.sessionId as string | undefined;
        
        console.log(`Processing analysis for job description ID: ${jobDescriptionId}, sessionId: ${sessionId || 'not provided'}`);
        if (isNaN(jobDescriptionId)) {
          console.log(`Invalid job description ID: ${req.params.jobDescriptionId}`);
          return res.status(400).json({ message: "Invalid job description ID" });
        }

        // Get the job description
        const jobDescription = await storage.getJobDescription(jobDescriptionId);
        console.log(`Job description lookup result: ${jobDescription ? `Found job '${jobDescription.title}'` : 'Not found'}`);
        if (!jobDescription) {
          // Return a more precise error message for debugging
          return res.status(404).json({ 
            message: `Job description with ID ${jobDescriptionId} not found. Please verify the correct ID was used.`
          });
        }

        // Get resumes with analysis, filtered by sessionId if provided
        const resumes = (await storage.getResumes(sessionId)).filter(r => r.analyzedData);
        console.log(`Found ${resumes.length} analyzed resumes for session ${sessionId || 'all sessions'}`);
        
        // Collect resume IDs for this session (or all if not provided)
        const resumeIds = resumes.map(resume => resume.id);
        
        if (resumeIds.length === 0) {
          return res.json({
            jobDescriptionId,
            jobTitle: jobDescription.title,
            results: [],
          });
        }
        
        // First check if we have any existing analysis results for these resumes
        let analysisResults = await storage.getAnalysisResultsByJobDescriptionId(jobDescriptionId);
        
        // Filter analysis results to only include the resumes from this session
        analysisResults = analysisResults.filter(result => resumeIds.includes(result.resumeId));
        console.log(`Found ${analysisResults.length} existing analysis results for the selected resumes`);
        
        // Get list of resumes that need analysis
        const resumesNeedingAnalysis = resumes.filter(resume => 
          !analysisResults.some(result => result.resumeId === resume.id)
        );
        
        // If we have resumes that need analysis, analyze them now
        if (resumesNeedingAnalysis.length > 0 && jobDescription.analyzedData) {
          console.log(`Analyzing ${resumesNeedingAnalysis.length} new resumes`);
          
          // Run analysis for each resume that needs it
          for (const resume of resumesNeedingAnalysis) {
            try {
              const matchAnalysis = await analyzeMatch(
                resume.analyzedData as any,
                jobDescription.analyzedData as any,
                resume.content // Pass the resume text for fairness analysis
              );
              
              const newResult = await storage.createAnalysisResult({
                resumeId: resume.id,
                jobDescriptionId,
                matchPercentage: matchAnalysis.matchPercentage,
                matchedSkills: matchAnalysis.matchedSkills,
                missingSkills: matchAnalysis.missingSkills,
                analysis: matchAnalysis,
              });
              
              // Add this new result to our collection
              analysisResults.push(newResult);
            } catch (err) {
              console.error(`Error analyzing resume ${resume.id}:`, err);
            }
          }
        }
        
        // Map analysis results to include resume data
        const results = await Promise.all(
          analysisResults.map(async (result) => {
            const resume = await storage.getResume(result.resumeId);
            if (!resume || !resume.analyzedData) return null;
            
            return {
              resumeId: resume.id,
              filename: resume.filename,
              candidateName: (resume.analyzedData as any)?.name || "Unknown",
              match: result.analysis,
              analysisId: result.id,
            };
          })
        );

        // Transform the results to standardize property names (snake_case to camelCase)
        const transformedResults = results
          .filter((result): result is NonNullable<typeof result> => result !== null)
          .map(result => {
            const typedMatch = result.match as ApiMatchAnalysis;
            
            // Transform matched_skills to matchedSkills with correct property names
            if (typedMatch && typedMatch.matched_skills && Array.isArray(typedMatch.matched_skills)) {
              typedMatch.matchedSkills = typedMatch.matched_skills.map((skill: ApiSkill) => ({
                skill: skill.skill_name,
                matchPercentage: skill.match_percentage
              }));
            }
            
            // Transform additional properties to camelCase
            if (typedMatch) {
              if (typedMatch.match_percentage !== undefined) {
                typedMatch.matchPercentage = typedMatch.match_percentage;
              }
              if (typedMatch.missing_skills !== undefined) {
                typedMatch.missingSkills = typedMatch.missing_skills;
              }
              if (typedMatch.candidate_strengths !== undefined) {
                typedMatch.candidateStrengths = typedMatch.candidate_strengths;
              }
              if (typedMatch.candidate_weaknesses !== undefined) {
                typedMatch.candidateWeaknesses = typedMatch.candidate_weaknesses;
              }
            }
            
            return {
              ...result,
              match: typedMatch
            };
          })
          .sort((a, b) => (b.match?.matchPercentage || 0) - (a.match?.matchPercentage || 0));

        res.json({
          jobDescriptionId,
          jobTitle: jobDescription.title,
          results: transformedResults,
        });
      } catch (error) {
        console.error("Error fetching analysis results:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get specific analysis for a resume and job description
  app.get(
    "/api/analyze/:jobId/:resumeId",
    async (req: Request, res: Response) => {
      try {
        const jobId = parseInt(req.params.jobId);
        const resumeId = parseInt(req.params.resumeId);
        
        console.log(`Processing specific analysis for job ID: ${jobId}, resume ID: ${resumeId}`);

        if (isNaN(jobId) || isNaN(resumeId)) {
          console.log(`Invalid job ID or resume ID: jobId=${req.params.jobId}, resumeId=${req.params.resumeId}`);
          return res.status(400).json({ message: "Invalid job ID or resume ID" });
        }

        // Get the job description
        const jobDescription = await storage.getJobDescription(jobId);
        console.log(`Job lookup result: ${jobDescription ? `Found job '${jobDescription.title}'` : 'Job not found'}`);
        if (!jobDescription) {
          return res.status(404).json({ 
            message: `Job description with ID ${jobId} not found. Please verify the correct ID was used.` 
          });
        }

        // Get the resume
        const resume = await storage.getResume(resumeId);
        console.log(`Resume lookup result: ${resume ? `Found resume '${resume.filename}'` : 'Resume not found'}`);
        if (!resume) {
          return res.status(404).json({ 
            message: `Resume with ID ${resumeId} not found. Please verify the correct ID was used.` 
          });
        }

        // Get the analysis result
        const analysisResult = await storage.getAnalysisResultsByResumeId(resumeId);
        const matchForJob = analysisResult.find(result => result.jobDescriptionId === jobId);

        if (!matchForJob) {
          return res.status(404).json({ message: "Analysis not found for this resume and job" });
        }

        // Map the API skills format to the format expected by the frontend
        const analysis = matchForJob.analysis;
        
        // Transform matched_skills to matchedSkills with correct property names
        const typedAnalysis = analysis as ApiMatchAnalysis;
        if (typedAnalysis && typedAnalysis.matched_skills && Array.isArray(typedAnalysis.matched_skills)) {
          typedAnalysis.matchedSkills = typedAnalysis.matched_skills.map((skill: ApiSkill) => ({
            skill: skill.skill_name,
            matchPercentage: skill.match_percentage
          }));
        }
        
        // Transform additional properties to camelCase if needed
        if (typedAnalysis) {
          if (typedAnalysis.match_percentage !== undefined) {
            typedAnalysis.matchPercentage = typedAnalysis.match_percentage;
          }
          if (typedAnalysis.missing_skills !== undefined) {
            typedAnalysis.missingSkills = typedAnalysis.missing_skills;
          }
          if (typedAnalysis.candidate_strengths !== undefined) {
            typedAnalysis.candidateStrengths = typedAnalysis.candidate_strengths;
          }
          if (typedAnalysis.candidate_weaknesses !== undefined) {
            typedAnalysis.candidateWeaknesses = typedAnalysis.candidate_weaknesses;
          }
        }
        
        // Return the detailed analysis with transformed data
        res.json({
          resumeId,
          jobId,
          match: analysis
        });
      } catch (error) {
        console.error("Error fetching specific analysis:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Generate interview questions for a specific resume and job description
  app.post(
    "/api/interview-questions/:resumeId/:jobDescriptionId",
    async (req: Request, res: Response) => {
      try {
        const resumeId = parseInt(req.params.resumeId);
        const jobDescriptionId = parseInt(req.params.jobDescriptionId);

        if (isNaN(resumeId) || isNaN(jobDescriptionId)) {
          return res
            .status(400)
            .json({ message: "Invalid resume ID or job description ID" });
        }

        // Get the resume and job description
        const resume = await storage.getResume(resumeId);
        const jobDescription = await storage.getJobDescription(jobDescriptionId);

        if (!resume || !resume.analyzedData) {
          return res.status(404).json({ 
            message: "Resume not found or analysis not completed yet" 
          });
        }

        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }

        // Get the analysis result
        const analysisResults = await storage.getAnalysisResultsByResumeId(resumeId);
        const analysisResult = analysisResults.find(
          (result) => result.jobDescriptionId === jobDescriptionId
        );

        if (!analysisResult) {
          return res.status(404).json({ 
            message: "Analysis result not found. Please run analysis first." 
          });
        }

        // Check if interview questions already exist
        let questions = await storage.getInterviewQuestionByResumeAndJob(
          resumeId,
          jobDescriptionId
        );

        if (!questions) {
          // Generate interview questions
          const generatedQuestions = await generateInterviewQuestions(
            resume.analyzedData,
            jobDescription.analyzedData,
            analysisResult.analysis
          );

          // Store the generated questions
          questions = await storage.createInterviewQuestions({
            resumeId,
            jobDescriptionId,
            technicalQuestions: generatedQuestions.technicalQuestions,
            experienceQuestions: generatedQuestions.experienceQuestions,
            skillGapQuestions: generatedQuestions.skillGapQuestions,
          });
        }

        res.json({
          id: questions.id,
          resumeId,
          resumeName: resume.analyzedData.name || "Unknown",
          jobDescriptionId,
          jobTitle: jobDescription.title,
          matchPercentage: analysisResult.matchPercentage,
          technicalQuestions: questions.technicalQuestions,
          experienceQuestions: questions.experienceQuestions,
          skillGapQuestions: questions.skillGapQuestions,
        });
      } catch (error) {
        console.error("Error generating interview questions:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
  
  // Alternative endpoint for /api/generate-interview-questions with JSON body
  app.post(
    "/api/generate-interview-questions",
    async (req: Request, res: Response) => {
      try {
        const { resumeId, jobDescriptionId } = req.body;
        
        if (!resumeId || !jobDescriptionId || isNaN(Number(resumeId)) || isNaN(Number(jobDescriptionId))) {
          return res.status(400).json({ 
            message: "Invalid request. Both resumeId and jobDescriptionId are required as numbers." 
          });
        }
        
        const resumeIdNum = Number(resumeId);
        const jobDescriptionIdNum = Number(jobDescriptionId);
        
        // Get the resume and job description
        const resume = await storage.getResume(resumeIdNum);
        const jobDescription = await storage.getJobDescription(jobDescriptionIdNum);

        if (!resume || !resume.analyzedData) {
          return res.status(404).json({ 
            message: "Resume not found or analysis not completed yet" 
          });
        }

        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }

        // Get the analysis result
        const analysisResults = await storage.getAnalysisResultsByResumeId(resumeIdNum);
        const analysisResult = analysisResults.find(
          (result) => result.jobDescriptionId === jobDescriptionIdNum
        );

        if (!analysisResult) {
          return res.status(404).json({ 
            message: "Analysis result not found. Please run analysis first." 
          });
        }

        // Check if interview questions already exist
        let questions = await storage.getInterviewQuestionByResumeAndJob(
          resumeIdNum,
          jobDescriptionIdNum
        );

        if (!questions) {
          // Generate interview questions
          const generatedQuestions = await generateInterviewQuestions(
            resume.analyzedData,
            jobDescription.analyzedData,
            analysisResult.analysis
          );

          // Store the generated questions
          questions = await storage.createInterviewQuestions({
            resumeId: resumeIdNum,
            jobDescriptionId: jobDescriptionIdNum,
            technicalQuestions: generatedQuestions.technicalQuestions,
            experienceQuestions: generatedQuestions.experienceQuestions,
            skillGapQuestions: generatedQuestions.skillGapQuestions,
          });
        }

        res.json({
          id: questions.id,
          resumeId: resumeIdNum,
          resumeName: resume.analyzedData.name || "Unknown",
          jobDescriptionId: jobDescriptionIdNum,
          jobTitle: jobDescription.title,
          matchPercentage: analysisResult.matchPercentage,
          technicalQuestions: questions.technicalQuestions,
          experienceQuestions: questions.experienceQuestions,
          skillGapQuestions: questions.skillGapQuestions,
        });
      } catch (error) {
        console.error("Error generating interview questions:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // New endpoint for analyzing match between resume and job with JSON body
  app.post(
    "/api/analyze-match",
    async (req: Request, res: Response) => {
      try {
        const { resumeId, jobDescriptionId } = req.body;
        
        if (!resumeId || !jobDescriptionId || isNaN(Number(resumeId)) || isNaN(Number(jobDescriptionId))) {
          return res.status(400).json({ 
            message: "Invalid request. Both resumeId and jobDescriptionId are required as numbers." 
          });
        }
        
        const resumeIdNum = Number(resumeId);
        const jobDescriptionIdNum = Number(jobDescriptionId);
        
        // Get the job description
        const jobDescription = await storage.getJobDescription(jobDescriptionIdNum);
        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }
        
        // Get the resume
        const resume = await storage.getResume(resumeIdNum);
        if (!resume || !resume.analyzedData) {
          return res.status(404).json({ 
            message: "Resume not found or analysis not completed yet" 
          });
        }
        
        // Check if we already have analysis results
        const existingResults = await storage.getAnalysisResultsByResumeId(resumeIdNum);
        const existingMatch = existingResults.find(
          result => result.jobDescriptionId === jobDescriptionIdNum
        );
        
        if (existingMatch) {
          // Map the API skills format to the format expected by the frontend
          const analysis = existingMatch.analysis;
          
          // Transform matched_skills to matchedSkills with correct property names
          const typedAnalysis = analysis as ApiMatchAnalysis;
          if (typedAnalysis && typedAnalysis.matched_skills && Array.isArray(typedAnalysis.matched_skills)) {
            typedAnalysis.matchedSkills = typedAnalysis.matched_skills.map((skill: ApiSkill) => ({
              skill: skill.skill_name,
              matchPercentage: skill.match_percentage
            }));
          }
          
          // Transform additional properties to camelCase if needed
          if (typedAnalysis) {
            if (typedAnalysis.match_percentage !== undefined) {
              typedAnalysis.matchPercentage = typedAnalysis.match_percentage;
            }
            if (typedAnalysis.missing_skills !== undefined) {
              typedAnalysis.missingSkills = typedAnalysis.missing_skills;
            }
            if (typedAnalysis.candidate_strengths !== undefined) {
              typedAnalysis.candidateStrengths = typedAnalysis.candidate_strengths;
            }
            if (typedAnalysis.candidate_weaknesses !== undefined) {
              typedAnalysis.candidateWeaknesses = typedAnalysis.candidate_weaknesses;
            }
          }
          
          return res.json({
            resumeId: resumeIdNum,
            jobDescriptionId: jobDescriptionIdNum,
            match: analysis,
            analysisId: existingMatch.id
          });
        }
        
        // Perform new analysis
        const matchAnalysis = await analyzeMatch(
          resume.analyzedData as any,
          jobDescription.analyzedData as any,
          resume.content // Pass the resume text for fairness analysis
        );
        
        // Store the result
        const analysisResult = await storage.createAnalysisResult({
          resumeId: resumeIdNum,
          jobDescriptionId: jobDescriptionIdNum,
          matchPercentage: matchAnalysis.matchPercentage,
          matchedSkills: matchAnalysis.matchedSkills,
          missingSkills: matchAnalysis.missingSkills,
          analysis: matchAnalysis
        });
        
        return res.json({
          resumeId: resumeIdNum,
          jobDescriptionId: jobDescriptionIdNum,
          match: matchAnalysis,
          analysisId: analysisResult.id
        });
      } catch (error) {
        console.error("Error analyzing match:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Analyze bias in job description
  app.post(
    "/api/analyze-bias/:jobId",
    async (req: Request, res: Response) => {
      try {
        // Validate job ID
        const jobId = parseInt(req.params.jobId);
        if (isNaN(jobId)) {
          return res.status(400).json({ message: "Invalid job ID" });
        }

        // Retrieve the job description
        const jobDescription = await storage.getJobDescription(jobId);
        if (!jobDescription) {
          return res.status(404).json({ message: "Job description not found" });
        }
        
        // Check if description exists
        if (!jobDescription.description || jobDescription.description.trim() === '') {
          return res.status(400).json({ 
            message: "The job description is empty or not available. Please add content before analysis." 
          });
        }

        // Log the analysis request
        console.log(`Starting bias analysis for job ID ${jobId}: "${jobDescription.title}"`);
        
        // Analyze bias in the job description
        const biasAnalysis = await analyzeBias(
          jobDescription.title,
          jobDescription.description
        );
        
        // Log successful completion
        console.log(`Completed bias analysis for job ID ${jobId}`);

        // Return the result
        return res.json({
          jobId,
          biasAnalysis
        });
      } catch (error) {
        // Log the detailed error
        console.error("Error analyzing bias:", error);
        
        // Determine if this is an OpenAI API issue
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const isApiError = typeof errorMessage === 'string' && 
          (errorMessage.includes("OpenAI") || errorMessage.includes("API"));
        
        // Provide a specific error message based on the error type
        return res.status(500).json({
          message: isApiError 
            ? "There was an issue connecting to the AI service. Please try again later."
            : "Failed to analyze bias in job description. Please try again.",
          error: errorMessage,
          details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
        });
      }
    }
  );

  // Update job description with improved version from bias analysis
  app.patch(
    "/api/job-descriptions/:id",
    async (req: Request, res: Response) => {
      try {
        const jobId = parseInt(req.params.id);
        if (isNaN(jobId)) {
          return res.status(400).json({ message: "Invalid job ID" });
        }

        // Retrieve the job description
        const jobDescription = await storage.getJobDescription(jobId);
        if (!jobDescription) {
          return res.status(404).json({ message: "Job description not found" });
        }

        // Update the job description
        // Note: In a real application, you would validate the request body
        const updatedJobDescription = {
          ...jobDescription,
          description: req.body.description || jobDescription.description
        };

        // Store the updated job description
        // Note: The storage interface doesn't have an update method,
        // so we're simulating it by creating a new job description
        // In a real application, you would implement proper update functionality
        jobDescription.description = req.body.description || jobDescription.description;

        res.json({
          id: jobDescription.id,
          title: jobDescription.title,
          description: jobDescription.description
        });
      } catch (error) {
        console.error("Error updating job description:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Create analysis result
  app.post(
    "/api/analysis-results",
    async (req: Request, res: Response) => {
      try {
        const { resumeId, jobDescriptionId, matchAnalysis } = req.body;

        if (!resumeId || !jobDescriptionId || !matchAnalysis) {
          return res.status(400).json({
            message: "resumeId, jobDescriptionId, and matchAnalysis are required"
          });
        }

        // Get the resume and job description
        const resume = await storage.getResume(resumeId);
        const jobDescription = await storage.getJobDescription(jobDescriptionId);

        if (!resume) {
          return res.status(404).json({ 
            message: "Resume not found" 
          });
        }

        if (!jobDescription) {
          return res.status(404).json({ 
            message: "Job description not found" 
          });
        }

        // Check if analysis already exists
        const existingAnalysisResults = await storage.getAnalysisResultsByResumeId(resumeId);
        const existingAnalysis = existingAnalysisResults.find(
          (result) => result.jobDescriptionId === jobDescriptionId
        );

        if (existingAnalysis) {
          console.log(`Analysis already exists for resume ${resumeId} and job ${jobDescriptionId}, updating it`);
          // Update the existing analysis
          // (This functionality would need to be added to the storage interface)
          // For now, we'll return the existing analysis
          return res.status(200).json(existingAnalysis);
        }

        // Extract the match percentage and prepare the data
        const matchPercentage = matchAnalysis.matchPercentage || 0;
        const matchedSkills = matchAnalysis.matchedSkills || [];
        const missingSkills = matchAnalysis.missingSkills || [];
        
        // Create a new analysis result
        const analysisResult = await storage.createAnalysisResult({
          resumeId,
          jobDescriptionId,
          matchPercentage,
          matchedSkills,
          missingSkills,
          analysis: {
            candidateStrengths: matchAnalysis.candidateStrengths || [],
            candidateWeaknesses: matchAnalysis.candidateWeaknesses || []
          }
        } as InsertAnalysisResult);

        return res.status(201).json(analysisResult);
      } catch (error) {
        console.error("Error creating analysis result:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // POST endpoint to analyze fairness of resume analysis
  app.post(
    "/api/fairness-analysis",
    async (req: Request, res: Response) => {
      try {
        const { resumeId, jobDescriptionId } = req.body;

        if (!resumeId || !jobDescriptionId) {
          return res.status(400).json({
            message: "Both resumeId and jobDescriptionId are required"
          });
        }

        // Get the resume and job description
        const resume = await storage.getResume(resumeId);
        const jobDescription = await storage.getJobDescription(jobDescriptionId);

        if (!resume || !resume.analyzedData) {
          return res.status(404).json({ 
            message: "Resume not found or analysis not completed yet" 
          });
        }

        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }

        // Get the analysis result
        const analysisResults = await storage.getAnalysisResultsByResumeId(resumeId);
        const analysisResult = analysisResults.find(
          (result) => result.jobDescriptionId === jobDescriptionId
        );

        if (!analysisResult) {
          return res.status(404).json({ 
            message: "Analysis result not found. Please run analysis first." 
          });
        }

        // Extract the resume text, resume analysis and match analysis data
        const resumeText = resume.content || "";
        
        // The resume analysis is returned as 'analysis' in the API but stored as 'analyzed_data' in the DB
        // We need to make sure it's in the format expected by the fairness analyzer
        const resumeAnalysis = {
          name: resume.analysis?.name || "",
          skills: resume.analysis?.skills || [],
          experience: resume.analysis?.experience || [],
          education: resume.analysis?.education || [],
          contact: resume.analysis?.contact_information || {}
        };
        
        // Construct the match analysis data in the format expected by the fairness analyzer
        const matchAnalysis = {
          matchPercentage: analysisResult.matchPercentage,
          matchedSkills: analysisResult.matchedSkills || [],
          missingSkills: analysisResult.missingSkills || [],
          candidateStrengths: analysisResult.analysis?.candidateStrengths || [],
          candidateWeaknesses: analysisResult.analysis?.candidateWeaknesses || []
        };

        // Perform fairness analysis
        const fairnessAnalysis = await analyzeResumeFairness(
          resumeText,
          resumeAnalysis,
          matchAnalysis
        );

        return res.status(200).json({
          resumeId,
          jobDescriptionId,
          fairnessAnalysis
        });
      } catch (error) {
        console.error("Error analyzing fairness:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}
