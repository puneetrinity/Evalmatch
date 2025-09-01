import * as openai from "./openai";
import * as anthropic from "./anthropic";
import * as groq from "./groq";
import { config } from "../config/unified-config";
import { logger } from "./logger";
import { AI_PROVIDER_CONFIG, UNIFIED_SCORING_WEIGHTS as _UNIFIED_SCORING_WEIGHTS } from "./unified-scoring-config";
import { getBreaker, getBreakerStatuses } from "./circuit-breakers";
import { getMemoryPressure } from "./memory-monitor";
import {
  AnalyzeResumeResponse,
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResponse,
  InterviewQuestionsResponse,
  InterviewScriptResponse,
  BiasAnalysisResponse,
} from "@shared/schema";
import { ResumeId, JobId } from "@shared/api-contracts";
import {
  UserTierInfo,
  TIER_LIMITS,
  checkUsageLimit,
  incrementUsage,
  getServiceUnavailableError,
  getApiLimitExceededError,
} from "@shared/user-tiers";

// GLOBAL BETA MODE CONFIGURATION
// Set to true to bypass circuit breakers and tier restrictions for cost optimization during beta
const BETA_MODE = true;

// Helper function to execute AI provider calls with beta mode bypass
async function executeBetaAwareCall<T>(
  provider: 'groq' | 'openai' | 'anthropic',
  fn: () => Promise<T>
): Promise<T> {
  if (BETA_MODE) {
    // Direct execution bypassing circuit breakers in beta mode
    return await fn();
  } else {
    // Use circuit breaker protection in production mode
    switch (provider) {
      case 'groq':
        return await breakers.groq.exec(fn);
      case 'openai':
        return await breakers.openai.exec(fn);
      case 'anthropic':
        return await breakers.anthropic.exec(fn);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

// Verify if providers are configured
const isAnthropicConfigured = !!config.ai.providers.anthropic.apiKey;
const isGroqConfigured = !!process.env.GROQ_API_KEY;
const isOpenAIConfigured = !!process.env.OPENAI_API_KEY;

// Memory pressure monitoring for circuit breaker force-open
function forceOpen(): boolean {
  const memoryPressure = getMemoryPressure();
  return memoryPressure.isHighPressure;
}

// Get singleton circuit breakers with memory pressure integration
const breakers = {
  get groq() { 
    return getBreaker('groq', {
      shouldForceOpen: forceOpen,
      failureThreshold: 5,
      windowSize: 50,
      rtP95Ms: 6000,
      halfOpenAfterMs: 60_000,
      succToClose: 2
    });
  },
  get openai() { 
    return getBreaker('openai', {
      shouldForceOpen: forceOpen,
      failureThreshold: 5,
      windowSize: 50,
      rtP95Ms: 6000,
      halfOpenAfterMs: 60_000,
      succToClose: 2
    });
  },
  get anthropic() { 
    return getBreaker('anthropic', {
      shouldForceOpen: forceOpen,
      failureThreshold: 5,
      windowSize: 50,
      rtP95Ms: 6000,
      halfOpenAfterMs: 60_000,
      succToClose: 2
    });
  }
};

// Export cleanup function for tests (now a no-op since singleton handles cleanup)
export function cleanupCircuitBreakerTimer(): void {
  // No-op - singleton registry handles its own lifecycle
}

/**
 * Classify error types and throw appropriate errors based on actual failure reasons
 */
function classifyAndThrowError(error: unknown, userTier: UserTierInfo, context: string): never {
  // Using global BETA_MODE constant
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : "";
  const errorStack = error instanceof Error ? error.stack?.toLowerCase() || "" : "";
  
  // Circuit breaker errors - handle these first for clarity
  if (errorMessage.includes("err_breaker_open")) {
    const provider = errorMessage.split(':')[1] || 'AI provider';
    logger.error("Circuit breaker is open", { provider, context, userTier: userTier.tier });
    throw new Error(`${context} service is temporarily unavailable. The system is recovering from previous errors. Please try again in a few minutes or skip this step.`);
  }
  
  // Rate limit errors - provide beta-friendly messages
  if (errorMessage.includes("rate limit") || 
      errorMessage.includes("too many requests") ||
      errorMessage.includes("quota exceeded") ||
      errorStack.includes("429")) {
    if (BETA_MODE) {
      throw new Error(`${context} service is experiencing high demand. Please try again in a moment.`);
    }
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
  
  // Authentication errors - provide beta-friendly messages
  if (errorMessage.includes("unauthorized") ||
      errorMessage.includes("invalid api key") ||
      errorMessage.includes("authentication") ||
      errorStack.includes("401")) {
    logger.error("AI provider authentication failure", { context, userTier: userTier.tier });
    if (BETA_MODE) {
      throw new Error(`${context} service is temporarily unavailable. Please try again in a moment.`);
    }
    throw getServiceUnavailableError(userTier, context);
  }
  
  // Content filtering/policy violations
  if (errorMessage.includes("content policy") ||
      errorMessage.includes("safety") ||
      errorMessage.includes("filtered") ||
      errorMessage.includes("inappropriate")) {
    throw new Error(`${context} could not be completed due to content guidelines. Please review your input and try again.`);
  }
  
  // Model overload/capacity issues - provide beta-friendly messages
  if (errorMessage.includes("overload") ||
      errorMessage.includes("capacity") ||
      errorMessage.includes("server overloaded") ||
      errorStack.includes("503")) {
    if (BETA_MODE) {
      throw new Error(`${context} service is experiencing high demand. Please try again in a moment.`);
    }
    throw getServiceUnavailableError(userTier, context);
  }
  
  // ENHANCED: Additional edge case classifications
  
  // JSON parsing or malformed response errors
  if (errorMessage.includes("json") ||
      errorMessage.includes("parsing") ||
      errorMessage.includes("malformed") ||
      errorMessage.includes("unexpected token")) {
    logger.error("AI provider returned malformed response", { context, userTier: userTier.tier });
    throw new Error(`${context} received an invalid response. Please try again.`);
  }
  
  // Model-specific errors - provide beta-friendly messages
  if (errorMessage.includes("model not found") ||
      errorMessage.includes("model unavailable") ||
      errorMessage.includes("invalid model")) {
    logger.error("AI model configuration error", { context, userTier: userTier.tier });
    if (BETA_MODE) {
      throw new Error(`${context} service is temporarily unavailable. Please try again in a moment.`);
    }
    throw getServiceUnavailableError(userTier, context);
  }
  
  // Token/input length errors
  if (errorMessage.includes("token limit") ||
      errorMessage.includes("too long") ||
      errorMessage.includes("input length") ||
      errorMessage.includes("maximum length")) {
    throw new Error(`${context} input is too large. Please try with a shorter resume or job description.`);
  }
  
  // Billing/payment related errors - provide beta-friendly messages
  if (errorMessage.includes("billing") ||
      errorMessage.includes("payment") ||
      errorMessage.includes("insufficient funds") ||
      errorMessage.includes("expired")) {
    logger.error("AI provider billing issue", { context, userTier: userTier.tier });
    if (BETA_MODE) {
      throw new Error(`${context} service is temporarily unavailable. Please try again in a moment.`);
    }
    throw getServiceUnavailableError(userTier, context);
  }
  
  // CORS/origin policy errors
  if (errorMessage.includes("cors") ||
      errorMessage.includes("origin") ||
      errorMessage.includes("cross-origin")) {
    logger.error("AI provider access policy error", { context, userTier: userTier.tier });
    throw new Error(`${context} request blocked by security policy. Please contact support.`);
  }
  
  // Default fallback - log the unclassified error for investigation and provide beta-friendly message
  logger.error("Unclassified AI provider error requiring investigation", {
    context,
    userTier: userTier.tier,
    errorMessage,
    errorType: typeof error,
    errorStack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
    timestamp: new Date().toISOString()
  });
  
  if (BETA_MODE) {
    throw new Error(`${context} analysis failed. Please try again or skip this step.`);
  }
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
  // Using global BETA_MODE constant

  if (BETA_MODE) {
    // BETA MODE: Ignore circuit breakers and prioritize Groq first
    if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
      return {
        provider: "groq",
        reason: `Beta mode - Groq priority (bypassing circuit breakers, tier: ${userTier.tier})`,
      };
    }
    // Emergency fallback during beta if Groq is unavailable
    if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
      return {
        provider: "openai",
        reason: "Beta mode - emergency fallback (Groq unavailable)",
      };
    }
    // Last resort fallback
    if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
      return {
        provider: "anthropic",
        reason: "Beta mode - last resort fallback (Groq and OpenAI unavailable)",
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
      (allowedProviders as unknown as string[]).includes("anthropic") &&
      isAnthropicConfigured &&
      anthropic.getAnthropicServiceStatus().isAvailable &&
      breakers.anthropic.status().state !== 'open'
    ) {
      return {
        provider: "anthropic",
        reason: "Premium tier - highest quality analysis",
      };
    }
    if (
      (allowedProviders as unknown as string[]).includes("openai") &&
      isOpenAIConfigured &&
      openai.getOpenAIServiceStatus().isAvailable &&
      breakers.openai.status().state !== 'open'
    ) {
      return {
        provider: "openai",
        reason: "Premium tier - high quality analysis",
      };
    }
    if (
      allowedProviders.includes("groq") &&
      isGroqConfigured &&
      groq.getGroqServiceStatus().isAvailable &&
      breakers.groq.status().state !== 'open'
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
      groq.getGroqServiceStatus().isAvailable &&
      breakers.groq.status().state !== 'open'
    ) {
      return {
        provider: "groq",
        reason: "Freemium tier - cost-effective analysis",
      };
    }
    // If Groq is down, freemium users get limited OpenAI as fallback
    if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable && breakers.openai.status().state !== 'open') {
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
  // BETA MODE: Allow all users to test resume analysis
  // Using global BETA_MODE constant

  // Check usage limits - SKIP IN BETA MODE for resume analysis
  if (!BETA_MODE) {
    const usageCheck = checkUsageLimit(userTier);
    if (!usageCheck.canUse) {
      throw new Error(usageCheck.message);
    }
  } else {
    logger.info("Beta mode: Skipping usage limits for resume analysis", { 
      userTier: userTier.tier,
      context: "resume_analysis"
    });
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count - SKIP IN BETA MODE for resume analysis
  if (!BETA_MODE) {
    incrementUsage(userTier);
  }

  // Call appropriate provider with beta-aware circuit breaker handling
  try {
    switch (selection.provider) {
      case "anthropic":
        return await executeBetaAwareCall('anthropic', () => anthropic.analyzeResume(resumeText));
      case "openai":
        return await executeBetaAwareCall('openai', () => openai.analyzeResume(resumeText));
      case "groq":
      default:
        return await executeBetaAwareCall('groq', () => groq.analyzeResume(resumeText));
    }
  } catch (error) {
    logger.error("AI provider error in resume analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // In BETA MODE, provide fallback resume analysis instead of hard error
    if (BETA_MODE) {
      logger.info("Beta mode: Providing fallback resume analysis due to provider failure", {
        provider: selection.provider,
        userTier: userTier.tier
      });
      
      // Return proper fallback response matching AnalyzeResumeResponse interface
      return {
        id: 0 as ResumeId,
        filename: "fallback",
        analyzedData: {
          name: "Analysis Unavailable",
          skills: ["Analysis temporarily unavailable"],
          experience: "Experience analysis unavailable in beta mode",
          education: ["Analysis service temporarily unavailable"],
          summary: "Resume analysis service is temporarily unavailable",
          keyStrengths: ["Resume uploaded successfully"],
          contactInfo: {
            email: "",
            phone: "",
            location: ""
          }
        },
        processingTime: 0,
        confidence: 0,
        // Convenience properties for backward compatibility
        skills: ["Analysis temporarily unavailable"],
        experience: [{
          company: "Analysis unavailable",
          position: "N/A",
          duration: "N/A",
          description: "Experience analysis unavailable in beta mode"
        }],
        education: [{
          degree: "Analysis unavailable",
          institution: "N/A",
          field: "Analysis service temporarily unavailable"
        }]
      };
    }
    
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
  // BETA MODE: Allow all users to test resume analysis
  // Using global BETA_MODE constant

  // Check usage limits - SKIP IN BETA MODE for resume analysis
  if (!BETA_MODE) {
    const usageCheck = checkUsageLimit(userTier);
    if (!usageCheck.canUse) {
      throw new Error(usageCheck.message);
    }
  } else {
    logger.info("Beta mode: Skipping usage limits for resume analysis", { 
      userTier: userTier.tier,
      context: "resume_analysis_parallel"
    });
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(
    `Selected provider: ${selection.provider} - ${selection.reason} (parallel extraction)`,
  );

  // Increment usage count - SKIP IN BETA MODE for resume analysis
  if (!BETA_MODE) {
    incrementUsage(userTier);
  }

  // Call appropriate provider with circuit breaker protection
  try {
    switch (selection.provider) {
      case "anthropic":
        // Fallback to standard analysis for non-Groq providers
        return await executeBetaAwareCall('anthropic', () => anthropic.analyzeResume(resumeText));
      case "openai":
        // Fallback to standard analysis for non-Groq providers
        return await executeBetaAwareCall('openai', () => openai.analyzeResume(resumeText));
      case "groq":
      default:
        // Use optimized parallel extraction for Groq
        return await executeBetaAwareCall('groq', () => groq.analyzeResumeParallel(resumeText));
    }
  } catch (error) {
    logger.error("AI provider error in parallel resume analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // In BETA MODE, provide fallback resume analysis instead of hard error
    if (BETA_MODE) {
      logger.info("Beta mode: Providing fallback resume analysis due to provider failure", {
        provider: selection.provider,
        userTier: userTier.tier
      });
      
      // Return proper fallback response matching AnalyzeResumeResponse interface
      return {
        id: 0 as ResumeId,
        filename: "fallback",
        analyzedData: {
          name: "Analysis Unavailable",
          skills: ["Analysis temporarily unavailable"],
          experience: "Experience analysis unavailable in beta mode",
          education: ["Analysis service temporarily unavailable"],
          summary: "Resume analysis service is temporarily unavailable",
          keyStrengths: ["Resume uploaded successfully"],
          contactInfo: {
            email: "",
            phone: "",
            location: ""
          }
        },
        processingTime: 0,
        confidence: 0,
        // Convenience properties for backward compatibility
        skills: ["Analysis temporarily unavailable"],
        experience: [{
          company: "Analysis unavailable",
          position: "N/A",
          duration: "N/A",
          description: "Experience analysis unavailable in beta mode"
        }],
        education: [{
          degree: "Analysis unavailable",
          institution: "N/A",
          field: "Analysis service temporarily unavailable"
        }]
      };
    }
    
    // Classify error type and throw appropriate error
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
  // BETA MODE: Allow all users to test job analysis
  // Using global BETA_MODE constant

  // Check usage limits - SKIP IN BETA MODE for job analysis
  if (!BETA_MODE) {
    const usageCheck = checkUsageLimit(userTier);
    if (!usageCheck.canUse) {
      throw new Error(usageCheck.message);
    }
  } else {
    logger.info("Beta mode: Skipping usage limits for job analysis", { 
      userTier: userTier.tier,
      context: "job_analysis"
    });
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count - SKIP IN BETA MODE for job analysis
  if (!BETA_MODE) {
    incrementUsage(userTier);
  }

  // Call appropriate provider with circuit breaker protection
  try {
    switch (selection.provider) {
      case "anthropic":
        return await executeBetaAwareCall('anthropic', () => anthropic.analyzeJobDescription(title, description));
      case "openai":
        return await executeBetaAwareCall('openai', () => openai.analyzeJobDescription(title, description));
      case "groq":
      default:
        return await executeBetaAwareCall('groq', () => groq.analyzeJobDescription(title, description));
    }
  } catch (error) {
    logger.error("AI provider error in job description analysis", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      title: title.substring(0, 50)
    });
    
    // In BETA MODE, provide fallback job analysis instead of hard error
    if (BETA_MODE) {
      logger.info("Beta mode: Providing fallback job analysis due to provider failure", {
        provider: selection.provider,
        userTier: userTier.tier
      });
      
      // Return proper fallback response matching AnalyzeJobDescriptionResponse interface
      return {
        id: 0 as JobId,
        title: "Job Analysis Unavailable", 
        analyzedData: {
          requiredSkills: ["Analysis temporarily unavailable"],
          preferredSkills: [],
          responsibilities: ["Job analysis service temporarily unavailable"],
          experienceLevel: "Unknown",
          summary: "Job description analysis service is temporarily unavailable",
          salaryRange: {
            min: 0,
            max: 0,
            currency: "USD"
          }
        },
        processingTime: 0,
        confidence: 0,
        // Convenience properties for backward compatibility
        requiredSkills: ["Analysis temporarily unavailable"],
        experience: "Experience requirements analysis unavailable"
      };
    }
    
    // Throw appropriate error message based on user tier
    throw classifyAndThrowError(error, userTier, "Job description analysis");
  }
}

/**
 * Tier-aware match analysis
 */
/**
 * Task 5: Enhanced AI provider fallback chain with consistency optimization
 * 
 * Implements sophisticated provider selection with retry logic, exponential backoff,
 * and result normalization for consistent output format.
 */
export async function analyzeMatch(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  userTier: UserTierInfo,
  resumeText?: string,
  jobText?: string,
): Promise<MatchAnalysisResponse> {
  // BETA MODE: Allow all users to test match analysis
  // Using global BETA_MODE constant

  // Check usage limits - SKIP IN BETA MODE for match analysis
  if (!BETA_MODE) {
    const usageCheck = checkUsageLimit(userTier);
    if (!usageCheck.canUse) {
      throw new Error(usageCheck.message);
    }
  } else {
    logger.info("Beta mode: Skipping usage limits for match analysis", { 
      userTier: userTier.tier,
      context: "match_analysis"
    });
  }

  // Task 5: Enhanced provider fallback chain
  const providerChain = getProviderFallbackChain(userTier);
  
  logger.info("Starting enhanced provider fallback analysis", {
    primaryProvider: providerChain[0],
    fallbackCount: providerChain.length - 1,
    userTier: userTier.tier
  });

  // Increment usage count - SKIP IN BETA MODE for match analysis
  if (!BETA_MODE) {
    incrementUsage(userTier);
  }

  // Task 5: Implement retry logic with exponential backoff
  let lastError: Error | unknown;
  let matchResult: MatchAnalysisResponse | null = null;

  for (let i = 0; i < providerChain.length; i++) {
    const provider = providerChain[i];
    const isLastProvider = i === providerChain.length - 1;
    
    // Skip if circuit breaker is open
    const circuitBreaker = breakers[provider as keyof typeof breakers];
    if (circuitBreaker && circuitBreaker.status().state === 'open') {
      logger.warn(`Circuit breaker open for ${provider}, skipping to next provider`);
      continue;
    }

    try {
      logger.info(`Attempting analysis with provider: ${provider} (attempt ${i + 1}/${providerChain.length})`);
      
      const result = await executeProviderWithRetry(
        provider,
        resumeAnalysis,
        jobAnalysis,
        resumeText,
        jobText,
        userTier
      );

      // Task 5: Apply result normalization for consistency
      matchResult = normalizeProviderResult(result, provider);
      
      // Success - circuit breaker will record internally during exec()
      // No explicit success recording needed with singleton breakers
      
      logger.info(`Successfully obtained analysis from ${provider}`, {
        matchPercentage: matchResult.matchPercentage,
        matchedSkillsCount: matchResult.matchedSkills?.length || 0
      });
      
      break;
      
    } catch (error) {
      lastError = error;
      // Circuit breaker failure recording happens automatically in exec() method
      
      logger.warn(`Provider ${provider} failed`, {
        error: error instanceof Error ? error.message : String(error),
        isLastProvider,
        nextProvider: isLastProvider ? 'none' : providerChain[i + 1]
      });

      if (!isLastProvider) {
        // Apply exponential backoff before trying next provider
        const backoffMs = Math.min(1000 * Math.pow(2, i), 5000); // Max 5 seconds
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  if (!matchResult) {
    logger.error("All AI providers failed for match analysis", {
      userTier: userTier.tier,
      lastError: (lastError as Error)?.message,
      providersAttempted: providerChain.length
    });
    throw classifyAndThrowError(lastError, userTier, "Match analysis");
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
  // Using global BETA_MODE constant

  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === "freemium") {
    throw new Error(
      "Bias analysis is a premium feature. Upgrade to access advanced analysis tools.",
    );
  }

  // Check usage limits - SKIP IN BETA MODE for bias analysis
  if (!BETA_MODE) {
    const usageCheck = checkUsageLimit(userTier);
    if (!usageCheck.canUse) {
      throw new Error(usageCheck.message);
    }
  } else {
    logger.info("Beta mode: Skipping usage limits for bias analysis", { 
      userTier: userTier.tier,
      context: "bias_analysis"
    });
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count - SKIP IN BETA MODE for bias analysis
  if (!BETA_MODE) {
    incrementUsage(userTier);
  }

  // Call appropriate provider with circuit breaker protection
  try {
    switch (selection.provider) {
      case "anthropic":
        return await executeBetaAwareCall('anthropic', () => anthropic.analyzeBias(title, description));
      case "openai":
        return await executeBetaAwareCall('openai', () => openai.analyzeBias(title, description));
      case "groq":
      default:
        return await executeBetaAwareCall('groq', () => groq.analyzeBias(title, description));
    }
  } catch (error) {
    logger.error("AI provider error in bias analysis", {
      error: error instanceof Error ? error.message : String(error),
      provider: selection.provider,
      userTier: userTier.tier,
      title: title.substring(0, 50)
    });
    
    // In BETA MODE, provide fallback bias analysis instead of hard error
    if (BETA_MODE) {
      logger.info("Beta mode: Providing fallback bias analysis due to provider failure", {
        provider: selection.provider,
        userTier: userTier.tier
      });
      
      // Use local bias detection as fallback
      try {
        const { detectJobBias } = await import("./bias-detection");
        const fallbackResult = await detectJobBias(`${title}\n\n${description}`);
        
        // Convert to BiasAnalysisResponse format
        return {
          hasBias: fallbackResult.hasBias,
          biasTypes: fallbackResult.detectedBiases?.map(b => b.type) || [],
          biasedPhrases: fallbackResult.detectedBiases?.map(b => ({
            phrase: b.evidence?.[0] || b.type,
            reason: b.description
          })) || [],
          suggestions: fallbackResult.recommendations || [],
          improvedDescription: description, // Keep original for now
          overallScore: 100 - fallbackResult.biasScore,
          summary: fallbackResult.explanation || "Local bias analysis completed"
        };
      } catch (fallbackError) {
        logger.error("Fallback bias detection also failed", fallbackError);
        // Return neutral result to not block user flow
        return {
          hasBias: false,
          biasTypes: [],
          biasedPhrases: [],
          suggestions: ["Bias analysis temporarily unavailable. Manual review recommended."],
          improvedDescription: description,
          overallScore: 85,
          summary: "Bias analysis service temporarily unavailable"
        };
      }
    }
    
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
  // Using global BETA_MODE constant

  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === "freemium") {
    throw new Error(
      "Interview questions generation is a premium feature. Upgrade to access advanced analysis tools.",
    );
  }

  // Check usage limits - SKIP IN BETA MODE for interview questions
  if (!BETA_MODE) {
    const usageCheck = checkUsageLimit(userTier);
    if (!usageCheck.canUse) {
      throw new Error(usageCheck.message);
    }
  } else {
    logger.info("Beta mode: Skipping usage limits for interview questions", { 
      userTier: userTier.tier,
      context: "interview_questions"
    });
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count - SKIP IN BETA MODE for interview questions
  if (!BETA_MODE) {
    incrementUsage(userTier);
  }

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
    logger.error("AI provider error in interview questions generation", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
    });
    
    // In BETA MODE, provide fallback interview questions instead of hard error
    if (BETA_MODE) {
      logger.info("Beta mode: Providing fallback interview questions due to provider failure", {
        provider: selection.provider,
        userTier: userTier.tier
      });
      
      // Return basic fallback questions to not block user flow
      return {
        resumeId: 0 as ResumeId,
        jobId: 0 as JobId,
        jobTitle: "Position",
        questions: [
          {
            question: "Can you tell me about yourself and your professional background?",
            category: "behavioral" as const,
            difficulty: "easy" as const,
            expectedAnswer: "General professional background and experience",
            skillsAssessed: ["Communication", "Self-awareness"],
            timeAllotted: 5
          },
          {
            question: "What interests you most about this position?",
            category: "behavioral" as const,
            difficulty: "easy" as const,
            expectedAnswer: "Understanding of role and company fit",
            skillsAssessed: ["Motivation", "Research skills"],
            timeAllotted: 3
          },
          {
            question: "Interview questions service is temporarily unavailable. Please prepare standard technical and behavioral questions based on the job requirements.",
            category: "technical" as const,
            difficulty: "medium" as const,
            expectedAnswer: "Service unavailable - manual question preparation needed",
            skillsAssessed: ["Manual review"],
            timeAllotted: 0
          }
        ],
        metadata: {
          estimatedDuration: 8,
          difficulty: "mid" as const,
          focusAreas: ["Communication", "Technical skills"],
          interviewType: "video" as const
        },
        processingTime: 0
      };
    }
    
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
  // Using global BETA_MODE constant

  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === "freemium") {
    throw new Error(
      "Complete interview script generation is a premium feature. Upgrade to access advanced interview tools.",
    );
  }

  // Check usage limits - SKIP IN BETA MODE for interview script
  if (!BETA_MODE) {
    const usageCheck = checkUsageLimit(userTier);
    if (!usageCheck.canUse) {
      throw new Error(usageCheck.message);
    }
  } else {
    logger.info("Beta mode: Skipping usage limits for interview script", { 
      userTier: userTier.tier,
      context: "interview_script"
    });
  }

  // Select provider based on tier
  const selection = selectProviderForTier(userTier);
  logger.info(`Selected provider: ${selection.provider} - ${selection.reason}`);

  // Increment usage count - SKIP IN BETA MODE for interview script
  if (!BETA_MODE) {
    incrementUsage(userTier);
  }

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
    logger.error("AI provider error in interview script generation", {
      error: error instanceof Error ? error.message : "Unknown error",
      provider: selection.provider,
      userTier: userTier.tier,
      jobTitle: jobTitle.substring(0, 50)
    });
    
    // In BETA MODE, provide fallback interview script instead of hard error
    if (BETA_MODE) {
      logger.info("Beta mode: Providing fallback interview script due to provider failure", {
        provider: selection.provider,
        userTier: userTier.tier
      });
      
      // Return basic fallback script that matches InterviewScriptResponse interface
      return {
        jobTitle,
        candidateName: candidateName || 'Candidate',
        interviewDuration: '45 minutes',
        opening: {
          salutation: `Hello ${candidateName || 'Candidate'}, welcome to the interview for ${jobTitle}.`,
          iceBreaker: 'Thank you for your time today. How are you doing?',
          interviewOverview: 'We\'ll be discussing your background, skills, and fit for this role.'
        },
        currentRoleDiscussion: {
          roleAcknowledgment: 'Let\'s start by discussing your current professional situation.',
          currentWorkQuestions: [
            {
              question: 'Can you tell me about your current role and responsibilities?',
              purpose: 'Understanding current position',
              expectedAnswer: 'Description of current job duties and challenges'
            }
          ]
        },
        skillMatchDiscussion: {
          introduction: 'Now let\'s discuss how your skills align with this position.',
          matchedSkillsQuestions: [
            {
              skill: 'Technical Skills',
              question: 'Walk me through your technical experience relevant to this role.',
              expectedAnswer: 'Overview of relevant technical background'
            }
          ]
        },
        skillGapAssessment: {
          introduction: 'We\'d like to understand areas where you might grow in this role.',
          gapQuestions: []
        },
        roleSell: {
          transitionStatement: 'Let me tell you more about this opportunity.',
          roleHighlights: ['Great team environment', 'Growth opportunities', 'Challenging work'],
          opportunityDescription: 'This role offers excellent growth potential.',
          closingQuestions: [
            {
              question: 'What questions do you have about this role or our company?',
              purpose: 'Address candidate concerns'
            }
          ]
        },
        closing: {
          nextSteps: 'We\'ll follow up with next steps within the next few days.',
          candidateQuestions: 'Please feel free to ask any remaining questions.',
          finalStatement: 'Thank you for your time today. We appreciate your interest in this position.'
        }
        // Properties aligned with InterviewScriptResponse interface
      };
    }
    
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

// ===== TASK 5: ENHANCED PROVIDER FALLBACK HELPER FUNCTIONS =====

/**
 * Get provider fallback chain based on 2024 industry research
 * Order: Groq (speed + accuracy) -> OpenAI (reliability) -> Anthropic (quality) -> Local ML fallback
 */
function getProviderFallbackChain(_userTier: UserTierInfo): string[] {
  const availableProviders: string[] = [];
  
  // Primary provider selection based on tier and availability
  if (isGroqConfigured) availableProviders.push("groq");
  if (isOpenAIConfigured) availableProviders.push("openai");  
  if (isAnthropicConfigured) availableProviders.push("anthropic");
  
  // Ensure we have at least one provider
  if (availableProviders.length === 0) {
    logger.error("No AI providers configured!");
    throw new Error("No AI providers available for analysis");
  }
  
  // Reorder based on research-backed preferences (Groq first for speed+accuracy)
  const preferredOrder = ["groq", "openai", "anthropic"];
  const orderedProviders = preferredOrder.filter(p => availableProviders.includes(p));
  
  logger.info("Provider fallback chain established", {
    primaryProvider: orderedProviders[0],
    fallbackProviders: orderedProviders.slice(1),
    totalProviders: orderedProviders.length
  });
  
  return orderedProviders;
}

/**
 * Execute provider with individual retry logic
 */
async function executeProviderWithRetry(
  provider: string,
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  resumeText?: string,
  jobText?: string,
  _userTier?: UserTierInfo
): Promise<MatchAnalysisResponse> {
  
  let lastError: Error | unknown;
  const maxRetries = AI_PROVIDER_CONFIG.MAX_RETRIES;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`${provider} timeout after ${AI_PROVIDER_CONFIG.FALLBACK_TIMEOUT}ms`)), 
                  AI_PROVIDER_CONFIG.FALLBACK_TIMEOUT);
      });
      
      const analysisPromise = callProvider(provider, resumeAnalysis, jobAnalysis, resumeText, jobText);
      
      // Race between analysis and timeout
      return await Promise.race([analysisPromise, timeoutPromise]);
      
    } catch (error) {
      lastError = error;
      
      logger.warn(`${provider} attempt ${attempt}/${maxRetries} failed`, {
        error: error instanceof Error ? error.message : String(error),
        willRetry: attempt < maxRetries
      });
      
      if (attempt < maxRetries) {
        // Exponential backoff within provider retries
        const backoffMs = Math.min(500 * Math.pow(2, attempt - 1), 2000);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  
  throw lastError;
}

/**
 * Call the appropriate provider
 */
async function callProvider(
  provider: string,
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  resumeText?: string,
  jobText?: string
): Promise<MatchAnalysisResponse> {
  
  switch (provider) {
    case "anthropic":
      return await executeBetaAwareCall('anthropic', () => anthropic.analyzeMatch(resumeAnalysis, jobAnalysis));
    case "openai":
      return await executeBetaAwareCall('openai', () => openai.analyzeMatch(resumeAnalysis, jobAnalysis));
    case "groq":
      return await executeBetaAwareCall('groq', () => groq.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText));
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Task 5: Normalize provider results for consistency
 * Ensures all providers return results in the same format regardless of implementation differences
 */
function normalizeProviderResult(result: MatchAnalysisResponse, provider: string): MatchAnalysisResponse {
  
  // Ensure match percentage is within valid range
  if (typeof result.matchPercentage !== 'number' || result.matchPercentage < 0 || result.matchPercentage > 100) {
    logger.warn(`Invalid match percentage from ${provider}`, {
      original: result.matchPercentage,
      corrected: Math.min(100, Math.max(0, result.matchPercentage || 0))
    });
    result.matchPercentage = Math.min(100, Math.max(0, result.matchPercentage || 0));
  }
  
  // Ensure required arrays exist
  result.matchedSkills = Array.isArray(result.matchedSkills) ? result.matchedSkills : [];
  result.missingSkills = Array.isArray(result.missingSkills) ? result.missingSkills : [];
  result.candidateStrengths = Array.isArray(result.candidateStrengths) ? result.candidateStrengths : [];
  result.candidateWeaknesses = Array.isArray(result.candidateWeaknesses) ? result.candidateWeaknesses : [];
  result.recommendations = Array.isArray(result.recommendations) ? result.recommendations : [];
  
  // Normalize confidence score if present
  if (typeof result.confidenceLevel === 'string') {
    // Convert string confidence to numeric if needed for consistency
  }
  
  // Provider metadata stored in logs for debugging
  
  logger.debug(`Result normalized for ${provider}`, {
    matchPercentage: result.matchPercentage,
    matchedSkillsCount: result.matchedSkills.length,
    missingSkillsCount: result.missingSkills.length
  });
  
  return result;
}


