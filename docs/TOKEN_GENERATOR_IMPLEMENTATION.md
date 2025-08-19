# Firebase Token Generator Implementation Document

## Current Codebase Analysis

### ✅ **Existing Infrastructure (Ready to Use)**

#### **1. Firebase Authentication System**
- **Client-side**: `/client/src/lib/firebase.ts` - Complete Firebase client setup
- **Server-side**: `/server/auth/firebase-auth.ts` - Firebase Admin SDK integration
- **Middleware**: `/server/middleware/auth.ts` - Authentication middleware with security

#### **2. Database & Schema**
- **Database**: `/server/database/index.ts` - PostgreSQL with Drizzle ORM
- **Schema**: `/shared/schema.ts` - Existing user and data tables
- **Migrations**: `/server/migrations/` - SQL migration system

#### **3. UI Components**
- **React Components**: `/client/src/components/` - shadcn/ui components
- **Authentication UI**: `/client/src/components/auth/` - Login/Register forms
- **Layout System**: Modern React with TypeScript

#### **4. API Infrastructure**
- **Routes**: `/server/routes/` - Express.js API endpoints
- **Middleware**: Rate limiting, validation, error handling
- **Monitoring**: Built-in performance and health monitoring

## Implementation Plan

### **Phase 1: Database Schema Extensions** (Day 1)

#### **1.1 Create Token Usage Tables**
```sql
-- Add to migrations: 011_token_usage_system.sql

-- User API limits and usage tracking
CREATE TABLE IF NOT EXISTS user_api_limits (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'testing', -- 'testing', 'commercial'
  max_calls INTEGER NOT NULL DEFAULT 200,
  used_calls INTEGER NOT NULL DEFAULT 0,
  last_reset_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT fk_user_api_limits_user_id FOREIGN KEY (user_id) REFERENCES users(firebase_uid)
);

-- API call logs for monitoring and billing
CREATE TABLE IF NOT EXISTS api_call_logs (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_time INTEGER NOT NULL, -- milliseconds
  request_size INTEGER DEFAULT 0,
  response_size INTEGER DEFAULT 0,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes for performance
  INDEX idx_api_call_logs_user_id (user_id),
  INDEX idx_api_call_logs_created_at (created_at),
  
  -- Foreign key
  CONSTRAINT fk_api_call_logs_user_id FOREIGN KEY (user_id) REFERENCES users(firebase_uid)
);

-- Token generation history
CREATE TABLE IF NOT EXISTS token_generations (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_type TEXT NOT NULL, -- 'id_token', 'custom_token'
  token_id TEXT NOT NULL, -- Unique identifier for the token
  expires_at TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Foreign key
  CONSTRAINT fk_token_generations_user_id FOREIGN KEY (user_id) REFERENCES users(firebase_uid)
);

-- Create indexes
CREATE INDEX idx_user_api_limits_user_id ON user_api_limits(user_id);
CREATE INDEX idx_api_call_logs_user_created ON api_call_logs(user_id, created_at);
CREATE INDEX idx_token_generations_user_id ON token_generations(user_id);
```

#### **1.2 Update Schema Types**
```typescript
// Add to shared/schema.ts

export const userApiLimits = pgTable('user_api_limits', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  tier: text('tier').notNull().default('testing'),
  maxCalls: integer('max_calls').notNull().default(200),
  usedCalls: integer('used_calls').notNull().default(0),
  lastResetDate: timestamp('last_reset_date').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const apiCallLogs = pgTable('api_call_logs', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  method: text('method').notNull(),
  statusCode: integer('status_code').notNull(),
  responseTime: integer('response_time').notNull(),
  requestSize: integer('request_size').default(0),
  responseSize: integer('response_size').default(0),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const tokenGenerations = pgTable('token_generations', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenType: text('token_type').notNull(),
  tokenId: text('token_id').notNull(),
  expiresAt: timestamp('expires_at'),
  isRevoked: boolean('is_revoked').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Type exports
export type UserApiLimit = typeof userApiLimits.$inferSelect;
export type NewUserApiLimit = typeof userApiLimits.$inferInsert;
export type ApiCallLog = typeof apiCallLogs.$inferSelect;
export type NewApiCallLog = typeof apiCallLogs.$inferInsert;
export type TokenGeneration = typeof tokenGenerations.$inferSelect;
export type NewTokenGeneration = typeof tokenGenerations.$inferInsert;
```

### **Phase 2: Backend Services** (Day 1-2)

#### **2.1 Usage Tracking Service**
```typescript
// server/services/usage-tracking-service.ts

import { getDatabase } from '../database';
import { userApiLimits, apiCallLogs } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { logger } from '../config/logger';

export interface UsageStats {
  userId: string;
  tier: 'testing' | 'commercial';
  maxCalls: number;
  usedCalls: number;
  remainingCalls: number;
  lastResetDate: Date;
  isLimitExceeded: boolean;
}

export class UsageTrackingService {
  private db = getDatabase();

  /**
   * Initialize user API limits (called on first token generation)
   */
  async initializeUserLimits(userId: string): Promise<UsageStats> {
    try {
      // Check if user already has limits
      const existing = await this.db.select()
        .from(userApiLimits)
        .where(eq(userApiLimits.userId, userId))
        .limit(1);

      if (existing.length > 0) {
        return this.formatUsageStats(existing[0]);
      }

      // Create new limits for testing tier
      const [newLimit] = await this.db.insert(userApiLimits)
        .values({
          userId,
          tier: 'testing',
          maxCalls: 200,
          usedCalls: 0,
        })
        .returning();

      logger.info('Initialized API limits for user', { userId, tier: 'testing' });
      return this.formatUsageStats(newLimit);
    } catch (error) {
      logger.error('Failed to initialize user limits', error, { userId });
      throw new Error('Failed to initialize API usage limits');
    }
  }

  /**
   * Get current usage stats for a user
   */
  async getUserUsage(userId: string): Promise<UsageStats | null> {
    try {
      const [limit] = await this.db.select()
        .from(userApiLimits)
        .where(eq(userApiLimits.userId, userId))
        .limit(1);

      return limit ? this.formatUsageStats(limit) : null;
    } catch (error) {
      logger.error('Failed to get user usage', error, { userId });
      return null;
    }
  }

  /**
   * Record an API call and check limits
   */
  async recordApiCall(
    userId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ allowed: boolean; usage: UsageStats }> {
    try {
      // Get or initialize user limits
      let usage = await this.getUserUsage(userId);
      if (!usage) {
        usage = await this.initializeUserLimits(userId);
      }

      // Check if limit exceeded
      if (usage.isLimitExceeded) {
        logger.warn('API call blocked - limit exceeded', { userId, endpoint, method });
        return { allowed: false, usage };
      }

      // Log the API call
      await this.db.insert(apiCallLogs).values({
        userId,
        endpoint,
        method,
        statusCode,
        responseTime,
        ipAddress,
        userAgent,
      });

      // Increment usage counter
      const [updatedLimit] = await this.db.update(userApiLimits)
        .set({
          usedCalls: sql`${userApiLimits.usedCalls} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(userApiLimits.userId, userId))
        .returning();

      const updatedUsage = this.formatUsageStats(updatedLimit);
      
      logger.info('API call recorded', {
        userId,
        endpoint,
        method,
        statusCode,
        usedCalls: updatedUsage.usedCalls,
        remainingCalls: updatedUsage.remainingCalls,
      });

      return { allowed: true, usage: updatedUsage };
    } catch (error) {
      logger.error('Failed to record API call', error, { userId, endpoint, method });
      throw new Error('Failed to record API usage');
    }
  }

  /**
   * Get usage statistics for monitoring
   */
  async getUsageAnalytics(userId: string, days: number = 30) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const callLogs = await this.db.select()
        .from(apiCallLogs)
        .where(
          and(
            eq(apiCallLogs.userId, userId),
            gte(apiCallLogs.createdAt, since)
          )
        )
        .orderBy(apiCallLogs.createdAt);

      return {
        totalCalls: callLogs.length,
        callsByDay: this.groupCallsByDay(callLogs),
        callsByEndpoint: this.groupCallsByEndpoint(callLogs),
        averageResponseTime: this.calculateAverageResponseTime(callLogs),
        errorRate: this.calculateErrorRate(callLogs),
      };
    } catch (error) {
      logger.error('Failed to get usage analytics', error, { userId });
      return null;
    }
  }

  /**
   * Upgrade user to commercial tier
   */
  async upgradeToCommercial(userId: string): Promise<UsageStats> {
    try {
      const [updatedLimit] = await this.db.update(userApiLimits)
        .set({
          tier: 'commercial',
          maxCalls: -1, // Unlimited
          updatedAt: new Date(),
        })
        .where(eq(userApiLimits.userId, userId))
        .returning();

      logger.info('User upgraded to commercial tier', { userId });
      return this.formatUsageStats(updatedLimit);
    } catch (error) {
      logger.error('Failed to upgrade user to commercial', error, { userId });
      throw new Error('Failed to upgrade user tier');
    }
  }

  private formatUsageStats(limit: any): UsageStats {
    const maxCalls = limit.maxCalls === -1 ? Number.MAX_SAFE_INTEGER : limit.maxCalls;
    const remainingCalls = Math.max(0, maxCalls - limit.usedCalls);
    const isLimitExceeded = limit.tier === 'testing' && limit.usedCalls >= limit.maxCalls;

    return {
      userId: limit.userId,
      tier: limit.tier,
      maxCalls: limit.maxCalls,
      usedCalls: limit.usedCalls,
      remainingCalls,
      lastResetDate: limit.lastResetDate,
      isLimitExceeded,
    };
  }

  private groupCallsByDay(logs: any[]) {
    // Implementation for daily usage analytics
    const groups: { [key: string]: number } = {};
    logs.forEach(log => {
      const day = log.createdAt.toISOString().split('T')[0];
      groups[day] = (groups[day] || 0) + 1;
    });
    return groups;
  }

  private groupCallsByEndpoint(logs: any[]) {
    const groups: { [key: string]: number } = {};
    logs.forEach(log => {
      groups[log.endpoint] = (groups[log.endpoint] || 0) + 1;
    });
    return groups;
  }

  private calculateAverageResponseTime(logs: any[]): number {
    if (logs.length === 0) return 0;
    const total = logs.reduce((sum, log) => sum + log.responseTime, 0);
    return Math.round(total / logs.length);
  }

  private calculateErrorRate(logs: any[]): number {
    if (logs.length === 0) return 0;
    const errors = logs.filter(log => log.statusCode >= 400).length;
    return Math.round((errors / logs.length) * 100);
  }
}

export const usageTrackingService = new UsageTrackingService();
```

#### **2.2 Token Generation Service**
```typescript
// server/services/token-service.ts

import { adminAuth } from '../auth/firebase-auth';
import { getDatabase } from '../database';
import { tokenGenerations } from '@shared/schema';
import { logger } from '../config/logger';
import { nanoid } from 'nanoid';

export interface TokenOptions {
  userId: string;
  type: 'id_token' | 'custom_token';
  customClaims?: Record<string, any>;
  expiresIn?: number; // seconds
}

export interface GeneratedToken {
  tokenId: string;
  token: string;
  type: 'id_token' | 'custom_token';
  expiresAt: Date | null;
  metadata: {
    userId: string;
    generatedAt: Date;
    claims?: Record<string, any>;
  };
}

export class TokenService {
  private db = getDatabase();

  /**
   * Generate a custom token for a user
   */
  async generateCustomToken(userId: string, claims?: Record<string, any>): Promise<GeneratedToken> {
    try {
      if (!adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      // Generate custom token with Firebase Admin SDK
      const customToken = await adminAuth.createCustomToken(userId, claims);
      const tokenId = nanoid();
      const expiresAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour

      // Log token generation
      await this.db.insert(tokenGenerations).values({
        userId,
        tokenType: 'custom_token',
        tokenId,
        expiresAt,
      });

      logger.info('Custom token generated', { userId, tokenId });

      return {
        tokenId,
        token: customToken,
        type: 'custom_token',
        expiresAt,
        metadata: {
          userId,
          generatedAt: new Date(),
          claims,
        },
      };
    } catch (error) {
      logger.error('Failed to generate custom token', error, { userId });
      throw new Error('Failed to generate custom token');
    }
  }

  /**
   * Generate an ID token (for authenticated users)
   */
  async generateIdToken(userId: string): Promise<GeneratedToken> {
    try {
      if (!adminAuth) {
        throw new Error('Firebase Admin not initialized');
      }

      // For ID tokens, we create a custom token that the client can use to sign in
      // The client then gets the actual ID token
      const customToken = await adminAuth.createCustomToken(userId);
      const tokenId = nanoid();
      const expiresAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour

      // Log token generation
      await this.db.insert(tokenGenerations).values({
        userId,
        tokenType: 'id_token',
        tokenId,
        expiresAt,
      });

      logger.info('ID token generation initiated', { userId, tokenId });

      return {
        tokenId,
        token: customToken,
        type: 'id_token',
        expiresAt,
        metadata: {
          userId,
          generatedAt: new Date(),
        },
      };
    } catch (error) {
      logger.error('Failed to generate ID token', error, { userId });
      throw new Error('Failed to generate ID token');
    }
  }

  /**
   * Validate and parse token metadata
   */
  parseTokenMetadata(token: string): any {
    try {
      // Basic JWT parsing (header.payload.signature)
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid token format');
      }

      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf-8')
      );

      return {
        iss: payload.iss,
        sub: payload.sub,
        aud: payload.aud,
        exp: payload.exp,
        iat: payload.iat,
        claims: payload,
      };
    } catch (error) {
      logger.warn('Failed to parse token metadata', error);
      return null;
    }
  }
}

export const tokenService = new TokenService();
```

#### **2.3 Usage Tracking Middleware**
```typescript
// server/middleware/usage-tracking.ts

import { Request, Response, NextFunction } from 'express';
import { usageTrackingService } from '../services/usage-tracking-service';
import { logger } from '../config/logger';

declare global {
  namespace Express {
    interface Request {
      usage?: {
        allowed: boolean;
        remainingCalls: number;
        tier: string;
      };
    }
  }
}

/**
 * Middleware to track API usage and enforce limits
 */
export function trackApiUsage(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Only track authenticated requests
  if (!req.user?.uid) {
    return next();
  }

  // Store original res.end to capture response details
  const originalEnd = res.end;
  
  res.end = function(chunk?: any, encoding?: any) {
    const responseTime = Date.now() - startTime;
    
    // Record the API call asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const result = await usageTrackingService.recordApiCall(
          req.user!.uid,
          req.route?.path || req.path,
          req.method,
          res.statusCode,
          responseTime,
          req.ip,
          req.get('User-Agent')
        );

        // Log usage warnings
        if (!result.allowed) {
          logger.warn('API call blocked - usage limit exceeded', {
            userId: req.user!.uid,
            endpoint: req.path,
            usedCalls: result.usage.usedCalls,
            maxCalls: result.usage.maxCalls,
          });
        } else if (result.usage.remainingCalls <= 10) {
          logger.warn('User approaching API limit', {
            userId: req.user!.uid,
            remainingCalls: result.usage.remainingCalls,
          });
        }
      } catch (error) {
        logger.error('Failed to record API usage', error, {
          userId: req.user!.uid,
          endpoint: req.path,
        });
      }
    });

    // Call original end method
    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

/**
 * Middleware to check usage limits before processing request
 */
export async function checkUsageLimits(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.uid) {
    return next();
  }

  try {
    const usage = await usageTrackingService.getUserUsage(req.user.uid);
    
    if (!usage) {
      // Initialize limits for new users
      await usageTrackingService.initializeUserLimits(req.user.uid);
      return next();
    }

    if (usage.isLimitExceeded) {
      return res.status(429).json({
        error: 'Usage limit exceeded',
        message: `You have reached your ${usage.tier} tier limit of ${usage.maxCalls} API calls.`,
        code: 'USAGE_LIMIT_EXCEEDED',
        usage: {
          tier: usage.tier,
          usedCalls: usage.usedCalls,
          maxCalls: usage.maxCalls,
          remainingCalls: usage.remainingCalls,
        },
        upgrade: {
          message: 'Ready to scale? Contact us for commercial pricing.',
          contactEmail: 'sales@evalmatch.com',
          pricingUrl: '/pricing',
        },
      });
    }

    // Attach usage info to request
    req.usage = {
      allowed: true,
      remainingCalls: usage.remainingCalls,
      tier: usage.tier,
    };

    next();
  } catch (error) {
    logger.error('Usage limit check failed', error, { userId: req.user.uid });
    // Don't block request on usage check failure
    next();
  }
}
```

### **Phase 3: API Routes** (Day 2)

#### **3.1 Token Generator API Routes**
```typescript
// server/routes/token-generator.ts

import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import { checkUsageLimits } from '../middleware/usage-tracking';
import { tokenService } from '../services/token-service';
import { usageTrackingService } from '../services/usage-tracking-service';
import { logger } from '../config/logger';
import { z } from 'zod';

const router = Router();

// Input validation schemas
const generateTokenSchema = z.object({
  type: z.enum(['custom', 'id_token']),
  customClaims: z.record(z.any()).optional(),
});

/**
 * Generate a new token for the authenticated user
 */
router.post('/generate', authenticateUser, checkUsageLimits, async (req, res) => {
  try {
    const { type, customClaims } = generateTokenSchema.parse(req.body);
    const userId = req.user!.uid;

    let generatedToken;

    if (type === 'custom') {
      generatedToken = await tokenService.generateCustomToken(userId, customClaims);
    } else {
      generatedToken = await tokenService.generateIdToken(userId);
    }

    res.json({
      success: true,
      data: {
        tokenId: generatedToken.tokenId,
        token: generatedToken.token,
        type: generatedToken.type,
        expiresAt: generatedToken.expiresAt,
        metadata: generatedToken.metadata,
      },
      usage: req.usage,
    });
  } catch (error) {
    logger.error('Token generation failed', error, { userId: req.user?.uid });
    
    res.status(500).json({
      success: false,
      error: 'Token generation failed',
      message: 'Failed to generate authentication token. Please try again.',
      code: 'TOKEN_GENERATION_ERROR',
    });
  }
});

/**
 * Get user's current usage statistics
 */
router.get('/usage', authenticateUser, async (req, res) => {
  try {
    const userId = req.user!.uid;
    const usage = await usageTrackingService.getUserUsage(userId);

    if (!usage) {
      // Initialize limits for new users
      const newUsage = await usageTrackingService.initializeUserLimits(userId);
      return res.json({
        success: true,
        data: newUsage,
      });
    }

    res.json({
      success: true,
      data: usage,
    });
  } catch (error) {
    logger.error('Failed to get usage statistics', error, { userId: req.user?.uid });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get usage statistics',
      message: 'Could not retrieve your API usage information.',
      code: 'USAGE_STATS_ERROR',
    });
  }
});

/**
 * Get detailed usage analytics
 */
router.get('/analytics', authenticateUser, async (req, res) => {
  try {
    const userId = req.user!.uid;
    const days = parseInt(req.query.days as string) || 30;
    
    const analytics = await usageTrackingService.getUsageAnalytics(userId, days);

    res.json({
      success: true,
      data: analytics,
      period: `${days} days`,
    });
  } catch (error) {
    logger.error('Failed to get usage analytics', error, { userId: req.user?.uid });
    
    res.status(500).json({
      success: false,
      error: 'Failed to get usage analytics',
      message: 'Could not retrieve your usage analytics.',
      code: 'ANALYTICS_ERROR',
    });
  }
});

/**
 * Validate a token and get its metadata
 */
router.post('/validate', authenticateUser, async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Token is required',
        code: 'MISSING_TOKEN',
      });
    }

    const metadata = tokenService.parseTokenMetadata(token);
    
    if (!metadata) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token',
        message: 'Could not parse token metadata',
        code: 'INVALID_TOKEN_FORMAT',
      });
    }

    res.json({
      success: true,
      data: {
        valid: true,
        metadata,
        expiresAt: new Date(metadata.exp * 1000),
        userId: metadata.sub,
      },
    });
  } catch (error) {
    logger.error('Token validation failed', error, { userId: req.user?.uid });
    
    res.status(500).json({
      success: false,
      error: 'Token validation failed',
      message: 'Could not validate the provided token.',
      code: 'TOKEN_VALIDATION_ERROR',
    });
  }
});

export default router;
```

### **Phase 4: Frontend Components** (Day 2-3)

#### **4.1 Token Generator Main Component**
```typescript
// client/src/pages/token-generator.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Copy, Key, Shield, BarChart3, AlertCircle } from 'lucide-react';
import { TokenTypeSelector } from '../components/token-generator/TokenTypeSelector';
import { TokenDisplay } from '../components/token-generator/TokenDisplay';
import { UsageDashboard } from '../components/token-generator/UsageDashboard';
import { CopyButton } from '../components/token-generator/CopyButton';

interface UsageStats {
  userId: string;
  tier: 'testing' | 'commercial';
  maxCalls: number;
  usedCalls: number;
  remainingCalls: number;
  isLimitExceeded: boolean;
}

interface GeneratedToken {
  tokenId: string;
  token: string;
  type: 'custom' | 'id_token';
  expiresAt: string;
  metadata: {
    userId: string;
    generatedAt: string;
  };
}

export function TokenGeneratorPage() {
  const { user, loading } = useAuth();
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [generatedToken, setGeneratedToken] = useState<GeneratedToken | null>(null);
  const [tokenType, setTokenType] = useState<'custom' | 'id_token'>('id_token');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch usage statistics
  const fetchUsage = async () => {
    try {
      const token = await user?.getIdToken();
      const response = await fetch('/api/token-generator/usage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const result = await response.json();
        setUsage(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    }
  };

  useEffect(() => {
    if (user) {
      fetchUsage();
    }
  }, [user]);

  const generateToken = async () => {
    if (!user || !usage) return;

    setIsGenerating(true);
    setError(null);

    try {
      const authToken = await user.getIdToken();
      const response = await fetch('/api/token-generator/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          type: tokenType,
          customClaims: tokenType === 'custom' ? { testing: true } : undefined,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setGeneratedToken(result.data);
        // Update usage stats
        await fetchUsage();
      } else {
        setError(result.message || 'Failed to generate token');
      }
    } catch (error) {
      setError('Network error occurred. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Authentication Required
            </CardTitle>
            <CardDescription>
              Sign in to generate Firebase tokens for EvalMatch SDK testing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => window.location.href = '/auth'} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Key className="h-8 w-8" />
          Firebase Token Generator
        </h1>
        <p className="text-muted-foreground">
          Generate authentication tokens for EvalMatch SDK integration testing
        </p>
      </div>

      {/* Usage Overview */}
      {usage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                API Usage
              </span>
              <Badge variant={usage.tier === 'testing' ? 'secondary' : 'default'}>
                {usage.tier.charAt(0).toUpperCase() + usage.tier.slice(1)} Tier
              </Badge>
            </CardTitle>
            <CardDescription>
              Track your API usage and monitor remaining calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {usage.usedCalls}
                </div>
                <div className="text-sm text-muted-foreground">Used Today</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {usage.remainingCalls}
                </div>
                <div className="text-sm text-muted-foreground">Remaining</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {usage.tier === 'testing' ? usage.maxCalls : '∞'}
                </div>
                <div className="text-sm text-muted-foreground">Total Limit</div>
              </div>
            </div>

            {usage.tier === 'testing' && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progress</span>
                  <span>{Math.round((usage.usedCalls / usage.maxCalls) * 100)}%</span>
                </div>
                <Progress 
                  value={(usage.usedCalls / usage.maxCalls) * 100}
                  className="h-2"
                />
              </div>
            )}

            {usage.remainingCalls <= 20 && usage.tier === 'testing' && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You have {usage.remainingCalls} API calls remaining. 
                  <a href="/pricing" className="ml-1 underline">
                    Upgrade to commercial
                  </a> for unlimited access.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Token Generation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Token Type Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Token</CardTitle>
            <CardDescription>
              Choose your token type and generate credentials for SDK testing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TokenTypeSelector 
              selectedType={tokenType}
              onTypeChange={setTokenType}
              disabled={usage?.isLimitExceeded}
            />

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={generateToken}
              disabled={isGenerating || usage?.isLimitExceeded}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4 mr-2" />
                  Generate {tokenType === 'custom' ? 'Custom' : 'ID'} Token
                </>
              )}
            </Button>

            {usage?.isLimitExceeded && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You've reached your testing limit of {usage.maxCalls} API calls.{' '}
                  <a href="/pricing" className="underline">
                    Upgrade to continue
                  </a>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Token Display */}
        {generatedToken && (
          <TokenDisplay 
            token={generatedToken}
            onClear={() => setGeneratedToken(null)}
          />
        )}
      </div>

      {/* Usage Dashboard */}
      {usage && <UsageDashboard userId={user.uid} />}

      {/* SDK Integration Guide */}
      <Card>
        <CardHeader>
          <CardTitle>SDK Integration</CardTitle>
          <CardDescription>
            Copy and paste this code to integrate with the EvalMatch SDK
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted rounded-md p-4">
            <pre className="text-sm">
{`import { EvalMatchClient } from '@evalmatch/sdk';

const client = new EvalMatchClient({
  baseUrl: 'https://evalmatch.app/api',
  authProvider: {
    getToken: () => '${generatedToken?.token || 'YOUR_TOKEN_HERE'}',
    isAuthenticated: () => true
  }
});

// Test the connection
const resumes = await client.resumes.list();
console.log('✅ SDK working!', resumes.data);`}
            </pre>
          </div>
          <CopyButton 
            text={generatedToken?.token || ''}
            className="w-full"
            disabled={!generatedToken}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

### **Phase 5: Component Library** (Day 3)

#### **5.1 Supporting Components**
```typescript
// client/src/components/token-generator/TokenTypeSelector.tsx
import React from 'react';
import { Card, CardContent } from '../ui/card';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Key, Settings } from 'lucide-react';

interface TokenTypeSelectorProps {
  selectedType: 'custom' | 'id_token';
  onTypeChange: (type: 'custom' | 'id_token') => void;
  disabled?: boolean;
}

export function TokenTypeSelector({ selectedType, onTypeChange, disabled }: TokenTypeSelectorProps) {
  const tokenTypes = [
    {
      id: 'id_token' as const,
      label: 'ID Token',
      description: 'Standard Firebase ID token with user authentication',
      icon: Key,
      recommended: true,
    },
    {
      id: 'custom' as const,
      label: 'Custom Token',
      description: 'Custom token with additional claims for testing',
      icon: Settings,
      recommended: false,
    },
  ];

  return (
    <RadioGroup 
      value={selectedType}
      onValueChange={onTypeChange}
      disabled={disabled}
      className="space-y-3"
    >
      {tokenTypes.map((type) => {
        const Icon = type.icon;
        return (
          <div 
            key={type.id}
            className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-muted/50"
          >
            <RadioGroupItem value={type.id} id={type.id} />
            <div className="flex-1">
              <Label htmlFor={type.id} className="flex items-center gap-2 cursor-pointer">
                <Icon className="h-4 w-4" />
                {type.label}
                {type.recommended && (
                  <Badge variant="secondary" className="text-xs">
                    Recommended
                  </Badge>
                )}
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                {type.description}
              </p>
            </div>
          </div>
        );
      })}
    </RadioGroup>
  );
}

// client/src/components/token-generator/TokenDisplay.tsx
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { CopyButton } from './CopyButton';
import { Eye, EyeOff, X, Clock } from 'lucide-react';

interface TokenDisplayProps {
  token: {
    tokenId: string;
    token: string;
    type: 'custom' | 'id_token';
    expiresAt: string;
    metadata: {
      userId: string;
      generatedAt: string;
    };
  };
  onClear: () => void;
}

export function TokenDisplay({ token, onClear }: TokenDisplayProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  
  const expiresAt = new Date(token.expiresAt);
  const timeUntilExpiry = Math.max(0, expiresAt.getTime() - Date.now());
  const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));
  const minutesUntilExpiry = Math.floor((timeUntilExpiry % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            Generated Token
            <Badge variant="outline">
              {token.type === 'custom' ? 'Custom' : 'ID Token'}
            </Badge>
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Token Display */}
        <div className="relative">
          <div className="bg-muted rounded-md p-3 pr-12 font-mono text-sm break-all">
            {isVisible ? token.token : '•'.repeat(60)}
          </div>
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVisible(!isVisible)}
            >
              {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <CopyButton 
              text={token.token}
              size="sm"
              variant="ghost"
            />
          </div>
        </div>

        {/* Token Metadata */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-medium">Token ID</div>
            <div className="text-muted-foreground font-mono">
              {token.tokenId}
            </div>
          </div>
          <div>
            <div className="font-medium">Generated</div>
            <div className="text-muted-foreground">
              {new Date(token.metadata.generatedAt).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Expiration Warning */}
        <div className="flex items-center gap-2 text-sm p-3 bg-amber-50 border border-amber-200 rounded-md">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="text-amber-800">
            Expires in {hoursUntilExpiry}h {minutesUntilExpiry}m
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

### **Phase 6: Integration & Testing** (Day 3-4)

#### **6.1 Route Integration**
```typescript
// server/routes/index.ts
import tokenGeneratorRoutes from './token-generator';

// Add to existing routes
app.use('/api/token-generator', tokenGeneratorRoutes);
```

#### **6.2 Middleware Integration**
```typescript
// server/index.ts
import { trackApiUsage } from './middleware/usage-tracking';

// Add usage tracking to all API routes
app.use('/api', trackApiUsage);
```

### **Phase 7: Admin Dashboard** (Day 4)

#### **7.1 Admin Routes**
```typescript
// server/routes/admin/token-usage.ts
import { Router } from 'express';
import { getDatabase } from '../../database';
import { userApiLimits, apiCallLogs } from '@shared/schema';
import { sql, desc, gte, and } from 'drizzle-orm';

const router = Router();

// Admin middleware (implement based on your admin auth)
// router.use(requireAdminAuth);

/**
 * Get usage overview for all users
 */
router.get('/overview', async (req, res) => {
  try {
    const db = getDatabase();
    
    const stats = await db.select({
      totalUsers: sql`count(*)`,
      testingUsers: sql`count(*) filter (where tier = 'testing')`,
      commercialUsers: sql`count(*) filter (where tier = 'commercial')`,
      totalApiCalls: sql`sum(used_calls)`,
      averageUsage: sql`avg(used_calls)`,
    }).from(userApiLimits);

    const recentActivity = await db.select()
      .from(apiCallLogs)
      .where(gte(apiCallLogs.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)))
      .orderBy(desc(apiCallLogs.createdAt))
      .limit(100);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        recentActivity,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get usage overview',
    });
  }
});

export default router;
```

## Deployment Steps

### **1. Environment Variables**
```bash
# Add to Railway/production environment
FIREBASE_PROJECT_ID=ealmatch-railway
FIREBASE_SERVICE_ACCOUNT_KEY=<base64_encoded_key>
DATABASE_URL=<postgresql_connection_string>
```

### **2. Migration Command**
```bash
# Run migration
npm run db:migrate

# Or manually run SQL migration
psql $DATABASE_URL -f server/migrations/011_token_usage_system.sql
```

### **3. Frontend Route**
```typescript
// Add route to client routing
<Route path="/token-generator" component={TokenGeneratorPage} />
```

## Testing Plan

### **1. Backend Testing**
```bash
# Test token generation
curl -X POST http://localhost:3000/api/token-generator/generate \
  -H "Authorization: Bearer $FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "custom"}'

# Test usage tracking
curl http://localhost:3000/api/token-generator/usage \
  -H "Authorization: Bearer $FIREBASE_TOKEN"
```

### **2. Frontend Testing**
1. Sign in with Firebase authentication
2. Generate tokens and verify usage tracking
3. Test limit enforcement at 200 calls
4. Verify commercial upgrade messaging

### **3. Integration Testing**
1. Use generated tokens with existing SDK
2. Verify API call counting works correctly
3. Test rate limiting and error messages

## Success Metrics

### **1. Technical Metrics**
- ✅ Token generation success rate > 99%
- ✅ Usage tracking accuracy 100%
- ✅ API response time < 500ms
- ✅ Zero security vulnerabilities

### **2. User Experience Metrics**
- ✅ Time to first token < 30 seconds
- ✅ SDK integration success rate > 95%
- ✅ User satisfaction with documentation
- ✅ Support ticket reduction by 50%

### **3. Business Metrics**
- ✅ Free-to-paid conversion rate
- ✅ Average API calls before limit
- ✅ Commercial inquiry volume
- ✅ Developer onboarding completion rate

## Timeline Summary

- **Day 1**: Database schema + Backend services
- **Day 2**: API routes + Core frontend components  
- **Day 3**: Frontend UI + Component library
- **Day 4**: Admin dashboard + Testing
- **Day 5**: Production deployment + Monitoring

This implementation leverages your existing infrastructure while adding the specific token generation and usage tracking functionality needed for the Firebase Token Generator with API limits and monitoring.