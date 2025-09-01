import {
  type Resume, type InsertResume,
  type JobDescription, type InsertJobDescription,
  type AnalysisResult, type InsertAnalysisResult,
  type InterviewQuestions, type InsertInterviewQuestions,
  type AnalyzeResumeResponse, type AnalyzeJobDescriptionResponse, 
  type User, type InsertUser, type SimpleBiasAnalysis
} from "@shared/schema";
import { UserTierInfo } from "@shared/user-tiers";
import { logger } from "./lib/logger";

/**
 * Storage interface for the Evalmatch resume analysis system.
 * 
 * This interface defines the contract for all storage implementations including
 * database storage, memory storage, and hybrid approaches. It provides methods
 * for managing users, resumes, job descriptions, analysis results, and interview questions.
 * 
 * @example
 * ```typescript
 * const storage = await createStorage();
 * const resume = await storage.getResume(123);
 * if (resume) {
 *   console.log(`Resume for ${resume.filename}`);
 * }
 * ```
 */
export interface IStorage {
  // ==================== USER METHODS ====================
  
  /**
   * Retrieves a user by their unique ID.
   * 
   * @param id - The unique identifier of the user
   * @returns Promise resolving to the user object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getUser(_id: number): Promise<User | undefined>;
  
  /**
   * Retrieves a user by their username.
   * 
   * @param username - The username to search for
   * @returns Promise resolving to the user object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getUserByUsername(_username: string): Promise<User | undefined>;
  
  /**
   * Creates a new user in the storage system.
   * 
   * @param user - The user data to insert (without ID, which will be auto-generated)
   * @returns Promise resolving to the created user object with assigned ID
   * @throws {Error} If user creation fails or required fields are missing
   */
  createUser(_user: InsertUser): Promise<User>;
  
  // ==================== RESUME METHODS ====================
  
  /**
   * Retrieves a resume by its unique ID.
   * 
   * @param id - The unique identifier of the resume
   * @returns Promise resolving to the resume object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getResume(_id: number): Promise<Resume | undefined>;
  
  /**
   * Retrieves a resume by ID with user ownership validation.
   * 
   * @param id - The unique identifier of the resume
   * @param userId - The ID of the user who should own this resume
   * @returns Promise resolving to the resume object or undefined if not found/unauthorized
   * @throws {Error} If database connection fails or query is malformed
   */
  getResumeById(_id: number, _userId: string): Promise<Resume | undefined>;
  
  /**
   * Retrieves all resumes, optionally filtered by session ID.
   * 
   * @param sessionId - Optional session ID to filter resumes
   * @returns Promise resolving to an array of resume objects
   * @throws {Error} If database connection fails
   */
  getResumes(_sessionId?: string): Promise<Resume[]>;
  
  /**
   * Retrieves all resumes for a specific user with optional filtering.
   * 
   * @param userId - The ID of the user whose resumes to retrieve
   * @param sessionId - Optional session ID to filter resumes
   * @param batchId - Optional batch ID to filter resumes
   * @returns Promise resolving to an array of resume objects
   * @throws {Error} If database connection fails
   */
  getResumesByUserId(_userId: string, _sessionId?: string, _batchId?: string): Promise<Resume[]>;
  
  /**
   * Creates a new resume in the storage system.
   * 
   * @param resume - The resume data to insert (without ID, which will be auto-generated)
   * @returns Promise resolving to the created resume object with assigned ID
   * @throws {Error} If resume creation fails or required fields are missing
   */
  createResume(_resume: InsertResume): Promise<Resume>;
  
  /**
   * Updates a resume with AI analysis results.
   * 
   * @param id - The unique identifier of the resume to update
   * @param analysis - The AI analysis results to store
   * @returns Promise resolving to the updated resume object
   * @throws {Error} If resume not found or update fails
   */
  updateResumeAnalysis(_id: number, _analysis: AnalyzeResumeResponse): Promise<Resume>;

  /**
   * Permanently deletes a resume from the storage system.
   * 
   * @param id - The unique identifier of the resume to delete
   * @returns Promise that resolves when deletion is complete
   * @throws {Error} If resume not found or deletion fails
   */
  deleteResume(_id: number): Promise<void>;
  
  /**
   * Updates a resume with vector embeddings for semantic search.
   * 
   * @param id - The unique identifier of the resume to update
   * @param embedding - The full text embedding vector or null
   * @param skillsEmbedding - The skills-specific embedding vector or null
   * @returns Promise resolving to the updated resume object
   * @throws {Error} If resume not found or update fails
   */
  updateResumeEmbeddings(_id: number, _embedding: number[] | null, _skillsEmbedding: number[] | null): Promise<Resume>;
  
  // ==================== JOB DESCRIPTION METHODS ====================
  
  /**
   * Retrieves a job description by its unique ID.
   * 
   * @param id - The unique identifier of the job description
   * @returns Promise resolving to the job description object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getJobDescription(_id: number): Promise<JobDescription | undefined>;
  
  /**
   * Retrieves a job description by ID with user ownership validation.
   * 
   * @param id - The unique identifier of the job description
   * @param userId - The ID of the user who should own this job description
   * @returns Promise resolving to the job description object or undefined if not found/unauthorized
   * @throws {Error} If database connection fails or query is malformed
   */
  getJobDescriptionById(_id: number, _userId: string): Promise<JobDescription | undefined>;
  
  /**
   * Retrieves all job descriptions in the system.
   * 
   * @returns Promise resolving to an array of job description objects
   * @throws {Error} If database connection fails
   */
  getJobDescriptions(): Promise<JobDescription[]>;
  
  /**
   * Retrieves all job descriptions for a specific user.
   * 
   * @param userId - The ID of the user whose job descriptions to retrieve
   * @returns Promise resolving to an array of job description objects
   * @throws {Error} If database connection fails
   */
  getJobDescriptionsByUserId(_userId: string): Promise<JobDescription[]>;
  
  /**
   * Creates a new job description in the storage system.
   * 
   * @param jobDescription - The job description data to insert (without ID)
   * @returns Promise resolving to the created job description object with assigned ID
   * @throws {Error} If creation fails or required fields are missing
   */
  createJobDescription(_jobDescription: InsertJobDescription): Promise<JobDescription>;
  
  /**
   * Updates a job description with partial field updates.
   * 
   * @param id - The unique identifier of the job description to update
   * @param updates - Partial job description object with fields to update
   * @returns Promise resolving to the updated job description object
   * @throws {Error} If job description not found or update fails
   */
  updateJobDescription(_id: number, _updates: Partial<JobDescription>): Promise<JobDescription>;
  
  /**
   * Updates a job description with AI analysis results.
   * 
   * @param id - The unique identifier of the job description to update
   * @param analysis - The AI analysis results to store
   * @returns Promise resolving to the updated job description object
   * @throws {Error} If job description not found or update fails
   */
  updateJobDescriptionAnalysis(_id: number, _analysis: AnalyzeJobDescriptionResponse): Promise<JobDescription>;
  
  /**
   * Updates job description embeddings for semantic similarity matching.
   * 
   * @param id - The unique identifier of the job description to update
   * @param embedding - The content embedding vector (384 dimensions) or null
   * @param requirementsEmbedding - The requirements embedding vector (384 dimensions) or null
   * @returns Promise resolving to the updated job description object
   * @throws {Error} If job description not found or update fails
   */
  updateJobDescriptionEmbeddings(_id: number, _embedding: number[] | null, _requirementsEmbedding: number[] | null): Promise<JobDescription>;

  /**
   * Updates a job description with bias analysis results.
   * 
   * @param id - The unique identifier of the job description to update
   * @param biasAnalysis - The bias analysis results to store
   * @returns Promise resolving to the updated job description object
   * @throws {Error} If job description not found or update fails
   */
  updateJobDescriptionBiasAnalysis(_id: number, _biasAnalysis: SimpleBiasAnalysis): Promise<JobDescription>;
  
  /**
   * Updates a job description with vector embeddings for semantic search.
   * 
   * @param id - The unique identifier of the job description to update
   * @param embedding - The full text embedding vector or null
   * @param requirementsEmbedding - The requirements-specific embedding vector or null
   * @returns Promise resolving to the updated job description object
   * @throws {Error} If job description not found or update fails
   */
  updateJobDescriptionEmbeddings(_id: number, _embedding: number[] | null, _requirementsEmbedding: number[] | null): Promise<JobDescription>;
  
  /**
   * Permanently deletes a job description from the storage system.
   * 
   * @param id - The unique identifier of the job description to delete
   * @returns Promise that resolves when deletion is complete
   * @throws {Error} If job description not found or deletion fails
   */
  deleteJobDescription(_id: number): Promise<void>;
  
  // ==================== ANALYSIS RESULTS METHODS ====================
  
  /**
   * Retrieves an analysis result by its unique ID.
   * 
   * @param id - The unique identifier of the analysis result
   * @returns Promise resolving to the analysis result object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getAnalysisResult(_id: number): Promise<AnalysisResult | undefined>;
  
  /**
   * Retrieves an analysis result for a specific job/resume combination.
   * 
   * @param jobId - The ID of the job description
   * @param resumeId - The ID of the resume
   * @param userId - The ID of the user who should own this analysis
   * @returns Promise resolving to the analysis result object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getAnalysisResultByJobAndResume(_jobId: number, _resumeId: number, _userId: string): Promise<AnalysisResult | undefined>;
  
  /**
   * Retrieves all analysis results for a specific job with optional filtering.
   * 
   * @param jobId - The ID of the job description
   * @param userId - The ID of the user who should own these analyses
   * @param sessionId - Optional session ID to filter results
   * @param batchId - Optional batch ID to filter results
   * @returns Promise resolving to an array of analysis result objects
   * @throws {Error} If database connection fails
   */
  getAnalysisResultsByJob(_jobId: number, _userId: string, _sessionId?: string, _batchId?: string): Promise<AnalysisResult[]>;
  
  /**
   * Retrieves all analysis results for a specific resume.
   * 
   * @param resumeId - The ID of the resume
   * @returns Promise resolving to an array of analysis result objects
   * @throws {Error} If database connection fails
   */
  getAnalysisResultsByResumeId(_resumeId: number): Promise<AnalysisResult[]>;
  
  /**
   * Retrieves all analysis results for a specific job description.
   * 
   * @param jobDescriptionId - The ID of the job description
   * @returns Promise resolving to an array of analysis result objects
   * @throws {Error} If database connection fails
   */
  getAnalysisResultsByJobDescriptionId(_jobDescriptionId: number): Promise<AnalysisResult[]>;
  
  /**
   * Creates a new analysis result in the storage system.
   * 
   * @param analysisResult - The analysis result data to insert (without ID)
   * @returns Promise resolving to the created analysis result object with assigned ID
   * @throws {Error} If creation fails or required fields are missing
   */
  createAnalysisResult(_analysisResult: InsertAnalysisResult): Promise<AnalysisResult>;
  
  // ==================== INTERVIEW QUESTIONS METHODS ====================
  
  /**
   * Retrieves interview questions by their unique ID.
   * 
   * @param id - The unique identifier of the interview questions
   * @returns Promise resolving to the interview questions object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getInterviewQuestions(_id: number): Promise<InterviewQuestions | undefined>;
  
  /**
   * Retrieves all interview questions for a specific resume.
   * 
   * @param resumeId - The ID of the resume
   * @returns Promise resolving to an array of interview questions objects
   * @throws {Error} If database connection fails
   */
  getInterviewQuestionsByResumeId(_resumeId: number): Promise<InterviewQuestions[]>;
  
  /**
   * Retrieves all interview questions for a specific job description.
   * 
   * @param jobDescriptionId - The ID of the job description
   * @returns Promise resolving to an array of interview questions objects
   * @throws {Error} If database connection fails
   */
  getInterviewQuestionsByJobDescriptionId(_jobDescriptionId: number): Promise<InterviewQuestions[]>;
  
  /**
   * Retrieves interview questions for a specific resume/job combination.
   * 
   * @param resumeId - The ID of the resume
   * @param jobDescriptionId - The ID of the job description
   * @returns Promise resolving to the interview questions object or undefined if not found
   * @throws {Error} If database connection fails or query is malformed
   */
  getInterviewQuestionByResumeAndJob(_resumeId: number, _jobDescriptionId: number): Promise<InterviewQuestions | undefined>;
  
  /**
   * Creates new interview questions in the storage system.
   * 
   * @param interviewQuestions - The interview questions data to insert (without ID)
   * @returns Promise resolving to the created interview questions object with assigned ID
   * @throws {Error} If creation fails or required fields are missing
   */
  createInterviewQuestions(_interviewQuestions: InsertInterviewQuestions): Promise<InterviewQuestions>;
  
  // ==================== COMBINATION METHODS ====================
  
  /**
   * Retrieves a resume with its latest analysis and interview questions for a job.
   * This is an optimized method that combines multiple queries for better performance.
   * 
   * @param resumeId - The ID of the resume
   * @param jobDescriptionId - The ID of the job description
   * @returns Promise resolving to an object containing resume, analysis, and questions
   * @throws {Error} If database connection fails or resume not found
   */
  getResumeWithLatestAnalysisAndQuestions(_resumeId: number, _jobDescriptionId: number): Promise<{
    resume: Resume;
    analysis: AnalysisResult | undefined;
    questions: InterviewQuestions | undefined;
  }>;
  
  // ==================== USER TIER METHODS (OPTIONAL) ====================
  
  /**
   * Retrieves user tier information for usage limits and feature access.
   * This method is optional and may not be implemented by all storage backends.
   * 
   * @param userId - The ID of the user
   * @returns Promise resolving to the user tier info or undefined if not found/implemented
   * @throws {Error} If database connection fails (when implemented)
   */
  getUserTierInfo?(_userId: string): Promise<UserTierInfo | undefined>;
  
  /**
   * Saves user tier information for usage tracking and feature access.
   * This method is optional and may not be implemented by all storage backends.
   * 
   * @param userId - The ID of the user
   * @param tierInfo - The tier information to save
   * @returns Promise that resolves when save is complete
   * @throws {Error} If database connection fails (when implemented)
   */
  saveUserTierInfo?(_userId: string, _tierInfo: UserTierInfo): Promise<void>;
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
  async getUser(_id: number): Promise<User | undefined> {
    return this.users.get(_id);
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
    
    // Apply both sessionId and batchId filters when provided
    if (batchId) {
      userResumes = userResumes.filter(resume => resume.batchId === batchId);
    }
    
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

  async deleteResume(id: number): Promise<void> {
    this.resumesData.delete(id);
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
    
    // Apply both sessionId and batchId filters when provided
    if (batchId) {
      filteredResults = filteredResults.filter(result => {
        if (result.resumeId === null) return false;
        const resume = this.resumesData.get(result.resumeId);
        return resume && resume.batchId === batchId;
      });
    }
    
    if (sessionId) {
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
const _memStorage = new MemStorage();

// Export storage initialization function for async initialization
export let storage: IStorage | null = null;

// Enhanced storage retrieval with initialization validation
export function getStorage(): IStorage {
  if (!storage) {
    logger.error('💥 Storage not initialized when requested!');
    logger.error('Current timestamp:', new Date().toISOString());
    logger.error('Call stack:', new Error().stack);
    
    // Get storage initialization status for better debugging
    const initStatus = getStorageInitializationStatus();
    logger.error('Storage initialization status:', {
      storageIsNull: storage === null,
      storageIsUndefined: storage === undefined,
      typeof: typeof storage,
      initializationState: initStatus
    });
    
    // Provide more helpful error messages based on state
    if (initStatus.isInitializing) {
      throw new Error('Storage is currently being initialized. Please wait for initialization to complete.');
    } else if (initStatus.lastInitializationError) {
      throw new Error(`Storage initialization failed: ${initStatus.lastInitializationError.message}. Call initializeAppStorage() again.`);
    } else {
      throw new Error('Storage not initialized. Call initializeAppStorage() first.');
    }
  }
  
  // Validate storage instance
  if (typeof storage !== 'object' || !storage.getJobDescriptions) {
    logger.error('💥 Storage instance is invalid!', {
      storageType: typeof storage,
      hasGetJobDescriptions: !!(storage as IStorage)?.getJobDescriptions,
      constructorName: storage?.constructor?.name
    });
    throw new Error('Storage instance is invalid or corrupted. Re-initialization required.');
  }
  
  logger.debug('✅ Storage instance retrieved successfully', {
    storageType: storage.constructor.name,
    timestamp: new Date().toISOString()
  });
  return storage;
}

// Mutex for storage initialization to prevent concurrent calls
let storageInitializationPromise: Promise<IStorage> | null = null;

// Initialize storage asynchronously with proper synchronization
export async function initializeAppStorage(): Promise<IStorage> {
  logger.info('initializeAppStorage called', {
    storageAlreadyInitialized: !!storage,
    initializationInProgress: !!storageInitializationPromise,
    timestamp: new Date().toISOString()
  });
  
  // If storage is already initialized and valid, return it
  if (storage) {
    try {
      // Quick validation to ensure storage is still functional
      await storage.getJobDescriptions();
      logger.info('Storage already initialized and functional', {
        storageType: storage.constructor.name
      });
      return storage;
    } catch (error) {
      logger.warn('Existing storage instance failed validation, reinitializing', error);
      storage = null; // Clear invalid storage
    }
  }
  
  // If initialization is already in progress, wait for it
  if (storageInitializationPromise) {
    logger.info('Storage initialization already in progress, waiting for completion');
    try {
      return await storageInitializationPromise;
    } catch (error) {
      // If previous initialization failed, we'll try again
      logger.warn('Previous storage initialization promise failed, attempting new initialization', error);
      storageInitializationPromise = null;
    }
  }
  
  // Start new initialization
  storageInitializationPromise = performStorageInitialization();
  
  try {
    const result = await storageInitializationPromise;
    storage = result; // Cache the result
    logger.info('Storage initialization completed successfully', {
      storageType: result.constructor.name,
      timestamp: new Date().toISOString()
    });
    return result;
  } catch (error) {
    logger.error('Storage initialization failed', error);
    throw error;
  } finally {
    // Clear the promise whether it succeeded or failed
    storageInitializationPromise = null;
  }
}

// Perform the actual storage initialization
async function performStorageInitialization(): Promise<IStorage> {
  logger.info('Starting storage initialization process');
  
  try {
    const storage = await initializeStorage();
    
    // Post-initialization validation
    logger.info('Validating initialized storage');
    await storage.getJobDescriptions(); // Basic functional test
    
    logger.info('Storage validation successful');
    return storage;
  } catch (error) {
    logger.error('Storage initialization process failed', error);
    throw new Error(`Storage initialization failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Import storage initialization status function
import { getStorageInitializationStatus } from './storage-switcher';

/**
 * Get current storage status for monitoring and debugging
 */
export function getStorageStatus(): {
  isInitialized: boolean;
  storageType: string | null;
  initializationInProgress: boolean;
  hasErrors: boolean;
  lastError: string | null;
  canRetry: boolean;
} {
  const initStatus = getStorageInitializationStatus();
  
  return {
    isInitialized: !!storage && initStatus.isInitialized,
    storageType: storage?.constructor?.name || null,
    initializationInProgress: !!storageInitializationPromise || initStatus.isInitializing,
    hasErrors: !!initStatus.lastInitializationError,
    lastError: initStatus.lastInitializationError?.message || null,
    canRetry: initStatus.initializationAttempts < initStatus.maxRetries,
  };
}

/**
 * Force storage reinitialization (use with caution)
 */
export async function reinitializeAppStorage(): Promise<IStorage> {
  logger.warn('Forcing complete storage reinitialization');
  
  // Clear current state
  storage = null;
  storageInitializationPromise = null;
  
  // Force reinitialization in storage-switcher
  const { reinitializeStorage } = await import('./storage-switcher');
  const newStorage = await reinitializeStorage();
  
  // Update our cached storage
  storage = newStorage;
  
  logger.info('Storage reinitialization completed', {
    storageType: newStorage.constructor.name
  });
  
  return newStorage;
}

// ==================== UNIFIED STORAGE FACTORY ====================

/**
 * Unified Storage Factory - Simple interface for creating storage instances
 * 
 * This factory function provides a clean, simple interface for creating storage
 * instances while preserving all the existing reliability and fallback mechanisms.
 * It wraps the existing complex initialization logic in a more user-friendly API.
 * 
 * @example
 * ```typescript
 * // Simple usage - automatically chooses best storage type
 * const storage = await createStorage();
 * 
 * // Force specific storage type
 * const memoryStorage = await createStorage({ type: 'memory' });
 * const dbStorage = await createStorage({ type: 'database' });
 * ```
 */
export async function createStorage(options?: {
  type?: 'auto' | 'database' | 'hybrid' | 'memory';
  forceReinit?: boolean;
}): Promise<IStorage> {
  const { type = 'auto', forceReinit = false } = options || {};
  
  logger.info('🏭 Storage Factory: Creating storage instance', {
    requestedType: type,
    forceReinit,
    currentStorage: storage?.constructor?.name || 'none'
  });

  // If force reinit requested, clear existing storage
  if (forceReinit) {
    logger.info('🔄 Storage Factory: Force reinitialization requested');
    return await reinitializeAppStorage();
  }

  // If storage already exists and auto mode, return existing
  if (storage && type === 'auto') {
    try {
      // Quick validation
      await storage.getJobDescriptions();
      logger.info('✅ Storage Factory: Returning existing storage', {
        storageType: storage.constructor.name
      });
      return storage;
    } catch (error) {
      logger.warn('⚠️  Storage Factory: Existing storage failed validation, reinitializing', error);
      return await reinitializeAppStorage();
    }
  }

  // Handle specific storage type requests
  if (type !== 'auto') {
    logger.info('🎯 Storage Factory: Specific storage type requested', { type });
    
    switch (type) {
      case 'memory':
        logger.info('📄 Storage Factory: Creating memory storage');
        return new MemStorage();
        
      case 'database':
      case 'hybrid':
        logger.info('🗄️  Storage Factory: Creating database/hybrid storage');
        // Use existing initialization which handles database/hybrid logic
        return await initializeAppStorage();
        
      default:
        throw new Error(`Unknown storage type: ${type}`);
    }
  }

  // Auto mode - use existing smart initialization
  logger.info('🤖 Storage Factory: Auto mode - using smart initialization');
  return await initializeAppStorage();
}

/**
 * Get or create storage instance - convenience method
 * 
 * This is the simplest way to get a storage instance. It will return the
 * existing instance if available, or create a new one if needed.
 * 
 * @example
 * ```typescript
 * const storage = await getOrCreateStorage();
 * ```
 */
export async function getOrCreateStorage(): Promise<IStorage> {
  try {
    // Try to get existing storage first
    return getStorage();
  } catch (error) {
    // If that fails, create new storage
    logger.info('🔧 Storage not initialized, creating new instance');
    return await createStorage();
  }
}
