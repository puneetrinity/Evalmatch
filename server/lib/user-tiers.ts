/**
 * User Tiers Management
 * Re-exports from shared module and provides server-side functionality
 */

export * from "../../shared/user-tiers";
import { createDefaultUserTier, UserTierInfo } from "../../shared/user-tiers";
import { config } from '../config/unified-config';

// Server-side user tier functions
export function getUserTierInfo(_userId: string): UserTierInfo {
  // In beta mode, return premium tier for full feature access during development/testing
  if (config.features.betaMode) {
    return createDefaultUserTier("premium");
  }
  
  // In auth bypass mode, return default freemium tier for all users
  // In production, this would query the database for user's actual tier
  return createDefaultUserTier("freemium");
}
