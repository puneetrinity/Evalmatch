/**
 * Admin Routes
 * Handles administrative operations, database fixes, and system management
 */

import { Router, Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import crypto from "crypto";

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
    try {
      logger.info("Admin database fix requested");

      const fixes = [];

      try {
        // Import database utilities
        const { db } = await import("../db");
        const { sql } = await import("drizzle-orm");

        // Test database connection
        await db.execute(sql`SELECT 1`);
        fixes.push("✅ Database connection verified");

        // Check and fix missing columns
        const missingColumnFixes = [
          "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS user_id TEXT",
          "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS session_id TEXT",
          "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS analyzed_data JSON",
          "ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS user_id TEXT",
          "ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS analyzed_data JSON",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS candidate_strengths JSON",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS candidate_weaknesses JSON",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS confidence_level VARCHAR(10)",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS fairness_metrics JSON",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS recommendations JSON DEFAULT '[]'::json",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS processing_time INTEGER",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS ai_provider TEXT",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS model_version TEXT",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS processing_flags JSON DEFAULT '{}'::json",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
          "ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
          "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS user_id TEXT",
          "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS metadata JSON DEFAULT '{}'::json",
          "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
          "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        ];

        for (const fixQuery of missingColumnFixes) {
          try {
            await db.execute(sql.raw(fixQuery));
            fixes.push(`✅ ${fixQuery}`);
          } catch (error: unknown) {
            if (
              (error instanceof Error ? error.message : String(error))?.includes("already exists") ||
              (error instanceof Error ? error.message : String(error))?.includes("duplicate column")
            ) {
              fixes.push(
                `ℹ️ Column already exists: ${fixQuery.split(" ADD COLUMN IF NOT EXISTS ")[1]}`,
              );
            } else {
              fixes.push(`❌ Failed: ${fixQuery} - ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }

        // Fix data types
        const dataTypeFixes = [
          "ALTER TABLE analysis_results ALTER COLUMN match_percentage TYPE REAL",
          "ALTER TABLE analysis_results ALTER COLUMN user_id TYPE TEXT",
          "ALTER TABLE job_descriptions ALTER COLUMN user_id TYPE TEXT",
          "ALTER TABLE resumes ALTER COLUMN user_id TYPE TEXT",
        ];

        for (const fixQuery of dataTypeFixes) {
          try {
            await db.execute(sql.raw(fixQuery));
            fixes.push(`✅ ${fixQuery}`);
          } catch (error: unknown) {
            fixes.push(
              `ℹ️ Type fix not needed or failed: ${fixQuery} - ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        // Add batch_id column for batch-based analysis
        const batchIdFixes = [
          "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS batch_id TEXT",
          "CREATE INDEX IF NOT EXISTS idx_resumes_batch_id ON resumes(batch_id)",
          "CREATE INDEX IF NOT EXISTS idx_resumes_user_batch ON resumes(user_id, batch_id)",
          "CREATE INDEX IF NOT EXISTS idx_resumes_session_batch ON resumes(session_id, batch_id)",
        ];

        for (const batchQuery of batchIdFixes) {
          try {
            await db.execute(sql.raw(batchQuery));
            fixes.push(`✅ ${batchQuery}`);
          } catch (error: unknown) {
            fixes.push(
              `ℹ️ Batch ID fix not needed or failed: ${batchQuery} - ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        // Add indexes if missing
        const indexFixes = [
          "CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id)",
          "CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_id ON job_descriptions(user_id)",
          "CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id)",
          "CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id)",
          "CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_description_id)",
          "CREATE INDEX IF NOT EXISTS idx_interview_questions_user_id ON interview_questions(user_id)",
          "CREATE INDEX IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id)",
          "CREATE INDEX IF NOT EXISTS idx_interview_questions_job_id ON interview_questions(job_description_id)",
        ];

        for (const indexQuery of indexFixes) {
          try {
            await db.execute(sql.raw(indexQuery));
            fixes.push(`✅ ${indexQuery}`);
          } catch (error: unknown) {
            fixes.push(
              `ℹ️ Index already exists or failed: ${indexQuery.split(" ON ")[0]} - ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      } catch (error) {
        fixes.push(
          `❌ Database operation failed: ${error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error"}`,
        );
      }

      logger.info(`Database fix completed with ${fixes.length} operations`);

      res.json({
        status: "completed",
        message: `Database fix completed with ${fixes.length} operations`,
        fixes,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Database fix failed:", error);
      res.status(500).json({
        error: "Database fix failed",
        message: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
        timestamp: new Date().toISOString(),
      });
    }
  },
);

// Check analysis table structure
router.get(
  "/check-analysis-table",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { db } = await import("../db");
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
      const { db } = await import("../db");
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
    const { verifyFirebaseConfiguration, getFirebaseAuthStatus } = await import(
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

      const { db } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const { skillCategories, skillsTable } = await import("@shared/schema");

      // Define skill categories
      const categories = [
        {
          name: "Frontend Development",
          description: "Client-side web development technologies",
        },
        {
          name: "Backend Development",
          description: "Server-side development and APIs",
        },
        {
          name: "Mobile Development",
          description: "Mobile application development",
        },
        {
          name: "Database Technologies",
          description: "Database systems and data management",
        },
        {
          name: "Cloud & DevOps",
          description: "Cloud platforms and deployment technologies",
        },
        {
          name: "Machine Learning & AI",
          description: "Artificial intelligence and data science",
        },
        {
          name: "Programming Languages",
          description: "Programming and scripting languages",
        },
        {
          name: "Testing & Quality Assurance",
          description: "Software testing and QA practices",
        },
        {
          name: "Design & UX",
          description: "User experience and interface design",
        },
        {
          name: "Soft Skills",
          description: "Communication and interpersonal skills",
        },
      ];

      // Insert categories
      let categoriesInserted = 0;
      for (const category of categories) {
        try {
          await db
            .insert(skillCategories)
            .values({
              name: category.name,
              level: 0,
              description: category.description,
            })
            .onConflictDoNothing();
          categoriesInserted++;
        } catch (error) {
          logger.warn(`Failed to insert category ${category.name}:`, error);
        }
      }

      // Define skills with their categories and aliases
      const skillsData = [
        // Frontend Development
        {
          name: "React",
          category: "Frontend Development",
          aliases: ["ReactJS", "React.js", "React Native"],
        },
        {
          name: "Angular",
          category: "Frontend Development",
          aliases: ["AngularJS", "Angular2+"],
        },
        {
          name: "Vue.js",
          category: "Frontend Development",
          aliases: ["Vue", "VueJS", "Vuejs"],
        },
        {
          name: "JavaScript",
          category: "Frontend Development",
          aliases: ["JS", "ECMAScript", "ES6", "ES2015+"],
        },
        {
          name: "TypeScript",
          category: "Frontend Development",
          aliases: ["TS"],
        },
        { name: "HTML", category: "Frontend Development", aliases: ["HTML5"] },
        {
          name: "CSS",
          category: "Frontend Development",
          aliases: ["CSS3", "Stylesheets"],
        },
        { name: "Sass", category: "Frontend Development", aliases: ["SCSS"] },
        {
          name: "Tailwind CSS",
          category: "Frontend Development",
          aliases: ["TailwindCSS"],
        },

        // Backend Development
        {
          name: "Node.js",
          category: "Backend Development",
          aliases: ["NodeJS", "Node"],
        },
        {
          name: "Express.js",
          category: "Backend Development",
          aliases: ["Express", "ExpressJS"],
        },
        {
          name: "Python",
          category: "Backend Development",
          aliases: ["Python3"],
        },
        {
          name: "Django",
          category: "Backend Development",
          aliases: ["Django Framework"],
        },
        {
          name: "Flask",
          category: "Backend Development",
          aliases: ["Flask Framework"],
        },
        {
          name: "FastAPI",
          category: "Backend Development",
          aliases: ["Fast API"],
        },
        {
          name: "Java",
          category: "Backend Development",
          aliases: ["Java SE", "Java EE"],
        },
        {
          name: "Spring Boot",
          category: "Backend Development",
          aliases: ["Spring", "Spring Framework"],
        },

        // Programming Languages
        { name: "Go", category: "Programming Languages", aliases: ["Golang"] },
        {
          name: "Rust",
          category: "Programming Languages",
          aliases: ["Rust Lang"],
        },
        {
          name: "C++",
          category: "Programming Languages",
          aliases: ["CPP", "C Plus Plus"],
        },
        {
          name: "C#",
          category: "Programming Languages",
          aliases: ["C Sharp", "CSharp"],
        },
        {
          name: "PHP",
          category: "Programming Languages",
          aliases: ["PHP7", "PHP8"],
        },
        {
          name: "Ruby",
          category: "Programming Languages",
          aliases: ["Ruby on Rails", "RoR"],
        },

        // Database Technologies
        {
          name: "PostgreSQL",
          category: "Database Technologies",
          aliases: ["Postgres", "psql"],
        },
        {
          name: "MySQL",
          category: "Database Technologies",
          aliases: ["MySQL Server"],
        },
        {
          name: "MongoDB",
          category: "Database Technologies",
          aliases: ["Mongo", "NoSQL"],
        },
        {
          name: "Redis",
          category: "Database Technologies",
          aliases: ["Redis Cache"],
        },
        {
          name: "SQLite",
          category: "Database Technologies",
          aliases: ["SQLite3"],
        },

        // Cloud & DevOps
        {
          name: "AWS",
          category: "Cloud & DevOps",
          aliases: ["Amazon Web Services", "Amazon AWS"],
        },
        {
          name: "Google Cloud",
          category: "Cloud & DevOps",
          aliases: ["GCP", "Google Cloud Platform"],
        },
        {
          name: "Microsoft Azure",
          category: "Cloud & DevOps",
          aliases: ["Azure", "Azure Cloud"],
        },
        {
          name: "Docker",
          category: "Cloud & DevOps",
          aliases: ["Containerization"],
        },
        {
          name: "Kubernetes",
          category: "Cloud & DevOps",
          aliases: ["K8s", "Container Orchestration"],
        },
        {
          name: "Jenkins",
          category: "Cloud & DevOps",
          aliases: ["CI/CD", "Continuous Integration"],
        },
        {
          name: "Terraform",
          category: "Cloud & DevOps",
          aliases: ["Infrastructure as Code", "IaC"],
        },

        // Mobile Development
        {
          name: "iOS Development",
          category: "Mobile Development",
          aliases: ["iOS", "iPhone Development"],
        },
        {
          name: "Android Development",
          category: "Mobile Development",
          aliases: ["Android"],
        },
        {
          name: "React Native",
          category: "Mobile Development",
          aliases: ["RN"],
        },
        {
          name: "Flutter",
          category: "Mobile Development",
          aliases: ["Dart", "Flutter Framework"],
        },
        {
          name: "Swift",
          category: "Mobile Development",
          aliases: ["Swift Programming"],
        },
        {
          name: "Kotlin",
          category: "Mobile Development",
          aliases: ["Kotlin Programming"],
        },

        // Machine Learning & AI
        {
          name: "Machine Learning",
          category: "Machine Learning & AI",
          aliases: ["ML", "Artificial Intelligence", "AI"],
        },
        {
          name: "TensorFlow",
          category: "Machine Learning & AI",
          aliases: ["TF"],
        },
        {
          name: "PyTorch",
          category: "Machine Learning & AI",
          aliases: ["Torch"],
        },
        {
          name: "scikit-learn",
          category: "Machine Learning & AI",
          aliases: ["sklearn", "scikit learn"],
        },
        {
          name: "Pandas",
          category: "Machine Learning & AI",
          aliases: ["Data Analysis"],
        },
        {
          name: "NumPy",
          category: "Machine Learning & AI",
          aliases: ["Numerical Python"],
        },

        // Testing & QA
        {
          name: "Jest",
          category: "Testing & Quality Assurance",
          aliases: ["JavaScript Testing"],
        },
        {
          name: "Cypress",
          category: "Testing & Quality Assurance",
          aliases: ["E2E Testing"],
        },
        {
          name: "Selenium",
          category: "Testing & Quality Assurance",
          aliases: ["Web Testing"],
        },
        {
          name: "Unit Testing",
          category: "Testing & Quality Assurance",
          aliases: ["TDD", "Test Driven Development"],
        },

        // Design & UX
        {
          name: "UI/UX Design",
          category: "Design & UX",
          aliases: ["User Experience", "User Interface", "UX/UI"],
        },
        { name: "Figma", category: "Design & UX", aliases: ["Design Tools"] },
        {
          name: "Adobe Creative Suite",
          category: "Design & UX",
          aliases: ["Photoshop", "Illustrator"],
        },

        // Soft Skills
        {
          name: "Communication",
          category: "Soft Skills",
          aliases: ["Verbal Communication", "Written Communication"],
        },
        {
          name: "Leadership",
          category: "Soft Skills",
          aliases: ["Team Leadership", "Project Leadership"],
        },
        {
          name: "Problem Solving",
          category: "Soft Skills",
          aliases: ["Critical Thinking", "Analytical Skills"],
        },
        {
          name: "Project Management",
          category: "Soft Skills",
          aliases: ["Agile", "Scrum", "Kanban"],
        },
        {
          name: "Teamwork",
          category: "Soft Skills",
          aliases: ["Collaboration", "Team Player"],
        },
      ];

      // Get category IDs
      const categoryMap = new Map();
      const allCategories = await db.select().from(skillCategories);
      for (const cat of allCategories) {
        categoryMap.set(cat.name, cat.id);
      }

      // Insert skills
      let skillsInserted = 0;
      for (const skillData of skillsData) {
        try {
          const categoryId = categoryMap.get(skillData.category);
          if (categoryId) {
            await db
              .insert(skillsTable)
              .values({
                name: skillData.name,
                normalizedName: skillData.name.toLowerCase(),
                categoryId,
                aliases: skillData.aliases,
                description: `${skillData.name} - ${skillData.category}`,
              })
              .onConflictDoNothing();
            skillsInserted++;
          }
        } catch (error) {
          logger.warn(`Failed to insert skill ${skillData.name}:`, error);
        }
      }

      logger.info(
        `Skills population completed: ${categoriesInserted} categories, ${skillsInserted} skills`,
      );

      res.json({
        status: "success",
        message: "Skills database populated successfully!",
        categories: categoriesInserted,
        skills: skillsInserted,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Skills population failed:", error);
      res.status(500).json({
        error: "Skills population failed",
        message: error instanceof Error ? error instanceof Error ? error.message : String(error) : "Unknown error",
      });
    }
  },
);

export default router;
