import { pgTable, serial, text, timestamp, json, integer, boolean, varchar, real, date } from "drizzle-orm/pg-core";
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

// Users table - extended with Firebase and Mautic integration
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  firebaseUid: varchar("firebase_uid", { length: 128 }).unique(),
  mauticContactId: varchar("mautic_contact_id", { length: 50 }),
  displayName: varchar("display_name", { length: 255 }),
  photoUrl: text("photo_url"),
  lastMauticSync: timestamp("last_mautic_sync"),
  lastLogin: timestamp("last_login"),
  loginCount: integer("login_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User identity mapping table
export const userIdentityMapping = pgTable("user_identity_mapping", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: 'cascade' }),
  firebaseUid: varchar("firebase_uid", { length: 128 }).unique().notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }), // 'google', 'email', etc.
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
export const skillCategories: any = pgTable("skill_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: integer("parent_id").references(() => skillCategories.id),
  level: integer("level").default(0),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Enhanced skills table with embeddings and relationships
export const skillsTable = pgTable("skills", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
  categoryId: integer("category_id").references(() => skillCategories.id),
  aliases: json("aliases").$type<string[]>(),
  embedding: json("embedding").$type<number[]>(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Analysis results table with enhanced typing
export const analysisResults = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  resumeId: integer("resume_id").references(() => resumes.id),
  jobDescriptionId: integer("job_description_id").references(() => jobDescriptions.id),
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
  resumeId: integer("resume_id").references(() => resumes.id),
  jobDescriptionId: integer("job_description_id").references(() => jobDescriptions.id),
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
export type UserIdentityMapping = typeof userIdentityMapping.$inferSelect;
export type InsertUserIdentityMapping = typeof userIdentityMapping.$inferInsert;

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

// Skill Memory System tables for automated learning
export const skillMemory = pgTable("skill_memory", {
  id: serial("id").primaryKey(),
  skillText: varchar("skill_text", { length: 255 }).notNull().unique(),
  normalizedSkillText: varchar("normalized_skill_text", { length: 255 }).notNull(),
  frequency: integer("frequency").default(1),
  
  // Validation layers
  escoValidated: boolean("esco_validated").default(false),
  escoId: varchar("esco_id", { length: 100 }),
  escoCategory: varchar("esco_category", { length: 100 }),
  
  groqConfidence: real("groq_confidence").default(0),
  groqCategory: varchar("groq_category", { length: 100 }),
  
  mlSimilarityScore: real("ml_similarity_score").default(0),
  mlSimilarTo: varchar("ml_similar_to", { length: 255 }),
  mlCategory: varchar("ml_category", { length: 100 }),
  
  // Auto-approval tracking
  autoApproved: boolean("auto_approved").default(false),
  autoApprovalReason: varchar("auto_approval_reason", { length: 50 }),
  autoApprovalConfidence: real("auto_approval_confidence").default(0),
  
  // Metadata
  categorySuggestion: varchar("category_suggestion", { length: 100 }),
  sourceContexts: json("source_contexts").$type<Array<{
    type: 'resume' | 'job_description';
    id: string;
    context: string;
    timestamp: string;
  }>>().default([]),
  firstSeen: timestamp("first_seen").defaultNow(),
  lastSeen: timestamp("last_seen").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const skillMemoryStats = pgTable("skill_memory_stats", {
  id: serial("id").primaryKey(),
  date: date("date").defaultNow(),
  totalSkillsDiscovered: integer("total_skills_discovered").default(0),
  escoValidatedCount: integer("esco_validated_count").default(0),
  autoApprovedCount: integer("auto_approved_count").default(0),
  highFrequencyCount: integer("high_frequency_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const skillPromotionLog = pgTable("skill_promotion_log", {
  id: serial("id").primaryKey(),
  skillId: integer("skill_id").references(() => skillMemory.id),
  mainSkillId: integer("main_skill_id").references(() => skillsTable.id),
  promotionReason: varchar("promotion_reason", { length: 50 }).notNull(),
  promotionConfidence: real("promotion_confidence").notNull(),
  promotionData: json("promotion_data").$type<{
    originalFrequency?: number;
    escoMatch?: boolean;
    mlSimilarity?: number;
    groqValidation?: number;
    domainPattern?: boolean;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export type SkillMemory = typeof skillMemory.$inferSelect;
export type InsertSkillMemory = typeof skillMemory.$inferInsert;

export type SkillMemoryStats = typeof skillMemoryStats.$inferSelect;
export type InsertSkillMemoryStats = typeof skillMemoryStats.$inferInsert;

export type SkillPromotionLog = typeof skillPromotionLog.$inferSelect;
export type InsertSkillPromotionLog = typeof skillPromotionLog.$inferInsert;

// Token Usage System tables
export const userApiLimits = pgTable("user_api_limits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(), // Firebase UID
  tier: varchar("tier", { length: 50 }).notNull().default('testing'),
  maxCalls: integer("max_calls").notNull().default(200),
  usedCalls: integer("used_calls").notNull().default(0),
  resetPeriod: varchar("reset_period", { length: 20 }).notNull().default('monthly'),
  lastReset: timestamp("last_reset").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const apiCallLogs = pgTable("api_call_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Firebase UID
  endpoint: text("endpoint").notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  statusCode: integer("status_code"),
  processingTime: integer("processing_time"), // milliseconds
  requestSize: integer("request_size"), // bytes
  responseSize: integer("response_size"), // bytes
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userTokens = pgTable("user_tokens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Firebase UID
  tokenId: text("token_id").notNull().unique(), // Generated token identifier
  tokenName: text("token_name"), // User-provided token name
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  totalRequests: integer("total_requests").default(0),
});

export const usageStatistics = pgTable("usage_statistics", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  totalUsers: integer("total_users").default(0),
  totalApiCalls: integer("total_api_calls").default(0),
  uniqueActiveUsers: integer("unique_active_users").default(0),
  averageCallsPerUser: real("average_calls_per_user").default(0),
  tierDistribution: json("tier_distribution").$type<Record<string, number>>().default({}),
  topEndpoints: json("top_endpoints").$type<Array<{endpoint: string; count: number}>>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiTokenUsageLogs = pgTable("ai_token_usage_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id"), // Firebase UID, nullable for system calls
  provider: varchar("provider", { length: 20 }).notNull(), // 'openai', 'anthropic', 'groq'
  model: varchar("model", { length: 100 }).notNull(),
  operation: varchar("operation", { length: 50 }).notNull(), // 'resume_analysis', 'job_analysis', etc.
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCost: real("estimated_cost").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default('USD'),
  analysisId: text("analysis_id"), // Optional link to specific analysis
  requestId: text("request_id"), // For correlating with API call logs
  createdAt: timestamp("created_at").defaultNow(),
});

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
  username: (schema) => schema.min(3).max(50),
});
export const selectUserSchema = createSelectSchema(users);

export const insertResumeSchema = createInsertSchema(resumes, {
  filename: (schema) => schema.min(1),
});
export const selectResumeSchema = createSelectSchema(resumes);

export const insertJobDescriptionSchema = createInsertSchema(jobDescriptions, {
  title: (schema) => schema.min(1),
  description: (schema) => schema.min(10),
});
export const selectJobDescriptionSchema = createSelectSchema(jobDescriptions);

export const insertAnalysisResultSchema = createInsertSchema(analysisResults);
export const selectAnalysisResultSchema = createSelectSchema(analysisResults);

export const insertInterviewQuestionsSchema = createInsertSchema(interviewQuestions);
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

// Credit System tables
export const userCredits = pgTable("user_credits", {
  userId: text("user_id").primaryKey(), // Firebase UID
  credits: integer("credits").notNull().default(0),
  totalCreditsPurchased: integer("total_credits_purchased").notNull().default(0),
  totalCreditsUsed: integer("total_credits_used").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => userCredits.userId, { onDelete: 'cascade' }),
  transactionType: varchar("transaction_type", { length: 20 }).notNull(), // 'debit', 'credit', 'grant', 'refund'
  amount: integer("amount").notNull(), // positive for credits added, negative for credits used
  balanceBefore: integer("balance_before").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  description: text("description").notNull(),
  referenceId: text("reference_id"), // analysis_id, purchase_id, batch_id, etc.
  metadata: json("metadata").$type<{
    source?: string;
    version?: string;
    grant_type?: string;
    analysis_batch_id?: string;
    [key: string]: any;
  }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// Token Usage System types
export type UserApiLimits = typeof userApiLimits.$inferSelect;
export type InsertUserApiLimits = typeof userApiLimits.$inferInsert;

export type ApiCallLog = typeof apiCallLogs.$inferSelect;
export type InsertApiCallLog = typeof apiCallLogs.$inferInsert;

export type UserToken = typeof userTokens.$inferSelect;
export type InsertUserToken = typeof userTokens.$inferInsert;

export type UsageStatistics = typeof usageStatistics.$inferSelect;
export type InsertUsageStatistics = typeof usageStatistics.$inferInsert;

export type AITokenUsageLog = typeof aiTokenUsageLogs.$inferSelect;
export type InsertAITokenUsageLog = typeof aiTokenUsageLogs.$inferInsert;

// Credit System types
export type UserCredit = typeof userCredits.$inferSelect;
export type InsertUserCredit = typeof userCredits.$inferInsert;

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

// Token usage interfaces
export interface TokenGenerationRequest {
  name?: string;
  tokenName?: string;
  expiresIn?: '1h' | '24h' | '7d' | '30d' | 'never';
  permissions?: string[];
}

export interface TokenGenerationResponse {
  id: string;
  tokenId: string;
  token: string;
  name: string;
  createdAt: string | Date;
  expiresAt?: string | Date;
  usage: {
    remaining: number;
    total: number;
    resetDate?: string | Date;
  };
}

export interface UsageOverview {
  currentUsage: number;
  limit: number;
  tier: string;
  remainingCalls: number;
  resetDate?: Date;
  tokens: Array<{
    id: string;
    name?: string;
    createdAt: Date;
    lastUsedAt?: Date;
    totalRequests: number;
    isActive: boolean;
  }>;
}

export interface ApiUsageMetrics {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
    avgResponseTime: number;
  }>;
  errorRate: number;
  avgResponseTime: number;
}
