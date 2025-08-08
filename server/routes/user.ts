/**
 * User and Authentication Routes
 * Handles user profile, tier management, and auth debugging
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { logger } from "../lib/logger";

const router = Router();

// User tier endpoint - Get user's subscription tier and limits
router.get(
  "/user-tier",
  authenticateUser,
  async (req: Request, res: Response) => {
    try {
      const { getUserTierInfo } = await import("../lib/user-tiers");
      const userTier = getUserTierInfo(req.user!.uid);

      res.json({
        status: "ok",
        tier: userTier,
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
router.post("/debug/test-auth", async (req: Request, res: Response) => {
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
          emailVerified: decodedToken.email_verified,
          authTime: new Date(decodedToken.auth_time * 1000).toISOString(),
          iat: new Date(decodedToken.iat * 1000).toISOString(),
          exp: new Date(decodedToken.exp * 1000).toISOString(),
        },
        tokenInfo: {
          length: token.length,
          issuer: decodedToken.iss,
          audience: decodedToken.aud,
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
