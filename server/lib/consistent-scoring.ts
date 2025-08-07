/**
 * Consistent Scoring System
 *
 * This module provides deterministic scoring mechanisms to ensure
 * consistent results across multiple runs for the same resume/job combination.
 */

import crypto from "crypto";
import { logger } from "./logger";
import { UNIFIED_SCORING_WEIGHTS } from "./unified-scoring-weights";

// Scoring rubrics and anchors
export const SCORING_RUBRICS = {
  SKILL_MATCH: {
    EXACT_MATCH: 100,
    STRONG_RELATED: 90,
    MODERATELY_RELATED: 70,
    LOOSELY_RELATED: 50,
    TRANSFERABLE: 30,
    NO_MATCH: 0,
  },
  EXPERIENCE_LEVEL: {
    EXCEEDS_REQUIREMENT: 100,
    MEETS_REQUIREMENT: 85,
    MOSTLY_MEETS: 70,
    PARTIALLY_MEETS: 50,
    BELOW_REQUIREMENT: 25,
    INSUFFICIENT: 0,
  },
  EDUCATION_MATCH: {
    EXCEEDS: 100,
    EXACT_MATCH: 90,
    EQUIVALENT: 80,
    RELATED_FIELD: 60,
    TRANSFERABLE: 40,
    UNRELATED: 20,
    NO_EDUCATION: 0,
  },
};

// Use unified scoring weights for consistency across all modules
export const SCORING_WEIGHTS = {
  SKILLS: UNIFIED_SCORING_WEIGHTS.skills, // 50% - Most important
  EXPERIENCE: UNIFIED_SCORING_WEIGHTS.experience, // 30% - Very important
  EDUCATION: UNIFIED_SCORING_WEIGHTS.education, // 15% - Important
  SEMANTIC: UNIFIED_SCORING_WEIGHTS.semantic, // 5% - Contextual understanding (replaces cultural fit)
};

// Deterministic seed generation
function generateDeterministicSeed(
  resumeText: string,
  jobText: string,
): string {
  const combined = `${resumeText.trim().toLowerCase()}|${jobText.trim().toLowerCase()}`;
  return crypto
    .createHash("sha256")
    .update(combined)
    .digest("hex")
    .substring(0, 16);
}

// Normalize skill names for consistent matching
function normalizeSkill(skill: string): string {
  return skill
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .replace(/javascript/i, "js")
    .replace(/typescript/i, "ts")
    .replace(/reactjs/i, "react")
    .replace(/nodejs/i, "node")
    .replace(/postgresql/i, "postgres");
}

// Calculate skill similarity score using deterministic algorithm
function calculateSkillSimilarity(
  resumeSkill: string,
  jobSkill: string,
): number {
  const normalizedResume = normalizeSkill(resumeSkill);
  const normalizedJob = normalizeSkill(jobSkill);

  // Exact match
  if (normalizedResume === normalizedJob) {
    return SCORING_RUBRICS.SKILL_MATCH.EXACT_MATCH;
  }

  // Contains match
  if (
    normalizedResume.includes(normalizedJob) ||
    normalizedJob.includes(normalizedResume)
  ) {
    return SCORING_RUBRICS.SKILL_MATCH.STRONG_RELATED;
  }

  // Word overlap calculation
  const resumeWords = normalizedResume.split(" ");
  const jobWords = normalizedJob.split(" ");
  const commonWords = resumeWords.filter((word) => jobWords.includes(word));
  const overlapRatio =
    commonWords.length / Math.max(resumeWords.length, jobWords.length);

  if (overlapRatio >= 0.7)
    return SCORING_RUBRICS.SKILL_MATCH.MODERATELY_RELATED;
  if (overlapRatio >= 0.4) return SCORING_RUBRICS.SKILL_MATCH.LOOSELY_RELATED;
  if (overlapRatio >= 0.2) return SCORING_RUBRICS.SKILL_MATCH.TRANSFERABLE;

  return SCORING_RUBRICS.SKILL_MATCH.NO_MATCH;
}

// Enhanced consistent scoring prompt generator
export function generateConsistentScoringPrompt(
  resumeText: string,
  jobDescription: string,
  analysisType: "match" | "resume" | "job",
): string {
  const seed = generateDeterministicSeed(resumeText, jobDescription);

  const baseInstructions = `
CRITICAL INSTRUCTIONS FOR CONSISTENT SCORING:
- Use DETERMINISTIC seed: ${seed}
- Follow EXACT rubrics provided below
- Score based on OBJECTIVE criteria only
- Use SAME scoring logic for identical inputs
- Round scores to nearest 5 (e.g., 85, 90, 95)

SCORING RUBRICS:
${JSON.stringify(SCORING_RUBRICS, null, 2)}

COMPONENT WEIGHTS:
${JSON.stringify(SCORING_WEIGHTS, null, 2)}
`;

  switch (analysisType) {
    case "match":
      return `${baseInstructions}

TASK: Analyze resume-job match and provide CONSISTENT scoring.

REQUIRED OUTPUT FORMAT (JSON only, no additional text):
{
  "matchPercentage": 85,
  "skillsScore": 90,
  "experienceScore": 80,
  "educationScore": 75,
  "matchedSkills": [
    {"skill": "JavaScript", "matchPercentage": 95, "rubricLevel": "EXACT_MATCH"},
    {"skill": "React", "matchPercentage": 90, "rubricLevel": "STRONG_RELATED"}
  ],
  "missingSkills": ["Python", "Docker"],
  "scoringBreakdown": {
    "skillsWeightedScore": 45,
    "experienceWeightedScore": 24,
    "educationWeightedScore": 11.25,
    "totalWeightedScore": 80.25
  },
  "confidenceLevel": "high",
  "scoringRationale": "Brief explanation of scoring logic"
}

Resume: ${resumeText}
Job Description: ${jobDescription}`;

    case "resume":
      return `${baseInstructions}

TASK: Analyze resume with consistent scoring criteria.

Resume: ${resumeText}`;

    case "job":
      return `${baseInstructions}

TASK: Analyze job description with consistent criteria.

Job Description: ${jobDescription}`;

    default:
      throw new Error(`Unknown analysis type: ${analysisType}`);
  }
}

// Validation function for score consistency
export function validateScoreConsistency(
  scores: Array<{ matchPercentage: number }> | number[],
): {
  isConsistent: boolean;
  variance: number;
  recommendation: string;
} {
  if (scores.length < 2) {
    return {
      isConsistent: true,
      variance: 0,
      recommendation: "Insufficient data",
    };
  }

  // Handle both array of objects and array of numbers
  const values = scores.map((s) =>
    typeof s === "number" ? s : s?.matchPercentage || 0,
  );
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    values.length;
  const standardDeviation = Math.sqrt(variance);

  const isConsistent = standardDeviation <= 5; // Within 5 points is acceptable

  let recommendation = "";
  if (!isConsistent) {
    recommendation = `High variance detected (σ=${standardDeviation.toFixed(1)}). Consider refining prompts or adjusting temperature.`;
  } else {
    recommendation = "Scoring consistency is acceptable.";
  }

  return {
    isConsistent,
    variance: standardDeviation,
    recommendation,
  };
}

// Enhanced intelligent caching system for analysis results
interface CacheEntry {
  data: unknown;
  timestamp: number;
  seed: string;
  accessCount: number;
  lastAccessed: number;
  analysisType: string;
  size: number; // Estimated memory size in bytes
}

interface CacheStats {
  totalSize: number;
  entryCount: number;
  hitRate: number;
  oldestEntry: number;
  newestEntry: number;
  mostAccessed: string[];
  memoryUsageMB: number;
  entriesByType: Record<string, number>;
}

interface CacheConfig {
  maxMemoryMB: number;
  defaultTTL: number;
  analysisTypeTTLs: Record<string, number>;
  maxEntries: number;
  cleanupInterval: number;
}

export class IntelligentCache {
  private cache = new Map<string, CacheEntry>();
  private accessStats = new Map<string, { hits: number; misses: number }>();
  private config: CacheConfig;
  private cleanupTimer?: NodeJS.Timeout;
  private totalHits = 0;
  private totalRequests = 0;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      maxMemoryMB: 100, // 100MB max cache size
      defaultTTL: 24 * 60 * 60 * 1000, // 24 hours
      analysisTypeTTLs: {
        'resume_analysis': 7 * 24 * 60 * 60 * 1000, // 7 days - resumes change less frequently
        'job_analysis': 3 * 24 * 60 * 60 * 1000, // 3 days - job descriptions may be updated
        'skill_matching': 1 * 60 * 60 * 1000, // 1 hour - skill matching may change with algorithm updates
        'match_analysis': 2 * 60 * 60 * 1000, // 2 hours - full match analysis
        'bias_detection': 6 * 60 * 60 * 1000, // 6 hours - bias detection results
        'semantic_similarity': 12 * 60 * 60 * 1000, // 12 hours - semantic embeddings
        'enhanced_scoring': 4 * 60 * 60 * 1000, // 4 hours - enhanced scoring results
      },
      maxEntries: 10000,
      cleanupInterval: 30 * 60 * 1000, // 30 minutes
      ...config,
    };

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  generateKey(
    resumeText: string,
    jobDescription: string,
    analysisType: string,
    additionalParams?: Record<string, any>
  ): string {
    const seed = generateDeterministicSeed(resumeText, jobDescription);
    const paramsHash = additionalParams 
      ? crypto.createHash('md5').update(JSON.stringify(additionalParams)).digest('hex').substring(0, 8)
      : '';
    return `${analysisType}_${seed}${paramsHash ? `_${paramsHash}` : ''}`;
  }

  get(key: string): unknown | null {
    this.totalRequests++;
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.recordMiss(key);
      return null;
    }

    const now = Date.now();
    const ttl = this.getTTLForAnalysisType(cached.analysisType);
    
    if (now - cached.timestamp > ttl) {
      this.cache.delete(key);
      this.recordMiss(key);
      return null;
    }

    // Update access statistics
    cached.accessCount++;
    cached.lastAccessed = now;
    this.totalHits++;
    this.recordHit(key);

    logger.debug("Intelligent cache hit", {
      key: key.substring(0, 50) + '...', // Truncate for logging
      analysisType: cached.analysisType,
      accessCount: cached.accessCount,
      ageMinutes: Math.round((now - cached.timestamp) / (1000 * 60)),
    });

    return cached.data;
  }

  set(key: string, data: unknown, seed: string, analysisType: string): void {
    const now = Date.now();
    const estimatedSize = this.estimateSize(data);

    // Check if we need to make room
    this.ensureCapacity(estimatedSize);

    const entry: CacheEntry = {
      data,
      timestamp: now,
      seed,
      accessCount: 1,
      lastAccessed: now,
      analysisType,
      size: estimatedSize,
    };

    this.cache.set(key, entry);

    logger.debug("Intelligent cache set", {
      key: key.substring(0, 50) + '...', // Truncate for logging
      analysisType,
      estimatedSizeKB: Math.round(estimatedSize / 1024),
      totalEntries: this.cache.size,
    });
  }

  // Cache invalidation for updated resumes/jobs
  invalidateByPattern(pattern: string): number {
    let invalidatedCount = 0;
    const regex = new RegExp(pattern);

    for (const [key, entry] of this.cache.entries()) {
      if (regex.test(key) || regex.test(entry.seed)) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      logger.info("Cache invalidation completed", {
        pattern,
        invalidatedCount,
        remainingEntries: this.cache.size,
      });
    }

    return invalidatedCount;
  }

  // Invalidate specific analysis types
  invalidateAnalysisType(analysisType: string): number {
    let invalidatedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.analysisType === analysisType) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      logger.info("Cache invalidation by analysis type completed", {
        analysisType,
        invalidatedCount,
        remainingEntries: this.cache.size,
      });
    }

    return invalidatedCount;
  }

  // Cache warming for frequently accessed combinations
  async warmCache(
    combinations: Array<{
      resumeText: string;
      jobDescription: string;
      analysisTypes: string[];
    }>,
    warmingFunction: (resumeText: string, jobDescription: string, analysisType: string) => Promise<unknown>
  ): Promise<void> {
    logger.info("Starting cache warming", {
      combinationsCount: combinations.length,
      totalAnalyses: combinations.reduce((sum, combo) => sum + combo.analysisTypes.length, 0),
    });

    const warmingPromises = combinations.flatMap(combo =>
      combo.analysisTypes.map(async analysisType => {
        const key = this.generateKey(combo.resumeText, combo.jobDescription, analysisType);
        
        // Skip if already cached and fresh
        if (this.get(key) !== null) {
          return;
        }

        try {
          const result = await warmingFunction(combo.resumeText, combo.jobDescription, analysisType);
          const seed = generateDeterministicSeed(combo.resumeText, combo.jobDescription);
          this.set(key, result, seed, analysisType);
        } catch (error) {
          logger.warn("Cache warming failed for combination", {
            analysisType,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      })
    );

    await Promise.allSettled(warmingPromises);
    
    logger.info("Cache warming completed", {
      finalCacheSize: this.cache.size,
      memoryUsageMB: Math.round(this.getCurrentMemoryUsage() / (1024 * 1024)),
    });
  }

  clear(): void {
    this.cache.clear();
    this.accessStats.clear();
    this.totalHits = 0;
    this.totalRequests = 0;
    logger.info("Intelligent cache cleared");
  }

  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map(e => e.timestamp);
    const memoryUsage = this.getCurrentMemoryUsage();
    
    // Get most accessed entries
    const sortedByAccess = entries
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, 5)
      .map(e => `${e.analysisType}:${e.accessCount}`);

    // Get entries by type
    const entriesByType: Record<string, number> = {};
    for (const entry of entries) {
      entriesByType[entry.analysisType] = (entriesByType[entry.analysisType] || 0) + 1;
    }

    return {
      totalSize: this.cache.size,
      entryCount: this.cache.size,
      hitRate: this.totalRequests > 0 ? (this.totalHits / this.totalRequests) * 100 : 0,
      oldestEntry: Math.min(...timestamps) || 0,
      newestEntry: Math.max(...timestamps) || 0,
      mostAccessed: sortedByAccess,
      memoryUsageMB: Math.round(memoryUsage / (1024 * 1024)),
      entriesByType,
    };
  }

  // Get frequently accessed combinations for cache warming
  getFrequentCombinations(limit: number = 10): Array<{ seed: string; accessCount: number; analysisTypes: string[] }> {
    const seedStats = new Map<string, { accessCount: number; analysisTypes: Set<string> }>();

    for (const entry of this.cache.values()) {
      const existing = seedStats.get(entry.seed) || { accessCount: 0, analysisTypes: new Set() };
      existing.accessCount += entry.accessCount;
      existing.analysisTypes.add(entry.analysisType);
      seedStats.set(entry.seed, existing);
    }

    return Array.from(seedStats.entries())
      .sort(([, a], [, b]) => b.accessCount - a.accessCount)
      .slice(0, limit)
      .map(([seed, stats]) => ({
        seed,
        accessCount: stats.accessCount,
        analysisTypes: Array.from(stats.analysisTypes),
      }));
  }

  private getTTLForAnalysisType(analysisType: string): number {
    return this.config.analysisTypeTTLs[analysisType] || this.config.defaultTTL;
  }

  private estimateSize(data: unknown): number {
    // Rough estimation of object size in bytes
    try {
      const jsonString = JSON.stringify(data);
      return jsonString.length * 2; // Approximate UTF-16 encoding
    } catch {
      return 1024; // Default size if serialization fails
    }
  }

  private getCurrentMemoryUsage(): number {
    return Array.from(this.cache.values()).reduce((total, entry) => total + entry.size, 0);
  }

  private ensureCapacity(newEntrySize: number): void {
    const currentMemory = this.getCurrentMemoryUsage();
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;

    // Check memory limit
    if (currentMemory + newEntrySize > maxMemoryBytes) {
      this.evictLeastRecentlyUsed(newEntrySize);
    }

    // Check entry count limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLeastRecentlyUsed(0);
    }
  }

  private evictLeastRecentlyUsed(spaceNeeded: number): void {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    let freedSpace = 0;
    let evictedCount = 0;

    for (const [key, entry] of entries) {
      this.cache.delete(key);
      freedSpace += entry.size;
      evictedCount++;

      if (freedSpace >= spaceNeeded && this.cache.size < this.config.maxEntries * 0.9) {
        break;
      }
    }

    if (evictedCount > 0) {
      logger.info("Cache eviction completed", {
        evictedCount,
        freedSpaceKB: Math.round(freedSpace / 1024),
        remainingEntries: this.cache.size,
      });
    }
  }

  private recordHit(key: string): void {
    const stats = this.accessStats.get(key) || { hits: 0, misses: 0 };
    stats.hits++;
    this.accessStats.set(key, stats);
  }

  private recordMiss(key: string): void {
    const stats = this.accessStats.get(key) || { hits: 0, misses: 0 };
    stats.misses++;
    this.accessStats.set(key, stats);
  }

  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  private performCleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      const ttl = this.getTTLForAnalysisType(entry.analysisType);
      if (now - entry.timestamp > ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug("Periodic cache cleanup completed", {
        cleanedCount,
        remainingEntries: this.cache.size,
      });
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clear();
  }
}

// Singleton intelligent cache instance
export const intelligentCache = new IntelligentCache();

// Backward compatibility - alias for existing code
export const deterministicCache = intelligentCache;

/**
 * Cache integration utilities for analysis pipeline
 */
export class CacheIntegration {
  private cache: IntelligentCache;

  constructor(cache: IntelligentCache) {
    this.cache = cache;
  }

  /**
   * Cache-aware resume analysis
   */
  async cacheResumeAnalysis<T>(
    resumeText: string,
    analysisFunction: () => Promise<T>
  ): Promise<T> {
    const key = this.cache.generateKey(resumeText, '', 'resume_analysis');
    const cached = this.cache.get(key) as T | null;

    if (cached) {
      logger.debug("Resume analysis cache hit", { 
        resumeLength: resumeText.length,
        cacheKey: key.substring(0, 20) + '...'
      });
      return cached;
    }

    const result = await analysisFunction();
    const seed = this.generateSeed(resumeText, '');
    this.cache.set(key, result, seed, 'resume_analysis');

    logger.debug("Resume analysis cached", { 
      resumeLength: resumeText.length,
      cacheKey: key.substring(0, 20) + '...'
    });

    return result;
  }

  /**
   * Cache-aware job analysis
   */
  async cacheJobAnalysis<T>(
    jobTitle: string,
    jobDescription: string,
    analysisFunction: () => Promise<T>
  ): Promise<T> {
    const jobText = `${jobTitle}\n${jobDescription}`;
    const key = this.cache.generateKey('', jobText, 'job_analysis');
    const cached = this.cache.get(key) as T | null;

    if (cached) {
      logger.debug("Job analysis cache hit", { 
        jobLength: jobText.length,
        cacheKey: key.substring(0, 20) + '...'
      });
      return cached;
    }

    const result = await analysisFunction();
    const seed = this.generateSeed('', jobText);
    this.cache.set(key, result, seed, 'job_analysis');

    logger.debug("Job analysis cached", { 
      jobLength: jobText.length,
      cacheKey: key.substring(0, 20) + '...'
    });

    return result;
  }

  /**
   * Cache-aware skill matching
   */
  async cacheSkillMatching<T>(
    resumeText: string,
    jobDescription: string,
    analysisFunction: () => Promise<T>
  ): Promise<T> {
    const key = this.cache.generateKey(resumeText, jobDescription, 'skill_matching');
    const cached = this.cache.get(key) as T | null;

    if (cached) {
      logger.debug("Skill matching cache hit", { 
        cacheKey: key.substring(0, 20) + '...'
      });
      return cached;
    }

    const result = await analysisFunction();
    const seed = this.generateSeed(resumeText, jobDescription);
    this.cache.set(key, result, seed, 'skill_matching');

    logger.debug("Skill matching cached", { 
      cacheKey: key.substring(0, 20) + '...'
    });

    return result;
  }

  /**
   * Cache-aware enhanced scoring
   */
  async cacheEnhancedScoring<T>(
    resumeText: string,
    jobDescription: string,
    scoringParams: Record<string, any>,
    analysisFunction: () => Promise<T>
  ): Promise<T> {
    const key = this.cache.generateKey(resumeText, jobDescription, 'enhanced_scoring', scoringParams);
    const cached = this.cache.get(key) as T | null;

    if (cached) {
      logger.debug("Enhanced scoring cache hit", { 
        cacheKey: key.substring(0, 20) + '...'
      });
      return cached;
    }

    const result = await analysisFunction();
    const seed = this.generateSeed(resumeText, jobDescription);
    this.cache.set(key, result, seed, 'enhanced_scoring');

    logger.debug("Enhanced scoring cached", { 
      cacheKey: key.substring(0, 20) + '...'
    });

    return result;
  }

  /**
   * Invalidate cache when resume is updated
   */
  invalidateResumeCache(resumeId: string | number): number {
    const pattern = `resume_analysis.*${resumeId}`;
    return this.cache.invalidateByPattern(pattern);
  }

  /**
   * Invalidate cache when job description is updated
   */
  invalidateJobCache(jobId: string | number): number {
    const pattern = `job_analysis.*${jobId}`;
    return this.cache.invalidateByPattern(pattern);
  }

  /**
   * Invalidate all skill matching cache (useful when algorithm updates)
   */
  invalidateSkillMatchingCache(): number {
    return this.cache.invalidateAnalysisType('skill_matching');
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Warm cache for frequently accessed combinations
   */
  async warmFrequentCombinations(
    analysisFunction: (resumeText: string, jobDescription: string, analysisType: string) => Promise<unknown>
  ): Promise<void> {
    const frequentCombinations = this.cache.getFrequentCombinations(20);
    
    if (frequentCombinations.length === 0) {
      logger.info("No frequent combinations found for cache warming");
      return;
    }

    // Convert frequent combinations to warming format
    const warmingCombinations = frequentCombinations.map(combo => ({
      resumeText: `seed:${combo.seed}:resume`, // Placeholder - in real implementation, fetch actual text
      jobDescription: `seed:${combo.seed}:job`, // Placeholder - in real implementation, fetch actual text
      analysisTypes: combo.analysisTypes,
    }));

    await this.cache.warmCache(warmingCombinations, analysisFunction);
  }

  private generateSeed(resumeText: string, jobText: string): string {
    const combined = `${resumeText.trim().toLowerCase()}|${jobText.trim().toLowerCase()}`;
    return crypto
      .createHash("sha256")
      .update(combined)
      .digest("hex")
      .substring(0, 16);
  }
}

// Singleton cache integration instance
export const cacheIntegration = new CacheIntegration(intelligentCache);

// Score normalization and consistency checks
export function normalizeScore(rawScore: number): number {
  // Ensure score is between 0-100
  const clamped = Math.max(0, Math.min(100, rawScore));

  // Round to nearest 5 for consistency
  return Math.round(clamped / 5) * 5;
}

// Confidence scoring based on input quality
export function calculateConfidenceLevel(
  resumeLength: number,
  jobDescLength: number,
  skillMatches: number,
): "low" | "medium" | "high" {
  const resumeScore = Math.min(resumeLength / 1000, 1); // Normalize to 1000 chars
  const jobScore = Math.min(jobDescLength / 500, 1); // Normalize to 500 chars
  const matchScore = Math.min(skillMatches / 10, 1); // Normalize to 10 skills

  const overallScore = (resumeScore + jobScore + matchScore) / 3;

  if (overallScore >= 0.7) return "high";
  if (overallScore >= 0.4) return "medium";
  return "low";
}





