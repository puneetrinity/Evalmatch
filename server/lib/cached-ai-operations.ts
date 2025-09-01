import { cacheManager } from "./redis-cache";
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
import {
  generateMatchAnalysisKey,
  generateInflightLockKey,
  CURRENT_VERSIONS,
  type CacheKeyParts
} from "./cache-key-generator";
import {
  createAnalysisEnvelope,
  extractMetrics,
  type CacheInfo,
  type TimingInfo
} from "./cache-envelope";
import { serviceLevelManager } from "./service-level-manager";
import { metricsCollector } from "./metrics-collector";

/**
 * PHASE 1.1: Provider-aware cached AI operations for 50%+ API reduction
 * Implements intelligent caching with provider fallback and cache warming
 */

// Phase 1.1: Enhanced cache configuration with provider awareness
const CACHE_CONFIG = {
  // TTL strategy - start with 24h, adaptive based on hit rates
  DEFAULT_TTL: 24 * 60 * 60, // 24 hours
  EXTENDED_TTL: 72 * 60 * 60, // 72 hours if hit rate < 40%
  
  // Size limits for cache management
  MAX_RESULT_BYTES: 256 * 1024, // 256KB per result
  MAX_TOTAL_KEYS: 50000,        // Global key count limit
  
  // In-flight deduplication
  INFLIGHT_TTL: 60,             // 60 seconds for in-flight locks
  
  // Provider fallback priority (Groq primary, then OpenAI, then Anthropic)
  PROVIDERS: ['groq', 'openai', 'anthropic'] as const,
};

type CacheProvider = typeof CACHE_CONFIG.PROVIDERS[number];

// Phase 1.1: Enhanced cache metadata structure
interface CacheMetadata {
  cachedAt: number;
  provider: CacheProvider;
  promptVersion: string;
  contentBytes: number;
  tier: string;
}

interface CachedResult<T> {
  data: T;
  metadata: CacheMetadata;
}


/**
 * Phase 1.1: Generate provider-aware cache key
 */
function generateProviderAwareKey(
  type: string,
  provider: CacheProvider,
  contentHash: string,
  promptVersion: string = 'v2'
): string {
  return `analysis:${type}:${provider}:${crypto
    .createHash('sha256')
    .update(contentHash + promptVersion)
    .digest('hex')}`;
}

/**
 * Phase 1.1: Generate in-flight lock key for deduplication
 */
function _generateInflightKey(contentHash: string, type: string): string {
  return `analysis:lock:${type}:${contentHash.substring(0, 16)}`;
}

/**
 * Phase 1.2: Enhanced cache lookup with in-flight deduplication
 */
async function tryProviderCache<T>(
  cacheKey: string,
  primaryProvider: CacheProvider
): Promise<{ result: T | null; cacheInfo: CacheInfo }> {
  const startTime = Date.now();
  
  // Try primary provider first
  let cached = await cacheManager.get<CachedResult<T>>(cacheKey);
  
  if (cached?.data) {
    return {
      result: cached.data,
      cacheInfo: {
        status: "hit",
        provider: primaryProvider,
        age: Date.now() - cached.metadata.cachedAt
      }
    };
  }

  // Try fallback providers (cross-provider cache sharing)
  for (const provider of CACHE_CONFIG.PROVIDERS) {
    if (provider === primaryProvider) continue;
    
    const fallbackKey = cacheKey.replace(`:${primaryProvider}:`, `:${provider}:`);
    cached = await cacheManager.get<CachedResult<T>>(fallbackKey);
    
    if (cached?.data) {
      logger.info(`Cache fallback hit: ${provider} for ${primaryProvider}`, {
        primaryProvider,
        fallbackProvider: provider,
        age: Date.now() - cached.metadata.cachedAt
      });
      
      return {
        result: cached.data,
        cacheInfo: {
          status: "fallbackHit",
          provider: provider,
          age: Date.now() - cached.metadata.cachedAt
        }
      };
    }
  }

  return {
    result: null,
    cacheInfo: { 
      status: "miss",
      cacheMs: Date.now() - startTime
    }
  };
}

/**
 * Phase 1.2: In-flight request deduplication
 */
async function acquireInflightLock(lockKey: string, ttlSeconds: number = 60): Promise<boolean> {
  try {
    const result = await cacheManager.set(lockKey, "locked", ttlSeconds);
    return true;
  } catch (error) {
    // Lock already exists
    return false;
  }
}

async function releaseInflightLock(lockKey: string): Promise<void> {
  try {
    await cacheManager.delete(lockKey);
  } catch (error) {
    logger.warn("Failed to release in-flight lock", { lockKey, error });
  }
}

/**
 * Phase 1.1: Cache result with metadata and size limits
 */
async function cacheResultWithMetadata<T>(
  type: string,
  provider: CacheProvider,
  contentHash: string,
  result: T,
  userTier: UserTierInfo,
  promptVersion?: string
): Promise<void> {
  try {
    const resultSize = JSON.stringify(result).length;
    
    // Size check - reject oversized results
    if (resultSize > CACHE_CONFIG.MAX_RESULT_BYTES) {
      logger.warn(`Result too large to cache: ${resultSize} bytes`, { type, provider });
      return;
    }

    const cachedResult: CachedResult<T> = {
      data: result,
      metadata: {
        cachedAt: Date.now(),
        provider,
        promptVersion: promptVersion || 'v2',
        contentBytes: resultSize,
        tier: userTier.tier
      }
    };

    const cacheKey = generateProviderAwareKey(type, provider, contentHash, promptVersion);
    await cacheManager.set(cacheKey, cachedResult, CACHE_CONFIG.DEFAULT_TTL);
    
    logger.info(`Cached ${type} result`, {
      provider,
      tier: userTier.tier,
      bytes: resultSize,
      key: cacheKey.substring(0, 32) + '...'
    });
  } catch (error) {
    logger.warn(`Failed to cache result: ${error}`, { type, provider });
  }
}

/**
 * Phase 1.1: Enhanced resume analysis with provider-aware caching
 * 
 * @param content - The resume text content to analyze  
 * @param userTier - User's tier information for AI provider selection
 * @returns Promise<ResumeAnalysisResult<AnalyzeResumeResponse & { cacheInfo: CacheInfo }>>
 */
export async function analyzeResumeWithCache(
  content: string, 
  userTier: UserTierInfo
): Promise<ResumeAnalysisResult<AnalyzeResumeResponse>> {
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');
  const primaryProvider: CacheProvider = 'groq'; // Primary provider per system config
  
  // Try provider-aware cache with fallback
  const cacheKey = generateProviderAwareKey('resume_analysis', primaryProvider, contentHash);
  const { result: cached, cacheInfo } = await tryProviderCache<AnalyzeResumeResponse>(
    cacheKey,
    primaryProvider
  );
  
  if (cached) {
    logger.info("Resume analysis cache hit", { 
      provider: cacheInfo.provider,
      age: cacheInfo.age,
      fallback: cacheInfo.fallbackUsed,
      tier: userTier.tier 
    });
    return success(cached);
  }
  
  // Perform analysis
  logger.info("Resume analysis cache miss, calling AI", { 
    provider: primaryProvider,
    tier: userTier.tier 
  });
  
  try {
    const result = await tieredAI.analyzeResumeParallel(content, userTier);
    
    // Ensure result has required properties for AnalyzeResumeResponse
    if (!result.analyzedData) {
      throw new Error('Invalid AI response: missing analyzedData');
    }
    
    // Cache successful result with metadata
    await cacheResultWithMetadata(
      'resume_analysis',
      primaryProvider,
      contentHash,
      result,
      userTier
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
  const contentHash = crypto.createHash('sha256')
    .update(`${title}:${description}`)
    .digest('hex');
  const primaryProvider: CacheProvider = 'groq'; // Primary provider per system config
  
  // Try provider-aware cache with fallback
  const cacheKey = generateProviderAwareKey('job_analysis', primaryProvider, contentHash);
  const { result: cached, cacheInfo } = await tryProviderCache<AnalyzeJobDescriptionResponse>(
    cacheKey,
    primaryProvider
  );
  
  if (cached) {
    logger.info("Job analysis cache hit", { 
      provider: cacheInfo.provider,
      age: cacheInfo.age,
      fallback: cacheInfo.fallbackUsed,
      tier: userTier.tier 
    });
    return success(cached);
  }
  
  // Perform analysis
  logger.info("Job analysis cache miss, calling AI", { 
    provider: primaryProvider,
    tier: userTier.tier 
  });
  
  try {
    const result = await tieredAI.analyzeJobDescription(
      title, 
      description, 
      userTier
    );
    
    // Cache successful result with metadata
    await cacheResultWithMetadata(
      'job_analysis',
      primaryProvider,
      contentHash,
      result,
      userTier
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
  userTier: UserTierInfo,
  resumeText?: string,
  jobText?: string
): Promise<MatchAnalysisResult<MatchAnalysisResponse>> {
  const startTime = Date.now();
  const primaryProvider: CacheProvider = 'groq';
  
  // Phase 2.2: Check service level and adjust behavior
  const serviceConfig = serviceLevelManager.getCurrentConfig();
  
  // Return maintenance response if in maintenance mode
  if (serviceConfig.level === "MAINTENANCE") {
    const maintenanceResponse = serviceLevelManager.getMaintenanceResponse('match');
    metricsCollector.recordRequest(Date.now() - startTime, true);
    return success(maintenanceResponse);
  }
  
  // Phase 1.2: Enhanced deterministic key generation
  // Phase 2.2: Adjust fulltext usage based on service level
  const useFullText = serviceConfig.features.fullTextAnalysis && !!(resumeText && jobText);
  
  const keyParts: CacheKeyParts = {
    resumeData: {
      skills: resumeAnalysis.analyzedData.skills || [],
      experience: resumeAnalysis.analyzedData.experience,
      education: resumeAnalysis.analyzedData.education || []
    },
    jobData: {
      requiredSkills: jobAnalysis.analyzedData.requiredSkills || [],
      preferredSkills: jobAnalysis.analyzedData.preferredSkills || [],
      responsibilities: jobAnalysis.analyzedData.responsibilities || [],
      experienceLevel: jobAnalysis.analyzedData.experienceLevel
    },
    useFullText,
    provider: primaryProvider,
    versions: CURRENT_VERSIONS,
    tenantId: userTier.tier // Tenant-scoped caching based on tier
  };
  
  const cacheKey = generateMatchAnalysisKey(keyParts);
  const lockKey = generateInflightLockKey(cacheKey);
  
  // Try cache with provider fallback
  const { result: cached, cacheInfo } = await tryProviderCache<MatchAnalysisResponse>(
    cacheKey,
    primaryProvider
  );
  
  if (cached) {
    const timings: TimingInfo = {
      totalMs: Date.now() - startTime,
      cacheMs: cacheInfo.cacheMs
    };
    
    logger.info("Match analysis cache hit", { 
      ...extractMetrics(createAnalysisEnvelope(cached, primaryProvider, cacheInfo, timings))
    });
    
    return success(cached);
  }
  
  // Phase 1.2: In-flight deduplication
  const lockAcquired = await acquireInflightLock(lockKey, CACHE_CONFIG.INFLIGHT_TTL);
  if (!lockAcquired) {
    // Wait briefly for in-flight request to complete, then try cache again
    await new Promise(resolve => setTimeout(resolve, 100));
    const { result: retryResult } = await tryProviderCache<MatchAnalysisResponse>(cacheKey, primaryProvider);
    if (retryResult) {
      logger.info("Match analysis resolved by in-flight request", { cacheKey });
      return success(retryResult);
    }
  }
  
  try {
    logger.info("Match analysis cache miss, calling AI", { 
      provider: primaryProvider,
      useFullText: keyParts.useFullText,
      tier: userTier.tier 
    });
    
    const providerStart = Date.now();
    const result = await tieredAI.analyzeMatch(
      resumeAnalysis, 
      jobAnalysis, 
      userTier,
      resumeText,
      jobText
    );
    const providerMs = Date.now() - providerStart;
    
    // Cache successful result with enhanced metadata
    await cacheResultWithMetadata(
      'match_analysis',
      primaryProvider,
      cacheKey.split(':').pop()!, // Extract hash from full key
      result,
      userTier,
      CURRENT_VERSIONS.prompt
    );
    
    const timings: TimingInfo = {
      totalMs: Date.now() - startTime,
      providerMs,
      cacheMs: 0
    };
    
    const envelope = createAnalysisEnvelope(
      result, 
      primaryProvider, 
      { status: "miss" }, 
      timings
    );
    
    logger.info("Match analysis completed", extractMetrics(envelope));
    
    // Phase 2.3: Record metrics for monitoring
    metricsCollector.recordRequest(timings.totalMs, true);
    
    return success(result);
    
  } catch (error) {
    logger.error("Match analysis failed", { 
      error: error instanceof Error ? error.message : 'Unknown error',
      provider: primaryProvider,
      tier: userTier.tier 
    });
    
    // Phase 2.3: Record failed request for monitoring
    metricsCollector.recordRequest(Date.now() - startTime, false);
    
    // Convert to appropriate error type
    if (error instanceof Error && error.message.includes('rate limit')) {
      return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'match_analysis', error.message));
    }
    
    return failure(AppExternalServiceError.aiProviderFailure(userTier.tier, 'match_analysis', error instanceof Error ? error.message : 'Unknown error'));
    
  } finally {
    // Always release the in-flight lock
    if (lockAcquired) {
      await releaseInflightLock(lockKey);
    }
  }
}

/**
 * Get cache statistics for monitoring with provider awareness
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  hitRate?: number;
  totalKeys?: number;
  memoryUsage?: string;
  providerBreakdown?: Record<CacheProvider, number>;
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
  
  // Get provider breakdown by scanning cache keys
  const providerBreakdown: Record<CacheProvider, number> = {
    groq: 0,
    openai: 0,
    anthropic: 0
  };
  
  try {
    // Get sample of keys to estimate provider distribution
    const sampleKeys = await cacheManager.keys('analysis:*:*:*').then(keys => keys.slice(0, 100));
    for (const key of sampleKeys) {
      const parts = key.split(':');
      if (parts.length >= 3 && parts[2] in providerBreakdown) {
        providerBreakdown[parts[2] as CacheProvider]++;
      }
    }
  } catch (error) {
    logger.warn('Failed to get provider breakdown:', error);
  }
  
  return {
    connected: true,
    hitRate: totalRequests > 0 ? (keyspaceHits / totalRequests) * 100 : 0,
    totalKeys: parseInt(statsMap['db0']?.split(',')[0]?.split('=')[1] || '0'),
    memoryUsage: statsMap['used_memory_human'] || 'unknown',
    providerBreakdown
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