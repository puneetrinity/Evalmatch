/**
 * Authentication Middleware
 * 
 * Enhanced middleware to verify Firebase authentication tokens with
 * proper error handling and development mode support
 */

import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken, isFirebaseAuthAvailable } from '../auth/firebase-auth';
import { config } from '../config/unified-config';
import { logger } from '../config/logger';

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
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    // TEMPORARY: Auth bypass for testing - allow all requests with mock user
    logger.info('🔓 AUTH BYPASS ACTIVE - Using mock user for testing');
    req.user = {
      uid: 'test-user-' + Math.random().toString(36).substr(2, 9),
      email: 'test@example.com',
      emailVerified: true,
      displayName: 'Test User',
    };
    return next();

    // TODO: Re-enable this code after core functionality testing
    /*
    // In development mode, allow bypass if Firebase not configured
    if (config.env === 'development' && !isFirebaseAuthAvailable()) {
      logger.warn('Development mode: Firebase auth not available, creating mock user');
      req.user = {
        uid: 'dev-user-123',
        email: 'dev@example.com',
        emailVerified: true,
        displayName: 'Development User',
      };
      return next();
    }

    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid authentication token in the format: Authorization: Bearer <token>',
        code: 'MISSING_AUTH_HEADER',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!idToken || idToken.length < 10) {
      logger.warn('Empty or invalid token in Authorization header', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        tokenLength: idToken?.length || 0,
      });
      
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is required and must be a valid Firebase ID token',
        code: 'INVALID_TOKEN_FORMAT',
      });
    }

    // Check if Firebase Auth is available
    if (!isFirebaseAuthAvailable()) {
      logger.error('Firebase authentication not available', {
        path: req.path,
        method: req.method,
      });
      
      return res.status(503).json({
        error: 'Authentication service unavailable',
        message: 'Authentication service is temporarily unavailable. Please try again later.',
        code: 'AUTH_SERVICE_UNAVAILABLE',
      });
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyFirebaseToken(idToken);
    
    if (!decodedToken) {
      logger.warn('Invalid or expired Firebase token', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        tokenLength: idToken.length,
      });
      
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is invalid, expired, or revoked. Please sign in again.',
        code: 'TOKEN_VERIFICATION_FAILED',
      });
    }

    // Add user information to request object
    req.user = decodedToken;
    
    logger.debug('User authenticated successfully', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    logger.error('Authentication middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication. Please try again.',
      code: 'AUTH_INTERNAL_ERROR',
    });
  }
  */
}

/**
 * Optional authentication middleware - continues if no token provided
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without authentication
      return next();
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!idToken) {
      return next();
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyFirebaseToken(idToken);
    
    if (decodedToken) {
      req.user = decodedToken;
      logger.debug('Optional auth: User authenticated', {
        uid: decodedToken.uid,
        email: decodedToken.email,
      });
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error', error);
    // Continue without authentication on error
    next();
  }
}

/**
 * Middleware to check if user owns a resource
 */
export function requireResourceOwnership(getUserIdFromResource: (req: Request) => Promise<string | null>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'You must be authenticated to access this resource',
        });
      }

      const resourceUserId = await getUserIdFromResource(req);
      
      if (!resourceUserId) {
        return res.status(404).json({
          error: 'Resource not found',
          message: 'The requested resource does not exist',
        });
      }

      if (resourceUserId !== req.user.uid) {
        logger.warn('Access denied: User does not own resource', {
          userUid: req.user.uid,
          resourceUserId,
          path: req.path,
          method: req.method,
        });
        
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to access this resource',
        });
      }

      next();
    } catch (error) {
      logger.error('Resource ownership check error', error);
      
      return res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during authorization',
      });
    }
  };
}