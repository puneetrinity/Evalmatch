/**
 * Authentication Middleware
 * 
 * Middleware to verify Firebase authentication tokens
 */

import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken } from '../lib/firebase-admin';
import { logger } from '../lib/logger';

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
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid authentication token',
      });
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    if (!idToken) {
      logger.warn('Empty token in Authorization header', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is required',
      });
    }

    // Verify the Firebase ID token
    const decodedToken = await verifyFirebaseToken(idToken);
    
    if (!decodedToken) {
      logger.warn('Invalid or expired Firebase token', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Authentication token is invalid or expired',
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
    logger.error('Authentication middleware error', error);
    
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication',
    });
  }
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