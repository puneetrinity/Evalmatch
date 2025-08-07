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
 * Select AI provider based on user tier and availability
 * BETA MODE: All users use Groq for cost optimization during beta testing
 * @throws Error when no providers are available, with appropriate upgrade messaging
 */
function selectProviderForTier(
  userTier: UserTierInfo,
): TierAwareProviderSelection {
  // BETA MODE: Force all users to Groq for cost optimization
  // This will be removed after beta testing period (~1 month)
  const BETA_MODE = true; // Set to false to enable full tiered system

  if (BETA_MODE) {
    if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
      return {
        provider: "groq",
        reason: `Beta mode - all users use cost-effective Groq (tier: ${userTier.tier})`,
      };
    }
    // Emergency fallback during beta if Groq is down
    if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
      return {
        provider: "openai",
        reason: "Beta mode - emergency fallback (Groq unavailable)",
      };
    }
    // Last resort fallback
    if (
      isAnthropicConfigured &&
      anthropic.getAnthropicServiceStatus().isAvailable
    ) {
      return {
        provider: "anthropic",
        reason: "Beta mode - last resort fallback",
      };
    }
    // All providers unavailable - throw error instead of fallback
    throw getServiceUnavailableError(userTier, "AI analysis");
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

  // Call appropriate provider with error handling
  try {
    switch (selection.provider) {
      case "anthropic":
        return await anthropic.analyzeResume(resumeText);
      case "openai":
        return await openai.analyzeResume(resumeText);
      case "groq":
      default:
        return await groq.analyzeResume(resumeText);
    }
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

  // Call appropriate provider with error handling
  try {
    switch (selection.provider) {
      case "anthropic":
        // Fallback to standard analysis for non-Groq providers
        return await anthropic.analyzeResume(resumeText);
      case "openai":
        // Fallback to standard analysis for non-Groq providers
        return await openai.analyzeResume(resumeText);
      case "groq":
      default:
        // Use optimized parallel extraction for Groq
        return await groq.analyzeResumeParallel(resumeText);
    }
  } catch (error) {
    logger.error("AI provider error in parallel resume analysis", error);
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

  // Call appropriate provider with error handling
  try {
    switch (selection.provider) {
      case "anthropic":
        return await anthropic.analyzeJobDescription(title, description);
      case "openai":
        return await openai.analyzeJobDescription(title, description);
      case "groq":
      default:
        return await groq.analyzeJobDescription(title, description);
    }
  } catch (error) {
    logger.error("AI provider error in job description analysis", error);
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

  // Call appropriate provider with error handling
  let matchResult: MatchAnalysisResponse;
  try {
    switch (selection.provider) {
      case "anthropic":
        matchResult = await anthropic.analyzeMatch(resumeAnalysis, jobAnalysis);
        break;
      case "openai":
        matchResult = await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
        break;
      case "groq":
      default:
        matchResult = await groq.analyzeMatch(
          resumeAnalysis,
          jobAnalysis,
          resumeText,
          jobText,
        );
        break;
    }
  } catch (error) {
    logger.error("AI provider error in match analysis", error);
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

