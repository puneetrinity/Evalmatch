/**
 * BUSINESS LOGIC: Admin Service Layer
 * Handles all administrative operations with Result pattern integration
 * 
 * @fileoverview This service encapsulates all business logic related to
 * administrative operations like database fixes, system status checks, 
 * and debugging utilities. It provides a clean interface for route handlers.
 */

import { logger } from '../lib/logger';
import { 
  Result, 
  success,
  failure,
  fromPromise
} from '@shared/result-types';
import {
  AppBusinessLogicError,
  AppExternalServiceError,
  toAppError
} from '@shared/errors';

// Prefix unused imports to silence warnings
const _success = success;
const _failure = failure;
const _AppBusinessLogicError = AppBusinessLogicError;
const _toAppError = toAppError;

// ===== SERVICE INPUT TYPES =====

/**
 * Result of database fix operation
 */
export interface DatabaseFixResult {
  status: 'completed' | 'partial' | 'failed';
  message: string;
  fixes: string[];
  timestamp: string;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
}

/**
 * System status information
 */
export interface SystemStatusResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    duration?: number;
  }>;
  uptime: number;
  version?: string;
}

// ===== ADMIN SERVICE CLASS =====

/**
 * Service class for handling all admin-related business logic
 * Provides clean separation between route handlers and business operations
 */
export class AdminService {
  
  constructor() {}

  /**
   * Performs comprehensive database fixes and schema updates
   * 
   * @returns Result containing fix results or error
   */
  async fixDatabase(): Promise<Result<DatabaseFixResult, any>> {
    const startTime = Date.now();
    
    logger.info('Starting database fix operation');

    const fixes: string[] = [];
    let successfulOperations = 0;
    let failedOperations = 0;

    return await fromPromise(
      (async () => {
        // Import database utilities
        const { getDatabase } = await import("../database");
        const db = getDatabase();
        const { sql } = await import("drizzle-orm");

        // Test database connection first
        await db.execute(sql`SELECT 1`);
        fixes.push("✅ Database connection verified");
        successfulOperations++;

        // Missing column fixes
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
          "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ];

        // Execute column fixes
        for (const columnQuery of missingColumnFixes) {
          try {
            await db.execute(sql.raw(columnQuery));
            fixes.push(`✅ ${columnQuery}`);
            successfulOperations++;
          } catch (error: unknown) {
            fixes.push(
              `ℹ️ Column already exists: ${columnQuery.split(" ")[4]} - ${error instanceof Error ? error.message : String(error)}`
            );
            failedOperations++; // Note: This is expected for existing columns
          }
        }

        // Index fixes
        const indexFixes = [
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resumes_user_id ON resumes(user_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resumes_session_id ON resumes(session_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_descriptions_user_id ON job_descriptions(user_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_user_id ON analysis_results(user_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_resume_id ON analysis_results(resume_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_job_description_id ON analysis_results(job_description_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analysis_results_created_at ON analysis_results(created_at)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_questions_user_id ON interview_questions(user_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_questions_resume_id ON interview_questions(resume_id)",
          "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interview_questions_job_description_id ON interview_questions(job_description_id)"
        ];

        // Execute index fixes
        for (const indexQuery of indexFixes) {
          try {
            await db.execute(sql.raw(indexQuery));
            fixes.push(`✅ ${indexQuery}`);
            successfulOperations++;
          } catch (error: unknown) {
            fixes.push(
              `ℹ️ Index already exists or failed: ${indexQuery.split(" ON ")[0]} - ${error instanceof Error ? error.message : String(error)}`
            );
            failedOperations++;
          }
        }

        const totalOperations = successfulOperations + failedOperations;
        const processingTime = Date.now() - startTime;

        logger.info('Database fix operation completed', {
          totalOperations,
          successfulOperations, 
          failedOperations,
          processingTime
        });

        return {
          status: failedOperations === 0 ? 'completed' : 'partial' as const,
          message: `Database fix completed with ${totalOperations} operations (${successfulOperations} successful, ${failedOperations} failed/skipped)`,
          fixes,
          timestamp: new Date().toISOString(),
          totalOperations,
          successfulOperations,
          failedOperations
        };
      })(),
      (error) => {
        logger.error('Database fix operation failed', error);
        return AppExternalServiceError.databaseFailure(
          'database_fix',
          error instanceof Error ? error.message : 'Database fix operation failed'
        );
      }
    );
  }

  /**
   * Performs comprehensive system health checks
   * 
   * @returns Result containing system status or error
   */
  async getSystemStatus(): Promise<Result<SystemStatusResult, any>> {
    const startTime = Date.now();
    const checks: SystemStatusResult['checks'] = [];
    
    logger.info('Starting system status check');

    return await fromPromise(
      (async () => {
        // Database connectivity check
        try {
          const checkStart = Date.now();
          const { getDatabase } = await import("../database");
          const db = getDatabase();
          const { sql } = await import("drizzle-orm");
          
          await db.execute(sql`SELECT 1`);
          checks.push({
            name: 'Database Connection',
            status: 'pass',
            message: 'Database is accessible and responding',
            duration: Date.now() - checkStart
          });
        } catch (error) {
          checks.push({
            name: 'Database Connection',
            status: 'fail',
            message: error instanceof Error ? error.message : 'Database connection failed',
            duration: Date.now() - startTime
          });
        }

        // AI Provider status checks
        const aiProviders = ['GROQ', 'OPENAI', 'ANTHROPIC'];
        for (const provider of aiProviders) {
          const hasApiKey = !!process.env[`${provider}_API_KEY`];
          checks.push({
            name: `${provider} API Key`,
            status: hasApiKey ? 'pass' : 'warn',
            message: hasApiKey ? 'API key configured' : 'API key not configured'
          });
        }

        // Memory usage check
        const memUsage = process.memoryUsage();
        const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const memStatus = memUsageMB > 500 ? 'warn' : 'pass';
        checks.push({
          name: 'Memory Usage',
          status: memStatus,
          message: `Heap usage: ${memUsageMB}MB`
        });

        // Determine overall system status
        const hasFailures = checks.some(check => check.status === 'fail');
        const hasWarnings = checks.some(check => check.status === 'warn');
        const overallStatus: SystemStatusResult['status'] = hasFailures ? 'unhealthy' : hasWarnings ? 'degraded' : 'healthy';

        const result = {
          status: overallStatus,
          timestamp: new Date().toISOString(),
          checks,
          uptime: process.uptime(),
          version: process.env.npm_package_version || 'unknown'
        };

        logger.info('System status check completed', {
          status: overallStatus,
          checksCount: checks.length,
          duration: Date.now() - startTime
        });

        return result;
      })(),
      (error) => {
        logger.error('System status check failed', error);
        return AppExternalServiceError.aiProviderFailure(
          'system_status',
          'check',
          error instanceof Error ? error.message : 'System status check failed'
        );
      }
    );
  }
}

// ===== SERVICE FACTORY =====

/**
 * Creates a new AdminService instance
 * @returns A new AdminService instance
 */
export function createAdminService(): AdminService {
  return new AdminService();
}