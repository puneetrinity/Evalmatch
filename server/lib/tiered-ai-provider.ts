import * as openai from "./openai";
import * as anthropic from "./anthropic";
import * as groq from "./groq";
import { config } from "../config";
import { logger } from "./logger";
import {
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResponse,
  InterviewQuestionsResponse,
  InterviewScriptResponse,
  BiasAnalysisResponse,
} from "@shared/schema";
import {
  UserTierInfo,
  TIER_LIMITS,
  checkUsageLimit,
  incrementUsage,
  getServiceUnavailableError,
  getApiLimitExceededError,
} from "@shared/user-tiers";

// Circuit breaker state management
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreakers: Map<string, CircuitBreakerState> = new Map();
const CIRCUIT_BREAKER_THRESHOLD = 3; // Open circuit after 3 failures
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute timeout
const CIRCUIT_BREAKER_RESET_TIMEOUT = 30000; // 30 seconds before trying half-open

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

// Verify if providers are configured
const isAnthropicConfigured = !!config.anthropicApiKey;
const isGroqConfigured = !!process.env.GROQ_API_KEY;
const isOpenAIConfigured = !!process.env.OPENAI_API_KEY;

/**
 * Circuit breaker implementation for AI providers
 */
function getCircuitBreakerState(provider: string): CircuitBreakerState {
  if (!circuitBreakers.has(provider)) {
    circuitBreakers.set(provider, {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
    });
  }
  return circuitBreakers.get(provider)!;
}

function updateCircuitBreakerOnSuccess(provider: string): void {
  const state = getCircuitBreakerState(provider);
  state.failures = 0;
  state.state = 'closed';
  logger.debug(`Circuit breaker reset for ${provider}`, { state: state.state });
}

function updateCircuitBreakerOnFailure(provider: string): void {
  const state = getCircuitBreakerState(provider);
  state.failures++;
  state.lastFailureTime = Date.now();
  
  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.state = 'open';
    logger.warn(`Circuit breaker opened for ${provider}`, {
      failures: state.failures,
      threshold: CIRCUIT_BREAKER_THRESHOLD,
    });
  }
}

function isCircuitBreakerOpen(provider: string): boolean {
  const state = getCircuitBreakerState(provider);
  const now = Date.now();
  
  if (state.state === 'open') {
    // Check if we should try half-open
    if (now - state.lastFailureTime > CIRCUIT_BREAKER_RESET_TIMEOUT) {
      state.state = 'half-open';
      logger.info(`Circuit breaker moving to half-open for ${provider}`);
      return false; // Allow one attempt
    }
    return true; // Still open
  }
  
  return false; // Closed or half-open
}

/**
 * Exponential backoff retry logic
 */
async function withRetryAndCircuitBreaker<T>(
  provider: string,
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  // Check circuit breaker first
  if (isCircuitBreakerOpen(provider)) {
    throw new Error(`${provider} provider circuit breaker is open - service temporarily unavailable`);
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Success - reset circuit breaker
      updateCircuitBreakerOnSuccess(provider);
      
      if (attempt > 0) {
        logger.info(`${provider} provider recovered after ${attempt} retries`, { context });
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Update circuit breaker on failure
      updateCircuitBreakerOnFailure(provider);
      
      // Don't retry on certain error types
      const errorMessage = lastError.message.toLowerCase();
      if (
        errorMessage.includes('unauthorized') ||
        errorMessage.includes('invalid api key') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('quota exceeded')
      ) {
        logger.warn(`${provider} provider non-retryable error`, {
          context,
          error: lastError.message,
          attempt: attempt + 1,
        });
        throw lastError;
      }
      
      // Don't retry on last attempt
      if (attempt === RETRY_CONFIG.maxRetries) {
        logger.error(`${provider} provider failed after ${attempt + 1} attempts`, {
          context,
          error: lastError.message,
        });
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
        RETRY_CONFIG.maxDelay
      );
      
      logger.warn(`${provider} provider attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
        context,
        error: lastError.message,
        nextAttempt: attempt + 2,
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${provider} provider failed after all retry attempts`);
}

/**
 * Provider-specific result normalization to ensure consistent output format
 */
function normalizeResumeAnalysis(result: any, provider: string): AnalyzeResumeResponse {
  logger.debug(`Normalizing resume analysis from ${provider}`, {
    hasResult: !!result,
    resultKeys: result ? Object.keys(result) : [],
  });

  // Base normalization - ensure all required fields exist
  const normalized: AnalyzeResumeResponse = {
    skills: Array.isArray(result?.skills) ? result.skills : [],
    experience: result?.experience || "",
    education: result?.education || "",
    analyzedData: result?.analyzedData || {},
    summary: result?.summary || "",
    contactInfo: result?.contactInfo || {},
    workHistory: Array.isArray(result?.workHistory) ? result.workHistory : [],
    certifications: Array.isArray(result?.certifications) ? result.certifications : [],
  };

  // Provider-specific normalization
  switch (provider) {
    case 'groq':
      // Groq sometimes returns skills as comma-separated string
      if (typeof result?.skills === 'string') {
        normalized.skills = result.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      // Groq may have different field names
      if (result?.technical_skills && !normalized.skills.length) {
        normalized.skills = Array.isArray(result.technical_skills) 
          ? result.technical_skills 
          : result.technical_skills.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      break;

    case 'openai':
      // OpenAI typically has consistent structure, but ensure arrays
      if (result?.skills && !Array.isArray(result.skills)) {
        normalized.skills = [result.skills];
      }
      break;

    case 'anthropic':
      // Anthropic may use different field structures
      if (result?.extracted_skills) {
        normalized.skills = Array.isArray(result.extracted_skills) 
          ? result.extracted_skills 
          : [result.extracted_skills];
      }
      if (result?.work_experience && !normalized.experience) {
        normalized.experience = result.work_experience;
      }
      break;
  }

  // Ensure skills are strings and deduplicated
  normalized.skills = [...new Set(
    normalized.skills
      .map(skill => typeof skill === 'string' ? skill.trim() : String(skill))
      .filter(skill => skill.length > 0)
  )];

  logger.debug(`Resume analysis normalized for ${provider}`, {
    skillsCount: normalized.skills.length,
    hasExperience: !!normalized.experience,
    hasEducation: !!normalized.education,
  });

  return normalized;
}

function normalizeJobAnalysis(result: any, provider: string): AnalyzeJobDescriptionResponse {
  logger.debug(`Normalizing job analysis from ${provider}`, {
    hasResult: !!result,
    resultKeys: result ? Object.keys(result) : [],
  });

  // Base normalization
  const normalized: AnalyzeJobDescriptionResponse = {
    skills: Array.isArray(result?.skills) ? result.skills : [],
    experience: result?.experience || "",
    analyzedData: result?.analyzedData || {},
    summary: result?.summary || "",
    requirements: Array.isArray(result?.requirements) ? result.requirements : [],
    responsibilities: Array.isArray(result?.responsibilities) ? result.responsibilities : [],
  };

  // Provider-specific normalization
  switch (provider) {
    case 'groq':
      if (typeof result?.skills === 'string') {
        normalized.skills = result.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      if (result?.required_skills && !normalized.skills.length) {
        normalized.skills = Array.isArray(result.required_skills) 
          ? result.required_skills 
          : result.required_skills.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      break;

    case 'openai':
      if (result?.skills && !Array.isArray(result.skills)) {
        normalized.skills = [result.skills];
      }
      break;

    case 'anthropic':
      if (result?.required_skills) {
        normalized.skills = Array.isArray(result.required_skills) 
          ? result.required_skills 
          : [result.required_skills];
      }
      break;
  }

  // Ensure skills are strings and deduplicated
  normalized.skills = [...new Set(
    normalized.skills
      .map(skill => typeof skill === 'string' ? skill.trim() : String(skill))
      .filter(skill => skill.length > 0)
  )];

  logger.debug(`Job analysis normalized for ${provider}`, {
    skillsCount: normalized.skills.length,
    hasExperience: !!normalized.experience,
    requirementsCount: normalized.requirements.length,
  });

  return normalized;
}

function normalizeMatchAnalysis(result: any, provider: string): MatchAnalysisResponse {
  logger.debug(`Normalizing match analysis from ${provider}`, {
    hasResult: !!result,
    resultKeys: result ? Object.keys(result) : [],
  });

  // Base normalization
  const normalized: MatchAnalysisResponse = {
    matchPercentage: Math.max(0, Math.min(100, Number(result?.matchPercentage) || 0)),
    matchedSkills: Array.isArray(result?.matchedSkills) ? result.matchedSkills : [],
    missingSkills: Array.isArray(result?.missingSkills) ? result.missingSkills : [],
    candidateStrengths: Array.isArray(result?.candidateStrengths) ? result.candidateStrengths : [],
    candidateWeaknesses: Array.isArray(result?.candidateWeaknesses) ? result.candidateWeaknesses : [],
    recommendations: Array.isArray(result?.recommendations) ? result.recommendations : [],
    confidenceLevel: result?.confidenceLevel || 'medium',
    fairnessMetrics: result?.fairnessMetrics || {},
  };

  // Provider-specific normalization
  switch (provider) {
    case 'groq':
      // Groq may return match percentage as string
      if (typeof result?.matchPercentage === 'string') {
        normalized.matchPercentage = Math.max(0, Math.min(100, parseFloat(result.matchPercentage) || 0));
      }
      // Handle different field names
      if (result?.matched_skills && !normalized.matchedSkills.length) {
        normalized.matchedSkills = Array.isArray(result.matched_skills) 
          ? result.matched_skills 
          : [result.matched_skills];
      }
      break;

    case 'openai':
      // OpenAI typically consistent, but ensure proper types
      if (result?.match_score && !result?.matchPercentage) {
        normalized.matchPercentage = Math.max(0, Math.min(100, Number(result.match_score) || 0));
      }
      break;

    case 'anthropic':
      // Anthropic may use different field names
      if (result?.overall_match && !result?.matchPercentage) {
        normalized.matchPercentage = Math.max(0, Math.min(100, Number(result.overall_match) || 0));
      }
      if (result?.strengths && !normalized.candidateStrengths.length) {
        normalized.candidateStrengths = Array.isArray(result.strengths) 
          ? result.strengths 
          : [result.strengths];
      }
      if (result?.weaknesses && !normalized.candidateWeaknesses.length) {
        normalized.candidateWeaknesses = Array.isArray(result.weaknesses) 
          ? result.weaknesses 
          : [result.weaknesses];
      }
      break;
  }

  // Ensure arrays contain strings
  normalized.matchedSkills = normalized.matchedSkills.map(skill => 
    typeof skill === 'string' ? skill : String(skill)
  ).filter(Boolean);
  
  normalized.missingSkills = normalized.missingSkills.map(skill => 
    typeof skill === 'string' ? skill : String(skill)
  ).filter(Boolean);

  // Validate confidence level
  if (!['low', 'medium', 'high'].includes(normalized.confidenceLevel)) {
    normalized.confidenceLevel = 'medium';
  }

  logger.debug(`Match analysis normalized for ${provider}`, {
    matchPercentage: normalized.matchPercentage,
    matchedSkillsCount: normalized.matchedSkills.length,
    missingSkillsCount: normalized.missingSkills.length,
    confidenceLevel: normalized.confidenceLevel,
  });

  return normalized;
}

/**
 * Classify error types and throw appropriate errors based on actual failure reasons
 */
function classifyAndThrowError(error: unknown, userTier: UserTierInfo, context: string): never {
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const errorStack = error instanceof Error ? error.stack?.toLowerCase() || "" : "";
  
  // Rate limit errors
  if (errorMessage.includes("rate limit") || 
      errorMessage.includes("too many requests") ||
      errorMessage.includes("quota exceeded") ||
      errorStack.includes("429")) {
    throw getApiLimitExceededError(userTier, context);
  }
  
  // Timeout errors
  if (errorMessage.includes("timeout") || 
      errorMessage.includes("timed out") ||
      errorMessage.includes("request timeout") ||
      errorStack.includes("timeout")) {
    throw new Error(`${context} request timed out. Please try again in a moment.`);
  }
  
  // Network/connectivity errors
  if (errorMessage.includes("network") ||
      errorMessage.includes("connection") ||
      errorMessage.includes("econnrefused") ||
      errorMessage.includes("enotfound") ||
      errorStack.includes("network")) {
    throw new Error(`${context} service is temporarily unavailable due to network issues. Please try again.`);
  }
  
  // Authentication errors
  if (errorMessage.includes("unauthorized") ||
      errorMessage.includes("invalid api key") ||
      errorMessage.includes("authentication") ||
      errorStack.includes("401")) {
    logger.error("AI provider authentication failure", { context, userTier: userTier.tier });
    throw getServiceUnavailableError(userTier, context);
  }
  
  // Content filtering/policy violations
  if (errorMessage.includes("content policy") ||
      errorMessage.includes("safety") ||
      errorMessage.includes("filtered") ||
      errorMessage.includes("inappropriate")) {
    throw new Error(`${context} could not be completed due to content guidelines. Please review your input and try again.`);
  }
  
  // Model overload/capacity issues
  if (errorMessage.includes("overload") ||
      errorMessage.includes("capacity") ||
      errorMessage.includes("server overloaded") ||
      errorStack.includes("503")) {
    throw getServiceUnavailableError(userTier, context);
  }
  
  // Default fallback - log the unclassified error for investigation
  logger.warn("Unclassified AI provider error", {
    context,
    userTier: userTier.tier,
    errorMessage,
    errorType: typeof error,
  });
  
  throw getServiceUnavailableError(userTier, context);
}

interface TierAwareProviderSelection {
  provider: "groq" | "openai" | "anthropic";
  reason: string;
}

/**
 * Simplified provider selection logic with circuit breaker awareness
 * @throws Error when no providers are available, with appropriate upgrade messaging
 */
function selectProviderForTier(
  userTier: UserTierInfo,
): TierAwareProviderSelection {
  const allowedProviders = TIER_LIMITS[userTier.tier].allowedProviders;
  
  // Define provider priority order based on reliability and cost
  const providerPriority: Array<"groq" | "openai" | "anthropic"> = ["groq", "openai", "anthropic"];
  
  // Filter providers by tier permissions, configuration, availability, and circuit breaker state
  const availableProviders = providerPriority.filter(provider => {
    // Check tier permissions
    if (!allowedProviders.includes(provider as any)) {
      return false;
    }
    
    // Check configuration and service status
    let isConfiguredAndAvailable = false;
    switch (provider) {
      case "groq":
        isConfiguredAndAvailable = isGroqConfigured && groq.getGroqServiceStatus().isAvailable;
        break;
      case "openai":
        isConfiguredAndAvailable = isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable;
        break;
      case "anthropic":
        isConfiguredAndAvailable = isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable;
        break;
    }
    
    // Check circuit breaker state
    const circuitBreakerOpen = isCircuitBreakerOpen(provider);
    
    logger.debug(`Provider ${provider} availability check`, {
      tier: userTier.tier,
      allowed: allowedProviders.includes(provider as any),
      configured: isConfiguredAndAvailable,
      circuitBreakerOpen,
      available: isConfiguredAndAvailable && !circuitBreakerOpen,
    });
    
    return isConfiguredAndAvailable && !circuitBreakerOpen;
  });

  if (availableProviders.length === 0) {
    logger.error("No AI providers available", {
      tier: userTier.tier,
      allowedProviders,
      circuitBreakerStates: Array.from(circuitBreakers.entries()),
    });
    throw getServiceUnavailableError(userTier, "AI analysis");
  }

  const selectedProvider = availableProviders[0];
  const reason = availableProviders.length === 1 
    ? `Only available provider for ${userTier.tier} tier`
    : `Best available provider for ${userTier.tier} tier (${availableProviders.length} options)`;

  logger.info("Provider selected", {
    provider: selectedProvider,
    tier: userTier.tier,
    reason,
    availableCount: availableProviders.length,
    totalAllowed: allowedProviders.length,
  });

  return {
    provider: selectedProvider,
    reason,
  };
}

  // FULL TIERED SYSTEM (disabled during beta)
  const allowedProviders = TIER_LIMITS[userTier.tier].allowedProviders;

  // For premium users, prioritize quality: Anthropic > OpenAI > Groq
  if (userTier.tier === "premium") {
    if (
      allowedProviders.includes("anthropic" as any) &&
      isAnthropicConfigured &&
      anthropic.getAnthropicServiceStatus().isAvailable
    ) {
      return {
        provider: "anthropic",
        reason: "Premium tier - highest quality analysis",
      };
    }
    if (
      allowedProviders.includes("openai" as any) &&
      isOpenAIConfigured &&
      openai.getOpenAIServiceStatus().isAvailable
    ) {
      return {
        provider: "openai",
        reason: "Premium tier - high quality analysis",
      };
    }
    if (
      allowedProviders.includes("groq") &&
      isGroqConfigured &&
      groq.getGroqServiceStatus().isAvailable
    ) {
      return {
        provider: "groq",
        reason: "Premium tier - fallback to fast analysis",
      };
    }
  }

  // For freemium users, use Groq only
  if (userTier.tier === "freemium") {
    if (
      allowedProviders.includes("groq") &&
      isGroqConfigured &&
      groq.getGroqServiceStatus().isAvailable
    ) {
      return {
        provider: "groq",
        reason: "Freemium tier - cost-effective analysis",
      };
    }
    // If Groq is down, freemium users get limited OpenAI as fallback
    if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
      return {
        provider: "openai",
        reason: "Freemium tier - emergency fallback (Groq unavailable)",
      };
    }
  }

  // Fallback to any available provider
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return { provider: "groq", reason: "Emergency fallback - Groq available" };
  }
  if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
    return {
      provider: "openai",
      reason: "Emergency fallback - OpenAI available",
    };
  }
  if (
    isAnthropicConfigured &&
    anthropic.getAnthropicServiceStatus().isAvailable
  ) {
    return {
      provider: "anthropic",
      reason: "Emergency fallback - Anthropic available",
    };
  }

  // No providers available - throw error instead of returning fallback
  throw getServiceUnavailableError(userTier, "AI analysis");
}

/**
 * Tier-aware resume analysis
 */
export async function analyzeResume(
  resumeText: string,
  userTier: UserTierInfo,
): Promise<AnalyzeResumeResponse> {
  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count
  incrementUsage(userTier);

  // Call appropriate provider with retry logic and result normalization
  try {
    let rawResult: any;
    
    switch (selection.provider) {
      case "anthropic":
        rawResult = await withRetryAndCircuitBreaker(
          "anthropic",
          () => anthropic.analyzeResume(resumeText),
          "Resume analysis"
        );
        break;
      case "openai":
        rawResult = await withRetryAndCircuitBreaker(
          "openai",
          () => openai.analyzeResume(resumeText),
          "Resume analysis"
        );
        break;
      case "groq":
      default:
        rawResult = await withRetryAndCircuitBreaker(
          "groq",
          () => groq.analyzeResume(resumeText),
          "Resume analysis"
        );
        break;
    }

    // Normalize result to ensure consistent format
    const normalizedResult = normalizeResumeAnalysis(rawResult, selection.provider);
    
    logger.info("Resume analysis completed successfully", {
      provider: selection.provider,
      skillsCount: normalizedResult.skills.length,
      hasExperience: !!normalizedResult.experience,
      hasEducation: !!normalizedResult.education,
    });

    return normalizedResult;
  } catch (error) {
    logger.error("AI provider error in resume analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // Classify error type and throw appropriate error
    throw classifyAndThrowError(error, userTier, "Resume analysis");
  }
}

/**
 * Tier-aware resume analysis with parallel extraction (optimized token usage)
 * This version uses parallel function calls to reduce token usage by ~22%
 */
export async function analyzeResumeParallel(
  resumeText: string,
  userTier: UserTierInfo,
): Promise<AnalyzeResumeResponse> {
  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(
    `Selected provider: ${selection.provider} - ${selection.reason} (parallel extraction)`,
  );

  // Increment usage count
  incrementUsage(userTier);

  // Call appropriate provider with retry logic and result normalization
  try {
    let rawResult: any;
    
    switch (selection.provider) {
      case "anthropic":
        // Fallback to standard analysis for non-Groq providers
        rawResult = await withRetryAndCircuitBreaker(
          "anthropic",
          () => anthropic.analyzeResume(resumeText),
          "Parallel resume analysis"
        );
        break;
      case "openai":
        // Fallback to standard analysis for non-Groq providers
        rawResult = await withRetryAndCircuitBreaker(
          "openai",
          () => openai.analyzeResume(resumeText),
          "Parallel resume analysis"
        );
        break;
      case "groq":
      default:
        // Use optimized parallel extraction for Groq
        rawResult = await withRetryAndCircuitBreaker(
          "groq",
          () => groq.analyzeResumeParallel(resumeText),
          "Parallel resume analysis"
        );
        break;
    }

    // Normalize result to ensure consistent format
    const normalizedResult = normalizeResumeAnalysis(rawResult, selection.provider);
    
    logger.info("Parallel resume analysis completed successfully", {
      provider: selection.provider,
      skillsCount: normalizedResult.skills.length,
      hasExperience: !!normalizedResult.experience,
      hasEducation: !!normalizedResult.education,
      optimized: selection.provider === "groq",
    });

    return normalizedResult;
  } catch (error) {
    logger.error("AI provider error in parallel resume analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw classifyAndThrowError(error, userTier, "Resume analysis");
  }
}

/**
 * Tier-aware job description analysis
 */
export async function analyzeJobDescription(
  title: string,
  description: string,
  userTier: UserTierInfo,
): Promise<AnalyzeJobDescriptionResponse> {
  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count
  incrementUsage(userTier);

  // Call appropriate provider with retry logic and result normalization
  try {
    let rawResult: any;
    
    switch (selection.provider) {
      case "anthropic":
        rawResult = await withRetryAndCircuitBreaker(
          "anthropic",
          () => anthropic.analyzeJobDescription(title, description),
          "Job description analysis"
        );
        break;
      case "openai":
        rawResult = await withRetryAndCircuitBreaker(
          "openai",
          () => openai.analyzeJobDescription(title, description),
          "Job description analysis"
        );
        break;
      case "groq":
      default:
        rawResult = await withRetryAndCircuitBreaker(
          "groq",
          () => groq.analyzeJobDescription(title, description),
          "Job description analysis"
        );
        break;
    }

    // Normalize result to ensure consistent format
    const normalizedResult = normalizeJobAnalysis(rawResult, selection.provider);
    
    logger.info("Job description analysis completed successfully", {
      provider: selection.provider,
      skillsCount: normalizedResult.skills.length,
      hasExperience: !!normalizedResult.experience,
      requirementsCount: normalizedResult.requirements.length,
    });

    return normalizedResult;
  } catch (error) {
    logger.error("AI provider error in job description analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Throw appropriate error message based on user tier
    throw classifyAndThrowError(error, userTier, "Job description analysis");
  }
}

/**
 * Tier-aware match analysis
 */
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  userTier: UserTierInfo,
  resumeText?: string,
  jobText?: string,
): Promise<MatchAnalysisResponse> {
  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count
  incrementUsage(userTier);

  // Call appropriate provider with retry logic and result normalization
  let matchResult: MatchAnalysisResponse;
  try {
    let rawResult: any;
    
    switch (selection.provider) {
      case "anthropic":
        rawResult = await withRetryAndCircuitBreaker(
          "anthropic",
          () => anthropic.analyzeMatch(resumeAnalysis, jobAnalysis),
          "Match analysis"
        );
        break;
      case "openai":
        rawResult = await withRetryAndCircuitBreaker(
          "openai",
          () => openai.analyzeMatch(resumeAnalysis, jobAnalysis),
          "Match analysis"
        );
        break;
      case "groq":
      default:
        rawResult = await withRetryAndCircuitBreaker(
          "groq",
          () => groq.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText),
          "Match analysis"
        );
        break;
    }

    // Normalize result to ensure consistent format
    matchResult = normalizeMatchAnalysis(rawResult, selection.provider);
    
    logger.info("Match analysis completed successfully", {
      provider: selection.provider,
      matchPercentage: matchResult.matchPercentage,
      matchedSkillsCount: matchResult.matchedSkills.length,
      missingSkillsCount: matchResult.missingSkills.length,
      confidenceLevel: matchResult.confidenceLevel,
    });
  } catch (error) {
    logger.error("AI provider error in match analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Throw appropriate error message based on user tier
    throw classifyAndThrowError(error, userTier, "Match analysis");
  }

  // Add fairness metrics for premium users
  if (userTier.tier === "premium" && resumeText) {
    try {
      const { analyzeResumeFairness } = await import("./fairness-analyzer");
      const fairnessMetrics = await analyzeResumeFairness(
        resumeText,
        resumeAnalysis,
        matchResult,
      );
      return { ...matchResult, fairnessMetrics };
    } catch (error) {
      logger.error("Error generating fairness metrics", error);
    }
  }

  return matchResult;
}

/**
 * Tier-aware bias analysis
 */
export async function analyzeBias(
  title: string,
  description: string,
  userTier: UserTierInfo,
): Promise<BiasAnalysisResponse> {
  // BETA MODE: Allow all users to test bias analysis
  const BETA_MODE = true; // Set to false to enable premium-only restrictions

  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === "freemium") {
    throw new Error(
      "Bias analysis is a premium feature. Upgrade to access advanced analysis tools.",
    );
  }

  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count
  incrementUsage(userTier);

  // Call appropriate provider with error handling
  try {
    switch (selection.provider) {
      case "anthropic":
        return await anthropic.analyzeBias(title, description);
      case "openai":
        return await openai.analyzeBias(title, description);
      case "groq":
      default:
        return await groq.analyzeBias(title, description);
    }
  } catch (error) {
    logger.error("AI provider error in bias analysis", error);
    // Throw appropriate error message based on user tier
    throw classifyAndThrowError(error, userTier, "Bias analysis");
  }
}

/**
 * Tier-aware interview questions generation
 */
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
  userTier: UserTierInfo,
): Promise<InterviewQuestionsResponse> {
  // BETA MODE: Allow all users to test interview questions generation
  const BETA_MODE = true; // Set to false to enable premium-only restrictions

  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === "freemium") {
    throw new Error(
      "Interview questions generation is a premium feature. Upgrade to access advanced analysis tools.",
    );
  }

  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count
  incrementUsage(userTier);

  // Call appropriate provider with error handling
  try {
    switch (selection.provider) {
      case "anthropic":
        return await anthropic.generateInterviewQuestions(
          resumeAnalysis,
          jobAnalysis,
          matchAnalysis,
        );
      case "openai":
        return await openai.generateInterviewQuestions(
          resumeAnalysis,
          jobAnalysis,
          matchAnalysis,
        );
      case "groq":
      default:
        return await groq.generateInterviewQuestions(
          resumeAnalysis,
          jobAnalysis,
          matchAnalysis,
        );
    }
  } catch (error) {
    logger.error("AI provider error in interview questions generation", error);
    // Throw appropriate error message based on user tier
    throw classifyAndThrowError(error, userTier, "Interview questions generation");
  }
}

/**
 * Generate comprehensive interview script with full conversation flow
 */
export async function generateInterviewScript(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
  userTier: UserTierInfo,
  jobTitle: string,
  candidateName?: string,
): Promise<InterviewScriptResponse> {
  // BETA MODE: Allow all users to test interview script generation
  const BETA_MODE = true; // Set to false to enable premium-only restrictions

  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === "freemium") {
    throw new Error(
      "Complete interview script generation is a premium feature. Upgrade to access advanced interview tools.",
    );
  }

  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count
  incrementUsage(userTier);

  // Call appropriate provider with error handling
  try {
    switch (selection.provider) {
      case "anthropic":
        return await anthropic.generateInterviewScript(
          resumeAnalysis,
          jobAnalysis,
          matchAnalysis,
          jobTitle,
          candidateName,
        );
      case "openai":
        return await openai.generateInterviewScript(
          resumeAnalysis,
          jobAnalysis,
          matchAnalysis,
          jobTitle,
          candidateName,
        );
      case "groq":
      default:
        return await groq.generateInterviewScript(
          resumeAnalysis,
          jobAnalysis,
          matchAnalysis,
          jobTitle,
          candidateName,
        );
    }
  } catch (error) {
    logger.error("AI provider error in interview script generation", error);
    // Throw appropriate error message based on user tier
    throw classifyAndThrowError(error, userTier, "Interview script generation");
  }
}

/**
 * Get tier-aware service status
 */
export function getTierAwareServiceStatus(userTier: UserTierInfo) {
  const allowedProviders = TIER_LIMITS[userTier.tier].allowedProviders;
  const usageCheck = checkUsageLimit(userTier);

  return {
    userTier: userTier.tier,
    usageStatus: {
      canUse: usageCheck.canUse,
      message: usageCheck.message,
      dailyLimit: userTier.dailyAnalysisLimit,
      usageCount: userTier.usageCount,
      resetDate: userTier.lastResetDate,
    },
    availableProviders: allowedProviders.filter((provider) => {
      switch (provider) {
        case "groq":
          return isGroqConfigured && groq.getGroqServiceStatus().isAvailable;
        case "openai":
          return (
            isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable
          );
        case "anthropic":
          return (
            isAnthropicConfigured &&
            anthropic.getAnthropicServiceStatus().isAvailable
          );
        default:
          return false;
      }
    }),
    selectedProvider: selectProviderForTier(userTier),
    features: userTier.features,
  };
}








