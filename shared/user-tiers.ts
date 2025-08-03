export type UserTier = 'freemium' | 'premium';

export interface UserTierInfo {
  tier: UserTier;
  name: string;
  model: string;
  maxConcurrency: number;
  dailyAnalysisLimit: number;
  usageCount: number;
  lastResetDate: string;
  features: {
    basicAnalysis: boolean;
    advancedAnalysis: boolean;
    prioritySupport: boolean;
    unlimitedUsage: boolean;
    premiumModels: boolean;
  };
}

export const TIER_LIMITS = {
  freemium: {
    name: 'Freemium',
    model: 'groq-llama3',
    maxConcurrency: 2,
    dailyAnalysisLimit: 300, // Increased for testing (was 50)
    allowedProviders: ['groq'],
    features: {
      basicAnalysis: true,
      advancedAnalysis: true, // Enabled for beta testing
      prioritySupport: false,
      unlimitedUsage: false,
      premiumModels: false, // Still false, but BETA_MODE overrides this
    }
  },
  premium: {
    name: 'Premium',
    model: 'claude-3-sonnet',
    maxConcurrency: 10,
    dailyAnalysisLimit: -1, // unlimited
    allowedProviders: ['groq', 'openai', 'anthropic'],
    features: {
      basicAnalysis: true,
      advancedAnalysis: true,
      prioritySupport: true,
      unlimitedUsage: true,
      premiumModels: true,
    }
  }
} as const;

export function createDefaultUserTier(tier: UserTier = 'freemium'): UserTierInfo {
  return {
    tier,
    name: TIER_LIMITS[tier].name,
    model: TIER_LIMITS[tier].model,
    maxConcurrency: TIER_LIMITS[tier].maxConcurrency,
    dailyAnalysisLimit: TIER_LIMITS[tier].dailyAnalysisLimit,
    usageCount: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
    features: TIER_LIMITS[tier].features
  };
}

export function checkUsageLimit(userTier: UserTierInfo): { canUse: boolean; message?: string } {
  // Reset daily count if it's a new day
  const today = new Date().toISOString().split('T')[0];
  if (userTier.lastResetDate !== today) {
    userTier.usageCount = 0;
    userTier.lastResetDate = today;
  }

  // Premium users have unlimited usage
  if (userTier.tier === 'premium') {
    return { canUse: true };
  }

  // Check freemium limits
  if (userTier.usageCount >= userTier.dailyAnalysisLimit) {
    return { 
      canUse: false, 
      message: `Daily limit of ${userTier.dailyAnalysisLimit} analyses reached. Upgrade to Premium for unlimited usage.`
    };
  }

  return { canUse: true };
}

/**
 * Generate premium upgrade error messages for API exhaustion scenarios
 */
export function getApiLimitExceededError(userTier: UserTierInfo, context: string = 'API'): Error {
  if (userTier.tier === 'premium') {
    return new Error(`${context} service is temporarily unavailable. Please try again in a few minutes.`);
  } else {
    return new Error(`${context} limit reached for free tier users. Upgrade to Premium for unlimited access to advanced AI analysis and priority support.`);
  }
}

/**
 * Generate service unavailable error messages that encourage premium upgrades
 */
export function getServiceUnavailableError(userTier: UserTierInfo, serviceName: string = 'AI analysis'): Error {
  if (userTier.tier === 'premium') {
    return new Error(`${serviceName} service is temporarily experiencing high demand. Premium users get priority access - please try again in a moment.`);
  } else {
    return new Error(`${serviceName} service is currently at capacity for free tier users. Upgrade to Premium for guaranteed access and faster processing.`);
  }
}

export function incrementUsage(userTier: UserTierInfo): void {
  userTier.usageCount++;
}