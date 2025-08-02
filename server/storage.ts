import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse, 
  type MatchAnalysisResponse, type InterviewQuestionsResponse,
  type User, type InsertUser
} from "@shared/schema";
import { UserTierInfo } from "@shared/user-tiers";

// Extended storage interface with all methods needed for the resume analyzer
export interface IStorage {
  // User methods (kept for reference but not actively used)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Resume methods
  getResume(id: number): Promise<Resume | undefined>;
  getResumeById(id: number, userId: string): Promise<Resume | undefined>;
  getResumes(sessionId?: string): Promise<Resume[]>;
  getResumesByUserId(userId: string, sessionId?: string): Promise<Resume[]>;
  createResume(resume: InsertResume): Promise<Resume>;
  updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume>;
  
  // Job description methods
  getJobDescription(id: number): Promise<JobDescription | undefined>;
  getJobDescriptionById(id: number, userId: string): Promise<JobDescription | undefined>;
  getJobDescriptions(): Promise<JobDescription[]>;
  getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]>;
  createJobDescription(jobDescription: InsertJobDescription): Promise<JobDescription>;
  updateJobDescription(id: number, updates: Partial<JobDescription>): Promise<JobDescription>;
  updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription>;
  deleteJobDescription(id: number): Promise<void>;
  
  // Analysis results methods
  getAnalysisResult(id: number): Promise<AnalysisResult | undefined>;
  getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId: string): Promise<AnalysisResult | undefined>;
  getAnalysisResultsByJob(jobId: number, userId: string, sessionId?: string): Promise<AnalysisResult[]>;
  getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]>;
  getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]>;
  createAnalysisResult(analysisResult: InsertAnalysisResult): Promise<AnalysisResult>;
  
  // Interview questions methods
  getInterviewQuestions(id: number): Promise<InterviewQuestions | undefined>;
  getInterviewQuestionsByResumeId(resumeId: number): Promise<InterviewQuestions[]>;
  getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]>;
  getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<InterviewQuestions | undefined>;
  createInterviewQuestions(interviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions>;
  
  // Combination methods
  getResumeWithLatestAnalysisAndQuestions(resumeId: number, jobDescriptionId: number): Promise<{
    resume: Resume;
    analysis: AnalysisResult | undefined;
    questions: InterviewQuestions | undefined;
  }>;
  
  // User tier methods (optional - fallback to default if not implemented)
  getUserTierInfo?(userId: string): Promise<UserTierInfo | undefined>;
  saveUserTierInfo?(userId: string, tierInfo: UserTierInfo): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private resumesData: Map<number, Resume>;
  private jobDescriptionsData: Map<number, JobDescription>;
  private analysisResultsData: Map<number, AnalysisResult>;
  private interviewQuestionsData: Map<number, InterviewQuestions>;
  private userTiersData: Map<string, UserTierInfo>;
  
  // Counters for IDs
  private userCurrentId: number;
  private resumeCurrentId: number;
  private jobDescriptionCurrentId: number;
  private analysisResultCurrentId: number;
  private interviewQuestionsCurrentId: number;

  constructor() {
    this.users = new Map();
    this.resumesData = new Map();
    this.jobDescriptionsData = new Map();
    this.analysisResultsData = new Map();
    this.interviewQuestionsData = new Map();
    this.userTiersData = new Map();
    
    this.userCurrentId = 1;
    this.resumeCurrentId = 1;
    this.jobDescriptionCurrentId = 1;
    this.analysisResultCurrentId = 1;
    this.interviewQuestionsCurrentId = 1;
  }

  // User methods (from the original implementation)
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Resume methods
  async getResume(id: number): Promise<Resume | undefined> {
    return this.resumesData.get(id);
  }

  async getResumeById(id: number, userId: string): Promise<Resume | undefined> {
    const resume = this.resumesData.get(id);
    if (resume && resume.userId === userId) {
      return resume;
    }
    return undefined;
  }

  async getResumes(sessionId?: string): Promise<Resume[]> {
    const allResumes = Array.from(this.resumesData.values());
    
    // If no sessionId provided, return all resumes
    if (!sessionId) {
      return allResumes;
    }
    
    // Filter resumes by sessionId
    return allResumes.filter(resume => resume.sessionId === sessionId);
  }

  async getResumesByUserId(userId: string, sessionId?: string): Promise<Resume[]> {
    const allResumes = Array.from(this.resumesData.values());
    
    // Filter by userId first
    let userResumes = allResumes.filter(resume => resume.userId === userId);
    
    // Then filter by sessionId if provided
    if (sessionId) {
      userResumes = userResumes.filter(resume => resume.sessionId === sessionId);
    }
    
    return userResumes;
  }

  async createResume(insertResume: InsertResume): Promise<Resume> {
    const id = this.resumeCurrentId++;
    const now = new Date();
    // Make sure sessionId is set to a default value if not provided
    const sessionId = insertResume.sessionId || "default";
    
    const resume: Resume = {
      ...insertResume,
      id,
      createdAt: now,
      analyzedData: null,
      sessionId, // Ensure sessionId is assigned
    };
    this.resumesData.set(id, resume);
    return resume;
  }

  async updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume> {
    const resume = await this.getResume(id);
    if (!resume) {
      throw new Error(`Resume with ID ${id} not found`);
    }
    
    const updatedResume: Resume = {
      ...resume,
      analyzedData: analysis,
    };
    
    this.resumesData.set(id, updatedResume);
    return updatedResume;
  }

  // Job description methods
  async getJobDescription(id: number): Promise<JobDescription | undefined> {
    return this.jobDescriptionsData.get(id);
  }

  async getJobDescriptionById(id: number, userId: string): Promise<JobDescription | undefined> {
    const jobDesc = this.jobDescriptionsData.get(id);
    if (jobDesc && jobDesc.userId === userId) {
      return jobDesc;
    }
    return undefined;
  }

  async getJobDescriptions(): Promise<JobDescription[]> {
    return Array.from(this.jobDescriptionsData.values());
  }

  async getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]> {
    const allJobDescriptions = Array.from(this.jobDescriptionsData.values());
    return allJobDescriptions.filter(jd => jd.userId === userId);
  }

  async createJobDescription(insertJobDescription: InsertJobDescription): Promise<JobDescription> {
    const id = this.jobDescriptionCurrentId++;
    const now = new Date();
    const jobDescription: JobDescription = {
      ...insertJobDescription,
      id,
      createdAt: now,
      analyzedData: null,
    };
    this.jobDescriptionsData.set(id, jobDescription);
    return jobDescription;
  }

  async updateJobDescription(id: number, updates: Partial<JobDescription>): Promise<JobDescription> {
    const jobDescription = await this.getJobDescription(id);
    if (!jobDescription) {
      throw new Error(`Job description with ID ${id} not found`);
    }
    
    const updatedJobDescription: JobDescription = {
      ...jobDescription,
      ...updates,
    };
    
    this.jobDescriptionsData.set(id, updatedJobDescription);
    return updatedJobDescription;
  }

  async updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription> {
    const jobDescription = await this.getJobDescription(id);
    if (!jobDescription) {
      throw new Error(`Job description with ID ${id} not found`);
    }
    
    const updatedJobDescription: JobDescription = {
      ...jobDescription,
      analyzedData: analysis,
    };
    
    this.jobDescriptionsData.set(id, updatedJobDescription);
    return updatedJobDescription;
  }

  async deleteJobDescription(id: number): Promise<void> {
    this.jobDescriptionsData.delete(id);
  }

  // Analysis results methods
  async getAnalysisResult(id: number): Promise<AnalysisResult | undefined> {
    return this.analysisResultsData.get(id);
  }

  async getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId: string): Promise<AnalysisResult | undefined> {
    const results = Array.from(this.analysisResultsData.values());
    return results.find(result => 
      result.jobDescriptionId === jobId && 
      result.resumeId === resumeId && 
      result.userId === userId
    );
  }

  async getAnalysisResultsByJob(jobId: number, userId: string, sessionId?: string): Promise<AnalysisResult[]> {
    const results = Array.from(this.analysisResultsData.values());
    const filteredResults = results.filter(result => 
      result.jobDescriptionId === jobId && 
      result.userId === userId
    );
    
    // Add resume data to each result
    return filteredResults.map(result => ({
      ...result,
      resume: this.resumesData.get(result.resumeId)
    })) as AnalysisResult[];
  }

  async getAnalysisResultsByResumeId(resumeId: number): Promise<AnalysisResult[]> {
    return Array.from(this.analysisResultsData.values()).filter(
      (result) => result.resumeId === resumeId,
    );
  }

  async getAnalysisResultsByJobDescriptionId(jobDescriptionId: number): Promise<AnalysisResult[]> {
    return Array.from(this.analysisResultsData.values()).filter(
      (result) => result.jobDescriptionId === jobDescriptionId,
    );
  }

  async createAnalysisResult(insertAnalysisResult: InsertAnalysisResult): Promise<AnalysisResult> {
    const id = this.analysisResultCurrentId++;
    const now = new Date();
    const analysisResult: AnalysisResult = {
      ...insertAnalysisResult,
      id,
      createdAt: now,
    };
    this.analysisResultsData.set(id, analysisResult);
    return analysisResult;
  }

  // Interview questions methods
  async getInterviewQuestions(id: number): Promise<InterviewQuestions | undefined> {
    return this.interviewQuestionsData.get(id);
  }

  async getInterviewQuestionsByResumeId(resumeId: number): Promise<InterviewQuestions[]> {
    return Array.from(this.interviewQuestionsData.values()).filter(
      (questions) => questions.resumeId === resumeId,
    );
  }

  async getInterviewQuestionsByJobDescriptionId(jobDescriptionId: number): Promise<InterviewQuestions[]> {
    return Array.from(this.interviewQuestionsData.values()).filter(
      (questions) => questions.jobDescriptionId === jobDescriptionId,
    );
  }

  async getInterviewQuestionByResumeAndJob(resumeId: number, jobDescriptionId: number): Promise<InterviewQuestions | undefined> {
    return Array.from(this.interviewQuestionsData.values()).find(
      (questions) => questions.resumeId === resumeId && questions.jobDescriptionId === jobDescriptionId,
    );
  }

  async createInterviewQuestions(insertInterviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions> {
    const id = this.interviewQuestionsCurrentId++;
    const now = new Date();
    const interviewQuestions: InterviewQuestions = {
      ...insertInterviewQuestions,
      id,
      createdAt: now,
    };
    this.interviewQuestionsData.set(id, interviewQuestions);
    return interviewQuestions;
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
    
    const analysisResults = await this.getAnalysisResultsByResumeId(resumeId);
    const analysis = analysisResults
      .filter(result => result.jobDescriptionId === jobDescriptionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    
    const questions = await this.getInterviewQuestionByResumeAndJob(resumeId, jobDescriptionId);
    
    return {
      resume,
      analysis,
      questions,
    };
  }

  // User tier methods
  async getUserTierInfo(userId: string): Promise<UserTierInfo | undefined> {
    return this.userTiersData.get(userId);
  }

  async saveUserTierInfo(userId: string, tierInfo: UserTierInfo): Promise<void> {
    this.userTiersData.set(userId, tierInfo);
  }
}

// Import the storage initialization function
import { initializeStorage } from './storage-switcher';

// Initialize memory storage as fallback (for testing purposes)
const memStorage = new MemStorage();

// Export storage initialization function for async initialization
export let storage: IStorage;

// Initialize storage asynchronously (called from main app startup)
export async function initializeAppStorage(): Promise<IStorage> {
  if (!storage) {
    storage = await initializeStorage();
  }
  return storage;
}
