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
import { config } from './config';
import { pool, getConnectionStats } from './db';

// Keep track of database health
const dbHealth = {
  isAvailable: true,              // Current database availability status
  lastAvailableTime: Date.now(),  // Last time database was verified as available
  failedOperations: 0,            // Count of consecutive failed operations
  successfulOperations: 0,        // Count of consecutive successful operations
  recoveryMode: false,            // Whether we're actively trying to recover
  queuedWrites: [] as (() => Promise<void>)[],  // Operations to replay on recovery
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
    if (config.isDatabaseEnabled) {
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
   * Check if the database is available
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      // Simple health check query
      await pool.query('SELECT 1');
      
      // Update health status
      if (!dbHealth.isAvailable) {
        console.log('Database connection recovered, switching back to database storage');
        dbHealth.isAvailable = true;
        dbHealth.lastAvailableTime = Date.now();
        
        // Process any queued writes
        await this.processQueuedWrites();
      }
      
      dbHealth.successfulOperations++;
      dbHealth.failedOperations = 0;
      return true;
    } catch (error) {
      dbHealth.failedOperations++;
      dbHealth.successfulOperations = 0;
      
      if (dbHealth.isAvailable) {
        console.warn('Database connection lost, falling back to in-memory storage');
        dbHealth.isAvailable = false;
      }
      
      return false;
    }
  }
  
  /**
   * Process any queued write operations after database recovery
   */
  private async processQueuedWrites() {
    if (dbHealth.queuedWrites.length === 0) return;
    
    console.log(`Attempting to process ${dbHealth.queuedWrites.length} queued write operations`);
    
    // Process in order, but don't let one failure block others
    const operations = [...dbHealth.queuedWrites];
    dbHealth.queuedWrites = []; // Clear the queue
    
    for (const operation of operations) {
      try {
        await operation();
      } catch (error) {
        console.error('Failed to replay queued operation:', error);
      }
    }
  }
  
  /**
   * Execute a storage operation with fallback to in-memory storage if database fails
   */
  private async executeWithFallback<T>(
    operation: string,
    dbOperation: () => Promise<T>,
    memOperation: () => Promise<T>,
    isWrite = false
  ): Promise<T> {
    // If we know the database is down, use memory directly
    if (!dbHealth.isAvailable) {
      const result = await memOperation();
      
      // For write operations, queue for eventual replay
      if (isWrite) {
        dbHealth.queuedWrites.push(async () => {
          try {
            await dbOperation();
          } catch (error) {
            console.error(`Failed to replay operation ${operation}:`, error);
          }
        });
      }
      
      return result;
    }
    
    // Attempt database operation first
    try {
      const result = await dbOperation();
      dbHealth.successfulOperations++;
      dbHealth.failedOperations = 0;
      return result;
    } catch (error) {
      console.error(`🚨 Database operation ${operation} failed, falling back to memory:`, error);
      if (operation === 'createAnalysisResult') {
        console.error('🔍 Analysis result creation failed - detailed error:', {
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : 'No stack'
        });
      }
      
      // Update health tracking
      dbHealth.failedOperations++;
      if (dbHealth.failedOperations >= 3) {
        dbHealth.isAvailable = false;
        // Trigger an immediate health check to verify
        setTimeout(() => this.checkDatabaseHealth(), 5000);
      }
      
      // Execute the in-memory version
      const result = await memOperation();
      
      // For write operations, queue for eventual replay
      if (isWrite) {
        dbHealth.queuedWrites.push(async () => {
          try {
            await dbOperation();
          } catch (error) {
            console.error(`Failed to replay operation ${operation}:`, error);
          }
        });
      }
      
      return result;
    }
  }
  
  // Storage interface implementation with fallback mechanisms
  // User methods
  async getUser(id: number): Promise<any | undefined> {
    return this.executeWithFallback(
      'getUser',
      () => this.dbStorage.getUser(id),
      () => this.memStorage.getUser(id)
    );
  }
  
  async getUserByUsername(username: string): Promise<any | undefined> {
    return this.executeWithFallback(
      'getUserByUsername',
      () => this.dbStorage.getUserByUsername(username),
      () => this.memStorage.getUserByUsername(username)
    );
  }
  
  async createUser(user: any): Promise<any> {
    return this.executeWithFallback(
      'createUser',
      () => this.dbStorage.createUser(user),
      () => this.memStorage.createUser(user),
      true
    );
  }
  
  // Resume methods
  async getResume(id: number): Promise<any | undefined> {
    return this.executeWithFallback(
      'getResume',
      () => this.dbStorage.getResume(id),
      () => this.memStorage.getResume(id)
    );
  }
  
  async getResumes(sessionId?: string): Promise<any[]> {
    return this.executeWithFallback(
      `getResumes(${sessionId})`,
      () => this.dbStorage.getResumes(sessionId),
      () => this.memStorage.getResumes(sessionId)
    );
  }
  
  async getResumesByUserId(userId: string, sessionId?: string): Promise<any[]> {
    return this.executeWithFallback(
      `getResumesByUserId(${userId}, ${sessionId})`,
      () => this.dbStorage.getResumesByUserId(userId, sessionId),
      () => this.memStorage.getResumesByUserId(userId, sessionId)
    );
  }
  
  async createResume(resume: any): Promise<any> {
    return this.executeWithFallback(
      `createResume(${resume.name})`,
      () => this.dbStorage.createResume(resume),
      () => this.memStorage.createResume(resume),
      true
    );
  }
  
  async updateResumeAnalysis(id: number, analysis: any): Promise<any> {
    return this.executeWithFallback(
      `updateResumeAnalysis(${id})`,
      () => this.dbStorage.updateResumeAnalysis(id, analysis),
      () => this.memStorage.updateResumeAnalysis(id, analysis),
      true
    );
  }
  
  // Job description methods
  async getJobDescription(id: number): Promise<any | undefined> {
    return this.executeWithFallback(
      'getJobDescription',
      () => this.dbStorage.getJobDescription(id),
      () => this.memStorage.getJobDescription(id)
    );
  }
  
  async getJobDescriptions(): Promise<any[]> {
    return this.executeWithFallback(
      'getJobDescriptions',
      () => this.dbStorage.getJobDescriptions(),
      () => this.memStorage.getJobDescriptions()
    );
  }
  
  async getJobDescriptionsByUserId(userId: string): Promise<any[]> {
    return this.executeWithFallback(
      `getJobDescriptionsByUserId(${userId})`,
      () => this.dbStorage.getJobDescriptionsByUserId(userId),
      () => this.memStorage.getJobDescriptionsByUserId(userId)
    );
  }
  
  async createJobDescription(jobDescription: any): Promise<any> {
    return this.executeWithFallback(
      `createJobDescription(${jobDescription.title})`,
      () => this.dbStorage.createJobDescription(jobDescription),
      () => this.memStorage.createJobDescription(jobDescription),
      true
    );
  }
  
  async updateJobDescriptionAnalysis(id: number, analysis: any): Promise<any> {
    return this.executeWithFallback(
      `updateJobDescriptionAnalysis(${id})`,
      () => this.dbStorage.updateJobDescriptionAnalysis(id, analysis),
      () => this.memStorage.updateJobDescriptionAnalysis(id, analysis),
      true
    );
  }
  
  // Analysis results methods
  async getAnalysisResult(id: number): Promise<any | undefined> {
    return this.executeWithFallback(
      'getAnalysisResult',
      () => this.dbStorage.getAnalysisResult(id),
      () => this.memStorage.getAnalysisResult(id)
    );
  }
  
  async getAnalysisResultsByResumeId(resumeId: number): Promise<any[]> {
    return this.executeWithFallback(
      `getAnalysisResultsByResumeId(${resumeId})`,
      () => this.dbStorage.getAnalysisResultsByResumeId(resumeId),
      () => this.memStorage.getAnalysisResultsByResumeId(resumeId)
    );
  }
  
  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<any[]> {
    return this.executeWithFallback(
      `getAnalysisResultsByJobDescriptionId(${jobDescriptionId})`,
      () => this.dbStorage.getAnalysisResultsByJobDescriptionId(jobDescriptionId),
      () => this.memStorage.getAnalysisResultsByJobDescriptionId(jobDescriptionId)
    );
  }
  
  async createAnalysisResult(analysisResult: any): Promise<any> {
    console.log('🔍 HybridStorage.createAnalysisResult called with:', {
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
  async getInterviewQuestions(id: number): Promise<any | undefined> {
    return this.executeWithFallback(
      'getInterviewQuestions',
      () => this.dbStorage.getInterviewQuestions(id),
      () => this.memStorage.getInterviewQuestions(id)
    );
  }
  
  async getInterviewQuestionsByResumeId(resumeId: number): Promise<any[]> {
    return this.executeWithFallback(
      `getInterviewQuestionsByResumeId(${resumeId})`,
      () => this.dbStorage.getInterviewQuestionsByResumeId(resumeId),
      () => this.memStorage.getInterviewQuestionsByResumeId(resumeId)
    );
  }
  
  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<any[]> {
    return this.executeWithFallback(
      `getInterviewQuestionsByJobDescriptionId(${jobDescriptionId})`,
      () => this.dbStorage.getInterviewQuestionsByJobDescriptionId(jobDescriptionId),
      () => this.memStorage.getInterviewQuestionsByJobDescriptionId(jobDescriptionId)
    );
  }
  
  async getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<any | undefined> {
    return this.executeWithFallback(
      `getInterviewQuestionByResumeAndJob(${resumeId}, ${jobDescriptionId})`,
      () => this.dbStorage.getInterviewQuestionByResumeAndJob(resumeId, jobDescriptionId),
      () => this.memStorage.getInterviewQuestionByResumeAndJob(resumeId, jobDescriptionId)
    );
  }
  
  async createInterviewQuestions(interviewQuestions: any): Promise<any> {
    return this.executeWithFallback(
      'createInterviewQuestions',
      () => this.dbStorage.createInterviewQuestions(interviewQuestions),
      () => this.memStorage.createInterviewQuestions(interviewQuestions),
      true
    );
  }
  
  // Combination methods
  async getResumeWithLatestAnalysisAndQuestions(resumeId: number, jobDescriptionId: number): Promise<any> {
    return this.executeWithFallback(
      `getResumeWithLatestAnalysisAndQuestions(${resumeId}, ${jobDescriptionId})`,
      () => this.dbStorage.getResumeWithLatestAnalysisAndQuestions(resumeId, jobDescriptionId),
      () => this.memStorage.getResumeWithLatestAnalysisAndQuestions(resumeId, jobDescriptionId)
    );
  }
  
  /**
   * Get current database health status
   */
  getDbHealthStatus() {
    return {
      ...dbHealth,
      connectionStats: getConnectionStats(),
      queuedWritesCount: dbHealth.queuedWrites.length,
    };
  }
}