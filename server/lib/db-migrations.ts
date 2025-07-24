import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";
import fs from 'fs';
import path from 'path';

/**
 * Run database migrations for enhanced features
 * Railway-compatible migration runner
 */
export async function runMigrations(): Promise<void> {
  try {
    logger.info('Starting database migrations...');

    // Check if we can connect to the database
    await db.execute(sql`SELECT 1`);
    logger.info('Database connection successful');

    // Read and execute migration file
    const migrationPath = path.join(process.cwd(), 'migrations', '0001_add_enhanced_features.sql');
    
    if (fs.existsSync(migrationPath)) {
      const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
      
      // Split by statement and execute each one
      const statements = migrationSQL.split(';').filter(stmt => stmt.trim().length > 0);
      
      for (const statement of statements) {
        try {
          await db.execute(sql.raw(statement.trim()));
        } catch (error: any) {
          // Ignore "already exists" errors
          if (!error.message?.includes('already exists') && !error.message?.includes('duplicate column')) {
            logger.warn(`Migration statement warning: ${error.message}`);
          }
        }
      }
      
      logger.info('Database migrations completed successfully');
    } else {
      logger.warn('Migration file not found, skipping database migrations');
    }
    
  } catch (error) {
    logger.error('Database migration failed:', error);
    // Don't throw error to allow app to start even if migrations fail
  }
}

/**
 * Initialize database with basic data if needed
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Run migrations first
    await runMigrations();
    
    // Check if skill categories exist
    const categoryCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM skill_categories
    `);
    
    if (Array.isArray(categoryCount) && categoryCount[0] && (categoryCount[0] as any).count === '0') {
      logger.info('Initializing basic skill categories...');
      
      // Insert basic skill categories
      await db.execute(sql`
        INSERT INTO skill_categories (name, level, description) VALUES
        ('Programming Languages', 0, 'Programming and scripting languages'),
        ('Frameworks & Libraries', 0, 'Software frameworks and libraries'),
        ('Databases', 0, 'Database technologies and systems'),
        ('Cloud Platforms', 0, 'Cloud computing platforms'),
        ('DevOps & Infrastructure', 0, 'DevOps tools and infrastructure'),
        ('Soft Skills', 0, 'Communication and interpersonal skills')
        ON CONFLICT (name) DO NOTHING
      `);
      
      logger.info('Basic skill categories initialized');
    }
    
  } catch (error) {
    logger.error('Database initialization failed:', error);
    // Don't throw to allow app to continue
  }
}