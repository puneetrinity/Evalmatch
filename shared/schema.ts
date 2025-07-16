import { pgTable, serial, text, timestamp, json, integer, boolean, varchar, real } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

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
  userId: integer("user_id"),
  filename: text("filename").notNull(),
  content: text("content"),
  skills: json("skills").$type<string[]>(),
  experience: text("experience"),
  education: text("education"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Job descriptions table
export const jobDescriptions = pgTable("job_descriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requirements: json("requirements").$type<string[]>(),
  skills: json("skills").$type<string[]>(),
  experience: text("experience"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Analysis results table
export const analysisResults = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  resumeId: integer("resume_id"),
  jobDescriptionId: integer("job_description_id"),
  matchPercentage: real("match_percentage"),
  matchedSkills: json("matched_skills").$type<Array<{skill: string; matchPercentage: number}>>(),
  missingSkills: json("missing_skills").$type<string[]>(),
  candidateStrengths: json("candidate_strengths").$type<string[]>(),
  candidateWeaknesses: json("candidate_weaknesses").$type<string[]>(),
  fairnessMetrics: json("fairness_metrics").$type<{
    biasConfidenceScore: number;
    potentialBiasAreas: string[];
    fairnessAssessment: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Interview questions table
export const interviewQuestions = pgTable("interview_questions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  resumeId: integer("resume_id"),
  jobDescriptionId: integer("job_description_id"),
  questions: json("questions").$type<Array<{
    question: string;
    category: string;
    difficulty: string;
    expectedAnswer: string;
  }>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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

// Zod schemas
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);

export const insertResumeSchema = createInsertSchema(resumes);
export const selectResumeSchema = createSelectSchema(resumes);

export const insertJobDescriptionSchema = createInsertSchema(jobDescriptions);
export const selectJobDescriptionSchema = createSelectSchema(jobDescriptions);

export const insertAnalysisResultSchema = createInsertSchema(analysisResults);
export const selectAnalysisResultSchema = createSelectSchema(analysisResults);

export const insertInterviewQuestionsSchema = createInsertSchema(interviewQuestions);
export const selectInterviewQuestionsSchema = createSelectSchema(interviewQuestions);

// Resume file schema for uploads
export const resumeFileSchema = z.object({
  filename: z.string(),
  content: z.string(),
  skills: z.array(z.string()).optional(),
  experience: z.string().optional(),
  education: z.string().optional(),
});

// API Response types
export interface AnalyzeResumeResponse {
  skills: string[];
  experience: string;
  education: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export interface AnalyzeJobDescriptionResponse {
  title: string;
  requirements: string[];
  skills: string[];
  experience: string;
  summary: string;
  keyResponsibilities: string[];
}

export interface MatchAnalysisResponse {
  matchPercentage: number;
  matchedSkills: Array<{skill: string; matchPercentage: number}>;
  missingSkills: string[];
  candidateStrengths: string[];
  candidateWeaknesses: string[];
  recommendations: string[];
  fairnessMetrics: {
    biasConfidenceScore: number;
    potentialBiasAreas: string[];
    fairnessAssessment: string;
  };
}

export interface InterviewQuestionsResponse {
  questions: Array<{
    question: string;
    category: string;
    difficulty: string;
    expectedAnswer: string;
  }>;
}

export interface BiasAnalysisResponse {
  biasConfidenceScore: number;
  potentialBiasAreas: string[];
  fairnessAssessment: string;
  recommendations: string[];
}