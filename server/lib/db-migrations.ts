import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Consolidated Database Migration System
 * Replaces scattered migration scripts with single source of truth
 */

interface Migration {
  version: string;
  description: string;
  filename: string;
}

// Available migrations in order
const MIGRATIONS: Migration[] = [
  {
    version: '001_consolidated_schema',
    description: 'Consolidated database schema with all fixes',
    filename: '001_consolidated_schema.sql'
  },
  {
    version: '002_add_batch_id',
    description: 'Add batch_id column to resumes table for batch-based analysis',
    filename: '002_add_batch_id.sql'
  },
  {
    version: '002_add_recommendations_column',
    description: 'Add recommendations column to analysis_results table',
    filename: '002_add_recommendations_column.sql'
  }
];

/**
 * Check if a migration has been applied
 */
async function isMigrationApplied(version: string): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT 1 FROM schema_migrations WHERE version = ${version} LIMIT 1
    `);
    return result.length > 0;
  } catch (error) {
    // If schema_migrations table doesn't exist, no migrations have been applied
    return false;
  }
}

/**
 * Execute a single migration file
 */
async function executeMigration(migration: Migration): Promise<void> {
  // In production Docker, migrations are copied to dist/migrations/
  // In development, they're in server/migrations/
  // Try multiple possible paths for migration files
  const possiblePaths = [
    // Production build path (Railway)
    path.join(process.cwd(), 'build', 'migrations', migration.filename),
    // Nixpacks copied path
    path.join(process.cwd(), 'dist', 'migrations', migration.filename),
    // Original development path
    path.join(process.cwd(), 'server', 'migrations', migration.filename),
    // Alternative locations
    path.join(process.cwd(), 'migrations', migration.filename),
    path.join(__dirname, '..', 'migrations', migration.filename),
  ];

  let migrationPath: string | null = null;
  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      migrationPath = testPath;
      break;
    }
  }

  if (!migrationPath) {
    // Debug: List what files actually exist
    const debugInfo = {
      cwd: process.cwd(),
      __dirname,
      possiblePaths,
      distContents: fs.existsSync(path.join(process.cwd(), 'dist')) 
        ? fs.readdirSync(path.join(process.cwd(), 'dist'))
        : 'dist directory not found',
      serverContents: fs.existsSync(path.join(process.cwd(), 'server'))
        ? fs.readdirSync(path.join(process.cwd(), 'server'))
        : 'server directory not found'
    };
    
    throw new Error(`Migration file not found. Searched paths: ${possiblePaths.join(', ')}. Debug info: ${JSON.stringify(debugInfo, null, 2)}`);
  }
  
  logger.info(`Executing migration: ${migration.version} - ${migration.description}`);
  
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  
  // Execute the entire migration as a single transaction
  try {
    await db.execute(sql.raw(migrationSQL));
    logger.info(`Migration ${migration.version} completed successfully`);
  } catch (error: unknown) {
    logger.error(`Migration ${migration.version} failed:`, error);
    throw error;
  }
}

/**
 * Run all pending database migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Starting consolidated database migration system...');

    // Test database connection
    await db.execute(sql`SELECT 1`);
    logger.info('Database connection verified');

    let migrationsRun = 0;
    
    for (const migration of MIGRATIONS) {
      try {
        const applied = await isMigrationApplied(migration.version);
        
        if (!applied) {
          await executeMigration(migration);
          migrationsRun++;
        } else {
          logger.debug(`Migration ${migration.version} already applied, skipping`);
        }
      } catch (error: unknown) {
        logger.error(`Failed to apply migration ${migration.version}:`, error);
        
        // For production stability, continue with other migrations
        // Log the error but don't stop the entire migration process
        if (process.env.NODE_ENV === 'production') {
          logger.warn(`Continuing with remaining migrations despite error in ${migration.version}`);
          continue;
        } else {
          throw error;
        }
      }
    }
    
    if (migrationsRun > 0) {
      logger.info(`Database migrations completed: ${migrationsRun} migrations applied`);
    } else {
      logger.info('Database schema is up to date, no migrations needed');
    }
    
  } catch (error) {
    logger.error('Database migration system failed:', error);
    
    // In production, don't crash the app for migration failures
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Migration failures in production - app will continue with existing schema');
    } else {
      throw error;
    }
  }
}

/**
 * Initialize database - runs migrations and sets up initial data
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Run migrations first - this includes skill categories setup
    await runMigrations();
    
    logger.info('Database initialization completed successfully');
    
  } catch (error) {
    logger.error('Database initialization failed:', error);
    
    // In production, continue running even if initialization fails
    if (process.env.NODE_ENV === 'production') {
      logger.warn('Database initialization failed but continuing in production mode');
    } else {
      throw error;
    }
  }
}

/**
 * Get migration status for monitoring/debugging
 */
export async function getMigrationStatus(): Promise<{
  appliedMigrations: string[];
  pendingMigrations: string[];
  lastMigration?: { version: string; appliedAt: string };
}> {
  try {
    const appliedResult = await db.execute(sql`
      SELECT version, applied_at 
      FROM schema_migrations 
      ORDER BY applied_at DESC
    `);
    
    const appliedMigrations = appliedResult.map((row: Record<string, unknown>) => row.version as string);
    const pendingMigrations = MIGRATIONS
      .filter(m => !appliedMigrations.includes(m.version))
      .map(m => m.version);
    
    const lastMigration = appliedResult[0] ? {
      version: appliedResult[0].version,
      appliedAt: appliedResult[0].applied_at
    } : undefined;
    
    return {
      appliedMigrations,
      pendingMigrations,
      lastMigration
    };
  } catch (error) {
    logger.error('Failed to get migration status:', error);
    return {
      appliedMigrations: [],
      pendingMigrations: MIGRATIONS.map(m => m.version),
      lastMigration: undefined
    };
  }
}