/**
 * Either-Auth Middleware
 * Allows endpoints to accept either Firebase JWT or API token authentication
 * Tries API token first, then falls back to Firebase auth
 */

import type { Request, Response, NextFunction } from 'express';
import { optionalApiToken } from './token-auth';
import { authenticateUser } from './auth';

/**
 * Middleware that accepts either Firebase JWT or API token authentication
 * Sets req.auth with method and userId for downstream handlers
 */
export function eitherAuth(req: Request, res: Response, next: NextFunction) {
  // Try API token first
  optionalApiToken(req, res, async (tokenErr?: any) => {
    if (!tokenErr && req.tokenUser) {
      // Token auth successful - use correct field: tokenUser.userId
      (req as any).auth = { 
        method: 'token', 
        userId: req.tokenUser.userId // Correct field reference
      };
      return next();
    }

    // Fallback to Firebase auth
    authenticateUser(req, res, (fbErr?: any) => {
      if (!fbErr && req.user) {
        // Firebase auth successful
        (req as any).auth = { 
          method: 'firebase', 
          userId: req.user.uid 
        };
        return next();
      }

      // Both auth methods failed
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Provide either a Firebase ID token or EvalMatch API token in Authorization: Bearer',
        timestamp: new Date().toISOString()
      });
    });
  });
}

// Export for use in routes
export default eitherAuth;