import * as openai from './openai';
import * as anthropic from './anthropic';
import * as groq from './groq';
import { config } from '../config';
import { logger } from './logger';
import { 
  AnalyzeResumeResponse, 
  AnalyzeJobDescriptionResponse, 
  MatchAnalysisResponse, 
  InterviewQuestionsResponse,
  BiasAnalysisResponse 
} from '@shared/schema';
import { UserTierInfo, TIER_LIMITS, checkUsageLimit, incrementUsage } from '@shared/user-tiers';

// Verify if providers are configured
const isAnthropicConfigured = !!config.anthropicApiKey;
const isGroqConfigured = !!process.env.GROQ_API_KEY;
const isOpenAIConfigured = !!process.env.OPENAI_API_KEY;

interface TierAwareProviderSelection {
  provider: 'groq' | 'openai' | 'anthropic';
  reason: string;
}

/**
 * Select AI provider based on user tier and availability
 * BETA MODE: All users use Groq for cost optimization during beta testing
 */
function selectProviderForTier(userTier: UserTierInfo): TierAwareProviderSelection {
  // BETA MODE: Force all users to Groq for cost optimization
  // This will be removed after beta testing period (~1 month)
  const BETA_MODE = true; // Set to false to enable full tiered system
  
  if (BETA_MODE) {
    if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
      return { 
        provider: 'groq', 
        reason: `Beta mode - all users use cost-effective Groq (tier: ${userTier.tier})` 
      };
    }
    // Emergency fallback during beta if Groq is down
    if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
      return { 
        provider: 'openai', 
        reason: 'Beta mode - emergency fallback (Groq unavailable)' 
      };
    }
    // Last resort fallback
    if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
      return { 
        provider: 'anthropic', 
        reason: 'Beta mode - last resort fallback' 
      };
    }
  }
  
  // FULL TIERED SYSTEM (disabled during beta)
  const allowedProviders = TIER_LIMITS[userTier.tier].allowedProviders;
  
  // For premium users, prioritize quality: Anthropic > OpenAI > Groq
  if (userTier.tier === 'premium') {
    if (allowedProviders.includes('anthropic') && isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
      return { provider: 'anthropic', reason: 'Premium tier - highest quality analysis' };
    }
    if (allowedProviders.includes('openai') && isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
      return { provider: 'openai', reason: 'Premium tier - high quality analysis' };
    }
    if (allowedProviders.includes('groq') && isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
      return { provider: 'groq', reason: 'Premium tier - fallback to fast analysis' };
    }
  }
  
  // For freemium users, use Groq only
  if (userTier.tier === 'freemium') {
    if (allowedProviders.includes('groq') && isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
      return { provider: 'groq', reason: 'Freemium tier - cost-effective analysis' };
    }
    // If Groq is down, freemium users get limited OpenAI as fallback
    if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
      return { provider: 'openai', reason: 'Freemium tier - emergency fallback (Groq unavailable)' };
    }
  }
  
  // Fallback to any available provider
  if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {
    return { provider: 'groq', reason: 'Emergency fallback - Groq available' };
  }
  if (isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable) {
    return { provider: 'openai', reason: 'Emergency fallback - OpenAI available' };
  }
  if (isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable) {
    return { provider: 'anthropic', reason: 'Emergency fallback - Anthropic available' };
  }
  
  return { provider: 'openai', reason: 'Last resort fallback - using OpenAI built-in responses' };
}

/**
 * Tier-aware resume analysis
 */
export async function analyzeResume(resumeText: string, userTier: UserTierInfo): Promise<AnalyzeResumeResponse> {
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
  
  // Call appropriate provider
  switch (selection.provider) {
    case 'anthropic':
      return await anthropic.analyzeResume(resumeText);
    case 'openai':
      return await openai.analyzeResume(resumeText);
    case 'groq':
    default:
      return await groq.analyzeResume(resumeText);
  }
}

/**
 * Tier-aware job description analysis
 */
export async function analyzeJobDescription(title: string, description: string, userTier: UserTierInfo): Promise<AnalyzeJobDescriptionResponse> {
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
  
  // Call appropriate provider
  switch (selection.provider) {
    case 'anthropic':
      return await anthropic.analyzeJobDescription(title, description);
    case 'openai':
      return await openai.analyzeJobDescription(title, description);
    case 'groq':
    default:
      return await groq.analyzeJobDescription(title, description);
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
  jobText?: string
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
  
  // Call appropriate provider
  let matchResult: MatchAnalysisResponse;
  switch (selection.provider) {
    case 'anthropic':
      matchResult = await anthropic.analyzeMatch(resumeAnalysis, jobAnalysis);
      break;
    case 'openai':
      matchResult = await openai.analyzeMatch(resumeAnalysis, jobAnalysis);
      break;
    case 'groq':
    default:
      matchResult = await groq.analyzeMatch(resumeAnalysis, jobAnalysis, resumeText, jobText);
      break;
  }
  
  // Add fairness metrics for premium users
  if (userTier.tier === 'premium' && resumeText) {
    try {
      const { analyzeResumeFairness } = await import('./fairness-analyzer');
      const fairnessMetrics = await analyzeResumeFairness(resumeText, resumeAnalysis, matchResult);
      return { ...matchResult, fairnessMetrics };
    } catch (error) {
      logger.error('Error generating fairness metrics', error);
    }
  }
  
  return matchResult;
}

/**
 * Tier-aware bias analysis
 */
export async function analyzeBias(title: string, description: string, userTier: UserTierInfo): Promise<BiasAnalysisResponse> {
  // BETA MODE: Allow all users to test bias analysis
  const BETA_MODE = true; // Set to false to enable premium-only restrictions
  
  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === 'freemium') {
    throw new Error('Bias analysis is a premium feature. Upgrade to access advanced analysis tools.');
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
  
  // Call appropriate provider
  switch (selection.provider) {
    case 'anthropic':
      return await anthropic.analyzeBias(title, description);
    case 'openai':
      return await openai.analyzeBias(title, description);
    case 'groq':
    default:
      return await groq.analyzeBias(title, description);
  }
}

/**
 * Tier-aware interview questions generation
 */
export async function generateInterviewQuestions(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  matchAnalysis: MatchAnalysisResponse,
  userTier: UserTierInfo
): Promise<InterviewQuestionsResponse> {
  // BETA MODE: Allow all users to test interview questions generation
  const BETA_MODE = true; // Set to false to enable premium-only restrictions
  
  // Premium feature check (disabled during beta)
  if (!BETA_MODE && userTier.tier === 'freemium') {
    throw new Error('Interview questions generation is a premium feature. Upgrade to access advanced analysis tools.');
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
  
  // Call appropriate provider
  switch (selection.provider) {
    case 'anthropic':
      return await anthropic.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
    case 'openai':
      return await openai.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
    case 'groq':
    default:
      return await groq.generateInterviewQuestions(resumeAnalysis, jobAnalysis, matchAnalysis);
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
      resetDate: userTier.lastResetDate
    },
    availableProviders: allowedProviders.filter(provider => {
      switch (provider) {
        case 'groq': return isGroqConfigured && groq.getGroqServiceStatus().isAvailable;
        case 'openai': return isOpenAIConfigured && openai.getOpenAIServiceStatus().isAvailable;
        case 'anthropic': return isAnthropicConfigured && anthropic.getAnthropicServiceStatus().isAvailable;
        default: return false;
      }
    }),
    selectedProvider: selectProviderForTier(userTier),
    features: userTier.features
  };
}