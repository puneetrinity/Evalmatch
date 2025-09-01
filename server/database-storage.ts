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
import { getDatabase } from "./database";
import { eq, and, desc } from "drizzle-orm";
import { IStorage } from "./storage";
import { withRetry } from "./lib/db-retry";
import { logger } from "./lib/logger";

/**
 * PostgreSQL implementation of the storage interface
 */
export class DatabaseStorage implements IStorage {
  private get db() {
    return getDatabase();
  }
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await this.db.insert(users).values(insertUser).returning();
    return user;
  }
  
  // Resume methods
  async getResume(id: number): Promise<Resume | undefined> {
    return withRetry(async () => {
      const [resume] = await this.db.select().from(resumes).where(eq(resumes.id, id));
      return resume;
    }, `getResume(${id})`);
  }

  async getResumeById(id: number, userId: string): Promise<Resume | undefined> {
    return withRetry(async () => {
      const [resume] = await this.db.select()
        .from(resumes)
        .where(and(eq(resumes.id, id), eq(resumes.userId, userId)));
      return resume;
    }, `getResumeById(${id}, ${userId})`);
  }
  
  async getResumes(sessionId?: string): Promise<Resume[]> {
    return withRetry(async () => {
      // If sessionId is provided, filter resumes by session
      if (sessionId) {
        logger.debug('Filtering resumes by sessionId', { sessionId });
        return this.db.select()
          .from(resumes)
          .where(eq(resumes.sessionId, sessionId))
          .orderBy(desc(resumes.createdAt));
      }
      
      // Otherwise return all resumes
      return this.db.select().from(resumes).orderBy(desc(resumes.createdAt));
    }, `getResumes(${sessionId || 'all'})`);
  }
  
  async getResumesByUserId(userId: string, sessionId?: string, batchId?: string): Promise<Resume[]> {
    return withRetry(async () => {
      const conditions = [eq(resumes.userId, userId)];
      
      if (batchId) {
        conditions.push(eq(resumes.batchId, batchId));
      }
      
      if (sessionId) {
        conditions.push(eq(resumes.sessionId, sessionId));
      }
      
      return this.db.select()
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
      
      const [resume] = await this.db.insert(resumes)
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
      const [updatedResume] = await this.db.update(resumes)
        .set({
          analyzedData: analysis.analyzedData
        })
        .where(eq(resumes.id, id))
        .returning();
      
      return updatedResume;
    }, `updateResumeAnalysis(${id})`);
  }
  
  async deleteResume(id: number): Promise<void> {
    return withRetry(async () => {
      await this.db.delete(resumes).where(eq(resumes.id, id));
      logger.info('Resume deleted successfully from database', { id });
    }, `deleteResume(${id})`);
  }
  
  // Job description methods
  async getJobDescription(id: number): Promise<JobDescription | undefined> {
    logger.debug('Looking up job description', { jobId: id });
    return withRetry(async () => {
      try {
        const [jobDescription] = await this.db.select()
          .from(jobDescriptions)
          .where(eq(jobDescriptions.id, id));
        
        logger.debug('Job lookup result', { 
          found: !!jobDescription,
          jobId: jobDescription?.id,
          title: jobDescription?.title
        });
        return jobDescription;
      } catch (error) {
        logger.error(`Error fetching job description (jobId: ${id})`, error);
        throw error;
      }
    }, `getJobDescription(${id})`);
  }

  async getJobDescriptionById(id: number, userId: string): Promise<JobDescription | undefined> {
    logger.debug('Looking up user-scoped job description', { jobId: id, userId });
    return withRetry(async () => {
      try {
        const [jobDescription] = await this.db.select()
          .from(jobDescriptions)
          .where(and(eq(jobDescriptions.id, id), eq(jobDescriptions.userId, userId)));
        
        logger.debug('User-scoped job lookup result', {
          found: !!jobDescription,
          jobId: jobDescription?.id, 
          title: jobDescription?.title,
          userId
        });
        return jobDescription;
      } catch (error) {
        logger.error(`Error fetching user-scoped job description (jobId: ${id}, userId: ${userId})`, error);
        throw error;
      }
    }, `getJobDescriptionById(${id}, ${userId})`);
  }
  
  async getJobDescriptions(): Promise<JobDescription[]> {
    return withRetry(async () => {
      return this.db.select()
        .from(jobDescriptions)
        .orderBy(desc(jobDescriptions.createdAt));
    }, 'getJobDescriptions()');
  }
  
  async getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]> {
    return withRetry(async () => {
      return this.db.select()
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
      
      const [jobDescription] = await this.db.insert(jobDescriptions)
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
      const [updatedJobDescription] = await this.db.update(jobDescriptions)
        .set(updates)
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      return updatedJobDescription;
    }, `updateJobDescription(${id})`);
  }

  async deleteJobDescription(id: number): Promise<void> {
    return withRetry(async () => {
      await this.db.delete(jobDescriptions).where(eq(jobDescriptions.id, id));
    }, `deleteJobDescription(${id})`);
  }
  
  async updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription> {
    return withRetry(async () => {
      const [updatedJobDescription] = await this.db.update(jobDescriptions)
        .set({
          analyzedData: analysis.analyzedData
        })
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      return updatedJobDescription;
    }, `updateJobDescriptionAnalysis(${id})`);
  }

  async updateJobDescriptionBiasAnalysis(id: number, biasAnalysis: SimpleBiasAnalysis): Promise<JobDescription> {
    return withRetry(async () => {
      // First get the existing job description
      const [existingJob] = await this.db.select()
        .from(jobDescriptions)
        .where(eq(jobDescriptions.id, id));
      
      if (!existingJob) {
        throw new Error(`Job description with ID ${id} not found`);
      }
      
      // Safely merge bias analysis into existing analyzedData
      // Handle case where analyzedData is null
      const currentAnalyzedData = existingJob.analyzedData || {
        requiredSkills: [],
        preferredSkills: [],
        experienceLevel: '',
        responsibilities: [],
        summary: ''
      };
      const updatedAnalyzedData = {
        ...currentAnalyzedData,
        biasAnalysis: biasAnalysis
      };
      
      logger.info(`Updating job ${id} with bias analysis`, {
        hasExistingData: !!existingJob.analyzedData,
        biasAnalysisKeys: Object.keys(biasAnalysis)
      });
      
      const [updatedJobDescription] = await this.db.update(jobDescriptions)
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
      const [analysisResult] = await this.db.select()
        .from(analysisResults)
        .where(eq(analysisResults.id, id));
      return analysisResult;
    }, `getAnalysisResult(${id})`);
  }

  async getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId: string): Promise<AnalysisResult | undefined> {
    return withRetry(async () => {
      const [analysisResult] = await this.db.select()
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
      }
      
      if (sessionId) {
        resumeConditions.push(eq(resumes.sessionId, sessionId));
      }
      
      // Get analysis results ordered by creation time (most recent first)
      // This is a simpler approach than the complex subquery
      
      // Since we can't directly use the subquery in this context with Drizzle,
      // we'll use a window function approach instead
      const results = await this.db.select({
        id: analysisResults.id,
        userId: analysisResults.userId,
        resumeId: analysisResults.resumeId,
        jobDescriptionId: analysisResults.jobDescriptionId,
        matchPercentage: analysisResults.matchPercentage,
        matchedSkills: analysisResults.matchedSkills,
        missingSkills: analysisResults.missingSkills,
        analysis: analysisResults.analysis,
        candidateStrengths: analysisResults.candidateStrengths,
        candidateWeaknesses: analysisResults.candidateWeaknesses,
        recommendations: analysisResults.recommendations,
        confidenceLevel: analysisResults.confidenceLevel,
        semanticSimilarity: analysisResults.semanticSimilarity,
        skillsSimilarity: analysisResults.skillsSimilarity,
        experienceSimilarity: analysisResults.experienceSimilarity,
        educationSimilarity: analysisResults.educationSimilarity,
        mlConfidenceScore: analysisResults.mlConfidenceScore,
        scoringDimensions: analysisResults.scoringDimensions,
        fairnessMetrics: analysisResults.fairnessMetrics,
        processingTime: analysisResults.processingTime,
        aiProvider: analysisResults.aiProvider,
        modelVersion: analysisResults.modelVersion,
        processingFlags: analysisResults.processingFlags,
        createdAt: analysisResults.createdAt,
        updatedAt: analysisResults.updatedAt,
        resume: resumes
      })
        .from(analysisResults)
        .leftJoin(resumes, eq(analysisResults.resumeId, resumes.id))
        .where(and(
          ...conditions,
          ...(resumeConditions.length > 0 ? resumeConditions : [])
        ))
        .orderBy(desc(analysisResults.createdAt));
      
      // Deduplicate by keeping only the most recent analysis per resume
      type QueryResult = typeof results[0];
      const deduplicatedResults = new Map<number, QueryResult>();
      
      for (const result of results) {
        if (result.resumeId && (!deduplicatedResults.has(result.resumeId) || 
            new Date(result.createdAt!) > new Date(deduplicatedResults.get(result.resumeId)!.createdAt!))) {
          deduplicatedResults.set(result.resumeId, result);
        }
      }
      
      // Convert back to array and sort by creation date (most recent first)
      const finalResults = Array.from(deduplicatedResults.values())
        .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
      
      // Transform the results to match the expected AnalysisResult type
      return finalResults.map(result => ({
        ...result,
        resume: result.resume || undefined
      })) as AnalysisResult[];
    }, `getAnalysisResultsByJob(${jobId}, ${userId}, ${sessionId || 'all'}, ${batchId || 'none'})`);
  }
  
  async getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]> {
    return withRetry(async () => {
      return this.db.select()
        .from(analysisResults)
        .where(eq(analysisResults.resumeId, resumeId))
        .orderBy(desc(analysisResults.createdAt));
    }, `getAnalysisResultsByResumeId(${resumeId})`);
  }
  
  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]> {
    return withRetry(async () => {
      return this.db.select()
        .from(analysisResults)
        .where(eq(analysisResults.jobDescriptionId, jobDescriptionId))
        .orderBy(desc(analysisResults.createdAt));
    }, `getAnalysisResultsByJobDescriptionId(${jobDescriptionId})`);
  }
  
  async createAnalysisResult(insertAnalysisResult: InsertAnalysisResult): Promise<AnalysisResult> {
    return withRetry(async () => {
      const [analysisResult] = await this.db.insert(analysisResults)
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
      const [interviewQuestion] = await this.db.select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.id, id));
      return interviewQuestion;
    }, `getInterviewQuestions(${id})`);
  }
  
  async getInterviewQuestionsByResumeId(resumeId: number): Promise<InterviewQuestions[]> {
    return withRetry(async () => {
      return this.db.select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.resumeId, resumeId))
        .orderBy(desc(interviewQuestions.createdAt));
    }, `getInterviewQuestionsByResumeId(${resumeId})`);
  }
  
  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]> {
    return withRetry(async () => {
      return this.db.select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.jobDescriptionId, jobDescriptionId))
        .orderBy(desc(interviewQuestions.createdAt));
    }, `getInterviewQuestionsByJobDescriptionId(${jobDescriptionId})`);
  }
  
  async getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<InterviewQuestions | undefined> {
    return withRetry(async () => {
      const [interviewQuestion] = await this.db.select()
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
      const [interviewQuestion] = await this.db.insert(interviewQuestions)
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
    
    const [analysis] = await this.db.select()
      .from(analysisResults)
      .where(
        and(
          eq(analysisResults.resumeId, resumeId),
          eq(analysisResults.jobDescriptionId, jobDescriptionId)
        )
      )
      .orderBy(desc(analysisResults.createdAt))
      .limit(1);
    
    const [questions] = await this.db.select()
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
  
  // Missing embedding methods required by IStorage interface
  async updateResumeEmbeddings(id: number, embedding: number[] | null, skillsEmbedding: number[] | null): Promise<Resume> {
    return withRetry(async () => {
      const [updatedResume] = await this.db.update(resumes)
        .set({
          embedding,
          skillsEmbedding
        })
        .where(eq(resumes.id, id))
        .returning();
      
      if (!updatedResume) {
        throw new Error(`Resume with ID ${id} not found`);
      }
      
      return updatedResume;
    }, `updateResumeEmbeddings(${id})`);
  }
  
  async updateJobDescriptionEmbeddings(id: number, embedding: number[] | null, requirementsEmbedding: number[] | null): Promise<JobDescription> {
    return withRetry(async () => {
      const [updatedJobDescription] = await this.db.update(jobDescriptions)
        .set({
          embedding,
          requirementsEmbedding
        })
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      if (!updatedJobDescription) {
        throw new Error(`Job description with ID ${id} not found`);
      }
      
      return updatedJobDescription;
    }, `updateJobDescriptionEmbeddings(${id})`);
  }
}