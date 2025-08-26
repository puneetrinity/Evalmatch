/**
 * Token Usage Service
 * 
 * Handles API token generation, usage tracking, and limit enforcement
 * for Firebase-authenticated users with database persistence.
 */

import { eq, desc, and, gte, sql, count } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import { getDatabase } from '../database';
import {
  userApiLimits,
  apiCallLogs, 
  userTokens,
  usageStatistics,
  type UserApiLimits,
  type InsertUserApiLimits,
  type UserToken,
  type InsertUserToken,
  type ApiCallLog,
  type InsertApiCallLog,
  type TokenGenerationRequest,
  type TokenGenerationResponse,
  type UsageOverview,
  type ApiUsageMetrics,
} from '../../shared/schema';
import { logger } from '../config/logger';

interface UsageTrackingOptions {
  endpoint: string;
  method: string;
  statusCode?: number;
  processingTime?: number;
  requestSize?: number;
  responseSize?: number;
  ipAddress?: string;
  userAgent?: string;
}

export class TokenUsageService {
  private static instance: TokenUsageService;

  static getInstance(): TokenUsageService {
    if (!TokenUsageService.instance) {
      TokenUsageService.instance = new TokenUsageService();
    }
    return TokenUsageService.instance;
  }

  /**
   * Initialize or get user API limits
   */
  async initializeUserLimits(userId: string): Promise<UserApiLimits> {
    try {
      
      // Check if user already exists
      const existing = await getDatabase()
        .select()
        .from(userApiLimits)
        .where(eq(userApiLimits.userId, userId))
        .limit(1);

      if (existing.length > 0) {
        return existing[0];
      }

      // Create new user with default limits
      const newUserData: InsertUserApiLimits = {
        userId,
        tier: 'testing',
        maxCalls: 200,
        usedCalls: 0,
        resetPeriod: 'monthly',
        lastReset: new Date(),
      };

      const [newUser] = await getDatabase()
        .insert(userApiLimits)
        .values(newUserData)
        .returning();

      logger.info('User API limits initialized', {
        userId,
        tier: newUser.tier,
        maxCalls: newUser.maxCalls,
      });

      return newUser;
    } catch (error) {
      logger.error('Failed to initialize user limits', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new Error('Failed to initialize user API limits');
    }
  }

  /**
   * Generate a new API token for user
   */
  async generateToken(
    userId: string, 
    request: TokenGenerationRequest
  ): Promise<TokenGenerationResponse> {
    try {
      // Ensure user limits are initialized
      const userLimits = await this.initializeUserLimits(userId);

      // Generate secure token
      const tokenId = randomBytes(16).toString('hex');
      const tokenSecret = randomBytes(32).toString('hex');
      const token = `em_${tokenId}_${tokenSecret}`;

      // Calculate expiration date
      let expiresAt: Date | undefined;
      if (request.expiresIn && request.expiresIn !== 'never') {
        expiresAt = new Date();
        switch (request.expiresIn) {
          case '1h':
            expiresAt.setHours(expiresAt.getHours() + 1);
            break;
          case '24h':
            expiresAt.setHours(expiresAt.getHours() + 24);
            break;
          case '7d':
            expiresAt.setDate(expiresAt.getDate() + 7);
            break;
          case '30d':
            expiresAt.setDate(expiresAt.getDate() + 30);
            break;
        }
      }

      // Store token in database
      const tokenData: InsertUserToken = {
        userId,
        tokenId,
        tokenName: request.tokenName || 'API Token',
        expiresAt,
        isActive: true,
        totalRequests: 0,
      };

      await getDatabase().insert(userTokens).values(tokenData);

      logger.info('API token generated', {
        userId,
        tokenId,
        tokenName: request.tokenName,
        expiresAt: expiresAt?.toISOString(),
      });

      return {
        tokenId,
        token,
        expiresAt,
        usage: {
          remaining: userLimits.maxCalls - userLimits.usedCalls,
          total: userLimits.maxCalls,
          resetDate: userLimits.resetPeriod === 'never' ? undefined : userLimits.lastReset,
        },
      };
    } catch (error) {
      logger.error('Failed to generate token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new Error('Failed to generate API token');
    }
  }

  /**
   * Validate token and return user information
   */
  async validateToken(token: string): Promise<{
    userId: string;
    tokenId: string;
    canMakeRequest: boolean;
    remainingCalls: number;
  } | null> {
    try {
      // Parse token format: em_{tokenId}_{secret}
      const tokenParts = token.split('_');
      if (tokenParts.length !== 3 || tokenParts[0] !== 'em') {
        return null;
      }

      const tokenId = tokenParts[1];

      // Find token in database
      const tokenRecord = await getDatabase()
        .select()
        .from(userTokens)
        .where(and(
          eq(userTokens.tokenId, tokenId),
          eq(userTokens.isActive, true)
        ))
        .limit(1);

      if (tokenRecord.length === 0) {
        return null;
      }

      const userToken = tokenRecord[0];

      // Check if token is expired
      if (userToken.expiresAt && userToken.expiresAt < new Date()) {
        await this.deactivateToken(tokenId);
        return null;
      }

      // Get user limits
      const userLimits = await this.getUserLimits(userToken.userId);
      if (!userLimits) {
        return null;
      }

      const remainingCalls = userLimits.maxCalls - userLimits.usedCalls;
      const canMakeRequest = remainingCalls > 0;

      return {
        userId: userToken.userId,
        tokenId,
        canMakeRequest,
        remainingCalls,
      };
    } catch (error) {
      logger.error('Failed to validate token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Track API usage
   */
  async trackUsage(userId: string, options: UsageTrackingOptions): Promise<void> {
    try {
      // Log the API call
      const logData: InsertApiCallLog = {
        userId,
        endpoint: options.endpoint,
        method: options.method,
        statusCode: options.statusCode,
        processingTime: options.processingTime,
        requestSize: options.requestSize,
        responseSize: options.responseSize,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
      };

      await getDatabase().insert(apiCallLogs).values(logData);

      // Update user usage count (only for successful requests)
      if (!options.statusCode || (options.statusCode >= 200 && options.statusCode < 400)) {
        await getDatabase()
          .update(userApiLimits)
          .set({ 
            usedCalls: sql`${userApiLimits.usedCalls} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(userApiLimits.userId, userId));

        // Update token usage count if we have the token info
        // This would require passing tokenId, which we can add later
      }

      logger.debug('API usage tracked', {
        userId,
        endpoint: options.endpoint,
        method: options.method,
        statusCode: options.statusCode,
      });
    } catch (error) {
      logger.error('Failed to track usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        endpoint: options.endpoint,
      });
    }
  }

  /**
   * Get user usage overview
   */
  async getUserUsageOverview(userId: string): Promise<UsageOverview> {
    try {
      const userLimits = await this.getUserLimits(userId);
      if (!userLimits) {
        throw new Error('User limits not found');
      }

      // Get user tokens
      const tokens = await getDatabase()
        .select()
        .from(userTokens)
        .where(eq(userTokens.userId, userId))
        .orderBy(desc(userTokens.createdAt));

      const resetDate = userLimits.resetPeriod === 'never' ? undefined : userLimits.lastReset;

      return {
        currentUsage: userLimits.usedCalls,
        limit: userLimits.maxCalls,
        tier: userLimits.tier,
        remainingCalls: userLimits.maxCalls - userLimits.usedCalls,
        resetDate,
        tokens: tokens.map(token => ({
          id: token.tokenId,
          name: token.tokenName,
          createdAt: token.createdAt!,
          lastUsedAt: token.lastUsedAt,
          totalRequests: token.totalRequests || 0,
          isActive: token.isActive,
        })),
      };
    } catch (error) {
      logger.error('Failed to get user usage overview', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new Error('Failed to get usage overview');
    }
  }

  /**
   * Get user API usage metrics
   */
  async getUserUsageMetrics(userId: string, days: number = 30): Promise<ApiUsageMetrics> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const thisWeek = new Date();
      thisWeek.setDate(thisWeek.getDate() - 7);

      const thisMonth = new Date();
      thisMonth.setDate(thisMonth.getDate() - 30);

      // Get total calls
      const [totalResult] = await getDatabase()
        .select({ count: count() })
        .from(apiCallLogs)
        .where(and(
          eq(apiCallLogs.userId, userId),
          gte(apiCallLogs.createdAt, since)
        ));

      // Get calls today
      const [todayResult] = await getDatabase()
        .select({ count: count() })
        .from(apiCallLogs)
        .where(and(
          eq(apiCallLogs.userId, userId),
          gte(apiCallLogs.createdAt, today)
        ));

      // Get calls this week
      const [weekResult] = await getDatabase()
        .select({ count: count() })
        .from(apiCallLogs)
        .where(and(
          eq(apiCallLogs.userId, userId),
          gte(apiCallLogs.createdAt, thisWeek)
        ));

      // Get calls this month
      const [monthResult] = await getDatabase()
        .select({ count: count() })
        .from(apiCallLogs)
        .where(and(
          eq(apiCallLogs.userId, userId),
          gte(apiCallLogs.createdAt, thisMonth)
        ));

      // Get top endpoints (simplified query)
      const topEndpoints = await getDatabase()
        .select({
          endpoint: apiCallLogs.endpoint,
          count: count(),
          avgResponseTime: sql<number>`AVG(${apiCallLogs.processingTime})`,
        })
        .from(apiCallLogs)
        .where(and(
          eq(apiCallLogs.userId, userId),
          gte(apiCallLogs.createdAt, since)
        ))
        .groupBy(apiCallLogs.endpoint)
        .orderBy(desc(count()))
        .limit(10);

      // Calculate error rate and avg response time
      const [statsResult] = await getDatabase()
        .select({
          errorRate: sql<number>`
            ROUND(
              (COUNT(CASE WHEN ${apiCallLogs.statusCode} >= 400 THEN 1 END)::FLOAT / COUNT(*)::FLOAT) * 100,
              2
            )
          `,
          avgResponseTime: sql<number>`AVG(${apiCallLogs.processingTime})`,
        })
        .from(apiCallLogs)
        .where(and(
          eq(apiCallLogs.userId, userId),
          gte(apiCallLogs.createdAt, since)
        ));

      return {
        totalCalls: totalResult.count,
        callsToday: todayResult.count,
        callsThisWeek: weekResult.count,
        callsThisMonth: monthResult.count,
        topEndpoints: topEndpoints.map(ep => ({
          endpoint: ep.endpoint,
          count: ep.count,
          avgResponseTime: ep.avgResponseTime || 0,
        })),
        errorRate: statsResult?.errorRate || 0,
        avgResponseTime: statsResult?.avgResponseTime || 0,
      };
    } catch (error) {
      logger.error('Failed to get user usage metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new Error('Failed to get usage metrics');
    }
  }

  /**
   * Deactivate a token
   */
  async deactivateToken(tokenId: string): Promise<void> {
    try {
      await getDatabase()
        .update(userTokens)
        .set({ 
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(userTokens.tokenId, tokenId));

      logger.info('Token deactivated', { tokenId });
    } catch (error) {
      logger.error('Failed to deactivate token', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tokenId,
      });
      throw new Error('Failed to deactivate token');
    }
  }

  /**
   * Get user limits
   */
  private async getUserLimits(userId: string): Promise<UserApiLimits | null> {
    try {
      const result = await getDatabase()
        .select()
        .from(userApiLimits)
        .where(eq(userApiLimits.userId, userId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      logger.error('Failed to get user limits', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return null;
    }
  }

  /**
   * Reset user usage (for testing or manual reset)
   */
  async resetUserUsage(userId: string): Promise<void> {
    try {
      await getDatabase()
        .update(userApiLimits)
        .set({ 
          usedCalls: 0,
          lastReset: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userApiLimits.userId, userId));

      logger.info('User usage reset', { userId });
    } catch (error) {
      logger.error('Failed to reset user usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new Error('Failed to reset user usage');
    }
  }

  /**
   * Upgrade user tier
   */
  async upgradeUserTier(
    userId: string, 
    newTier: 'basic' | 'premium' | 'enterprise',
    newMaxCalls?: number
  ): Promise<void> {
    try {
      const updateData: Partial<UserApiLimits> = {
        tier: newTier,
        updatedAt: new Date(),
      };

      // Set new limits based on tier
      if (newMaxCalls) {
        updateData.maxCalls = newMaxCalls;
      } else {
        switch (newTier) {
          case 'basic':
            updateData.maxCalls = 1000;
            break;
          case 'premium':
            updateData.maxCalls = 10000;
            break;
          case 'enterprise':
            updateData.maxCalls = 100000;
            break;
        }
      }

      await getDatabase()
        .update(userApiLimits)
        .set(updateData)
        .where(eq(userApiLimits.userId, userId));

      logger.info('User tier upgraded', { 
        userId, 
        newTier, 
        newMaxCalls: updateData.maxCalls,
      });
    } catch (error) {
      logger.error('Failed to upgrade user tier', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        newTier,
      });
      throw new Error('Failed to upgrade user tier');
    }
  }
}

export const tokenUsageService = TokenUsageService.getInstance();