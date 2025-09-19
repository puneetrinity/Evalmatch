/**
 * User and Authentication Routes
 * Handles user profile, tier management, and auth debugging
 */

import { Router, Request, Response } from "express";
// import { authenticateUser } from "../middleware/auth"; // TODO: Remove if not needed
import { eitherAuth } from "../middleware/either-auth";
import { validators } from "../middleware/input-validation";
import { logger } from "../lib/logger";

const router = Router();

/**
 * @swagger
 * /user/profile:
 *   get:
 *     tags: [User Management]
 *     summary: Get user profile information
 *     description: |
 *       Retrieve the authenticated user's profile including tier, display name, 
 *       email, and metadata. Used by frontend applications to display user info
 *       and determine feature access levels.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         uid:
 *                           type: string
 *                           description: Firebase user ID
 *                           example: "abc123xyz"
 *                         displayName:
 *                           type: string
 *                           example: "John Doe"
 *                         email:
 *                           type: string
 *                           format: email
 *                           example: "john@example.com"
 *                         photoURL:
 *                           type: string
 *                           format: uri
 *                           nullable: true
 *                           example: "https://example.com/photo.jpg"
 *                         emailVerified:
 *                           type: boolean
 *                           example: true
 *                         tier:
 *                           type: string
 *                           enum: [freemium, premium, testing]
 *                           example: "premium"
 *                         country:
 *                           type: string
 *                           example: "IN"
 *                         currency:
 *                           type: string
 *                           example: "INR"
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         lastLoginAt:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         company:
 *                           type: string
 *                           nullable: true
 *                         title:
 *                           type: string
 *                           nullable: true
 *                         phone:
 *                           type: string
 *                           nullable: true
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
// User profile endpoint - Get user's profile information
router.get(
  "/profile",
  eitherAuth,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).auth?.userId || req.user?.uid;
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "AUTHENTICATION_REQUIRED",
          message: "User ID not found in authentication context"
        });
      }
      
      // For API token auth, we need to construct a minimal user object
      const user = req.user || { 
        uid: userId, 
        email: null, 
        displayName: null, 
        photoURL: null, 
        emailVerified: false 
      };
      const { config } = await import("../config/unified-config");
      const { getUserTierInfo } = await import("../lib/user-tiers");
      
      // Get user's tier based on credits if credit system is enabled
      let userTier = 'testing';
      try {
        const tierInfo = await getUserTierInfo(userId);
        userTier = tierInfo.tier;
      } catch (error) {
        logger.warn("Failed to get user tier, defaulting to 'testing':", error);
      }
      
      // Build profile response
      const profile = {
        uid: userId,
        displayName: user.displayName || user.email?.split('@')[0] || 'User',
        email: user.email || '',
        photoURL: user.photoURL || null,
        emailVerified: user.emailVerified || false,
        // Firebase metadata - these would need to come from Firebase Admin SDK
        createdAt: null, // user.metadata?.creationTime || null,
        lastLoginAt: null, // user.metadata?.lastSignInTime || null,
        // Application-specific
        tier: userTier,
        country: 'IN', // Default to India for payment gateway
        currency: 'INR', // Default currency
        // Placeholder fields for future expansion
        company: null as string | null,
        title: null as string | null,
        phone: null as string | null,
      };
      
      // Include credit information if enabled
      if (config.features.enableCreditSystem) {
        try {
          const { creditService } = await import("../services/credit-service");
          // Use read-only method for profile display to avoid creating records
          const creditResult = await creditService.getUserCreditsReadOnly(userId);
          const historyResult = await creditService.getCreditHistory(userId, 1, 1);
          
          logger.info("Profile credit fetch", {
            uid: userId,
            creditSuccess: creditResult.success,
            credits: creditResult.credits,
            historyFound: !!historyResult,
            totalPurchased: historyResult?.totalPurchased,
            totalUsed: historyResult?.totalUsed,
            // Environment debugging info
            railwayProject: process.env.RAILWAY_PROJECT_NAME,
            railwayEnvironment: process.env.RAILWAY_ENVIRONMENT_NAME,
            databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing'
          });
          
          if (creditResult.success) {
            (profile as any).creditSummary = {
              balance: creditResult.credits || 0,
              totalPurchased: historyResult?.totalPurchased || 0,
              totalUsed: historyResult?.totalUsed || 0,
              available: typeof creditResult.available === 'boolean' ? creditResult.available : true
            };
          } else {
            // Don't mask failures with fake zeros - report the actual error
            logger.warn("Credit fetch failed - not masking as zeros", {
              uid: userId,
              error: creditResult.error
            });
            (profile as any).creditSummaryError = creditResult.error;
            // Don't include creditSummary with fake zeros!
          }
          
          // Add environment debugging info to profile (only in development)
          if (process.env.NODE_ENV === 'development') {
            (profile as any).debugInfo = {
              railwayProject: process.env.RAILWAY_PROJECT_NAME,
              environment: process.env.RAILWAY_ENVIRONMENT_NAME,
              creditSystemEnabled: config.features.enableCreditSystem
            };
          }
        } catch (creditError) {
          logger.warn("Failed to get credit information for profile:", creditError);
          // Set explicit error so UI shows "Credits unavailable" instead of loading forever
          (profile as any).creditSummaryError = 'Failed to fetch credits';
        }
      } else {
        // Credit system disabled - set explicit error so UI shows "Credits unavailable"
        (profile as any).creditSummaryError = 'Credit system disabled';
      }
      
      res.json({
        success: true,
        data: profile,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Profile fetch failed:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get user profile",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

// User tier endpoint - Get user's subscription tier and limits
router.get(
  "/user-tier",
  eitherAuth,
  async (req: Request, res: Response) => {
    try {
      const { getUserTierInfo } = await import("../lib/user-tiers");
      const { config } = await import("../config/unified-config");
      const userId = (req as any).auth?.userId || req.user?.uid;
      const userTier = await getUserTierInfo(userId);

      // Include credit information if credit system is enabled
      let creditInfo = null;
      if (config.features.enableCreditSystem) {
        try {
          const { creditService } = await import("../services/credit-service");
          const creditResult = await creditService.getUserCredits(userId);
          if (creditResult.success) {
            creditInfo = {
              credits: creditResult.credits,
              analysisCreditsPerResume: 1
            };
          }
        } catch (creditError) {
          logger.warn("Failed to get credit information for user tier:", creditError);
          // Continue without credit info - not critical
        }
      }

      res.json({
        status: "ok",
        tier: userTier,
        creditSystem: {
          enabled: config.features.enableCreditSystem,
          betaMode: config.features.betaMode,
          credits: creditInfo
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("User tier check failed:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to get user tier information",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// Test authentication endpoint - Debug authentication issues
router.post("/debug/test-auth", validators.rateLimitStrict, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    logger.info("Auth test request received", {
      hasAuthHeader: !!authHeader,
      hasToken: !!token,
      tokenLength: token?.length,
      userAgent: req.headers["user-agent"],
      origin: req.headers.origin,
      referer: req.headers.referer,
    });

    if (!token) {
      return res.status(401).json({
        error: "No token provided",
        message: "Authorization header missing or malformed",
        expected: "Bearer <firebase-id-token>",
        received: authHeader || "none",
      });
    }

    // Verify token with unified Firebase auth system
    const { verifyFirebaseToken } = await import("../auth/firebase-auth");

    try {
      const decodedToken = await verifyFirebaseToken(token);

      if (!decodedToken) {
        return res.status(401).json({
          error: "Token verification failed",
          message: "Invalid Firebase token",
          tokenLength: token.length,
        });
      }

      res.json({
        status: "success",
        message: "Token verification successful",
        user: {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.emailVerified,
          authTime: new Date((decodedToken as any).auth_time * 1000).toISOString(),
          iat: new Date((decodedToken as any).iat * 1000).toISOString(),
          exp: new Date((decodedToken as any).exp * 1000).toISOString(),
        },
        tokenInfo: {
          length: token.length,
          issuer: (decodedToken as any).iss,
          audience: (decodedToken as any).aud,
        },
      });
    } catch (tokenError: unknown) {
      logger.error("Token verification failed:", tokenError);

      res.status(401).json({
        error: "Token verification failed",
        message:
          tokenError instanceof Error
            ? tokenError.message
            : "Invalid Firebase token",
        code:
          tokenError instanceof Error && "code" in tokenError && typeof (tokenError as { code?: string }).code === "string"
            ? (tokenError as { code: string }).code
            : "auth/invalid-token",
        tokenLength: token.length,
      });
    }
  } catch (error) {
    logger.error("Auth test endpoint error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
