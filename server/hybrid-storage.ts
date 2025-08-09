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
import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse,
  type User, type InsertUser, type SimpleBiasAnalysis
} from "@shared/schema";

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
      const pool = getPool();
      if (pool) {
        await pool.query('SELECT 1');
      } else {
        throw new Error('Pool not available');
      }
      
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
   * Get current database health status
   */
  getDbHealthStatus() {
    return {
      ...dbHealth,
      connectionStats: getConnectionStats(),
      queuedWritesCount: dbHealth.queuedWrites.length,
    };
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