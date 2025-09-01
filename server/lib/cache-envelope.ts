/**
 * Phase 1.2: Response envelope for auditability and UI transparency
 * Provides metadata about caching, performance, and provider usage
 */

export type CacheStatus = "hit" | "miss" | "fallbackHit";
export type CacheTier = "structure" | "fulltext";
export type ServiceLevel = "full" | "reduced" | "basic";
export type ProviderUsed = "groq" | "openai" | "anthropic" | "basic";

export interface CacheInfo {
  status: CacheStatus;
  tier?: CacheTier;
  provider?: ProviderUsed;
  age?: number; // milliseconds since cached
  cacheMs?: number; // cache operation duration
  fallbackUsed?: boolean; // whether fallback was used
}

export interface TimingInfo {
  totalMs: number;
  providerMs?: number;
  cacheMs?: number;
  queueMs?: number;
}

export interface MatchAnalysisEnvelope<T> {
  version: "2025-08-28";
  providerUsed: ProviderUsed;
  cache: CacheInfo;
  serviceLevel: ServiceLevel;
  timings: TimingInfo;
  result: T;
}

/**
 * Create envelope for successful analysis
 */
export function createAnalysisEnvelope<T>(
  result: T,
  providerUsed: ProviderUsed,
  cacheInfo: CacheInfo,
  timings: TimingInfo,
  serviceLevel: ServiceLevel = "full"
): MatchAnalysisEnvelope<T> {
  return {
    version: "2025-08-28",
    providerUsed,
    cache: cacheInfo,
    serviceLevel,
    timings,
    result
  };
}

/**
 * Extract timing metrics for monitoring
 */
export function extractMetrics(envelope: MatchAnalysisEnvelope<any>): Record<string, number | string> {
  return {
    "cache.status": envelope.cache.status,
    "cache.tier": envelope.cache.tier || "none",
    "provider": envelope.providerUsed,
    "service.level": envelope.serviceLevel,
    "total.ms": envelope.timings.totalMs,
    "provider.ms": envelope.timings.providerMs || 0,
    "cache.ms": envelope.timings.cacheMs || 0,
    "queue.ms": envelope.timings.queueMs || 0,
    "cache.age": envelope.cache.age || 0
  };
}