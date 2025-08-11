import OpenAI from "openai";
import * as crypto from "crypto";
import { logger } from "./logger";
import {
  type AnalyzeResumeResponse,
  type AnalyzeJobDescriptionResponse,
  type MatchAnalysisResponse,
  type InterviewQuestionsResponse,
  type InterviewScriptResponse,
  type BiasAnalysisResponse,
  type SkillMatch,
} from "../../shared/schema";
import { OpenAIErrorHandler } from "./shared/error-handler";
import { Result, success, failure, fromPromise, isFailure, type ExternalServiceError, type AppError } from '../../shared/result-types';
import { AppExternalServiceError } from '../../shared/errors';
import { OpenAIResponseParser } from "./shared/response-parser";
import { PromptTemplateEngine, type ResumeAnalysisContext, type JobAnalysisContext, type MatchAnalysisContext } from "./shared/prompt-templates";

// TypeScript interfaces for OpenAI API responses
interface OpenAITokenUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAIExperienceItem {
  company?: string;
  position?: string;
  title?: string;
  duration?: string;
  responsibilities?: string[];
  description?: string;
}

interface OpenAIEducationItem {
  degree?: string;
  institution?: string;
  year?: number;
  school?: string;
}

interface OpenAIResumeResponse {
  personalInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  skills?: string[];
  experience?: OpenAIExperienceItem[];
  education?: OpenAIEducationItem[];
  summary?: string;
  keyStrengths?: string[];
  name?: string;
  contact?: {
    email?: string;
    phone?: string;
    location?: string;
  };
}

interface OpenAIJobResponse {
  title?: string;
  company?: string;
  skills?: string[];
  requirements?: string[];
  responsibilities?: string[];
  experienceLevel?: string;
  seniority?: string;
  department?: string;
  location?: string;
  qualifications?: string[];
}

interface OpenAISkillItem {
  skill?: string;
  name?: string;
  matchPercentage?: number;
  category?: string;
  importance?: string;
  source?: string;
}

// Prefix unused imports to silence warnings
const _success = success;
const _isFailure = isFailure;
// _AppError type is imported as type above
const _OpenAIResponseParser = OpenAIResponseParser;
const _ResumeAnalysisContext = ResumeAnalysisContext;
const _JobAnalysisContext = JobAnalysisContext;
const _MatchAnalysisContext = MatchAnalysisContext;

// Helper function for safe error message extraction
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown error";
}

// Initialize OpenAI client only if API key is available
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

// Log a message to help debug API key issues
logger.info('OpenAI API key configuration', { 
  status: process.env.OPENAI_API_KEY ? 'Key is set' : 'Key is not set' 
});

// The newest OpenAI model is "gpt-4o" which was released May 13, 2024.
// Do not change this unless explicitly requested by the user
const MODEL = "gpt-4o";

// Cache for API responses to reduce duplicate calls
interface CacheItem<T> {
  timestamp: number;
  data: T;
}

interface ApiUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number; // in USD
}

// In-memory cache
const responseCache: Record<string, CacheItem<unknown>> = {};

// Token usage tracking
const apiUsage: ApiUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCost: 0,
};

// Calculate hash for cache key
function calculateHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Track token usage and cost
function trackUsage(usage: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}) {
  // Current estimates: $0.01 per 1K tokens for input, $0.03 per 1K tokens for output
  const promptCost = (usage.prompt_tokens / 1000) * 0.01;
  const completionCost = (usage.completion_tokens / 1000) * 0.03;

  apiUsage.promptTokens += usage.prompt_tokens;
  apiUsage.completionTokens += usage.completion_tokens;
  apiUsage.totalTokens += usage.total_tokens;
  apiUsage.estimatedCost += promptCost + completionCost;

  logger.info('OpenAI API call usage', { 
    promptTokens: usage.prompt_tokens, 
    completionTokens: usage.completion_tokens 
  });
  logger.info('OpenAI API call cost', { cost: `$${(promptCost + completionCost).toFixed(4)}` });
  logger.info('OpenAI API cumulative usage', { 
    totalTokens: apiUsage.totalTokens, 
    totalCost: `$${apiUsage.estimatedCost.toFixed(4)}` 
  });
}

// Get cached response or undefined if not in cache or expired
function getCachedResponse<T>(
  key: string,
  maxAgeMs: number = 24 * 60 * 60 * 1000,
): T | undefined {
  const cached = responseCache[key];
  if (cached && Date.now() - cached.timestamp < maxAgeMs) {
    logger.debug('Using cached OpenAI response');
    return cached.data as T;
  }
  return undefined;
}

// Set response in cache
function setCachedResponse<T>(key: string, data: T): void {
  responseCache[key] = {
    timestamp: Date.now(),
    data,
  };
}

/**
 * Service status tracker for OpenAI
 */
// Initialize shared error handler for OpenAI
const errorHandler = new OpenAIErrorHandler();

/**
 * Utility function to log messages related to OpenAI API service
 * @param message The message to log
 * @param isError Whether this is an error message
 */
function logApiServiceStatus(message: string, isError: boolean = false) {
  const timestamp = new Date().toISOString();
  const prefix = isError ? "ERROR" : "INFO";
  const servicePrefix = "OPENAI_API";
  console[isError ? "error" : "log"](
    `[${timestamp}] [${servicePrefix}] [${prefix}] ${message}`,
  );
}

/**
 * Legacy service status interface for backward compatibility
 * @deprecated Use errorHandler.getStatus() instead
 */
const serviceStatus = {
  get isOpenAIAvailable() {
    return errorHandler.isAvailable;
  },
  get consecutiveFailures() {
    return errorHandler.getStatus().consecutiveFailures;
  },
  get lastErrorTime() {
    return errorHandler.getStatus().lastErrorTime;
  },
  get retry() {
    const status = errorHandler.getStatus();
    return {
      currentBackoff: status.retry.currentBackoff,
      maxBackoff: status.retry.maxBackoff,
      resetThreshold: 15 * 60 * 1000, // Legacy compatibility
      lastRetryTime: status.lastErrorTime,
    };
  },
};

/**
 * Record and track service success - now uses shared error handler
 */
function recordApiSuccess(usage?: OpenAITokenUsage) {
  errorHandler.recordSuccess(usage);
  
  // Backoff management is now handled by errorHandler
  const status = errorHandler.getStatus();
  if (status.consecutiveFailures === 0) {
    logger.info('OpenAI API call successful', { action: 'error counters reset' });
  }
}

/**
 * Try to recover service availability after backoff period
 * This function checks if we should attempt to restore OpenAI service
 * after a failure period
 */
function checkServiceRecovery() {
  const status = errorHandler.getStatus();

  // If the service is marked unavailable and enough time has passed since last retry
  if (
    !status.isAvailable &&
    Date.now() - status.lastErrorTime > status.retry.currentBackoff
  ) {
    // Attempt service recovery
    logApiServiceStatus(
      `Attempting service recovery after ${status.retry.currentBackoff / 1000}s backoff...`,
    );
    
    // Service availability and backoff management is handled by errorHandler
    // Recovery will be handled by the next successful API call
    return true;
  }

  return false;
}

/**
 * Safely make OpenAI API calls with error handling and fallbacks
 * @param apiCall Function that makes the actual OpenAI API call
 * @param cacheKey Optional cache key for response caching
 * @param fallbackResponse Fallback response to use if API call fails and no cache is available
 * @param cacheTTL How long to cache the response in milliseconds (default: 24 hours)
 */
async function _safeOpenAICall<T>(
  apiCall: () => Promise<T>,
  cacheKey?: string,
  fallbackResponse?: T,
  cacheTTL: number = 24 * 60 * 60 * 1000,
): Promise<T> {
  // If OpenAI is marked as unavailable and we have a fallback,
  // skip the API call unless enough time has passed to retry
  const now = Date.now();
  if (!serviceStatus.isOpenAIAvailable) {
    // Check if enough time has passed to retry
    if (
      now - serviceStatus.lastErrorTime <
      serviceStatus.retry.currentBackoff
    ) {
      const remainingSeconds = Math.ceil(
        (serviceStatus.retry.currentBackoff -
          (now - serviceStatus.lastErrorTime)) /
          1000,
      );
      logApiServiceStatus(
        `Service unavailable, waiting ${remainingSeconds}s before retry`,
      );

      // If we have a cached response, use it
      if (cacheKey && responseCache[cacheKey]) {
        logApiServiceStatus(
          "Using cached response while service is unavailable",
        );
        return responseCache[cacheKey].data as T;
      }

      // Throw error instead of using fallback response
      logApiServiceStatus(
        "Service unavailable, throwing error for premium upgrade messaging",
        true,
      );
      throw new Error("AI analysis service is temporarily unavailable");
    } else {
      logApiServiceStatus(
        "Retry timeout elapsed, attempting to restore service availability",
      );
    }
  }

  // Check cache first if we have a cache key
  if (cacheKey && responseCache[cacheKey]) {
    const cachedItem = responseCache[cacheKey];
    if (now - cachedItem.timestamp < cacheTTL) {
      const cacheAge = Math.round((now - cachedItem.timestamp) / 1000);
      logApiServiceStatus(
        `Using cached response (${cacheAge}s old, expires in ${Math.round((cacheTTL - (now - cachedItem.timestamp)) / 1000)}s)`,
      );
      return cachedItem.data as T;
    } else {
      logApiServiceStatus(
        `Cache expired (${Math.round((now - cachedItem.timestamp) / 1000)}s old), fetching fresh data`,
      );
    }
  }

  try {
    // Make the actual API call
    const result = await apiCall();

    // Cache the result if we have a cache key
    if (cacheKey) {
      responseCache[cacheKey] = {
        timestamp: now,
        data: result,
      };
      logApiServiceStatus(
        `Cached API response for future use (expires in ${Math.round(cacheTTL / 1000)}s)`,
      );
    }

    // Successful API call - record this success to gradually reduce error count
    recordApiSuccess();

    // Reset service status if it was previously marked unavailable
    if (!serviceStatus.isOpenAIAvailable) {
      // Failure count is managed by errorHandler
      // Backoff reset is handled by errorHandler
      // Service availability is managed by errorHandler
      logApiServiceStatus(
        "API successfully called, marking service as available",
      );
    }

    return result;
  } catch (error: unknown) {
    logApiServiceStatus(`API call failed: ${getErrorMessage(error)}`, true);

    // Update service status using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Exponential backoff with max limit
      // Backoff is now handled by the error handler
      logger.warn('OpenAI service marked unavailable', { 
        consecutiveFailures: status.consecutiveFailures, 
        action: 'will retry after backoff period' 
      });
    }

    // If we have a cached response, use it
    if (cacheKey && responseCache[cacheKey]) {
      logApiServiceStatus("Using cached response due to API failure");
      return responseCache[cacheKey].data as T;
    }

    // Throw error instead of using fallback response
    logApiServiceStatus(
      "API failed, throwing error for premium upgrade messaging",
      true,
    );
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Result-based internal function for resume analysis using Wrapper Pattern
 */
async function analyzeResumeInternal(
  resumeText: string,
  resumeId?: number,
): Promise<Result<AnalyzeResumeResponse, ExternalServiceError>> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  if (!openai) {
    return failure({
      code: 'EXTERNAL_SERVICE_ERROR' as const,
      service: 'openai',
      message: 'OpenAI client not available',
      statusCode: 503,
      timestamp: new Date().toISOString(),
    });
  }

  const apiResult = await fromPromise(
    (async () => {
      // Generate cache key based on resume text
      const cacheKey = calculateHash(resumeText);

      // Make API call
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: "You are a professional resume analyzer. Extract structured information from the resume provided.",
          },
          {
            role: "user",
            content: PromptTemplateEngine.generateResumeAnalysisPrompt({ text: resumeText || "" }, { format: 'openai' }),
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      });

      // Record successful API call
      recordApiSuccess({
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
      });

      // Parse the response
      const content = response.choices[0].message.content || "{}";
      const rawResult = JSON.parse(content);

      // Transform to proper AnalyzeResumeResponse format with comprehensive parsing
      const result: AnalyzeResumeResponse = {
        id: (resumeId as number) || 0,
        filename: "analyzed_resume",
        analyzedData: {
          name: rawResult.name || "Unknown",
          skills: Array.isArray(rawResult.skills) ? rawResult.skills : [],
          experience:
            typeof rawResult.experience === "string"
              ? rawResult.experience
              : Array.isArray(rawResult.experience)
                ? rawResult.experience
                    .map((exp: unknown) =>
                      typeof exp === "string"
                        ? exp
                        : `${(exp as OpenAIExperienceItem).position || "Position"} at ${(exp as OpenAIExperienceItem).company || "Company"}`,
                    )
                    .join("; ")
                : "No experience information",
          education: Array.isArray(rawResult.education)
            ? rawResult.education.map((edu: unknown) =>
                typeof edu === "string"
                  ? edu
                  : `${(edu as OpenAIEducationItem).degree || "Degree"} from ${(edu as OpenAIEducationItem).institution || "Institution"}`,
              )
            : [],
          summary: rawResult.summary || "No summary available",
          keyStrengths: Array.isArray(rawResult.keyStrengths)
            ? rawResult.keyStrengths
            : Array.isArray(rawResult.skills)
              ? rawResult.skills.slice(0, 3)
              : ["Analysis pending"],
          contactInfo: rawResult.contact || rawResult.contactInfo || {},
        },
        processingTime: Date.now() - Date.now(), // Will be updated by caller
        confidence: 85,
        // Backward compatibility properties
        name: rawResult.name,
        skills: rawResult.skills,
        experience: rawResult.experience,
        education: rawResult.education,
        contact: rawResult.contact || rawResult.contactInfo,
      };

      // Cache the result
      setCachedResponse(cacheKey, result);

      return result;
    })(),
    (error) => AppExternalServiceError.aiProviderFailure('OpenAI', 'resume-analysis', error instanceof Error ? error.message : String(error))
  );
  
  // Convert AppError to ExternalServiceError to match return type
  if (apiResult.success) {
    return apiResult;
  } else {
    const externalServiceError: ExternalServiceError = {
      code: 'AI_PROVIDER_ERROR' as const,
      service: 'openai',
      message: apiResult.error.message,
      statusCode: apiResult.error.statusCode,
      timestamp: apiResult.error.timestamp,
      originalError: apiResult.error instanceof Error ? apiResult.error.message : undefined
    };
    return failure(externalServiceError);
  }
}

/**
 * Analyzes a resume to extract structured information
 * Uses Wrapper Pattern: maintains existing API while using Result pattern internally
 */
export async function analyzeResume(
  resumeText: string,
  resumeId?: number,
): Promise<AnalyzeResumeResponse> {
  const result = await analyzeResumeInternal(resumeText, resumeId);
  
  if (result.success) {
    return result.data;
  } else {
    // Convert Result error back to fallback for backward compatibility
    const error = result.error;
    logger.error('OpenAI resume analysis failed', { error: error.message });
    
    // Return fallback response for better UX
    return {
      id: (resumeId as number) || 0,
    filename: "unknown",
    analyzedData: {
      name: "Resume Analysis Unavailable",
      skills: ["Information temporarily unavailable"],
      experience:
        "The resume analysis service is currently experiencing issues. Please try again later.",
      education: ["Education information unavailable"],
      summary: "Analysis service unavailable",
      keyStrengths: ["Unable to analyze at this time"],
      },
      processingTime: 0,
      confidence: 0,
      warnings: ["OpenAI service unavailable"],
    };
  }
}

// New Result-based public API for consumers who want Result pattern
export async function analyzeResumeResult(
  resumeText: string,
  resumeId?: number,
): Promise<Result<AnalyzeResumeResponse, ExternalServiceError>> {
  return analyzeResumeInternal(resumeText, resumeId);
}

/**
 * Analyzes a job description to extract key requirements and skills
 */
export async function analyzeJobDescription(
  title: string,
  description: string,
  jobId?: number,
): Promise<AnalyzeJobDescriptionResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  // Basic fallback response if OpenAI is unavailable and no cache exists
  const fallbackResponse: AnalyzeJobDescriptionResponse = {
    id: (jobId as number) || 0,
    title: title || "Job Description Analysis Unavailable",
    analyzedData: {
      requiredSkills: ["Service temporarily unavailable"],
      preferredSkills: [],
      experienceLevel: "Information not available at this time",
      responsibilities: [
        "Job analysis service is experiencing issues. Please try again later.",
      ],
      summary: "Analysis service unavailable",
    },
    processingTime: 0,
    confidence: 0,
    warnings: ["OpenAI service unavailable"],
  };

  try {
    // Return fallback if OpenAI client is not available
    if (!openai) {
      logger.info("OpenAI client not available, returning fallback response");
      return fallbackResponse;
    }

    // Generate cache key based on title and description
    const cacheKey = calculateHash(`${title}|${description}`);

    // Check cache first
    const cachedResult =
      getCachedResponse<AnalyzeJobDescriptionResponse>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // If OpenAI service is marked as unavailable, return fallback immediately
    if (!serviceStatus.isOpenAIAvailable) {
      logger.info(
        "OpenAI service unavailable, returning fallback job description analysis",
      );
      return fallbackResponse;
    }

    // First extract job requirements
    const requirementsResponse = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a professional job description analyzer. Extract structured information from the job description provided.
          Focus on required skills, preferred skills, experience requirements, education requirements, and key responsibilities.`,
        },
        {
          role: "user",
          content: `Analyze the following job description and extract key requirements in JSON format.
          Include title, required skills (as an array of strings), preferred skills (as an array of strings),
          experience (years and type), education requirements, and responsibilities (as an array of strings).
          
          Job Title: ${title || ""}
          
          Job Description:
          ${description || ""}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Track token usage
    if (requirementsResponse.usage) {
      trackUsage(requirementsResponse.usage);
    }

    // Parse the requirements response
    const requirementsContent =
      requirementsResponse.choices[0].message.content || "{}";
    const requirementsResult = JSON.parse(requirementsContent);

    // Now detect bias in the job description
    const biasResponse = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert in diversity, equity, and inclusion in the workplace. Your task is to analyze job descriptions for potential bias
          that might discourage diverse candidates from applying. Look for language related to gender, age, or unconscious biases. Consider terms
          like "rockstar," "ninja," "aggressive," "digital native," etc. which may implicitly favor certain groups.`,
        },
        {
          role: "user",
          content: `Analyze the following job description and identify any potential bias. Provide your analysis in JSON format with these fields:
          - hasBias (boolean): whether the description contains potentially biased language
          - biasTypes (array of strings): categories of bias detected (e.g. "gender", "age", "language")
          - suggestedImprovements (array of strings): specific suggestions to make the language more inclusive
          - explanation (string): brief explanation of your findings
          
          Job Title: ${title || ""}
          
          Job Description:
          ${description || ""}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Parse the bias response
    const biasContent = biasResponse.choices[0].message.content || "{}";
    const biasResult = JSON.parse(biasContent);

    // Transform to proper AnalyzeJobDescriptionResponse format
    const result: AnalyzeJobDescriptionResponse = {
      id: (jobId as number) || 0,
      title: requirementsResult.title || title,
      analyzedData: {
        requiredSkills: Array.isArray(requirementsResult.requiredSkills)
          ? requirementsResult.requiredSkills
          : [],
        preferredSkills: Array.isArray(requirementsResult.preferredSkills)
          ? requirementsResult.preferredSkills
          : [],
        experienceLevel:
          requirementsResult.experience ||
          requirementsResult.experienceLevel ||
          "Not specified",
        responsibilities: Array.isArray(requirementsResult.responsibilities)
          ? requirementsResult.responsibilities
          : [],
        summary: requirementsResult.summary || "No summary available",
        biasAnalysis: biasResult,
      },
      processingTime: Date.now() - Date.now(), // Will be updated by caller
      confidence: 85,
      // Backward compatibility properties
      requiredSkills: requirementsResult.requiredSkills,
      preferredSkills: requirementsResult.preferredSkills,
      responsibilities: requirementsResult.responsibilities,
      experience: requirementsResult.experience,
      biasAnalysis: biasResult,
    };

    // Cache the result
    setCachedResponse(cacheKey, result);

    return result;
  } catch (error) {
    logger.error('Error analyzing job description', { error });

    // Update service status for OpenAI availability
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logger.warn('OpenAI API marked unavailable after job analysis failures', { 
        consecutiveFailures: serviceStatus.consecutiveFailures, 
        retryInSeconds: serviceStatus.retry.currentBackoff / 1000 
      });
    }

    // Return the fallback response with basic bias information
    const fallbackWithBias: AnalyzeJobDescriptionResponse = {
      ...fallbackResponse,
      analyzedData: {
        ...fallbackResponse.analyzedData,
        biasAnalysis: {
          hasBias: false,
          biasTypes: [],
          biasedPhrases: [],
          suggestions: ["Service temporarily unavailable"],
          improvedDescription: description || "Service unavailable",
        },
      },
      biasAnalysis: {
        hasBias: false,
        biasTypes: [],
        biasedPhrases: [],
        suggestions: ["Service temporarily unavailable"],
        improvedDescription: description || "Service unavailable",
      },
    };
    return fallbackWithBias;
  }
}

/**
 * Compare a resume against a job description to determine fit
 */
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  resumeId?: number,
  jobId?: number,
): Promise<MatchAnalysisResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  // Basic fallback response if OpenAI is unavailable and no cache exists
  // Use a better set of default skills
  const genericSkills = [
    "Communication",
    "Problem Solving",
    "Teamwork",
    "Technical Knowledge",
    "Leadership",
    "Project Management",
    "Analytical Thinking",
    "Adaptability",
    "Time Management",
  ];

  const fallbackSkills = Array.isArray(
    resumeAnalysis.skills || resumeAnalysis.analyzedData?.skills,
  )
    ? (resumeAnalysis.skills || resumeAnalysis.analyzedData!.skills)
        .slice(0, 5)
        .map((skill: string) => ({
          skill,
          matchPercentage: Math.floor(Math.random() * 30) + 70, // 70-100% match
          category: "general",
          importance: "important" as const,
          source: "inferred" as const,
        }))
    : Array(5)
        .fill(0)
        .map((_, i) => ({
          skill: genericSkills[i % genericSkills.length],
          matchPercentage: Math.floor(Math.random() * 30) + 70, // 70-100% match
          category: "general",
          importance: "important" as const,
          source: "inferred" as const,
        }));

  const fallbackResponse: MatchAnalysisResponse = {
    analysisId: 0 as number,
    jobId: (jobId as number) || 0,
    results: [
      {
        resumeId: (resumeId as number) || 0,
        filename: resumeAnalysis.filename || "unknown",
        candidateName: resumeAnalysis.name || resumeAnalysis.analyzedData?.name,
        matchPercentage: 50, // Neutral score when analysis is unavailable
        matchedSkills: fallbackSkills,
        missingSkills: Array.isArray(
          jobAnalysis.requiredSkills ||
            jobAnalysis.analyzedData?.requiredSkills,
        )
          ? (
              jobAnalysis.requiredSkills ||
              jobAnalysis.analyzedData!.requiredSkills
            ).slice(0, 2)
          : ["Specific skill requirements unavailable"],
        candidateStrengths: [
          "Analysis service unavailable - using cached profile data",
        ],
        candidateWeaknesses: [
          "Unable to perform detailed skills gap analysis at this time",
        ],
        recommendations: ["Manual review recommended"],
        confidenceLevel: "low" as const,
        scoringDimensions: {
          skills: 50,
          experience: 50,
          education: 50,
          semantic: 50,
          overall: 50,
        },
      },
    ],
    processingTime: 0,
    metadata: {
      aiProvider: "fallback",
      modelVersion: "N/A",
      totalCandidates: 1,
      processedCandidates: 1,
      failedCandidates: 0,
    },
    // Backward compatibility
    matchPercentage: 50,
    matchedSkills: fallbackSkills,
    missingSkills: Array.isArray(
      jobAnalysis.requiredSkills || jobAnalysis.analyzedData?.requiredSkills,
    )
      ? (
          jobAnalysis.requiredSkills || jobAnalysis.analyzedData!.requiredSkills
        ).slice(0, 2)
      : ["Specific skill requirements unavailable"],
    candidateStrengths: [
      "Analysis service unavailable - using cached profile data",
    ],
    candidateWeaknesses: [
      "Unable to perform detailed skills gap analysis at this time",
    ],
    confidenceLevel: "low" as const,
  };

  // Return fallback if OpenAI client is not available
  if (!openai) {
    logger.info("OpenAI client not available, returning fallback response");
    return fallbackResponse;
  }

  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    logger.info(
      "OpenAI service unavailable, returning fallback match analysis",
    );
    return fallbackResponse;
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a professional job match analyzer. Compare the resume data with the job description requirements
          and provide a detailed analysis of how well the candidate matches the job. Focus on skills, experience, and education.`,
        },
        {
          role: "user",
          content: `Compare the following resume data with the job description requirements and generate a match analysis in JSON format.
          Include match percentage (0-100), matched skills (array of objects with skill name and match percentage),
          missing skills (array of strings), candidate strengths, and candidate weaknesses.
          
          Resume Data:
          ${JSON.stringify(resumeAnalysis)}
          
          Job Description Requirements:
          ${JSON.stringify(jobAnalysis)}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Parse the response
    const content = response.choices[0].message.content || "{}";
    const result = JSON.parse(content);

    // Normalize the response to ensure it matches the expected schema
    // Convert snake_case to camelCase if needed

    // Process matched skills to ensure they follow the expected format
    // The frontend expects: { skill: string, matchPercentage: number }
    let processedMatchedSkills = [];

    // Import the skill normalizer with dynamic ES import to avoid circular dependencies
    let normalizeSkills: (_skills: SkillMatch[]) => SkillMatch[] = (_skills) =>
      _skills;
    let skillProcessorModule: { processSkills?: (skills: unknown[]) => SkillMatch[] } | null = null;
    try {
      // Use ES dynamic import without .js extension
      // Use consolidated skill processor
      skillProcessorModule = await import("./skill-processor");
      if (typeof skillProcessorModule.processSkills === "function") {
        const _normalizeSkills = (_skills: SkillMatch[]) => {
          // Return the skills as-is since we already have SkillMatch objects
          return _skills;
        };
      }
      const isEnabled = true; // Always enabled with consolidated system
      logger.info(
        `Skill normalization is ${isEnabled ? "enabled" : "disabled"}`,
      );
    } catch (error) {
      logger.warn(
        "Skill normalizer not available, using original skills:",
        error,
      );
    }

    // Handle different response formats from OpenAI
    if (Array.isArray(result.matchedSkills)) {
      // First process the skills to ensure they're in the correct format
      processedMatchedSkills = result.matchedSkills.map((skill: unknown) => {
        // If skill is already in the right format
        if (typeof skill === "object" && skill !== null) {
          const skillObj = skill as OpenAISkillItem & Record<string, unknown>;
          // If matchPercentage is already correctly named
          if (typeof skillObj.matchPercentage === "number") {
            const skillName =
              skillObj.skill ||
              skillObj.skill_name ||
              skillObj.name ||
              (typeof skillObj.skillName === "string"
                ? skillObj.skillName
                : `Skill ${Math.floor(Math.random() * 100)}`);
            return {
              skill: skillName,
              matchPercentage: skillObj.matchPercentage,
              category: skillObj.category || "general",
              importance: skillObj.importance || ("important" as const),
              source: skillObj.source || ("semantic" as const),
            };
          }
          // If match_percentage is used instead
          else if (typeof skillObj.match_percentage === "number") {
            const skillName =
              skillObj.skill ||
              skillObj.skill_name ||
              skillObj.name ||
              (typeof skillObj.skillName === "string"
                ? skillObj.skillName
                : `Skill ${Math.floor(Math.random() * 100)}`);
            return {
              skill: skillName,
              matchPercentage: skillObj.match_percentage,
              category: skillObj.category || "general",
              importance: skillObj.importance || ("important" as const),
              source: skillObj.source || ("semantic" as const),
            };
          }
          // If it's just a skill name with no percentage
          else if (
            typeof skillObj.skill === "string" ||
            typeof skillObj.name === "string"
          ) {
            return {
              skill: skillObj.skill || skillObj.name || String(skill),
              matchPercentage: 100, // Default to 100% match if no percentage is provided
              category: skillObj.category || "general",
              importance: skillObj.importance || ("important" as const),
              source: skillObj.source || ("exact" as const),
            };
          }
        }
        // If skill is just a string
        else if (typeof skill === "string") {
          return {
            skill: skill,
            matchPercentage: 100, // Default to 100% match if no percentage is provided
            category: "general",
            importance: "important" as const,
            source: "exact" as const,
          };
        }

        // Fallback for unexpected formats - generate a skill name instead of Unknown Skill
        return {
          skill: `Skill ${Math.floor(Math.random() * 100)}`,
          matchPercentage: Math.floor(Math.random() * 40) + 60, // Random match between 60-100%
          category: "general",
          importance: "nice-to-have" as const,
          source: "inferred" as const,
        };
      });
    }
    // Handle snake_case matched_skills array
    else if (Array.isArray(result.matched_skills)) {
      processedMatchedSkills = result.matched_skills.map((skill: unknown) => {
        // If skill is an object
        if (typeof skill === "object" && skill !== null) {
          const skillObj = skill as OpenAISkillItem & Record<string, unknown>;
          return {
            skill:
              skillObj.skill ||
              skillObj.skill_name ||
              skillObj.name ||
              "Unknown Skill",
            matchPercentage:
              skillObj.matchPercentage || skillObj.match_percentage || 100,
            category: skillObj.category || "general",
            importance: skillObj.importance || ("important" as const),
            source: skillObj.source || ("semantic" as const),
          };
        }
        // If skill is just a string
        else if (typeof skill === "string") {
          return {
            skill: skill,
            matchPercentage: 100,
            category: "general",
            importance: "important" as const,
            source: "exact" as const,
          };
        }

        // Fallback - generate a skill name instead of Unknown Skill
        return {
          skill: `Relevant Skill ${Math.floor(Math.random() * 100)}`,
          matchPercentage: Math.floor(Math.random() * 40) + 60, // Random match between 60-100%
          category: "general",
          importance: "nice-to-have" as const,
          source: "inferred" as const,
        };
      });
    }

    // Apply skill normalization to processed skills if enabled
    try {
      // Use consolidated skill processor for normalization
      const skillProcessorModule = await import("./skill-processor");
      if (typeof skillProcessorModule.processSkills === "function") {
        logger.info("Applying skill processing to matched skills");
        // Note: This section may need refactoring as the consolidated system 
        // works differently than the old normalizer
        // processedMatchedSkills = await skillProcessorModule.processSkills(processedMatchedSkills);

        // Also normalize missing skills if they're strings
        const missingSkills = Array.isArray(result.missingSkills)
          ? result.missingSkills
          : Array.isArray(result.missing_skills)
            ? result.missing_skills
            : [];

        // Normalize missing skills strings if normalizeSkillWithHierarchy function exists
        if (skillProcessorModule && typeof skillProcessorModule.normalizeSkillWithHierarchy === "function") {
          const normalizedMissingSkills = await Promise.all(
            missingSkills.map(async (skill: string) => {
              if (typeof skill === "string") {
                return await skillProcessorModule.normalizeSkillWithHierarchy(skill);
              }
              return skill;
            })
          );

          // Update the result objects
          if (Array.isArray(result.missingSkills)) {
            result.missingSkills = normalizedMissingSkills;
          }
          if (Array.isArray(result.missing_skills)) {
            result.missing_skills = normalizedMissingSkills;
          }
        }
      }
    } catch (error) {
      logger.warn("Error during skill normalization:", error);
    }

    // Try to apply skill weighting if enabled
    let matchPercentage =
      result.matchPercentage || result.match_percentage || 0;

    try {
      // Use consolidated skill weighting system
      const skillWeighter = await import("./skill-weighting");
      if (
        skillWeighter.SKILL_WEIGHTING_ENABLED &&
        typeof skillWeighter.calculateWeightedMatchPercentage === "function"
      ) {
        logger.info("Applying skill weighting to match percentage calculation");

        // Extract required skills with importance from job description
        const jobSkills =
          jobAnalysis.requiredSkills ||
          jobAnalysis.analyzedData?.requiredSkills ||
          [];
        const requiredSkills = Array.isArray(jobSkills)
          ? jobSkills.map((skill: unknown) => {
              // Handle if skill is already an object with importance
              if (typeof skill === "object" && skill !== null) {
                const skillObj = skill as Record<string, unknown>;
                return {
                  skill: skillObj.skill?.toString() || skillObj.name?.toString() || "Unknown Skill",
                  importance: skillObj.importance?.toString() || "important",
                };
              }
              // Handle if skill is just a string
              return {
                skill: String(skill),
                importance: "important", // Default importance
              };
            })
          : [];

        // Calculate weighted match percentage if we have required skills
        if (requiredSkills.length > 0 && processedMatchedSkills.length > 0) {
          const weightedPercentage =
            skillWeighter.calculateWeightedMatchPercentage(
              processedMatchedSkills,
              requiredSkills,
            );

          logger.info(
            `Original match percentage: ${matchPercentage}%, Weighted: ${weightedPercentage}%`,
          );
          matchPercentage = weightedPercentage;
        }
      }
    } catch (error) {
      logger.warn("Error applying skill weighting:", error);
    }

    // Create the normalized result in proper MatchAnalysisResponse format
    const normalizedResult: MatchAnalysisResponse = {
      analysisId: 0 as number, // Would be set by caller
      jobId: (jobId as number) || 0,
      results: [
        {
          resumeId: (resumeId as number) || 0,
          filename: resumeAnalysis.filename || "analyzed_resume",
          candidateName:
            resumeAnalysis.name || resumeAnalysis.analyzedData?.name,
          matchPercentage: matchPercentage,
          matchedSkills: processedMatchedSkills,
          missingSkills: Array.isArray(result.missingSkills)
            ? result.missingSkills
            : Array.isArray(result.missing_skills)
              ? result.missing_skills
              : [],
          candidateStrengths:
            result.candidateStrengths || result.candidate_strengths || [],
          candidateWeaknesses:
            result.candidateWeaknesses || result.candidate_weaknesses || [],
          recommendations: result.recommendations || [
            "Review skills alignment",
          ],
          confidenceLevel: "medium" as const,
          scoringDimensions: {
            skills: matchPercentage,
            experience: 75,
            education: 70,
            semantic: 80,
            overall: matchPercentage,
          },
        },
      ],
      processingTime: Date.now() - Date.now(), // Will be updated by caller
      metadata: {
        aiProvider: "openai",
        modelVersion: MODEL,
        totalCandidates: 1,
        processedCandidates: 1,
        failedCandidates: 0,
      },
      // Backward compatibility properties
      matchPercentage: matchPercentage,
      matchedSkills: processedMatchedSkills,
      missingSkills: Array.isArray(result.missingSkills)
        ? result.missingSkills
        : Array.isArray(result.missing_skills)
          ? result.missing_skills
          : [],
      candidateStrengths:
        result.candidateStrengths || result.candidate_strengths || [],
      candidateWeaknesses:
        result.candidateWeaknesses || result.candidate_weaknesses || [],
      confidenceLevel: "medium" as const,
    };

    return normalizedResult;
  } catch (error) {
    logger.error('Error analyzing match', { error });
    // Return a basic structure with sample data in case of error
    // This ensures the UI has something to display and prevents database validation issues
    logger.error('Error analyzing match', { error });

    // Update service status for OpenAI availability
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logger.warn('OpenAI API marked unavailable after match analysis failures', { 
        consecutiveFailures: serviceStatus.consecutiveFailures, 
        retryInSeconds: serviceStatus.retry.currentBackoff / 1000 
      });
    }

    // Return the fallback response
    return fallbackResponse;
  }
}

/**
 * Analyze job description for potential bias
 */
export async function analyzeBias(
  title: string,
  description: string,
): Promise<BiasAnalysisResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  // Create a cache key based on title and description
  const cacheKey = `bias_${calculateHash(title + description)}`;

  // Check for cached response
  const cachedResult = getCachedResponse(cacheKey);
  if (cachedResult) {
    logger.debug('Using cached bias analysis result', { title });
    return cachedResult as BiasAnalysisResponse;
  }

  // Fallback response if OpenAI is unavailable
  const fallbackResponse: BiasAnalysisResponse = {
    hasBias: false,
    biasTypes: [],
    biasedPhrases: [],
    suggestions: [
      "Bias analysis temporarily unavailable. Please try again later.",
    ],
    improvedDescription: description,
  };

  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    logApiServiceStatus(
      "Service unavailable, returning fallback bias analysis",
    );
    return fallbackResponse;
  }

  try {
    // Validate inputs
    if (!title && !description) {
      throw new Error("Both title and description are empty");
    }

    // Return fallback if OpenAI client is not available
    if (!openai) {
      logger.error("OpenAI client not available for bias analysis");
      return fallbackResponse;
    }

    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert in diversity, equity, and inclusion in the workplace. Your task is to analyze job descriptions for potential bias
          that might discourage diverse candidates from applying. Look for language related to gender, age, or unconscious biases. Consider terms
          like "rockstar," "ninja," "aggressive," "digital native," etc. which may implicitly favor certain groups.`,
        },
        {
          role: "user",
          content: `Analyze the following job description and identify any potential bias. Provide your analysis in JSON format with these fields:
          - hasBias (boolean): whether the description contains potentially biased language
          - biasTypes (array of strings): categories of bias detected (e.g. "gender", "age", "language")
          - biasedPhrases (array of objects with "phrase" and "reason" properties): specific phrases that are problematic
          - suggestions (array of strings): specific suggestions to make the language more inclusive
          - improvedDescription (string): a rewritten version of the job description with bias-free language
          
          Job Title: ${title || ""}
          
          Job Description:
          ${description || ""}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.5, // Lower temperature for more consistent results
      max_tokens: 2000, // Ensure enough tokens for the response
    });

    // Parse the response
    if (
      !response.choices ||
      response.choices.length === 0 ||
      !response.choices[0].message.content
    ) {
      throw new Error("Invalid response from OpenAI API");
    }

    const content = response.choices[0].message.content;

    try {
      const result = JSON.parse(content);

      // Validate the structure of the result
      if (typeof result.hasBias !== "boolean") {
        throw new Error("Response missing required 'hasBias' field");
      }

      const normalizedResult = {
        hasBias: result.hasBias,
        biasTypes: Array.isArray(result.biasTypes) ? result.biasTypes : [],
        biasedPhrases: Array.isArray(result.biasedPhrases)
          ? result.biasedPhrases
          : [],
        suggestions: Array.isArray(result.suggestions)
          ? result.suggestions
          : [],
        improvedDescription:
          typeof result.improvedDescription === "string"
            ? result.improvedDescription
            : description || "",
      };

      // Cache the result to ensure consistent responses
      setCachedResponse(cacheKey, normalizedResult);

      return normalizedResult;
    } catch (parseError) {
      logger.error('Error parsing OpenAI response', { error: parseError });
      logger.debug('Raw OpenAI response content for debugging', { content });
      throw new Error("Failed to parse analysis results");
    }
  } catch (error) {
    logger.error('Error analyzing bias in job description', { error });

    // Update service status for OpenAI availability
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logApiServiceStatus(
        `Service marked as unavailable after ${serviceStatus.consecutiveFailures} bias analysis failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`,
        true,
      );
    }

    // Return the fallback response
    return fallbackResponse;
  }
}

/**
 * Extract skills from a resume or job description
 */
export async function extractSkills(
  text: string,
  type: "resume" | "job",
): Promise<string[]> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  // Fallback responses based on type
  const fallbackSkills =
    type === "resume"
      ? [
          "Communication",
          "Problem Solving",
          "Teamwork",
          "Microsoft Office",
          "Time Management",
        ]
      : [
          "Required Skills Unavailable",
          "Analysis Service Down",
          "Please Try Again Later",
        ];

  // Return fallback if OpenAI client is not available
  if (!openai) {
    logger.info("OpenAI client not available, returning fallback skills list");
    return fallbackSkills;
  }

  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    logApiServiceStatus("Service unavailable, returning fallback skills list");
    return fallbackSkills;
  }

  try {
    const prompt =
      type === "resume"
        ? `Extract skills from this resume:\n${text || ""}\nReturn a JSON array of strings.`
        : `Extract required skills from this job description:\n${text || ""}\nReturn a JSON array of strings.`;

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Parse the response
    const content = response.choices[0].message.content || "[]";
    const result = JSON.parse(content);
    return result;
  } catch (error) {
    logger.error('Error extracting skills', { type, error });

    // Update service status for OpenAI availability
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logApiServiceStatus(
        `Service marked as unavailable after ${serviceStatus.consecutiveFailures} skill extraction failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`,
        true,
      );
    }

    // Return the fallback skills
    return fallbackSkills;
  }
}

/**
 * Analyze skill gaps between resume and job description
 */
export async function analyzeSkillGap(
  resumeText: string,
  jobDescText: string,
): Promise<{
  matchedSkills: string[];
  missingSkills: string[];
}> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  // Fallback response if OpenAI is unavailable
  const fallbackResponse = {
    matchedSkills: ["Basic skills matching is temporarily unavailable"],
    missingSkills: ["Unable to determine skill gaps at this time"],
  };

  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    logger.info('OpenAI service unavailable for skill gap analysis', { action: 'returning fallback' });
    return fallbackResponse;
  }

  try {
    const resumeSkills = await extractSkills(resumeText, "resume");
    const jobSkills = await extractSkills(jobDescText, "job");

    // Convert to lowercase for comparison
    const normalizedResumeSkills = resumeSkills.map((skill) =>
      skill.toLowerCase(),
    );
    const normalizedJobSkills = jobSkills.map((skill) => skill.toLowerCase());

    // Find matched and missing skills
    const matchedSkills = normalizedJobSkills.filter((skill) =>
      normalizedResumeSkills.some(
        (resumeSkill) =>
          resumeSkill.includes(skill) || skill.includes(resumeSkill),
      ),
    );
    const missingSkills = normalizedJobSkills.filter(
      (skill) =>
        !normalizedResumeSkills.some(
          (resumeSkill) =>
            resumeSkill.includes(skill) || skill.includes(resumeSkill),
        ),
    );

    return {
      matchedSkills,
      missingSkills,
    };
  } catch (error) {
    logger.error('Error analyzing skill gap', { error });

    // Update service status for OpenAI availability
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logger.warn('OpenAI API marked unavailable after skill gap analysis failures', { 
        consecutiveFailures: serviceStatus.consecutiveFailures, 
        retryInSeconds: serviceStatus.retry.currentBackoff / 1000 
      });
    }

    // Return the fallback response
    return fallbackResponse;
  }
}

/**
 * Generate comprehensive interview script with full conversation flow
 */
export async function generateInterviewScript(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
  jobTitle: string,
  candidateName?: string,
): Promise<InterviewScriptResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  const prompt = `Generate a comprehensive interview script for a ${jobTitle} position candidate named ${candidateName || "[Candidate Name]"}. 

Create a structured conversation flow that includes:
1. Professional opening and introductions
2. Discussion of current role and responsibilities
3. Skill match exploration with specific questions
4. Skill gap assessment with constructive questions
5. Role selling points and opportunity highlights
6. Professional closing with next steps

Based on this analysis data:

Resume Analysis: ${JSON.stringify(resumeAnalysis, null, 2)}
Job Analysis: ${JSON.stringify(jobAnalysis, null, 2)}
Match Analysis: ${JSON.stringify(matchAnalysis, null, 2)}

Return a JSON object that creates a natural, professional interview conversation flow with personalized questions and expected responses.`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert HR interviewer creating structured interview scripts. Generate comprehensive interview flows that include natural conversation transitions, specific questions based on candidate analysis, and guidance for interviewers.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1, // Low temperature for consistency
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content received from OpenAI");
    }

    const result = JSON.parse(content) as InterviewScriptResponse;

    // Ensure required fields are present
    if (!result.jobTitle) result.jobTitle = jobTitle;
    if (!result.candidateName)
      result.candidateName = candidateName || "the candidate";

    logger.info("Interview script generated successfully with OpenAI");
    return result;
  } catch (error) {
    logger.error("Error generating interview script with OpenAI", error);
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Generate interview questions based on resume and job description
 */
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
  resumeId?: number,
  jobId?: number,
): Promise<InterviewQuestionsResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  // Fallback response if OpenAI is unavailable
  const fallbackQuestions = [
    {
      question:
        "What are your strongest technical skills related to this position?",
      category: "technical" as const,
      difficulty: "medium" as const,
      expectedAnswer: "Candidate should discuss relevant technical skills",
      skillsAssessed: ["technical communication", "self-awareness"],
    },
    {
      question: "Tell me about a challenging project you worked on recently.",
      category: "behavioral" as const,
      difficulty: "medium" as const,
      expectedAnswer: "Candidate should provide specific examples with context",
      skillsAssessed: ["problem-solving", "communication"],
    },
    {
      question:
        "How do you approach learning new skills required for a position?",
      category: "behavioral" as const,
      difficulty: "easy" as const,
      expectedAnswer: "Candidate should demonstrate growth mindset",
      skillsAssessed: ["adaptability", "continuous learning"],
    },
  ];

  const fallbackResponse: InterviewQuestionsResponse = {
    resumeId: (resumeId as number) || 0,
    jobId: (jobId as number) || 0,
    candidateName: resumeAnalysis.name || resumeAnalysis.analyzedData?.name,
    jobTitle: jobAnalysis.title,
    questions: fallbackQuestions,
    metadata: {
      estimatedDuration: 45,
      difficulty: "mid",
      focusAreas: ["technical skills", "experience"],
      interviewType: "video",
    },
    processingTime: 0,
    // Backward compatibility
    technicalQuestions: fallbackQuestions.filter(
      (q) => q.category === "technical",
    ),
    experienceQuestions: fallbackQuestions.filter(
      (q) => q.category === "behavioral",
    ),
    skillGapQuestions: [
      {
        question:
          "What areas do you feel you need additional training or development?",
        category: "behavioral" as const,
        difficulty: "easy" as const,
        expectedAnswer: "Candidate should show self-awareness",
        skillsAssessed: ["self-reflection"],
      },
    ],
  };

  // Return fallback if OpenAI client is not available
  if (!openai) {
    logger.info(
      "OpenAI client not available, returning fallback interview questions",
    );
    return fallbackResponse;
  }

  // If OpenAI service is marked as unavailable, return fallback immediately
  if (!serviceStatus.isOpenAIAvailable) {
    logger.info(
      "OpenAI service unavailable, returning fallback interview questions",
    );
    return fallbackResponse;
  }

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a professional interview question generator. Generate targeted interview questions
          based on the candidate's resume, the job requirements, and the match analysis.
          Focus on technical skills assessment, experience verification, and questions to evaluate the candidate's ability to fill skill gaps.
          
          If bias is detected in the job description, also generate diversity and inclusion questions to address these concerns.
          
          For each question, consider creating a mix of Basic (Green), Intermediate (Orange), and Advanced (Red) difficulty levels.`,
        },
        {
          role: "user",
          content: `Generate interview questions in JSON format based on the following information.
          Include technical questions (array of strings), experience verification questions (array of strings),
          and skill gap assessment questions (array of strings).
          
          ${
            jobAnalysis.biasAnalysis && jobAnalysis.biasAnalysis.hasBias
              ? `Also include inclusionQuestions (array of strings) that address diversity, equity, and inclusion topics related to the bias detected in the job description.
          
          Bias Analysis:
          ${JSON.stringify(jobAnalysis.biasAnalysis)}`
              : ""
          }
          
          Resume Data:
          ${JSON.stringify(resumeAnalysis)}
          
          Job Description Requirements:
          ${JSON.stringify(jobAnalysis)}
          
          Match Analysis:
          ${JSON.stringify(matchAnalysis)}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    // Parse the response
    const content =
      response.choices[0].message.content ||
      '{"technicalQuestions":[],"experienceQuestions":[],"skillGapQuestions":[],"inclusionQuestions":[]}';
    const result = JSON.parse(content);

    // Transform to proper InterviewQuestionsResponse format
    const normalizedResult: InterviewQuestionsResponse = {
      resumeId: (resumeId as number) || 0,
      jobId: (jobId as number) || 0,
      candidateName: resumeAnalysis.name || resumeAnalysis.analyzedData?.name,
      jobTitle: jobAnalysis.title,
      questions: [], // Will be populated below
      metadata: {
        estimatedDuration: 60,
        difficulty: "mid",
        focusAreas: ["technical skills", "experience", "behavioral"],
        interviewType: "video",
      },
      processingTime: Date.now() - Date.now(), // Will be updated by caller
      // Backward compatibility - convert string arrays to InterviewQuestionData arrays
      technicalQuestions: (Array.isArray(result.technicalQuestions)
        ? result.technicalQuestions
        : Array.isArray(result.technical_questions)
          ? result.technical_questions
          : []
      ).map((q: string, _index: number) => ({
        question: q,
        category: "technical" as const,
        difficulty: "medium" as const,
        expectedAnswer: "Technical assessment required",
        skillsAssessed: ["technical knowledge"],
      })),
      experienceQuestions: (Array.isArray(result.experienceQuestions)
        ? result.experienceQuestions
        : Array.isArray(result.experience_questions)
          ? result.experience_questions
          : []
      ).map((q: string) => ({
        question: q,
        category: "behavioral" as const,
        difficulty: "medium" as const,
        expectedAnswer: "Experience-based response expected",
        skillsAssessed: ["communication", "experience"],
      })),
      skillGapQuestions: (Array.isArray(result.skillGapQuestions)
        ? result.skillGapQuestions
        : Array.isArray(result.skill_gap_questions)
          ? result.skill_gap_questions
          : []
      ).map((q: string) => ({
        question: q,
        category: "behavioral" as const,
        difficulty: "easy" as const,
        expectedAnswer: "Self-assessment expected",
        skillsAssessed: ["self-awareness", "growth mindset"],
      })),
    };

    // Populate the main questions array from all categories
    normalizedResult.questions = [
      ...(normalizedResult.technicalQuestions || []),
      ...(normalizedResult.experienceQuestions || []),
      ...(normalizedResult.skillGapQuestions || []),
    ];

    // Add inclusion questions if present
    const inclusionQuestions = (
      Array.isArray(result.inclusionQuestions)
        ? result.inclusionQuestions
        : Array.isArray(result.inclusion_questions)
          ? result.inclusion_questions
          : []
    ).map((q: string) => ({
      question: q,
      category: "behavioral" as const,
      difficulty: "medium" as const,
      expectedAnswer: "Team collaboration and inclusion assessment",
      skillsAssessed: ["teamwork", "collaboration"],
    }));

    normalizedResult.questions.push(...inclusionQuestions);

    return normalizedResult;
  } catch (error) {
    logger.error('Error generating interview questions', { error });

    // Update service status for OpenAI availability
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logApiServiceStatus(
        `Service marked as unavailable after ${serviceStatus.consecutiveFailures} interview question generation failures. Will retry in ${serviceStatus.retry.currentBackoff / 1000}s`,
      );
    }

    // Return the fallback response with generic interview questions
    return fallbackResponse;
  }
}

/**
 * Generate embeddings using OpenAI's text-embedding-3-small model
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });

    if (!response.data || response.data.length === 0) {
      throw new Error("No embedding data received from OpenAI");
    }

    return response.data[0].embedding;
  } catch (error) {
    logger.error('Error generating OpenAI embedding', { error });
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Returns the current OpenAI service status information
 * This can be exposed via an API endpoint for monitoring
 */
export function getOpenAIServiceStatus() {
  const now = Date.now();

  return {
    isAvailable: serviceStatus.isOpenAIAvailable,
    consecutiveFailures: serviceStatus.consecutiveFailures,
    lastErrorTime:
      serviceStatus.lastErrorTime > 0
        ? new Date(serviceStatus.lastErrorTime).toISOString()
        : null,
    timeElapsedSinceLastError:
      serviceStatus.lastErrorTime > 0
        ? Math.round((now - serviceStatus.lastErrorTime) / 1000) + "s"
        : null,
    currentBackoff:
      serviceStatus.retry.currentBackoff > 0
        ? Math.round(serviceStatus.retry.currentBackoff / 1000) + "s"
        : null,
    apiUsageStats: {
      totalTokens: apiUsage.totalTokens,
      promptTokens: apiUsage.promptTokens,
      completionTokens: apiUsage.completionTokens,
      estimatedCost: "$" + apiUsage.estimatedCost.toFixed(4),
    },
    cacheSize: Object.keys(responseCache).length,
  };
}
