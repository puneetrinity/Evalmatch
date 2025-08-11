/**
 * Admin Routes
 * Handles administrative operations, database fixes, and system management
 */

import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";
import { createAdminService } from "../services/admin-service";
import { handleRouteResult } from "../lib/route-error-handler";

const router = Router();

// Rate limiting storage for admin attempts (in-memory for simplicity)
const adminAttempts = new Map<string, { count: number; resetTime: number; blocked: boolean }>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of adminAttempts.entries()) {
    if (now > data.resetTime) {
      adminAttempts.delete(key);
    }
  }
}, 60000); // Cleanup every minute

// ENHANCED: Timing-safe admin authentication with rate limiting
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const clientKey = req.ip || 'unknown';
  const now = Date.now();
  
  // Initialize or get client attempt data
  let clientData = adminAttempts.get(clientKey);
  if (!clientData || now > clientData.resetTime) {
    clientData = { count: 0, resetTime: now + 900000, blocked: false }; // 15 minutes window
    adminAttempts.set(clientKey, clientData);
  }
  
  // Check if client is blocked
  if (clientData.blocked) {
    logger.warn('🚨 Blocked admin access attempt from rate-limited IP', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      attempts: clientData.count,
      timeRemaining: Math.ceil((clientData.resetTime - now) / 1000)
    });
    
    return res.status(429).json({
      error: 'Too Many Requests',
      message: `Too many failed admin attempts. Try again in ${Math.ceil((clientData.resetTime - now) / 60000)} minutes.`,
      code: 'ADMIN_RATE_LIMITED',
      retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
    });
  }
  
  const adminToken = req.headers['x-admin-token'] as string;
  const expectedToken = process.env.ADMIN_API_TOKEN;
  
  if (!expectedToken) {
    logger.error('🔒 Admin routes disabled - ADMIN_API_TOKEN not configured', {
      ip: req.ip,
      path: req.path
    });
    
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Admin functionality is disabled',
      code: 'ADMIN_DISABLED'
    });
  }
  
  // SECURITY: Timing-safe token comparison to prevent timing attacks
  const isValidToken = adminToken && 
    adminToken.length === expectedToken.length &&
    crypto.timingSafeEqual(
      Buffer.from(adminToken, 'utf8'),
      Buffer.from(expectedToken, 'utf8')
    );
  
  if (!isValidToken) {
    // Increment failed attempts
    clientData.count++;
    
    // Block after 3 failed attempts
    if (clientData.count >= 3) {
      clientData.blocked = true;
      logger.error('🚨 SECURITY ALERT: Admin IP blocked after multiple failed attempts', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        path: req.path,
        attempts: clientData.count,
        timestamp: new Date().toISOString(),
        severity: 'HIGH'
      });
      
      return res.status(429).json({
        error: 'Access Blocked',
        message: 'Too many failed authentication attempts. Access blocked for 15 minutes.',
        code: 'ADMIN_BLOCKED'
      });
    }
    
    logger.warn('🛡️ Unauthorized admin access attempt', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method,
      attempts: clientData.count,
      hasToken: !!adminToken,
      tokenLength: adminToken?.length || 0,
      timestamp: new Date().toISOString()
    });
    
    // Add artificial delay to slow down brute force attacks
    await new Promise(resolve => setTimeout(resolve, Math.min(1000 * clientData.count, 5000)));
    
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid admin credentials',
      code: 'ADMIN_AUTH_FAILED',
      attemptsRemaining: 3 - clientData.count
    });
  }
  
  // SECURITY: Log successful admin access for audit trail
  logger.info('✅ Admin access granted', { 
    path: req.path, 
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    eventType: 'ADMIN_ACCESS_GRANTED'
  });
  
  // Reset failed attempts on successful authentication
  adminAttempts.delete(clientKey);
  
  next();
};

// Database fix endpoint - Emergency database repairs
router.post(
  "/fix-database",
  requireAdmin,
  async (req: Request, res: Response) => {
    logger.info("Admin database fix requested", { 
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    const adminService = createAdminService();
    const result = await adminService.fixDatabase();

    handleRouteResult(result, res, (data) => {
      res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    });
  },
);

// System status endpoint - Overall system health check
router.get(
  "/system-status",
  requireAdmin,
  async (req: Request, res: Response) => {
    logger.info("Admin system status requested", { 
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    const adminService = createAdminService();
    const result = await adminService.getSystemStatus();

    handleRouteResult(result, res, (data) => {
      res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    });
  },
);

router.get(
  "/check-analysis-table",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { getDatabase } = await import("../database");
      const db = getDatabase();
      const { sql } = await import("drizzle-orm");

      // Get table structure
      const tableInfo = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'analysis_results'
      ORDER BY ordinal_position
    `);

      // Get row count
      const countResult = await db.execute(
        sql`SELECT COUNT(*) as count FROM analysis_results`,
      );
      const rowCount =
        Array.isArray(countResult) && countResult[0]
          ? (countResult[0] as Record<string, unknown>).count
          : 0;

      // Sample data
      const sampleData = await db.execute(sql`
      SELECT id, user_id, resume_id, job_description_id, match_percentage, created_at
      FROM analysis_results 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

      res.json({
        status: "ok",
        tableName: "analysis_results",
        columns: tableInfo,
        rowCount: parseInt(String(rowCount)) || 0,
        sampleData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Analysis table check failed:", error);
      res.status(500).json({
        error: "Failed to check analysis table",
        message: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
      });
    }
  },
);

// Check all tables structure and health
router.get(
  "/check-all-tables",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { getDatabase } = await import("../database");
      const db = getDatabase();
      const { sql } = await import("drizzle-orm");

      const tables = [
        "users",
        "resumes",
        "job_descriptions",
        "analysis_results",
        "interview_questions",
        "skills",
        "skill_categories",
      ];
      const tableStats = [];

      for (const tableName of tables) {
        try {
          // Get column info - SECURITY: Using parameterized query to prevent SQL injection
          const columns = await db.execute(
            sql`SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns 
                WHERE table_name = ${tableName}
                ORDER BY ordinal_position`
          );

          // Get row count - SECURITY: Validate table name against whitelist
          // Table names cannot be parameterized, so we validate against approved list
          const approvedTables = ["resumes", "job_descriptions", "analysis_results", "interview_questions", "skills", "skill_categories"];
          if (!approvedTables.includes(tableName)) {
            throw new Error(`Unauthorized table access: ${tableName}`);
          }
          
          // Use safe identifier quoting for table name
          const countResult = await db.execute(
            sql.raw(`SELECT COUNT(*) as count FROM "${tableName}"`)
          );
          const rowCount =
            Array.isArray(countResult) && countResult[0]
              ? (countResult[0] as Record<string, unknown>).count
              : 0;

          tableStats.push({
            tableName,
            exists: true,
            columns,
            rowCount: parseInt(String(rowCount)) || 0,
            status: "healthy",
          });
        } catch (error) {
          tableStats.push({
            tableName,
            exists: false,
            error: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
            status: "error",
          });
        }
      }

      res.json({
        status: "ok",
        message: `Checked ${tables.length} tables`,
        tables: tableStats,
        summary: {
          totalTables: tables.length,
          healthyTables: tableStats.filter((t) => t.status === "healthy")
            .length,
          errorTables: tableStats.filter((t) => t.status === "error").length,
          totalRows: tableStats.reduce((sum, t) => sum + (t.rowCount || 0), 0),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Table check failed:", error);
      res.status(500).json({
        error: "Failed to check tables",
        message: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
      });
    }
  },
);

// Debug auth endpoint
router.get("/debug-auth", requireAdmin, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    // Check Firebase Admin SDK configuration using unified auth system
    const { verifyFirebaseConfiguration } = await import(
      "../auth/firebase-auth"
    );
    const firebaseStatus = await verifyFirebaseConfiguration();

    // Check environment variables
    const envCheck = {
      hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      hasGoogleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
    };

    // Try to verify token if provided
    let tokenVerification = null;
    if (token) {
      try {
        const { verifyFirebaseToken } = await import("../auth/firebase-auth");
        const decodedToken = await verifyFirebaseToken(token);
        tokenVerification = {
          status: "success",
          decoded: decodedToken
            ? {
                uid: decodedToken.uid,
                email: decodedToken.email,
                emailVerified: decodedToken.emailVerified,
              }
            : null,
        };
      } catch (error) {
        tokenVerification = {
          status: "failed",
          error: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
        };
      }
    }

    res.json({
      status: "ok",
      authDebug: {
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader || "none",
        hasToken: !!token,
        tokenLength: token?.length || 0,
        userAgent: req.headers["user-agent"],
        origin: req.headers.origin,
        referer: req.headers.referer,
        contentType: req.headers["content-type"],
        timestamp: new Date().toISOString(),
      },
      firebaseStatus,
      envCheck,
      tokenVerification,
    });
  } catch (error) {
    logger.error("Auth debug failed:", error);
    res.status(500).json({
      error: "Auth debug failed",
      message: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
    });
  }
});

// Manual migration trigger endpoint - Force run database migrations
router.post(
  "/run-migrations",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      logger.info("Admin manual migration trigger requested");

      const { runMigrations, getMigrationStatus } = await import(
        "../lib/db-migrations"
      );

      // Get status before migration
      const statusBefore = await getMigrationStatus();
      logger.info("Migration status before:", statusBefore);

      // Run migrations
      await runMigrations();

      // Get status after migration
      const statusAfter = await getMigrationStatus();
      logger.info("Migration status after:", statusAfter);

      res.json({
        success: true,
        data: {
          message: "Migrations executed successfully",
          before: statusBefore,
          after: statusAfter,
          migrationsRun:
            statusAfter.appliedMigrations.length -
            statusBefore.appliedMigrations.length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Manual migration failed:", error);
      res.status(500).json({
        success: false,
        error: "Migration execution failed",
        message: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Populate skills database
router.post(
  "/populate-skills",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      logger.info("Admin skills population requested");

      const { getDatabase } = await import("../database");
      const db = getDatabase();
      const { sql } = await import("drizzle-orm");
      const { skillCategories, skillsTable } = await import("@shared/schema");
      
      // Import comprehensive enhanced skills dictionary
      const { getSkillHierarchy } = await import("../lib/skill-processor");
      const ENHANCED_SKILL_DICTIONARY = getSkillHierarchy();
      const SKILL_CATEGORIES = Object.keys(ENHANCED_SKILL_DICTIONARY);

      // Clear existing data first
      logger.info("Clearing existing skills data...");
      await db.delete(skillsTable);
      await db.delete(skillCategories);

      // Convert SKILL_CATEGORIES to array format for insertion
      const categories = Object.values(SKILL_CATEGORIES).map(name => ({
        name,
        description: `${name} related skills and technologies`,
        level: 0
      }));

      // Insert categories with transaction
      logger.info(`Inserting ${categories.length} skill categories...`);
      let categoriesInserted = 0;
      for (const category of categories) {
        try {
          await db
            .insert(skillCategories)
            .values(category)
            .onConflictDoNothing();
          categoriesInserted++;
        } catch (error) {
          logger.warn(`Failed to insert category ${category.name}:`, error);
        }
      }

      // Get category IDs mapping
      const categoryMap = new Map();
      const allCategories = await db.select().from(skillCategories);
      for (const cat of allCategories) {
        categoryMap.set(cat.name, cat.id);
      }
      logger.info(`Created category mapping for ${categoryMap.size} categories`);

      // Convert enhanced skills dictionary to insertion format
      const skillsData: any[] = [];
  Object.entries(ENHANCED_SKILL_DICTIONARY).forEach(([_categoryKey, categoryData]) => {
        if (typeof categoryData === 'object' && categoryData !== null) {
          Object.entries(categoryData).forEach(([skillName, skillInfo]: [string, any]) => {
            skillsData.push({
              name: skillName,
              normalizedName: skillName.toLowerCase(),
              categoryId: categoryMap.get(skillInfo.category),
              aliases: skillInfo.aliases || [],
              description: `${skillName} - ${skillInfo.category}`,
              relatedSkills: skillInfo.related || []
            });
          });
        }
      });

      // Insert skills with better error handling
      logger.info(`Inserting ${skillsData.length} skills...`);
      let skillsInserted = 0;
      let skillsSkipped = 0;
      for (const skillData of skillsData) {
        try {
          if (skillData.categoryId) {
            await db
              .insert(skillsTable)
              .values({
                name: skillData.name,
                normalizedName: skillData.normalizedName,
                categoryId: skillData.categoryId,
                aliases: skillData.aliases,
                description: skillData.description,
              })
              .onConflictDoNothing();
            skillsInserted++;
          } else {
            logger.warn(`Skipping skill ${skillData.name} - no category ID found`);
            skillsSkipped++;
          }
        } catch (error) {
          logger.error(`Failed to insert skill ${skillData.name}:`, error);
          skillsSkipped++;
        }
      }

      // Verify the results
      const finalCategoryCount = await db.execute(sql`SELECT COUNT(*) as count FROM skill_categories`);
      const finalSkillCount = await db.execute(sql`SELECT COUNT(*) as count FROM skills`);
      
      const actualCategoryCount = Array.isArray(finalCategoryCount) && finalCategoryCount[0] 
        ? (finalCategoryCount[0] as any).count : 0;
      const actualSkillCount = Array.isArray(finalSkillCount) && finalSkillCount[0] 
        ? (finalSkillCount[0] as any).count : 0;

      logger.info(
        `Skills population completed: ${actualCategoryCount} categories, ${actualSkillCount} skills (${skillsSkipped} skipped)`,
      );

      res.json({
        status: "success",
        message: "Comprehensive skills database populated successfully!",
        categories: actualCategoryCount,
        skills: actualSkillCount,
        categoriesInserted,
        skillsInserted,
        skillsSkipped,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Skills population failed:", error);
      res.status(500).json({
        error: "Skills population failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// Skill Memory System Management Endpoints

/**
 * Get skill memory system statistics and status
 */
router.get("/skill-memory/stats", requireAdmin, async (req, res) => {
  try {
    logger.info('Admin accessing skill memory stats');
    
    const { SkillLearningSystem, getSkillLearningStats } = await import('../lib/skill-learning');
    
    const [systemStats, schedulerStatus] = await Promise.all([
      Promise.resolve(getSkillLearningStats()),
      Promise.resolve(SkillLearningSystem.getInstance().getValidationQueueStatus())
    ]);

    res.json({
      status: "success",
      data: {
        systemStats,
        schedulerStatus,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error("Failed to get skill memory stats:", error);
    res.status(500).json({
      error: "Failed to get skill memory stats",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get recent skill discoveries with pagination
 */
router.get("/skill-memory/discoveries", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;
    
    logger.info('Admin accessing skill memory discoveries', { page, limit });
    
    const { getDatabase } = await import("../database");
    const db = getDatabase();
    const { skillMemory } = await import("@shared/schema");
    const { desc } = await import("drizzle-orm");
    
    const discoveries = await db
      .select({
        id: skillMemory.id,
        skillText: skillMemory.skillText,
        frequency: skillMemory.frequency,
        escoValidated: skillMemory.escoValidated,
        groqConfidence: skillMemory.groqConfidence,
        mlSimilarityScore: skillMemory.mlSimilarityScore,
        autoApproved: skillMemory.autoApproved,
        autoApprovalReason: skillMemory.autoApprovalReason,
        categorySuggestion: skillMemory.categorySuggestion,
        firstSeen: skillMemory.firstSeen,
        lastSeen: skillMemory.lastSeen
      })
      .from(skillMemory)
      .orderBy(desc(skillMemory.lastSeen))
      .limit(limit)
      .offset(offset);

    const { sql } = await import("drizzle-orm");
    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(skillMemory);

    res.json({
      status: "success",
      data: {
        discoveries,
        pagination: {
          page,
          limit,
          total: totalCount[0]?.count || 0,
          pages: Math.ceil((totalCount[0]?.count || 0) / limit)
        }
      }
    });
  } catch (error) {
    logger.error("Failed to get skill memory discoveries:", error);
    res.status(500).json({
      error: "Failed to get skill memory discoveries",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Run skill learning scheduler job manually
 */
router.post("/skill-memory/run-job", requireAdmin, async (req, res) => {
  try {
    const jobType = req.body.jobType as 'promotion' | 'revalidation' | 'maintenance' | 'cleanup';
    
    if (!jobType || !['promotion', 'revalidation', 'maintenance', 'cleanup'].includes(jobType)) {
      return res.status(400).json({
        error: "Invalid job type",
        message: "Job type must be one of: promotion, revalidation, maintenance, cleanup"
      });
    }
    
    logger.info(`Admin manually running skill learning job: ${jobType}`);
    
    const { SkillLearningSystem } = await import('../lib/skill-learning');
    const learningSystem = SkillLearningSystem.getInstance();
    
    // Run the appropriate job type
    if (jobType === 'promotion' || jobType === 'revalidation' || jobType === 'maintenance' || jobType === 'cleanup') {
      await learningSystem.forceProcessQueue();
    } else {
      logger.warn(`Unknown job type: ${jobType}, running validation queue`);
      await learningSystem.forceProcessQueue();
    }
    
    res.json({
      status: "success",
      message: `Skill learning job '${jobType}' completed successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Failed to run skill learning job:", error);
    res.status(500).json({
      error: "Failed to run skill learning job",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Clean up low-frequency skills manually
 */
router.post("/skill-memory/cleanup", requireAdmin, async (req, res) => {
  try {
    logger.info('Admin manually running skill memory cleanup');
    
    const { SkillLearningSystem } = await import('../lib/skill-learning');
    const learningSystem = SkillLearningSystem.getInstance();
    
    // Run cleanup - the consolidated system handles this internally
    await learningSystem.forceProcessQueue();
    const stats = learningSystem.getLearningStats();
    const cleanedCount = stats.rejectedSkills;
    
    res.json({
      status: "success",
      message: `Successfully cleaned up ${cleanedCount} low-frequency skills`,
      cleanedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Failed to cleanup skill memory:", error);
    res.status(500).json({
      error: "Failed to cleanup skill memory",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get skill promotion history
 */
router.get("/skill-memory/promotions", requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;
    
    logger.info('Admin accessing skill promotion history', { page, limit });
    
    const { getDatabase } = await import("../database");
    const db = getDatabase();
    const { skillPromotionLog, skillMemory } = await import("@shared/schema");
    const { desc, eq } = await import("drizzle-orm");
    
    const promotions = await db
      .select({
        id: skillPromotionLog.id,
        skillText: skillMemory.skillText,
        promotionReason: skillPromotionLog.promotionReason,
        promotionConfidence: skillPromotionLog.promotionConfidence,
        promotionData: skillPromotionLog.promotionData,
        createdAt: skillPromotionLog.createdAt
      })
      .from(skillPromotionLog)
      .innerJoin(skillMemory, eq(skillPromotionLog.skillId, skillMemory.id))
      .orderBy(desc(skillPromotionLog.createdAt))
      .limit(limit)
      .offset(offset);

    const { sql } = await import("drizzle-orm");
    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(skillPromotionLog);

    res.json({
      status: "success",
      data: {
        promotions,
        pagination: {
          page,
          limit,
          total: totalCount[0]?.count || 0,
          pages: Math.ceil((totalCount[0]?.count || 0) / limit)
        }
      }
    });
  } catch (error) {
    logger.error("Failed to get skill promotion history:", error);
    res.status(500).json({
      error: "Failed to get skill promotion history",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
