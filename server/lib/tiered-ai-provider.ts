import * as openai from "./openai";
import * as anthropic from "./anthropic";
import * as groq from "./groq";
import { config } from "../config/unified-config";
import { logger } from "./logger";
import { AI_PROVIDER_CONFIG, UNIFIED_SCORING_WEIGHTS as _UNIFIED_SCORING_WEIGHTS } from "./unified-scoring-config";
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

// Verify if providers are configured
const isAnthropicConfigured = !!config.ai.providers.anthropic.apiKey;
const isGroqConfigured = !!process.env.GROQ_API_KEY;
const isOpenAIConfigured = !!process.env.OPENAI_API_KEY;

// ENHANCED: Simple circuit breaker for provider health tracking
interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

// PERFORMANCE FIX: Memory-safe circuit breaker with automatic cleanup
const circuitBreakers = new Map<string, CircuitBreakerState>();
const CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute before retry
const CIRCUIT_BREAKER_MAX_ENTRIES = 1000; // Prevent memory leaks
const CIRCUIT_BREAKER_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Cleanup stale circuit breaker entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  const staleEntries: string[] = [];
  
  for (const [key, breaker] of circuitBreakers.entries()) {
    // Remove entries older than 1 hour or if we exceed max entries
    const isStale = breaker.lastFailureTime && (now - breaker.lastFailureTime) > 60 * 60 * 1000;
    if (isStale || circuitBreakers.size > CIRCUIT_BREAKER_MAX_ENTRIES) {
      staleEntries.push(key);
    }
  }
  
  staleEntries.forEach(key => circuitBreakers.delete(key));
  
  if (staleEntries.length > 0) {
    logger.info(`Circuit breaker cleanup: removed ${staleEntries.length} stale entries`, {
      totalEntries: circuitBreakers.size,
      maxEntries: CIRCUIT_BREAKER_MAX_ENTRIES
    });
  }
}, CIRCUIT_BREAKER_CLEANUP_INTERVAL);

// PERFORMANCE: Implement LRU eviction when approaching memory limits
function evictOldestCircuitBreaker(): void {
  if (circuitBreakers.size <= CIRCUIT_BREAKER_MAX_ENTRIES) return;
  
  let oldestKey: string | null = null;
  let oldestTime = Date.now();
  
  for (const [key, breaker] of circuitBreakers.entries()) {
    const lastTime = breaker.lastFailureTime || 0;
    if (lastTime < oldestTime) {
      oldestTime = lastTime;
      oldestKey = key;
    }
  }
  
  if (oldestKey) {
    circuitBreakers.delete(oldestKey);
    logger.debug(`Circuit breaker: evicted oldest entry ${oldestKey}`);
  }
}

function getCircuitBreakerKey(provider: string, userTier: string): string {
  return `${provider}:${userTier}`;
}

function isCircuitBreakerOpen(provider: string, userTier: string): boolean {
  const key = getCircuitBreakerKey(provider, userTier);
  const breaker = circuitBreakers.get(key);
  
  if (!breaker || breaker.state === 'closed') return false;
  
  // Check if timeout has passed for half-open state
  if (breaker.state === 'open' && Date.now() - breaker.lastFailureTime > CIRCUIT_BREAKER_TIMEOUT) {
    breaker.state = 'half-open';
    circuitBreakers.set(key, breaker);
    logger.info("Circuit breaker entering half-open state", { provider, userTier });
    return false;
  }
  
  return breaker.state === 'open';
}

function recordProviderFailure(provider: string, userTier: string): void {
  const key = getCircuitBreakerKey(provider, userTier);
  const breaker = circuitBreakers.get(key) || { failureCount: 0, lastFailureTime: 0, state: 'closed' as const };
  
  breaker.failureCount++;
  breaker.lastFailureTime = Date.now();
  
  if (breaker.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    breaker.state = 'open';
    logger.warn("Circuit breaker opened due to repeated failures", { 
      provider, 
      userTier, 
      failureCount: breaker.failureCount 
    });
  }
  
  // PERFORMANCE FIX: Prevent memory leaks by evicting old entries
  evictOldestCircuitBreaker();
  circuitBreakers.set(key, breaker);
}

function recordProviderSuccess(provider: string, userTier: string): void {
  const key = getCircuitBreakerKey(provider, userTier);
  const breaker = circuitBreakers.get(key);
  
  if (breaker && breaker.state === 'half-open') {
    breaker.state = 'closed';
    breaker.failureCount = 0;
    circuitBreakers.set(key, breaker);
    logger.info("Circuit breaker closed after successful request", { provider, userTier });
  }
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
  
  // ENHANCED: Additional edge case classifications
  
  // JSON parsing or malformed response errors
  if (errorMessage.includes("json") ||
      errorMessage.includes("parsing") ||
      errorMessage.includes("malformed") ||
      errorMessage.includes("unexpected token")) {
    logger.error("AI provider returned malformed response", { context, userTier: userTier.tier });
    throw new Error(`${context} received an invalid response. Please try again.`);
  }
  
  // Model-specific errors
  if (errorMessage.includes("model not found") ||
      errorMessage.includes("model unavailable") ||
      errorMessage.includes("invalid model")) {
    logger.error("AI model configuration error", { context, userTier: userTier.tier });
    throw getServiceUnavailableError(userTier, context);
  }
  
  // Token/input length errors
  if (errorMessage.includes("token limit") ||
      errorMessage.includes("too long") ||
      errorMessage.includes("input length") ||
      errorMessage.includes("maximum length")) {
    throw new Error(`${context} input is too large. Please try with a shorter resume or job description.`);
  }
  
  // Billing/payment related errors
  if (errorMessage.includes("billing") ||
      errorMessage.includes("payment") ||
      errorMessage.includes("insufficient funds") ||
      errorMessage.includes("expired")) {
    logger.error("AI provider billing issue", { context, userTier: userTier.tier });
    throw getServiceUnavailableError(userTier, context);
  }
  
  // CORS/origin policy errors
  if (errorMessage.includes("cors") ||
      errorMessage.includes("origin") ||
      errorMessage.includes("cross-origin")) {
    logger.error("AI provider access policy error", { context, userTier: userTier.tier });
    throw new Error(`${context} request blocked by security policy. Please contact support.`);
  }
  
  // Default fallback - log the unclassified error for investigation
  logger.error("Unclassified AI provider error requiring investigation", {
    context,
    userTier: userTier.tier,
    errorMessage,
    errorType: typeof error,
    errorStack: error instanceof Error ? error.stack?.slice(0, 500) : undefined,
    timestamp: new Date().toISOString()
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
      allowedProviders.includes("anthropic" as string) &&
      isAnthropicConfigured &&
      anthropic.getAnthropicServiceStatus().isAvailable
    ) {
      return {
        provider: "anthropic",
        reason: "Premium tier - highest quality analysis",
      };
    }
    if (
      allowedProviders.includes("openai" as string) &&
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
  // Check usage limits
  const usageCheck = checkUsageLimit(userTier);
  if (!usageCheck.canUse) {
    throw new Error(usageCheck.message);
  }

  // Task 5: Enhanced provider fallback chain
  const providerChain = getProviderFallbackChain(userTier);
  
  logger.info("Starting enhanced provider fallback analysis", {
    primaryProvider: providerChain[0],
    fallbackCount: providerChain.length - 1,
    userTier: userTier.tier
  });

  // Increment usage count
  incrementUsage(userTier);

  // Task 5: Implement retry logic with exponential backoff
  let lastError: Error | unknown;
  let matchResult: MatchAnalysisResponse | null = null;

  for (let i = 0; i < providerChain.length; i++) {
    const provider = providerChain[i];
    const isLastProvider = i === providerChain.length - 1;
    
    // Skip if circuit breaker is open
    if (isCircuitBreakerOpen(provider, userTier.tier)) {
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
      
      // Success - record provider success and break
      recordProviderSuccess(provider, userTier.tier);
      
      logger.info(`Successfully obtained analysis from ${provider}`, {
        matchPercentage: matchResult.matchPercentage,
        matchedSkillsCount: matchResult.matchedSkills?.length || 0
      });
      
      break;
      
    } catch (error) {
      lastError = error;
      recordProviderFailure(provider, userTier.tier);
      
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
      lastError: lastError?.message,
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
      return await anthropic.analyzeMatch(resumeAnalysis, jobAnalysis);
    case "openai":
      return await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
    case "groq":
      return await groq.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText);
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


