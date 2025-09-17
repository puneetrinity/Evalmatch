/**
 * Credits API Routes
 * Handles credit balance, transactions, and credit management operations
 */

import { Router, Request, Response } from "express";
import { authenticateUser } from "../middleware/auth";
import { validators } from "../middleware/input-validation";
import { logger } from "../lib/logger";
import { creditService } from "../services/credit-service";
import { config } from "../config/unified-config";

const router = Router();

/**
 * GET /api/credits/balance
 * Get user's current credit balance
 */
router.get(
  "/balance",
  authenticateUser,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      
      logger.info(`Getting credit balance for user ${userId}`);
      
      const result = await creditService.getUserCredits(userId);
      
      if (result.success) {
        // Get totals from credit history (lightweight query)
        const historyResult = await creditService.getCreditHistory(userId, 1, 1);
        
        // Determine tier based on credits
        const tier = (result.credits && result.credits > 0) ? 'premium' : 'freemium';
        
        res.json({
          status: "success",
          credits: result.credits,
          totalPurchased: historyResult?.totalPurchased || 0,
          totalUsed: historyResult?.totalUsed || 0,
          tier: tier,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`Failed to get credit balance for user ${userId}:`, result.error);
        res.status(500).json({
          status: "error",
          message: "Failed to retrieve credit balance",
          error: result.error
        });
      }
    } catch (error) {
      logger.error("Credit balance endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/**
 * GET /api/credits/history
 * Get user's credit transaction history with pagination
 */
router.get(
  "/history",
  authenticateUser,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Cap at 100
      
      logger.info(`Getting credit history for user ${userId}, page ${page}, limit ${limit}`);
      
      const history = await creditService.getCreditHistory(userId, page, limit);
      
      if (history) {
        res.json({
          status: "success",
          data: {
            transactions: history.transactions,
            currentBalance: history.currentBalance,
            totalPurchased: history.totalPurchased,
            totalUsed: history.totalUsed,
            pagination: history.pagination
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(404).json({
          status: "error",
          message: "Credit history not found"
        });
      }
    } catch (error) {
      logger.error("Credit history endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/**
 * POST /api/credits/grant-beta
 * Grant beta credits to a user (idempotent)
 * Only available when credit system is enabled
 */
router.post(
  "/grant-beta",
  authenticateUser,
  validators.rateLimitStrict,
  async (req: Request, res: Response) => {
    try {
      if (!config.features.enableCreditSystem) {
        return res.status(404).json({
          status: "error",
          message: "Credit system not enabled"
        });
      }

      const userId = req.user!.uid;
      const { amount } = req.body;
      const betaCredits = amount && typeof amount === 'number' && amount > 0 ? amount : 100;
      
      logger.info(`Granting ${betaCredits} beta credits to user ${userId}`);
      
      const result = await creditService.grantBetaCredits(userId, betaCredits);
      
      if (result.success) {
        res.json({
          status: "success",
          message: result.message || `${betaCredits} beta credits granted successfully`,
          credits: result.credits,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.error(`Failed to grant beta credits to user ${userId}:`, result.error);
        res.status(500).json({
          status: "error",
          message: "Failed to grant beta credits",
          error: result.error
        });
      }
    } catch (error) {
      logger.error("Grant beta credits endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/**
 * POST /api/credits/purchase
 * Purchase additional credits (placeholder for payment integration)
 * This is a stub for future Stripe/payment integration
 */
router.post(
  "/purchase",
  authenticateUser,
  validators.rateLimitStrict,
  async (req: Request, res: Response) => {
    try {
      if (!config.features.enableCreditSystem) {
        return res.status(404).json({
          status: "error",
          message: "Credit system not enabled"
        });
      }

      const userId = req.user!.uid;
      const { package: packageType, paymentMethodId } = req.body;
      
      // Validate package type
      const packages = {
        basic: { credits: 100, price: 999 }, // $9.99
        standard: { credits: 250, price: 1999 }, // $19.99
        premium: { credits: 500, price: 3499 } // $34.99
      };
      
      if (!packageType || !packages[packageType as keyof typeof packages]) {
        return res.status(400).json({
          status: "error",
          message: "Invalid package type",
          availablePackages: Object.keys(packages)
        });
      }
      
      // TODO: Implement Stripe payment processing here
      // For now, return a placeholder response
      logger.info(`Credit purchase attempt for user ${userId}`, {
        package: packageType,
        paymentMethodId: paymentMethodId ? 'provided' : 'missing'
      });
      
      res.status(501).json({
        status: "error",
        message: "Credit purchases not yet implemented",
        todo: "Integrate with Stripe payment processing",
        package: packages[packageType as keyof typeof packages]
      });
    } catch (error) {
      logger.error("Credit purchase endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/**
 * GET /api/credits/packages
 * Get available credit packages for purchase
 */
router.get(
  "/packages",
  authenticateUser,
  async (req: Request, res: Response) => {
    try {
      if (!config.features.enableCreditSystem) {
        return res.status(404).json({
          status: "error",
          message: "Credit system not enabled"
        });
      }

      // Generous credit earning system - showcasing earning methods instead of purchase packages
      const packages = [
        {
          id: 'welcome-bonus',
          name: 'Welcome Bonus',
          credits: 100,
          price: 0,
          priceDisplay: 'FREE',
          currency: 'INR',
          pricePerCredit: 0,
          popular: true,
          bonus: 0,
          bonusDisplay: 'One-time reward',
          savings: '100%',
          description: 'Sign up and get instant credits to start analyzing',
          earnMethod: 'automatic',
          requirement: 'Create account or sign in for the first time'
        },
        {
          id: 'daily-login',
          name: 'Daily Login Bonus',
          credits: 20,
          price: 0,
          priceDisplay: 'FREE',
          currency: 'INR',
          pricePerCredit: 0,
          popular: true,
          bonus: 0,
          bonusDisplay: 'Every day',
          savings: '100%',
          description: 'Log in daily to earn generous credit rewards',
          earnMethod: 'daily',
          requirement: 'Simply log in once per day to earn 20 credits'
        },
        {
          id: 'weekly-streak',
          name: 'Weekly Streak Bonus',
          credits: 50,
          price: 0,
          priceDisplay: 'FREE',
          currency: 'INR',
          pricePerCredit: 0,
          popular: false,
          bonus: 140,
          bonusDisplay: '+140 weekly total',
          savings: '100%',
          description: 'Login 7 days in a row for massive bonus rewards',
          earnMethod: 'streak',
          requirement: 'Maintain 7-day consecutive login streak'
        },
        {
          id: 'referral-program',
          name: 'Successful Referrals',
          credits: 100,
          price: 0,
          priceDisplay: 'FREE',
          currency: 'INR',
          pricePerCredit: 0,
          popular: false,
          bonus: 0,
          bonusDisplay: 'Per successful referral',
          savings: '100%',
          description: 'Invite colleagues who complete onboarding',
          earnMethod: 'referral',
          requirement: 'Friend signs up and completes first analysis'
        }
      ];
      
      res.json({
        status: "success",
        packages,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Credit packages endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/**
 * GET /api/credits/status
 * Get credit system status and configuration
 */
router.get(
  "/status",
  async (req: Request, res: Response) => {
    try {
      res.json({
        status: "success",
        creditSystem: {
          enabled: config.features.enableCreditSystem,
          betaMode: config.features.betaMode,
          analysisCreditsPerResume: 1
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Credit status endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Internal server error",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

export default router;