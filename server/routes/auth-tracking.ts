/**
 * Authentication Tracking Routes with Credit System Integration
 * Handles login event tracking, Mautic integration, and credit allocation
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { validators } from "../middleware/input-validation";
import { logger } from "../lib/logger";
import { config } from "../config/unified-config";
import { creditService } from "../services/credit-service";
import { userService } from "../services/enhanced-user-service";

const router = Router();

interface LoginTrackingPayload {
  method: 'email' | 'google' | 'firebase';
  timestamp: string;
  isNewUser?: boolean;
  loginStreak?: number;
}

interface MauticLoginEvent {
  uid: string;
  email?: string;
  method: string;
  loginTime: string;
  userAgent?: string;
  ipAddress?: string;
  isNewUser?: boolean;
  loginStreak?: number;
  creditBalance?: number;
  totalCreditsUsed?: number;
  lastCreditPurchase?: string | null;
}

interface LoginReward {
  type: 'new_user' | 'daily_login' | 'streak_bonus' | 'none';
  credits: number;
  message: string;
}

/**
 * POST /api/track-login - Track user login events with credit system integration
 */
router.post("/track-login",
  authenticateUser,
  validators.rateLimitModerate, // Reuse existing rate limiter
  async (req: Request, res: Response) => {
    try {
      // Validate payload
      const { method, timestamp, isNewUser = false, loginStreak = 1 }: LoginTrackingPayload = req.body;

      if (!method || !timestamp) {
        return res.status(400).json({
          error: "Invalid payload",
          message: "method and timestamp are required"
        });
      }
      
      // Handle legacy 'firebase' method value for backward compatibility
      const loginMethod = method === 'firebase' ? 'email' : method;

      const userId = req.user!.uid;
      const userEmail = req.user!.email;
      const displayName = req.user!.displayName;
      const photoURL = req.user!.photoURL;

      logger.info("Processing login tracking", {
        userId,
        method: loginMethod,
        isNewUser,
        loginStreak
      });

      // Sync user with database (creates or updates user record)
      const userResult = await userService.createOrUpdateUserFromFirebase({
        uid: userId,
        email: userEmail,
        displayName,
        photoURL,
        provider: loginMethod
      });

      if (!userResult.success) {
        logger.error("Failed to sync user with database", {
          userId,
          error: userResult.error
        });
        // Continue processing even if user sync fails
      } else {
        logger.info("User synced with database", {
          userId,
          databaseUserId: userResult.data?.id,
          username: userResult.data?.username
        });
      }

      // Handle credit rewards for login (non-blocking)
      const loginReward = await processLoginRewards(userId, isNewUser, loginStreak);

      // Get user's current credit info for Mautic
      let creditInfo = null;
      if (config.features.enableCreditSystem) {
        try {
          const creditResult = await creditService.getUserCredits(userId);
          if (creditResult.success) {
            // Get credit history for additional context
            const history = await creditService.getCreditHistory(userId, 1, 10);
            creditInfo = {
              balance: creditResult.credits,
              totalUsed: history?.totalUsed || 0,
              lastPurchase: null // TODO: Add purchase date tracking when payment system is implemented
            };
          }
        } catch (creditError) {
          logger.warn("Failed to get credit info for login tracking", {
            userId,
            error: creditError instanceof Error ? creditError.message : 'Unknown error'
          });
        }
      }

      // Build login event for Mautic
      const loginEvent: MauticLoginEvent = {
        uid: userId,
        email: userEmail,
        method: loginMethod,
        loginTime: timestamp,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
        isNewUser,
        loginStreak,
        creditBalance: creditInfo?.balance,
        totalCreditsUsed: creditInfo?.totalUsed,
        lastCreditPurchase: creditInfo?.lastPurchase
      };

      // Non-blocking Mautic webhook (fire-and-forget)
      sendLoginToMautic(loginEvent).catch(error => {
        logger.warn("Mautic webhook failed", {
          userId,
          method: loginMethod,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });

      // Always return success to avoid impacting user experience
      res.json({
        status: 'tracked',
        timestamp: new Date().toISOString(),
        uid: userId,
        reward: loginReward,
        credits: creditInfo?.balance || null
      });

    } catch (error) {
      logger.error("Login tracking endpoint error:", error);
      // Still return 200 - tracking failure shouldn't affect user auth
      res.json({
        status: 'error',
        message: 'Tracking failed but login successful'
      });
    }
  }
);

/**
 * Process credit rewards for user login
 * Handles new user bonuses, daily login rewards, and streak bonuses
 */
async function processLoginRewards(
  userId: string, 
  isNewUser: boolean, 
  loginStreak: number
): Promise<LoginReward> {
  // Skip rewards if credit system is not enabled
  if (!config.features.enableCreditSystem) {
    return {
      type: 'none',
      credits: 0,
      message: 'Credit system not enabled'
    };
  }

  try {
    // New user bonus (100 credits)
    if (isNewUser) {
      const grantResult = await creditService.grantBetaCredits(userId, 100);
      if (grantResult.success) {
        logger.info("New user credit bonus granted", {
          userId,
          credits: 100,
          totalCredits: grantResult.credits
        });
        
        return {
          type: 'new_user',
          credits: 100,
          message: 'Welcome! You received 100 free credits to get started.'
        };
      }
    }

    // Daily login bonus (20 credits) with idempotency check
    const dailyBonusAmount = 20;
    const dailyReferenceId = `daily_login_${new Date().toISOString().split('T')[0]}`; // Date-based reference ID
    
    // Pre-check for existing daily grant to avoid DB constraint errors
    const existingDailyGrant = await creditService.getCreditHistory(userId, 1, 100)
      .then(history => history?.transactions.find(t => 
        t.referenceId === dailyReferenceId && t.transactionType === 'grant'
      ));
    
    let dailyBonusResult;
    if (existingDailyGrant) {
      // Already granted today, return success without error
      dailyBonusResult = {
        success: true,
        credits: existingDailyGrant.balanceAfter,
        message: 'Daily bonus already granted'
      };
      logger.info("Daily bonus already granted for user", { userId, date: new Date().toISOString().split('T')[0] });
    } else {
      // Grant new daily bonus
      dailyBonusResult = await creditService.addCredits(
        userId,
        dailyBonusAmount,
        'Daily login bonus',
        'grant',
        dailyReferenceId,
        {
          login_streak: loginStreak,
          reward_type: 'daily_login'
        }
      );
    }

    if (dailyBonusResult.success) {
      logger.info("Daily login bonus granted", {
        userId,
        credits: dailyBonusAmount,
        streak: loginStreak,
        totalCredits: dailyBonusResult.credits
      });

      // Weekly streak bonus for consecutive logins (every 7 days)
      if (loginStreak > 0 && loginStreak % 7 === 0) {
        const streakBonusAmount = 50; // Generous 50 credit weekly streak bonus
        const streakBonusResult = await creditService.addCredits(
          userId,
          streakBonusAmount,
          `Weekly streak bonus (${loginStreak} days)`,
          'grant',
          `weekly_streak_${Math.floor(loginStreak / 7)}_${new Date().toISOString().split('T')[0]}`,
          {
            login_streak: loginStreak,
            streak_week: Math.floor(loginStreak / 7),
            reward_type: 'weekly_streak_bonus'
          }
        );

        if (streakBonusResult.success) {
          logger.info("Weekly streak bonus granted", {
            userId,
            credits: streakBonusAmount,
            streak: loginStreak,
            weekNumber: Math.floor(loginStreak / 7),
            totalCredits: streakBonusResult.credits
          });

          return {
            type: 'streak_bonus',
            credits: dailyBonusAmount + streakBonusAmount,
            message: `🔥 Amazing! ${loginStreak} day streak earned you ${dailyBonusAmount + streakBonusAmount} credits (${streakBonusAmount} streak bonus)!`
          };
        }
      }

      return {
        type: 'daily_login',
        credits: dailyBonusAmount,
        message: `Daily login bonus: ${dailyBonusAmount} credits added.`
      };
    }

  } catch (error) {
    logger.error("Login reward processing failed", {
      userId,
      isNewUser,
      loginStreak,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }

  return {
    type: 'none',
    credits: 0,
    message: 'No rewards processed'
  };
}

/**
 * Send login event to Mautic webhook with timeout and retry
 * Enhanced with credit system data for better user segmentation
 */
async function sendLoginToMautic(loginEvent: MauticLoginEvent): Promise<void> {
  // Feature flag check
  if (!config.features?.enableMauticTracking) {
    logger.debug("Mautic tracking disabled via feature flag");
    return;
  }

  const mauticUrl = process.env.MAUTIC_WEBHOOK_URL;
  const mauticUsername = process.env.MAUTIC_USERNAME;
  const mauticPassword = process.env.MAUTIC_PASSWORD;

  if (!mauticUrl || !mauticUsername || !mauticPassword) {
    logger.warn("Mautic credentials not configured", {
      hasUrl: !!mauticUrl,
      hasUsername: !!mauticUsername,
      hasPassword: !!mauticPassword
    });
    return;
  }

  try {
    logger.info("Posting login event to Mautic", {
      uid: loginEvent.uid,
      method: loginEvent.method,
      isNewUser: loginEvent.isNewUser,
      creditBalance: loginEvent.creditBalance
    });

    // Short timeout webhook call
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

    // Enhanced payload with credit system data
    const mauticPayload = {
      email: loginEvent.email,
      userId: loginEvent.uid,
      lastLoginTime: loginEvent.loginTime,
      loginMethod: loginEvent.method,
      loginStreak: loginEvent.loginStreak || 1,
      isNewUser: loginEvent.isNewUser || false,
      
      // Credit system data for segmentation
      creditBalance: loginEvent.creditBalance || 0,
      totalCreditsUsed: loginEvent.totalCreditsUsed || 0,
      lastCreditPurchase: loginEvent.lastCreditPurchase,
      
      // Dynamic tags based on credit status
      tags: [
        'firebase_user',
        'evalmatch_user',
        loginEvent.isNewUser ? 'new_user' : 'returning_user',
        loginEvent.method === 'google' ? 'google_auth' : 'email_auth',
        
        // Credit-based segmentation tags
        ...(config.features.enableCreditSystem ? [
          loginEvent.creditBalance === 0 ? 'no_credits' : 
          loginEvent.creditBalance && loginEvent.creditBalance < 10 ? 'low_credits' : 
          loginEvent.creditBalance && loginEvent.creditBalance >= 50 ? 'high_credits' : 'moderate_credits',
          
          loginEvent.totalCreditsUsed && loginEvent.totalCreditsUsed > 0 ? 'active_user' : 'inactive_user'
        ] : [])
      ],
      
      // Custom fields for advanced campaigns
      customFields: {
        firebase_uid: loginEvent.uid,  // Add Firebase UID as custom field
        evalmatch_user_id: loginEvent.uid,  // Also store as evalmatch_user_id
        last_login_timestamp: loginEvent.loginTime,
        login_method_preference: loginEvent.method,
        credit_system_enabled: config.features.enableCreditSystem,
        credit_balance: loginEvent.creditBalance || 0,
        total_credits_used: loginEvent.totalCreditsUsed || 0
      }
    };

    const response = await fetch(`${mauticUrl}/api/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${mauticUsername}:${mauticPassword}`).toString('base64')}`
      },
      body: JSON.stringify(mauticPayload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Mautic responded non-2xx: ${response.status}`);
    }

    logger.debug("Mautic webhook successful", {
      uid: loginEvent.uid,
      status: response.status,
      creditBalance: loginEvent.creditBalance
    });

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn("Mautic webhook timeout", { uid: loginEvent.uid });
    } else {
      logger.warn("Mautic webhook failed", {
        uid: loginEvent.uid,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    throw error; // Re-throw for caller's catch block
  }
}

export default router;