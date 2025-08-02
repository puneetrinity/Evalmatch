/**
 * Admin Routes
 * Handles administrative operations, database fixes, and system management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

const router = Router();

// Admin route protection middleware
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  // For now, allow all admin routes - in production, add proper admin verification
  // TODO: Implement proper admin authentication
  next();
};

// Database fix endpoint - Emergency database repairs
router.post("/fix-database", requireAdmin, async (req: Request, res: Response) => {
  try {
    logger.info('Admin database fix requested');
    
    const fixes = [];
    
    try {
      // Import database utilities
      const { db } = await import('../db');
      const { sql } = await import('drizzle-orm');
      
      // Test database connection
      await db.execute(sql`SELECT 1`);
      fixes.push("✅ Database connection verified");
      
      // Check and fix missing columns
      const missingColumnFixes = [
        'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS user_id TEXT',
        'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS session_id TEXT', 
        'ALTER TABLE resumes ADD COLUMN IF NOT EXISTS analyzed_data JSON',
        'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS user_id TEXT',
        'ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS analyzed_data JSON',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS candidate_strengths JSON',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS candidate_weaknesses JSON',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS confidence_level VARCHAR(10)',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS fairness_metrics JSON',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS recommendations JSON DEFAULT \'[]\'::json',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS processing_time INTEGER',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS ai_provider TEXT',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS model_version TEXT',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS processing_flags JSON DEFAULT \'{}\'::json',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        'ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
      ];
      
      for (const fixQuery of missingColumnFixes) {
        try {
          await db.execute(sql.raw(fixQuery));
          fixes.push(`✅ ${fixQuery}`);
        } catch (error: unknown) {
          if (error.message?.includes('already exists') || error.message?.includes('duplicate column')) {
            fixes.push(`ℹ️ Column already exists: ${fixQuery.split(' ADD COLUMN IF NOT EXISTS ')[1]}`);
          } else {
            fixes.push(`❌ Failed: ${fixQuery} - ${error.message}`);
          }
        }
      }
      
      // Fix data types
      const dataTypeFixes = [
        'ALTER TABLE analysis_results ALTER COLUMN match_percentage TYPE REAL',
        'ALTER TABLE analysis_results ALTER COLUMN user_id TYPE TEXT',
        'ALTER TABLE job_descriptions ALTER COLUMN user_id TYPE TEXT',
        'ALTER TABLE resumes ALTER COLUMN user_id TYPE TEXT'
      ];
      
      for (const fixQuery of dataTypeFixes) {
        try {
          await db.execute(sql.raw(fixQuery));
          fixes.push(`✅ ${fixQuery}`);
        } catch (error: unknown) {
          fixes.push(`ℹ️ Type fix not needed or failed: ${fixQuery} - ${error.message}`);
        }
      }
      
      // Add indexes if missing
      const indexFixes = [
        'CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_job_descriptions_user_id ON job_descriptions(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id)',
        'CREATE INDEX IF NOT EXISTS idx_analysis_results_job_id ON analysis_results(job_description_id)'
      ];
      
      for (const indexQuery of indexFixes) {
        try {
          await db.execute(sql.raw(indexQuery));
          fixes.push(`✅ ${indexQuery}`);
        } catch (error: unknown) {
          fixes.push(`ℹ️ Index already exists or failed: ${indexQuery.split(' ON ')[0]} - ${error.message}`);
        }
      }
      
    } catch (error) {
      fixes.push(`❌ Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    logger.info(`Database fix completed with ${fixes.length} operations`);
    
    res.json({
      status: "completed",
      message: `Database fix completed with ${fixes.length} operations`,
      fixes,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Database fix failed:', error);
    res.status(500).json({
      error: "Database fix failed",
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Check analysis table structure
router.get("/check-analysis-table", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');
    
    // Get table structure
    const tableInfo = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'analysis_results'
      ORDER BY ordinal_position
    `);
    
    // Get row count
    const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM analysis_results`);
    const rowCount = Array.isArray(countResult) && countResult[0] ? (countResult[0] as Record<string, unknown>).count : 0;
    
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
      rowCount: parseInt(rowCount) || 0,
      sampleData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Analysis table check failed:', error);
    res.status(500).json({
      error: "Failed to check analysis table",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Check all tables structure and health
router.get("/check-all-tables", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');
    
    const tables = ['users', 'resumes', 'job_descriptions', 'analysis_results', 'interview_questions', 'skills', 'skill_categories'];
    const tableStats = [];
    
    for (const tableName of tables) {
      try {
        // Get column info
        const columns = await db.execute(sql.raw(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_name = '${tableName}'
          ORDER BY ordinal_position
        `));
        
        // Get row count
        const countResult = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM ${tableName}`));
        const rowCount = Array.isArray(countResult) && countResult[0] ? (countResult[0] as Record<string, unknown>).count : 0;
        
        tableStats.push({
          tableName,
          exists: true,
          columns,
          rowCount: parseInt(rowCount) || 0,
          status: "healthy"
        });
        
      } catch (error) {
        tableStats.push({
          tableName,
          exists: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          status: "error"
        });
      }
    }
    
    res.json({
      status: "ok",
      message: `Checked ${tables.length} tables`,
      tables: tableStats,
      summary: {
        totalTables: tables.length,
        healthyTables: tableStats.filter(t => t.status === "healthy").length,
        errorTables: tableStats.filter(t => t.status === "error").length,
        totalRows: tableStats.reduce((sum, t) => sum + (t.rowCount || 0), 0)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Table check failed:', error);
    res.status(500).json({
      error: "Failed to check tables",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Debug auth endpoint
router.get("/debug-auth", requireAdmin, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    
    // Check Firebase Admin SDK configuration
    const { verifyFirebaseConfig, verifyFirebaseToken } = await import('../lib/firebase-admin');
    const firebaseStatus = await verifyFirebaseConfig();
    
    // Check environment variables
    const envCheck = {
      hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      hasGoogleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV
    };
    
    // Try to verify token if provided
    let tokenVerification = null;
    if (token) {
      try {
        const decodedToken = await verifyFirebaseToken(token);
        tokenVerification = {
          status: 'success',
          decoded: decodedToken ? {
            uid: decodedToken.uid,
            email: decodedToken.email,
            emailVerified: decodedToken.emailVerified
          } : null
        };
      } catch (error) {
        tokenVerification = {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    res.json({
      status: "ok",
      authDebug: {
        hasAuthHeader: !!authHeader,
        authHeaderValue: authHeader || 'none',
        hasToken: !!token,
        tokenLength: token?.length || 0,
        userAgent: req.headers['user-agent'],
        origin: req.headers.origin,
        referer: req.headers.referer,
        contentType: req.headers['content-type'],
        timestamp: new Date().toISOString()
      },
      firebaseStatus,
      envCheck,
      tokenVerification
    });
    
  } catch (error) {
    logger.error('Auth debug failed:', error);
    res.status(500).json({
      error: "Auth debug failed",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Manual migration trigger endpoint - Force run database migrations
router.post("/run-migrations", requireAdmin, async (req: Request, res: Response) => {
  try {
    logger.info('Admin manual migration trigger requested');
    
    const { runMigrations, getMigrationStatus } = await import('../lib/db-migrations');
    
    // Get status before migration
    const statusBefore = await getMigrationStatus();
    logger.info('Migration status before:', statusBefore);
    
    // Run migrations
    await runMigrations();
    
    // Get status after migration
    const statusAfter = await getMigrationStatus();
    logger.info('Migration status after:', statusAfter);
    
    res.json({
      success: true,
      data: {
        message: "Migrations executed successfully",
        before: statusBefore,
        after: statusAfter,
        migrationsRun: statusAfter.appliedMigrations.length - statusBefore.appliedMigrations.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Manual migration failed:', error);
    res.status(500).json({
      success: false,
      error: "Migration execution failed",
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Populate skills database
router.post("/populate-skills", requireAdmin, async (req: Request, res: Response) => {
  try {
    logger.info('Admin skills population requested');
    
    const { db } = await import('../db');
    const { sql } = await import('drizzle-orm');
    const { skillCategories, skillsTable } = await import('@shared/schema');
    
    // Define skill categories
    const categories = [
      { name: 'Frontend Development', description: 'Client-side web development technologies' },
      { name: 'Backend Development', description: 'Server-side development and APIs' },
      { name: 'Mobile Development', description: 'Mobile application development' },
      { name: 'Database Technologies', description: 'Database systems and data management' },
      { name: 'Cloud & DevOps', description: 'Cloud platforms and deployment technologies' },
      { name: 'Machine Learning & AI', description: 'Artificial intelligence and data science' },
      { name: 'Programming Languages', description: 'Programming and scripting languages' },
      { name: 'Testing & Quality Assurance', description: 'Software testing and QA practices' },
      { name: 'Design & UX', description: 'User experience and interface design' },
      { name: 'Soft Skills', description: 'Communication and interpersonal skills' }
    ];
    
    // Insert categories
    let categoriesInserted = 0;
    for (const category of categories) {
      try {
        await db.insert(skillCategories)
          .values({
            name: category.name,
            level: 0,
            description: category.description
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
      { name: 'React', category: 'Frontend Development', aliases: ['ReactJS', 'React.js', 'React Native'] },
      { name: 'Angular', category: 'Frontend Development', aliases: ['AngularJS', 'Angular2+'] },
      { name: 'Vue.js', category: 'Frontend Development', aliases: ['Vue', 'VueJS', 'Vuejs'] },
      { name: 'JavaScript', category: 'Frontend Development', aliases: ['JS', 'ECMAScript', 'ES6', 'ES2015+'] },
      { name: 'TypeScript', category: 'Frontend Development', aliases: ['TS'] },
      { name: 'HTML', category: 'Frontend Development', aliases: ['HTML5'] },
      { name: 'CSS', category: 'Frontend Development', aliases: ['CSS3', 'Stylesheets'] },
      { name: 'Sass', category: 'Frontend Development', aliases: ['SCSS'] },
      { name: 'Tailwind CSS', category: 'Frontend Development', aliases: ['TailwindCSS'] },
      
      // Backend Development  
      { name: 'Node.js', category: 'Backend Development', aliases: ['NodeJS', 'Node'] },
      { name: 'Express.js', category: 'Backend Development', aliases: ['Express', 'ExpressJS'] },
      { name: 'Python', category: 'Backend Development', aliases: ['Python3'] },
      { name: 'Django', category: 'Backend Development', aliases: ['Django Framework'] },
      { name: 'Flask', category: 'Backend Development', aliases: ['Flask Framework'] },
      { name: 'FastAPI', category: 'Backend Development', aliases: ['Fast API'] },
      { name: 'Java', category: 'Backend Development', aliases: ['Java SE', 'Java EE'] },
      { name: 'Spring Boot', category: 'Backend Development', aliases: ['Spring', 'Spring Framework'] },
      
      // Programming Languages
      { name: 'Go', category: 'Programming Languages', aliases: ['Golang'] },
      { name: 'Rust', category: 'Programming Languages', aliases: ['Rust Lang'] },
      { name: 'C++', category: 'Programming Languages', aliases: ['CPP', 'C Plus Plus'] },
      { name: 'C#', category: 'Programming Languages', aliases: ['C Sharp', 'CSharp'] },
      { name: 'PHP', category: 'Programming Languages', aliases: ['PHP7', 'PHP8'] },
      { name: 'Ruby', category: 'Programming Languages', aliases: ['Ruby on Rails', 'RoR'] },
      
      // Database Technologies
      { name: 'PostgreSQL', category: 'Database Technologies', aliases: ['Postgres', 'psql'] },
      { name: 'MySQL', category: 'Database Technologies', aliases: ['MySQL Server'] },
      { name: 'MongoDB', category: 'Database Technologies', aliases: ['Mongo', 'NoSQL'] },
      { name: 'Redis', category: 'Database Technologies', aliases: ['Redis Cache'] },
      { name: 'SQLite', category: 'Database Technologies', aliases: ['SQLite3'] },
      
      // Cloud & DevOps
      { name: 'AWS', category: 'Cloud & DevOps', aliases: ['Amazon Web Services', 'Amazon AWS'] },
      { name: 'Google Cloud', category: 'Cloud & DevOps', aliases: ['GCP', 'Google Cloud Platform'] },
      { name: 'Microsoft Azure', category: 'Cloud & DevOps', aliases: ['Azure', 'Azure Cloud'] },
      { name: 'Docker', category: 'Cloud & DevOps', aliases: ['Containerization'] },
      { name: 'Kubernetes', category: 'Cloud & DevOps', aliases: ['K8s', 'Container Orchestration'] },
      { name: 'Jenkins', category: 'Cloud & DevOps', aliases: ['CI/CD', 'Continuous Integration'] },
      { name: 'Terraform', category: 'Cloud & DevOps', aliases: ['Infrastructure as Code', 'IaC'] },
      
      // Mobile Development
      { name: 'iOS Development', category: 'Mobile Development', aliases: ['iOS', 'iPhone Development'] },
      { name: 'Android Development', category: 'Mobile Development', aliases: ['Android'] },
      { name: 'React Native', category: 'Mobile Development', aliases: ['RN'] },
      { name: 'Flutter', category: 'Mobile Development', aliases: ['Dart', 'Flutter Framework'] },
      { name: 'Swift', category: 'Mobile Development', aliases: ['Swift Programming'] },
      { name: 'Kotlin', category: 'Mobile Development', aliases: ['Kotlin Programming'] },
      
      // Machine Learning & AI
      { name: 'Machine Learning', category: 'Machine Learning & AI', aliases: ['ML', 'Artificial Intelligence', 'AI'] },
      { name: 'TensorFlow', category: 'Machine Learning & AI', aliases: ['TF'] },
      { name: 'PyTorch', category: 'Machine Learning & AI', aliases: ['Torch'] },
      { name: 'scikit-learn', category: 'Machine Learning & AI', aliases: ['sklearn', 'scikit learn'] },
      { name: 'Pandas', category: 'Machine Learning & AI', aliases: ['Data Analysis'] },
      { name: 'NumPy', category: 'Machine Learning & AI', aliases: ['Numerical Python'] },
      
      // Testing & QA
      { name: 'Jest', category: 'Testing & Quality Assurance', aliases: ['JavaScript Testing'] },
      { name: 'Cypress', category: 'Testing & Quality Assurance', aliases: ['E2E Testing'] },
      { name: 'Selenium', category: 'Testing & Quality Assurance', aliases: ['Web Testing'] },
      { name: 'Unit Testing', category: 'Testing & Quality Assurance', aliases: ['TDD', 'Test Driven Development'] },
      
      // Design & UX
      { name: 'UI/UX Design', category: 'Design & UX', aliases: ['User Experience', 'User Interface', 'UX/UI'] },
      { name: 'Figma', category: 'Design & UX', aliases: ['Design Tools'] },
      { name: 'Adobe Creative Suite', category: 'Design & UX', aliases: ['Photoshop', 'Illustrator'] },
      
      // Soft Skills
      { name: 'Communication', category: 'Soft Skills', aliases: ['Verbal Communication', 'Written Communication'] },
      { name: 'Leadership', category: 'Soft Skills', aliases: ['Team Leadership', 'Project Leadership'] },
      { name: 'Problem Solving', category: 'Soft Skills', aliases: ['Critical Thinking', 'Analytical Skills'] },
      { name: 'Project Management', category: 'Soft Skills', aliases: ['Agile', 'Scrum', 'Kanban'] },
      { name: 'Teamwork', category: 'Soft Skills', aliases: ['Collaboration', 'Team Player'] }
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
          await db.insert(skillsTable)
            .values({
              name: skillData.name,
              normalizedName: skillData.name.toLowerCase(),
              categoryId,
              aliases: skillData.aliases,
              description: `${skillData.name} - ${skillData.category}`
            })
            .onConflictDoNothing();
          skillsInserted++;
        }
      } catch (error) {
        logger.warn(`Failed to insert skill ${skillData.name}:`, error);
      }
    }
    
    logger.info(`Skills population completed: ${categoriesInserted} categories, ${skillsInserted} skills`);
    
    res.json({
      status: "success",
      message: "Skills database populated successfully!",
      categories: categoriesInserted,
      skills: skillsInserted,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Skills population failed:', error);
    res.status(500).json({
      error: "Skills population failed",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;