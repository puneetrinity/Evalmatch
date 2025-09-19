/**
 * User Tiers Management
 * Re-exports from shared module and provides server-side functionality
 */

export * from "../../shared/user-tiers";
import { createDefaultUserTier, UserTierInfo } from "../../shared/user-tiers";
import { config } from '../config/unified-config';
import { creditService } from '../services/credit-service';

// Server-side user tier functions
export async function getUserTierInfo(userId: string): Promise<UserTierInfo> {
  // In beta mode, return premium tier for full feature access during development/testing
  if (config.features.betaMode) {
    return createDefaultUserTier("premium");
  }
  
  // Check user's credit balance to determine tier
  try {
    const creditResult = await creditService.getUserCredits(userId);
    
    // If user has credits (> 0), treat as credit tier for analysis purposes
    if (creditResult.success && (creditResult.credits || 0) > 0) {
      const creditTier = createDefaultUserTier("credit");
      // Override usage count based on credits consumed today
      // This is a simplified approach - in production you'd track usage separately
      creditTier.usageCount = Math.max(0, 50 - (creditResult.credits || 0)); // Rough estimate
      return creditTier;
    }
  } catch (error) {
    console.error('Error checking credits for user tier:', error);
  }
  
  // Default to freemium if no credits or error
  return createDefaultUserTier("freemium");
}

// Synchronous version for backwards compatibility - deprecated
export function getUserTierInfoSync(_userId: string): UserTierInfo {
  console.warn('getUserTierInfoSync is deprecated - use getUserTierInfo (async) instead');
  
  if (config.features.betaMode) {
    return createDefaultUserTier("premium");
  }
  
  return createDefaultUserTier("freemium");
}
