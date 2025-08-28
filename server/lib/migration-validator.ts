/**
 * Phase 1.2: Migration integrity validation system
 * Provides comprehensive validation of database schema state and migration integrity
 */

import { getDatabase } from "../database";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    totalTables: number;
    totalIndexes: number;
    totalConstraints: number;
    migrationCount: number;
  };
}

/**
 * Comprehensive database schema validation
 */
export async function validateDatabaseIntegrity(): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    metrics: {
      totalTables: 0,
      totalIndexes: 0,
      totalConstraints: 0,
      migrationCount: 0
    }
  };

  try {
    const db = getDatabase();
    logger.info("🔍 Starting comprehensive database integrity validation...");

    // 1. Validate migration system health
    await validateMigrationSystem(db, result);

    // 2. Validate essential tables exist
    await validateEssentialTables(db, result);

    // 3. Validate foreign key constraints
    await validateForeignKeyConstraints(db, result);

    // 4. Validate critical indexes
    await validateCriticalIndexes(db, result);

    // 5. Collect metrics
    await collectSchemaMetrics(db, result);

    // 6. Run health checks from Migration 012
    await runMigrationHealthChecks(db, result);

    result.isValid = result.errors.length === 0;

    if (result.isValid) {
      logger.info("✅ Database integrity validation passed", {
        warnings: result.warnings.length,
        metrics: result.metrics
      });
    } else {
      logger.error("❌ Database integrity validation failed", {
        errors: result.errors.length,
        warnings: result.warnings.length
      });
    }

    return result;

  } catch (error) {
    result.isValid = false;
    result.errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    logger.error("❌ Database validation error:", error);
    return result;
  }
}

/**
 * Validate migration system health
 */
async function validateMigrationSystem(db: any, result: ValidationResult): Promise<void> {
  try {
    // Check schema_migrations table exists
    const migrationTableQuery = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_name = 'schema_migrations' AND table_schema = 'public'
    `);
    
    if (!migrationTableQuery.rows || migrationTableQuery.rows[0]?.count === '0') {
      result.errors.push("schema_migrations table is missing");
      return;
    }

    // Check migration execution log exists (Migration 012)
    const logTableQuery = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_name = 'migration_execution_log' AND table_schema = 'public'
    `);
    
    if (!logTableQuery.rows || logTableQuery.rows[0]?.count === '0') {
      result.warnings.push("migration_execution_log table is missing (Migration 012 may not be applied)");
    }

    // Count applied migrations
    const migrationCountQuery = await db.execute(sql`
      SELECT COUNT(*) as count FROM schema_migrations
    `);
    
    result.metrics.migrationCount = parseInt(migrationCountQuery.rows?.[0]?.count || '0');
    
    if (result.metrics.migrationCount < 5) {
      result.warnings.push(`Only ${result.metrics.migrationCount} migrations applied - may be incomplete`);
    }

  } catch (error) {
    result.errors.push(`Migration system validation failed: ${error}`);
  }
}

/**
 * Validate essential tables exist
 */
async function validateEssentialTables(db: any, result: ValidationResult): Promise<void> {
  const essentialTables = [
    'users',
    'resumes', 
    'job_descriptions',
    'analysis_results',
    'skills',
    'skill_categories'
  ];

  for (const tableName of essentialTables) {
    try {
      const query = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM information_schema.tables 
        WHERE table_name = ${tableName} AND table_schema = 'public'
      `);
      
      if (!query.rows || query.rows[0]?.count === '0') {
        result.errors.push(`Essential table '${tableName}' is missing`);
      }
    } catch (error) {
      result.errors.push(`Failed to check table '${tableName}': ${error}`);
    }
  }
}

/**
 * Validate foreign key constraints
 */
async function validateForeignKeyConstraints(db: any, result: ValidationResult): Promise<void> {
  try {
    const constraintsQuery = await db.execute(sql`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu 
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      ORDER BY tc.table_name, tc.constraint_name
    `);

    result.metrics.totalConstraints = constraintsQuery.rows?.length || 0;
    
    // Expected minimum foreign key constraints
    const expectedConstraints = [
      { table: 'resumes', references: 'users' },
      { table: 'job_descriptions', references: 'users' },
      { table: 'analysis_results', references: 'resumes' },
      { table: 'analysis_results', references: 'job_descriptions' },
      { table: 'skills', references: 'skill_categories' }
    ];

    for (const expected of expectedConstraints) {
      const found = constraintsQuery.rows?.some((row: any) => 
        row.table_name === expected.table && 
        row.foreign_table_name === expected.references
      );
      
      if (!found) {
        result.warnings.push(`Missing foreign key: ${expected.table} -> ${expected.references}`);
      }
    }

    if (result.metrics.totalConstraints < 5) {
      result.warnings.push(`Only ${result.metrics.totalConstraints} foreign key constraints found - may be incomplete`);
    }

  } catch (error) {
    result.errors.push(`Foreign key validation failed: ${error}`);
  }
}

/**
 * Validate critical indexes exist
 */
async function validateCriticalIndexes(db: any, result: ValidationResult): Promise<void> {
  try {
    const indexQuery = await db.execute(sql`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    result.metrics.totalIndexes = indexQuery.rows?.length || 0;
    
    // Check for critical performance indexes from Migration 013
    const criticalIndexes = [
      'idx_resumes_user_metadata_covering',
      'idx_analysis_complete_dashboard',
      'idx_skills_aliases_gin'
    ];

    let foundCriticalIndexes = 0;
    for (const indexName of criticalIndexes) {
      const found = indexQuery.rows?.some((row: any) => row.indexname === indexName);
      if (found) {
        foundCriticalIndexes++;
      } else {
        result.warnings.push(`Missing critical performance index: ${indexName}`);
      }
    }

    if (foundCriticalIndexes < criticalIndexes.length) {
      result.warnings.push(`Missing ${criticalIndexes.length - foundCriticalIndexes} critical performance indexes`);
    }

  } catch (error) {
    result.errors.push(`Index validation failed: ${error}`);
  }
}

/**
 * Collect schema metrics
 */
async function collectSchemaMetrics(db: any, result: ValidationResult): Promise<void> {
  try {
    // Count total tables
    const tableQuery = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    result.metrics.totalTables = parseInt(tableQuery.rows?.[0]?.count || '0');

  } catch (error) {
    result.warnings.push(`Failed to collect schema metrics: ${error}`);
  }
}

/**
 * Run Migration 012 health checks
 */
async function runMigrationHealthChecks(db: any, result: ValidationResult): Promise<void> {
  try {
    // Use the health check function from Migration 012 if available
    const healthQuery = await db.execute(sql`
      SELECT * FROM check_migration_health()
    `);

    if (healthQuery.rows) {
      for (const row of healthQuery.rows) {
        if (row.status === 'ERROR') {
          result.errors.push(`Migration health check failed: ${row.check_name} - ${row.details}`);
        } else if (row.status === 'WARNING') {
          result.warnings.push(`Migration health warning: ${row.check_name} - ${row.details}`);
        }
      }
    }

  } catch (error) {
    result.warnings.push(`Migration 012 health checks not available: ${error}`);
  }
}

/**
 * Get validation summary for monitoring
 */
export function getValidationSummary(result: ValidationResult): object {
  return {
    valid: result.isValid,
    errorCount: result.errors.length,
    warningCount: result.warnings.length,
    tables: result.metrics.totalTables,
    indexes: result.metrics.totalIndexes,
    constraints: result.metrics.totalConstraints,
    migrations: result.metrics.migrationCount,
    timestamp: new Date().toISOString()
  };
}