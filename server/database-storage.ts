import { 
  users, resumes, jobDescriptions, analysisResults, interviewQuestions,
  type User, type InsertUser, 
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import { IStorage } from "./storage";
import { withRetry } from "./lib/db-retry";

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
  
  async getResumes(sessionId?: string): Promise<Resume[]> {
    return withRetry(async () => {
      // If sessionId is provided, filter resumes by session
      if (sessionId) {
        console.log(`DatabaseStorage: Filtering resumes by sessionId: ${sessionId}`);
        return db.select()
          .from(resumes)
          .where(eq(resumes.sessionId, sessionId))
          .orderBy(desc(resumes.created));
      }
      
      // Otherwise return all resumes
      return db.select().from(resumes).orderBy(desc(resumes.created));
    }, `getResumes(${sessionId || 'all'})`);
  }
  
  async getResumesByUserId(userId: string, sessionId?: string): Promise<Resume[]> {
    return withRetry(async () => {
      if (sessionId) {
        return db.select()
          .from(resumes)
          .where(and(
            eq(resumes.userId, userId),
            eq(resumes.sessionId, sessionId)
          ))
          .orderBy(desc(resumes.created));
      }
      
      return db.select()
        .from(resumes)
        .where(eq(resumes.userId, userId))
        .orderBy(desc(resumes.created));
    }, `getResumesByUserId(${userId}, ${sessionId || 'all'})`);
  }
  
  async createResume(insertResume: InsertResume): Promise<Resume> {
    return withRetry(async () => {
      const [resume] = await db.insert(resumes)
        .values({
          ...insertResume,
          createdAt: new Date(),
        })
        .returning();
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
  
  async getJobDescriptions(): Promise<JobDescription[]> {
    return withRetry(async () => {
      return db.select()
        .from(jobDescriptions)
        .orderBy(desc(jobDescriptions.created));
    }, 'getJobDescriptions()');
  }
  
  async getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]> {
    return withRetry(async () => {
      return db.select()
        .from(jobDescriptions)
        .where(eq(jobDescriptions.userId, userId))
        .orderBy(desc(jobDescriptions.created));
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
          createdAt: new Date(),
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
  
  // Analysis result methods
  async getAnalysisResult(id: number): Promise<AnalysisResult | undefined> {
    return withRetry(async () => {
      const [analysisResult] = await db.select()
        .from(analysisResults)
        .where(eq(analysisResults.id, id));
      return analysisResult;
    }, `getAnalysisResult(${id})`);
  }
  
  async getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]> {
    return withRetry(async () => {
      return db.select()
        .from(analysisResults)
        .where(eq(analysisResults.resumeId, resumeId))
        .orderBy(desc(analysisResults.created));
    }, `getAnalysisResultsByResumeId(${resumeId})`);
  }
  
  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]> {
    return withRetry(async () => {
      return db.select()
        .from(analysisResults)
        .where(eq(analysisResults.jobDescriptionId, jobDescriptionId))
        .orderBy(desc(analysisResults.created));
    }, `getAnalysisResultsByJobDescriptionId(${jobDescriptionId})`);
  }
  
  async createAnalysisResult(insertAnalysisResult: InsertAnalysisResult): Promise<AnalysisResult> {
    return withRetry(async () => {
      const [analysisResult] = await db.insert(analysisResults)
        .values({
          ...insertAnalysisResult,
          createdAt: new Date(),
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
        .orderBy(desc(interviewQuestions.created));
    }, `getInterviewQuestionsByResumeId(${resumeId})`);
  }
  
  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]> {
    return withRetry(async () => {
      return db.select()
        .from(interviewQuestions)
        .where(eq(interviewQuestions.jobDescriptionId, jobDescriptionId))
        .orderBy(desc(interviewQuestions.created));
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
        .orderBy(desc(interviewQuestions.created));
      return interviewQuestion;
    }, `getInterviewQuestionByResumeAndJob(${resumeId}, ${jobDescriptionId})`);
  }
  
  async createInterviewQuestions(insertInterviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions> {
    return withRetry(async () => {
      const [interviewQuestion] = await db.insert(interviewQuestions)
        .values({
          ...insertInterviewQuestions,
          createdAt: new Date(),
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
      .orderBy(desc(analysisResults.created))
      .limit(1);
    
    const [questions] = await db.select()
      .from(interviewQuestions)
      .where(
        and(
          eq(interviewQuestions.resumeId, resumeId),
          eq(interviewQuestions.jobDescriptionId, jobDescriptionId)
        )
      )
      .orderBy(desc(interviewQuestions.created))
      .limit(1);
    
    return {
      resume,
      analysis,
      questions,
    };
  }
}