/**
 * Authentication Middleware
 *
 * Enhanced middleware to verify Firebase authentication tokens with
 * proper error handling and development mode support
 */

import { Request, Response, NextFunction } from "express";
import {
  verifyFirebaseToken,
  isFirebaseAuthAvailable,
} from "../auth/firebase-auth";
import { config } from "../config/unified-config";
import { logger } from "../config/logger";

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
        photoURL?: string;
      };
    }
  }
}

/**
 * Middleware to authenticate requests using Firebase ID tokens
 * with development mode fallback and proper error handling
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Auth bypass mode for testing (NEVER allowed in production)
    if (process.env.AUTH_BYPASS_MODE === "true") {
      // SECURITY FIX: Stricter production detection with fail-safe approach
      // Primary check: explicit production environment variables
      const isProduction = [
        config.env === "production",
        process.env.NODE_ENV === "production",
        process.env.RAILWAY_ENVIRONMENT === "production",
        process.env.VERCEL_ENV === "production"
      ].some(Boolean);
      
      // Secondary check: fail-safe - any non-development context
      const isDevelopment = [
        config.env === "development",
        config.env === "test",
        process.env.NODE_ENV === "development",
        process.env.NODE_ENV === "test"
      ].some(Boolean);
      
      // CRITICAL: If not explicitly development OR if any production indicator, DENY
      if (isProduction || !isDevelopment) {
        logger.error("🚨 CRITICAL SECURITY VIOLATION: AUTH_BYPASS_MODE blocked - production/unknown environment", {
          configEnv: config.env,
          nodeEnv: process.env.NODE_ENV,
          railwayEnv: process.env.RAILWAY_ENVIRONMENT,
          vercelEnv: process.env.VERCEL_ENV,
          isProduction,
          isDevelopment,
          // Only log safe host information for security
          hostSafe: req.get('host')?.includes('localhost') ? 'localhost' : 'external',
          ip: req.ip?.startsWith('127.') || req.ip?.startsWith('::1') ? 'local' : 'external',
          timestamp: new Date().toISOString(),
          severity: 'CRITICAL',
          action: 'TERMINATING_PROCESS'
        });
        
        // Immediate process termination to prevent security breach
        process.exit(1);
      }
      
      // Additional localhost verification for extra security
      const isLocalhost = [
        req.get('host')?.includes('localhost'),
        req.get('host')?.includes('127.0.0.1'),
        req.get('host')?.includes('.local'),
        req.ip?.startsWith('127.'),
        req.ip?.startsWith('::1')
      ].some(Boolean);
      
      if (!isLocalhost) {
        logger.error("🛡️ AUTH_BYPASS_MODE security violation: Not connecting from localhost", {
          currentEnv: config.env,
          hostSafe: 'external-host',
          ipSafe: 'external-ip',
          timestamp: new Date().toISOString(),
        });
        
        return res.status(403).json({
          error: "Authentication bypass not allowed",
          message: "Auth bypass only permitted from localhost in development",
          code: "AUTH_BYPASS_FORBIDDEN",
        });
      }
      
      // ENHANCED: Add rate limiting for bypass mode (prevent abuse)
      const bypassAttemptKey = `auth_bypass:${req.ip}`;
      // This would integrate with rate limiting middleware if available
      
      logger.warn("⚠️ Auth bypass mode enabled for development/testing", {
        environment: config.env,
        host: req.get('host'),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        warning: "This should NEVER appear in production logs"
      });
      
      req.user = {
        uid: "test-user-dev-123",
        email: "test@development.local",
        emailVerified: true,
        displayName: "Development Test User",
      };
      return next();
    }

    // In development mode, allow bypass if Firebase not configured
    if (config.env === "development" && !isFirebaseAuthAvailable()) {
      logger.warn(
        "Development mode: Firebase auth not available, creating mock user",
      );
      req.user = {
        uid: "dev-user-123",
        email: "dev@example.com",
        emailVerified: true,
        displayName: "Development User",
      };
      return next();
    }

    // Test environment bypass
    if (config.env === "test") {
      logger.warn("Test mode: bypassing authentication");
      req.user = {
        uid: "test-user-123",
        email: "test@example.com",
        emailVerified: true,
        displayName: "Test User",
      };
      return next();
    }

    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("Missing or invalid Authorization header", {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      return res.status(401).json({
        error: "Authentication required",
        message:
          "Please provide a valid authentication token in the format: Authorization: Bearer <token>",
        code: "MISSING_AUTH_HEADER",
      });
    }

    const idToken = authHeader.split("Bearer ")[1];

    if (!idToken || idToken.length < 10) {
      logger.warn("Empty or invalid token in Authorization header", {
        path: req.path,
        method: req.method,
        ip: req.ip,
        tokenLength: idToken?.length || 0,
      });

      return res.status(401).json({
        error: "Invalid token",
        message:
          "Authentication token is required and must be a valid Firebase ID token",
        code: "INVALID_TOKEN_FORMAT",
      });
    }

    // Check if Firebase Auth is available
    if (!isFirebaseAuthAvailable()) {
      logger.error("Firebase authentication not available", {
        path: req.path,
        method: req.method,
      });

      return res.status(503).json({
        error: "Authentication service unavailable",
        message:
          "Authentication service is temporarily unavailable. Please try again later.",
        code: "AUTH_SERVICE_UNAVAILABLE",
      });
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyFirebaseToken(idToken);

    if (!decodedToken) {
      logger.warn("Invalid or expired Firebase token", {
        path: req.path,
        method: req.method,
        ip: req.ip,
        tokenLength: idToken.length,
      });

      return res.status(401).json({
        error: "Invalid token",
        message:
          "Authentication token is invalid, expired, or revoked. Please sign in again.",
        code: "TOKEN_VERIFICATION_FAILED",
      });
    }

    // Add user information to request object
    req.user = decodedToken;

    logger.debug("User authenticated successfully", {
      uid: decodedToken.uid,
      email: decodedToken.email,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    logger.error("Authentication middleware error", {
      error: error instanceof Error ? error.message : "Unknown error",
      path: req.path,
      method: req.method,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return res.status(500).json({
      error: "Authentication error",
      message: "Internal server error during authentication. Please try again.",
      code: "AUTH_INTERNAL_ERROR",
    });
  }
}

/**
 * Optional authentication middleware - continues if no token provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token provided, continue without authentication
      return next();
    }

    const idToken = authHeader.split("Bearer ")[1];

    if (!idToken) {
      return next();
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyFirebaseToken(idToken);

    if (decodedToken) {
      req.user = decodedToken;
      logger.debug("Optional auth: User authenticated", {
        uid: decodedToken.uid,
        email: decodedToken.email,
      });
    }

    next();
  } catch (error) {
    logger.error("Optional authentication error", error);
    // Continue without authentication on error
    next();
  }
}

/**
 * Middleware to check if user owns a resource
 */
export function requireResourceOwnership(
  getUserIdFromResource: (req: Request) => Promise<string | null>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Authentication required",
          message: "You must be authenticated to access this resource",
        });
      }

      const resourceUserId = await getUserIdFromResource(req);

      if (!resourceUserId) {
        return res.status(404).json({
          error: "Resource not found",
          message: "The requested resource does not exist",
        });
      }

      if (resourceUserId !== req.user.uid) {
        logger.warn("Access denied: User does not own resource", {
          userUid: req.user.uid,
          resourceUserId,
          path: req.path,
          method: req.method,
        });

        return res.status(403).json({
          error: "Access denied",
          message: "You do not have permission to access this resource",
        });
      }

      next();
    } catch (error) {
      logger.error("Resource ownership check error", error);

      return res.status(500).json({
        error: "Authorization error",
        message: "Internal server error during authorization",
      });
    }
  };
}
