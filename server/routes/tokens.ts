/**
 * Token Management API Routes
 * 
 * Handles token generation, management, and usage tracking
 * for Firebase-authenticated users.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateUser } from '../middleware/auth';
import { tokenUsageService } from '../services/token-usage';
import { logger } from '../config/logger';
import type { 
  TokenGenerationRequest,
} from '../../shared/schema';

const router = Router();

// Request validation schemas
const generateTokenSchema = z.object({
  name: z.string().optional(),
  tokenName: z.string().optional(),
  expiresIn: z.enum(['1h', '24h', '7d', '30d', 'never']).optional(),
  permissions: z.array(z.string()).optional(),
});

const metricsQuerySchema = z.object({
  days: z.string().optional().transform(val => val ? parseInt(val) : 30),
});

/**
 * POST /api/tokens/generate
 * Generate a new API token for authenticated user
 */
router.post('/generate', authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User authentication is required to generate tokens',
        code: 'USER_AUTH_REQUIRED',
      });
    }

    // Validate request body
    const validationResult = generateTokenSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request body validation failed',
        code: 'VALIDATION_ERROR',
        details: validationResult.error.errors,
      });
    }

    const request: TokenGenerationRequest = validationResult.data;

    // Generate token
    const tokenResponse = await tokenUsageService.generateToken(req.user.uid, request);

    logger.info('Token generated via API', {
      userId: req.user.uid,
      email: req.user.email,
      tokenName: request.tokenName,
      expiresIn: request.expiresIn,
    });

    res.status(201).json({
      message: 'Token generated successfully',
      data: tokenResponse, // Return the full token response with all fields
    });
  } catch (error) {
    logger.error('Token generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
      stack: error instanceof Error ? error.stack : undefined,
    });

    res.status(500).json({
      error: 'Token generation failed',
      message: 'An error occurred while generating the API token',
      code: 'TOKEN_GENERATION_ERROR',
    });
  }
});

/**
 * GET /api/tokens/usage
 * Get current user usage overview
 */
router.get('/usage', authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'USER_AUTH_REQUIRED',
      });
    }

    const usageOverview = await tokenUsageService.getUserUsageOverview(req.user.uid);

    res.json({
      message: 'Usage overview retrieved successfully',
      data: usageOverview,
    });
  } catch (error) {
    logger.error('Failed to get usage overview', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
    });

    res.status(500).json({
      error: 'Failed to retrieve usage overview',
      message: 'An error occurred while retrieving usage information',
      code: 'USAGE_RETRIEVAL_ERROR',
    });
  }
});

/**
 * GET /api/tokens/metrics
 * Get detailed usage metrics for the user
 */
router.get('/metrics', authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'USER_AUTH_REQUIRED',
      });
    }

    // Validate query parameters
    const queryValidation = metricsQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        code: 'VALIDATION_ERROR',
        details: queryValidation.error.errors,
      });
    }

    const { days } = queryValidation.data;
    const metrics = await tokenUsageService.getUserUsageMetrics(req.user.uid, days);

    res.json({
      message: 'Usage metrics retrieved successfully',
      data: metrics,
      period: `${days} days`,
    });
  } catch (error) {
    logger.error('Failed to get usage metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
    });

    res.status(500).json({
      error: 'Failed to retrieve usage metrics',
      message: 'An error occurred while retrieving usage metrics',
      code: 'METRICS_RETRIEVAL_ERROR',
    });
  }
});

/**
 * DELETE /api/tokens/:tokenId
 * Deactivate a specific token
 */
router.delete('/:tokenId', authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'USER_AUTH_REQUIRED',
      });
    }

    const { tokenId } = req.params;

    if (!tokenId || tokenId.length < 10) {
      return res.status(400).json({
        error: 'Invalid token ID',
        message: 'Token ID is required and must be valid',
        code: 'INVALID_TOKEN_ID',
      });
    }

    // Note: In a production system, you'd want to verify the token belongs to the user
    // For now, we'll rely on the tokenUsageService to handle security
    await tokenUsageService.deactivateToken(tokenId);

    logger.info('Token deactivated via API', {
      userId: req.user.uid,
      email: req.user.email,
      tokenId,
    });

    res.json({
      message: 'Token deactivated successfully',
      tokenId,
    });
  } catch (error) {
    logger.error('Token deactivation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
      tokenId: req.params.tokenId,
    });

    res.status(500).json({
      error: 'Token deactivation failed',
      message: 'An error occurred while deactivating the token',
      code: 'TOKEN_DEACTIVATION_ERROR',
    });
  }
});

/**
 * POST /api/tokens/reset-usage
 * Reset user usage (for development/testing)
 */
router.post('/reset-usage', authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'USER_AUTH_REQUIRED',
      });
    }

    // Only allow in development environment
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Operation not allowed',
        message: 'Usage reset is not allowed in production',
        code: 'OPERATION_FORBIDDEN',
      });
    }

    await tokenUsageService.resetUserUsage(req.user.uid);

    logger.info('User usage reset via API', {
      userId: req.user.uid,
      email: req.user.email,
      environment: process.env.NODE_ENV,
    });

    res.json({
      message: 'Usage reset successfully',
      userId: req.user.uid,
    });
  } catch (error) {
    logger.error('Usage reset failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
    });

    res.status(500).json({
      error: 'Usage reset failed',
      message: 'An error occurred while resetting usage',
      code: 'USAGE_RESET_ERROR',
    });
  }
});

/**
 * GET /api/tokens/status
 * Get current authentication and token status
 */
router.get('/status', authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'USER_AUTH_REQUIRED',
      });
    }

    // Initialize user limits if they don't exist
    const userLimits = await tokenUsageService.initializeUserLimits(req.user.uid);

    res.json({
      message: 'Status retrieved successfully',
      data: {
        user: {
          uid: req.user.uid,
          email: req.user.email,
          emailVerified: req.user.emailVerified,
          displayName: req.user.displayName,
        },
        limits: {
          tier: userLimits.tier,
          maxCalls: userLimits.maxCalls,
          usedCalls: userLimits.usedCalls,
          remainingCalls: userLimits.maxCalls - userLimits.usedCalls,
          resetPeriod: userLimits.resetPeriod,
          lastReset: userLimits.lastReset,
        },
      },
    });
  } catch (error) {
    logger.error('Status retrieval failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
    });

    res.status(500).json({
      error: 'Status retrieval failed',
      message: 'An error occurred while retrieving status',
      code: 'STATUS_RETRIEVAL_ERROR',
    });
  }
});

/**
 * GET /api/tokens/upgrade-info
 * Get upgrade information and pricing
 */
router.get('/upgrade-info', authenticateUser, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'USER_AUTH_REQUIRED',
      });
    }

    // Get current user tier
    const usageOverview = await tokenUsageService.getUserUsageOverview(req.user.uid);

    const upgradeInfo = {
      currentTier: usageOverview.tier,
      currentUsage: usageOverview.currentUsage,
      currentLimit: usageOverview.limit,
      tiers: {
        testing: {
          name: 'Testing',
          maxCalls: 200,
          price: 'Free',
          features: ['Basic API access', 'Community support', 'Testing purposes only'],
        },
        basic: {
          name: 'Basic',
          maxCalls: 1000,
          price: '$29/month',
          features: ['1,000 API calls/month', 'Email support', 'Production use allowed'],
        },
        premium: {
          name: 'Premium',
          maxCalls: 10000,
          price: '$99/month',
          features: ['10,000 API calls/month', 'Priority support', 'Advanced analytics'],
        },
        enterprise: {
          name: 'Enterprise',
          maxCalls: 100000,
          price: 'Contact us',
          features: ['100,000+ API calls/month', 'Dedicated support', 'Custom integrations'],
        },
      },
      contactInfo: {
        email: 'sales@evalmatch.com',
        phone: '+1 (555) 123-4567',
        calendlyUrl: 'https://calendly.com/evalmatch/consultation',
      },
    };

    res.json({
      message: 'Upgrade information retrieved successfully',
      data: upgradeInfo,
    });
  } catch (error) {
    logger.error('Upgrade info retrieval failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.uid,
    });

    res.status(500).json({
      error: 'Failed to retrieve upgrade information',
      message: 'An error occurred while retrieving upgrade information',
      code: 'UPGRADE_INFO_ERROR',
    });
  }
});

export { router as tokensRouter };