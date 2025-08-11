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

// PERFORMANCE OPTIMIZATION: Pre-compiled regex patterns for reuse
// Experience extraction patterns (compiled once for better performance)
const EXPERIENCE_PATTERNS = {
  // Professional comprehensive pattern with named groups (adapted for JavaScript)
  // Handles: "5 years", "3.5 years", "5+ years", "3-5 years", "over 10 years"  
  comprehensive: /\b(?:(?:(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\s+to\s+)\s*(\d+(?:\.\d+)?))?(\+)?)\s*(?:years?|yrs?|y)|(?:(?:over|more\s+than|at\s+least)\s*(\d+(?:\.\d+)?))\s*(?:years?|yrs?|y))\b/gi,
  
  // Context-aware pattern requiring "experience" nearby (within same sentence/line)
  contextAware: /\b(?=.*\b(?:experience|exp)\b)(?:(?:(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|\s+to\s+)\s*(\d+(?:\.\d+)?))?(\+)?)\s*(?:years?|yrs?|y)|(?:(?:over|more\s+than|at\s+least)\s*(\d+(?:\.\d+)?))\s*(?:years?|yrs?|y))\b/gi
};

// Name extraction patterns (compiled once for better performance)
const NAME_PATTERNS = {
  // Labeled name patterns with Unicode and international support
  labeled: [
    /(?:name|full[\s\-_]?name|candidate[\s\-_]?name):\s*([A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.\-\s]{1,60})/i,
  /(?:申请人姓名|名前|姓名):\s*([A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.\-\s()]{1,60})/,
  ],
  
  // Professional header patterns with Unicode and title support
  header: [
    // Name with titles/suffixes - comprehensive with Unicode support
    /^\s*(?:Dr\.?\s+|Mr\.?\s+|Ms\.?\s+|Mrs\.?\s+|Prof\.?\s+)?([A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.-]+){0,4}(?:\s+(?:Jr\.?|Sr\.?|III|IV|Ph\.?D\.?|M\.?D\.?|Esq\.?))?)\s*$/,
    // Simple name pattern - 2-4 words with Unicode
    /^\s*([A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff][A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff'.-]+){1,3})\s*$/
  ],
  
  // Title prefix pattern for recovery
  titlePrefix: /^\s*(Dr\.?\s+|Mr\.?\s+|Ms\.?\s+|Mrs\.?\s+|Prof\.?\s+)/
};

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

    if (!groq) {
      throw new Error("Groq client not initialized - GROQ_API_KEY is required");
    }
    
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
import { 
  Result, 
  success, 
  failure, 
  fromPromise, 
  isFailure,
  isSuccess,
  type ExternalServiceError, 
  type AppError 
} from '../../shared/result-types';
import { AppExternalServiceError } from '../../shared/errors';
import { AI_PROVIDER_CONFIG as _AI_PROVIDER_CONFIG } from './unified-scoring-config';

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

      if (!groq) {
        throw new Error("Groq client not initialized - GROQ_API_KEY is required");
      }
      
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
    (error: unknown) => AppExternalServiceError.aiProviderFailure('Groq', 'api-call', error instanceof Error ? error.message : String(error))
  );

  if (result.success) {
    logger.debug("Groq API call succeeded", { model, prompt: prompt.substring(0, 100) });
    return result;
  } else {
    logger.error("Groq API call failed", isFailure(result) ? result.error : "Unknown error");
    // Convert AppError to ExternalServiceError to match return type
    if (isFailure(result)) {
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
    
    // Fallback error
    return failure({
      code: 'AI_PROVIDER_ERROR' as const,
      service: 'groq',
      message: 'Unknown error occurred',
      statusCode: 500,
      timestamp: new Date().toISOString()
    });
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
    if (isFailure(result)) {
      const error = result.error;
      logger.error("Resume analysis failed", error);
      throw new Error(`Groq resume analysis failed: ${error.message}`);
    } else {
      logger.error("Resume analysis failed with unknown error");
      throw new Error("Groq resume analysis failed: Unknown error");
    }
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
  const [nameResultApp, contactResultApp, skillsResultApp, experienceResultApp, educationResultApp] = await Promise.all([
    fromPromise(extractName(resumeText), (error: unknown) => AppExternalServiceError.aiProviderFailure('Groq', 'name-extraction', error instanceof Error ? error.message : String(error))),
    fromPromise(extractContact(resumeText), (error: unknown) => AppExternalServiceError.aiProviderFailure('Groq', 'contact-extraction', error instanceof Error ? error.message : String(error))),
    fromPromise(extractSkills(resumeText, "resume"), (error: unknown) => AppExternalServiceError.aiProviderFailure('Groq', 'skills-extraction', error instanceof Error ? error.message : String(error))),
    fromPromise(extractExperience(resumeText), (error: unknown) => AppExternalServiceError.aiProviderFailure('Groq', 'experience-extraction', error instanceof Error ? error.message : String(error))),
    fromPromise(extractEducation(resumeText), (error: unknown) => AppExternalServiceError.aiProviderFailure('Groq', 'education-extraction', error instanceof Error ? error.message : String(error)))
  ]);

  // Convert AppError results to ExternalServiceError results
  const convertAppErrorResult = <T>(result: Result<T, AppError>): Result<T, ExternalServiceError> => {
    if (result.success) {
      return result;
    } else {
      if (isFailure(result)) {
        const externalServiceError: ExternalServiceError = {
          code: 'AI_PROVIDER_ERROR' as const,
          service: 'groq',
          message: result.error.message,
          statusCode: result.error.statusCode,
          timestamp: result.error.timestamp,
          originalError: result.error instanceof Error ? result.error.message : undefined
        };
        return failure(externalServiceError);
      } else {
        return failure({
          code: 'AI_PROVIDER_ERROR' as const,
          service: 'groq',
          message: 'Unknown error occurred',
          statusCode: 500,
          timestamp: new Date().toISOString()
        } as ExternalServiceError);
      }
    }
  };

  const nameResult = convertAppErrorResult(nameResultApp);
  const contactResult = convertAppErrorResult(contactResultApp);
  const skillsResult = convertAppErrorResult(skillsResultApp);
  const experienceResult = convertAppErrorResult(experienceResultApp);
  const educationResult = convertAppErrorResult(educationResultApp);

  // Check if any critical extraction failed (name extraction failure is not critical)
  if (isFailure(contactResult)) return contactResult;
  if (isFailure(skillsResult)) return skillsResult;  
  if (isFailure(experienceResult)) return experienceResult;
  if (isFailure(educationResult)) return educationResult;

  // All extractions succeeded, build response
  const extractedName = isSuccess(nameResult) ? nameResult.data : "Name not found";
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
      name: extractedName,
      skills: skillsArray,
      experience: experience?.totalYears || "Experience not specified",
      education: Array.isArray(education) ? education : [],
      summary: experience?.summary || "Professional with diverse background",
      keyStrengths: skillsArray.slice(0, 3),
    },
    processingTime: timeTaken,
    confidence: 0.8,
    // Convenience properties for backward compatibility
    name: extractedName,
    skills: skillsArray,
    experience: experience?.jobTitles && experience.jobTitles.length > 0 ? 
      experience.jobTitles.map((title: string, index: number) => ({
        company: "Company not specified",
        position: title,
        duration: index === 0 ? (experience?.totalYears || "Experience not specified") : "Duration not specified",
        description: ""
      })) : [{
        company: "Company not specified", 
        position: "Position not specified",
        duration: experience?.totalYears || "Experience not specified",
        description: ""
      }],
    experienceYears: experience?.yearsOfExperience || 0,
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
        name: rawResponse.name || "Name not found",
        skills: rawResponse.skills || [],
        experience: rawResponse.experience || "Experience not specified",
        education: rawResponse.education || [],
        summary: rawResponse.summary || "Professional with diverse background",
        keyStrengths: rawResponse.strengths || [],
      },
      processingTime: 0,
      confidence: 0.8,
      // Convenience properties for backward compatibility
      name: rawResponse.name || "Name not found",
      skills: rawResponse.skills || [],
      experience: [rawResponse.experience || "Experience not specified"],
      experienceYears: rawResponse.experienceYears || 0,
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
        ? groqResponse.biasIndicators.map((indicator: { type: string }) => indicator.type)
        : [],
      biasedPhrases: groqResponse.biasIndicators
        ? groqResponse.biasIndicators.map((indicator: { type: string; text: string; suggestion?: string }) => ({
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
// Extract experience information from resume text with fallback parsing
export async function extractExperience(text: string): Promise<{
  totalYears: string;
  summary: string;
  jobTitles: string[];
  yearsOfExperience: number;
}> {
  const cacheKey = calculateHash(`groq_experience_${text}`);
  const cached = getCachedResponse<{
    totalYears: string;
    summary: string;
    jobTitles: string[];
    yearsOfExperience: number;
  }>(cacheKey);
  if (cached) return cached;

  // Enhanced prompt with better instructions
  const prompt = `Extract experience information from this resume text. Analyze the work history, job dates, and any explicit experience statements.

Return a JSON object with:
- totalYears: number of years of experience as text (e.g., "5 years", "3+ years", "Entry level", "Recent graduate")
- summary: brief professional summary (1-2 sentences)  
- jobTitles: array of job titles/positions held
- yearsOfExperience: numeric years of experience (use 0 only for genuine entry-level/students)

Look for:
- Date ranges in work experience (2020-2024 = 4 years)
- Explicit statements like "5 years of experience" 
- Senior/Lead titles typically indicate 3+ years
- Recent graduates should be marked as "Recent graduate" not "0 years"
- Internships count as partial experience

Example format:
{
  "totalYears": "5 years",
  "summary": "Experienced software developer with expertise in web technologies",
  "jobTitles": ["Software Developer", "Frontend Engineer", "Web Developer"],
  "yearsOfExperience": 5
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
      yearsOfExperience: number;
    }>(cleanedResponse, "extractExperience");

    // If AI parsing succeeded with non-zero years, validate and return
    if (experience.totalYears && experience.totalYears !== "0 years") {
      const result = {
        totalYears: experience.totalYears,
        summary: experience.summary || "Professional background",
        jobTitles: Array.isArray(experience.jobTitles) ? experience.jobTitles : [],
        yearsOfExperience: experience.yearsOfExperience || 0,
      };
      
      setCachedResponse(cacheKey, result);
      logger.info("Experience extracted successfully from resume with Groq");
      return result;
    } else {
      // AI returned 0 years - verify with intelligent fallback parsing
      logger.info("AI returned 0 years, verifying with regex patterns and context analysis");
      
      // STEP 2-6: Smart verification of "0 years" claim
      const verificationResult = verifyZeroExperienceWithContext(text);
      
      if (verificationResult.isLegitimateZero) {
        // Confirmed legitimate zero experience (student, graduate, etc.)
        const result = {
          totalYears: verificationResult.totalYears,
          summary: verificationResult.summary,
          jobTitles: verificationResult.jobTitles,
          yearsOfExperience: 0,
        };
        
        setCachedResponse(cacheKey, result);
        logger.info("Verified legitimate zero experience", { reason: verificationResult.reason });
        return result;
      } else if (verificationResult.foundHiddenExperience) {
        // Found hidden experience that AI missed
        const result = {
          totalYears: verificationResult.totalYears,
          summary: verificationResult.summary,
          jobTitles: verificationResult.jobTitles,
          yearsOfExperience: verificationResult.yearsOfExperience,
        };
        
        setCachedResponse(cacheKey, result);
        logger.info("Found hidden experience AI missed", { 
          method: verificationResult.extractionMethod,
          years: verificationResult.yearsOfExperience 
        });
        return result;
      } else {
        // No evidence either way, fallback to text parsing
        throw new Error("Could not verify 0 years claim, using complete fallback");
      }
    }
  } catch (error) {
    logger.warn("AI experience extraction failed, trying text-based fallback", { error: error instanceof Error ? error.message : error });

    // FALLBACK: Text-based experience extraction
    const fallbackResult = extractExperienceFromText(text);
    
    setCachedResponse(cacheKey, fallbackResult);
    logger.info("Experience extracted using text-based fallback", { result: fallbackResult });
    return fallbackResult;
  }
}

// INTELLIGENT VERIFICATION: Smart analysis of "0 years" claims from AI
function verifyZeroExperienceWithContext(text: string): {
  isLegitimateZero: boolean;
  foundHiddenExperience: boolean;
  totalYears: string;
  summary: string;
  jobTitles: string[];
  yearsOfExperience: number;
  extractionMethod?: string;
  reason?: string;
} {
  let extractedYears = 0;
  let extractionMethod = "context-verification";
  let reason = "";
  
  // STEP 3: Check for date ranges → Calculate actual years
  const dateRangePattern = /(\d{4})\s*[-–—]\s*(\d{4})/g;
  const currentPattern = /(\d{4})\s*[-–—]\s*(?:present|current|now)/gi;
  const currentYear = new Date().getFullYear();
  let maxYearsFromDates = 0;
  
  // Calculate from date ranges
  let match;
  while ((match = dateRangePattern.exec(text)) !== null) {
    const startYear = parseInt(match[1]);
    const endYear = parseInt(match[2]);
    if (startYear >= 1990 && startYear <= currentYear && endYear >= startYear && endYear <= currentYear) {
      const years = endYear - startYear;
      maxYearsFromDates = Math.max(maxYearsFromDates, years);
    }
  }
  
  // Calculate from current positions
  dateRangePattern.lastIndex = 0; // Reset regex
  while ((match = currentPattern.exec(text)) !== null) {
    const startYear = parseInt(match[1]);
    if (startYear >= 1990 && startYear <= currentYear) {
      const years = currentYear - startYear;
      maxYearsFromDates = Math.max(maxYearsFromDates, years);
    }
  }
  
  if (maxYearsFromDates > 0) {
    extractedYears = maxYearsFromDates;
    extractionMethod = "date-range-calculation";
    reason = `Found ${maxYearsFromDates} years from date ranges`;
  }
  
  // STEP 4: Check for keywords → "senior" suggests experience
  const seniorIndicators = /(?:senior|lead|principal|architect|manager|director|vp|vice president|head of|chief)/i;
  if (extractedYears === 0 && seniorIndicators.test(text)) {
    extractedYears = 3; // Conservative estimate for senior roles
    extractionMethod = "senior-role-heuristic";
    reason = "Found senior/lead role indicators suggesting 3+ years";
  }
  
  // STEP 5: Check for student markers → Confirms legitimate zero
  const studentMarkers = /(?:student|graduate|graduating|recent graduate|fresh graduate|degree.*202[0-9]|university.*202[0-9]|college.*202[0-9]|bachelor.*202[0-9]|master.*202[0-9]|phd.*202[0-9])/i;
  const internshipMarkers = /(?:intern|internship|co-op|co-operative)/i;
  
  const hasStudentMarkers = studentMarkers.test(text);
  const hasInternshipOnly = internshipMarkers.test(text) && !seniorIndicators.test(text);
  
  // Extract job titles for context
  const jobTitlePatterns = [
    /(?:position|role|title):\s*([^\n]+)/gi,
    /(?:working|worked)\s+as\s+(?:a|an)?\s*([^\n,]+)/gi,
    /(?:^|\n)([A-Z][a-zA-Z\s]+(?:Engineer|Developer|Manager|Analyst|Specialist|Director|Lead|Senior|Junior))/gm
  ];
  
  const jobTitles: string[] = [];
  const seenTitles = new Set<string>();
  
  for (const pattern of jobTitlePatterns) {
    pattern.lastIndex = 0; // Reset regex
    while ((match = pattern.exec(text)) !== null) {
      const title = match[1].trim();
      if (title.length > 3 && title.length < 50 && !seenTitles.has(title.toLowerCase())) {
        jobTitles.push(title);
        seenTitles.add(title.toLowerCase());
      }
    }
  }
  
  // STEP 6: Return appropriate value based on analysis
  if (hasStudentMarkers && extractedYears === 0) {
    // Confirmed legitimate zero - student/recent graduate
    return {
      isLegitimateZero: true,
      foundHiddenExperience: false,
      totalYears: "Recent graduate",
      summary: "Recent graduate seeking opportunities to apply academic knowledge",
      jobTitles: jobTitles,
      yearsOfExperience: 0,
      reason: "Confirmed student/recent graduate status"
    };
  } else if (hasInternshipOnly && extractedYears === 0) {
    // Internship experience counts as partial
    return {
      isLegitimateZero: false,
      foundHiddenExperience: true,
      totalYears: "Entry level",
      summary: "Entry-level professional with internship experience",
      jobTitles: jobTitles,
      yearsOfExperience: 0.5,
      extractionMethod: "internship-detection",
      reason: "Found internship experience"
    };
  } else if (extractedYears > 0) {
    // Found hidden experience that AI missed
    let totalYearsText = "";
    if (extractedYears % 1 !== 0) {
      totalYearsText = `${extractedYears} years`;
    } else {
      totalYearsText = `${extractedYears}${extractedYears >= 3 ? '+' : ''} years`;
    }
    
    return {
      isLegitimateZero: false,
      foundHiddenExperience: true,
      totalYears: totalYearsText,
      summary: `Professional with ${extractedYears} years of experience`,
      jobTitles: jobTitles,
      yearsOfExperience: extractedYears,
      extractionMethod: extractionMethod,
      reason: reason
    };
  } else {
    // Inconclusive - no clear evidence either way
    return {
      isLegitimateZero: false,
      foundHiddenExperience: false,
      totalYears: "Experience not specified",
      summary: "Professional background",
      jobTitles: jobTitles,
      yearsOfExperience: 0,
      reason: "No conclusive evidence found"
    };
  }
}

// Professional text-based experience extraction using comprehensive patterns
function extractExperienceFromText(text: string): {
  totalYears: string;
  summary: string;
  jobTitles: string[];
  yearsOfExperience: number;
} {
  let extractedYears = 0;
  let extractionMethod = "not found";

  // PERFORMANCE OPTIMIZATION: Use pre-compiled regex patterns
  // Reset global pattern state for reuse
  EXPERIENCE_PATTERNS.contextAware.lastIndex = 0;
  EXPERIENCE_PATTERNS.comprehensive.lastIndex = 0;

  // First try context-aware extraction (most reliable)
  let match;
  while ((match = EXPERIENCE_PATTERNS.contextAware.exec(text)) !== null) {
    const min = parseFloat(match[1] || match[4]); // main number or "over X" number
    const max = match[2] ? parseFloat(match[2]) : null; // range max
    const plus = match[3]; // plus sign
    
    if (!isNaN(min)) {
      // For ranges, take the maximum; for plus signs, use the minimum
      const years = max ? max : (plus ? Math.ceil(min) : min);
      extractedYears = Math.max(extractedYears, years);
      extractionMethod = "context-aware";
    }
  }

  // If context-aware didn't find anything, try comprehensive pattern
  if (extractedYears === 0) {
    // Reset regex lastIndex for new search
    EXPERIENCE_PATTERNS.comprehensive.lastIndex = 0;
    
    while ((match = EXPERIENCE_PATTERNS.comprehensive.exec(text)) !== null) {
      const min = parseFloat(match[1] || match[4]); // main number or "over X" number
      const max = match[2] ? parseFloat(match[2]) : null; // range max
      const plus = match[3]; // plus sign
      
      if (!isNaN(min)) {
        // Apply basic context filtering to avoid false positives
        const matchText = match[0];
        const beforeMatch = text.substring(Math.max(0, match.index - 50), match.index).toLowerCase();
        const afterMatch = text.substring(match.index + matchText.length, match.index + matchText.length + 50).toLowerCase();
        
        // Skip obvious false positives
        if (beforeMatch.includes("old") || beforeMatch.includes("age") || 
            afterMatch.includes("old") || afterMatch.includes("age") ||
            beforeMatch.includes("school") || afterMatch.includes("school")) {
          continue;
        }
        
        // For ranges, take the maximum; for plus signs, use the minimum
        const years = max ? max : (plus ? Math.ceil(min) : min);
        extractedYears = Math.max(extractedYears, years);
        extractionMethod = "comprehensive";
      }
    }
  }

  // If still no explicit experience found, try date range calculation
  if (extractedYears === 0) {
    const dateRangePattern = /(\d{4})\s*[-–—]\s*(\d{4})/g;
    const currentPattern = /(\d{4})\s*[-–—]\s*(?:present|current|now)/gi;
    const currentYear = new Date().getFullYear();
    let maxYears = 0;

    // Calculate from date ranges
    while ((match = dateRangePattern.exec(text)) !== null) {
      const startYear = parseInt(match[1]);
      const endYear = parseInt(match[2]);
      if (startYear >= 1990 && startYear <= currentYear && endYear >= startYear && endYear <= currentYear) {
        const years = endYear - startYear;
        maxYears = Math.max(maxYears, years);
      }
    }

    // Calculate from current positions
    while ((match = currentPattern.exec(text)) !== null) {
      const startYear = parseInt(match[1]);
      if (startYear >= 1990 && startYear <= currentYear) {
        const years = currentYear - startYear;
        maxYears = Math.max(maxYears, years);
      }
    }

    if (maxYears > 0) {
      extractedYears = maxYears;
      extractionMethod = "date-calculation";
    }
  }

  // Extract job titles from common patterns
  const jobTitlePatterns = [
    /(?:position|role|title):\s*([^\n]+)/gi,
    /(?:working|worked)\s+as\s+(?:a|an)?\s*([^\n,]+)/gi,
    /(?:^|\n)([A-Z][a-zA-Z\s]+(?:Engineer|Developer|Manager|Analyst|Specialist|Director|Lead|Senior|Junior))/gm
  ];

  const jobTitles: string[] = [];
  const seenTitles = new Set<string>();
  
  for (const pattern of jobTitlePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const title = match[1].trim();
      if (title.length > 3 && title.length < 50 && !seenTitles.has(title.toLowerCase())) {
        jobTitles.push(title);
        seenTitles.add(title.toLowerCase());
      }
    }
  }

  // Determine experience level based on content analysis
  let totalYearsText = "Experience not specified";
  
  // Check for student/graduate indicators
  if (/(?:student|graduate|graduating|degree.*202[0-9]|university.*202[0-9])/i.test(text)) {
    if (extractedYears === 0) {
      totalYearsText = "Recent graduate";
    }
  }
  
  // Check for senior/lead positions (usually indicates 3+ years)
  if (/(?:senior|lead|principal|architect|manager)/i.test(text) && extractedYears === 0) {
    extractedYears = 3;
    totalYearsText = "3+ years (estimated from senior role)";
    extractionMethod = "senior-role-heuristic";
  }
  
  // Use extracted years if found
  if (extractedYears > 0) {
    // Handle decimal years properly
    if (extractedYears % 1 !== 0) {
      totalYearsText = `${extractedYears} years`;
    } else {
      totalYearsText = `${extractedYears}${extractedYears >= 3 ? '+' : ''} years`;
    }
  }

  // Generate summary based on found job titles and extraction method
  let summary = "Professional with diverse background";
  if (jobTitles.length > 0) {
    const primaryRole = jobTitles[0];
    summary = `Professional with background as ${primaryRole}${jobTitles.length > 1 ? ' and related roles' : ''}`;
  }
  
  // Add extraction method for debugging/logging
  if (extractedYears > 0) {
    summary += ` (experience extracted via ${extractionMethod})`;
  }

  return {
    totalYears: totalYearsText,
    summary,
    jobTitles: jobTitles.length > 0 ? jobTitles : ["Professional"],
    yearsOfExperience: extractedYears,
  };
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

// Professional two-tier name extraction with Unicode support
export async function extractName(text: string): Promise<string> {
  try {
    // TIER 1: Labeled name extraction (highest confidence)
    const labeledName = extractLabeledName(text);
    if (labeledName !== "Name not found") {
      return labeledName;
    }

    // TIER 2: Heuristic extraction from resume header (medium confidence)
    const heuristicName = extractNameFromHeader(text);
    if (heuristicName !== "Name not found") {
      return heuristicName;
    }

    // TIER 3: AI fallback (lowest confidence, highest cost)
    return await extractNameWithAI(text);
  } catch (error) {
    logger.error("Error in name extraction cascade", error);
    return "Name not found";
  }
}

// Extract labeled names like "Name: John Doe", "Candidate: María Pérez"
function extractLabeledName(text: string): string {
  // PERFORMANCE OPTIMIZATION: Use pre-compiled labeled patterns
  const firstLines = text.split('\n').slice(0, 5);
  
  // Try each labeled pattern
  for (const line of firstLines) {
    for (const pattern of NAME_PATTERNS.labeled) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (isValidName(name)) {
          return name;
        }
      }
    }
  }
  
  return "Name not found";
}

// Extract name from resume header using heuristics
function extractNameFromHeader(text: string): string {
  const firstLines = text.split('\n').slice(0, 5);
  
  // PERFORMANCE OPTIMIZATION: Use pre-compiled header patterns
  for (const pattern of NAME_PATTERNS.header) {
    for (const line of firstLines) {
      // Context-aware validation: exclude lines with email/phone/obvious non-names
      if (line.includes('@') || /\d{3}/.test(line) || 
          /\b(?:objective|summary|email|phone|address|linkedin|github)\b/i.test(line)) {
        continue;
      }
      
      const match = line.match(pattern);
      if (match && match[1]) {
        let name = match[1].trim();
        
        // Check if there's a title prefix and add it back
        const titleMatch = line.match(NAME_PATTERNS.titlePrefix);
        if (titleMatch) {
          name = titleMatch[1].trim() + ' ' + name;
        }
        
        if (isValidName(name)) {
          return name;
        }
      }
    }
  }
  
  return "Name not found";
}

// Validate that extracted text is likely a real name
function isValidName(name: string): boolean {
  // Length validation
  if (name.length < 3 || name.length > 80) {
    return false;
  }
  
  // Word count validation (1-5 words for flexibility with international names)
  const words = name.split(/\s+/);
  if (words.length < 1 || words.length > 5) {
    return false;
  }
  
  // Reject obvious non-names
  const lowercaseName = name.toLowerCase();
  const nonNamePhrases = [
    'resume', 'cv', 'curriculum', 'vitae', 'objective', 'summary',
    'experience', 'education', 'skills', 'contact', 'phone', 'email',
    'address', 'linkedin', 'github', 'portfolio', 'references',
    'software engineer', 'data scientist', 'product manager', 'developer'
  ];
  
  for (const phrase of nonNamePhrases) {
    if (lowercaseName.includes(phrase)) {
      return false;
    }
  }
  
  // Each word should start with a letter (not number or symbol)
  for (const word of words) {
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿĀ-žА-я\u4e00-\u9fff]/.test(word)) {
      return false;
    }
  }
  
  return true;
}

// AI-based name extraction fallback
async function extractNameWithAI(text: string): Promise<string> {
  try {

    // Fallback: Use AI extraction
    const prompt = `Extract the candidate's full name from this resume. Return only the name, nothing else.

Resume text:
${text.substring(0, 1500)}`;

    if (!groq) {
      throw new Error("Groq client not initialized - GROQ_API_KEY is required");
    }

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: MODELS.FAST,
      temperature: 0.1,
      max_tokens: 50,
      response_format: { type: "text" }
    });

    const extractedName = completion.choices[0]?.message?.content?.trim();
    
    if (extractedName && extractedName.length >= 3 && extractedName.length <= 80) {
      // Clean up the response (remove quotes, extra text)
      const cleanName = extractedName
        .replace(/^"|"$/g, '')
        .replace(/^Name:\s*/i, '')
        .replace(/^The candidate's name is\s*/i, '')
        .replace(/^.*name.*is\s*/i, '')
        .trim();
      
      if (isValidName(cleanName)) {
        return cleanName;
      }
    }

    return "Name not found";
  } catch (error) {
    logger.error("Error extracting name from resume with Groq", error);
    return "Name not found";
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

    if (!groq) {
      throw new Error("Groq client not initialized - GROQ_API_KEY is required");
    }

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
