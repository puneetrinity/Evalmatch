import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse, 
  type MatchAnalysisResponse, type InterviewQuestionsResponse,
  type User, type InsertUser, type SimpleBiasAnalysis
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
  getResumesByUserId(userId: string, sessionId?: string, batchId?: string): Promise<Resume[]>;
  createResume(resume: InsertResume): Promise<Resume>;
  updateResumeAnalysis(id: number, analysis: AnalyzeResumeResponse): Promise<Resume>;
  updateResumeEmbeddings(id: number, embedding: number[] | null, skillsEmbedding: number[] | null): Promise<Resume>;
  
  // Job description methods
  getJobDescription(id: number): Promise<JobDescription | undefined>;
  getJobDescriptionById(id: number, userId: string): Promise<JobDescription | undefined>;
  getJobDescriptions(): Promise<JobDescription[]>;
  getJobDescriptionsByUserId(userId: string): Promise<JobDescription[]>;
  createJobDescription(jobDescription: InsertJobDescription): Promise<JobDescription>;
  updateJobDescription(id: number, updates: Partial<JobDescription>): Promise<JobDescription>;
  updateJobDescriptionAnalysis(id: number, analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription>;
  updateJobDescriptionBiasAnalysis(id: number, biasAnalysis: SimpleBiasAnalysis): Promise<JobDescription>;
  updateJobDescriptionEmbeddings(id: number, embedding: number[] | null, requirementsEmbedding: number[] | null): Promise<JobDescription>;
  deleteJobDescription(id: number): Promise<void>;
  
  // Analysis results methods
  getAnalysisResult(id: number): Promise<AnalysisResult | undefined>;
  getAnalysisResultByJobAndResume(jobId: number, resumeId: number, userId: string): Promise<AnalysisResult | undefined>;
  getAnalysisResultsByJob(jobId: number, userId: string, sessionId?: string, batchId?: string): Promise<AnalysisResult[]>;
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
    const user: User = { 
      ...insertUser, 
      id,
      password: insertUser.password ?? null,
      email: insertUser.email ?? null,
      createdAt: insertUser.createdAt ?? null,
      updatedAt: insertUser.updatedAt ?? null
    };
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

  async getResumesByUserId(userId: string, sessionId?: string, batchId?: string): Promise<Resume[]> {
    const allResumes = Array.from(this.resumesData.values());
    
    // Filter by userId first
    let userResumes = allResumes.filter(resume => resume.userId === userId);
    
    // Priority-based filtering: batchId takes precedence over sessionId
    // This ensures consistent behavior with getAnalysisResultsByJob
    if (batchId) {
      // Filter by batchId only - ignore sessionId to avoid conflicts
      userResumes = userResumes.filter(resume => resume.batchId === batchId);
    } else if (sessionId) {
      // Only filter by sessionId if no batchId is provided
      userResumes = userResumes.filter(resume => resume.sessionId === sessionId);
    }
    
    return userResumes;
  }

  async createResume(insertResume: InsertResume): Promise<Resume> {
    const id = this.resumeCurrentId++;
    const now = new Date();
    // Make sure sessionId is set to a default value if not provided
    const sessionId = insertResume.sessionId || "default";
    // Make sure batchId is set to a default value if not provided
    const batchId = insertResume.batchId || "default";
    
    const resume: Resume = {
      ...insertResume,
      id,
      createdAt: now,
      updatedAt: insertResume.updatedAt || null,
      analyzedData: null,
      sessionId, // Ensure sessionId is assigned
      batchId, // Ensure batchId is assigned
      content: insertResume.content || null,
      fileSize: insertResume.fileSize || null,
      fileType: insertResume.fileType || null,
      skills: insertResume.skills || null,
      experience: insertResume.experience || null,
      education: insertResume.education ?? null,
      embedding: insertResume.embedding || null,
      skillsEmbedding: insertResume.skillsEmbedding || null,
      userId: insertResume.userId || null,
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
      analyzedData: analysis.analyzedData || {
        name: analysis.name || "",
        skills: analysis.skills || [],
        experience: analysis.experience || [],
        education: analysis.education || [],
        contact: analysis.contact || { email: "", phone: "", location: "" },
        summary: "Analysis data",
        keyStrengths: analysis.skills?.slice(0, 3) || []
      },
    };
    
    this.resumesData.set(id, updatedResume);
    return updatedResume;
  }

  async updateResumeEmbeddings(id: number, embedding: number[] | null, skillsEmbedding: number[] | null): Promise<Resume> {
    const resume = await this.getResume(id);
    if (!resume) {
      throw new Error(`Resume with ID ${id} not found`);
    }
    
    const updatedResume: Resume = {
      ...resume,
      embedding,
      skillsEmbedding,
      updatedAt: new Date(),
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
      updatedAt: insertJobDescription.updatedAt || null,
      analyzedData: null,
      userId: insertJobDescription.userId || null,
      skills: insertJobDescription.skills || null,
      experience: insertJobDescription.experience || null,
      embedding: insertJobDescription.embedding || null,
      requirements: insertJobDescription.requirements || null,
      requirementsEmbedding: insertJobDescription.requirementsEmbedding || null,
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
      analyzedData: analysis.analyzedData || {
        requiredSkills: analysis.requiredSkills || [],
        preferredSkills: analysis.preferredSkills || [],
        experienceLevel: analysis.experienceLevel || "",
        responsibilities: analysis.responsibilities || [],
        summary: analysis.summary || "",
        benefits: [],
        qualifications: [],
        companyInfo: { name: "", size: "medium", industry: "" },
        location: "Remote"
      },
    };
    
    this.jobDescriptionsData.set(id, updatedJobDescription);
    return updatedJobDescription;
  }

  async updateJobDescriptionBiasAnalysis(id: number, biasAnalysis: SimpleBiasAnalysis): Promise<JobDescription> {
    const jobDescription = await this.getJobDescription(id);
    if (!jobDescription) {
      throw new Error(`Job description with ID ${id} not found`);
    }
    
    // Safely handle null analyzedData
    const currentAnalyzedData = jobDescription.analyzedData || {
      requiredSkills: [],
      preferredSkills: [],
      experienceLevel: "",
      responsibilities: [],
      summary: "",
      benefits: [],
      qualifications: [],
      companyInfo: { name: "", size: "medium", industry: "" },
      location: "Remote"
    };
    const updatedJobDescription: JobDescription = {
      ...jobDescription,
      analyzedData: {
        ...currentAnalyzedData,
        biasAnalysis: biasAnalysis,
      },
    };
    
    this.jobDescriptionsData.set(id, updatedJobDescription);
    return updatedJobDescription;
  }

  async updateJobDescriptionEmbeddings(id: number, embedding: number[] | null, requirementsEmbedding: number[] | null): Promise<JobDescription> {
    const jobDescription = await this.getJobDescription(id);
    if (!jobDescription) {
      throw new Error(`Job description with ID ${id} not found`);
    }
    
    const updatedJobDescription: JobDescription = {
      ...jobDescription,
      embedding,
      requirementsEmbedding,
      updatedAt: new Date(),
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

  async getAnalysisResultsByJob(jobId: number, userId: string, sessionId?: string, batchId?: string): Promise<AnalysisResult[]> {
    const results = Array.from(this.analysisResultsData.values());
    let filteredResults = results.filter(result => 
      result.jobDescriptionId === jobId && 
      result.userId === userId
    );
    
    // Priority-based filtering: batchId takes precedence over sessionId
    // This ensures consistent behavior with getResumesByUserId method
    if (batchId) {
      // Filter by batchId only - ignore sessionId to avoid conflicts
      filteredResults = filteredResults.filter(result => {
        if (result.resumeId === null) return false;
        const resume = this.resumesData.get(result.resumeId);
        return resume && resume.batchId === batchId;
      });
    } else if (sessionId) {
      // Only filter by sessionId if no batchId is provided
      filteredResults = filteredResults.filter(result => {
        if (result.resumeId === null) return false;
        const resume = this.resumesData.get(result.resumeId);
        return resume && resume.sessionId === sessionId;
      });
    }
    
    // Add resume data to each result
    return filteredResults.map(result => ({
      ...result,
      resume: result.resumeId !== null ? this.resumesData.get(result.resumeId) : undefined
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
      id,
      createdAt: insertAnalysisResult.createdAt ?? now,
      updatedAt: insertAnalysisResult.updatedAt ?? now,
      userId: insertAnalysisResult.userId ?? null,
      resumeId: insertAnalysisResult.resumeId ?? null,
      jobDescriptionId: insertAnalysisResult.jobDescriptionId ?? null,
      matchPercentage: insertAnalysisResult.matchPercentage ?? null,
      matchedSkills: insertAnalysisResult.matchedSkills ?? null,
      missingSkills: insertAnalysisResult.missingSkills ?? null,
      analysis: insertAnalysisResult.analysis ?? {},
      candidateStrengths: insertAnalysisResult.candidateStrengths ?? null,
      candidateWeaknesses: insertAnalysisResult.candidateWeaknesses ?? null,
      recommendations: insertAnalysisResult.recommendations ?? null,
      confidenceLevel: insertAnalysisResult.confidenceLevel ?? null,
      semanticSimilarity: insertAnalysisResult.semanticSimilarity ?? null,
      skillsSimilarity: insertAnalysisResult.skillsSimilarity ?? null,
      experienceSimilarity: insertAnalysisResult.experienceSimilarity ?? null,
      educationSimilarity: insertAnalysisResult.educationSimilarity ?? null,
      mlConfidenceScore: insertAnalysisResult.mlConfidenceScore ?? null,
      scoringDimensions: insertAnalysisResult.scoringDimensions ?? null,
      fairnessMetrics: insertAnalysisResult.fairnessMetrics ?? null,
      processingTime: insertAnalysisResult.processingTime ?? null,
      aiProvider: insertAnalysisResult.aiProvider ?? null,
      modelVersion: insertAnalysisResult.modelVersion ?? null,
      processingFlags: insertAnalysisResult.processingFlags ?? null,
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
      updatedAt: insertInterviewQuestions.updatedAt || null,
      userId: insertInterviewQuestions.userId || null,
      resumeId: insertInterviewQuestions.resumeId || null,
      jobDescriptionId: insertInterviewQuestions.jobDescriptionId || null,
      questions: insertInterviewQuestions.questions || null,
      metadata: insertInterviewQuestions.metadata || null,
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
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))[0];
    
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
