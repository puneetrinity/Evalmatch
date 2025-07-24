export type UserTier = 'freemium' | 'premium';

export interface UserTierInfo {
  tier: UserTier;
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
    dailyAnalysisLimit: 10,
    allowedProviders: ['groq'],
    features: {
      basicAnalysis: true,
      advancedAnalysis: false,
      prioritySupport: false,
      unlimitedUsage: false,
      premiumModels: false,
    }
  },
  premium: {
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

export function incrementUsage(userTier: UserTierInfo): void {
  userTier.usageCount++;
}