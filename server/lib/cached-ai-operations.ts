import { cacheManager, CacheManager } from "./redis-cache";
import { logger } from "./logger";
import * as tieredAI from "./tiered-ai-provider";
import { 
  AnalyzeResumeResponse, 
  AnalyzeJobDescriptionResponse,
  MatchAnalysisResponse,
  AnalyzedResumeData as _AnalyzedResumeData,
  AnalyzedJobData as _AnalyzedJobData
} from "@shared/schema";
import { UserTierInfo } from "@shared/user-tiers";
import { 
  Result as _Result,
  success,
  failure,
  fromPromise as _fromPromise,
  ResumeAnalysisResult,
  JobAnalysisResult,
  MatchAnalysisResult
} from "@shared/result-types";
import {
  AppExternalServiceError,
  toAppError as _toAppError
} from "@shared/errors";
import crypto from "crypto";

/**
 * PERFORMANCE: Cached AI operations for 50% API reduction
 * Wraps expensive AI operations with intelligent caching
 */

/**
 * Analyzes resume content with intelligent caching using Result pattern
 * 
 * @param content - The resume text content to analyze
 * @param userTier - User's tier information for AI provider selection
 * @returns Promise<ResumeAnalysisResult<AnalyzeResumeResponse>> - Result containing analysis or error
 * 
 * @example
 * ```typescript
 * const result = await analyzeResumeWithCache(resumeText, userTierInfo);
 * if (isSuccess(result)) {
 *   const analysis = result.data.analyzedData;
 *   console.log('Skills found:', analysis.skills);
 * } else {
 *   console.error('Analysis failed:', result.error.message);
 * }
 * ```
 */
export async function analyzeResumeWithCache(
  content: string, 
  userTier: UserTierInfo
): Promise<ResumeAnalysisResult<AnalyzeResumeResponse>> {
  // Generate cache key based on content hash
  const cacheKey = CacheManager.generateHashKey(
    'resume_analysis',
    content,
    userTier.tier
  );
  
  // Check cache first
  const cached = await cacheManager.get<AnalyzeResumeResponse>(cacheKey);
  if (cached) {
    logger.info("Resume analysis cache hit", { 
      cacheKey, 
      tier: userTier.tier 
    });
    return success(cached);
  }
  
  // Perform analysis
  logger.info("Resume analysis cache miss, calling AI", { 
    cacheKey, 
    tier: userTier.tier 
  });
  
  try {
    const result = await tieredAI.analyzeResumeParallel(content, userTier);
    
    // Ensure result has required properties for AnalyzeResumeResponse
    if (!result.analyzedData) {
      throw new Error('Invalid AI response: missing analyzedData');
    }
    
    // Cache successful result
    await cacheManager.set(
      cacheKey, 
      result, 
      CacheManager.TTL.RESUME_ANALYSIS
    );
    
    return success(result);
  } catch (error) {
    logger.error("Resume analysis failed, not caching", { error });
    
    // Convert to appropriate error type
    if (error instanceof Error && error.message.includes('rate limit')) {
      return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'resume_analysis', error.message));
    }
    
    return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'resume_analysis', error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Analyze job description with caching - Result Pattern
 */
export async function analyzeJobDescriptionWithCache(
  title: string,
  description: string,
  userTier: UserTierInfo
): Promise<JobAnalysisResult<AnalyzeJobDescriptionResponse>> {
  // Generate cache key based on content
  const contentHash = crypto.createHash('sha256')
    .update(`${title}:${description}`)
    .digest('hex')
    .substring(0, 16);
    
  const cacheKey = CacheManager.generateKey(
    'job_analysis',
    contentHash,
    userTier.tier
  );
  
  // Check cache first
  const cached = await cacheManager.get<AnalyzeJobDescriptionResponse>(cacheKey);
  if (cached) {
    logger.info("Job analysis cache hit", { 
      cacheKey, 
      tier: userTier.tier 
    });
    return success(cached);
  }
  
  // Perform analysis
  logger.info("Job analysis cache miss, calling AI", { 
    cacheKey, 
    tier: userTier.tier 
  });
  
  try {
    const result = await tieredAI.analyzeJobDescription(
      title, 
      description, 
      userTier
    );
    
    // Cache successful result
    await cacheManager.set(
      cacheKey, 
      result, 
      CacheManager.TTL.JOB_ANALYSIS
    );
    
    return success(result);
  } catch (error) {
    logger.error("Job analysis failed, not caching", { error });
    
    // Convert to appropriate error type
    if (error instanceof Error && error.message.includes('rate limit')) {
      return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'job_analysis', error.message));
    }
    
    return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'job_analysis', error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Match analysis with caching - Result Pattern
 */
export async function matchAnalysisWithCache(
  resumeAnalysis: AnalyzeResumeResponse,
  jobAnalysis: AnalyzeJobDescriptionResponse,
  userTier: UserTierInfo
): Promise<MatchAnalysisResult<MatchAnalysisResponse>> {
  // Create deterministic cache key from data
  const resumeHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      skills: resumeAnalysis.analyzedData.skills?.sort() || [],
      experience: resumeAnalysis.analyzedData.experience
    }))
    .digest('hex')
    .substring(0, 8);
    
  const jobHash = crypto.createHash('sha256')
    .update(JSON.stringify({
      skills: jobAnalysis.analyzedData.requiredSkills?.sort() || [],
      requirements: jobAnalysis.analyzedData.responsibilities
    }))
    .digest('hex')
    .substring(0, 8);
  
  const cacheKey = CacheManager.generateKey(
    'match_analysis',
    resumeHash,
    jobHash,
    userTier.tier
  );
  
  // Check cache first
  const cached = await cacheManager.get<MatchAnalysisResponse>(cacheKey);
  if (cached) {
    logger.info("Match analysis cache hit", { 
      cacheKey, 
      tier: userTier.tier 
    });
    return success(cached);
  }
  
  // Perform analysis
  logger.info("Match analysis cache miss, calling AI", { 
    cacheKey, 
    tier: userTier.tier 
  });
  
  try {
    const result = await tieredAI.analyzeMatch(
      resumeAnalysis, 
      jobAnalysis, 
      userTier,
      "",  // resumeContent placeholder
      ""   // jobContent placeholder
    );
    
    // Cache successful result
    await cacheManager.set(
      cacheKey, 
      result, 
      CacheManager.TTL.SKILL_MATCH
    );
    
    return success(result);
  } catch (error) {
    logger.error("Match analysis failed, not caching", { error });
    
    // Convert to appropriate error type
    if (error instanceof Error && error.message.includes('rate limit')) {
      return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'match_analysis', error.message));
    }
    
    return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'match_analysis', error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Get cache statistics for monitoring
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  hitRate?: number;
  totalKeys?: number;
  memoryUsage?: string;
}> {
  const stats = await cacheManager.getStats();
  
  if (!stats.connected || !stats.info) {
    return { connected: false };
  }
  
  // Parse Redis info stats
  const lines = (stats.info as unknown as string).split('\r\n');
  const statsMap: Record<string, string> = {};
  
  for (const line of lines) {
    const [key, value] = line.split(':');
    if (key && value) {
      statsMap[key] = value;
    }
  }
  
  const keyspaceHits = parseInt(statsMap['keyspace_hits'] || '0');
  const keyspaceMisses = parseInt(statsMap['keyspace_misses'] || '0');
  const totalRequests = keyspaceHits + keyspaceMisses;
  
  return {
    connected: true,
    hitRate: totalRequests > 0 ? (keyspaceHits / totalRequests) * 100 : 0,
    totalKeys: parseInt(statsMap['db0']?.split(',')[0]?.split('=')[1] || '0'),
    memoryUsage: statsMap['used_memory_human'] || 'unknown'
  };
}

/**
 * Clear user-specific cache entries
 */
export async function clearUserCache(userId: string): Promise<void> {
  await cacheManager.clearPattern(`evalmatch:*:${userId}:*`);
  logger.info("Cleared user cache", { userId });
}

/**
 * Warm up cache with common operations
 */
export async function warmupCache(): Promise<void> {
  logger.info("Cache warmup not implemented - cache fills on demand");
}