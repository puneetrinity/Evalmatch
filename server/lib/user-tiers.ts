/**
 * User Tiers Management
 * Re-exports from shared module and provides server-side functionality
 */

export * from "../../shared/user-tiers";
import { createDefaultUserTier, UserTierInfo } from "../../shared/user-tiers";

// Server-side user tier functions
export function getUserTierInfo(_userId: string): UserTierInfo {
  // In auth bypass mode, return default freemium tier for all users
  // In production, this would query the database for user's actual tier
  return createDefaultUserTier("freemium");
}
