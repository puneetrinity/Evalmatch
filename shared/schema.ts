import { pgTable, serial, text, timestamp, json, integer, boolean, varchar, real } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import type { UserId, SessionId, ResumeId, JobId, AnalysisId } from './api-contracts';

// Analyzed data interfaces with stronger typing
export interface AnalyzedResumeData {
  name: string;
  skills: string[];
  experience: string;
  education: string[];
  summary: string;
  keyStrengths: string[];
  contactInfo?: {
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  workExperience?: Array<{
    company: string;
    position: string;
    duration: string;
    description: string;
    technologies?: string[];
  }>;
  certifications?: Array<{
    name: string;
    issuer: string;
    date?: string;
    expiryDate?: string;
  }>;
}

// Bias analysis response type
export interface SimpleBiasAnalysis {
  hasBias: boolean;
  biasTypes: string[];
  biasedPhrases: Array<{
    phrase: string;
    reason: string;
  }>;
  suggestions: string[];
  improvedDescription: string;
  overallScore?: number;
  summary?: string;
  biasIndicators?: Array<{
    type: string;
    text: string;
    suggestion: string;
  }>;
  recommendations?: string[];
}

// Enhanced bias analysis data with confidence and fairness metrics
export interface BiasAnalysisData {
  hasBias: boolean;
  biasTypes: string[];
  biasedPhrases: Array<{
    phrase: string;
    reason: string;
  }>;
  suggestions: string[];
  improvedDescription: string;
  biasConfidenceScore: number;
  fairnessAssessment: string;
  overallScore?: number;
  summary?: string;
  biasIndicators?: Array<{
    type: string;
    text: string;
    suggestion: string;
  }>;
  recommendations?: string[];
}

export interface AnalyzedJobData {
  requiredSkills: string[];
  preferredSkills: string[];
  experienceLevel: string;
  responsibilities: string[];
  summary: string;
  department?: string;
  location?: string;
  salaryRange?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  benefits?: string[];
  workArrangement?: 'remote' | 'hybrid' | 'onsite';
  companySize?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  biasAnalysis?: SimpleBiasAnalysis;
}

// Enhanced skill matching types
export interface SkillMatch {
  skill: string;
  matchPercentage: number;
  category: string;
  importance: 'critical' | 'important' | 'nice-to-have';
  source: 'exact' | 'semantic' | 'inferred';
}

export interface ScoringDimensions {
  skills: number;
  experience: number;
  education: number;
  semantic: number;
  overall: number;
}

export interface FairnessMetrics {
  biasConfidenceScore: number;
  potentialBiasAreas: string[];
  fairnessAssessment: string;
  demographicBlindSpots?: string[];
  inclusivityScore?: number;
  recommendations?: string[];
}

// TYPESCRIPT: Complete match analysis result interface
export interface MatchAnalysisResult {
  matchPercentage: number;
  matchedSkills: SkillMatch[];
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  confidenceLevel: 'low' | 'medium' | 'high';
  scoringDimensions: ScoringDimensions;
  fairnessMetrics?: FairnessMetrics;
  matchInsights?: {
    topMatches: string[];
    concerningGaps: string[];
    recommendations: string[];
  };
}

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: text("password"),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Resumes table
export const resumes = pgTable("resumes", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  batchId: text("batch_id"), // Track which upload batch this resume belongs to
  filename: text("filename").notNull(),
  fileSize: integer("file_size"),
  fileType: text("file_type"),
  content: text("content"),
  skills: json("skills").$type<string[]>(),
  experience: json("experience").$type<string>(),
  education: json("education").$type<string[]>(),
  embedding: json("embedding").$type<number[]>(),
  skillsEmbedding: json("skills_embedding").$type<number[]>(),
  analyzedData: json("analyzed_data").$type<AnalyzedResumeData>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Job descriptions table
export const jobDescriptions = pgTable("job_descriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requirements: json("requirements").$type<string[]>(),
  skills: json("skills").$type<string[]>(),
  experience: text("experience"),
  embedding: json("embedding").$type<number[]>(),
  requirementsEmbedding: json("requirements_embedding").$type<number[]>(),
  analyzedData: json("analyzed_data").$type<AnalyzedJobData>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Skill categories table for hierarchy
export const skillCategories = pgTable("skill_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: integer("parent_id"),
  level: integer("level").default(0),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Enhanced skills table with embeddings and relationships
export const skillsTable = pgTable("skills", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
  categoryId: integer("category_id"),
  aliases: json("aliases").$type<string[]>(),
  embedding: json("embedding").$type<number[]>(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analysis results table with enhanced typing
export const analysisResults = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  resumeId: integer("resume_id"),
  jobDescriptionId: integer("job_description_id"),
  matchPercentage: real("match_percentage"),
  matchedSkills: json("matched_skills").$type<SkillMatch[]>(),
  missingSkills: json("missing_skills").$type<string[]>(),
  analysis: json("analysis").$type<any>().notNull().default({}),
  candidateStrengths: json("candidate_strengths").$type<string[]>(),
  candidateWeaknesses: json("candidate_weaknesses").$type<string[]>(),
  recommendations: json("recommendations").$type<string[]>(),
  confidenceLevel: varchar("confidence_level", { length: 10 }).$type<'low' | 'medium' | 'high'>(),
  
  // Enhanced scoring dimensions
  semanticSimilarity: real("semantic_similarity"),
  skillsSimilarity: real("skills_similarity"),
  experienceSimilarity: real("experience_similarity"),
  educationSimilarity: real("education_similarity"),
  
  // ML-based scoring
  mlConfidenceScore: real("ml_confidence_score"),
  scoringDimensions: json("scoring_dimensions").$type<ScoringDimensions>(),
  
  fairnessMetrics: json("fairness_metrics").$type<FairnessMetrics>(),
  
  // Processing metadata
  processingTime: integer("processing_time"), // milliseconds
  aiProvider: varchar("ai_provider", { length: 50 }),
  modelVersion: varchar("model_version", { length: 50 }),
  processingFlags: json("processing_flags").$type<{
    usedFallback?: boolean;
    rateLimited?: boolean;
    cacheHit?: boolean;
    warnings?: string[];
  }>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Interview questions table with enhanced typing
export const interviewQuestions = pgTable("interview_questions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  resumeId: integer("resume_id"),
  jobDescriptionId: integer("job_description_id"),
  questions: json("questions").$type<Array<InterviewQuestionData>>(),
  metadata: json("metadata").$type<{
    estimatedDuration: number;
    difficulty: 'junior' | 'mid' | 'senior' | 'lead';
    focusAreas: string[];
    interviewType: 'phone' | 'video' | 'onsite' | 'technical';
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enhanced interview question type
export interface InterviewQuestionData {
  question: string;
  category: 'technical' | 'behavioral' | 'situational' | 'problem-solving';
  difficulty: 'easy' | 'medium' | 'hard';
  expectedAnswer: string;
  followUpQuestions?: string[];
  skillsAssessed: string[];
  timeAllotted?: number;
  evaluationCriteria?: string[];
}

// Type inference
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Resume = typeof resumes.$inferSelect;
export type InsertResume = typeof resumes.$inferInsert;

export type JobDescription = typeof jobDescriptions.$inferSelect;
export type InsertJobDescription = typeof jobDescriptions.$inferInsert;

export type AnalysisResult = typeof analysisResults.$inferSelect;
export type InsertAnalysisResult = typeof analysisResults.$inferInsert;

export type InterviewQuestions = typeof interviewQuestions.$inferSelect;
export type InsertInterviewQuestions = typeof interviewQuestions.$inferInsert;

export type SkillCategory = typeof skillCategories.$inferSelect;
export type InsertSkillCategory = typeof skillCategories.$inferInsert;

export type Skill = typeof skillsTable.$inferSelect;
export type InsertSkill = typeof skillsTable.$inferInsert;

// Enhanced Zod schemas for runtime validation - MUST be defined before insert schemas
export const resumeFileSchema = z.object({
  originalname: z.string().min(1, 'Filename is required'),
  mimetype: z.enum([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]),
  size: z.number().positive().max(10 * 1024 * 1024, 'File too large (max 10MB)'),
  path: z.string().optional(),
  buffer: z.instanceof(Buffer).optional(),
}).refine(data => data.path || data.buffer, {
  message: 'Either path or buffer must be provided'
});

// Resume content schema with stronger validation
export const resumeContentSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(10, 'Content too short'),
  skills: z.array(z.string().min(1)).default([]),
  experience: z.string().default(''),
  education: z.array(z.string()).default([]),
});

// Enhanced analyzed data schemas - MUST be defined before insert schemas
export const analyzedResumeDataSchema = z.object({
  name: z.string().min(1),
  skills: z.array(z.string().min(1)),
  experience: z.string().min(1),
  education: z.array(z.string()),
  summary: z.string().min(1),
  keyStrengths: z.array(z.string()),
  contactInfo: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().url().optional(),
  }).optional(),
  workExperience: z.array(z.object({
    company: z.string().min(1),
    position: z.string().min(1),
    duration: z.string().min(1),
    description: z.string().min(1),
    technologies: z.array(z.string()).optional(),
  })).optional(),
  certifications: z.array(z.object({
    name: z.string().min(1),
    issuer: z.string().min(1),
    date: z.string().optional(),
    expiryDate: z.string().optional(),
  })).optional(),
});

export const analyzedJobDataSchema = z.object({
  requiredSkills: z.array(z.string().min(1)),
  preferredSkills: z.array(z.string().min(1)),
  experienceLevel: z.string().min(1),
  responsibilities: z.array(z.string().min(1)),
  summary: z.string().min(1),
  department: z.string().optional(),
  location: z.string().optional(),
  salaryRange: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional(),
  }).optional(),
  benefits: z.array(z.string()).optional(),
  workArrangement: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  companySize: z.enum(['startup', 'small', 'medium', 'large', 'enterprise']).optional(),
});

// Skill match schema - MUST be defined before insert schemas
export const skillMatchSchema = z.object({
  skill: z.string().min(1),
  matchPercentage: z.number().min(0).max(100),
  category: z.string().min(1),
  importance: z.enum(['critical', 'important', 'nice-to-have']),
  source: z.enum(['exact', 'semantic', 'inferred']),
});

// Scoring dimensions schema - MUST be defined before insert schemas
export const scoringDimensionsSchema = z.object({
  skills: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  education: z.number().min(0).max(100),
  semantic: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
});

// Fairness metrics schema - MUST be defined before insert schemas
export const fairnessMetricsSchema = z.object({
  biasConfidenceScore: z.number().min(0).max(100),
  potentialBiasAreas: z.array(z.string()),
  fairnessAssessment: z.string().min(1),
  demographicBlindSpots: z.array(z.string()).optional(),
  inclusivityScore: z.number().min(0).max(100).optional(),
  recommendations: z.array(z.string()).optional(),
});

// Interview question schema - MUST be defined before insert schemas
export const interviewQuestionDataSchema = z.object({
  question: z.string().min(10),
  category: z.enum(['technical', 'behavioral', 'situational', 'problem-solving']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  expectedAnswer: z.string().min(10),
  followUpQuestions: z.array(z.string()).optional(),
  skillsAssessed: z.array(z.string().min(1)),
  timeAllotted: z.number().positive().optional(),
  evaluationCriteria: z.array(z.string()).optional(),
});

// Enhanced Zod schemas with validation - NOW all dependencies are defined above
export const insertUserSchema = createInsertSchema(users, {
  username: z.string().min(3).max(50),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});
export const selectUserSchema = createSelectSchema(users);

export const insertResumeSchema = createInsertSchema(resumes, {
  userId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  filename: z.string().min(1),
  fileSize: z.number().positive().optional(),
  fileType: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  skills: z.array(z.string()).optional(),
  experience: z.string().optional(),
  education: z.array(z.string()).optional(),
  analyzedData: analyzedResumeDataSchema.optional(),
});
export const selectResumeSchema = createSelectSchema(resumes);

export const insertJobDescriptionSchema = createInsertSchema(jobDescriptions, {
  userId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(10),
  requirements: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  experience: z.string().optional(),
  analyzedData: analyzedJobDataSchema.optional(),
});
export const selectJobDescriptionSchema = createSelectSchema(jobDescriptions);

export const insertAnalysisResultSchema = createInsertSchema(analysisResults, {
  userId: z.string().min(1).optional(),
  resumeId: z.number().positive().optional(),
  jobDescriptionId: z.number().positive().optional(),
  matchPercentage: z.number().min(0).max(100).optional(),
  matchedSkills: z.array(skillMatchSchema).optional(),
  missingSkills: z.array(z.string()).optional(),
  candidateStrengths: z.array(z.string()).optional(),
  candidateWeaknesses: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
  confidenceLevel: z.enum(['low', 'medium', 'high']).optional(),
  scoringDimensions: scoringDimensionsSchema.optional(),
  fairnessMetrics: fairnessMetricsSchema.optional(),
  processingTime: z.number().positive().optional(),
  aiProvider: z.string().optional(),
  modelVersion: z.string().optional(),
});
export const selectAnalysisResultSchema = createSelectSchema(analysisResults);

export const insertInterviewQuestionsSchema = createInsertSchema(interviewQuestions, {
  userId: z.string().min(1).optional(),
  resumeId: z.number().positive().optional(),
  jobDescriptionId: z.number().positive().optional(),
  questions: z.array(interviewQuestionDataSchema).optional(),
});
export const selectInterviewQuestionsSchema = createSelectSchema(interviewQuestions);

// Enhanced API Response types
export interface AnalyzeResumeResponse {
  id: ResumeId;
  filename: string;
  analyzedData: AnalyzedResumeData;
  processingTime: number;
  confidence: number;
  warnings?: string[];
  // Convenience properties for backward compatibility
  name?: string;
  skills?: string[];
  experience?: Array<{
    company: string;
    position: string;
    duration: string;
    description: string;
    technologies?: string[];
  }>;
  education?: Array<{
    degree: string;
    institution: string;
    year?: number;
    field?: string;
  }>;
  contact?: {
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
  };
  experienceYears?: number;
}

export interface AnalyzeJobDescriptionResponse {
  id: JobId;
  title: string;
  analyzedData: AnalyzedJobData;
  processingTime: number;
  confidence: number;
  warnings?: string[];
  // Convenience properties for backward compatibility
  requiredSkills?: string[];
  preferredSkills?: string[];
  skills?: string[];
  experience?: string;
  experienceLevel?: string;
  responsibilities?: string[];
  requirements?: string[];
  company?: string;
  summary?: string;
  biasAnalysis?: SimpleBiasAnalysis;
}

export interface MatchAnalysisResponse {
  analysisId: AnalysisId;
  jobId: JobId;
  results: Array<{
    resumeId: ResumeId;
    filename: string;
    candidateName?: string;
    matchPercentage: number;
    matchedSkills: SkillMatch[];
    missingSkills: string[];
    candidateStrengths: string[];
    candidateWeaknesses: string[];
    recommendations: string[];
    confidenceLevel: 'low' | 'medium' | 'high';
    scoringDimensions: ScoringDimensions;
    fairnessMetrics?: FairnessMetrics;
  }>;
  processingTime: number;
  metadata: {
    aiProvider: string;
    modelVersion: string;
    totalCandidates: number;
    processedCandidates: number;
    failedCandidates: number;
  };
  // Convenience properties for single-result responses
  matchPercentage?: number;
  matchedSkills?: SkillMatch[];
  missingSkills?: string[];
  candidateStrengths?: string[];
  candidateWeaknesses?: string[];
  recommendations?: string[];
  confidenceLevel?: 'low' | 'medium' | 'high';
  fairnessMetrics?: FairnessMetrics;
}

export interface InterviewQuestionsResponse {
  resumeId: ResumeId;
  jobId: JobId;
  candidateName?: string;
  jobTitle: string;
  questions: InterviewQuestionData[];
  metadata: {
    estimatedDuration: number;
    difficulty: 'junior' | 'mid' | 'senior' | 'lead';
    focusAreas: string[];
    interviewType: 'phone' | 'video' | 'onsite' | 'technical';
  };
  preparationTips?: string[];
  processingTime: number;
  // Convenience properties for backward compatibility
  technicalQuestions?: InterviewQuestionData[];
  experienceQuestions?: InterviewQuestionData[];
  skillGapQuestions?: InterviewQuestionData[];
}

export interface InterviewScriptResponse {
  // Script metadata
  jobTitle: string;
  candidateName: string;
  interviewDuration: string;
  
  // Script sections
  opening: {
    salutation: string;
    iceBreaker: string;
    interviewOverview: string;
  };
  
  currentRoleDiscussion: {
    roleAcknowledgment: string;
    currentWorkQuestions: Array<{
      question: string;
      purpose: string;
      expectedAnswer: string;
    }>;
  };
  
  skillMatchDiscussion: {
    introduction: string;
    matchedSkillsQuestions: Array<{
      skill: string;
      question: string;
      followUpQuestion?: string;
      expectedAnswer: string;
    }>;
  };
  
  skillGapAssessment: {
    introduction: string;
    gapQuestions: Array<{
      missingSkill: string;
      question: string;
      followUpQuestion?: string;
      expectedAnswer: string;
      assessmentCriteria: string;
    }>;
  };
  
  roleSell: {
    transitionStatement: string;
    roleHighlights: string[];
    opportunityDescription: string;
    closingQuestions: Array<{
      question: string;
      purpose: string;
    }>;
  };
  
  closing: {
    nextSteps: string;
    candidateQuestions: string;
    finalStatement: string;
  };
}

// Simple bias analysis response from AI providers
export type BiasAnalysisResponse = SimpleBiasAnalysis;

// Complex system-wide bias analysis response (for comprehensive analysis)
export interface SystemBiasAnalysisResponse {
  jobId: JobId;
  analysisId: AnalysisId;
  overallFairnessScore: number;
  results: Array<{
    resumeId: ResumeId;
    candidateName?: string;
    fairnessMetrics: FairnessMetrics;
    flaggedConcerns: Array<{
      type: 'language' | 'demographic' | 'education' | 'experience' | 'location';
      severity: 'low' | 'medium' | 'high';
      description: string;
      recommendation: string;
    }>;
  }>;
  systemwideAnalysis: {
    commonBiases: string[];
    improvementAreas: string[];
    complianceScore: number;
  };
  recommendations: string[];
  processingTime: number;
}

// File processing types
export interface FileUploadMetadata {
  originalName: string;
  mimetype: string;
  size: number;
  hash: string;
  uploadedAt: string;
  userId?: UserId;
  sessionId?: SessionId;
}

export interface FileProcessingResult {
  success: boolean;
  fileId?: ResumeId;
  extractedText?: string;
  analyzedData?: AnalyzedResumeData;
  processingTime: number;
  warnings?: string[];
  errors?: string[];
}

// Error types
export interface ProcessingError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  recoverable: boolean;
}

export interface ValidationError {
  field: string;
  value: unknown;
  message: string;
  code: string;
}