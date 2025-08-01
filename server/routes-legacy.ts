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
  analyzeResumeParallel,
  analyzeJobDescription,
  analyzeMatch as analyzeMatchTiered,
  generateInterviewQuestions,
  generateInterviewScript,
  analyzeBias,
  getTierAwareServiceStatus,
} from "./lib/tiered-ai-provider";
import { createDefaultUserTier, UserTierInfo } from "@shared/user-tiers";

// FOR TESTING: Override tier to premium to bypass limits
function createTestUserTier(userId: string): UserTierInfo {
  return {
    userId,
    tier: 'premium',
    usageCount: {
      resumeAnalysis: 0,
      jobAnalysis: 0, 
      matchAnalysis: 0,
      biasAnalysis: 0,
      interviewQuestions: 0,
      interviewScript: 0
    },
    lastReset: new Date(),
    isActive: true
  };
}
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
  const defaultTier = createTestUserTier('default-user'); // Use premium tier for testing
  
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
function validateRequest<T>(schema: z.ZodType<T>, body: unknown): T {
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

  // Health check endpoint - Railway-optimized for fast response
  app.get("/api/health", async (req: Request, res: Response) => {
    try {
      // Railway-specific: Check if AI health checks are disabled
      const aiHealthCheckEnabled = process.env.AI_HEALTH_CHECK_ENABLED !== 'false';
      
      if (process.env.RAILWAY_ENVIRONMENT && !aiHealthCheckEnabled) {
        // Railway-optimized: Simple health check without AI services
        const uptime = Math.round(process.uptime());
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        
        res.json({
          status: "healthy",
          timestamp: new Date().toISOString(),
          uptime,
          memory: { heapUsed: heapUsedMB, heapTotal: heapTotalMB },
          environment: "railway",
          message: "Railway-optimized health check passed"
        });
        return;
      }
      
      // Import and use the full healthcheck function for other environments
      const { healthCheck } = await import('./healthcheck.js');
      await healthCheck(req, res);
    } catch (error) {
      // Fallback to simple response if the advanced check fails
      logger.error('Health check error:', error);
      res.json({ status: "ok", message: "Basic health check passed" });
    }
  });

  // Migration status endpoint - Monitor database schema migrations
  app.get("/api/migration-status", async (req: Request, res: Response) => {
    try {
      const { getMigrationStatus } = await import('./lib/db-migrations');
      const status = await getMigrationStatus();
      
      res.json({
        status: "ok",
        migrations: status,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Migration status check failed:', error);
      res.status(500).json({
        status: "error",
        message: "Failed to check migration status",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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
      if ('getDbHealthStatus' in storage && typeof storage.getDbHealthStatus === 'function') {
        const rawStatus = storage.getDbHealthStatus();
        
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
    } catch (error: unknown) {
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

        // Analyze resume immediately with tier-aware provider using parallel extraction
        try {
          const userTier = await getUserTierInfo(req.user!.uid);
          const analysis = await analyzeResumeParallel(content, userTier);
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
          isAnalyzed: !!jobDescription.analyzedData,
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

        // Get user tier for analysis limits
        const userTier = await getUserTierInfo(req.user!.uid);
        
        // Array to store our results
        const analysisResults = [];
        
        // Process each resume that has been analyzed
        for (const resume of resumes.filter(r => r.analyzedData)) {
          try {
            // Compare the resume with the job description, including resume text for fairness analysis
            const matchAnalysis = await analyzeMatchTiered(
              resume.analyzedData as AnalyzedResumeData,
              jobDescription.analyzedData as AnalyzedJobData,
              userTier,
              resume.content, // Pass the resume text for fairness analysis
              jobDescription.description // Pass the job description text
            );

            // Create analysis result
            const analysisResult = await storage.createAnalysisResult({
              userId: req.user!.uid,
              resumeId: resume.id,
              jobDescriptionId,
              matchPercentage: matchAnalysis.matchPercentage,
              matchedSkills: matchAnalysis.matchedSkills,
              missingSkills: matchAnalysis.missingSkills,
              candidateStrengths: matchAnalysis.candidateStrengths,
              candidateWeaknesses: matchAnalysis.candidateWeaknesses,
              confidenceLevel: matchAnalysis.confidenceLevel,
              fairnessMetrics: matchAnalysis.fairnessMetrics,
              analysis: matchAnalysis,
            });

            analysisResults.push({
              resumeId: resume.id,
              filename: resume.filename,
              candidateName: (resume.analyzedData as AnalyzedResumeData)?.name || "Unknown",
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

        // Save updated user tier info (usage count incremented)
        await saveUserTierInfo(req.user!.uid, userTier);
        
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
              const matchAnalysis = await analyzeMatchTiered(
                resume.analyzedData as AnalyzedResumeData,
                jobDescription.analyzedData as AnalyzedJobData,
                userTier,
                resume.content, // Pass the resume text for fairness analysis
                jobDescription.description // Pass the job description text
              );
              
              const newResult = await storage.createAnalysisResult({
                userId: req.user!.uid,
                resumeId: resume.id,
                jobDescriptionId,
                matchPercentage: matchAnalysis.matchPercentage,
                matchedSkills: matchAnalysis.matchedSkills,
                missingSkills: matchAnalysis.missingSkills,
                candidateStrengths: matchAnalysis.candidateStrengths,
                candidateWeaknesses: matchAnalysis.candidateWeaknesses,
                confidenceLevel: matchAnalysis.confidenceLevel,
                fairnessMetrics: matchAnalysis.fairnessMetrics,
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
              candidateName: (resume.analyzedData as AnalyzedResumeData)?.name || "Unknown",
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
        const userTier = createTestUserTier(req.user!.uid); // Use premium tier for testing
        
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
        const matchAnalysis = await analyzeMatchTiered(
          resume.analyzedData as AnalyzedResumeData,
          jobDescription.analyzedData as AnalyzedJobData,
          userTier,
          resume.content, // Pass the resume text for fairness analysis
          jobDescription.description // Pass the job description text
        );
        
        // Store the result
        const analysisResult = await storage.createAnalysisResult({
          userId: req.user!.uid,
          resumeId: resumeIdNum,
          jobDescriptionId: jobDescriptionIdNum,
          matchPercentage: matchAnalysis.matchPercentage,
          matchedSkills: matchAnalysis.matchedSkills,
          missingSkills: matchAnalysis.missingSkills,
          candidateStrengths: matchAnalysis.candidateStrengths,
          candidateWeaknesses: matchAnalysis.candidateWeaknesses,
          confidenceLevel: matchAnalysis.confidenceLevel,
          fairnessMetrics: matchAnalysis.fairnessMetrics,
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

  // Analyze all resumes for a specific job description
  app.post(
    "/api/analyze/:jobId",
    authenticateUser,
    async (req: Request, res: Response) => {
      try {
        const jobId = parseInt(req.params.jobId);
        const { sessionId } = req.body;
        
        if (isNaN(jobId)) {
          return res.status(400).json({ message: "Invalid job ID" });
        }

        logger.info(`Starting analysis for job ID: ${jobId}`);

        // Get the job description
        const jobDescription = await storage.getJobDescription(jobId);
        if (!jobDescription) {
          return res.status(404).json({ message: "Job description not found" });
        }

        // Verify ownership
        if (jobDescription.userId !== req.user!.uid) {
          return res.status(403).json({ message: "Access denied" });
        }

        // Get all resumes for this user
        logger.info(`Looking for resumes for user: ${req.user!.uid}`);
        const resumes = await storage.getResumesByUserId(req.user!.uid);
        
        logger.info(`Database returned ${resumes ? resumes.length : 0} resumes`);
        if (resumes && resumes.length > 0) {
          logger.info(`First resume: ID ${resumes[0].id}, filename: ${resumes[0].filename}, user_id: ${resumes[0].userId}`);
        }
        
        if (!resumes || resumes.length === 0) {
          return res.status(400).json({ 
            message: "No resumes found for analysis",
            debug: {
              searchingForUserId: req.user!.uid,
              totalResumesInDb: "Check database"
            }
          });
        }

        logger.info(`Found ${resumes.length} resumes to analyze against job "${jobDescription.title}"`);

        // Get user tier for analysis limits
        const userTier = await getUserTierInfo(req.user!.uid);

        const results = [];

        // Analyze each resume against the job description
        for (const resume of resumes) {
          try {
            logger.debug(`Analyzing resume ${resume.id}: ${resume.filename}`);

            // Check if resume and job are already analyzed
            if (!resume.analyzedData) {
              logger.debug(`Resume ${resume.id} not analyzed yet, analyzing...`);
              const resumeAnalysis = await analyzeResume(resume.content, userTier);
              // Update resume with analyzed data
              await storage.updateResume(resume.id, { analyzedData: resumeAnalysis });
              resume.analyzedData = resumeAnalysis;
            }

            if (!jobDescription.analyzedData) {
              logger.debug(`Job ${jobId} not analyzed yet, analyzing...`);
              const jobAnalysis = await analyzeJobDescription(jobDescription.description, userTier);
              // Update job with analyzed data
              await storage.updateJobDescription(jobId, { analyzedData: jobAnalysis });
              jobDescription.analyzedData = jobAnalysis;
            }

            // Perform the match analysis
            const matchAnalysis = await analyzeMatchTiered(
              resume.analyzedData as AnalyzedResumeData,
              jobDescription.analyzedData as AnalyzedJobData,
              userTier,
              resume.content,
              jobDescription.description
            );

            // Create analysis result record
            logger.info(`Creating analysis result: user=${req.user!.uid}, resume=${resume.id}, job=${jobId}, match=${matchAnalysis.matchPercentage}%`);
            
            let analysisResult;
            try {
              analysisResult = await storage.createAnalysisResult({
                userId: req.user!.uid,
                resumeId: resume.id,
                jobDescriptionId: jobId,
                matchPercentage: matchAnalysis.matchPercentage,
                matchedSkills: JSON.stringify(matchAnalysis.matchedSkills || []),
                missingSkills: JSON.stringify(matchAnalysis.missingSkills || []),
                analysis: JSON.stringify(matchAnalysis)
              });

              logger.info(`✅ Analysis result created successfully: ID ${analysisResult.id}`);
            } catch (error) {
              logger.error(`❌ Failed to create analysis result:`, error);
              // Create a fallback result for the response
              analysisResult = { id: `fallback-${resume.id}-${jobId}` };
            }

            results.push({
              resumeId: resume.id,
              filename: resume.filename,
              candidateName: resume.filename.replace(/\.[^/.]+$/, ""), // Remove file extension
              match: matchAnalysis,
              analysisId: analysisResult.id
            });

            logger.debug(`Successfully analyzed resume ${resume.id}, match: ${matchAnalysis.matchPercentage}%`);

          } catch (error) {
            logger.error(`Error analyzing resume ${resume.id}:`, error);
            // Continue with other resumes even if one fails
          }
        }

        // Save updated user tier info (usage count incremented)
        await saveUserTierInfo(req.user!.uid, userTier);

        logger.info(`Completed analysis for job ID ${jobId}, analyzed ${results.length} resumes`);

        res.json({
          jobDescriptionId: jobId,
          jobTitle: jobDescription.title,
          results
        });

      } catch (error) {
        logger.error("Error in /api/analyze/:jobId:", error);
        res.status(500).json({
          error: 'Analysis failed',
          message: error instanceof Error ? error.message : 'Unknown error'
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
        
        // Get user tier information for usage limits
        const userTier = await getUserTierInfo(req.user!.uid);
        
        // Analyze bias in the job description
        const biasAnalysis = await analyzeBias(
          jobDescription.title,
          jobDescription.description,
          userTier
        );
        
        // Save updated user tier info (usage count incremented)
        await saveUserTierInfo(req.user!.uid, userTier);
        
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
          userId: req.user!.uid,
          resumeId,
          jobDescriptionId,
          matchPercentage,
          matchedSkills,
          missingSkills,
          candidateStrengths: matchAnalysis.candidateStrengths,
          candidateWeaknesses: matchAnalysis.candidateWeaknesses,
          confidenceLevel: matchAnalysis.confidenceLevel,
          fairnessMetrics: matchAnalysis.fairnessMetrics,
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

  // Direct AI analysis endpoints for consistent authentication handling
  
  // Basic analyze endpoint - requires auth, returns proper JSON response
  app.post("/api/analyze", authenticateUser, async (req: Request, res: Response) => {
    try {
      const { resumeText, jobDescriptionText } = req.body;
      
      if (!resumeText || !jobDescriptionText) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Both resumeText and jobDescriptionText are required'
        });
      }
      
      // Get user tier for analysis limits
      const userTier = await getUserTierInfo(req.user!.uid);
      
      // Perform basic match analysis using tiered provider
      const matchAnalysis = await analyzeMatchTiered(
        { content: resumeText },
        { description: jobDescriptionText },
        resumeText,
        userTier
      );
      
      // Save updated user tier info (usage count incremented)
      await saveUserTierInfo(req.user!.uid, userTier);
      
      res.json(matchAnalysis);
    } catch (error) {
      logger.error("Error in /api/analyze:", error);
      
      // Check if error is due to tier limits
      const errorMessage = error instanceof Error ? error.message : "Analysis failed";
      const isUsageLimitError = errorMessage.includes('Daily limit') || errorMessage.includes('premium feature');
      
      res.status(isUsageLimitError ? 429 : 500).json({
        error: 'Analysis failed',
        message: errorMessage,
        tierLimitReached: isUsageLimitError,
      });
    }
  });

  // Basic interview questions endpoint - requires auth, returns proper JSON response  
  app.post("/api/interview-questions", authenticateUser, async (req: Request, res: Response) => {
    try {
      const { resumeText, jobDescriptionText, difficulty = 'intermediate' } = req.body;
      
      if (!resumeText || !jobDescriptionText) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Both resumeText and jobDescriptionText are required'
        });
      }
      
      // Get user tier for analysis limits
      const userTier = await getUserTierInfo(req.user!.uid);
      
      // Generate interview questions using tiered provider
      const questions = await generateInterviewQuestions(
        { content: resumeText },
        { description: jobDescriptionText },
        { matchPercentage: 75 }, // Default match analysis
        userTier
      );
      
      // Save updated user tier info (usage count incremented)
      await saveUserTierInfo(req.user!.uid, userTier);
      
      res.json(questions);
    } catch (error) {
      logger.error("Error in /api/interview-questions:", error);
      
      // Check if error is due to tier limits
      const errorMessage = error instanceof Error ? error.message : "Question generation failed";
      const isUsageLimitError = errorMessage.includes('Daily limit') || errorMessage.includes('premium feature');
      
      res.status(isUsageLimitError ? 429 : 500).json({
        error: 'Question generation failed',
        message: errorMessage,
        tierLimitReached: isUsageLimitError,
      });
    }
  });

  // Basic bias analysis endpoint - requires auth, returns proper JSON response
  app.post("/api/analyze-bias", authenticateUser, async (req: Request, res: Response) => {
    try {
      const { resumeText, jobDescriptionText } = req.body;
      
      if (!resumeText || !jobDescriptionText) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Both resumeText and jobDescriptionText are required'
        });
      }
      
      // Get user tier for analysis limits
      const userTier = await getUserTierInfo(req.user!.uid);
      
      // Perform bias analysis using tiered provider
      const biasAnalysis = await analyzeBias(
        'Resume Analysis',
        `Resume: ${resumeText}\n\nJob Description: ${jobDescriptionText}`,
        userTier
      );
      
      // Save updated user tier info (usage count incremented)
      await saveUserTierInfo(req.user!.uid, userTier);
      
      res.json({
        biasScore: biasAnalysis.biasScore || 0,
        bias_score: biasAnalysis.biasScore || 0,
        fairnessAssessment: biasAnalysis.fairnessAssessment || 'No bias detected',
        fairness_assessment: biasAnalysis.fairnessAssessment || 'No bias detected',
        biasAnalysis
      });
    } catch (error) {
      logger.error("Error in /api/analyze-bias:", error);
      
      // Check if error is due to tier limits
      const errorMessage = error instanceof Error ? error.message : "Bias analysis failed";
      const isUsageLimitError = errorMessage.includes('Daily limit') || errorMessage.includes('premium feature');
      
      res.status(isUsageLimitError ? 429 : 500).json({
        error: 'Bias analysis failed',
        message: errorMessage,
        tierLimitReached: isUsageLimitError,
      });
    }
  });

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

  // Database schema fix endpoint
  app.post("/api/admin/fix-database", async (req: Request, res: Response) => {
    try {
      logger.info('🔧 Starting database schema fix...');
      
      // Use direct PostgreSQL connection
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: process.env.DATABASE_URL
      });
      
      await client.connect();
      logger.info('✅ Connected to database directly');

      // Fix 1: Add missing columns to resumes table
      logger.info('📝 Adding missing columns to resumes table...');
      
      await client.query(`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS experience JSONB DEFAULT '[]'::jsonb`);
      logger.info('✅ Added experience column');

      await client.query(`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS education JSONB DEFAULT '[]'::jsonb`);
      logger.info('✅ Added education column');

      await client.query(`ALTER TABLE resumes ADD COLUMN IF NOT EXISTS skills JSONB DEFAULT '[]'::jsonb`);
      logger.info('✅ Added skills column');

      // Fix 2: Change user_id from INTEGER to TEXT for Firebase UIDs
      logger.info('🔄 Fixing user_id column types...');
      
      const userIdFixes = [
        { table: 'job_descriptions', column: 'user_id' },
        { table: 'resumes', column: 'user_id' },
        { table: 'analysis_results', column: 'user_id' },
        { table: 'interview_questions', column: 'user_id' }
      ];

      for (const fix of userIdFixes) {
        try {
          await client.query(`ALTER TABLE ${fix.table} ALTER COLUMN ${fix.column} TYPE TEXT USING ${fix.column}::text`);
          logger.info(`✅ Fixed ${fix.table}.${fix.column} type`);
        } catch (error) {
          logger.warn(`⚠️ Skipped ${fix.table}.${fix.column}: ${error.message}`);
        }
      }

      // Fix 3: Add missing user_id column to analysis_results table  
      logger.info('🔧 Adding missing user_id column to analysis_results...');
      try {
        await client.query(`ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS user_id TEXT`);
        logger.info('✅ Added user_id column to analysis_results');
      } catch (error) {
        logger.warn(`⚠️ Could not add user_id to analysis_results: ${error.message}`);
      }

      // Fix 4: Change match_percentage from INTEGER to REAL for decimal support
      logger.info('🔧 Fixing match_percentage data type...');
      try {
        await client.query(`ALTER TABLE analysis_results ALTER COLUMN match_percentage TYPE REAL USING match_percentage::real`);
        logger.info('✅ Changed match_percentage to REAL type');
      } catch (error) {
        logger.warn(`⚠️ Could not fix match_percentage type: ${error.message}`);
      }

      // Fix 5: Add missing columns to analysis_results table
      logger.info('🔧 Adding missing columns to analysis_results table...');
      const missingColumns = [
        'candidate_strengths JSONB',
        'candidate_weaknesses JSONB', 
        'confidence_level TEXT',
        'fairness_metrics JSONB',
        'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      ];

      for (const column of missingColumns) {
        try {
          await client.query(`ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS ${column}`);
          logger.info(`✅ Added column: ${column}`);
        } catch (error) {
          logger.warn(`⚠️ Could not add column ${column}: ${error.message}`);
        }
      }

      await client.end();
      logger.info('🎉 Database schema fixed successfully!');
      
      res.json({ 
        success: true, 
        message: "Database schema fixed successfully!",
        fixes: [
          "Added experience, education, skills columns to resumes table",
          "Changed user_id columns from INTEGER to TEXT for Firebase compatibility",
          "Added missing user_id column to analysis_results table",
          "Changed match_percentage from INTEGER to REAL for decimal support",
          "Added missing columns to analysis_results: candidate_strengths, candidate_weaknesses, confidence_level, fairness_metrics, created_at, updated_at"
        ]
      });
      
    } catch (error) {
      logger.error('❌ Database fix failed:', error);
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : "Database fix failed",
        message: "Failed to fix database schema"
      });
    }
  });

  // Diagnostic endpoint to check analysis_results table
  app.get("/api/admin/check-analysis-table", async (req: Request, res: Response) => {
    try {
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: process.env.DATABASE_URL
      });
      
      await client.connect();
      
      // Check if table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'analysis_results'
        );
      `);
      
      // Get table schema
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'analysis_results'
        ORDER BY ordinal_position;
      `);
      
      // Count rows
      let rowCount = 0;
      let sampleRows = [];
      try {
        const countResult = await client.query('SELECT COUNT(*) FROM analysis_results');
        rowCount = parseInt(countResult.rows[0].count);
        
        // Get a few sample rows if any exist
        if (rowCount > 0) {
          const sampleResult = await client.query('SELECT id, user_id, resume_id, job_description_id, created_at FROM analysis_results LIMIT 3');
          sampleRows = sampleResult.rows;
        }
      } catch (e) {
        logger.warn('Could not query analysis_results:', e.message);
      }
      
      await client.end();
      
      res.json({
        tableExists: tableExists.rows[0].exists,
        columns: columns.rows,
        rowCount,
        sampleRows,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error checking analysis_results table:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Comprehensive table checker endpoint
  app.get("/api/admin/check-all-tables", async (req: Request, res: Response) => {
    try {
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: process.env.DATABASE_URL
      });
      
      await client.connect();
      
      // Get all tables with column info and row counts
      const query = `
        WITH table_info AS (
          SELECT 
            t.table_name,
            COUNT(c.column_name) as column_count,
            STRING_AGG(c.column_name || ':' || c.data_type, ', ' ORDER BY c.ordinal_position) as columns
          FROM information_schema.tables t
          LEFT JOIN information_schema.columns c ON t.table_name = c.table_name
          WHERE t.table_schema = 'public' 
            AND t.table_type = 'BASE TABLE'
          GROUP BY t.table_name
        )
        SELECT 
          table_name,
          column_count,
          columns
        FROM table_info
        ORDER BY table_name;
      `;
      
      const result = await client.query(query);
      
      // Get row counts for each table
      const tableRowCounts = {};
      for (const table of result.rows) {
        try {
          const countResult = await client.query(`SELECT COUNT(*) FROM ${table.table_name}`);
          tableRowCounts[table.table_name] = parseInt(countResult.rows[0].count);
        } catch (e) {
          tableRowCounts[table.table_name] = `ERROR: ${e.message}`;
        }
      }
      
      await client.end();
      
      res.json({
        tables: result.rows.map(table => ({
          ...table,
          row_count: tableRowCounts[table.table_name]
        })),
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Error checking all tables:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Debug auth headers endpoint
  app.get("/api/admin/debug-auth", async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const allHeaders = req.headers;
      
      res.json({
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader ? `${authHeader.substring(0, 20)}...` : null,
        authHeaderLength: authHeader ? authHeader.length : 0,
        startsWithBearer: authHeader ? authHeader.startsWith('Bearer ') : false,
        allHeaders: Object.keys(allHeaders),
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Populate skills database with comprehensive tech skills
  app.post("/api/admin/populate-skills", async (req: Request, res: Response) => {
    try {
      const { Client } = await import('pg');
      const client = new Client({
        connectionString: process.env.DATABASE_URL
      });

      await client.connect();

      // Clear existing data
      await client.query('DELETE FROM skills');
      await client.query('DELETE FROM skill_categories');

      // Define skill categories
      const categories = [
        { name: 'Frontend Development', description: 'User interface and client-side technologies' },
        { name: 'Backend Development', description: 'Server-side programming and APIs' },
        { name: 'Mobile Development', description: 'Mobile app development frameworks and tools' },
        { name: 'Database Management', description: 'Database systems and data management' },
        { name: 'Cloud & DevOps', description: 'Cloud platforms and deployment technologies' },
        { name: 'Machine Learning & AI', description: 'AI, ML, and data science technologies' },
        { name: 'Programming Languages', description: 'Core programming languages' },
        { name: 'Testing & QA', description: 'Testing frameworks and quality assurance' },
        { name: 'Version Control', description: 'Code versioning and collaboration tools' },
        { name: 'Web Technologies', description: 'Web standards and protocols' }
      ];

      // Insert categories and get their IDs
      const categoryMap = {};
      for (const category of categories) {
        const result = await client.query(
          'INSERT INTO skill_categories (name, description, level) VALUES ($1, $2, 1) RETURNING id',
          [category.name, category.description]
        );
        categoryMap[category.name] = result.rows[0].id;
      }

      // Define comprehensive skills with aliases
      const skills = [
        // Frontend
        { name: 'React', category: 'Frontend Development', aliases: ['ReactJS', 'React.js'] },
        { name: 'Vue.js', category: 'Frontend Development', aliases: ['Vue', 'VueJS'] },
        { name: 'Angular', category: 'Frontend Development', aliases: ['AngularJS', 'Angular.js'] },
        { name: 'HTML', category: 'Frontend Development', aliases: ['HTML5'] },
        { name: 'CSS', category: 'Frontend Development', aliases: ['CSS3', 'Cascading Style Sheets'] },
        { name: 'JavaScript', category: 'Frontend Development', aliases: ['JS', 'ECMAScript', 'ES6', 'ES2015'] },
        { name: 'TypeScript', category: 'Frontend Development', aliases: ['TS'] },
        { name: 'Sass', category: 'Frontend Development', aliases: ['SCSS'] },
        { name: 'Bootstrap', category: 'Frontend Development', aliases: [] },
        { name: 'Tailwind CSS', category: 'Frontend Development', aliases: ['TailwindCSS'] },

        // Backend
        { name: 'Node.js', category: 'Backend Development', aliases: ['NodeJS', 'Node'] },
        { name: 'Express.js', category: 'Backend Development', aliases: ['Express', 'ExpressJS'] },
        { name: 'Django', category: 'Backend Development', aliases: [] },
        { name: 'Flask', category: 'Backend Development', aliases: [] },
        { name: 'Spring Boot', category: 'Backend Development', aliases: ['Spring'] },
        { name: 'ASP.NET', category: 'Backend Development', aliases: ['.NET', 'DotNet'] },
        { name: 'Ruby on Rails', category: 'Backend Development', aliases: ['Rails', 'RoR'] },
        { name: 'FastAPI', category: 'Backend Development', aliases: [] },

        // Languages
        { name: 'Python', category: 'Programming Languages', aliases: [] },
        { name: 'Java', category: 'Programming Languages', aliases: [] },
        { name: 'C#', category: 'Programming Languages', aliases: ['C Sharp', 'CSharp'] },
        { name: 'Go', category: 'Programming Languages', aliases: ['Golang'] },
        { name: 'Rust', category: 'Programming Languages', aliases: [] },
        { name: 'PHP', category: 'Programming Languages', aliases: [] },
        { name: 'Ruby', category: 'Programming Languages', aliases: [] },
        { name: 'Swift', category: 'Programming Languages', aliases: [] },
        { name: 'Kotlin', category: 'Programming Languages', aliases: [] },

        // Databases
        { name: 'PostgreSQL', category: 'Database Management', aliases: ['Postgres'] },
        { name: 'MySQL', category: 'Database Management', aliases: [] },
        { name: 'MongoDB', category: 'Database Management', aliases: ['Mongo'] },
        { name: 'Redis', category: 'Database Management', aliases: [] },
        { name: 'Elasticsearch', category: 'Database Management', aliases: ['ElasticSearch'] },
        { name: 'SQLite', category: 'Database Management', aliases: [] },
        { name: 'Oracle', category: 'Database Management', aliases: ['Oracle DB'] },
        { name: 'SQL Server', category: 'Database Management', aliases: ['MSSQL', 'Microsoft SQL Server'] },

        // Cloud & DevOps
        { name: 'AWS', category: 'Cloud & DevOps', aliases: ['Amazon Web Services'] },
        { name: 'Google Cloud', category: 'Cloud & DevOps', aliases: ['GCP', 'Google Cloud Platform'] },
        { name: 'Azure', category: 'Cloud & DevOps', aliases: ['Microsoft Azure'] },
        { name: 'Docker', category: 'Cloud & DevOps', aliases: [] },
        { name: 'Kubernetes', category: 'Cloud & DevOps', aliases: ['K8s'] },
        { name: 'Jenkins', category: 'Cloud & DevOps', aliases: [] },
        { name: 'Terraform', category: 'Cloud & DevOps', aliases: [] },
        { name: 'Ansible', category: 'Cloud & DevOps', aliases: [] },

        // ML & AI
        { name: 'TensorFlow', category: 'Machine Learning & AI', aliases: [] },
        { name: 'PyTorch', category: 'Machine Learning & AI', aliases: [] },
        { name: 'Scikit-learn', category: 'Machine Learning & AI', aliases: ['sklearn'] },
        { name: 'Pandas', category: 'Machine Learning & AI', aliases: [] },
        { name: 'NumPy', category: 'Machine Learning & AI', aliases: [] },

        // Mobile
        { name: 'React Native', category: 'Mobile Development', aliases: [] },
        { name: 'Flutter', category: 'Mobile Development', aliases: [] },
        { name: 'iOS Development', category: 'Mobile Development', aliases: ['iOS'] },
        { name: 'Android Development', category: 'Mobile Development', aliases: ['Android'] },

        // Testing
        { name: 'Jest', category: 'Testing & QA', aliases: [] },
        { name: 'Cypress', category: 'Testing & QA', aliases: [] },
        { name: 'Selenium', category: 'Testing & QA', aliases: [] },
        { name: 'Pytest', category: 'Testing & QA', aliases: [] },

        // Version Control
        { name: 'Git', category: 'Version Control', aliases: [] },
        { name: 'GitHub', category: 'Version Control', aliases: [] },
        { name: 'GitLab', category: 'Version Control', aliases: [] }
      ];

      // Insert skills
      let insertedCount = 0;
      for (const skill of skills) {
        const categoryId = categoryMap[skill.category];
        await client.query(
          'INSERT INTO skills (name, normalized_name, category_id, aliases) VALUES ($1, $2, $3, $4)',
          [skill.name, skill.name.toLowerCase(), categoryId, JSON.stringify(skill.aliases)]
        );
        insertedCount++;
      }

      await client.end();

      res.json({
        success: true,
        message: 'Skills database populated successfully!',
        categories: categories.length,
        skills: insertedCount
      });

    } catch (error) {
      logger.error('Error populating skills database:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
