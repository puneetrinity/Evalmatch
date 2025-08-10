/**
 * Hybrid Storage
 * 
 * This module implements a hybrid storage approach that combines database storage
 * with in-memory fallback for improved reliability and performance.
 * 
 * Features:
 * - Automatically falls back to memory storage when database is unavailable
 * - Automatic recovery when database becomes available again
 * - Periodic database health checks to detect recovery
 * - Write operations are queued during outages and replayed on recovery
 */

import { IStorage, MemStorage } from './storage';
import { config } from './config/unified-config';
import { getPool, getConnectionStats } from './database';
import { logger } from './config/logger';
import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse,
  type User, type InsertUser, type SimpleBiasAnalysis
} from "@shared/schema";

// Enhanced database health tracking with recovery mechanisms
interface DatabaseHealthStatus {
  isAvailable: boolean;
  lastAvailableTime: number;
  failedOperations: number;
  successfulOperations: number;
  recoveryMode: boolean;
  queuedWrites: Array<() => Promise<void>>;
  // Enhanced tracking
  lastFailureTime: number | null;
  totalFailures: number;
  totalSuccesses: number;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  backoffMultiplier: number;
  lastBackoffDelay: number;
  consecutiveSuccesses: number;
  requiredSuccessesForRecovery: number;
}

const dbHealth: DatabaseHealthStatus = {
  isAvailable: true,
  lastAvailableTime: Date.now(),
  failedOperations: 0,
  successfulOperations: 0,
  recoveryMode: false,
  queuedWrites: [],
  // Enhanced tracking
  lastFailureTime: null,
  totalFailures: 0,
  totalSuccesses: 0,
  recoveryAttempts: 0,
  maxRecoveryAttempts: 5,
  backoffMultiplier: 1.5,
  lastBackoffDelay: 1000,
  consecutiveSuccesses: 0,
  requiredSuccessesForRecovery: 3,
};

/**
 * HybridStorage provides automatic fallback to in-memory storage
 * when database operations fail, with transparent recovery.
 */
export class HybridStorage implements IStorage {
  private dbStorage: IStorage;
  private memStorage: MemStorage;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(dbStorage: IStorage) {
    this.dbStorage = dbStorage;
    this.memStorage = new MemStorage();
    
    // Start health check process if database is enabled
    if (config.database.enabled) {
      this.startHealthChecks();
    }
  }
  
  /**
   * Start periodic database health checks
   */
  private startHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(async () => {
      await this.checkDatabaseHealth();
    }, 30000); // Check every 30 seconds
  }
  
  /**
   * Enhanced database health check with recovery logic
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      // Progressive health check with timeout
      const pool = getPool();
      if (!pool) {
        throw new Error('Pool not available');
      }
      
      // Use a timeout for health check operations
      const healthCheckPromise = pool.query('SELECT 1, NOW() as check_time');
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), 5000);
      });
      
      await Promise.race([healthCheckPromise, timeoutPromise]);
      
      // Successful health check - update metrics
      const responseTime = Date.now() - startTime;
      dbHealth.successfulOperations++;
      dbHealth.totalSuccesses++;
      dbHealth.consecutiveSuccesses++;
      
      // Reset failure counters on success
      if (dbHealth.failedOperations > 0) {
        logger.info(`Database health check recovered after ${dbHealth.failedOperations} failures`, {
          responseTime,
          consecutiveSuccesses: dbHealth.consecutiveSuccesses,
        });
      }
      dbHealth.failedOperations = 0;
      
      // Check if we should exit recovery mode
      if (!dbHealth.isAvailable && dbHealth.consecutiveSuccesses >= dbHealth.requiredSuccessesForRecovery) {
        logger.info(`Database fully recovered - ${dbHealth.consecutiveSuccesses} consecutive successes`);
        dbHealth.isAvailable = true;
        dbHealth.recoveryMode = false;
        dbHealth.lastAvailableTime = Date.now();
        dbHealth.recoveryAttempts = 0;
        dbHealth.lastBackoffDelay = 1000; // Reset backoff
        
        // Process any queued writes
        await this.processQueuedWrites();
      } else if (dbHealth.isAvailable) {
        // Still available, just update timestamp
        dbHealth.lastAvailableTime = Date.now();
      }
      
      return true;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Failed health check - update failure metrics
      dbHealth.failedOperations++;
      dbHealth.totalFailures++;
      dbHealth.lastFailureTime = Date.now();
      dbHealth.consecutiveSuccesses = 0; // Reset success counter
      
      console.warn(`Database health check failed`, {
        error: (error as Error).message,
        responseTime,
        consecutiveFailures: dbHealth.failedOperations,
        totalFailures: dbHealth.totalFailures,
      });
      
      // Determine if we should mark as unavailable
      const shouldMarkUnavailable = dbHealth.isAvailable && (
        dbHealth.failedOperations >= 3 || // 3 consecutive failures
        (error as Error).message.includes('timeout') // Immediate timeout
      );
      
      if (shouldMarkUnavailable) {
        console.error('Database marked as unavailable - falling back to in-memory storage', {
          reason: (error as Error).message.includes('timeout') ? 'timeout' : 'consecutive_failures',
          failedOperations: dbHealth.failedOperations,
        });
        
        dbHealth.isAvailable = false;
        dbHealth.recoveryMode = true;
        dbHealth.recoveryAttempts = 0;
      }
      
      return false;
    }
  }
  
  /**
   * Process any queued write operations after database recovery with enhanced error handling
   */
  private async processQueuedWrites() {
    if (dbHealth.queuedWrites.length === 0) return;
    
    const totalOperations = dbHealth.queuedWrites.length;
    logger.info(`Attempting to process ${totalOperations} queued write operations`);
    
    // Process in order, but don't let one failure block others
    const operations = [...dbHealth.queuedWrites];
    dbHealth.queuedWrites = []; // Clear the queue
    
    let successCount = 0;
    let failureCount = 0;
    const startTime = Date.now();
    
    // Process operations with limited concurrency to avoid overwhelming the database
    const batchSize = 5;
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      
      const results = await Promise.allSettled(
        batch.map(async (operation, index) => {
          try {
            await operation();
            return { success: true, index: i + index };
          } catch (error) {
            console.warn(`Failed to replay queued operation ${i + index}:`, {
              error: (error as Error).message,
              operationIndex: i + index,
            });
            return { success: false, index: i + index, error };
          }
        })
      );
      
      // Count results
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
        } else {
          failureCount++;
          // Re-queue failed operations that aren't critical errors
          const error = result.status === 'fulfilled' ? result.value.error : result.reason;
          if (error && !this.isCriticalError(error)) {
            // Add back to queue with exponential backoff
            const originalOperation = operations[result.status === 'fulfilled' ? result.value.index : -1];
            if (originalOperation && dbHealth.queuedWrites.length < 100) { // Prevent infinite queue growth
              setTimeout(() => {
                dbHealth.queuedWrites.push(originalOperation);
              }, Math.min(5000 * Math.pow(2, failureCount), 60000)); // Max 60s delay
            }
          }
        }
      });
      
      // Add delay between batches to avoid overwhelming the database
      if (i + batchSize < operations.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const duration = Date.now() - startTime;
    
    logger.info(`Queued write processing completed`, {
      totalOperations,
      successCount,
      failureCount,
      duration,
      remainingInQueue: dbHealth.queuedWrites.length,
    });
    
    // If too many failures, something might be wrong with the database
    if (failureCount > totalOperations * 0.5) {
      console.warn('High failure rate in queued write processing - database may still have issues', {
        failureRate: Math.round((failureCount / totalOperations) * 100),
        totalFailures: failureCount,
      });
    }
  }
  
  /**
   * Determine if an error is critical and shouldn't be retried
   */
  private isCriticalError(error: unknown): boolean {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Critical errors that shouldn't be retried
    const criticalPatterns = [
      'unique constraint',
      'foreign key constraint',
      'check constraint',
      'duplicate key',
      'invalid input syntax',
      'column does not exist',
      'table does not exist',
      'permission denied',
    ];
    
    return criticalPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern)
    );
  }
  
  /**
   * Execute a storage operation with enhanced fallback logic and recovery mechanisms
   */
  private async executeWithFallback<T>(
    operation: string,
    dbOperation: () => Promise<T>,
    memOperation: () => Promise<T>,
    isWrite = false
  ): Promise<T> {
    const startTime = Date.now();
    
    // If database is known to be unavailable, use memory storage directly
    if (!dbHealth.isAvailable) {
      console.debug(`Database unavailable, using memory storage for ${operation}`);
      const result = await memOperation();
      
      // For write operations, queue for eventual replay if queue isn't full
      if (isWrite && dbHealth.queuedWrites.length < 1000) { // Prevent memory issues
        const queuedOperation = async () => {
          try {
            await dbOperation();
            console.debug(`Successfully replayed queued operation: ${operation}`);
          } catch (error) {
            console.warn(`Failed to replay queued operation ${operation}:`, {
              error: error instanceof Error ? error.message : String(error),
              isCritical: this.isCriticalError(error),
            });
            
            // If not a critical error, re-queue with backoff
            if (!this.isCriticalError(error)) {
              throw error; // Let the queue processor handle retry logic
            }
          }
        };
        
        dbHealth.queuedWrites.push(queuedOperation);
        
        // Limit queue size logging
        if (dbHealth.queuedWrites.length % 50 === 0) {
          console.info(`Write queue size: ${dbHealth.queuedWrites.length} operations`);
        }
      }
      
      return result;
    }
    
    // Attempt database operation with enhanced error handling
    try {
      const result = await dbOperation();
      const duration = Date.now() - startTime;
      
      // Successful operation - update health metrics
      dbHealth.successfulOperations++;
      dbHealth.totalSuccesses++;
      dbHealth.consecutiveSuccesses++;
      
      // Reset failure counters on success
      if (dbHealth.failedOperations > 0) {
        console.debug(`Database operation ${operation} succeeded after ${dbHealth.failedOperations} failures`, {
          duration,
          consecutiveSuccesses: dbHealth.consecutiveSuccesses,
        });
        dbHealth.failedOperations = 0;
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      console.warn(`Database operation ${operation} failed, falling back to memory storage`, {
        error: errorMessage,
        duration,
        consecutiveFailures: dbHealth.failedOperations + 1,
        totalFailures: dbHealth.totalFailures + 1,
      });
      
      // Enhanced error analysis
      const isTimeoutError = errorMessage.includes('timeout');
      const isConnectionError = errorMessage.includes('connection') || errorMessage.includes('pool');
      const isCritical = this.isCriticalError(error);
      
      // Update health tracking with error categorization
      dbHealth.failedOperations++;
      dbHealth.totalFailures++;
      dbHealth.lastFailureTime = Date.now();
      dbHealth.consecutiveSuccesses = 0;
      
      // Determine if database should be marked unavailable
      let shouldMarkUnavailable = false;
      
      if (isTimeoutError) {
        // Immediate failover for timeouts
        shouldMarkUnavailable = true;
        console.warn(`Database timeout detected, immediate failover for ${operation}`);
      } else if (isConnectionError && dbHealth.failedOperations >= 2) {
        // Quick failover for connection issues
        shouldMarkUnavailable = true;
        console.warn(`Connection issues detected, failover after ${dbHealth.failedOperations} failures`);
      } else if (dbHealth.failedOperations >= 5) {
        // General failover threshold
        shouldMarkUnavailable = true;
        console.error(`High failure rate detected, failover after ${dbHealth.failedOperations} failures`);
      }
      
      if (shouldMarkUnavailable && dbHealth.isAvailable) {
        dbHealth.isAvailable = false;
        dbHealth.recoveryMode = true;
        dbHealth.recoveryAttempts = 0;
        
        console.error(`Database marked as unavailable`, {
          reason: isTimeoutError ? 'timeout' : isConnectionError ? 'connection_error' : 'consecutive_failures',
          failedOperations: dbHealth.failedOperations,
          operation,
        });
        
        // Schedule immediate health check with backoff
        const backoffDelay = Math.min(dbHealth.lastBackoffDelay * dbHealth.backoffMultiplier, 30000);
        dbHealth.lastBackoffDelay = backoffDelay;
        
        setTimeout(() => {
          this.checkDatabaseHealth().catch(err => {
            console.warn('Scheduled health check failed:', err);
          });
        }, backoffDelay);
      }
      
      // Execute fallback operation
      try {
        const result = await memOperation();
        
        // Queue write operations for replay (if not critical error)
        if (isWrite && !isCritical && dbHealth.queuedWrites.length < 1000) {
          const queuedOperation = async () => {
            try {
              await dbOperation();
            } catch (replayError) {
              console.warn(`Queued operation ${operation} failed on replay:`, {
                error: replayError instanceof Error ? replayError.message : String(replayError),
                originalError: errorMessage,
              });
              throw replayError;
            }
          };
          
          dbHealth.queuedWrites.push(queuedOperation);
        }
        
        return result;
      } catch (memoryError) {
        console.error(`Both database and memory operations failed for ${operation}:`, {
          databaseError: errorMessage,
          memoryError: memoryError instanceof Error ? memoryError.message : String(memoryError),
        });
        
        // Re-throw the original database error as it's more relevant
        throw error;
      }
    }
  }
  
  // Storage interface implementation with fallback mechanisms
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.executeWithFallback(
      'getUser',
      () => this.dbStorage.getUser(id),
      () => this.memStorage.getUser(id)
    );
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.executeWithFallback(
      'getUserByUsername',
      () => this.dbStorage.getUserByUsername(username),
      () => this.memStorage.getUserByUsername(username)
    );
  }
  
  async createUser(user: InsertUser): Promise<User> {
    return this.executeWithFallback(
      'createUser',
      () => this.dbStorage.createUser(user),
      () => this.memStorage.createUser(user),
      true
    );
  }
  
  // Resume methods
  async getResume(id: number): Promise<Resume | undefined> {
    return this.executeWithFallback(
      'getResume',
      () => this.dbStorage.getResume(id),
      () => this.memStorage.getResume(id)
    );
  }

  async getResumeById(id: number, userId: string): Promise<Resume | undefined> {
    return this.executeWithFallback(
      `getResumeById(${id}, ${userId})`,
      () => this.dbStorage.getResumeById(id, userId),
      () => this.memStorage.getResumeById(id, userId)
    );
  }
  
  async getResumes(sessionId?: string): Promise<Resume[]> {
    return this.executeWithFallback(
      `getResumes(${sessionId})`,
      () => this.dbStorage.getResumes(sessionId),
      () => this.memStorage.getResumes(sessionId)
    );
  }
  
  async getResumesByUserId(userId: string, sessionId?: string, batchId?: string): Promise<Resume[]> {
    return this.executeWithFallback(
      `getResumesByUserId(${userId}, ${sessionId}, ${batchId})`,
      () => this.dbStorage.getResumesByUserId(userId, sessionId, batchId),
      () => this.memStorage.getResumesByUserId(userId, sessionId, batchId)
    );
  }
  
  async createResume(resume: InsertResume): Promise<Resume> {
    return this.executeWithFallback(
      `createResume(${resume.filename})`,
      () => this.dbStorage.createResume(resume),
      () => this.memStorage.createResume(resume),
      true
    );
  }
  
  async updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume> {
    return this.executeWithFallback(
      `updateResumeAnalysis(${id})`,
      () => this.dbStorage.updateResumeAnalysis(id, analysis),
      () => this.memStorage.updateResumeAnalysis(id, analysis),
      true
    );
  }
  
  // Job description methods
  async getJobDescription(id: number): Promise<JobDescription | undefined> {
    return this.executeWithFallback(
      'getJobDescription',
      () => this.dbStorage.getJobDescription(id),
      () => this.memStorage.getJobDescription(id)
    );
  }

  async getJobDescriptionById(id: number, userId: string): Promise<JobDescription | undefined> {
    return this.executeWithFallback(
      `getJobDescriptionById(${id}, ${userId})`,
      () => this.dbStorage.getJobDescriptionById(id, userId),
      () => this.memStorage.getJobDescriptionById(id, userId)
    );
  }
  
  async getJobDescriptions(): Promise<JobDescription[]> {
    return this.executeWithFallback(
      'getJobDescriptions',
      () => this.dbStorage.getJobDescriptions(),
      () => this.memStorage.getJobDescriptions()
    );
  }
  
  async getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]> {
    return this.executeWithFallback(
      `getJobDescriptionsByUserId(${userId})`,
      () => this.dbStorage.getJobDescriptionsByUserId(userId),
      () => this.memStorage.getJobDescriptionsByUserId(userId)
    );
  }
  
  async createJobDescription(jobDescription: InsertJobDescription): Promise<JobDescription> {
    return this.executeWithFallback(
      `createJobDescription(${jobDescription.title})`,
      () => this.dbStorage.createJobDescription(jobDescription),
      () => this.memStorage.createJobDescription(jobDescription),
      true
    );
  }

  async updateJobDescription(id: number, updates: Partial<JobDescription>): Promise<JobDescription> {
    return this.executeWithFallback(
      `updateJobDescription(${id})`,
      () => this.dbStorage.updateJobDescription(id, updates),
      () => this.memStorage.updateJobDescription(id, updates),
      true
    );
  }

  async deleteJobDescription(id: number): Promise<void> {
    return this.executeWithFallback(
      `deleteJobDescription(${id})`,
      () => this.dbStorage.deleteJobDescription(id),
      () => this.memStorage.deleteJobDescription(id),
      true
    );
  }
  
  async updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription> {
    return this.executeWithFallback(
      `updateJobDescriptionAnalysis(${id})`,
      () => this.dbStorage.updateJobDescriptionAnalysis(id, analysis),
      () => this.memStorage.updateJobDescriptionAnalysis(id, analysis),
      true
    );
  }
  
  async updateJobDescriptionBiasAnalysis(id: number, biasAnalysis: SimpleBiasAnalysis): Promise<JobDescription> {
    return this.executeWithFallback(
      `updateJobDescriptionBiasAnalysis(${id})`,
      () => this.dbStorage.updateJobDescriptionBiasAnalysis(id, biasAnalysis),
      () => this.memStorage.updateJobDescriptionBiasAnalysis(id, biasAnalysis),
      true
    );
  }
  
  // Analysis results methods
  async getAnalysisResult(id: number): Promise<AnalysisResult | undefined> {
    return this.executeWithFallback(
      'getAnalysisResult',
      () => this.dbStorage.getAnalysisResult(id),
      () => this.memStorage.getAnalysisResult(id)
    );
  }

  async getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId: string): Promise<AnalysisResult | undefined> {
    return this.executeWithFallback(
      `getAnalysisResultByJobAndResume(${jobId}, ${resumeId}, ${userId})`,
      () => this.dbStorage.getAnalysisResultByJobAndResume(jobId, resumeId, userId),
      () => this.memStorage.getAnalysisResultByJobAndResume(jobId, resumeId, userId)
    );
  }

  async getAnalysisResultsByJob(jobId: number, userId: string, sessionId?: string, batchId?: string): Promise<AnalysisResult[]> {
    return this.executeWithFallback(
      `getAnalysisResultsByJob(${jobId}, ${userId}, ${sessionId}, ${batchId})`,
      () => this.dbStorage.getAnalysisResultsByJob(jobId, userId, sessionId, batchId),
      () => this.memStorage.getAnalysisResultsByJob(jobId, userId, sessionId, batchId)
    );
  }
  
  async getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]> {
    return this.executeWithFallback(
      `getAnalysisResultsByResumeId(${resumeId})`,
      () => this.dbStorage.getAnalysisResultsByResumeId(resumeId),
      () => this.memStorage.getAnalysisResultsByResumeId(resumeId)
    );
  }
  
  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]> {
    return this.executeWithFallback(
      `getAnalysisResultsByJobDescriptionId(${jobDescriptionId})`,
      () => this.dbStorage.getAnalysisResultsByJobDescriptionId(jobDescriptionId),
      () => this.memStorage.getAnalysisResultsByJobDescriptionId(jobDescriptionId)
    );
  }
  
  async createAnalysisResult(analysisResult: InsertAnalysisResult): Promise<AnalysisResult> {
    logger.info('🔍 HybridStorage.createAnalysisResult called with:', {
      userId: analysisResult.userId,
      resumeId: analysisResult.resumeId,
      jobDescriptionId: analysisResult.jobDescriptionId
    });
    return this.executeWithFallback(
      'createAnalysisResult',
      () => this.dbStorage.createAnalysisResult(analysisResult),
      () => this.memStorage.createAnalysisResult(analysisResult),
      true
    );
  }
  
  // Interview questions methods
  async getInterviewQuestions(id: number): Promise<InterviewQuestions | undefined> {
    return this.executeWithFallback(
      'getInterviewQuestions',
      () => this.dbStorage.getInterviewQuestions(id),
      () => this.memStorage.getInterviewQuestions(id)
    );
  }
  
  async getInterviewQuestionsByResumeId(resumeId: number): Promise<InterviewQuestions[]> {
    return this.executeWithFallback(
      `getInterviewQuestionsByResumeId(${resumeId})`,
      () => this.dbStorage.getInterviewQuestionsByResumeId(resumeId),
      () => this.memStorage.getInterviewQuestionsByResumeId(resumeId)
    );
  }
  
  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]> {
    return this.executeWithFallback(
      `getInterviewQuestionsByJobDescriptionId(${jobDescriptionId})`,
      () => this.dbStorage.getInterviewQuestionsByJobDescriptionId(jobDescriptionId),
      () => this.memStorage.getInterviewQuestionsByJobDescriptionId(jobDescriptionId)
    );
  }
  
  async getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<InterviewQuestions | undefined> {
    return this.executeWithFallback(
      `getInterviewQuestionByResumeAndJob(${resumeId}, ${jobDescriptionId})`,
      () => this.dbStorage.getInterviewQuestionByResumeAndJob(resumeId, jobDescriptionId),
      () => this.memStorage.getInterviewQuestionByResumeAndJob(resumeId, jobDescriptionId)
    );
  }
  
  async createInterviewQuestions(interviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions> {
    return this.executeWithFallback(
      'createInterviewQuestions',
      () => this.dbStorage.createInterviewQuestions(interviewQuestions),
      () => this.memStorage.createInterviewQuestions(interviewQuestions),
      true
    );
  }
  
  // Combination methods
  async getResumeWithLatestAnalysisAndQuestions(resumeId: number, jobDescriptionId: number): Promise<{ resume: Resume; analysis: AnalysisResult | undefined; questions: InterviewQuestions | undefined; }> {
    const result = await this.executeWithFallback(
      `getResumeWithLatestAnalysisAndQuestions(${resumeId}, ${jobDescriptionId})`,
      () => this.dbStorage.getResumeWithLatestAnalysisAndQuestions(resumeId, jobDescriptionId),
      () => this.memStorage.getResumeWithLatestAnalysisAndQuestions(resumeId, jobDescriptionId)
    );
    
    // Map interviewQuestions to questions to match interface
    return {
      resume: result.resume,
      analysis: result.analysis,
      questions: result.questions
    };
  }
  
  /**
   * Get comprehensive database health status for monitoring
   */
  getDbHealthStatus() {
    const now = Date.now();
    const uptime = dbHealth.lastAvailableTime ? now - dbHealth.lastAvailableTime : 0;
    const downtime = dbHealth.lastFailureTime && !dbHealth.isAvailable ? 
      now - dbHealth.lastFailureTime : 0;
    
    // Calculate health metrics
    const totalOperations = dbHealth.totalSuccesses + dbHealth.totalFailures;
    const successRate = totalOperations > 0 ? 
      (dbHealth.totalSuccesses / totalOperations) * 100 : 100;
    
    // Determine overall health status
    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'recovering';
    
    if (!dbHealth.isAvailable) {
      healthStatus = dbHealth.recoveryMode ? 'recovering' : 'unhealthy';
    } else if (dbHealth.failedOperations > 0 || successRate < 95) {
      healthStatus = 'degraded';
    } else {
      healthStatus = 'healthy';
    }
    
    return {
      // Current status
      status: healthStatus,
      isAvailable: dbHealth.isAvailable,
      recoveryMode: dbHealth.recoveryMode,
      
      // Timing information
      lastAvailableTime: dbHealth.lastAvailableTime,
      lastFailureTime: dbHealth.lastFailureTime,
      uptime: Math.round(uptime / 1000), // seconds
      downtime: Math.round(downtime / 1000), // seconds
      
      // Operation counters
      successfulOperations: dbHealth.successfulOperations,
      failedOperations: dbHealth.failedOperations,
      totalSuccesses: dbHealth.totalSuccesses,
      totalFailures: dbHealth.totalFailures,
      consecutiveSuccesses: dbHealth.consecutiveSuccesses,
      
      // Health metrics
      successRate: Math.round(successRate * 100) / 100,
      failureRate: Math.round((100 - successRate) * 100) / 100,
      
      // Recovery information
      recoveryAttempts: dbHealth.recoveryAttempts,
      maxRecoveryAttempts: dbHealth.maxRecoveryAttempts,
      requiredSuccessesForRecovery: dbHealth.requiredSuccessesForRecovery,
      lastBackoffDelay: dbHealth.lastBackoffDelay,
      
      // Write queue
      queuedWritesCount: dbHealth.queuedWrites.length,
      queueStatus: dbHealth.queuedWrites.length === 0 ? 'empty' :
                   dbHealth.queuedWrites.length < 100 ? 'normal' :
                   dbHealth.queuedWrites.length < 500 ? 'high' : 'critical',
      
      // Connection statistics (if available)
      connectionStats: (() => {
        try {
          return getConnectionStats();
        } catch (error) {
          return null;
        }
      })(),
      
      // Recommendations
      recommendations: this.getHealthRecommendations(healthStatus, successRate),
    };
  }
  
  /**
   * Get health-based recommendations for monitoring
   */
  private getHealthRecommendations(
    healthStatus: string, 
    successRate: number
  ): string[] {
    const recommendations = [];
    
    if (healthStatus === 'unhealthy') {
      recommendations.push('Database is unavailable - investigate connection issues immediately');
      recommendations.push('Check database server status and network connectivity');
      if (dbHealth.queuedWrites.length > 0) {
        recommendations.push(`${dbHealth.queuedWrites.length} operations are queued for replay`);
      }
    } else if (healthStatus === 'recovering') {
      recommendations.push('Database is in recovery mode - monitor closely');
      recommendations.push(`Need ${dbHealth.requiredSuccessesForRecovery - dbHealth.consecutiveSuccesses} more successes for full recovery`);
    } else if (healthStatus === 'degraded') {
      if (successRate < 90) {
        recommendations.push('Low success rate - investigate query performance and connection stability');
      }
      if (dbHealth.failedOperations > 0) {
        recommendations.push(`${dbHealth.failedOperations} recent failures detected - monitor for patterns`);
      }
    }
    
    if (dbHealth.queuedWrites.length > 100) {
      recommendations.push('High number of queued writes - may indicate persistent database issues');
    } else if (dbHealth.queuedWrites.length > 500) {
      recommendations.push('Critical queue size - immediate attention required to prevent data loss');
    }
    
    if (dbHealth.recoveryAttempts > 3) {
      recommendations.push('Multiple recovery attempts - consider manual intervention');
    }
    
    return recommendations;
  }
  
  // Missing embedding methods required by IStorage interface
  async updateResumeEmbeddings(id: number, embedding: number[] | null, skillsEmbedding: number[] | null): Promise<Resume> {
    if (dbHealth.isAvailable) {
      try {
        return await this.dbStorage.updateResumeEmbeddings(id, embedding, skillsEmbedding);
      } catch (error) {
        console.warn('Database updateResumeEmbeddings failed, falling back to memory storage', error);
        dbHealth.failedOperations++;
        if (dbHealth.failedOperations >= 3) {
          dbHealth.isAvailable = false;
        }
      }
    }
    
    // Fallback to memory storage
    return await this.memStorage.updateResumeEmbeddings(id, embedding, skillsEmbedding);
  }
  
  async updateJobDescriptionEmbeddings(id: number, embedding: number[] | null, requirementsEmbedding: number[] | null): Promise<JobDescription> {
    if (dbHealth.isAvailable) {
      try {
        return await this.dbStorage.updateJobDescriptionEmbeddings(id, embedding, requirementsEmbedding);
      } catch (error) {
        console.warn('Database updateJobDescriptionEmbeddings failed, falling back to memory storage', error);
        dbHealth.failedOperations++;
        if (dbHealth.failedOperations >= 3) {
          dbHealth.isAvailable = false;
        }
      }
    }
    
    // Fallback to memory storage  
    return await this.memStorage.updateJobDescriptionEmbeddings(id, embedding, requirementsEmbedding);
  }
}