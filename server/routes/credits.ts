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
      
      const result = await creditService.getUserCreditsReadOnly(userId);
      
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
 * POST /api/credits/reconcile-batch
 * Run batch reconciliation to fix all users with inconsistent credit records
 * Admin endpoint - should be rate limited and potentially require admin auth
 */
router.post(
  "/reconcile-batch",
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

      logger.info(`Batch reconciliation triggered by user ${req.user!.uid}`);
      
      const result = await creditService.batchReconcileAllUsers();
      
      res.json({
        status: result.success ? "success" : "partial_success",
        reconciliation: {
          processed: result.processed,
          reconciled: result.reconciled,
          errors: result.errors.length,
          details: result.details.slice(0, 10), // Limit details in response
          hasMoreDetails: result.details.length > 10
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Batch reconciliation endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Batch reconciliation failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/**
 * GET /api/credits/discrepancies
 * Check for balance discrepancies across all users
 * Admin endpoint for monitoring data integrity
 */
router.get(
  "/discrepancies",
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

      logger.info(`Balance discrepancy check triggered by user ${req.user!.uid}`);
      
      const result = await creditService.detectBalanceDiscrepancies();
      
      res.json({
        status: result.success ? "success" : "error",
        monitoring: {
          totalUsers: result.totalUsers,
          discrepancies: result.discrepancies.length,
          discrepancyRate: result.totalUsers > 0 ? 
            `${(result.discrepancies.length / result.totalUsers * 100).toFixed(2)}%` : '0%',
          issues: result.discrepancies.slice(0, 20), // Limit response size
          hasMoreIssues: result.discrepancies.length > 20
        },
        error: result.error,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Balance discrepancy check endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Balance discrepancy check failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
);

/**
 * POST /api/credits/fix-discrepancies
 * Auto-fix users with balance discrepancies
 * Admin endpoint - should be used carefully
 */
router.post(
  "/fix-discrepancies",
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

      const { userIds } = req.body;
      
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "userIds array is required and must not be empty"
        });
      }

      if (userIds.length > 50) {
        return res.status(400).json({
          status: "error", 
          message: "Cannot fix more than 50 users at once"
        });
      }

      logger.info(`Auto-fix discrepancies triggered by user ${req.user!.uid} for ${userIds.length} users`);
      
      const result = await creditService.autoReconcileDiscrepancies(userIds);
      
      res.json({
        status: result.success ? "success" : "partial_success",
        reconciliation: {
          processed: result.processed,
          fixed: result.fixed,
          errors: result.errors.length,
          errorDetails: result.errors.slice(0, 10) // Limit error details
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Fix discrepancies endpoint error:", error);
      res.status(500).json({
        status: "error",
        message: "Fix discrepancies failed",
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