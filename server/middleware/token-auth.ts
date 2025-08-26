/**
 * Token Authentication & Usage Tracking Middleware
 * 
 * Handles API token validation, usage tracking, and rate limiting
 * for the EvalMatch API token system.
 */

import { Request, Response, NextFunction } from 'express';
import { tokenUsageService } from '../services/token-usage';
import { logger } from '../config/logger';

// Extend Request interface to include token user
declare global {
  namespace Express {
    interface Request {
      tokenUser?: {
        userId: string;
        tokenId: string;
        remainingCalls: number;
      };
    }
  }
}

interface TokenAuthOptions {
  trackUsage?: boolean;
  requireValidToken?: boolean;
}

/**
 * Middleware to authenticate API token and track usage
 */
export function authenticateApiToken(options: TokenAuthOptions = {}) {
  const { trackUsage = true, requireValidToken = true } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    try {
      // Get token from Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (requireValidToken) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide a valid API token in the format: Authorization: Bearer <token>',
            code: 'MISSING_API_TOKEN',
          });
        }
        return next();
      }

      const token = authHeader.split('Bearer ')[1];

      if (!token || token.length < 10) {
        if (requireValidToken) {
          return res.status(401).json({
            error: 'Invalid token',
            message: 'API token is required and must be a valid EvalMatch token',
            code: 'INVALID_TOKEN_FORMAT',
          });
        }
        return next();
      }

      // Validate token
      const tokenValidation = await tokenUsageService.validateToken(token);

      if (!tokenValidation) {
        if (requireValidToken) {
          logger.warn('Invalid API token used', {
            tokenPrefix: token.substring(0, 10) + '...',
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            path: req.path,
            method: req.method,
          });

          return res.status(401).json({
            error: 'Invalid token',
            message: 'API token is invalid, expired, or revoked. Please generate a new token.',
            code: 'TOKEN_VALIDATION_FAILED',
          });
        }
        return next();
      }

      // Check if user can make requests (has remaining calls)
      if (!tokenValidation.canMakeRequest) {
        logger.warn('API limit exceeded', {
          userId: tokenValidation.userId,
          tokenId: tokenValidation.tokenId,
          remainingCalls: tokenValidation.remainingCalls,
          path: req.path,
          method: req.method,
        });

        return res.status(429).json({
          error: 'API limit exceeded',
          message: 'You have reached your API call limit. Please upgrade your plan or wait for the reset period.',
          code: 'API_LIMIT_EXCEEDED',
          details: {
            remainingCalls: tokenValidation.remainingCalls,
            upgradeUrl: '/api/upgrade', // This could be a frontend upgrade page
          },
        });
      }

      // Add token user to request
      req.tokenUser = {
        userId: tokenValidation.userId,
        tokenId: tokenValidation.tokenId,
        remainingCalls: tokenValidation.remainingCalls,
      };

      // Track usage if enabled
      if (trackUsage) {
        // Set up response tracking
        const originalSend = res.send;
        const originalJson = res.json;
        let responseSize = 0;

        // Override send to capture response size
        res.send = function(data: any) {
          if (typeof data === 'string') {
            responseSize = Buffer.byteLength(data, 'utf8');
          } else if (data) {
            responseSize = JSON.stringify(data).length;
          }
          return originalSend.call(this, data);
        };

        // Override json to capture response size
        res.json = function(data: any) {
          responseSize = JSON.stringify(data).length;
          return originalJson.call(this, data);
        };

        // Track usage after response is sent
        res.on('finish', async () => {
          const processingTime = Date.now() - startTime;
          const requestSize = req.headers['content-length'] 
            ? parseInt(req.headers['content-length'] as string) 
            : 0;

          try {
            await tokenUsageService.trackUsage(tokenValidation.userId, {
              endpoint: req.path,
              method: req.method,
              statusCode: res.statusCode,
              processingTime,
              requestSize,
              responseSize,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            });
          } catch (error) {
            logger.error('Failed to track API usage', {
              error: error instanceof Error ? error.message : 'Unknown error',
              userId: tokenValidation.userId,
              endpoint: req.path,
            });
          }
        });
      }

      logger.debug('API token authenticated successfully', {
        userId: tokenValidation.userId,
        tokenId: tokenValidation.tokenId,
        remainingCalls: tokenValidation.remainingCalls,
        path: req.path,
        method: req.method,
      });

      next();
    } catch (error) {
      logger.error('Token authentication middleware error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: req.path,
        method: req.method,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return res.status(500).json({
        error: 'Authentication error',
        message: 'Internal server error during token authentication. Please try again.',
        code: 'TOKEN_AUTH_INTERNAL_ERROR',
      });
    }
  };
}

/**
 * Middleware to require authenticated API token
 */
export const requireApiToken = authenticateApiToken({ 
  trackUsage: true, 
  requireValidToken: true 
});

/**
 * Middleware for optional API token authentication
 */
export const optionalApiToken = authenticateApiToken({ 
  trackUsage: true, 
  requireValidToken: false 
});

/**
 * Middleware to check specific usage limits (for premium features)
 */
export function requireUsageLimit(minimumCallsRemaining: number = 1) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.tokenUser) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'This endpoint requires API token authentication',
        code: 'TOKEN_REQUIRED',
      });
    }

    if (req.tokenUser.remainingCalls < minimumCallsRemaining) {
      return res.status(429).json({
        error: 'Insufficient API calls',
        message: `This endpoint requires at least ${minimumCallsRemaining} remaining API calls`,
        code: 'INSUFFICIENT_API_CALLS',
        details: {
          remaining: req.tokenUser.remainingCalls,
          required: minimumCallsRemaining,
        },
      });
    }

    next();
  };
}

/**
 * Middleware to add usage info to responses
 */
export function addUsageHeaders() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.tokenUser) {
      res.set({
        'X-RateLimit-Remaining': req.tokenUser.remainingCalls.toString(),
        'X-RateLimit-User': req.tokenUser.userId,
      });
    }
    next();
  };
}

/**
 * Middleware for high-cost operations
 */
export const requireHighUsageLimit = requireUsageLimit(10);

/**
 * Combined middleware for standard API endpoints
 */
export function standardApiAuth() {
  return [
    requireApiToken,
    addUsageHeaders(),
  ];
}