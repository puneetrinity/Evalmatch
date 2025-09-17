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
  available?: boolean;
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
   * Includes automatic reconciliation for missing summary records
   */
  async getUserCreditsReadOnly(userId: string): Promise<CreditOperationResult> {
    try {
      logger.info(`Getting credits (read-only) for user: ${userId}`);
      
      const [userCredit] = await this.db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);

      if (!userCredit) {
        // Check if user has transaction history but missing summary record
        const transactions = await this.db.select()
          .from(creditTransactions)
          .where(eq(creditTransactions.userId, userId))
          .limit(1);

        if (transactions.length > 0) {
          // User has transactions but missing summary - trigger reconciliation
          logger.warn(`User ${userId} has transactions but missing credit summary. Triggering reconciliation.`);
          
          const reconciledBalance = await this.reconcileUserBalance(userId);
          if (reconciledBalance.success) {
            return {
              success: true,
              available: true,
              credits: reconciledBalance.credits,
              message: 'Balance reconciled from transaction history'
            };
          } else {
            logger.error(`Failed to reconcile balance for user ${userId}:`, reconciledBalance.error);
          }
        }

        return {
          success: false,
          available: false,
          error: 'No credit record found for user'
        };
      }

      return {
        success: true,
        available: true,
        credits: userCredit.credits
      };
    } catch (error) {
      logger.error('Failed to get user credits (read-only):', error);
      return {
        success: false,
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get user's credit balance, creating user record if needed
   * Includes automatic reconciliation for missing summary records
   */
  async getUserCredits(userId: string, createIfNotExists: boolean = true): Promise<CreditOperationResult> {
    try {
      logger.info(`Getting credits for user: ${userId}`);
      
      let [userCredit] = await this.db.select().from(userCredits).where(eq(userCredits.userId, userId)).limit(1);

      if (!userCredit) {
        // Check if user has transaction history but missing summary record
        const transactions = await this.db.select()
          .from(creditTransactions)
          .where(eq(creditTransactions.userId, userId))
          .limit(1);

        if (transactions.length > 0) {
          // User has transactions but missing summary - trigger reconciliation
          logger.warn(`User ${userId} has transactions but missing credit summary. Triggering reconciliation.`);
          
          const reconciledBalance = await this.reconcileUserBalance(userId);
          if (reconciledBalance.success) {
            return {
              success: true,
              available: true,
              credits: reconciledBalance.credits,
              message: 'Balance reconciled from transaction history'
            };
          } else {
            logger.error(`Failed to reconcile balance for user ${userId}:`, reconciledBalance.error);
          }
        }

        if (createIfNotExists) {
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
      }

      if (!userCredit) {
        return {
          success: false,
          available: false,
          error: 'User not found and creation disabled'
        };
      }

      return {
        success: true,
        available: true,
        credits: userCredit.credits
      };
    } catch (error) {
      logger.error('Failed to get user credits:', error);
      return {
        success: false,
        available: false,
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
      
      // Use database transaction to ensure atomicity with row locking
      const result = await this.db.transaction(async (tx: any) => {
        // Lock the user record and get current balance using SELECT FOR UPDATE
        const [userCredit] = await tx
          .select()
          .from(userCredits)
          .where(eq(userCredits.userId, userId))
          .for('update') // Row-level lock to prevent concurrent modifications
          .limit(1);

        if (!userCredit) {
          throw new Error('User not found');
        }

        if (userCredit.credits < amount) {
          throw new Error(`Insufficient credits. Required: ${amount}, Available: ${userCredit.credits}`);
        }

        const newBalance = userCredit.credits - amount;

        // Update user credits atomically
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
      
      // Use database transaction to ensure atomicity with row locking
      const result = await this.db.transaction(async (tx: any) => {
        // Try to get existing user record with row lock
        const [userCredit] = await tx
          .select()
          .from(userCredits)
          .where(eq(userCredits.userId, userId))
          .for('update') // Row-level lock to prevent concurrent modifications
          .limit(1);

        let currentBalance = 0;
        let totalPurchased = 0;
        let totalUsed = 0;

        if (!userCredit) {
          // Create new user record (no lock needed since it doesn't exist yet)
          await tx.insert(userCredits).values({
            userId,
            credits: 0,
            totalCreditsPurchased: 0,
            totalCreditsUsed: 0
          });
          
          currentBalance = 0;
          totalPurchased = 0;
          totalUsed = 0;
        } else {
          currentBalance = userCredit.credits;
          totalPurchased = userCredit.totalCreditsPurchased;
          totalUsed = userCredit.totalCreditsUsed;
        }

        const newBalance = currentBalance + amount;
        const newTotalPurchased = type === 'credit' ? totalPurchased + amount : totalPurchased;

        // Update user credits atomically
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
   * Reconcile user balance by rebuilding summary record from transaction history
   * This fixes data consistency issues where transactions exist but summary is missing
   */
  async reconcileUserBalance(userId: string): Promise<CreditOperationResult> {
    try {
      logger.info(`Starting balance reconciliation for user: ${userId}`);

      // Calculate balance and totals from transaction history
      const transactions = await this.db.select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, userId))
        .orderBy(desc(creditTransactions.createdAt));

      if (transactions.length === 0) {
        return {
          success: false,
          available: false,
          error: 'No transaction history found for reconciliation'
        };
      }

      // Calculate totals from transaction history
      let currentBalance = 0;
      let totalPurchased = 0;
      let totalUsed = 0;

      for (const transaction of transactions) {
        currentBalance += transaction.amount; // Amount is positive for credits, negative for debits
        
        if (transaction.transactionType === 'credit') {
          totalPurchased += transaction.amount;
        } else if (transaction.transactionType === 'debit') {
          totalUsed += Math.abs(transaction.amount); // Store as positive number
        }
        // 'grant' and 'refund' don't count toward purchased totals
      }

      // Use database transaction to ensure atomicity
      const result = await this.db.transaction(async (tx: any) => {
        // Check if record was created by another process during reconciliation
        const [existingRecord] = await tx.select()
          .from(userCredits)
          .where(eq(userCredits.userId, userId))
          .limit(1);

        if (existingRecord) {
          logger.info(`User ${userId} credit record was created during reconciliation - using existing record`);
          return existingRecord.credits;
        }

        // Create the reconciled summary record
        await tx.insert(userCredits).values({
          userId,
          credits: currentBalance,
          totalCreditsPurchased: totalPurchased,
          totalCreditsUsed: totalUsed
        });

        logger.info(`Reconciled credit record for user ${userId}`, {
          balance: currentBalance,
          totalPurchased,
          totalUsed,
          transactionCount: transactions.length
        });

        return currentBalance;
      });

      return {
        success: true,
        available: true,
        credits: result,
        message: `Balance reconciled from ${transactions.length} transactions`
      };
    } catch (error) {
      logger.error(`Failed to reconcile balance for user ${userId}:`, error);
      return {
        success: false,
        available: false,
        error: error instanceof Error ? error.message : 'Reconciliation failed'
      };
    }
  }

  /**
   * Batch reconciliation system: Find and fix all users with missing or inconsistent credit records
   * This runs a SQL aggregation to identify discrepancies and rebuilds summary records
   */
  async batchReconcileAllUsers(): Promise<{
    success: boolean;
    processed: number;
    reconciled: number;
    errors: Array<{ userId: string; error: string }>;
    details: Array<{ userId: string; action: string; balance: number; transactions: number }>;
  }> {
    try {
      logger.info('Starting batch reconciliation for all users');

      // Find all users with credit transactions
      const usersWithTransactions = await this.db
        .select({
          userId: creditTransactions.userId,
          balance: sql<number>`SUM(${creditTransactions.amount})`,
          totalCredits: sql<number>`SUM(CASE WHEN ${creditTransactions.amount} > 0 AND ${creditTransactions.transactionType} = 'credit' THEN ${creditTransactions.amount} ELSE 0 END)`,
          totalUsed: sql<number>`SUM(CASE WHEN ${creditTransactions.amount} < 0 THEN ABS(${creditTransactions.amount}) ELSE 0 END)`,
          transactionCount: sql<number>`COUNT(*)`
        })
        .from(creditTransactions)
        .groupBy(creditTransactions.userId);

      logger.info(`Found ${usersWithTransactions.length} users with credit transactions`);

      const results = {
        success: true,
        processed: 0,
        reconciled: 0,
        errors: [] as Array<{ userId: string; error: string }>,
        details: [] as Array<{ userId: string; action: string; balance: number; transactions: number }>
      };

      for (const userTransaction of usersWithTransactions) {
        results.processed++;
        
        try {
          // Check if user has a credit summary record
          const [existingSummary] = await this.db.select()
            .from(userCredits)
            .where(eq(userCredits.userId, userTransaction.userId))
            .limit(1);

          const expectedBalance = userTransaction.balance;
          const expectedTotalPurchased = userTransaction.totalCredits;
          const expectedTotalUsed = userTransaction.totalUsed;

          if (!existingSummary) {
            // Missing summary record - create it
            await this.db.insert(userCredits).values({
              userId: userTransaction.userId,
              credits: expectedBalance,
              totalCreditsPurchased: expectedTotalPurchased,
              totalCreditsUsed: expectedTotalUsed
            });

            results.reconciled++;
            results.details.push({
              userId: userTransaction.userId,
              action: 'created_missing_record',
              balance: expectedBalance,
              transactions: userTransaction.transactionCount
            });

            logger.info(`Created missing credit record for user ${userTransaction.userId}`, {
              balance: expectedBalance,
              totalPurchased: expectedTotalPurchased,
              totalUsed: expectedTotalUsed,
              transactions: userTransaction.transactionCount
            });

          } else if (
            existingSummary.credits !== expectedBalance ||
            existingSummary.totalCreditsPurchased !== expectedTotalPurchased ||
            existingSummary.totalCreditsUsed !== expectedTotalUsed
          ) {
            // Inconsistent summary record - update it
            await this.db.update(userCredits)
              .set({
                credits: expectedBalance,
                totalCreditsPurchased: expectedTotalPurchased,
                totalCreditsUsed: expectedTotalUsed,
                updatedAt: new Date()
              })
              .where(eq(userCredits.userId, userTransaction.userId));

            results.reconciled++;
            results.details.push({
              userId: userTransaction.userId,
              action: 'corrected_inconsistency',
              balance: expectedBalance,
              transactions: userTransaction.transactionCount
            });

            logger.info(`Corrected inconsistent credit record for user ${userTransaction.userId}`, {
              oldBalance: existingSummary.credits,
              newBalance: expectedBalance,
              oldTotalPurchased: existingSummary.totalCreditsPurchased,
              newTotalPurchased: expectedTotalPurchased,
              oldTotalUsed: existingSummary.totalCreditsUsed,
              newTotalUsed: expectedTotalUsed
            });

          } else {
            // Record is already consistent
            results.details.push({
              userId: userTransaction.userId,
              action: 'already_consistent',
              balance: expectedBalance,
              transactions: userTransaction.transactionCount
            });
          }

        } catch (userError) {
          const errorMessage = userError instanceof Error ? userError.message : 'Unknown error';
          results.errors.push({
            userId: userTransaction.userId,
            error: errorMessage
          });
          logger.error(`Failed to reconcile user ${userTransaction.userId}:`, userError);
        }
      }

      if (results.errors.length > 0) {
        results.success = false;
      }

      logger.info('Batch reconciliation completed', {
        processed: results.processed,
        reconciled: results.reconciled,
        errors: results.errors.length,
        successRate: `${((results.processed - results.errors.length) / results.processed * 100).toFixed(1)}%`
      });

      return results;

    } catch (error) {
      logger.error('Batch reconciliation failed:', error);
      return {
        success: false,
        processed: 0,
        reconciled: 0,
        errors: [{ userId: 'system', error: error instanceof Error ? error.message : 'Unknown error' }],
        details: []
      };
    }
  }

  /**
   * Balance monitoring: Compare user_credits with sum of credit_transactions
   * Detects discrepancies that could indicate data corruption or race conditions
   */
  async detectBalanceDiscrepancies(): Promise<{
    success: boolean;
    totalUsers: number;
    discrepancies: Array<{
      userId: string;
      summaryBalance: number;
      calculatedBalance: number;
      delta: number;
      summaryTotalPurchased: number;
      calculatedTotalPurchased: number;
      summaryTotalUsed: number;
      calculatedTotalUsed: number;
      lastTransactionAt: string;
      transactionCount: number;
    }>;
    error?: string;
  }> {
    try {
      logger.info('Starting balance discrepancy detection');

      // Get all users with their summary balances and calculated balances from transactions
      const query = sql`
        SELECT 
          uc.user_id,
          uc.credits as summary_balance,
          uc.total_credits_purchased as summary_total_purchased,
          uc.total_credits_used as summary_total_used,
          uc.updated_at as summary_updated_at,
          COALESCE(SUM(ct.amount), 0) as calculated_balance,
          COALESCE(SUM(CASE WHEN ct.amount > 0 AND ct.transaction_type = 'credit' THEN ct.amount ELSE 0 END), 0) as calculated_total_purchased,
          COALESCE(SUM(CASE WHEN ct.amount < 0 THEN ABS(ct.amount) ELSE 0 END), 0) as calculated_total_used,
          COUNT(ct.id) as transaction_count,
          MAX(ct.created_at) as last_transaction_at
        FROM user_credits uc
        LEFT JOIN credit_transactions ct ON uc.user_id = ct.user_id
        GROUP BY uc.user_id, uc.credits, uc.total_credits_purchased, uc.total_credits_used, uc.updated_at
      `;

      const results = await this.db.execute(query);
      const users = results.rows as any[];

      const discrepancies = [];
      let totalUsers = 0;

      for (const user of users) {
        totalUsers++;

        const summaryBalance = Number(user.summary_balance);
        const calculatedBalance = Number(user.calculated_balance);
        const summaryTotalPurchased = Number(user.summary_total_purchased);
        const calculatedTotalPurchased = Number(user.calculated_total_purchased);
        const summaryTotalUsed = Number(user.summary_total_used);
        const calculatedTotalUsed = Number(user.calculated_total_used);
        
        const balanceDelta = summaryBalance - calculatedBalance;
        const purchasedDelta = summaryTotalPurchased - calculatedTotalPurchased;
        const usedDelta = summaryTotalUsed - calculatedTotalUsed;

        // Check for any discrepancies
        if (balanceDelta !== 0 || purchasedDelta !== 0 || usedDelta !== 0) {
          discrepancies.push({
            userId: user.user_id,
            summaryBalance,
            calculatedBalance,
            delta: balanceDelta,
            summaryTotalPurchased,
            calculatedTotalPurchased,
            summaryTotalUsed,
            calculatedTotalUsed,
            lastTransactionAt: user.last_transaction_at,
            transactionCount: Number(user.transaction_count)
          });

          logger.warn('Balance discrepancy detected', {
            userId: user.user_id,
            summaryBalance,
            calculatedBalance,
            balanceDelta,
            purchasedDelta,
            usedDelta,
            transactionCount: user.transaction_count
          });
        }
      }

      logger.info('Balance discrepancy detection completed', {
        totalUsers,
        discrepancies: discrepancies.length,
        discrepancyRate: totalUsers > 0 ? `${(discrepancies.length / totalUsers * 100).toFixed(2)}%` : '0%'
      });

      return {
        success: true,
        totalUsers,
        discrepancies
      };

    } catch (error) {
      logger.error('Balance discrepancy detection failed:', error);
      return {
        success: false,
        totalUsers: 0,
        discrepancies: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Auto-reconcile users with balance discrepancies
   * This can be called after detectBalanceDiscrepancies to fix found issues
   */
  async autoReconcileDiscrepancies(userIds: string[]): Promise<{
    success: boolean;
    processed: number;
    fixed: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    try {
      logger.info(`Starting auto-reconciliation for ${userIds.length} users with discrepancies`);

      const results = {
        success: true,
        processed: 0,
        fixed: 0,
        errors: [] as Array<{ userId: string; error: string }>
      };

      for (const userId of userIds) {
        results.processed++;
        
        try {
          const reconciledBalance = await this.reconcileUserBalance(userId);
          if (reconciledBalance.success) {
            results.fixed++;
            logger.info(`Auto-reconciled user ${userId}: ${reconciledBalance.message}`);
          } else {
            results.errors.push({
              userId,
              error: reconciledBalance.error || 'Reconciliation failed'
            });
            logger.error(`Failed to auto-reconcile user ${userId}:`, reconciledBalance.error);
          }
        } catch (userError) {
          const errorMessage = userError instanceof Error ? userError.message : 'Unknown error';
          results.errors.push({ userId, error: errorMessage });
          logger.error(`Auto-reconciliation error for user ${userId}:`, userError);
        }
      }

      if (results.errors.length > 0) {
        results.success = false;
      }

      logger.info('Auto-reconciliation completed', {
        processed: results.processed,
        fixed: results.fixed,
        errors: results.errors.length
      });

      return results;

    } catch (error) {
      logger.error('Auto-reconciliation failed:', error);
      return {
        success: false,
        processed: 0,
        fixed: 0,
        errors: [{ userId: 'system', error: error instanceof Error ? error.message : 'Unknown error' }]
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