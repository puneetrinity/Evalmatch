/**
 * Performance-optimized versions of key API route handlers
 * Designed to handle large datasets efficiently
 */

import { Request, Response } from "express";
// import { processResumesBatch } from './batch-processor';
import {
  analysisCache,
  generateMatchAnalysisKey,
  generateBiasAnalysisKey,
} from "./cache";
import { analyzeMatch } from "../lib/ai-provider";
import { IStorage } from "../storage";
import {
  Resume,
  JobDescription,
  AnalyzedResumeData,
  AnalyzedJobData,
} from "@shared/schema";
import type {
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
} from "@shared/schema";

/**
 * Optimized handler for analyzing multiple resumes against a job description
 * Uses batching, concurrency control, and caching
 */
export async function handleBatchAnalyze(
  req: Request,
  res: Response,
  storage: IStorage,
) {
  try {
    const jobDescriptionId = parseInt(req.params.jobDescriptionId);
    const { sessionId } = req.body;

    if (isNaN(jobDescriptionId)) {
      return res.status(400).json({ message: "Invalid job description ID" });
    }

    console.log(
      `Processing analysis for job description ID: ${jobDescriptionId}, sessionId: ${sessionId || "not provided"}`,
    );

    // Get the job description
    const jobDescription = await storage.getJobDescription(jobDescriptionId);
    if (!jobDescription || !jobDescription.analyzedData) {
      return res.status(404).json({
        message: "Job description not found or analysis not completed yet",
      });
    }

    console.log(
      `Job description lookup result: Found job '${jobDescription.title}'`,
    );

    // Get resumes, filtered by sessionId if provided
    const resumes = await storage.getResumes(sessionId);
    console.log(
      `Filtered analysis results by session: ${resumes.length} results for session ${sessionId}`,
    );

    if (resumes.length === 0) {
      return res.status(404).json({
        message: sessionId
          ? `No resumes found for session ${sessionId}`
          : "No resumes found",
      });
    }

    // Filter for resumes that have been analyzed
    const analyzedResumes = resumes.filter((r) => r.analyzedData);

    // Process resumes in efficient batches with caching
    const batchResults = [];
    const concurrency = 5;

    for (let i = 0; i < analyzedResumes.length; i += concurrency) {
      const batch = analyzedResumes.slice(i, i + concurrency);
      const batchPromises = batch.map(async (resume: Resume) => {
        try {
          // First check if we already have an analysis result stored
          const existingAnalysis = await storage
            .getAnalysisResultsByResumeId(resume.id)
            .then((results) =>
              results.find((r) => r.jobDescriptionId === jobDescription.id),
            );

          if (existingAnalysis) {
            return {
              resumeId: resume.id,
              filename: resume.filename,
              candidateName:
                (resume.analyzedData as AnalyzedResumeData)?.name || "Unknown",
              match: existingAnalysis.analysis,
              analysisId: existingAnalysis.id,
            };
          }

          // Compare the resume with the job description
          // Convert AnalyzedResumeData to AnalyzeResumeResponse format
          const resumeAnalysis: AnalyzeResumeResponse = {
            id: resume.id as any,
            filename: resume.filename,
            analyzedData: resume.analyzedData as AnalyzedResumeData,
            processingTime: 0,
            confidence: 0.8,
            skills: (resume.analyzedData as AnalyzedResumeData)?.skills || [],
            experience: [
              (resume.analyzedData as AnalyzedResumeData)?.experience ||
                "0 years",
            ],
          };

          // Convert AnalyzedJobData to AnalyzeJobDescriptionResponse format
          const jobAnalysis: AnalyzeJobDescriptionResponse = {
            id: jobDescription.id as any,
            title: jobDescription.title,
            analyzedData: jobDescription.analyzedData as AnalyzedJobData,
            processingTime: 0,
            confidence: 0.8,
            requiredSkills:
              (jobDescription.analyzedData as AnalyzedJobData)
                ?.requiredSkills || [],
            preferredSkills:
              (jobDescription.analyzedData as AnalyzedJobData)
                ?.preferredSkills || [],
            experienceLevel:
              (jobDescription.analyzedData as AnalyzedJobData)
                ?.experienceLevel || "mid",
          };

          const matchResult = await analyzeMatch(
            resumeAnalysis,
            jobAnalysis,
            resume.content || undefined, // Pass the resume text for fairness analysis
          );

          const matchAnalysis = (matchResult as any).match || matchResult;

          // Create analysis result
          const analysisResult = await storage.createAnalysisResult({
            resumeId: resume.id,
            jobDescriptionId: jobDescription.id,
            matchPercentage: matchAnalysis.matchPercentage,
            matchedSkills: matchAnalysis.matchedSkills,
            missingSkills: matchAnalysis.missingSkills,
            analysis: matchAnalysis,
          });

          return {
            resumeId: resume.id,
            filename: resume.filename,
            candidateName:
              (resume.analyzedData as AnalyzedResumeData)?.name || "Unknown",
            match: matchAnalysis,
            analysisId: analysisResult.id,
          };
        } catch (error) {
          console.error(`Error analyzing resume ${resume.id}:`, error);
          return {
            resumeId: resume.id,
            filename: resume.filename,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const batchResult = await Promise.all(batchPromises);
      batchResults.push(...batchResult);
    }

    // Sort results by match percentage (descending)
    const analysisResults = batchResults.filter((r: any) => !r.error);
    analysisResults.sort(
      (a: any, b: any) =>
        (b.match?.matchPercentage || 0) - (a.match?.matchPercentage || 0),
    );

    res.json({
      jobDescriptionId,
      jobTitle: jobDescription.title,
      results: analysisResults,
    });
  } catch (error) {
    console.error("Error in batch analysis:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Optimized handler for analyzing a specific resume against a job description
 * Uses caching to avoid redundant processing
 */
export async function handleSpecificAnalyze(
  req: Request,
  res: Response,
  storage: IStorage,
) {
  try {
    const jobDescriptionId = parseInt(req.params.jobDescriptionId);
    const resumeId = parseInt(req.params.resumeId);

    console.log(
      `Processing specific analysis for job ID: ${jobDescriptionId}, resume ID: ${resumeId}`,
    );

    if (isNaN(jobDescriptionId) || isNaN(resumeId)) {
      return res
        .status(400)
        .json({ message: "Invalid job description or resume ID" });
    }

    // Check cache first
    const cacheKey = generateMatchAnalysisKey(resumeId, jobDescriptionId);
    const cachedResult = analysisCache.get(cacheKey);

    if (cachedResult) {
      console.log(
        `Using cached analysis for resume ${resumeId} and job ${jobDescriptionId}`,
      );
      return res.json(cachedResult);
    }

    // Get data from database
    const jobDescription = await storage.getJobDescription(jobDescriptionId);
    const resume = await storage.getResume(resumeId);

    console.log(
      `Job lookup result: ${jobDescription ? `Found job '${jobDescription.title}'` : "Not found"}`,
    );
    console.log(
      `Resume lookup result: ${resume ? `Found resume '${resume.filename}'` : "Not found"}`,
    );

    if (!jobDescription || !resume) {
      return res.status(404).json({
        message: !jobDescription
          ? "Job description not found"
          : "Resume not found",
      });
    }

    if (!jobDescription.analyzedData || !resume.analyzedData) {
      return res.status(400).json({
        message: !jobDescription.analyzedData
          ? "Job description has not been analyzed yet"
          : "Resume has not been analyzed yet",
      });
    }

    try {
      // First check if we already have this analysis result
      const existingAnalysis = await storage
        .getAnalysisResultsByResumeId(resumeId)
        .then((results) =>
          results.find((r) => r.jobDescriptionId === jobDescriptionId),
        );

      if (existingAnalysis) {
        // Store in cache
        analysisCache.set(cacheKey, existingAnalysis);
        return res.json(existingAnalysis);
      }

      // Compare the resume with the job description
      // Convert AnalyzedResumeData to AnalyzeResumeResponse format
      const resumeAnalysis: AnalyzeResumeResponse = {
        id: resume.id as any,
        filename: resume.filename,
        analyzedData: resume.analyzedData as AnalyzedResumeData,
        processingTime: 0,
        confidence: 0.8,
        skills: (resume.analyzedData as AnalyzedResumeData)?.skills || [],
        experience: [
          (resume.analyzedData as AnalyzedResumeData)?.experience || "0 years",
        ],
      };

      // Convert AnalyzedJobData to AnalyzeJobDescriptionResponse format
      const jobAnalysis: AnalyzeJobDescriptionResponse = {
        id: jobDescription.id as any,
        title: jobDescription.title,
        analyzedData: jobDescription.analyzedData as AnalyzedJobData,
        processingTime: 0,
        confidence: 0.8,
        requiredSkills:
          (jobDescription.analyzedData as AnalyzedJobData)?.requiredSkills ||
          [],
        preferredSkills:
          (jobDescription.analyzedData as AnalyzedJobData)?.preferredSkills ||
          [],
        experienceLevel:
          (jobDescription.analyzedData as AnalyzedJobData)?.experienceLevel ||
          "mid",
      };

      const matchResult = await analyzeMatch(
        resumeAnalysis,
        jobAnalysis,
        resume.content || undefined, // Pass the resume text for fairness analysis
      );

      const matchAnalysis = (matchResult as any).match || (matchResult as any);

      // Create and store the result
      const analysisResult = await storage.createAnalysisResult({
        resumeId,
        jobDescriptionId,
        matchPercentage: matchAnalysis.matchPercentage,
        matchedSkills: matchAnalysis.matchedSkills,
        missingSkills: matchAnalysis.missingSkills,
        analysis: matchAnalysis,
      });

      const result = {
        resumeId,
        jobId: jobDescriptionId,
        match: matchAnalysis,
        analysisId: analysisResult.id,
      };

      // Cache the result
      analysisCache.set(cacheKey, result);

      res.json(result);
    } catch (error) {
      console.error(
        `Error analyzing resume ${resumeId} against job ${jobDescriptionId}:`,
        error,
      );
      res.status(500).json({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  } catch (error) {
    console.error("Error in analysis:", error);
    res.status(500).json({
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
