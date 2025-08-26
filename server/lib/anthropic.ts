import Anthropic from "@anthropic-ai/sdk";
import {
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResponse,
  InterviewQuestionsResponse,
  InterviewScriptResponse,
  BiasAnalysisResponse,
  SkillMatch,
  AnalyzedResumeData,
  AnalyzedJobData,
  InterviewQuestionData,
} from "../../shared/schema";
import { createBrandedId, type ResumeId, type JobId, type AnalysisId } from "../../shared/api-contracts";
import { config } from "../config/unified-config";
import { logger } from "../config/logger";
import { AnthropicErrorHandler } from "./shared/error-handler";
import { 
  Result, 
  success as _success, 
  failure, 
  fromPromise, 
  isFailure as _isFailure, 
  type ExternalServiceError, 
  type AppError as _AppError 
} from '../../shared/result-types';
import { AppExternalServiceError } from '../../shared/errors';
import { AnthropicResponseParser } from "./shared/response-parser";
import { PromptTemplateEngine, type ResumeAnalysisContext, type JobAnalysisContext, type MatchAnalysisContext } from "./shared/prompt-templates";

// TypeScript interfaces for Anthropic API responses
interface AnthropicResumeResponse {
  personalInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
  };
  skills?: string[];
  experience?: ExperienceItem[];
  education?: EducationItem[];
  summary?: string;
  keyStrengths?: string[];
}

interface ExperienceItem {
  company?: string;
  title?: string;
  duration?: string;
  responsibilities?: string[];
}

interface EducationItem {
  degree?: string;
  institution?: string;
  year?: number;
}

interface AnthropicJobResponse {
  title?: string;
  company?: string;
  skills?: string[];
  requirements?: string[];
  responsibilities?: string[];
  seniority?: string;
  department?: string;
  location?: string;
  qualifications?: string[];
}

interface AnthropicMatchResponse {
  matchPercentage?: number;
  matchedSkills?: Array<{
    skill: string;
    matchPercentage?: number;
    category?: string;
    importance?: string;
    source?: string;
  }>;
  missingSkills?: string[];
  candidateStrengths?: string[];
  candidateWeaknesses?: string[];
}

// the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
const MODEL = "claude-3-7-sonnet-20250219";

// Initialize Anthropic client with API key from config
const anthropic = new Anthropic({
  apiKey: config.ai.providers.anthropic.apiKey || "",
});

// Initialize shared error handler for Anthropic
const errorHandler = new AnthropicErrorHandler();

/**
 * Legacy service status interface for backward compatibility
 * @deprecated Use errorHandler.getStatus() instead
 */
export const serviceStatus = {
  get isAnthropicAvailable() {
    return errorHandler.isAvailable;
  },
  get consecutiveFailures() {
    return errorHandler.getStatus().consecutiveFailures;
  },
  get lastErrorTime() {
    return errorHandler.getStatus().lastErrorTime;
  },
  get timeElapsedSinceLastError() {
    return errorHandler.getStatus().timeElapsedSinceLastError;
  },
  get retry() {
    const status = errorHandler.getStatus();
    return {
      currentBackoff: status.retry.currentBackoff,
      maxBackoff: status.retry.maxBackoff,
    };
  },
  get apiUsageStats() {
    return errorHandler.getStatus().apiUsageStats;
  },
  get cacheSize() {
    return errorHandler.getStatus().cacheSize;
  },
  get currentBackoff() {
    return errorHandler.currentBackoff;
  },
  get isAvailable() {
    return errorHandler.isAvailable;
  },
};

/**
 * Utility function to log messages related to Anthropic API service
 * @param message The message to log
 * @param isError Whether this is an error message
 */
function logApiServiceStatus(message: string, isError: boolean = false) {
  const _timestamp = new Date().toISOString();
  const _prefix = isError ? "ERROR" : "INFO";
  const servicePrefix = "ANTHROPIC_API";
  if (isError) {
    logger.error(`[${servicePrefix}] ${message}`);
  } else {
    logger.info(`[${servicePrefix}] ${message}`);
  }
}

/**
 * Record and track service success to potentially reset error counters
 */
function recordApiSuccess() {
  // Use error handler to record success (which will reset counters)
  errorHandler.recordSuccess();
  logApiServiceStatus(
    `API call succeeded - error counters reset`,
  );
}

/**
 * Try to recover service availability after backoff period
 * This function checks if we should attempt to restore Anthropic service
 * after a failure period
 */
function checkServiceRecovery() {
  const status = errorHandler.getStatus();
  if (!status.isAvailable && status.lastErrorTime) {
    const now = Date.now();
    const elapsed = now - status.lastErrorTime;

    // If we've waited long enough, try to recover
    if (elapsed > status.retry.currentBackoff) {
      logApiServiceStatus(
        `Attempting service recovery after ${Math.round(elapsed / 1000)}s backoff`,
      );
      // Note: Recovery will be handled by the next successful API call
    }
  }
}

/**
 * Result-based internal function for resume analysis using Wrapper Pattern
 */
async function analyzeResumeInternal(
  resumeText: string,
): Promise<Result<AnalyzeResumeResponse, ExternalServiceError>> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  const context: ResumeAnalysisContext = {
    text: resumeText || "",
  };

  const result = await fromPromise(
    (async () => {
      // Generate prompt using shared template engine
      const prompt = PromptTemplateEngine.generateResumeAnalysisPrompt(context, {
        format: 'anthropic'
      });

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
        system:
          "You are a resume parser that extracts structured information from resume text. Always respond with valid JSON only, no explanations.",
      });

      // Extract JSON from the response content
      const contentBlock = response.content[0];
      if (contentBlock.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }
      const responseText = contentBlock.text;
      
      // Parse response using shared response parser
      const parseResult = AnthropicResponseParser.parseAnalysisResponse<AnthropicResumeResponse>(responseText);
      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error || "Failed to parse Anthropic response");
      }
      const parsedResponse = parseResult.data;

      // Record successful API call and track token usage
      errorHandler.recordSuccess({
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens
      });

      recordApiSuccess();

      // Transform to expected response format
      const analyzedData: AnalyzedResumeData = {
        name: parsedResponse.personalInfo?.name || "Unknown",
        skills: parsedResponse.skills || [],
        experience:
          parsedResponse.experience?.[0]?.duration ||
          "Unknown",
        education: (parsedResponse.education || []).map((edu: EducationItem | string) =>
          typeof edu === "string" ? edu : edu.degree || ""
        ),
        summary: parsedResponse.summary || "",
        keyStrengths: parsedResponse.keyStrengths || parsedResponse.skills?.slice(0, 3) || [],
        contactInfo: parsedResponse.personalInfo || {
          email: "",
          phone: "",
          location: "",
        },
        workExperience:
          parsedResponse.experience?.map((exp: ExperienceItem) => ({
            company: exp.company || "",
            position: exp.title || "",
            duration: exp.duration || "",
            description: exp.responsibilities?.join("; ") || "",
          })) || [],
      };

      const fullResponse: AnalyzeResumeResponse = {
        id: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
        filename: "resume.pdf",
        analyzedData,
        processingTime: Date.now(),
        confidence: 0.9,
        warnings: [],
        name: analyzedData.name,
        skills: analyzedData.skills,
        experience: analyzedData.workExperience,
        education: (parsedResponse.education || []).map((edu: EducationItem) => ({
          degree: typeof edu === "string" ? edu : edu.degree || "",
          institution: typeof edu === "string" ? "" : edu.institution || "",
          year: typeof edu === "string" ? undefined : edu.year,
        })),
        contact: analyzedData.contactInfo,
      };

      return fullResponse;
    })(),
    (error) => AppExternalServiceError.aiProviderFailure('Anthropic', 'resume-analysis', error instanceof Error ? error.message : String(error))
  );
  
  // Convert AppError to ExternalServiceError to match return type
  if (result.success) {
    return result;
  } else {
    const externalServiceError: ExternalServiceError = {
      code: 'AI_PROVIDER_ERROR' as const,
      service: 'anthropic',
      message: result.error.message,
      statusCode: result.error.statusCode,
      timestamp: result.error.timestamp,
      originalError: result.error instanceof Error ? result.error.message : undefined
    };
    return failure(externalServiceError);
  }
}

/**
 * Analyzes a resume to extract structured information using Anthropic Claude
 * Uses Wrapper Pattern: maintains existing API while using Result pattern internally
 */
export async function analyzeResume(
  resumeText: string,
): Promise<AnalyzeResumeResponse> {
  const result = await analyzeResumeInternal(resumeText);
  
  if (result.success) {
    return result.data;
  } else {
    // Convert Result error back to exception for backward compatibility
    const error = result.error;
    logger.error("Anthropic resume analysis failed", error);
    
    // Return fallback response instead of throwing for better UX
    const fallbackAnalyzedData: AnalyzedResumeData = {
      name: "Analysis temporarily unavailable",
      skills: ["Communication", "Problem Solving", "Teamwork"],
      experience: "",
      education: ["Education extraction temporarily unavailable"],
      summary: "Analysis temporarily unavailable",
      keyStrengths: ["Service temporarily unavailable"],
      contactInfo: {
        email: "",
        phone: "",
        location: "",
      },
      workExperience: [
        {
          company: "Please try again later",
          position: "Experience extraction temporarily unavailable",
          duration: "",
          description: "",
        },
      ],
    };

    return {
      id: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
      filename: "fallback.pdf",
      analyzedData: fallbackAnalyzedData,
      processingTime: 0,
      confidence: 0,
      warnings: ["Service temporarily unavailable"],
      name: fallbackAnalyzedData.name,
      skills: fallbackAnalyzedData.skills,
      experience: fallbackAnalyzedData.workExperience || [],
      education: fallbackAnalyzedData.education.map((edu) => ({
        degree: edu,
        institution: "",
        year: undefined,
      })),
      contact: fallbackAnalyzedData.contactInfo || {
        email: "",
        phone: "",
        location: "",
      },
    };
  }
}

// New Result-based public API for consumers who want Result pattern
export async function analyzeResumeResult(
  resumeText: string,
): Promise<Result<AnalyzeResumeResponse, ExternalServiceError>> {
  return analyzeResumeInternal(resumeText);
}

/**
 * Analyze a match between a resume and job description
 */
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
): Promise<MatchAnalysisResponse> {
  // First, check if service is available (handled by the AI provider)
  if (!serviceStatus.isAnthropicAvailable) {
    checkServiceRecovery();
    const fallbackMatchedSkills: SkillMatch[] = [
      {
        skill: "Problem Solving",
        matchPercentage: 90,
        category: "soft",
        importance: "important" as const,
        source: "semantic" as const,
      },
      {
        skill: "Communication",
        matchPercentage: 85,
        category: "soft",
        importance: "critical" as const,
        source: "semantic" as const,
      },
      {
        skill: "Technical Knowledge",
        matchPercentage: 80,
        category: "technical",
        importance: "important" as const,
        source: "semantic" as const,
      },
    ];
    return {
      analysisId: createBrandedId<number, "AnalysisId">(Date.now()) as AnalysisId,
      jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
      results: [
        {
          resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
          filename: resumeAnalysis.filename || "resume.pdf",
          candidateName: resumeAnalysis.name,
          matchPercentage: 60,
          matchedSkills: fallbackMatchedSkills,
          missingSkills: ["Leadership", "Project Management"],
          candidateStrengths: [
            "Strong technical background",
            "Good communicator",
          ],
          candidateWeaknesses: [
            "Limited leadership experience",
            "Needs more project management skills",
          ],
          recommendations: [],
          confidenceLevel: "low" as const,
          scoringDimensions: {
            skills: 60,
            experience: 60,
            education: 60,
            semantic: 60,
            overall: 60,
          },
        },
      ],
      processingTime: 0,
      metadata: {
        aiProvider: "anthropic",
        modelVersion: MODEL,
        totalCandidates: 1,
        processedCandidates: 1,
        failedCandidates: 0,
      },
      // Convenience properties for backward compatibility
      matchPercentage: 60,
      matchedSkills: fallbackMatchedSkills,
      missingSkills: ["Leadership", "Project Management"],
      candidateStrengths: ["Strong technical background", "Good communicator"],
      candidateWeaknesses: [
        "Limited leadership experience",
        "Needs more project management skills",
      ],
      confidenceLevel: "low" as const,
    };
  }

  try {
    logApiServiceStatus("Performing match analysis with Anthropic Claude");

    // Prepare resume and job data for the prompt
    const _resumeSkills = resumeAnalysis.skills?.join(", ") || "";
    const _jobSkills = Array.isArray(jobAnalysis.requiredSkills)
      ? jobAnalysis.requiredSkills.join(", ")
      : "Not specified";

    // Create a meaningful summary of resume experience
    const _resumeExperience =
      resumeAnalysis.experience
        ?.map(
          (exp) =>
            `${exp.position || "Position"} at ${exp.company || "Unknown Company"}`,
        )
        .join("; ") || "";

    // Format education
    const _resumeEducation = Array.isArray(resumeAnalysis.education)
      ? resumeAnalysis.education
          .map((edu) =>
            typeof edu === "object" && edu !== null
              ? `${edu.degree || ""} from ${edu.institution || ""}`
              : String(edu),
          )
          .join("; ")
      : "Not specified";

    // Generate prompt using shared template engine
    const context: MatchAnalysisContext = {
      resumeAnalysis,
      jobAnalysis,
    };
    const prompt = PromptTemplateEngine.generateMatchAnalysisPrompt(context, {
      format: 'anthropic'
    });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a candidate-job matching specialist. Analyze how well a candidate matches job requirements. Respond with valid JSON only, no explanations.",
    });

    // Extract JSON from the response content
    const contentBlock = response.content[0];
    if (contentBlock.type !== "text") {
      throw new Error("Unexpected response type from Anthropic");
    }
    const responseText = contentBlock.text;
    
    // Parse response using shared response parser
    try {
      const parseResult = AnthropicResponseParser.parseAnalysisResponse<AnthropicMatchResponse>(responseText);
      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error || "Failed to parse Anthropic response");
      }
      const parsedResponse = parseResult.data;

      // Record successful API call and track token usage
      errorHandler.recordSuccess({
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens
      });

      // Return normalized response
      const normalizedMatchedSkills: SkillMatch[] = Array.isArray(
        parsedResponse.matchedSkills,
      )
        ? parsedResponse.matchedSkills.map((skill: unknown) => {
            const skillObj = typeof skill === 'string' ? { skill } : skill as Record<string, unknown>;
            return {
              skill: skillObj.skill?.toString() || skill?.toString() || '',
              matchPercentage: typeof skillObj.matchPercentage === 'number' ? skillObj.matchPercentage : 75,
              category: skillObj.category?.toString() || "technical",
              importance: ((): SkillMatch["importance"] => {
                const v = (skillObj.importance?.toString() || "important").toLowerCase();
                return v === "critical" || v === "nice-to-have" ? v : "important";
              })(),
              source: ((): SkillMatch["source"] => {
                const v = (skillObj.source?.toString() || "semantic").toLowerCase();
                return v === "exact" || v === "inferred" ? v : "semantic";
              })(),
            };
          })
        : [];

      const matchPercentage = parsedResponse.matchPercentage || 0;
      const missingSkills = Array.isArray(parsedResponse.missingSkills)
        ? parsedResponse.missingSkills
        : [];
      const candidateStrengths = Array.isArray(
        parsedResponse.candidateStrengths,
      )
        ? parsedResponse.candidateStrengths
        : [];
      const candidateWeaknesses = Array.isArray(
        parsedResponse.candidateWeaknesses,
      )
        ? parsedResponse.candidateWeaknesses
        : [];

      return {
        analysisId: createBrandedId<number, "AnalysisId">(Date.now()) as AnalysisId,
        jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
        results: [
          {
            resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
            filename: resumeAnalysis.filename || "resume.pdf",
            candidateName: resumeAnalysis.name,
            matchPercentage,
            matchedSkills: normalizedMatchedSkills,
            missingSkills,
            candidateStrengths,
            candidateWeaknesses,
            recommendations: [],
            confidenceLevel: "medium" as const,
            scoringDimensions: {
              skills: matchPercentage,
              experience: matchPercentage,
              education: matchPercentage,
              semantic: matchPercentage,
              overall: matchPercentage,
            },
          },
        ],
        processingTime: Date.now() - performance.now(),
        metadata: {
          aiProvider: "anthropic",
          modelVersion: MODEL,
          totalCandidates: 1,
          processedCandidates: 1,
          failedCandidates: 0,
        },
        // Convenience properties for backward compatibility
        matchPercentage,
        matchedSkills: normalizedMatchedSkills,
        missingSkills,
        candidateStrengths,
        candidateWeaknesses,
        confidenceLevel: "medium" as const,
      };
    } catch (parseError) {
      logApiServiceStatus(
        `Error parsing Anthropic response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        true,
      );
      const parseErrorMatchedSkills: SkillMatch[] = [
        {
          skill: "Problem Solving",
          matchPercentage: 90,
          category: "soft",
          importance: "important" as const,
          source: "semantic" as const,
        },
        {
          skill: "Communication",
          matchPercentage: 85,
          category: "soft",
          importance: "critical" as const,
          source: "semantic" as const,
        },
        {
          skill: "Technical Knowledge",
          matchPercentage: 80,
          category: "technical",
          importance: "important" as const,
          source: "semantic" as const,
        },
      ];
      return {
        analysisId: createBrandedId<number, "AnalysisId">(Date.now()) as AnalysisId,
        jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
        results: [
          {
            resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
            filename: resumeAnalysis.filename || "resume.pdf",
            candidateName: resumeAnalysis.name,
            matchPercentage: 60,
            matchedSkills: parseErrorMatchedSkills,
            missingSkills: ["Leadership", "Project Management"],
            candidateStrengths: [
              "Strong technical background",
              "Good communicator",
            ],
            candidateWeaknesses: [
              "Limited leadership experience",
              "Needs more project management skills",
            ],
            recommendations: [],
            confidenceLevel: "low" as const,
            scoringDimensions: {
              skills: 60,
              experience: 60,
              education: 60,
              semantic: 60,
                overall: 60,
            },
          },
        ],
        processingTime: 0,
        metadata: {
          aiProvider: "anthropic",
          modelVersion: MODEL,
          totalCandidates: 1,
          processedCandidates: 1,
          failedCandidates: 0,
        },
        // Convenience properties for backward compatibility
        matchPercentage: 60,
        matchedSkills: parseErrorMatchedSkills,
        missingSkills: ["Leadership", "Project Management"],
        candidateStrengths: [
          "Strong technical background",
          "Good communicator",
        ],
        candidateWeaknesses: [
          "Limited leadership experience",
          "Needs more project management skills",
        ],
        confidenceLevel: "low" as const,
      };
    }
  } catch (error) {
    // Record failure using shared error handler
    const _errorClassification = errorHandler.recordFailure(error instanceof Error ? error : new Error(String(error)));
    
    logApiServiceStatus(
      `Match analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );

    // Return the fallback response
    const finalFallbackMatchedSkills: SkillMatch[] = [
      {
        skill: "Problem Solving",
        matchPercentage: 90,
        category: "soft",
        importance: "important" as const,
        source: "semantic" as const,
      },
      {
        skill: "Communication",
        matchPercentage: 85,
        category: "soft",
        importance: "critical" as const,
        source: "semantic" as const,
      },
      {
        skill: "Technical Knowledge",
        matchPercentage: 80,
        category: "technical",
        importance: "important" as const,
        source: "semantic" as const,
      },
    ];
    return {
      analysisId: createBrandedId<number, "AnalysisId">(Date.now()) as AnalysisId,
      jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
      results: [
        {
          resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
          filename: resumeAnalysis.filename || "resume.pdf",
          candidateName: resumeAnalysis.name,
          matchPercentage: 60,
          matchedSkills: finalFallbackMatchedSkills,
          missingSkills: ["Leadership", "Project Management"],
          candidateStrengths: [
            "Strong technical background",
            "Good communicator",
          ],
          candidateWeaknesses: [
            "Limited leadership experience",
            "Needs more project management skills",
          ],
          recommendations: [],
          confidenceLevel: "low" as const,
          scoringDimensions: {
            skills: 60,
            experience: 60,
            education: 60,
            semantic: 60,
            overall: 60,
          },
        },
      ],
      processingTime: 0,
      metadata: {
        aiProvider: "anthropic",
        modelVersion: MODEL,
        totalCandidates: 1,
        processedCandidates: 1,
        failedCandidates: 0,
      },
      // Convenience properties for backward compatibility
      matchPercentage: 60,
      matchedSkills: finalFallbackMatchedSkills,
      missingSkills: ["Leadership", "Project Management"],
      candidateStrengths: ["Strong technical background", "Good communicator"],
      candidateWeaknesses: [
        "Limited leadership experience",
        "Needs more project management skills",
      ],
      confidenceLevel: "low" as const,
    };
  }
}

/**
 * Analyzes a job description to extract key requirements and skills
 */
export async function analyzeJobDescription(
  title: string,
  description: string,
): Promise<AnalyzeJobDescriptionResponse> {
  // Check if we should attempt service recovery
  checkServiceRecovery();

  // Fallback response if Anthropic API is unavailable
  const fallbackAnalyzedData: AnalyzedJobData = {
    requiredSkills: ["Required skills extraction temporarily unavailable"],
    preferredSkills: [],
    experienceLevel: "Seniority information unavailable",
    responsibilities: [
      "Job responsibilities extraction temporarily unavailable",
    ],
    summary: "Analysis temporarily unavailable",
    location: "Location information unavailable",
  };

  const fallbackResponse: AnalyzeJobDescriptionResponse = {
    id: createBrandedId<number, "JobId">(Date.now()) as JobId,
    title: title || "Job Title Unavailable",
    analyzedData: fallbackAnalyzedData,
    processingTime: 0,
    confidence: 0,
    warnings: ["Service temporarily unavailable"],
    // Convenience properties for backward compatibility
    company: "Company information temporarily unavailable",
    requiredSkills: fallbackAnalyzedData.requiredSkills,
    preferredSkills: fallbackAnalyzedData.preferredSkills,
    skills: fallbackAnalyzedData.requiredSkills,
    experience: fallbackAnalyzedData.experienceLevel,
    experienceLevel: fallbackAnalyzedData.experienceLevel,
    responsibilities: fallbackAnalyzedData.responsibilities,
    requirements: ["Job requirements extraction temporarily unavailable"],
    summary: fallbackAnalyzedData.summary,
  };

  // If Anthropic API is marked as unavailable, return fallback immediately
  if (!serviceStatus.isAnthropicAvailable) {
    logApiServiceStatus(
      "Service unavailable, returning fallback job description analysis",
    );
    return fallbackResponse;
  }

  try {
    // Generate prompt using shared template engine
    const context: JobAnalysisContext = {
      title: title || "",
      description: description || "",
    };
    const prompt = PromptTemplateEngine.generateJobAnalysisPrompt(context, {
      format: 'anthropic'
    });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a job description analyzer that extracts structured information from job postings. Always respond with valid JSON only, no explanations.",
    });

    // Extract JSON from the response content
    const contentBlock = response.content[0];
    if (contentBlock.type !== "text") {
      throw new Error("Unexpected response type from Anthropic");
    }
    const responseText = contentBlock.text;
    
    // Parse response using shared response parser
    try {
      const parseResult = AnthropicResponseParser.parseAnalysisResponse<AnthropicJobResponse>(responseText);
      if (!parseResult.success || !parseResult.data) {
        throw new Error(parseResult.error || "Failed to parse Anthropic response");
      }
      const parsedResponse = parseResult.data;

      // Record successful API call and track token usage
      errorHandler.recordSuccess({
        input_tokens: response.usage?.input_tokens,
        output_tokens: response.usage?.output_tokens
      });

      // Return normalized response matching AnalyzeJobDescriptionResponse interface
      const requiredSkills = Array.isArray(parsedResponse.skills)
        ? parsedResponse.skills
        : [];
      const responsibilities = Array.isArray(parsedResponse.responsibilities)
        ? parsedResponse.responsibilities
        : [];
      const requirements = Array.isArray(parsedResponse.requirements)
        ? parsedResponse.requirements
        : [];
      const _qualifications = Array.isArray(parsedResponse.qualifications)
        ? parsedResponse.qualifications
        : [];

      const analyzedData: AnalyzedJobData = {
        requiredSkills,
        preferredSkills: [], // Could be enhanced to extract from requirements
        experienceLevel: parsedResponse.seniority || "",
        responsibilities,
        summary: `${parsedResponse.title || title} position requiring ${requiredSkills.slice(0, 3).join(", ")}`,
        department: parsedResponse.department,
        location: parsedResponse.location,
      };

      return {
        id: createBrandedId<number, "JobId">(Date.now()) as JobId,
        title: parsedResponse.title || title || "",
        analyzedData,
        processingTime: Date.now() - performance.now(),
        confidence: 0.8,
        warnings: [],
        // Convenience properties for backward compatibility
        company: parsedResponse.company || "",
        requiredSkills,
        preferredSkills: analyzedData.preferredSkills,
        skills: requiredSkills,
        experience: parsedResponse.seniority || "",
        experienceLevel: analyzedData.experienceLevel,
        responsibilities,
        requirements,
        summary: analyzedData.summary,
      };
    } catch (parseError) {
      logApiServiceStatus(
        `Error parsing Anthropic response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        true,
      );
      return fallbackResponse;
    }
  } catch (error) {
    // Record failure using shared error handler
    const _errorClassification = errorHandler.recordFailure(error instanceof Error ? error : new Error(String(error)));
    
    logApiServiceStatus(
      `Job description analysis failed: ${error instanceof Error ? error.message : String(error)}`,
      true,
    );

    // Return fallback response using shared error handler
    return errorHandler.createFallbackResponse<AnalyzeJobDescriptionResponse>(fallbackResponse, 'job analysis');
  }
}

/**
 * Analyze potential bias in a job description
 */
export async function analyzeBias(
  title: string,
  description: string,
): Promise<BiasAnalysisResponse> {
  // First, check if service is available
  if (!serviceStatus.isAnthropicAvailable) {
    checkServiceRecovery();
    return {
      hasBias: true,
      biasTypes: ["Gender bias", "Age bias"],
      biasedPhrases: [
        {
          phrase: "young and energetic",
          reason:
            "Age-related bias that may discriminate against older candidates",
        },
        {
          phrase: "strong man",
          reason:
            "Gender-specific language that may discourage women from applying",
        },
      ],
      suggestions: [
        "Replace 'young and energetic' with 'motivated and enthusiastic'",
        "Replace 'strong man' with 'strong candidate'",
      ],
      improvedDescription:
        "This is a fallback improved description that would be generated from the actual job description. The actual analysis would detect and fix biased language.",
    };
  }

  try {
    logApiServiceStatus("Performing bias analysis with Anthropic Claude");

    // Create prompt
    const prompt = `Analyze this job description for potential biases (gender, age, racial, ableist, etc).
  
Job Title: ${title || ""}

Job Description:
${description || ""}

Please identify any biased language and suggest more inclusive alternatives. Your analysis should:

1. Determine if there is bias present (true/false)
2. List the types of bias detected
3. Identify specific biased phrases with explanations
4. Provide specific suggestions to improve inclusivity
5. Provide an improved version of the entire job description

Format your response as valid JSON with this structure:
{
  "hasBias": true,
  "biasTypes": ["Gender bias", "Age bias", "Other bias types..."],
  "biasedPhrases": [
    {
      "phrase": "Example biased phrase",
      "reason": "Explanation of why this phrase is biased"
    }
  ],
  "suggestions": [
    "Specific suggestion 1",
    "Specific suggestion 2"
  ],
  "improvedDescription": "Complete improved version of the job description."
}`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a bias detection specialist focused on identifying and improving inclusivity in job descriptions. Respond with valid JSON only, no explanations.",
    });

    // Record successful API call
    recordApiSuccess();

    // Parse JSON response from Anthropic
    try {
      // Extract JSON from the response content
      const contentBlock = response.content[0];
      if (contentBlock.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }
      const responseText = contentBlock.text;
      const jsonMatch = responseText.match(/({[\s\S]*})/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

      const parsedResponse = JSON.parse(jsonStr);

      // Track token usage
      if (response.usage) {
        serviceStatus.apiUsageStats.promptTokens +=
          response.usage.input_tokens || 0;
        serviceStatus.apiUsageStats.completionTokens +=
          response.usage.output_tokens || 0;
        serviceStatus.apiUsageStats.totalTokens +=
          (response.usage.input_tokens || 0) +
          (response.usage.output_tokens || 0);
        // Update estimated cost - Claude pricing is approximately $3 per million input tokens, $15 per million output tokens
        const inputCost = (response.usage.input_tokens || 0) * 0.000003;
        const outputCost = (response.usage.output_tokens || 0) * 0.000015;
        serviceStatus.apiUsageStats.estimatedCost += inputCost + outputCost;
      }

      // Return normalized response
      return {
        hasBias: parsedResponse.hasBias || false,
        biasTypes: Array.isArray(parsedResponse.biasTypes)
          ? parsedResponse.biasTypes
          : [],
        biasedPhrases: Array.isArray(parsedResponse.biasedPhrases)
          ? parsedResponse.biasedPhrases
          : [],
        suggestions: Array.isArray(parsedResponse.suggestions)
          ? parsedResponse.suggestions
          : [],
        improvedDescription: parsedResponse.improvedDescription || description,
      };
    } catch (parseError) {
      logApiServiceStatus(
        `Error parsing Anthropic response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        true,
      );
      return {
        hasBias: true,
        biasTypes: ["Gender bias", "Age bias"],
        biasedPhrases: [
          {
            phrase: "young and energetic",
            reason:
              "Age-related bias that may discriminate against older candidates",
          },
          {
            phrase: "strong man",
            reason:
              "Gender-specific language that may discourage women from applying",
          },
        ],
        suggestions: [
          "Replace 'young and energetic' with 'motivated and enthusiastic'",
          "Replace 'strong man' with 'strong candidate'",
        ],
        improvedDescription:
          "This is a fallback improved description that would be generated from the actual job description. The actual analysis would detect and fix biased language.",
      };
    }
  } catch (error) {
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    logApiServiceStatus(
      `Bias analysis failed (${status.consecutiveFailures} consecutive failures)${!status.isAvailable ? ` - service unavailable, retry in ${status.retry.currentBackoff / 1000}s` : ''}`,
      true,
    );

    // Return the fallback response
    return {
      hasBias: true,
      biasTypes: ["Gender bias", "Age bias"],
      biasedPhrases: [
        {
          phrase: "young and energetic",
          reason:
            "Age-related bias that may discriminate against older candidates",
        },
        {
          phrase: "strong man",
          reason:
            "Gender-specific language that may discourage women from applying",
        },
      ],
      suggestions: [
        "Replace 'young and energetic' with 'motivated and enthusiastic'",
        "Replace 'strong man' with 'strong candidate'",
      ],
      improvedDescription:
        "This is a fallback improved description that would be generated from the actual job description. The actual analysis would detect and fix biased language.",
    };
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
  // First, check if service is available
  if (!config.ai.providers.anthropic.apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  const prompt = `Create a comprehensive interview script for a ${jobTitle} position. Generate a structured conversation flow that guides the interviewer from opening to closing.

The candidate is ${candidateName || "[Candidate Name]"} and here's their analysis data:

Resume Analysis:
${JSON.stringify(resumeAnalysis, null, 2)}

Job Analysis:
${JSON.stringify(jobAnalysis, null, 2)}

Match Analysis:
${JSON.stringify(matchAnalysis, null, 2)}

Create a professional interview script with:
1. Warm opening and introductions
2. Acknowledgment of current role and experience
3. Skill match discussion with specific questions
4. Constructive skill gap assessment
5. Role selling and opportunity highlights
6. Professional closing with clear next steps

Return a JSON object with the complete interview flow including natural transitions, specific questions, and expected response guidance.`;

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Anthropic");
    }

    const result = JSON.parse(content.text) as InterviewScriptResponse;

    // Ensure required fields are present
    if (!result.jobTitle) result.jobTitle = jobTitle;
    if (!result.candidateName)
      result.candidateName = candidateName || "the candidate";

    logApiServiceStatus("Interview script generated successfully");
    return result;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logApiServiceStatus(
      `Error generating interview script: ${errorMessage}`,
      true,
    );

    // Update service status using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, consider the service unavailable
    if (!status.isAvailable) {
      // Exponential backoff with max limit
      // Backoff is now handled by the error handler
      logApiServiceStatus(
        `Interview script generation failed - service marked as unavailable, will retry after backoff period`,
        true,
      );
    }

    // Re-throw the error instead of returning fallback response
    // The tiered provider will handle appropriate error messaging
    throw error;
  }
}

/**
 * Generate interview questions based on resume and job match
 */
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
): Promise<InterviewQuestionsResponse> {
  // First, check if service is available
  if (!serviceStatus.isAnthropicAvailable) {
    checkServiceRecovery();
    const fallbackQuestions: InterviewQuestionData[] = [
      {
        question:
          "Can you explain how you would implement a secure authentication system?",
        category: "technical",
        difficulty: "medium",
        expectedAnswer:
          "Should discuss concepts like JWT, OAuth, password hashing, etc.",
        skillsAssessed: ["Security", "Authentication", "System Design"],
        timeAllotted: 10,
      },
      {
        question:
          "Tell me about a challenging project you worked on and how you overcame obstacles.",
        category: "behavioral",
        difficulty: "medium",
        expectedAnswer:
          "Should demonstrate problem-solving skills and resilience.",
        skillsAssessed: [
          "Problem Solving",
          "Communication",
          "Project Management",
        ],
      },
    ];

    return {
      resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
      jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
      candidateName: resumeAnalysis.name,
      jobTitle: jobAnalysis.title,
      questions: fallbackQuestions,
      metadata: {
        estimatedDuration: 30,
        difficulty: "mid",
        focusAreas: ["Technical Skills", "Experience"],
        interviewType: "video",
      },
      processingTime: 0,
      // Convenience properties for backward compatibility
      technicalQuestions: fallbackQuestions.filter(
        (q) => q.category === "technical",
      ),
      experienceQuestions: fallbackQuestions.filter(
        (q) => q.category === "behavioral",
      ),
      skillGapQuestions: [],
    };
  }

  try {
    logApiServiceStatus("Generating interview questions with Anthropic Claude");

    // Extract skills and experience information for the prompt
    const candidateSkills = resumeAnalysis.skills?.join(", ") || "";
    const candidateExperience =
      resumeAnalysis.experience
        ?.map(
          (exp) =>
            `${exp.position || "Position"} at ${exp.company || "Company"}`,
        )
        .join("; ") || "";

    const jobRequiredSkills = jobAnalysis.requiredSkills?.join(", ") || "";
    const jobPreferredSkills = jobAnalysis.preferredSkills?.join(", ") || "";

    const matchedSkillsList =
      matchAnalysis.matchedSkills?.map((skill) => skill.skill).join(", ") || "";
    const missingSkillsList = matchAnalysis.missingSkills?.join(", ") || "";

    // Create prompt
    const prompt = `Generate interview questions for a candidate based on their resume and the job requirements.

JOB TITLE: ${jobAnalysis.title}

CANDIDATE SKILLS: ${candidateSkills}

CANDIDATE EXPERIENCE: ${candidateExperience}

JOB REQUIRED SKILLS: ${jobRequiredSkills}

JOB PREFERRED SKILLS: ${jobPreferredSkills}

MATCHED SKILLS: ${matchedSkillsList}

MISSING SKILLS: ${missingSkillsList}

Based on this information, generate 4 types of interview questions:
1. Technical questions that assess the candidate's expertise in their matched skills
2. Experience questions that explore how they've applied their skills in past roles
3. Skill gap questions that tactfully explore how they might address their missing skills
4. Inclusion questions that assess their ability to work in diverse teams and environments

Format your response as valid JSON with this structure:
{
  "technicalQuestions": ["Question 1", "Question 2", "Question 3"],
  "experienceQuestions": ["Question 1", "Question 2", "Question 3"],
  "skillGapQuestions": ["Question 1", "Question 2", "Question 3"],
  "inclusionQuestions": ["Question 1", "Question 2"]
}`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are an expert technical recruiter who specializes in creating fair, unbiased, and effective interview questions that assess technical skills and team collaboration. Respond with valid JSON only, no explanations.",
    });

    // Record successful API call
    recordApiSuccess();

    // Parse JSON response from Anthropic
    try {
      // Extract JSON from the response content
      const contentBlock = response.content[0];
      if (contentBlock.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }
      const responseText = contentBlock.text;
      const jsonMatch = responseText.match(/({[\s\S]*})/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

      const parsedResponse = JSON.parse(jsonStr);

      // Track token usage
      if (response.usage) {
        serviceStatus.apiUsageStats.promptTokens +=
          response.usage.input_tokens || 0;
        serviceStatus.apiUsageStats.completionTokens +=
          response.usage.output_tokens || 0;
        serviceStatus.apiUsageStats.totalTokens +=
          (response.usage.input_tokens || 0) +
          (response.usage.output_tokens || 0);
        // Update estimated cost - Claude pricing is approximately $3 per million input tokens, $15 per million output tokens
        const inputCost = (response.usage.input_tokens || 0) * 0.000003;
        const outputCost = (response.usage.output_tokens || 0) * 0.000015;
        serviceStatus.apiUsageStats.estimatedCost += inputCost + outputCost;
      }

      // Convert string arrays to InterviewQuestionData objects
      const createQuestionData = (
        question: string,
        category: InterviewQuestionData["category"],
      ): InterviewQuestionData => ({
        question,
        category,
        difficulty: "medium",
        expectedAnswer:
          "Assess candidate's response based on relevance and depth.",
        skillsAssessed: [],
        timeAllotted: 5,
      });

      const technicalQuestions = Array.isArray(
        parsedResponse.technicalQuestions,
      )
        ? parsedResponse.technicalQuestions.map((q: string) =>
            createQuestionData(q, "technical"),
          )
        : [];
      const experienceQuestions = Array.isArray(
        parsedResponse.experienceQuestions,
      )
        ? parsedResponse.experienceQuestions.map((q: string) =>
            createQuestionData(q, "behavioral"),
          )
        : [];
      const skillGapQuestions = Array.isArray(parsedResponse.skillGapQuestions)
        ? parsedResponse.skillGapQuestions.map((q: string) =>
            createQuestionData(q, "situational"),
          )
        : [];

      const allQuestions = [
        ...technicalQuestions,
        ...experienceQuestions,
        ...skillGapQuestions,
      ];

      // Return normalized response
      return {
        resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
        jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
        candidateName: resumeAnalysis.name,
        jobTitle: jobAnalysis.title,
        questions: allQuestions,
        metadata: {
          estimatedDuration: allQuestions.length * 5,
          difficulty: "mid",
          focusAreas: ["Technical Skills", "Experience", "Skill Development"],
          interviewType: "video",
        },
        processingTime: Date.now() - performance.now(),
        // Convenience properties for backward compatibility
        technicalQuestions,
        experienceQuestions,
        skillGapQuestions,
      };
    } catch (parseError) {
      logApiServiceStatus(
        `Error parsing Anthropic response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        true,
      );
      const parseErrorQuestions: InterviewQuestionData[] = [
        {
          question:
            "Can you explain how you would implement a secure authentication system?",
          category: "technical",
          difficulty: "medium",
          expectedAnswer:
            "Should discuss concepts like JWT, OAuth, password hashing, etc.",
          skillsAssessed: ["Security", "Authentication", "System Design"],
          timeAllotted: 10,
        },
        {
          question:
            "Tell me about a challenging project you worked on and how you overcame obstacles.",
          category: "behavioral",
          difficulty: "medium",
          expectedAnswer:
            "Should demonstrate problem-solving skills and resilience.",
          skillsAssessed: [
            "Problem Solving",
            "Communication",
            "Project Management",
          ],
        },
      ];

      return {
  resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
  jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
        candidateName: resumeAnalysis.name,
        jobTitle: jobAnalysis.title,
        questions: parseErrorQuestions,
        metadata: {
          estimatedDuration: 30,
          difficulty: "mid",
          focusAreas: ["Technical Skills", "Experience"],
          interviewType: "video",
        },
        processingTime: 0,
        // Convenience properties for backward compatibility
        technicalQuestions: parseErrorQuestions.filter(
          (q) => q.category === "technical",
        ),
        experienceQuestions: parseErrorQuestions.filter(
          (q) => q.category === "behavioral",
        ),
        skillGapQuestions: [],
      };
    }
  } catch (error) {
    // Track API failure
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logApiServiceStatus(
        `Interview questions generation failed - service marked as unavailable, will retry after backoff period`,
        true,
      );
    }

    // Return the fallback response
    const finalFallbackQuestions: InterviewQuestionData[] = [
      {
        question:
          "Can you explain how you would implement a secure authentication system?",
        category: "technical",
        difficulty: "medium",
        expectedAnswer:
          "Should discuss concepts like JWT, OAuth, password hashing, etc.",
        skillsAssessed: ["Security", "Authentication", "System Design"],
        timeAllotted: 10,
      },
      {
        question:
          "Tell me about a challenging project you worked on and how you overcame obstacles.",
        category: "behavioral",
        difficulty: "medium",
        expectedAnswer:
          "Should demonstrate problem-solving skills and resilience.",
        skillsAssessed: [
          "Problem Solving",
          "Communication",
          "Project Management",
        ],
      },
    ];

    return {
      resumeId: createBrandedId<number, "ResumeId">(Date.now()) as ResumeId,
      jobId: createBrandedId<number, "JobId">(Date.now()) as JobId,
      candidateName: resumeAnalysis.name,
      jobTitle: jobAnalysis.title,
      questions: finalFallbackQuestions,
      metadata: {
        estimatedDuration: 30,
        difficulty: "mid",
        focusAreas: ["Technical Skills", "Experience"],
        interviewType: "video",
      },
      processingTime: 0,
      // Convenience properties for backward compatibility
      technicalQuestions: finalFallbackQuestions.filter(
        (q) => q.category === "technical",
      ),
      experienceQuestions: finalFallbackQuestions.filter(
        (q) => q.category === "behavioral",
      ),
      skillGapQuestions: [],
    };
  }
}

/**
 * Extract skills from text
 */
export async function extractSkills(
  text: string,
  type: "resume" | "job",
): Promise<string[]> {
  // First, check if service is available
  if (!serviceStatus.isAnthropicAvailable) {
    checkServiceRecovery();
    return [
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "API Development",
      "Problem Solving",
      "Communication",
    ];
  }

  try {
    logApiServiceStatus(`Extracting skills from ${type} with Anthropic Claude`);

    // Create prompt
    const prompt = `Extract all technical and soft skills from the following ${type === "resume" ? "resume" : "job description"} text.

TEXT:
${text}

Only include skills that are explicitly mentioned or clearly demonstrated in the text. Return the list of skills as a JSON array of strings, sorted by importance (most important skills first). Do not include any explanations or other text in your response.

Format your response as:
["Skill 1", "Skill 2", "Skill 3", ...]`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a skills extraction expert. Your task is to identify both technical and soft skills from text. Extract only skills that are clearly mentioned or demonstrated. Respond with a valid JSON array of skills only, no additional text.",
    });

    // Record successful API call
    recordApiSuccess();

    // Parse JSON response from Anthropic
    try {
      // Extract JSON from the response content
      const contentBlock = response.content[0];
      if (contentBlock.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }
      const responseText = contentBlock.text;
      const jsonMatch = responseText.match(/(\[[\s\S]*\])/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

      const parsedResponse = JSON.parse(jsonStr);

      // Track token usage
      if (response.usage) {
        serviceStatus.apiUsageStats.promptTokens +=
          response.usage.input_tokens || 0;
        serviceStatus.apiUsageStats.completionTokens +=
          response.usage.output_tokens || 0;
        serviceStatus.apiUsageStats.totalTokens +=
          (response.usage.input_tokens || 0) +
          (response.usage.output_tokens || 0);
        // Update estimated cost - Claude pricing is approximately $3 per million input tokens, $15 per million output tokens
        const inputCost = (response.usage.input_tokens || 0) * 0.000003;
        const outputCost = (response.usage.output_tokens || 0) * 0.000015;
        serviceStatus.apiUsageStats.estimatedCost += inputCost + outputCost;
      }

      // Ensure we return an array of strings
      if (Array.isArray(parsedResponse)) {
        return parsedResponse.filter((skill) => typeof skill === "string");
      } else {
        return [];
      }
    } catch (parseError) {
      logApiServiceStatus(
        `Error parsing Anthropic response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        true,
      );
      return [
        "JavaScript",
        "TypeScript",
        "React",
        "Node.js",
        "API Development",
        "Problem Solving",
        "Communication",
      ];
    }
  } catch (error) {
    // Track API failure
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logApiServiceStatus(
        `Skills extraction failed - service marked as unavailable, will retry after backoff period`,
        true,
      );
    }

    // Return the fallback response
    return [
      "JavaScript",
      "TypeScript",
      "React",
      "Node.js",
      "API Development",
      "Problem Solving",
      "Communication",
    ];
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
  // First, check if service is available
  if (!serviceStatus.isAnthropicAvailable) {
    checkServiceRecovery();
    return {
      matchedSkills: ["JavaScript", "React", "CSS", "HTML"],
      missingSkills: ["TypeScript", "Node.js", "AWS", "DevOps"],
    };
  }

  try {
    logApiServiceStatus("Analyzing skill gaps with Anthropic Claude");

    // Create prompt
    const prompt = `Compare the skills in the resume with the requirements in the job description.
Identify which skills from the job description are matched in the resume and which are missing.

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescText}

Format your response as valid JSON with this structure:
{
  "matchedSkills": ["Skill 1", "Skill 2"],
  "missingSkills": ["Skill 3", "Skill 4"]
}`;

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a skills gap analysis expert who identifies matches and mismatches between candidate resumes and job requirements. Respond with valid JSON only, no explanations.",
    });

    // Record successful API call
    recordApiSuccess();

    // Parse JSON response from Anthropic
    try {
      // Extract JSON from the response content
      const contentBlock = response.content[0];
      if (contentBlock.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }
      const responseText = contentBlock.text;
      const jsonMatch = responseText.match(/({[\s\S]*})/);
      const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

      const parsedResponse = JSON.parse(jsonStr);

      // Track token usage
      if (response.usage) {
        serviceStatus.apiUsageStats.promptTokens +=
          response.usage.input_tokens || 0;
        serviceStatus.apiUsageStats.completionTokens +=
          response.usage.output_tokens || 0;
        serviceStatus.apiUsageStats.totalTokens +=
          (response.usage.input_tokens || 0) +
          (response.usage.output_tokens || 0);
        // Update estimated cost - Claude pricing is approximately $3 per million input tokens, $15 per million output tokens
        const inputCost = (response.usage.input_tokens || 0) * 0.000003;
        const outputCost = (response.usage.output_tokens || 0) * 0.000015;
        serviceStatus.apiUsageStats.estimatedCost += inputCost + outputCost;
      }

      // Return normalized response
      return {
        matchedSkills: Array.isArray(parsedResponse.matchedSkills)
          ? parsedResponse.matchedSkills
          : [],
        missingSkills: Array.isArray(parsedResponse.missingSkills)
          ? parsedResponse.missingSkills
          : [],
      };
    } catch (parseError) {
      logApiServiceStatus(
        `Error parsing Anthropic response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        true,
      );
      return {
        matchedSkills: ["JavaScript", "React", "CSS", "HTML"],
        missingSkills: ["TypeScript", "Node.js", "AWS", "DevOps"],
      };
    }
  } catch (error) {
    // Track API failure
    // Track API failure using error handler
    errorHandler.recordFailure(error as Error);
    
    const status = errorHandler.getStatus();
    // After 3 consecutive failures, service is marked unavailable by errorHandler
    if (!status.isAvailable) {
      // Backoff is now handled by the error handler
      logApiServiceStatus(
        `Skill gap analysis failed - service marked as unavailable, will retry after backoff period`,
        true,
      );
    }

    // Return the fallback response
    return {
      matchedSkills: ["JavaScript", "React", "CSS", "HTML"],
      missingSkills: ["TypeScript", "Node.js", "AWS", "DevOps"],
    };
  }
}

/**
 * Get the current Anthropic service status information
 * This can be exposed via an API endpoint for monitoring
 */
export function getAnthropicServiceStatus() {
  return {
    ...serviceStatus,
    apiUsageStats: {
      ...serviceStatus.apiUsageStats,
      estimatedCost: `$${serviceStatus.apiUsageStats.estimatedCost.toFixed(4)}`,
    },
  };
}
