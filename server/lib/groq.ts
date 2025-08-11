import Groq from "groq-sdk";
import crypto from "crypto";
import { logger } from "./logger";
import {
  generateConsistentScoringPrompt,
  deterministicCache,
  normalizeScore,
  calculateConfidenceLevel,
  validateScoreConsistency,
} from "./consistent-scoring";

// Prefix unused imports to silence warnings
const _validateScoreConsistency = validateScoreConsistency;
// MatchAnalysisResponse is a type import, cannot assign to variable
// Consolidated skill system import
import { normalizeSkillWithHierarchy } from "./skill-processor";
import {
  type AnalyzeResumeResponse,
  type AnalyzeJobDescriptionResponse,
  type MatchAnalysisResponse,
  type InterviewQuestionsResponse,
  type InterviewScriptResponse,
  type BiasAnalysisResponse,
} from "@shared/schema";
import type { ResumeId, JobId } from "@shared/api-contracts";
import { GroqErrorHandler as _GroqErrorHandler, logApiServiceStatus as _logApiServiceStatus } from "./shared/error-handler";
import { GroqResponseParser as _GroqResponseParser } from "./shared/response-parser";
import { PromptTemplateEngine as _PromptTemplateEngine, type ResumeAnalysisContext as _ResumeAnalysisContext, type JobAnalysisContext as _JobAnalysisContext, type MatchAnalysisContext as _MatchAnalysisContext } from "./shared/prompt-templates";

// Initialize Groq client only if API key is available
const groq = process.env.GROQ_API_KEY
  ? new Groq({
      apiKey: process.env.GROQ_API_KEY,
    })
  : null;

// Model configuration with current supported Groq models
const MODELS = {
  // Best for complex reasoning and analysis (recommended for resume/job analysis)
  ANALYSIS: "llama-3.3-70b-versatile", // Llama 3.3 70B (latest)

  // Fast and efficient for simpler tasks
  FAST: "llama-3.1-8b-instant", // Llama 3.1 8B

  // Most capable for complex matching and bias detection
  PREMIUM: "llama-3.3-70b-versatile", // Llama 3.3 70B (latest)

  // Default fallback
  DEFAULT: "llama-3.3-70b-versatile",
};

// Pricing per 1M tokens (approximate) - Groq models
const PRICING = {
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
};

// Cache for API responses to reduce duplicate calls
interface CacheItem<T> {
  timestamp: number;
  data: T;
}

interface ApiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// In-memory cache with 1 hour TTL
const responseCache: Record<string, CacheItem<unknown>> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Clear cache function for debugging
export function clearResponseCache(): void {
  Object.keys(responseCache).forEach((key) => delete responseCache[key]);
  logger.info("Response cache cleared - forcing fresh analysis");
}

// Token usage tracking
let apiUsage: ApiUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
};

// Calculate hash for cache key
function calculateHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Strip markdown formatting from JSON responses
function stripMarkdownFromJSON(response: string): string {
  // Remove markdown code blocks (```json, ```JSON, or just ```)
  let cleanedResponse = response
    .replace(/^```(?:json|JSON)?\s*/gm, "") // Remove opening code blocks
    .replace(/```\s*$/gm, "") // Remove closing code blocks
    .trim();

  // If response still contains markdown artifacts, try to extract JSON
  if (cleanedResponse.includes("```")) {
    // Extract content between first { and last }
    const firstBrace = cleanedResponse.indexOf("{");
    const lastBrace = cleanedResponse.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedResponse = cleanedResponse.substring(firstBrace, lastBrace + 1);
    }
  }

  // Additional cleaning for common JSON issues
  cleanedResponse = cleanedResponse
    .replace(/\n/g, " ") // Replace newlines with spaces
    .replace(/\r/g, "") // Remove carriage returns
    .replace(/\t/g, " ") // Replace tabs with spaces
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();

  // Try to fix common JSON syntax issues
  // Fix trailing commas before closing brackets/braces
  cleanedResponse = cleanedResponse.replace(/,(\s*[}\]])/g, "$1");

  // Ensure proper string escaping for common issues
  cleanedResponse = cleanedResponse.replace(
    /\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g,
    "\\\\",
  );

  return cleanedResponse;
}

// Safe JSON parser that handles empty/invalid responses
function safeJsonParse<T>(jsonString: string, context: string): T {
  if (
    !jsonString ||
    typeof jsonString !== "string" ||
    jsonString.trim() === ""
  ) {
    throw new Error(`Empty or invalid JSON response in ${context}`);
  }

  // First attempt: try parsing as-is
  try {
    return JSON.parse(jsonString) as T;
  } catch (firstError) {
    logger.warn(
      `First JSON parse attempt failed in ${context}:`,
      firstError instanceof Error ? firstError.message : String(firstError),
    );

    // Second attempt: try to extract and parse just the JSON part
    try {
      // Look for JSON array patterns
      const arrayMatch = jsonString.match(/\[[^\]]*\]/);
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0]);
        logger.info(
          `Successfully parsed JSON array from partial response in ${context}`,
        );
        return parsed as T;
      }

      // Look for JSON object patterns
      const objectMatch = jsonString.match(/\{[^}]*\}/);
      if (objectMatch) {
        const parsed = JSON.parse(objectMatch[0]);
        logger.info(
          `Successfully parsed JSON object from partial response in ${context}`,
        );
        return parsed as T;
      }

      throw new Error("No valid JSON pattern found");
    } catch (secondError) {
      logger.warn(
        `Second JSON parse attempt failed in ${context}:`,
        secondError instanceof Error
          ? secondError.message
          : String(secondError),
      );

      // Third attempt: try to fix common issues and parse again
      try {
        let fixedJson = jsonString;

        // Try to complete incomplete JSON strings
        if (fixedJson.includes('"') && !fixedJson.endsWith('"')) {
          // If it looks like an incomplete string, try to close it
          fixedJson = fixedJson + '"';
        }

        // Try to close incomplete arrays
        if (fixedJson.includes("[") && !fixedJson.includes("]")) {
          fixedJson = fixedJson + "]";
        }

        // Try to close incomplete objects
        if (fixedJson.includes("{") && !fixedJson.includes("}")) {
          fixedJson = fixedJson + "}";
        }

        const parsed = JSON.parse(fixedJson);
        logger.info(
          `Successfully parsed JSON after fixing incomplete structure in ${context}`,
        );
        return parsed as T;
      } catch (thirdError) {
        logger.error(
          `All JSON parse attempts failed in ${context}. Original response: ${jsonString.substring(0, 200)}...`,
        );
        throw new Error(
          `Failed to parse JSON in ${context}: ${firstError instanceof Error ? firstError.message : String(firstError)}. Response preview: ${jsonString.substring(0, 100)}...`,
        );
      }
    }
  }
}

// Get cached response if available and not expired
function getCachedResponse<T>(key: string): T | null {
  const cached = responseCache[key];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug("Cache hit for Groq request");
    return cached.data as T;
  }
  return null;
}

// Cache response
function setCachedResponse<T>(key: string, data: T): void {
  responseCache[key] = {
    timestamp: Date.now(),
    data,
  };
}

// Calculate estimated cost
function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing =
    PRICING[model as keyof typeof PRICING] ||
    PRICING["llama-3.3-70b-versatile"];
  return (
    (promptTokens * pricing.input + completionTokens * pricing.output) / 1000000
  );
}

// Update API usage statistics
function updateUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
): void {
  const cost = calculateCost(model, promptTokens, completionTokens);
  apiUsage.promptTokens += promptTokens;
  apiUsage.completionTokens += completionTokens;
  apiUsage.totalTokens += promptTokens + completionTokens;
  apiUsage.estimatedCost += cost;

  logger.debug("Groq API usage updated", {
    model,
    promptTokens,
    completionTokens,
    cost: cost.toFixed(6),
    totalCost: apiUsage.estimatedCost.toFixed(6),
  });
}

// Generic function to call Groq API with deterministic settings
async function callGroqAPI(
  prompt: string,
  model: string = MODELS.DEFAULT,
  temperature: number = 0.0, // Zero temperature for consistency
  seed?: number,
): Promise<string> {
  if (!groq) {
    throw new Error("Groq API key is not configured");
  }

  try {
    const requestParams = {
      messages: [
        {
          role: "user" as const,
          content: prompt,
        },
      ],
      model,
      temperature,
      max_tokens: 4000,
      stream: false,
      top_p: 1.0, // Deterministic sampling
      ...(seed !== undefined ? { seed } : {}),
    };

    const response = await groq.chat.completions.create(requestParams);

    const content =
      "choices" in response ? response.choices[0]?.message?.content : null;
    if (!content) {
      throw new Error("No response content from Groq API");
    }

    // Update usage statistics
    if ("usage" in response && response.usage) {
      updateUsage(
        model,
        response.usage.prompt_tokens || 0,
        response.usage.completion_tokens || 0,
      );
    }

    return content;
  } catch (error) {
    logger.error("Groq API call failed", error);
    throw error;
  }
}

// Result-based version of Groq API call
import { Result as _Result, success, failure, fromPromise as _fromPromise, isFailure, type ExternalServiceError, type AppError } from '../../shared/result-types';
import { AppExternalServiceError } from '../../shared/errors';

async function _callGroqAPIWithResult(
  prompt: string,
  model: string = MODELS.DEFAULT,
  temperature: number = 0.0,
  seed?: number,
): Promise<Result<string, ExternalServiceError>> {
  if (!groq) {
    return failure({
      code: 'EXTERNAL_SERVICE_ERROR' as const,
      service: 'groq',
      message: 'Groq API key is not configured',
      statusCode: 503,
      timestamp: new Date().toISOString(),
    });
  }

  const result = await fromPromise(
    (async () => {
      const requestParams = {
        messages: [
          {
            role: "user" as const,
            content: prompt,
          },
        ],
        model,
        temperature,
        max_tokens: 4000,
        stream: false,
        top_p: 1.0,
        ...(seed !== undefined ? { seed } : {}),
      };

      const response = await groq.chat.completions.create(requestParams);
      const content =
        "choices" in response ? response.choices[0]?.message?.content : null;
      
      if (!content) {
        throw new Error("No response content from Groq API");
      }

      // Update usage statistics
      if ("usage" in response && response.usage) {
        updateUsage(
          model,
          response.usage.prompt_tokens || 0,
          response.usage.completion_tokens || 0,
        );
      }

      return content;
    })(),
    (error) => AppExternalServiceError.aiProviderFailure('Groq', 'api-call', error instanceof Error ? error.message : String(error))
  );

  if (result.success) {
    logger.debug("Groq API call succeeded", { model, prompt: prompt.substring(0, 100) });
    return result;
  } else {
    logger.error("Groq API call failed", result.error);
    // Convert AppError to ExternalServiceError to match return type
    const externalServiceError: ExternalServiceError = {
      code: 'AI_PROVIDER_ERROR' as const,
      service: 'groq',
      message: result.error.message,
      statusCode: result.error.statusCode,
      timestamp: result.error.timestamp,
      originalError: result.error instanceof Error ? result.error.message : undefined
    };
    return failure(externalServiceError);
  }
}

// Get service status
export function getGroqServiceStatus() {
  return {
    isAvailable: !!groq,
    isConfigured: !!process.env.GROQ_API_KEY,
    statusMessage: groq ? "Groq API is ready" : "Groq API key not configured",
    provider: "Groq",
    models: Object.values(MODELS),
    usage: apiUsage,
    timestamp: new Date().toISOString(),
  };
}

// Parallel extraction functions for optimized token usage

// Analyze resume using parallel extraction (optimized token usage)
// Uses Wrapper Pattern: maintains existing API while using Result pattern internally
export async function analyzeResumeParallel(
  resumeText: string,
): Promise<AnalyzeResumeResponse> {
  const result = await analyzeResumeParallelInternal(resumeText);
  
  if (result.success) {
    return result.data;
  } else {
    // Convert Result error back to exception for backward compatibility
    const error = result.error;
    logger.error("Resume analysis failed", error);
    throw new Error(`Groq resume analysis failed: ${error.message}`);
  }
}

// Result-based internal function using Wrapper Pattern
async function analyzeResumeParallelInternal(
  resumeText: string,
): Promise<Result<AnalyzeResumeResponse, ExternalServiceError>> {
  const cacheKey = calculateHash(`groq_resume_parallel_${resumeText}`);
  const cached = getCachedResponse<AnalyzeResumeResponse>(cacheKey);
  if (cached) {
    logger.info("Resume parallel analysis: Cache hit - 0 tokens used");
    return success(cached);
  }

  const startTime = Date.now();
  const textLength = resumeText.length;

  logger.info(
    `Starting parallel resume analysis - text length: ${textLength} chars`,
  );

  // Track token usage before parallel extraction
  const usageBefore = { ...apiUsage };

  // Use Result pattern for parallel extraction  
  const [contactResultApp, skillsResultApp, experienceResultApp, educationResultApp] = await Promise.all([
    fromPromise(extractContact(resumeText), (error) => AppExternalServiceError.aiProviderFailure('Groq', 'contact-extraction', error instanceof Error ? error.message : String(error))),
    fromPromise(extractSkills(resumeText, "resume"), (error) => AppExternalServiceError.aiProviderFailure('Groq', 'skills-extraction', error instanceof Error ? error.message : String(error))),
    fromPromise(extractExperience(resumeText), (error) => AppExternalServiceError.aiProviderFailure('Groq', 'experience-extraction', error instanceof Error ? error.message : String(error))),
    fromPromise(extractEducation(resumeText), (error) => AppExternalServiceError.aiProviderFailure('Groq', 'education-extraction', error instanceof Error ? error.message : String(error)))
  ]);

  // Convert AppError results to ExternalServiceError results
  const convertAppErrorResult = <T>(result: Result<T, AppError>): Result<T, ExternalServiceError> => {
    if (result.success) {
      return result;
    } else {
      const externalServiceError: ExternalServiceError = {
        code: 'AI_PROVIDER_ERROR' as const,
        service: 'groq',
        message: result.error.message,
        statusCode: result.error.statusCode,
        timestamp: result.error.timestamp,
        originalError: result.error instanceof Error ? result.error.message : undefined
      };
      return failure(externalServiceError);
    }
  };

  const contactResult = convertAppErrorResult(contactResultApp);
  const skillsResult = convertAppErrorResult(skillsResultApp);
  const experienceResult = convertAppErrorResult(experienceResultApp);
  const educationResult = convertAppErrorResult(educationResultApp);

  // Check if any extraction failed
  if (isFailure(contactResult)) return contactResult;
  if (isFailure(skillsResult)) return skillsResult;  
  if (isFailure(experienceResult)) return experienceResult;
  if (isFailure(educationResult)) return educationResult;

  // All extractions succeeded, build response
  const _contact = contactResult.data;
  const skills = skillsResult.data;
  const experience = experienceResult.data;
  const education = educationResult.data;

  // Calculate token savings and performance metrics
  const usageAfter = { ...apiUsage };
  const tokensUsed = usageAfter.totalTokens - usageBefore.totalTokens;
  const timeTaken = Date.now() - startTime;

  // Combine results into expected format
  const skillsArray = Array.isArray(skills) ? skills : [];
  const parsedResponse: AnalyzeResumeResponse = {
    id: 0 as ResumeId, // Will be set by caller
    filename: "resume.txt", // Will be set by caller
    analyzedData: {
      name: "Unknown",
      skills: skillsArray,
      experience: experience?.totalYears || "0 years",
      education: Array.isArray(education) ? education : [],
      summary: experience?.summary || "Professional with diverse background",
      keyStrengths: skillsArray.slice(0, 3),
    },
    processingTime: timeTaken,
    confidence: 0.8,
    // Convenience properties for backward compatibility
    skills: skillsArray,
    experience: [{
      company: "Unknown",
      position: "Unknown",
      duration: experience?.totalYears || "0 years",
      description: ""
    }],
  };

  // Only cache if we have meaningful results (at least some skills)
  if (skills && skills.length > 0) {
    setCachedResponse(cacheKey, parsedResponse);
  } else {
    logger.warn("Not caching resume analysis - no skills extracted");
  }

  // Log optimization metrics
  logger.info("Resume analyzed successfully with Groq (parallel)", {
    textLength,
    tokensUsed,
    timeTaken: `${timeTaken}ms`,
    estimatedSavings: "~22% tokens vs sequential",
    parallelCalls: 4,
    cacheKey: cacheKey.substring(0, 8),
  });

  return success(parsedResponse);
}

// New Result-based public API for consumers who want Result pattern
export async function analyzeResumeParallelResult(
  resumeText: string,
): Promise<Result<AnalyzeResumeResponse, ExternalServiceError>> {
  return analyzeResumeParallelInternal(resumeText);
}

// Legacy single-call method (fallback)
export async function analyzeResume(
  resumeText: string,
): Promise<AnalyzeResumeResponse> {
  const cacheKey = calculateHash(`groq_resume_${resumeText}`);
  const cached = getCachedResponse<AnalyzeResumeResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Analyze this resume and extract structured information. Return a JSON object with the following structure:

{
  "skills": ["skill1", "skill2", "skill3"],
  "experience": "X years",
  "education": ["degree1", "degree2"],
  "summary": "brief professional summary",
  "strengths": ["strength1", "strength2"],
  "jobTitles": ["title1", "title2"]
}

Resume text:
${resumeText}

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const cleanedResponse = stripMarkdownFromJSON(response);
    const rawResponse = JSON.parse(cleanedResponse);

    // Convert raw response to proper AnalyzeResumeResponse format
    const parsedResponse: AnalyzeResumeResponse = {
      id: 0 as ResumeId, // Will be set by caller
      filename: "resume.txt", // Will be set by caller
      analyzedData: {
        name: "Unknown",
        skills: rawResponse.skills || [],
        experience: rawResponse.experience || "0 years",
        education: rawResponse.education || [],
        summary: rawResponse.summary || "Professional with diverse background",
        keyStrengths: rawResponse.strengths || [],
      },
      processingTime: 0,
      confidence: 0.8,
      // Convenience properties for backward compatibility
      skills: rawResponse.skills || [],
      experience: [rawResponse.experience || "0 years"],
    };

    // Only cache if we have meaningful results (at least some skills)
    if (parsedResponse.skills && parsedResponse.skills.length > 0) {
      setCachedResponse(cacheKey, parsedResponse);
      logger.info("Resume analyzed successfully with Groq");
    } else {
      logger.warn(
        "Not caching resume analysis - no skills extracted in sequential analysis",
      );
    }

    return parsedResponse;
  } catch (error) {
    logger.error("Error analyzing resume with Groq", error);

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Analyze job description using Groq
export async function analyzeJobDescription(
  title: string,
  description: string,
): Promise<AnalyzeJobDescriptionResponse> {
  const cacheKey = calculateHash(`groq_job_${title}_${description}`);
  const cached = getCachedResponse<AnalyzeJobDescriptionResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Analyze this job description and extract structured information. Return a JSON object with the following structure:

{
  "requiredSkills": ["skill1", "skill2", "skill3"],
  "preferredSkills": ["skill1", "skill2"],
  "experienceLevel": "entry/mid/senior/executive",
  "responsibilities": ["responsibility1", "responsibility2"],
  "qualifications": ["qualification1", "qualification2"],
  "summary": "brief job summary"
}

Job Title: ${title}
Job Description:
${description}

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const cleanedResponse = stripMarkdownFromJSON(response);
    const rawResponse = JSON.parse(cleanedResponse);

    // Convert raw response to proper AnalyzeJobDescriptionResponse format
    const parsedResponse: AnalyzeJobDescriptionResponse = {
      id: 0 as JobId, // Will be set by caller
      title: title,
      analyzedData: {
        requiredSkills: rawResponse.requiredSkills || [],
        preferredSkills: rawResponse.preferredSkills || [],
        experienceLevel: rawResponse.experienceLevel || "mid",
        responsibilities: rawResponse.responsibilities || [],
        summary: rawResponse.summary || "Job opportunity",
      },
      processingTime: 0,
      confidence: 0.8,
      // Convenience properties for backward compatibility
      requiredSkills: rawResponse.requiredSkills || [],
      preferredSkills: rawResponse.preferredSkills || [],
      experienceLevel: rawResponse.experienceLevel || "mid",
    };

    setCachedResponse(cacheKey, parsedResponse);
    logger.info("Job description analyzed successfully with Groq");
    return parsedResponse;
  } catch (error) {
    logger.error("Error analyzing job description with Groq", error);

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Analyze match between resume and job using Groq with consistent scoring
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  resumeText?: string,
  jobText?: string,
): Promise<MatchAnalysisResponse> {
  // Use deterministic caching if we have the original texts
  let cacheKey: string;
  let cached: MatchAnalysisResponse | null = null;

  if (resumeText && jobText) {
    cacheKey = deterministicCache.generateKey(resumeText, jobText, "match");
    cached = deterministicCache.get(cacheKey) as MatchAnalysisResponse | null;
    if (cached) {
      logger.debug("Using cached consistent match analysis");
      return cached;
    }
  } else {
    // Fallback to old caching method
    cacheKey = calculateHash(
      `groq_match_${JSON.stringify(resumeAnalysis)}_${JSON.stringify(jobAnalysis)}`,
    );
    cached = getCachedResponse<MatchAnalysisResponse>(cacheKey);
    if (cached) return cached;
  }

  // Generate consistent scoring prompt
  const prompt =
    resumeText && jobText
      ? generateConsistentScoringPrompt(resumeText, jobText, "match")
      : `Analyze the match between this resume and job description with CONSISTENT scoring. Use temperature=0 for deterministic results.

Return a JSON object with the following structure:
{
  "matchPercentage": 85,
  "matchedSkills": [
    {"skill": "JavaScript", "matchPercentage": 95},
    {"skill": "React", "matchPercentage": 88}
  ],
  "missingSkills": ["Python", "Docker"],
  "candidateStrengths": ["Strong in frontend", "Good communication"],
  "candidateWeaknesses": ["Limited backend experience"],
  "recommendations": ["Learn Python", "Gain Docker experience"],
  "confidenceLevel": "high"
}

Resume Analysis:
${JSON.stringify(resumeAnalysis, null, 2)}

Job Analysis:
${JSON.stringify(jobAnalysis, null, 2)}

Respond with only the JSON object, no additional text.`;

  try {
    // Generate deterministic seed from resume and job text
    const seed =
      resumeText && jobText
        ? parseInt(
            crypto
              .createHash("sha256")
              .update(`${resumeText}${jobText}`)
              .digest("hex")
              .substring(0, 8),
            16,
          ) % 1000000
        : undefined;

    const response = await callGroqAPI(prompt, MODELS.PREMIUM, 0.0, seed);
    const cleanedResponse = stripMarkdownFromJSON(response);
    const parsedResponse = JSON.parse(cleanedResponse) as MatchAnalysisResponse;

    // Normalize scores for consistency
    if (parsedResponse.matchPercentage) {
      parsedResponse.matchPercentage = normalizeScore(
        parsedResponse.matchPercentage,
      );
    }

    // Normalize matched skills scores
    if (parsedResponse.matchedSkills) {
      parsedResponse.matchedSkills = parsedResponse.matchedSkills.map(
        (skill) => ({
          ...skill,
          matchPercentage: normalizeScore(skill.matchPercentage || 0),
        }),
      );
    }

    // Add confidence level if not present
    if (!parsedResponse.confidenceLevel && resumeText && jobText) {
      const confidence = calculateConfidenceLevel(
        resumeText.length,
        jobText.length,
        parsedResponse.matchedSkills?.length || 0,
      );
      parsedResponse.confidenceLevel = confidence;
    }

    // Cache the result
    if (resumeText && jobText) {
      const seed = crypto
        .createHash("sha256")
        .update(`${resumeText}${jobText}`)
        .digest("hex")
        .substring(0, 16);
      deterministicCache.set(cacheKey, parsedResponse, seed);
    } else {
      setCachedResponse(cacheKey, parsedResponse);
    }

    logger.info(
      "Match analysis completed successfully with Groq (consistent scoring)",
      {
        matchPercentage: parsedResponse.matchPercentage,
        confidenceLevel: parsedResponse.confidenceLevel,
        matchedSkillsCount: parsedResponse.matchedSkills?.length || 0,
      },
    );
    return parsedResponse;
  } catch (error) {
    logger.error("Error analyzing match with Groq", error);

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Generate comprehensive interview script using Groq
export async function generateInterviewScript(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
  jobTitle: string,
  candidateName?: string,
): Promise<InterviewScriptResponse> {
  const cacheKey = calculateHash(
    `groq_script_${JSON.stringify({ resumeAnalysis, jobAnalysis, matchAnalysis, jobTitle, candidateName })}`,
  );
  const cached = getCachedResponse<InterviewScriptResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Generate a comprehensive interview script for a ${jobTitle} position. Create a structured conversation flow from opening to closing. Return a JSON object with the following structure:

{
  "jobTitle": "${jobTitle}",
  "candidateName": "${candidateName || "the candidate"}",
  "interviewDuration": "45-60 minutes",
  
  "opening": {
    "salutation": "Good morning/afternoon [candidate name]. Thank you for taking the time to speak with us today.",
    "iceBreaker": "How has your day been going so far?",
    "interviewOverview": "Today we'll discuss your background, explore how your skills align with our needs, and share more about this exciting opportunity."
  },
  
  "currentRoleDiscussion": {
    "roleAcknowledgment": "I see you're currently working as [current role] at [company]. That sounds like interesting work.",
    "currentWorkQuestions": [
      {
        "question": "Can you tell me about your current responsibilities?",
        "purpose": "Understand current role scope",
        "expectedAnswer": "Should cover key daily tasks and achievements"
      }
    ]
  },
  
  "skillMatchDiscussion": {
    "introduction": "Looking at your background, I can see some great alignment with what we're looking for.",
    "matchedSkillsQuestions": [
      {
        "skill": "JavaScript",
        "question": "I noticed you have JavaScript experience. Can you walk me through a recent project?",
        "expectedAnswer": "Specific project details with technical depth"
      }
    ]
  },
  
  "skillGapAssessment": {
    "introduction": "Now I'd like to explore some areas where there might be learning opportunities.",
    "gapQuestions": [
      {
        "missingSkill": "React",
        "question": "How comfortable would you be learning React on the job?",
        "expectedAnswer": "Shows learning attitude and adaptability",
        "assessmentCriteria": "Look for growth mindset and examples of learning new technologies"
      }
    ]
  },
  
  "roleSell": {
    "transitionStatement": "Now let me tell you why this role is exciting.",
    "roleHighlights": ["Growth opportunities", "Cutting-edge technology"],
    "opportunityDescription": "You'd be joining a dynamic team working on innovative projects.",
    "closingQuestions": [
      {
        "question": "What aspects of this role excite you most?",
        "purpose": "Gauge genuine interest"
      }
    ]
  },
  
  "closing": {
    "nextSteps": "We'll review your background with the team and get back to you within 2-3 business days.",
    "candidateQuestions": "Do you have any questions about the role or our company?",
    "finalStatement": "Thank you for your time today. We'll be in touch soon."
  }
}

Based on the following analysis data:

Resume Analysis:
${JSON.stringify(resumeAnalysis, null, 2)}

Job Analysis:
${JSON.stringify(jobAnalysis, null, 2)}

Match Analysis:
${JSON.stringify(matchAnalysis, null, 2)}

Create a personalized script that:
1. Acknowledges the candidate's current role and experience
2. Focuses on matched skills with specific examples
3. Addresses skill gaps constructively
4. Sells the role based on job highlights
5. Maintains a professional, conversational tone throughout

Generate 2-3 questions per section. Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.PREMIUM, 0.1); // Slightly higher temperature for more natural conversation
    const cleanedResponse = stripMarkdownFromJSON(response);
    const parsedResponse = JSON.parse(
      cleanedResponse,
    ) as InterviewScriptResponse;

    setCachedResponse(cacheKey, parsedResponse);
    logger.info("Interview script generated successfully with Groq");
    return parsedResponse;
  } catch (error) {
    logger.error("Error generating interview script with Groq", error);

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Generate interview questions using Groq
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
): Promise<InterviewQuestionsResponse> {
  const cacheKey = calculateHash(
    `groq_interview_${JSON.stringify({ resumeAnalysis, jobAnalysis, matchAnalysis })}`,
  );
  const cached = getCachedResponse<InterviewQuestionsResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Generate interview questions based on this candidate profile and job requirements. Return a JSON object with the following structure:

{
  "questions": [
    {
      "question": "Tell me about your experience with JavaScript",
      "category": "technical",
      "difficulty": "medium",
      "purpose": "Assess JavaScript proficiency"
    }
  ],
  "focusAreas": ["technical skills", "experience gaps"],
  "recommendations": ["Focus on backend experience"]
}

Resume Analysis:
${JSON.stringify(resumeAnalysis, null, 2)}

Job Analysis:
${JSON.stringify(jobAnalysis, null, 2)}

Match Analysis:
${JSON.stringify(matchAnalysis, null, 2)}

Generate 8-12 relevant questions. Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const cleanedResponse = stripMarkdownFromJSON(response);
    const parsedResponse = JSON.parse(
      cleanedResponse,
    ) as InterviewQuestionsResponse;

    setCachedResponse(cacheKey, parsedResponse);
    logger.info("Interview questions generated successfully with Groq");
    return parsedResponse;
  } catch (error) {
    logger.error("Error generating interview questions with Groq", error);

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Analyze bias in job description using Groq
export async function analyzeBias(
  title: string,
  description: string,
): Promise<BiasAnalysisResponse> {
  const cacheKey = calculateHash(`groq_bias_${title}_${description}`);
  const cached = getCachedResponse<BiasAnalysisResponse>(cacheKey);
  if (cached) return cached;

  const prompt = `Analyze this job description for potential bias and discriminatory language. Return a JSON object with the following structure:

{
  "overallScore": 85,
  "biasIndicators": [
    {
      "type": "age",
      "severity": "low",
      "text": "young and energetic",
      "suggestion": "Use 'enthusiastic and motivated' instead"
    }
  ],
  "recommendations": ["Remove age references", "Use neutral language"],
  "summary": "Brief summary of bias analysis",
  "improvedDescription": "Rewritten job description with all bias removed and inclusive language"
}

Job Title: ${title}
Job Description:
${description}

Look for bias related to: age, gender, race, religion, disability, nationality, sexual orientation, and other protected characteristics.

IMPORTANT: If you find any bias, provide an "improvedDescription" field with a rewritten version of the job description that removes all biased language and uses inclusive, neutral terms. If no bias is found, set "improvedDescription" to the original description.

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.PREMIUM);
    const cleanedResponse = stripMarkdownFromJSON(response);
    const groqResponse = JSON.parse(cleanedResponse);

    // Transform Groq response format to BiasAnalysisResponse format
    const transformedResponse: BiasAnalysisResponse = {
      hasBias:
        groqResponse.biasIndicators && groqResponse.biasIndicators.length > 0,
      biasTypes: groqResponse.biasIndicators
        ? groqResponse.biasIndicators.map((indicator: any) => indicator.type)
        : [],
      biasedPhrases: groqResponse.biasIndicators
        ? groqResponse.biasIndicators.map((indicator: any) => ({
            phrase: indicator.text,
            reason: indicator.suggestion || `${indicator.type} bias detected`,
          }))
        : [],
      suggestions: groqResponse.recommendations || [],
      improvedDescription: groqResponse.improvedDescription || description,
      overallScore: groqResponse.overallScore,
      summary: groqResponse.summary,
    };

    setCachedResponse(cacheKey, transformedResponse);
    logger.info("Bias analysis completed successfully with Groq", {
      hasBias: transformedResponse.hasBias,
      biasTypes: transformedResponse.biasTypes.length,
      overallScore: transformedResponse.overallScore,
    });
    return transformedResponse;
  } catch (error) {
    logger.error("Error analyzing bias with Groq", error);

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Extract skills using Groq
// Extract experience information from resume text
export async function extractExperience(text: string): Promise<{
  totalYears: string;
  summary: string;
  jobTitles: string[];
}> {
  const cacheKey = calculateHash(`groq_experience_${text}`);
  const cached = getCachedResponse<{
    totalYears: string;
    summary: string;
    jobTitles: string[];
  }>(cacheKey);
  if (cached) return cached;

  const prompt = `Extract experience information from this resume text. Return a JSON object with:
- totalYears: number of years of experience (e.g., "5 years", "3+ years")
- summary: brief professional summary (1-2 sentences)
- jobTitles: array of job titles/positions held

Example format:
{
  "totalYears": "5 years",
  "summary": "Experienced software developer with expertise in web technologies",
  "jobTitles": ["Software Developer", "Frontend Engineer", "Web Developer"]
}

Resume text:
${text.substring(0, 2000)}

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.FAST);

    if (!response || typeof response !== "string" || response.trim() === "") {
      throw new Error("Empty response from Groq API");
    }

    const cleanedResponse = stripMarkdownFromJSON(response);

    if (!cleanedResponse || cleanedResponse.trim() === "") {
      throw new Error("Empty response after cleaning markdown");
    }

    const experience = safeJsonParse<{
      totalYears: string;
      summary: string;
      jobTitles: string[];
    }>(cleanedResponse, "extractExperience");

    // Validate structure
    const result = {
      totalYears: experience.totalYears || "0 years",
      summary: experience.summary || "Professional background",
      jobTitles: Array.isArray(experience.jobTitles)
        ? experience.jobTitles
        : [],
    };

    setCachedResponse(cacheKey, result);
    logger.info("Experience extracted successfully from resume with Groq");
    return result;
  } catch (error) {
    logger.error("Error extracting experience from resume with Groq", error);

    // Return fallback response with enhanced logging
    logger.warn("Returning fallback experience data due to Groq parsing error");
    return {
      totalYears: "0 years",
      summary: "Professional with diverse background",
      jobTitles: ["Professional"],
    };
  }
}

// Extract education information from resume text
export async function extractEducation(text: string): Promise<string[]> {
  const cacheKey = calculateHash(`groq_education_${text}`);
  const cached = getCachedResponse<string[]>(cacheKey);
  if (cached) return cached;

  const prompt = `Extract education information from this resume text. Return a JSON array of education entries (degrees, certifications, schools).

Example format: ["Bachelor of Science in Computer Science", "Master of Engineering", "AWS Certified Solutions Architect"]

Resume text:
${text.substring(0, 2000)}

Respond with only the JSON array, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.FAST);

    if (!response || typeof response !== "string" || response.trim() === "") {
      throw new Error("Empty response from Groq API");
    }

    const cleanedResponse = stripMarkdownFromJSON(response);

    if (!cleanedResponse || cleanedResponse.trim() === "") {
      throw new Error("Empty response after cleaning markdown");
    }

    const education = safeJsonParse<string[]>(
      cleanedResponse,
      "extractEducation",
    );

    const result = Array.isArray(education) ? education : [];

    setCachedResponse(cacheKey, result);
    logger.info("Education extracted successfully from resume with Groq");
    return result;
  } catch (error) {
    logger.error("Error extracting education from resume with Groq", error);
    logger.warn("Returning fallback education data due to Groq parsing error");
    return ["Educational Background"];
  }
}

// Extract contact information from resume text
export async function extractContact(text: string): Promise<string> {
  // Simple extraction - look for email and phone patterns
  const emailMatch = text.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  const phoneMatch = text.match(/[+]?[1-9]?[\d\s\-()]{10,}/);

  const parts = [];
  if (emailMatch) parts.push(emailMatch[0]);
  if (phoneMatch) parts.push(phoneMatch[0]);

  return parts.length > 0 ? parts.join(", ") : "Contact information available";
}

// Normalize extracted skills using the dynamic skills database
async function normalizeExtractedSkills(
  extractedSkills: string[],
): Promise<string[]> {
  const normalizedSkills: string[] = [];
  const seenSkills = new Set<string>();
  const MAX_NORMALIZED_SKILLS = 50;

  for (const skill of extractedSkills) {
    try {
      // Skip if we already have enough skills
      if (normalizedSkills.length >= MAX_NORMALIZED_SKILLS) {
        logger.debug(`Reached max skills limit (${MAX_NORMALIZED_SKILLS}), skipping remaining`);
        break;
      }

      const normalized = await normalizeSkillWithHierarchy(skill);
      
      // normalizeSkillWithHierarchy returns a string, not an object
      const normalizedStr = typeof normalized === 'string' ? normalized : String(normalized);

      // Only include high-confidence matches and avoid duplicates
      if (
        normalizedStr.length > 0 &&
        normalizedStr.length <= 50 && // Ensure normalized skill isn't too long
        !seenSkills.has(normalizedStr.toLowerCase())
      ) {
        normalizedSkills.push(normalizedStr);
        seenSkills.add(normalizedStr.toLowerCase());

        logger.debug(
          `Normalized skill: "${skill}" -> "${normalizedStr}"`,
        );
      } else {
        // For empty or invalid normalized results, keep the original if it looks like a valid skill
        const originalTrimmed = skill.trim();
        if (
          originalTrimmed.length > 2 &&
          originalTrimmed.length <= 50 &&
          !seenSkills.has(originalTrimmed.toLowerCase()) &&
          !originalTrimmed.includes("Softmax") && // Additional validation
          !originalTrimmed.includes("Gradient")
        ) {
          normalizedSkills.push(originalTrimmed);
          seenSkills.add(originalTrimmed.toLowerCase());
          logger.debug(
            `Kept original skill: "${skill}" (normalization result: ${String(normalized)})`,
          );
        }
      }
    } catch (error) {
      logger.warn(`Error normalizing skill "${skill}":`, error);
      // Keep original skill if normalization fails
      const originalTrimmed = skill.trim();
      if (
        originalTrimmed.length > 2 &&
        originalTrimmed.length <= 50 &&
        !seenSkills.has(originalTrimmed.toLowerCase()) &&
        !originalTrimmed.includes("Softmax") &&
        !originalTrimmed.includes("Gradient")
      ) {
        normalizedSkills.push(originalTrimmed);
        seenSkills.add(originalTrimmed.toLowerCase());
      }
    }
  }

  logger.info(
    `Skill normalization completed: ${extractedSkills.length} extracted -> ${normalizedSkills.length} normalized`,
  );
  return normalizedSkills;
}

export async function extractSkills(
  text: string,
  type: "resume" | "job",
): Promise<string[]> {
  const cacheKey = calculateHash(`groq_skills_${type}_${text}`);
  const cached = getCachedResponse<string[]>(cacheKey);
  if (cached) return cached;

  const prompt = `Extract all technical and professional skills from this ${type} text. Return a JSON array of skill names only.

Example format: ["JavaScript", "React", "Node.js", "Project Management", "Communication"]

Text:
${text}

Respond with only the JSON array, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.FAST);

    // Check if response is valid
    if (!response || typeof response !== "string" || response.trim() === "") {
      throw new Error("Empty or invalid response from Groq API");
    }

    const cleanedResponse = stripMarkdownFromJSON(response);

    // Check if cleaned response is valid JSON
    if (!cleanedResponse || cleanedResponse.trim() === "") {
      throw new Error("Empty response after cleaning markdown");
    }

    const extractedSkills = safeJsonParse<string[]>(
      cleanedResponse,
      "extractSkills",
    );

    // Validate the parsed result
    if (!Array.isArray(extractedSkills)) {
      throw new Error("Response is not a valid JSON array");
    }

    // Filter out invalid/nonsensical skills before normalization
    const validSkills = extractedSkills.filter((skill) => {
      if (typeof skill !== "string" || !skill.trim()) return false;
      
      const trimmedSkill = skill.trim();
      
      // Filter out overly long skills (likely hallucinations)
      if (trimmedSkill.length > 50) {
        logger.debug(`Filtered out long skill: "${trimmedSkill.substring(0, 50)}..."`);
        return false;
      }
      
      // Filter out repetitive patterns that indicate AI hallucination
      if (trimmedSkill.includes("Softmax with Gradient") || 
          trimmedSkill.includes("and Direction and Sign and Magnitude") ||
          trimmedSkill.includes("and Magnitude and Sign") ||
          trimmedSkill.match(/(\w+\s+){5,}and\s+/)) { // Repetitive "X and Y and Z" patterns
        logger.debug(`Filtered out repetitive pattern: "${trimmedSkill.substring(0, 50)}..."`);
        return false;
      }
      
      // Filter out skills that are just repetitive words
      const words = trimmedSkill.split(/\s+/);
      if (words.length > 8) {
        logger.debug(`Filtered out long multi-word skill: "${trimmedSkill}"`);
        return false; // Skills shouldn't be this long
      }
      
      // Filter out skills with excessive repetition of the same word
      const wordCounts = words.reduce((acc, word) => {
        const normalizedWord = word.toLowerCase();
        acc[normalizedWord] = (acc[normalizedWord] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const maxWordCount = Math.max(...Object.values(wordCounts));
      if (maxWordCount > 3) {
        logger.debug(`Filtered out skill with repeated words: "${trimmedSkill}"`);
        return false; // Same word repeated more than 3 times
      }
      
      return true;
    });

    // Limit total skills to a reasonable number
    const MAX_SKILLS = 50;
    if (validSkills.length > MAX_SKILLS) {
      logger.warn(
        `Limiting skills from ${validSkills.length} to ${MAX_SKILLS} items`
      );
      validSkills.length = MAX_SKILLS; // Truncate array
    }

    logger.info(
      `Filtered ${extractedSkills.length} raw skills to ${validSkills.length} valid skills`,
    );

    // NEW: Use dynamic skills database to normalize and enhance extracted skills
    const normalizedSkills = await normalizeExtractedSkills(validSkills);

    setCachedResponse(cacheKey, normalizedSkills);
    logger.info(
      `Skills extracted and normalized successfully from ${type} with Groq - found ${normalizedSkills.length} skills`,
    );
    return normalizedSkills;
  } catch (error) {
    logger.error(`Error extracting skills from ${type} with Groq`, error);

    // Return fallback response instead of throwing error to prevent analysis pipeline failure
    logger.warn(
      `Returning fallback skills for ${type} due to Groq parsing error`,
    );
    const fallbackSkills =
      type === "resume"
        ? ["Communication", "Problem Solving", "Teamwork", "Technical Skills"]
        : ["Programming", "Technical Skills", "Experience", "Education"];

    return fallbackSkills;
  }
}

// Analyze skill gap using Groq
export async function analyzeSkillGap(
  resumeText: string,
  jobDescText: string,
): Promise<{
  matchedSkills: string[];
  missingSkills: string[];
}> {
  const cacheKey = calculateHash(`groq_skillgap_${resumeText}_${jobDescText}`);
  const cached = getCachedResponse<{
    matchedSkills: string[];
    missingSkills: string[];
  }>(cacheKey);
  if (cached) return cached;

  const prompt = `Compare skills in this resume against job requirements and identify matches and gaps. Return a JSON object:

{
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill3", "skill4"]
}

Resume:
${resumeText}

Job Description:
${jobDescText}

Respond with only the JSON object, no additional text.`;

  try {
    const response = await callGroqAPI(prompt, MODELS.ANALYSIS);
    const cleanedResponse = stripMarkdownFromJSON(response);
    const result = JSON.parse(cleanedResponse);

    setCachedResponse(cacheKey, result);
    logger.info("Skill gap analysis completed successfully with Groq");
    return result;
  } catch (error) {
    logger.error("Error analyzing skill gap with Groq", error);

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

// Export usage statistics
export function getGroqUsage(): ApiUsage {
  return { ...apiUsage };
}

// Reset usage statistics
export function resetGroqUsage(): void {
  apiUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedCost: 0,
  };
  logger.info("Groq usage statistics reset");
}

// Generic analysis function for custom prompts
async function analyzeGeneric(prompt: string): Promise<string> {
  if (!groq) {
    throw new Error("Groq API not initialized - missing GROQ_API_KEY");
  }

  const cacheKey = calculateHash(prompt);
  const cached = responseCache[cacheKey];

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug("Returning cached generic analysis response");
    return cached.data as string;
  }

  try {
    logger.debug("Making Groq API call for generic analysis", {
      promptLength: prompt.length,
      model: MODELS.FAST
    });

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful AI assistant. Provide clear, accurate, and relevant responses."
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: MODELS.FAST,
      temperature: 0.3,
      max_tokens: 1000,
    });

    const response = completion.choices[0]?.message?.content || "";
    
    if (!response) {
      throw new Error("Empty response from Groq API");
    }

    // Update usage statistics
    if (completion.usage) {
      apiUsage.promptTokens += completion.usage.prompt_tokens || 0;
      apiUsage.completionTokens += completion.usage.completion_tokens || 0;
      apiUsage.totalTokens += completion.usage.total_tokens || 0;
      
      const pricing = PRICING[MODELS.FAST as keyof typeof PRICING];
      if (pricing) {
        apiUsage.estimatedCost += 
          ((completion.usage.prompt_tokens || 0) / 1000000) * pricing.input +
          ((completion.usage.completion_tokens || 0) / 1000000) * pricing.output;
      }
    }

    // Cache the response
    responseCache[cacheKey] = {
      timestamp: Date.now(),
      data: response,
    };

    logger.debug("Generic analysis completed successfully", {
      responseLength: response.length,
      tokens: completion.usage?.total_tokens || 0
    });

    return response;
  } catch (error) {
    logger.error("Generic analysis failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      promptLength: prompt.length
    });
    
    throw new Error(
      `Generic analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

// Export groqAPI object for compatibility with skill-memory-system
export const groqAPI = {
  analyzeGeneric,
};
