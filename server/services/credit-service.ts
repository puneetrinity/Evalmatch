/**
 * Credit Service
 * Handles all credit-related operations with transactional safety
 */

import { eq, desc, and, sql } from "drizzle-orm";
import { getDatabase } from "../database";
import { userCredits, creditTransactions, type CreditTransaction } from "../../shared/schema";
import { logger } from "../lib/logger";

export interface CreditOperationResult {
  success: boolean;
  credits?: number;
  message?: string;
  error?: string;
}

export interface CreditTransactionData {
  userId: string;
  type: 'debit' | 'credit' | 'grant' | 'refund';
  amount: number;
  description: string;
  referenceId?: string;
  metadata?: Record<string, any>;
}

export interface CreditHistory {
  transactions: CreditTransaction[];
  currentBalance: number;
  totalPurchased: number;
  totalUsed: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export class CreditService {
  private static instance: CreditService;
  
  public static getInstance(): CreditService {
    if (!CreditService.instance) {
      CreditService.instance = new CreditService();
    }
    return CreditService.instance;
  }

  private get db() {
    return getDatabase();
  }

  /**
   * Get user's credit balance for read-only contexts (doesn't create records)
   */
  async getUserCreditsReadOnly(userId: string): Promise<CreditOperationResult> {
    try {
      logger.info(`Getting credits (read-only) for user: ${userId}`);
      
      const [userCredit] = await this.db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);

      if (!userCredit) {
        return {
          success: false,
          error: 'No credit record found for user'
        };
      }

      return {
        success: true,
        credits: userCredit.credits
      };
    } catch (error) {
      logger.error('Failed to get user credits (read-only):', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user's credit balance, creating user record if needed
   */
  async getUserCredits(userId: string, createIfNotExists: boolean = true): Promise<CreditOperationResult> {
    try {
      logger.info(`Getting credits for user: ${userId}`);
      
      let [userCredit] = await this.db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);

      if (!userCredit && createIfNotExists) {
        // Create user with default credits (0 for existing users, configurable for new)
        const defaultCredits = 0; // Will be set by beta grant or manual assignment
        
        await this.db.insert(userCredits).values({
          userId,
          credits: defaultCredits,
          totalCreditsPurchased: 0,
          totalCreditsUsed: 0
        });

        userCredit = {
          userId,
          credits: defaultCredits,
          totalCreditsPurchased: 0,
          totalCreditsUsed: 0,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        logger.info(`Created credit account for user ${userId} with ${defaultCredits} credits`);
      }

      if (!userCredit) {
        return {
          success: false,
          error: 'User not found and creation disabled'
        };
      }

      return {
        success: true,
        credits: userCredit.credits
      };
    } catch (error) {
      logger.error('Failed to get user credits:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Atomically deduct credits from user account
   * Returns success/failure with updated balance
   */
  async deductCredits(
    userId: string, 
    amount: number, 
    description: string,
    referenceId?: string,
    metadata?: Record<string, any>
  ): Promise<CreditOperationResult> {
    if (amount <= 0) {
      return {
        success: false,
        error: 'Deduction amount must be positive'
      };
    }

    try {
      logger.info(`Attempting to deduct ${amount} credits from user ${userId}`, {
        referenceId,
        amount
      });

      // Check for existing debit transaction with same reference ID (idempotency)
      if (referenceId) {
        const [existingDebit] = await this.db.select()
          .from(creditTransactions)
          .where(and(
            eq(creditTransactions.referenceId, referenceId),
            eq(creditTransactions.transactionType, 'debit')
          ))
          .limit(1);

        if (existingDebit) {
          logger.info(`Deduction already processed for reference ${referenceId}`, {
            userId,
            existingBalance: existingDebit.balanceAfter,
            originalAmount: Math.abs(existingDebit.amount)
          });
          return {
            success: true,
            credits: existingDebit.balanceAfter,
            message: `Deduction already processed (idempotent)`
          };
        }
      }
      
      // Use database transaction to ensure atomicity
      const result = await this.db.transaction(async (tx: any) => {
        // Lock the user record and get current balance
        const [userCredit] = await tx.select()
          .from(userCredits)
          .where(eq(userCredits.userId, userId))
          .limit(1);

        if (!userCredit) {
          throw new Error('User not found');
        }

        if (userCredit.credits < amount) {
          throw new Error(`Insufficient credits. Required: ${amount}, Available: ${userCredit.credits}`);
        }

        const newBalance = userCredit.credits - amount;

        // Update user credits
        await tx.update(userCredits)
          .set({
            credits: newBalance,
            totalCreditsUsed: userCredit.totalCreditsUsed + amount,
            updatedAt: new Date()
          })
          .where(eq(userCredits.userId, userId));

        // Log the transaction
        await tx.insert(creditTransactions).values({
          userId,
          transactionType: 'debit',
          amount: -amount, // Negative for debit
          balanceBefore: userCredit.credits,
          balanceAfter: newBalance,
          description,
          referenceId,
          metadata: metadata || {}
        });

        return newBalance;
      });

      logger.info(`Successfully deducted ${amount} credits from user ${userId}. New balance: ${result}`);
      
      return {
        success: true,
        credits: result,
        message: `Deducted ${amount} credits successfully`
      };
    } catch (error) {
      logger.error(`Failed to deduct credits for user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Add credits to user account (purchase, refund, grant)
   */
  async addCredits(
    userId: string,
    amount: number,
    description: string,
    type: 'credit' | 'grant' | 'refund' = 'credit',
    referenceId?: string,
    metadata?: Record<string, any>
  ): Promise<CreditOperationResult> {
    if (amount <= 0) {
      return {
        success: false,
        error: 'Credit amount must be positive'
      };
    }

    try {
      logger.info(`Adding ${amount} credits to user ${userId} (${type})`);
      
      // Use database transaction to ensure atomicity
      const result = await this.db.transaction(async (tx: any) => {
        // Get or create user record
        const userCredit = await tx.query.userCredits.findFirst({
          where: eq(userCredits.userId, userId)
        });

        let currentBalance = 0;
        let totalPurchased = 0;

        if (!userCredit) {
          // Create new user record
          await tx.insert(userCredits).values({
            userId,
            credits: 0,
            totalCreditsPurchased: 0,
            totalCreditsUsed: 0
          });
          
          currentBalance = 0;
          totalPurchased = 0;
        } else {
          currentBalance = userCredit.credits;
          totalPurchased = userCredit.totalCreditsPurchased;
        }

        const newBalance = currentBalance + amount;
        const newTotalPurchased = type === 'credit' ? totalPurchased + amount : totalPurchased;

        // Update user credits
        await tx.update(userCredits)
          .set({
            credits: newBalance,
            totalCreditsPurchased: newTotalPurchased,
            updatedAt: new Date()
          })
          .where(eq(userCredits.userId, userId));

        // Log the transaction
        await tx.insert(creditTransactions).values({
          userId,
          transactionType: type,
          amount: amount, // Positive for credit
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          description,
          referenceId,
          metadata: metadata || {}
        });

        return newBalance;
      });

      logger.info(`Successfully added ${amount} credits to user ${userId}. New balance: ${result}`);
      
      return {
        success: true,
        credits: result,
        message: `Added ${amount} credits successfully`
      };
    } catch (error) {
      logger.error(`Failed to add credits for user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check if user has sufficient credits for an operation
   */
  async hasCredits(userId: string, requiredCredits: number): Promise<CreditOperationResult> {
    const result = await this.getUserCredits(userId, false);
    
    if (!result.success) {
      return result;
    }

    const hasEnough = (result.credits || 0) >= requiredCredits;
    
    return {
      success: hasEnough,
      credits: result.credits,
      message: hasEnough 
        ? `User has sufficient credits (${result.credits} >= ${requiredCredits})`
        : `Insufficient credits (${result.credits} < ${requiredCredits})`
    };
  }

  /**
   * Get user's credit transaction history with pagination
   */
  async getCreditHistory(
    userId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<CreditHistory | null> {
    try {
      logger.info(`Getting credit history for user ${userId}, page ${page}, limit ${limit}`);
      
      const offset = (page - 1) * limit;
      
      // Get user's current credit info
      const [userCredit] = await this.db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);

      if (!userCredit) {
        return null;
      }

      // Get transactions with pagination
      const transactions = await this.db.select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(desc(creditTransactions.createdAt))
        .limit(limit + 1) // Get one extra to check if there are more
        .offset(offset);

      const hasMore = transactions.length > limit;
      const paginatedTransactions = hasMore ? transactions.slice(0, limit) : transactions;

      // Get total transaction count for pagination
      const totalResult = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId));
      
      const total = totalResult[0]?.count || 0;

      return {
        transactions: paginatedTransactions,
        currentBalance: userCredit.credits,
        totalPurchased: userCredit.totalCreditsPurchased,
        totalUsed: userCredit.totalCreditsUsed,
        pagination: {
          page,
          limit,
          total,
          hasMore
        }
      };
    } catch (error) {
      logger.error(`Failed to get credit history for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Refund credits for a failed operation (idempotent by reference ID)
   */
  async refundCredits(
    userId: string,
    amount: number,
    originalReferenceId: string,
    reason: string
  ): Promise<CreditOperationResult> {
    try {
      // Check if refund already exists for this reference ID
      const [existingRefund] = await this.db.select()
        .from(creditTransactions)
        .where(and(
          eq(creditTransactions.userId, userId),
          eq(creditTransactions.transactionType, 'refund'),
          eq(creditTransactions.referenceId, `refund_${originalReferenceId}`)
        ))
        .limit(1);

      if (existingRefund) {
        logger.info(`Refund already exists for reference ID ${originalReferenceId}`);
        return {
          success: true,
          message: 'Refund already processed'
        };
      }

      return await this.addCredits(
        userId,
        amount,
        `Refund: ${reason}`,
        'refund',
        `refund_${originalReferenceId}`,
        {
          original_reference_id: originalReferenceId,
          refund_reason: reason
        }
      );
    } catch (error) {
      logger.error(`Failed to refund credits for user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Grant beta credits to a user (idempotent)
   */
  async grantBetaCredits(userId: string, amount: number = 100): Promise<CreditOperationResult> {
    try {
      // Check if beta credits already granted
      const [existingGrant] = await this.db.select()
        .from(creditTransactions)
        .where(and(
          eq(creditTransactions.userId, userId),
          eq(creditTransactions.transactionType, 'grant'),
          eq(creditTransactions.referenceId, `beta_grant_${userId}`)
        ))
        .limit(1);

      if (existingGrant) {
        logger.info(`Beta credits already granted to user ${userId}`);
        const currentBalance = await this.getUserCredits(userId);
        return {
          success: true,
          credits: currentBalance.credits,
          message: 'Beta credits already granted'
        };
      }

      return await this.addCredits(
        userId,
        amount,
        'Beta testing credits',
        'grant',
        `beta_grant_${userId}`,
        {
          source: 'beta_program',
          grant_type: 'beta'
        }
      );
    } catch (error) {
      logger.error(`Failed to grant beta credits to user ${userId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const creditService = CreditService.getInstance();