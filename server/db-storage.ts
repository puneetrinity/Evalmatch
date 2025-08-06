import { users, type User, type InsertUser } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse,
} from "@shared/schema";
import { IStorage } from "./storage";
import { resumes, jobDescriptions, analysisResults, interviewQuestions } from "@shared/schema";

/**
 * PostgreSQL implementation of the storage interface
 */
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    try {
      console.log(`DatabaseStorage: Getting user with ID ${id}`);
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user || undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getUser(${id}):`, error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      console.log(`DatabaseStorage: Getting user with username ${username}`);
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user || undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getUserByUsername(${username}):`, error);
      throw error;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      console.log(`DatabaseStorage: Creating new user ${insertUser.username}`);
      const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning();
      return user;
    } catch (error) {
      console.error(`Error in DatabaseStorage.createUser:`, error);
      throw error;
    }
  }

  // Resume methods
  async getResumeById(id: number, userId: string): Promise<Resume | undefined> {
    try {
      console.log(`DatabaseStorage: Getting resume ${id} for user ${userId}`);
      const [resume] = await db.select().from(resumes)
        .where(eq(resumes.id, id));
      
      if (resume && resume.userId === userId) {
        return resume;
      }
      return undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getResumeById(${id}, ${userId}):`, error);
      throw error;
    }
  }

  async getResumesByUserId(userId: string, sessionId?: string, batchId?: string): Promise<Resume[]> {
    try {
      console.log(`DatabaseStorage: Getting resumes for user ${userId}, session: ${sessionId}, batch: ${batchId}`);
      let query = db.select().from(resumes).where(eq(resumes.userId, userId));
      
      // Priority-based filtering: batchId takes precedence over sessionId
      // This ensures consistent behavior with other storage implementations
      if (batchId) {
        query = query.where(eq(resumes.batchId, batchId));
      } else if (sessionId) {
        query = query.where(eq(resumes.sessionId, sessionId));
      }
      
      return await query;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getResumesByUserId(${userId}):`, error);
      throw error;
    }
  }
  async getResume(id: number): Promise<Resume | undefined> {
    try {
      console.log(`DatabaseStorage: Getting resume with ID ${id}`);
      const [resume] = await db.select().from(resumes).where(eq(resumes.id, id));
      return resume || undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getResume(${id}):`, error);
      throw error;
    }
  }

  async getResumes(sessionId?: string): Promise<Resume[]> {
    try {
      if (sessionId) {
        console.log(`DatabaseStorage: Filtering resumes by sessionId: ${sessionId}`);
        return await db.select().from(resumes).where(eq(resumes.sessionId, sessionId));
      } else {
        console.log('DatabaseStorage: Retrieving all resumes');
        return await db.select().from(resumes);
      }
    } catch (error) {
      console.error(`Error in DatabaseStorage.getResumes:`, error);
      throw error;
    }
  }

  async createResume(insertResume: InsertResume): Promise<Resume> {
    try {
      console.log(`DatabaseStorage: Creating new resume ${insertResume.filename}`);
      const [resume] = await db
        .insert(resumes)
        .values(insertResume)
        .returning();
      return resume;
    } catch (error) {
      console.error(`Error in DatabaseStorage.createResume(${insertResume.filename}):`, error);
      throw error;
    }
  }

  async updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume> {
    try {
      console.log(`DatabaseStorage: Updating resume analysis for ID ${id}`);
      const [resume] = await db
        .update(resumes)
        .set({ analyzedData: analysis })
        .where(eq(resumes.id, id))
        .returning();
      
      if (!resume) {
        throw new Error(`Resume with ID ${id} not found`);
      }
      
      return resume;
    } catch (error) {
      console.error(`Error in DatabaseStorage.updateResumeAnalysis(${id}):`, error);
      throw error;
    }
  }

  // Job description methods
  async getJobDescription(id: number): Promise<JobDescription | undefined> {
    try {
      console.log(`DatabaseStorage: Getting job description with ID ${id}`);
      const [jobDescription] = await db.select().from(jobDescriptions).where(eq(jobDescriptions.id, id));
      return jobDescription || undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getJobDescription(${id}):`, error);
      throw error;
    }
  }

  async getJobDescriptions(): Promise<JobDescription[]> {
    try {
      console.log('DatabaseStorage: Retrieving all job descriptions');
      return await db.select().from(jobDescriptions);
    } catch (error) {
      console.error(`Error in DatabaseStorage.getJobDescriptions:`, error);
      throw error;
    }
  }

  async createJobDescription(insertJobDescription: InsertJobDescription): Promise<JobDescription> {
    try {
      console.log(`DatabaseStorage: Creating new job description "${insertJobDescription.title}"`);
      const [jobDescription] = await db
        .insert(jobDescriptions)
        .values(insertJobDescription)
        .returning();
      return jobDescription;
    } catch (error) {
      console.error(`Error in DatabaseStorage.createJobDescription:`, error);
      throw error;
    }
  }

  async getJobDescriptionById(id: number, userId: string): Promise<JobDescription | undefined> {
    try {
      console.log(`DatabaseStorage: Getting job description ${id} for user ${userId}`);
      const [jobDescription] = await db.select().from(jobDescriptions)
        .where(eq(jobDescriptions.id, id));
      
      if (jobDescription && jobDescription.userId === userId) {
        return jobDescription;
      }
      return undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getJobDescriptionById(${id}, ${userId}):`, error);
      throw error;
    }
  }

  async getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]> {
    try {
      console.log(`DatabaseStorage: Getting job descriptions for user ${userId}`);
      return await db.select().from(jobDescriptions)
        .where(eq(jobDescriptions.userId, userId));
    } catch (error) {
      console.error(`Error in DatabaseStorage.getJobDescriptionsByUserId(${userId}):`, error);
      throw error;
    }
  }

  async updateJobDescription(id: number, updates: Partial<JobDescription>): Promise<JobDescription> {
    try {
      console.log(`DatabaseStorage: Updating job description ${id}`);
      const [jobDescription] = await db
        .update(jobDescriptions)
        .set(updates)
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      if (!jobDescription) {
        throw new Error(`Job description with ID ${id} not found`);
      }
      
      return jobDescription;
    } catch (error) {
      console.error(`Error in DatabaseStorage.updateJobDescription(${id}):`, error);
      throw error;
    }
  }

  async updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription> {
    try {
      console.log(`DatabaseStorage: Updating job description analysis for ID ${id}`);
      const [jobDescription] = await db
        .update(jobDescriptions)
        .set({ analyzedData: analysis })
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      if (!jobDescription) {
        throw new Error(`Job description with ID ${id} not found`);
      }
      
      return jobDescription;
    } catch (error) {
      console.error(`Error in DatabaseStorage.updateJobDescriptionAnalysis(${id}):`, error);
      throw error;
    }
  }

  async updateJobDescriptionBiasAnalysis(id: number, biasAnalysis: any): Promise<JobDescription> {
    try {
      console.log(`DatabaseStorage: Updating job description bias analysis for ID ${id}`);
      const current = await this.getJobDescription(id);
      if (!current) {
        throw new Error(`Job description with ID ${id} not found`);
      }
      
      const updatedAnalyzedData = {
        ...(current.analyzedData || {}),
        biasAnalysis
      };
      
      const [jobDescription] = await db
        .update(jobDescriptions)
        .set({ analyzedData: updatedAnalyzedData })
        .where(eq(jobDescriptions.id, id))
        .returning();
      
      if (!jobDescription) {
        throw new Error(`Job description with ID ${id} not found`);
      }
      
      return jobDescription;
    } catch (error) {
      console.error(`Error in DatabaseStorage.updateJobDescriptionBiasAnalysis(${id}):`, error);
      throw error;
    }
  }

  async deleteJobDescription(id: number): Promise<void> {
    try {
      console.log(`DatabaseStorage: Deleting job description ${id}`);
      await db.delete(jobDescriptions).where(eq(jobDescriptions.id, id));
    } catch (error) {
      console.error(`Error in DatabaseStorage.deleteJobDescription(${id}):`, error);
      throw error;
    }
  }

  // Analysis results methods
  async getAnalysisResult(id: number): Promise<AnalysisResult | undefined> {
    try {
      console.log(`DatabaseStorage: Getting analysis result with ID ${id}`);
      const [analysisResult] = await db.select().from(analysisResults).where(eq(analysisResults.id, id));
      return analysisResult || undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getAnalysisResult(${id}):`, error);
      throw error;
    }
  }

  async getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]> {
    try {
      console.log(`DatabaseStorage: Getting analysis results for resume ID ${resumeId}`);
      return await db.select().from(analysisResults).where(eq(analysisResults.resumeId, resumeId));
    } catch (error) {
      console.error(`Error in DatabaseStorage.getAnalysisResultsByResumeId(${resumeId}):`, error);
      throw error;
    }
  }

  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]> {
    try {
      console.log(`DatabaseStorage: Getting analysis results for job description ID ${jobDescriptionId}`);
      return await db.select().from(analysisResults).where(eq(analysisResults.jobDescriptionId, jobDescriptionId));
    } catch (error) {
      console.error(`Error in DatabaseStorage.getAnalysisResultsByJobDescriptionId(${jobDescriptionId}):`, error);
      throw error;
    }
  }

  async getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId: string): Promise<AnalysisResult | undefined> {
    try {
      console.log(`DatabaseStorage: Getting analysis result for job ${jobId}, resume ${resumeId}, user ${userId}`);
      const [result] = await db.select().from(analysisResults)
        .where(eq(analysisResults.jobDescriptionId, jobId))
        .where(eq(analysisResults.resumeId, resumeId))
        .where(eq(analysisResults.userId, userId));
      return result || undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getAnalysisResultByJobAndResume:`, error);
      throw error;
    }
  }

  async getAnalysisResultsByJob(jobId: number, userId: string, sessionId?: string, batchId?: string): Promise<AnalysisResult[]> {
    try {
      console.log(`DatabaseStorage: Getting analysis results for job ${jobId}, user ${userId}, session: ${sessionId}, batch: ${batchId}`);
      
      // Start with base conditions
      const whereConditions = [
        eq(analysisResults.jobDescriptionId, jobId),
        eq(analysisResults.userId, userId)
      ];
      
      // Add session/batch filtering via join with resumes table
      // Priority-based filtering: batchId takes precedence over sessionId
      if (batchId || sessionId) {
        if (batchId) {
          whereConditions.push(eq(resumes.batchId, batchId));
        } else if (sessionId) {
          whereConditions.push(eq(resumes.sessionId, sessionId));
        }
        
        // Join with resumes to apply session/batch filters
        return await db.select()
          .from(analysisResults)
          .innerJoin(resumes, eq(analysisResults.resumeId, resumes.id))
          .where(and(...whereConditions));
      } else {
        // No session/batch filtering needed
        return await db.select()
          .from(analysisResults)
          .where(and(...whereConditions));
      }
    } catch (error) {
      console.error(`Error in DatabaseStorage.getAnalysisResultsByJob:`, error);
      throw error;
    }
  }

  async createAnalysisResult(insertAnalysisResult: InsertAnalysisResult): Promise<AnalysisResult> {
    try {
      console.log(`DatabaseStorage: Creating new analysis result for resume ${insertAnalysisResult.resumeId} and job ${insertAnalysisResult.jobDescriptionId}`);
      const [analysisResult] = await db
        .insert(analysisResults)
        .values(insertAnalysisResult)
        .returning();
      return analysisResult;
    } catch (error) {
      console.error(`Error in DatabaseStorage.createAnalysisResult:`, error);
      throw error;
    }
  }

  // Interview questions methods
  async getInterviewQuestions(id: number): Promise<InterviewQuestions | undefined> {
    try {
      console.log(`DatabaseStorage: Getting interview questions with ID ${id}`);
      const [interviewQuestion] = await db.select().from(interviewQuestions).where(eq(interviewQuestions.id, id));
      return interviewQuestion || undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getInterviewQuestions(${id}):`, error);
      throw error;
    }
  }

  async getInterviewQuestionsByResumeId(resumeId: number): Promise<InterviewQuestions[]> {
    try {
      console.log(`DatabaseStorage: Getting interview questions for resume ID ${resumeId}`);
      return await db.select().from(interviewQuestions).where(eq(interviewQuestions.resumeId, resumeId));
    } catch (error) {
      console.error(`Error in DatabaseStorage.getInterviewQuestionsByResumeId(${resumeId}):`, error);
      throw error;
    }
  }

  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]> {
    try {
      console.log(`DatabaseStorage: Getting interview questions for job description ID ${jobDescriptionId}`);
      return await db.select().from(interviewQuestions).where(eq(interviewQuestions.jobDescriptionId, jobDescriptionId));
    } catch (error) {
      console.error(`Error in DatabaseStorage.getInterviewQuestionsByJobDescriptionId(${jobDescriptionId}):`, error);
      throw error;
    }
  }

  async getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<InterviewQuestions | undefined> {
    try {
      console.log(`DatabaseStorage: Getting interview questions for resume ID ${resumeId} and job description ID ${jobDescriptionId}`);
      const results = await db.select().from(interviewQuestions)
        .where(eq(interviewQuestions.resumeId, resumeId))
        .where(eq(interviewQuestions.jobDescriptionId, jobDescriptionId));
      
      return results.length > 0 ? results[0] : undefined;
    } catch (error) {
      console.error(`Error in DatabaseStorage.getInterviewQuestionByResumeAndJob(${resumeId}, ${jobDescriptionId}):`, error);
      throw error;
    }
  }

  async createInterviewQuestions(insertInterviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions> {
    try {
      console.log(`DatabaseStorage: Creating new interview questions for resume ${insertInterviewQuestions.resumeId} and job ${insertInterviewQuestions.jobDescriptionId}`);
      const [interviewQuestion] = await db
        .insert(interviewQuestions)
        .values(insertInterviewQuestions)
        .returning();
      return interviewQuestion;
    } catch (error) {
      console.error(`Error in DatabaseStorage.createInterviewQuestions:`, error);
      throw error;
    }
  }

  // Combination methods
  async getResumeWithLatestAnalysisAndQuestions(resumeId: number, jobDescriptionId: number): Promise<{
    resume: Resume;
    analysis: AnalysisResult | undefined;
    questions: InterviewQuestions | undefined;
  }> {
    try {
      console.log(`DatabaseStorage: Getting complete data for resume ${resumeId} and job ${jobDescriptionId}`);
      
      // Get the resume
      const resume = await this.getResume(resumeId);
      if (!resume) {
        throw new Error(`Resume with ID ${resumeId} not found`);
      }
      
      // Get matching analysis results
      const analysisResultsData = await this.getAnalysisResultsByResumeId(resumeId);
      const matchingResults = analysisResultsData.filter(result => 
        result.jobDescriptionId === jobDescriptionId
      );
      
      // Sort by created date (newest first) and take the first one
      const latestAnalysis = matchingResults.length > 0 
        ? matchingResults.sort((a, b) => 
            (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
          )[0] 
        : undefined;
      
      // Get interview questions
      const questions = await this.getInterviewQuestionByResumeAndJob(resumeId, jobDescriptionId);
      
      return {
        resume,
        analysis: latestAnalysis,
        questions,
      };
    } catch (error) {
      console.error(`Error in DatabaseStorage.getResumeWithLatestAnalysisAndQuestions(${resumeId}, ${jobDescriptionId}):`, error);
      throw error;
    }
  }

  // User tier methods (optional - using simple approach for database)
  async getUserTierInfo(userId: string): Promise<any> {
    // For database implementation, this would require a separate table
    // For now, return undefined to fall back to defaults
    return undefined;
  }

  async saveUserTierInfo(userId: string, tierInfo: any): Promise<void> {
    // For database implementation, this would insert/update user tier table
    // For now, this is a no-op
    console.log(`DatabaseStorage: Would save tier info for user ${userId}`, tierInfo);
  }
  
  // Missing embedding methods required by IStorage interface
  async updateResumeEmbeddings(id: number, embedding: number[] | null, skillsEmbedding: number[] | null): Promise<Resume> {
    const [updatedResume] = await db.update(resumes)
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
  }
  
  async updateJobDescriptionEmbeddings(id: number, embedding: number[] | null, requirementsEmbedding: number[] | null): Promise<JobDescription> {
    const [updatedJobDescription] = await db.update(jobDescriptions)
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
  }
}