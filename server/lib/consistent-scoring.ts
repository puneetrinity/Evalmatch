/**
 * Consistent Scoring System
 *
 * This module provides deterministic scoring mechanisms to ensure
 * consistent results across multiple runs for the same resume/job combination.
 */

import crypto from "crypto";
import { logger } from "./logger";
import {
  UNIFIED_SCORING_WEIGHTS,
  UNIFIED_SCORING_RUBRICS,
} from "./unified-scoring-config";

// Use unified scoring rubrics for consistency (Task 1: Standardize scoring)
export const SCORING_RUBRICS = UNIFIED_SCORING_RUBRICS;

// Use unified scoring weights (Task 1: Remove cultural fit bias risk)
export const SCORING_WEIGHTS = {
  SKILLS: UNIFIED_SCORING_WEIGHTS.skills,
  EXPERIENCE: UNIFIED_SCORING_WEIGHTS.experience,
  EDUCATION: UNIFIED_SCORING_WEIGHTS.education,
  SEMANTIC: UNIFIED_SCORING_WEIGHTS.semantic, // Re-enabled semantic scoring
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
  if (overlapRatio >= 0.4) return SCORING_RUBRICS.SKILL_MATCH.WEAK_RELATED;
  if (overlapRatio >= 0.2) return SCORING_RUBRICS.SKILL_MATCH.WEAK_RELATED;

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

// Task 7: Enhanced intelligent caching with performance optimization
export class IntelligentDeterministicCache {
  private cache: Map<
    string,
    { 
      data: unknown; 
      timestamp: number; 
      seed: string;
      accessCount: number;
      lastAccessed: number;
      cacheType: 'resume' | 'job' | 'match' | 'skill_matching';
      size: number;
    }
  > = new Map();
  
  // Task 7: Intelligent TTL values for different analysis types
  private readonly TTL_CONFIG = {
    resume: 48 * 60 * 60 * 1000,      // 48 hours - resume analysis is stable
    job: 24 * 60 * 60 * 1000,        // 24 hours - job descriptions change moderately  
    match: 12 * 60 * 60 * 1000,      // 12 hours - match analysis benefits from freshness
    skill_matching: 72 * 60 * 60 * 1000, // 72 hours - skill hierarchies are stable
  };
  
  private readonly MAX_CACHE_SIZE = 10000; // Prevent memory issues
  private accessPatterns: Map<string, number[]> = new Map(); // Track access patterns for warming

  /**
   * Task 7: Enhanced key generation with cache type awareness
   */
  generateKey(
    resumeText: string,
    jobDescription: string,
    analysisType: 'resume' | 'job' | 'match' | 'skill_matching',
    additionalContext?: string
  ): string {
    const seed = generateDeterministicSeed(resumeText, jobDescription);
    const contextHash = additionalContext ? 
      `_${crypto.createHash('sha256').update(additionalContext).digest('hex').substring(0, 8)}` : '';
    return `${analysisType}_${seed}${contextHash}`;
  }

  /**
   * Task 7: Intelligent get with access pattern tracking
   */
  get(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (!cached) {
      logger.debug("Cache miss", { key });
      return null;
    }

    // Check TTL based on cache type
    const ttl = this.TTL_CONFIG[cached.cacheType] || this.TTL_CONFIG.match;
    if (Date.now() - cached.timestamp > ttl) {
      this.cache.delete(key);
      this.accessPatterns.delete(key);
      logger.debug("Cache expired", { key, cacheType: cached.cacheType, age: Date.now() - cached.timestamp });
      return null;
    }

    // Update access tracking for warming strategy
    cached.accessCount++;
    cached.lastAccessed = Date.now();
    this.updateAccessPattern(key);

    logger.debug("Cache hit for intelligent scoring", {
      key,
      cacheType: cached.cacheType,
      accessCount: cached.accessCount,
      age: Date.now() - cached.timestamp
    });
    
    return cached.data;
  }

  /**
   * Task 7: Enhanced set with intelligent cache management
   */
  set(
    key: string, 
    data: unknown, 
    seed: string, 
    cacheType: 'resume' | 'job' | 'match' | 'skill_matching' = 'match'
  ): void {
    
    // Task 7: Implement cache size management
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLeastUsed();
    }
    
    // Calculate approximate size for monitoring
    const dataSize = JSON.stringify(data).length;
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      seed,
      accessCount: 1,
      lastAccessed: Date.now(),
      cacheType,
      size: dataSize
    });
    
    logger.debug("Cache entry created", {
      key,
      cacheType,
      size: dataSize,
      totalCacheSize: this.cache.size
    });
  }

  /**
   * Task 7: Cache invalidation logic for updated content
   */
  invalidatePattern(pattern: RegExp): number {
    let invalidated = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        this.accessPatterns.delete(key);
        invalidated++;
      }
    }
    
    logger.info("Cache invalidation completed", {
      pattern: pattern.source,
      invalidatedCount: invalidated
    });
    
    return invalidated;
  }

  /**
   * Task 7: Intelligent cache warming for frequently accessed combinations
   */
  async warmCache(
    frequentCombinations: Array<{
      resumeText: string;
      jobDescription: string;
      analysisType: 'resume' | 'job' | 'match' | 'skill_matching';
    }>,
    warmingFunction: (resumeText: string, jobDescription: string, analysisType: string) => Promise<unknown>
  ): Promise<void> {
    
    logger.info("Starting intelligent cache warming", {
      combinationsToWarm: frequentCombinations.length
    });
    
    for (const combination of frequentCombinations) {
      const key = this.generateKey(
        combination.resumeText,
        combination.jobDescription,
        combination.analysisType
      );
      
      // Only warm if not already cached
      if (!this.cache.has(key)) {
        try {
          const result = await warmingFunction(
            combination.resumeText,
            combination.jobDescription,
            combination.analysisType
          );
          
          const seed = generateDeterministicSeed(combination.resumeText, combination.jobDescription);
          this.set(key, result, seed, combination.analysisType);
          
          logger.debug("Cache warmed", {
            key,
            analysisType: combination.analysisType
          });
          
        } catch (error) {
          logger.warn("Cache warming failed", {
            key,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    
    logger.info("Cache warming completed");
  }

  /**
   * Task 7: LRU eviction for cache size management
   */
  private evictLeastUsed(): void {
    let leastUsedKey = '';
    let leastUsedScore = Number.MAX_VALUE;
    
    for (const [key, entry] of this.cache.entries()) {
      // Calculate usage score (access count weighted by recency)
      const recencyWeight = Date.now() - entry.lastAccessed;
      const usageScore = entry.accessCount / (recencyWeight / (1000 * 60 * 60)); // Normalize by hours
      
      if (usageScore < leastUsedScore) {
        leastUsedScore = usageScore;
        leastUsedKey = key;
      }
    }
    
    if (leastUsedKey) {
      const evicted = this.cache.get(leastUsedKey);
      this.cache.delete(leastUsedKey);
      this.accessPatterns.delete(leastUsedKey);
      
      logger.debug("Cache entry evicted", {
        key: leastUsedKey,
        accessCount: evicted?.accessCount,
        lastAccessed: evicted?.lastAccessed,
        cacheType: evicted?.cacheType
      });
    }
  }

  /**
   * Task 7: Track access patterns for intelligent warming
   */
  private updateAccessPattern(key: string): void {
    const now = Date.now();
    let pattern = this.accessPatterns.get(key) || [];
    
    pattern.push(now);
    
    // Keep only recent access times (last 24 hours)
    const dayAgo = now - (24 * 60 * 60 * 1000);
    pattern = pattern.filter(time => time > dayAgo);
    
    this.accessPatterns.set(key, pattern);
  }

  clear(): void {
    this.cache.clear();
    this.accessPatterns.clear();
    logger.info("Intelligent cache cleared");
  }

  /**
   * Task 7: Enhanced cache statistics for monitoring
   */
  getStats(): { 
    size: number; 
    oldestEntry: number; 
    newestEntry: number;
    totalSize: number;
    hitRate: number;
    cacheTypeDistribution: Record<string, number>;
    averageAccessCount: number;
  } {
    if (this.cache.size === 0) {
      return {
        size: 0,
        oldestEntry: 0,
        newestEntry: 0,
        totalSize: 0,
        hitRate: 0,
        cacheTypeDistribution: {},
        averageAccessCount: 0
      };
    }
    
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map(v => v.timestamp);
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    
    // Calculate cache type distribution
    const typeDistribution: Record<string, number> = {};
    entries.forEach(entry => {
      typeDistribution[entry.cacheType] = (typeDistribution[entry.cacheType] || 0) + 1;
    });
    
    // Calculate hit rate based on access patterns
    const totalPatternEntries = Array.from(this.accessPatterns.values()).reduce(
      (sum, pattern) => sum + pattern.length, 0
    );
    const hitRate = totalPatternEntries > 0 ? (totalAccesses / totalPatternEntries) : 0;
    
    return {
      size: this.cache.size,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps),
      totalSize,
      hitRate,
      cacheTypeDistribution: typeDistribution,
      averageAccessCount: totalAccesses / this.cache.size
    };
  }
}

// Task 7: Singleton intelligent cache instance (backward compatibility)
export const deterministicCache = new IntelligentDeterministicCache();

// Backward compatibility alias
export const DeterministicCache = IntelligentDeterministicCache;

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
