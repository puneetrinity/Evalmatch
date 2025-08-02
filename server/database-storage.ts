import { 
  users, resumes, jobDescriptions, analysisResults, interviewQuestions,
  type User, type InsertUser, 
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse,
  type SimpleBiasAnalysis
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { IStorage } from "./storage";
import { withRetry } from "./lib/db-retry";
import { logger } from "./lib/logger";

/**
 * PostgreSQL implementation of the storage interface
 */
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  
  // Resume methods
  async getResume(id: number): Promise<Resume | undefined> {
    return withRetry(async () => {
      const [resume] = await db.select().from(resumes).where(eq(resumes.id, id));
      return resume;
    }, `getResume(${id})`);
  }

  async getResumeById(id: number, userId: string): Promise<Resume | undefined> {
    return withRetry(async () => {
      const [resume] = await db.select()
        .from(resumes)
        .where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
      return resume;
    }, `getResumeById(${id}, ${userId})`);
  }
  
  async getResumes(sessionId?: string): Promise<Resume[]> {
    return withRetry(async () => {
      // If sessionId is provided, filter resumes by session
      if (sessionId) {
        console.log(`DatabaseStorage: Filtering resumes by sessionId: ${sessionId}`);
        return db.select()
          .from(resumes)
          .where(eq(resumes.sessionId, sessionId))
          .orderBy(desc(resumes.createdAt));
      }
      
      // Otherwise return all resumes
      return db.select().from(resumes).orderBy(desc(resumes.createdAt));
    }, `getResumes(${sessionId || 'all'})`);
  }
  
  async getResumesByUserId(userId: string, sessionId?: string, batchId?: string): Promise<Resume[]> {
    return withRetry(async () => {
      const conditions = [eq(resumes.userId, userId)];
      
      if (batchId) {
        conditions.push(eq(resumes.batchId, batchId));
      } else if (sessionId) {
        conditions.push(eq(resumes.sessionId, sessionId));
      }
      
      return db.select()
        .from(resumes)
        .where(and(...conditions))
        .orderBy(desc(resumes.createdAt));
    }, `getResumesByUserId(${userId}, ${sessionId || 'all'}, ${batchId || 'none'})`);
  }
  
  async createResume(insertResume: InsertResume): Promise<Resume> {
    return withRetry(async () => {
      logger.info('Creating resume in database', {
        filename: insertResume.filename,
        userId: insertResume.userId,
        sessionId: insertResume.sessionId,
        batchId: insertResume.batchId,
        hasContent: !!insertResume.content,
        contentLength: insertResume.content?.length || 0
      });
      
      const [resume] = await db.insert(resumes)
        .values({
          ...insertResume,
        })
        .returning();
        
      logger.info('Resume created successfully in database', {
        id: resume.id,
        filename: resume.filename,
        userId: resume.userId,
        sessionId: resume.sessionId
      });
      
      return resume;
    }, `createResume(${insertResume.filename})`);
  }
  
  async updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume> {
    return withRetry(async () => {
      const [updatedResume] = await db.update(resumes)
        .set({
          analyzedData: analysis
        })
        .where(eq(resumes.id, id))
        .returning();
      
      return updatedResume;
    }, `updateResumeAnalysis(${id})`);
  }
  
  // Job description methods
  async getJobDescription(id: number): Promise<JobDescription | undefined> {
    console.log(`DatabaseStorage: Looking up job description with ID ${id}`);
    return withRetry(async () => {
      try {
        const [jobDescription] = await db.select()
          .from(jobDescriptions)
          .where(eq(jobDescriptions.id, id));
        
        console.log(`DatabaseStorage: Job lookup result: ${jobDescription ? `Found job '${jobDescription.title}' with ID ${jobDescription.id}` : 'No job found'}`);
        return jobDescription;
      } catch (error) {
        console.error(`DatabaseStorage: Error fetching job description ${id}:`, error);
        throw error;
      }
    }, `getJobDescription(${id})`);
  }

  async getJobDescriptionById(id: number, userId: string): Promise<JobDescription | undefined> {
    console.log(`DatabaseStorage: Looking up job description with ID ${id} for user ${userId}`);
    return withRetry(async () => {
      try {
        const [jobDescription] = await db.select()
          .from(jobDescriptions)
          .where(and(eq(jobDescriptions.id, id), eq(jobDescriptions.userId, userId)));
        
        console.log(`DatabaseStorage: User-scoped job lookup result: ${jobDescription ? `Found job '${jobDescription.title}' with ID ${jobDescription.id}` : 'No job found for user'}`);
        return jobDescription;
      } catch (error) {
        console.error(`DatabaseStorage: Error fetching job description ${id} for user ${userId}:`, error);
        throw error;
      }
    }, `getJobDescriptionById(${id}, ${userId})`);
  }
  
  async getJobDescriptions(): Promise<JobDescription[]> {
    return withRetry(async () => {
      return db.select()
        .from(jobDescriptions)
        .orderBy(desc(jobDescriptions.createdAt));
    }, 'getJobDescriptions()');
  }
  
  async getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]> {
    return withRetry(async () => {
      return db.select()
        .from(jobDescriptions)
        .where(eq(jobDescriptions.userId, userId))
        .orderBy(desc(jobDescriptions.createdAt));
    }, `getJobDescriptionsByUserId(${userId})`);
  }
  
  async createJobDescription(insertJobDescription: InsertJobDescription): Promise<JobDescription> {
    return withRetry(async () => {
      logger.info('Creating job description in database', {
        title: insertJobDescription.title,
        userId: insertJobDescription.userId,
        hasDescription: !!insertJobDescription.description
      });
      
      const [jobDescription] = await db.insert(jobDescriptions)
        .values({
          ...insertJobDescription,
        })
        .returning();
        
      logger.info('Job description created successfully', {
        id: jobDescription.id,
        title: jobDescription.title,
        userId: jobDescription.userId
      });
      
      return jobDescription;
    }, `createJobDescription(${insertJobDescription.title})`);
  }

  async updateJobDescription(id: number, updates: Partial<JobDescription>): Promise<JobDescription> {
    return withRetry(async () => {
      const [updatedJobDescription] = await db.update(jobDescriptions)
        .set(updates)
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      return updatedJobDescription;
    }, `updateJobDescription(${id})`);
  }

  async deleteJobDescription(id: number): Promise<void> {
    return withRetry(async () => {
      await db.delete(jobDescriptions).where(eq(jobDescriptions.id, id));
    }, `deleteJobDescription(${id})`);
  }
  
  async updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription> {
    return withRetry(async () => {
      const [updatedJobDescription] = await db.update(jobDescriptions)
        .set({
          analyzedData: analysis
        })
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      return updatedJobDescription;
    }, `updateJobDescriptionAnalysis(${id})`);
  }

  async updateJobDescriptionBiasAnalysis(id: number, biasAnalysis: SimpleBiasAnalysis): Promise<JobDescription> {
    return withRetry(async () => {
      // First get the existing job description
      const [existingJob] = await db.select()
        .from(jobDescriptions)
        .where(eq(jobDescriptions.id, id));
      
      if (!existingJob) {
        throw new Error(`Job description with ID ${id} not found`);
      }
      
      // Safely merge bias analysis into existing analyzedData
      // Handle case where analyzedData is null
      const currentAnalyzedData = existingJob.analyzedData || {};
      const updatedAnalyzedData = {
        ...currentAnalyzedData,
        biasAnalysis: biasAnalysis
      };
      
      logger.info(`Updating job ${id} with bias analysis`, {
        hasExistingData: !!existingJob.analyzedData,
        biasAnalysisKeys: Object.keys(biasAnalysis)
      });
      
      const [updatedJobDescription] = await db.update(jobDescriptions)
        .set({
          analyzedData: updatedAnalyzedData
        })
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      logger.info(`Successfully updated job ${id} bias analysis`);
      return updatedJobDescription;
    }, `updateJobDescriptionBiasAnalysis(${id})`);
  }
  
  // Analysis result methods
  async getAnalysisResult(id: number): Promise<AnalysisResult | undefined> {
    return withRetry(async () => {
      const [analysisResult] = await db.select()
        .from(analysisResults)
        .where(eq(analysisResults.id, id));
      return analysisResult;
    }, `getAnalysisResult(${id})`);
  }

  async getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId: string): Promise<AnalysisResult | undefined> {
    return withRetry(async () => {
      const [analysisResult] = await db.select()
        .from(analysisResults)
        .where(and(
          eq(analysisResults.jobDescriptionId, jobId), 
          eq(analysisResults.resumeId, resumeId),
          eq(analysisResults.userId, userId)
        ));
      return analysisResult;
    }, `getAnalysisResultByJobAndResume(${jobId}, ${resumeId}, ${userId})`);
  }

  async getAnalysisResultsByJob(jobId: number, userId: string, sessionId?: string, batchId?: string): Promise<AnalysisResult[]> {
    return withRetry(async () => {
      const conditions = [
        eq(analysisResults.jobDescriptionId, jobId),
        eq(analysisResults.userId, userId)
      ];
      
      // Add batch or session filtering conditions for resumes
      const resumeConditions = [];
      if (batchId) {
        resumeConditions.push(eq(resumes.batchId, batchId));
      } else if (sessionId) {
        resumeConditions.push(eq(resumes.sessionId, sessionId));
      }
      
      const results = await db.select({
        ...analysisResults,
        resume: resumes
      })
        .from(analysisResults)
        .leftJoin(resumes, eq(analysisResults.resumeId, resumes.id))
        .where(and(
          ...conditions,
          ...(resumeConditions.length > 0 ? resumeConditions : [])
        ))
        .orderBy(desc(analysisResults.createdAt));
      
      // Transform the results to match the expected AnalysisResult type
      return results.map(result => ({
        ...result,
        resume: result.resume || undefined
      })) as AnalysisResult[];
    }, `getAnalysisResultsByJob(${jobId}, ${userId}, ${sessionId || 'all'}, ${batchId || 'none'})`);
  }
  
  async getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]> {
    return withRetry(async () => {
      return db.select()
        .from(analysisResults)
        .where(eq(analysisResults.resumeId, resumeId))
        .orderBy(desc(analysisResults.createdAt));
    }, `getAnalysisResultsByResumeId(${resumeId})`);
  }
  
  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]> {
    return withRetry(async () => {
      return db.select()
        .from(analysisResults)
        .where(eq(analysisResults.jobDescriptionId, jobDescriptionId))
        .orderBy(desc(analysisResults.createdAt));
    }, `getAnalysisResultsByJobDescriptionId(${jobDescriptionId})`);
  }
  
  async createAnalysisResult(insertAnalysisResult: InsertAnalysisResult): Promise<AnalysisResult> {
    return withRetry(async () => {
      const [analysisResult] = await db.insert(analysisResults)
        .values({
          ...insertAnalysisResult,
        })
        .returning();
      return analysisResult;
    }, 'createAnalysisResult()');
  }
  
  // Interview questions methods
  async getInterviewQuestions(id: number): Promise<InterviewQuestions | undefined> {
    return withRetry(async () => {
      const [interviewQuestion] = await db.select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.id, id));
      return interviewQuestion;
    }, `getInterviewQuestions(${id})`);
  }
  
  async getInterviewQuestionsByResumeId(resumeId: number): Promise<InterviewQuestions[]> {
    return withRetry(async () => {
      return db.select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.resumeId, resumeId))
        .orderBy(desc(interviewQuestions.createdAt));
    }, `getInterviewQuestionsByResumeId(${resumeId})`);
  }
  
  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]> {
    return withRetry(async () => {
      return db.select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.jobDescriptionId, jobDescriptionId))
        .orderBy(desc(interviewQuestions.createdAt));
    }, `getInterviewQuestionsByJobDescriptionId(${jobDescriptionId})`);
  }
  
  async getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<InterviewQuestions | undefined> {
    return withRetry(async () => {
      const [interviewQuestion] = await db.select()
        .from(interviewQuestions)
        .where(
          and(
            eq(interviewQuestions.resumeId, resumeId),
            eq(interviewQuestions.jobDescriptionId, jobDescriptionId)
          )
        )
        .orderBy(desc(interviewQuestions.createdAt));
      return interviewQuestion;
    }, `getInterviewQuestionByResumeAndJob(${resumeId}, ${jobDescriptionId})`);
  }
  
  async createInterviewQuestions(insertInterviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions> {
    return withRetry(async () => {
      const [interviewQuestion] = await db.insert(interviewQuestions)
        .values({
          ...insertInterviewQuestions,
        })
        .returning();
      return interviewQuestion;
    }, 'createInterviewQuestions()');
  }
  
  // Combination methods
  async getResumeWithLatestAnalysisAndQuestions(resumeId: number, jobDescriptionId: number): Promise<{
    resume: Resume;
    analysis: AnalysisResult | undefined;
    questions: InterviewQuestions | undefined;
  }> {
    const resume = await this.getResume(resumeId);
    if (!resume) {
      throw new Error(`Resume with ID ${resumeId} not found`);
    }
    
    const [analysis] = await db.select()
      .from(analysisResults)
      .where(
        and(
          eq(analysisResults.resumeId, resumeId),
          eq(analysisResults.jobDescriptionId, jobDescriptionId)
        )
      )
      .orderBy(desc(analysisResults.createdAt))
      .limit(1);
    
    const [questions] = await db.select()
      .from(interviewQuestions)
      .where(
        and(
          eq(interviewQuestions.resumeId, resumeId),
          eq(interviewQuestions.jobDescriptionId, jobDescriptionId)
        )
      )
      .orderBy(desc(interviewQuestions.createdAt))
      .limit(1);
    
    return {
      resume,
      analysis,
      questions,
    };
  }
}