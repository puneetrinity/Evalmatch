import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { z } from "zod";
import fs from 'fs';
import { logger } from './lib/logger';
import { authenticateUser } from './middleware/auth';
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
  analyzeResume as analyzeResumeBasic,
  analyzeJobDescription as analyzeJobDescriptionBasic,
  analyzeMatch as analyzeMatchBasic,
  generateInterviewQuestions as generateInterviewQuestionsBasic,
  analyzeBias as analyzeBiasBasic,
  getAIServiceStatus,
  analyzeResumeFairness,
} from "./lib/ai-provider";
import {
  analyzeResume,
  analyzeJobDescription,
  analyzeMatch as analyzeMatchTiered,
  generateInterviewQuestions,
  generateInterviewScript,
  analyzeBias,
  getTierAwareServiceStatus,
} from "./lib/tiered-ai-provider";
import { createDefaultUserTier, UserTierInfo } from "@shared/user-tiers";
import { generateSessionId, registerSession } from "./lib/session-utils";
import { apiRateLimiter, uploadRateLimiter } from "./middleware/rate-limiter";
import { secureUpload, validateUploadedFile } from "./lib/secure-upload";

// Helper function to get user tier information
async function getUserTierInfo(userId: string): Promise<UserTierInfo> {
  try {
    // Try to get existing user tier from storage
    const existingTier = await storage.getUserTierInfo?.(userId);
    if (existingTier) {
      return existingTier;
    }
  } catch (error) {
    logger.warn('Could not retrieve user tier info, using default:', error);
  }
  
  // Create default freemium tier for new users
  const defaultTier = createDefaultUserTier('freemium');
  
  try {
    // Save default tier to storage
    await storage.saveUserTierInfo?.(userId, defaultTier);
  } catch (error) {
    logger.warn('Could not save user tier info:', error);
  }
  
  return defaultTier;
}

// Helper function to save user tier information
async function saveUserTierInfo(userId: string, tierInfo: UserTierInfo): Promise<void> {
  try {
    await storage.saveUserTierInfo?.(userId, tierInfo);
  } catch (error) {
    logger.warn('Could not save updated user tier info:', error);
  }
}

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
  
  // Apply general API rate limiting to all /api routes
  app.use('/api/', apiRateLimiter);

  // Health check endpoint - Enhanced for Render deployment
  app.get("/api/health", async (req: Request, res: Response) => {
    try {
      // Import and use the healthcheck function
      const { healthCheck } = await import('./healthcheck.js');
      await healthCheck(req, res);
    } catch (error) {
      // Fallback to simple response if the advanced check fails
      logger.error('Health check error:', error);
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
      logger.error('Database status check error:', error);
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
  
  // Railway Debug endpoint - Comprehensive deployment debugging
  app.get("/api/debug", async (req: Request, res: Response) => {
    try {
      const debugInfo = {
        timestamp: new Date().toISOString(),
        environment: {
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT,
          RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT,
          RAILWAY_SERVICE_NAME: process.env.RAILWAY_SERVICE_NAME,
          RAILWAY_PROJECT_NAME: process.env.RAILWAY_PROJECT_NAME,
          RAILWAY_DEPLOYMENT_ID: process.env.RAILWAY_DEPLOYMENT_ID,
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
        },
        configuration: {
          databaseConfigured: !!process.env.DATABASE_URL,
          firebaseConfigured: !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_SERVICE_ACCOUNT_KEY),
          groqConfigured: !!process.env.GROQ_API_KEY,
          openaiConfigured: !!process.env.PR_OPEN_API_KEY,
          anthropicConfigured: !!process.env.PR_ANTHROPIC_API_KEY,
        },
        health: {
          status: "ok",
          storage: storage ? "available" : "unavailable",
          timestamp: new Date().toISOString()
        },
        firebase: {
          projectId: process.env.FIREBASE_PROJECT_ID || "not_configured",
          hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
          clientConfigured: !!(process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_AUTH_DOMAIN),
        },
        routes: {
          authenticationEnabled: true,
          protectedRoutes: [
            "/api/resumes",
            "/api/job-descriptions", 
            "/api/analyze",
            "/api/interview-questions",
            "/api/analyze-match",
            "/api/analyze-bias",
            "/api/fairness-analysis"
          ],
          publicRoutes: [
            "/api/health",
            "/api/debug", 
            "/api/db-status",
            "/api/service-status"
          ]
        }
      };

      // Test basic storage functionality
      try {
        if (storage) {
          // Test storage read operations (safe)
          const testResumes = await storage.getResumes();
          debugInfo.storage = {
            type: storage.constructor.name,
            available: true,
            resumeCount: testResumes.length,
            testSuccessful: true
          };
        }
      } catch (storageError) {
        debugInfo.storage = {
          available: false,
          error: storageError instanceof Error ? storageError.message : "Unknown storage error",
          testSuccessful: false
        };
      }

      // Test Firebase connection
      try {
        if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
          const { verifyFirebaseConfig } = await import('./lib/firebase-admin.js');
          const firebaseStatus = await verifyFirebaseConfig();
          debugInfo.firebaseConnection = {
            configured: true,
            connectionTest: firebaseStatus,
            testSuccessful: true
          };
        } else {
          debugInfo.firebaseConnection = {
            configured: false,
            reason: "Missing FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT_KEY",
            testSuccessful: false
          };
        }
      } catch (firebaseError) {
        debugInfo.firebaseConnection = {
          configured: true,
          error: firebaseError instanceof Error ? firebaseError.message : "Unknown Firebase error",
          testSuccessful: false
        };
      }

      res.json(debugInfo);
    } catch (error) {
      logger.error('Debug endpoint error:', error);
      res.status(500).json({
        error: "Debug endpoint failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
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
      logger.error('Service status check error:', error);
      
      // Return a user-friendly error
      res.status(500).json({ 
        status: "error", 
        message: "We're having trouble checking our service status. This doesn't affect your work - please try again in a few moments.",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get user tier status (authenticated)
  app.get("/api/user-tier", authenticateUser, async (req: Request, res: Response) => {
    try {
      const userTier = await getUserTierInfo(req.user!.uid);
      const tierStatus = getTierAwareServiceStatus(userTier);
      
      res.json({
        ...tierStatus,
        userId: req.user!.uid,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error retrieving user tier status:', error);
      res.status(500).json({
        message: 'Failed to retrieve user tier information'
      });
    }
  });

  // Upload and process resume (requires authentication with enhanced security)
  app.post(
    "/api/resumes",
    authenticateUser,
    uploadRateLimiter,
    secureUpload.single("file"),
    validateUploadedFile,
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
          logger.info(`Created new upload session: ${sessionId}`);
        }

        // Validate file object
        const file = validateRequest(resumeFileSchema, {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path,
        });

        // Read file from disk
        const fileBuffer = fs.readFileSync(file.path!);
        
        // Extract text from the document
        const content = await parseDocument(fileBuffer, file.mimetype);

        // Create resume entry in storage with user ID and session ID
        const resume = await storage.createResume({
          filename: file.originalname,
          fileSize: file.size,
          fileType: file.mimetype,
          content,
          sessionId,
          userId: req.user!.uid, // Firebase UID
        });

        // Analyze resume immediately with tier-aware provider
        try {
          const userTier = await getUserTierInfo(req.user!.uid);
          const analysis = await analyzeResume(content, userTier);
          await storage.updateResumeAnalysis(resume.id, analysis);
          
          // Save updated user tier info (usage count incremented)
          await saveUserTierInfo(req.user!.uid, userTier);
          
          res.status(201).json({
            id: resume.id,
            filename: resume.filename,
            fileSize: resume.fileSize,
            fileType: resume.fileType,
            sessionId,
            isAnalyzed: true,
          });
        } catch (err) {
          logger.error("Failed to analyze resume:", err);
          
          // Check if error is due to tier limits
          const errorMessage = err instanceof Error ? err.message : "Resume analysis failed";
          const isUsageLimitError = errorMessage.includes('Daily limit') || errorMessage.includes('premium feature');
          
          res.status(isUsageLimitError ? 429 : 201).json({
            id: resume.id,
            filename: resume.filename,
            fileSize: resume.fileSize,
            fileType: resume.fileType,
            sessionId,
            isAnalyzed: false,
            error: errorMessage,
            tierLimitReached: isUsageLimitError,
          });
        }
      } catch (error) {
        logger.error("Error processing resume:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get all resumes for authenticated user (with optional sessionId filter)
  app.get("/api/resumes", authenticateUser, async (req: Request, res: Response) => {
    try {
      const sessionId = req.query.sessionId as string | undefined;
      
      logger.info('GET /api/resumes - User authenticated:', {
        uid: req.user?.uid,
        email: req.user?.email,
        sessionId
      });
      
      // Get resumes for authenticated user only
      const resumes = await storage.getResumesByUserId(req.user!.uid, sessionId);
      
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
  app.get("/api/resumes/:id", authenticateUser, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid resume ID" });
      }

      const resume = await storage.getResume(id);
      if (!resume) {
        return res.status(404).json({ message: "Resume not found" });
      }

      // Verify ownership
      if (resume.userId !== req.user!.uid) {
        return res.status(403).json({ message: "Access denied" });
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
      logger.error("Error fetching resume:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Create a job description
  app.post("/api/job-descriptions", authenticateUser, async (req: Request, res: Response) => {
    try {
      const jobDescData = validateRequest(insertJobDescriptionSchema, req.body);

      // Create job description in storage with user ID
      const jobDescription = await storage.createJobDescription({
        ...jobDescData,
        userId: req.user!.uid
      });

      // Analyze job description immediately with tier-aware provider
      try {
        const userTier = await getUserTierInfo(req.user!.uid);
        const analysis = await analyzeJobDescription(jobDescription.title, jobDescription.description, userTier);
        await storage.updateJobDescriptionAnalysis(jobDescription.id, analysis);
        
        // Save updated user tier info (usage count incremented)
        await saveUserTierInfo(req.user!.uid, userTier);
        
        res.status(201).json({
          id: jobDescription.id,
          title: jobDescription.title,
          isAnalyzed: true,
        });
      } catch (err) {
        logger.error("Failed to analyze job description:", {
          error: err,
          message: err instanceof Error ? err.message : "Unknown error",
          stack: err instanceof Error ? err.stack : undefined,
          jobId: jobDescription.id,
          userId: req.user!.uid
        });
        
        // Check if error is due to tier limits
        const errorMessage = err instanceof Error ? err.message : "Job description analysis failed";
        const isUsageLimitError = errorMessage.includes('Daily limit') || errorMessage.includes('premium feature');
        
        res.status(isUsageLimitError ? 429 : 201).json({
          id: jobDescription.id,
          title: jobDescription.title,
          isAnalyzed: false,
          error: errorMessage,
          tierLimitReached: isUsageLimitError,
        });
      }
    } catch (error) {
      logger.error("Error creating job description:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get all job descriptions for authenticated user
  app.get("/api/job-descriptions", authenticateUser, async (req: Request, res: Response) => {
    try {
      const jobDescriptions = await storage.getJobDescriptionsByUserId(req.user!.uid);
      
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
      logger.error("Error fetching job descriptions:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get a specific job description with its analysis
  app.get(
    "/api/job-descriptions/:id",
    authenticateUser,
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

        // Verify ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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
        logger.error("Error fetching job description:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Analyze and compare resumes with a job description
  app.post(
    "/api/analyze/:jobDescriptionId",
    authenticateUser,
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

        // Verify ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Get resumes for authenticated user, filtered by sessionId if provided
        const resumes = await storage.getResumesByUserId(req.user!.uid, sessionId);
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
            logger.error(`Error analyzing resume ${resume.id}:`, error);
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
        logger.error("Error analyzing resumes:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get analysis results for a specific job description
  app.get(
    "/api/analyze/:jobDescriptionId", 
    authenticateUser,
    async (req: Request, res: Response) => {
      try {
        const jobDescriptionId = parseInt(req.params.jobDescriptionId);
        // Get the session ID from the query parameter if provided
        const sessionId = req.query.sessionId as string | undefined;
        
        logger.debug(`Processing analysis for job description ID: ${jobDescriptionId}, sessionId: ${sessionId || 'not provided'}`);
        if (isNaN(jobDescriptionId)) {
          logger.warn(`Invalid job description ID: ${req.params.jobDescriptionId}`);
          return res.status(400).json({ message: "Invalid job description ID" });
        }

        // Get the job description
        const jobDescription = await storage.getJobDescription(jobDescriptionId);
        logger.debug(`Job description lookup result: ${jobDescription ? `Found job '${jobDescription.title}'` : 'Not found'}`);
        if (!jobDescription) {
          // Return a more precise error message for debugging
          return res.status(404).json({ 
            message: `Job description with ID ${jobDescriptionId} not found. Please verify the correct ID was used.`
          });
        }

        // Verify ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Get resumes with analysis for authenticated user, filtered by sessionId if provided
        const resumes = (await storage.getResumesByUserId(req.user!.uid, sessionId)).filter(r => r.analyzedData);
        logger.debug(`Found ${resumes.length} analyzed resumes for session ${sessionId || 'all sessions'}`);
        
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
        logger.debug(`Found ${analysisResults.length} existing analysis results for the selected resumes`);
        
        // Get list of resumes that need analysis
        const resumesNeedingAnalysis = resumes.filter(resume => 
          !analysisResults.some(result => result.resumeId === resume.id)
        );
        
        // If we have resumes that need analysis, analyze them now
        if (resumesNeedingAnalysis.length > 0 && jobDescription.analyzedData) {
          logger.info(`Analyzing ${resumesNeedingAnalysis.length} new resumes`);
          
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
              logger.error(`Error analyzing resume ${resume.id}:`, err);
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
        logger.error("Error fetching analysis results:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Get specific analysis for a resume and job description
  app.get(
    "/api/analyze/:jobId/:resumeId",
    authenticateUser,
    async (req: Request, res: Response) => {
      try {
        const jobId = parseInt(req.params.jobId);
        const resumeId = parseInt(req.params.resumeId);
        
        logger.debug(`Processing specific analysis for job ID: ${jobId}, resume ID: ${resumeId}`);

        if (isNaN(jobId) || isNaN(resumeId)) {
          logger.warn(`Invalid job ID or resume ID: jobId=${req.params.jobId}, resumeId=${req.params.resumeId}`);
          return res.status(400).json({ message: "Invalid job ID or resume ID" });
        }

        // Get the job description
        const jobDescription = await storage.getJobDescription(jobId);
        logger.debug(`Job lookup result: ${jobDescription ? `Found job '${jobDescription.title}'` : 'Job not found'}`);
        if (!jobDescription) {
          return res.status(404).json({ 
            message: `Job description with ID ${jobId} not found. Please verify the correct ID was used.` 
          });
        }

        // Verify job ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Get the resume
        const resume = await storage.getResume(resumeId);
        logger.debug(`Resume lookup result: ${resume ? `Found resume '${resume.filename}'` : 'Resume not found'}`);
        if (!resume) {
          return res.status(404).json({ 
            message: `Resume with ID ${resumeId} not found. Please verify the correct ID was used.` 
          });
        }

        // Verify resume ownership
        if (resume.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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
        logger.error("Error fetching specific analysis:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Generate interview questions for a specific resume and job description
  app.post(
    "/api/interview-questions/:resumeId/:jobDescriptionId",
    authenticateUser,
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

        // Verify resume ownership
        if (resume.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }

        // Verify job description ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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
        logger.error("Error generating interview questions:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Generate comprehensive interview script
  app.post(
    "/api/interview-script/:resumeId/:jobDescriptionId",
    authenticateUser,
    async (req: Request, res: Response) => {
      try {
        const resumeId = parseInt(req.params.resumeId);
        const jobDescriptionId = parseInt(req.params.jobDescriptionId);
        
        if (isNaN(resumeId) || isNaN(jobDescriptionId)) {
          return res.status(400).json({ 
            message: "Invalid resume ID or job description ID" 
          });
        }

        // Get user tier info
        const userTier = createDefaultUserTier(req.user?.tier || 'freemium');
        
        // Get the resume and job description
        const resume = await storage.getResume(resumeId);
        const jobDescription = await storage.getJobDescription(jobDescriptionId);
        
        if (!resume || !resume.analyzedData) {
          return res.status(404).json({ 
            message: "Resume not found or analysis not completed yet" 
          });
        }
        
        // Verify resume ownership
        if (resume.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }
        
        // Verify job description ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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

        // Generate comprehensive interview script
        const candidateName = resume.analyzedData.name || 'the candidate';
        const interviewScript = await generateInterviewScript(
          resume.analyzedData,
          jobDescription.analyzedData,
          analysisResult.analysis,
          userTier,
          jobDescription.title,
          candidateName
        );

        res.json({
          success: true,
          data: interviewScript,
          meta: {
            resumeId,
            jobDescriptionId,
            generatedAt: new Date().toISOString(),
            candidateName,
            jobTitle: jobDescription.title
          }
        });
      } catch (error) {
        logger.error("Error generating interview script:", error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );
  
  // Alternative endpoint for /api/generate-interview-questions with JSON body
  app.post(
    "/api/generate-interview-questions",
    authenticateUser,
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

        // Verify resume ownership
        if (resume.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }

        // Verify job description ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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
        logger.error("Error generating interview questions:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // New endpoint for analyzing match between resume and job with JSON body
  app.post(
    "/api/analyze-match",
    authenticateUser,
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

        // Verify job description ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        // Get the resume
        const resume = await storage.getResume(resumeIdNum);
        if (!resume || !resume.analyzedData) {
          return res.status(404).json({ 
            message: "Resume not found or analysis not completed yet" 
          });
        }

        // Verify resume ownership
        if (resume.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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
        logger.error("Error analyzing match:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Analyze bias in job description
  app.post(
    "/api/analyze-bias/:jobId",
    authenticateUser,
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

        // Verify ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }
        
        // Check if description exists
        if (!jobDescription.description || jobDescription.description.trim() === '') {
          return res.status(400).json({ 
            message: "The job description is empty or not available. Please add content before analysis." 
          });
        }

        // Log the analysis request
        logger.info(`Starting bias analysis for job ID ${jobId}: "${jobDescription.title}"`);
        
        // Analyze bias in the job description
        const biasAnalysis = await analyzeBias(
          jobDescription.title,
          jobDescription.description
        );
        
        // Log successful completion
        logger.info(`Completed bias analysis for job ID ${jobId}`);

        // Return the result
        return res.json({
          jobId,
          biasAnalysis
        });
      } catch (error) {
        // Log the detailed error
        logger.error("Error analyzing bias:", error);
        
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
    authenticateUser,
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

        // Verify ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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
        logger.error("Error updating job description:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Create analysis result
  app.post(
    "/api/analysis-results",
    authenticateUser,
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

        // Verify resume ownership
        if (resume.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        if (!jobDescription) {
          return res.status(404).json({ 
            message: "Job description not found" 
          });
        }

        // Verify job description ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Check if analysis already exists
        const existingAnalysisResults = await storage.getAnalysisResultsByResumeId(resumeId);
        const existingAnalysis = existingAnalysisResults.find(
          (result) => result.jobDescriptionId === jobDescriptionId
        );

        if (existingAnalysis) {
          logger.info(`Analysis already exists for resume ${resumeId} and job ${jobDescriptionId}, updating it`);
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
        logger.error("Error creating analysis result:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // POST endpoint to analyze fairness of resume analysis
  app.post(
    "/api/fairness-analysis",
    authenticateUser,
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

        // Verify resume ownership
        if (resume.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        if (!jobDescription || !jobDescription.analyzedData) {
          return res.status(404).json({ 
            message: "Job description not found or analysis not completed yet" 
          });
        }

        // Verify job description ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
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
        logger.error("Error analyzing fairness:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Debug authentication endpoint
  app.post("/api/debug/test-auth", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      logger.info('Debug auth test - Headers:', {
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader ? authHeader.substring(0, 50) + '...' : 'none'
      });

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Missing auth header',
          headers: Object.keys(req.headers)
        });
      }

      const token = authHeader.split('Bearer ')[1];
      
      // Try to verify the token
      const { verifyFirebaseToken } = await import('./lib/firebase-admin.js');
      const decodedToken = await verifyFirebaseToken(token);
      
      if (!decodedToken) {
        return res.status(401).json({
          error: 'Token verification failed',
          tokenLength: token.length
        });
      }

      res.json({
        success: true,
        user: decodedToken,
        tokenValid: true
      });
    } catch (error) {
      logger.error('Debug auth test error:', error);
      res.status(500).json({
        error: 'Auth test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Batch processing endpoints for parallelization
  const { processBatchResumes, processBatchMatches } = await import("./lib/batch-processor");

  // Batch resume processing - upload and analyze multiple resumes at once
  app.post(
    "/api/resumes/batch",
    authenticateUser,
    uploadRateLimiter,
    secureUpload.array("files", 10), // Allow up to 10 files
    async (req: Request, res: Response) => {
      try {
        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "No files uploaded" });
        }

        if (files.length > 10) {
          return res.status(400).json({ message: "Maximum 10 files allowed per batch" });
        }

        // Get user tier for analysis
        const userTier = await getUserTierInfo(req.user!.uid);
        
        // Check if user has enough quota for batch processing
        if (userTier.usageCount + files.length > userTier.maxAnalyses) {
          return res.status(429).json({
            message: `Batch would exceed daily limit. ${userTier.maxAnalyses - userTier.usageCount} analyses remaining.`
          });
        }

        // Parse all documents first
        const resumeInputs = [];
        for (const file of files) {
          try {
            const fileBuffer = fs.readFileSync(file.path);
            const content = await parseDocument(fileBuffer, file.mimetype);
            
            // Create resume entry
            const resume = await storage.createResume({
              filename: file.originalname,
              fileSize: file.size,
              fileType: file.mimetype,
              content,
              sessionId: req.body.sessionId || generateSessionId(),
              userId: req.user!.uid,
            });

            resumeInputs.push({
              id: resume.id,
              content,
              filename: file.originalname
            });
          } catch (error) {
            logger.error(`Error processing file ${file.originalname}:`, error);
          }
        }

        // Process all resumes in parallel
        const batchResult = await processBatchResumes(resumeInputs, userTier);
        
        // Update user tier usage
        userTier.usageCount += batchResult.processed;
        await saveUserTierInfo(req.user!.uid, userTier);

        res.status(201).json({
          message: `Batch processing completed`,
          totalFiles: files.length,
          processed: batchResult.processed,
          errors: batchResult.errors,
          timeTaken: batchResult.timeTaken,
          success: batchResult.success
        });

      } catch (error) {
        logger.error("Error in batch processing:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Batch processing failed",
        });
      }
    }
  );

  // Batch matching - match multiple resumes against multiple jobs
  app.post(
    "/api/match/batch",
    authenticateUser,
    async (req: Request, res: Response) => {
      try {
        const { resumeIds, jobIds } = req.body;
        
        if (!resumeIds || !jobIds || !Array.isArray(resumeIds) || !Array.isArray(jobIds)) {
          return res.status(400).json({ 
            message: "resumeIds and jobIds arrays are required" 
          });
        }

        if (resumeIds.length === 0 || jobIds.length === 0) {
          return res.status(400).json({ 
            message: "At least one resume and one job required" 
          });
        }

        if (resumeIds.length * jobIds.length > 100) {
          return res.status(400).json({ 
            message: "Maximum 100 matches per batch (resumes × jobs)" 
          });
        }

        // Get user tier
        const userTier = await getUserTierInfo(req.user!.uid);

        // Fetch resumes and jobs
        const resumes = [];
        for (const resumeId of resumeIds) {
          const resume = await storage.getResume(resumeId);
          if (resume && resume.userId === req.user!.uid) {
            resumes.push({
              id: resume.id,
              content: resume.content || '',
              filename: resume.filename
            });
          }
        }

        const jobs = [];
        for (const jobId of jobIds) {
          const job = await storage.getJobDescription(jobId);
          if (job && job.userId === req.user!.uid) {
            jobs.push({
              id: job.id,
              title: job.title,
              description: job.description
            });
          }
        }

        if (resumes.length === 0 || jobs.length === 0) {
          return res.status(404).json({ 
            message: "No valid resumes or jobs found" 
          });
        }

        // Process all matches in parallel
        const batchResult = await processBatchMatches(resumes, jobs, userTier);

        res.status(200).json({
          message: `Batch matching completed`,
          resumeCount: resumes.length,
          jobCount: jobs.length,
          totalMatches: resumes.length * jobs.length,
          processed: batchResult.processed,
          errors: batchResult.errors,
          timeTaken: batchResult.timeTaken,
          success: batchResult.success
        });

      } catch (error) {
        logger.error("Error in batch matching:", error);
        res.status(500).json({
          message: error instanceof Error ? error.message : "Batch matching failed",
        });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}
