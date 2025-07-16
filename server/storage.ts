import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse, 
  type MatchAnalysisResponse, type InterviewQuestionsResponse
} from "@shared/schema";

// Extended storage interface with all methods needed for the resume analyzer
export interface IStorage {
  // User methods (kept for reference but not actively used)
  getUser(id: number): Promise<any | undefined>;
  getUserByUsername(username: string): Promise<any | undefined>;
  createUser(user: any): Promise<any>;
  
  // Resume methods
  getResume(id: number): Promise<Resume | undefined>;
  getResumes(sessionId?: string): Promise<Resume[]>;
  createResume(resume: InsertResume): Promise<Resume>;
  updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume>;
  
  // Job description methods
  getJobDescription(id: number): Promise<JobDescription | undefined>;
  getJobDescriptions(): Promise<JobDescription[]>;
  createJobDescription(jobDescription: InsertJobDescription): Promise<JobDescription>;
  updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription>;
  
  // Analysis results methods
  getAnalysisResult(id: number): Promise<AnalysisResult | undefined>;
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
}

export class MemStorage implements IStorage {
  private users: Map<number, any>;
  private resumesData: Map<number, Resume>;
  private jobDescriptionsData: Map<number, JobDescription>;
  private analysisResultsData: Map<number, AnalysisResult>;
  private interviewQuestionsData: Map<number, InterviewQuestions>;
  
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
    
    this.userCurrentId = 1;
    this.resumeCurrentId = 1;
    this.jobDescriptionCurrentId = 1;
    this.analysisResultCurrentId = 1;
    this.interviewQuestionsCurrentId = 1;
  }

  // User methods (from the original implementation)
  async getUser(id: number): Promise<any | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<any | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: any): Promise<any> {
    const id = this.userCurrentId++;
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Resume methods
  async getResume(id: number): Promise<Resume | undefined> {
    return this.resumesData.get(id);
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

  async createResume(insertResume: InsertResume): Promise<Resume> {
    const id = this.resumeCurrentId++;
    const now = new Date();
    // Make sure sessionId is set to a default value if not provided
    const sessionId = insertResume.sessionId || "default";
    
    const resume: Resume = {
      ...insertResume,
      id,
      created: now,
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

  async getJobDescriptions(): Promise<JobDescription[]> {
    return Array.from(this.jobDescriptionsData.values());
  }

  async createJobDescription(insertJobDescription: InsertJobDescription): Promise<JobDescription> {
    const id = this.jobDescriptionCurrentId++;
    const now = new Date();
    const jobDescription: JobDescription = {
      ...insertJobDescription,
      id,
      created: now,
      analyzedData: null,
    };
    this.jobDescriptionsData.set(id, jobDescription);
    return jobDescription;
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

  // Analysis results methods
  async getAnalysisResult(id: number): Promise<AnalysisResult | undefined> {
    return this.analysisResultsData.get(id);
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
      created: now,
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
      created: now,
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
      .sort((a, b) => b.created.getTime() - a.created.getTime())[0];
    
    const questions = await this.getInterviewQuestionByResumeAndJob(resumeId, jobDescriptionId);
    
    return {
      resume,
      analysis,
      questions,
    };
  }
}

// Import the storage initialization function
import { initializeStorage } from './storage-switcher';

// Initialize memory storage as fallback (for testing purposes)
const memStorage = new MemStorage();

// Initialize and export storage (will be either database or memory based on config)
export const storage = await initializeStorage();
