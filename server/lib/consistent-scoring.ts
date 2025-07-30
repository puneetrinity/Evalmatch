/**
 * Consistent Scoring System
 * 
 * This module provides deterministic scoring mechanisms to ensure
 * consistent results across multiple runs for the same resume/job combination.
 */

import crypto from 'crypto';
import { logger } from './logger';

// Scoring rubrics and anchors
export const SCORING_RUBRICS = {
  SKILL_MATCH: {
    EXACT_MATCH: 100,
    STRONG_RELATED: 90,
    MODERATELY_RELATED: 70,
    LOOSELY_RELATED: 50,
    TRANSFERABLE: 30,
    NO_MATCH: 0
  },
  EXPERIENCE_LEVEL: {
    EXCEEDS_REQUIREMENT: 100,
    MEETS_REQUIREMENT: 85,
    MOSTLY_MEETS: 70,
    PARTIALLY_MEETS: 50,
    BELOW_REQUIREMENT: 25,
    INSUFFICIENT: 0
  },
  EDUCATION_MATCH: {
    EXCEEDS: 100,
    EXACT_MATCH: 90,
    EQUIVALENT: 80,
    RELATED_FIELD: 60,
    TRANSFERABLE: 40,
    UNRELATED: 20,
    NO_EDUCATION: 0
  }
};

// Weight factors for different components
export const SCORING_WEIGHTS = {
  SKILLS: 0.5,          // 50% - Most important
  EXPERIENCE: 0.3,      // 30% - Very important  
  EDUCATION: 0.15,      // 15% - Important
  CULTURAL_FIT: 0.05    // 5% - Nice to have
};

// Deterministic seed generation
function generateDeterministicSeed(resumeText: string, jobText: string): string {
  const combined = `${resumeText.trim().toLowerCase()}|${jobText.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

// Normalize skill names for consistent matching
function normalizeSkill(skill: string): string {
  return skill.toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/javascript/i, 'js')
    .replace(/typescript/i, 'ts')
    .replace(/reactjs/i, 'react')
    .replace(/nodejs/i, 'node')
    .replace(/postgresql/i, 'postgres');
}

// Calculate skill similarity score using deterministic algorithm
function calculateSkillSimilarity(resumeSkill: string, jobSkill: string): number {
  const normalizedResume = normalizeSkill(resumeSkill);
  const normalizedJob = normalizeSkill(jobSkill);
  
  // Exact match
  if (normalizedResume === normalizedJob) {
    return SCORING_RUBRICS.SKILL_MATCH.EXACT_MATCH;
  }
  
  // Contains match
  if (normalizedResume.includes(normalizedJob) || normalizedJob.includes(normalizedResume)) {
    return SCORING_RUBRICS.SKILL_MATCH.STRONG_RELATED;
  }
  
  // Word overlap calculation
  const resumeWords = normalizedResume.split(' ');
  const jobWords = normalizedJob.split(' ');
  const commonWords = resumeWords.filter(word => jobWords.includes(word));
  const overlapRatio = commonWords.length / Math.max(resumeWords.length, jobWords.length);
  
  if (overlapRatio >= 0.7) return SCORING_RUBRICS.SKILL_MATCH.MODERATELY_RELATED;
  if (overlapRatio >= 0.4) return SCORING_RUBRICS.SKILL_MATCH.LOOSELY_RELATED;
  if (overlapRatio >= 0.2) return SCORING_RUBRICS.SKILL_MATCH.TRANSFERABLE;
  
  return SCORING_RUBRICS.SKILL_MATCH.NO_MATCH;
}

// Enhanced consistent scoring prompt generator
export function generateConsistentScoringPrompt(
  resumeText: string, 
  jobDescription: string, 
  analysisType: 'match' | 'resume' | 'job'
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
    case 'match':
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

    case 'resume':
      return `${baseInstructions}

TASK: Analyze resume with consistent scoring criteria.

Resume: ${resumeText}`;

    case 'job':
      return `${baseInstructions}

TASK: Analyze job description with consistent criteria.

Job Description: ${jobDescription}`;

    default:
      throw new Error(`Unknown analysis type: ${analysisType}`);
  }
}

// Validation function for score consistency
export function validateScoreConsistency(scores: number[]): {
  isConsistent: boolean;
  variance: number;
  recommendation: string;
} {
  if (scores.length < 2) {
    return { isConsistent: true, variance: 0, recommendation: "Insufficient data" };
  }
  
  const values = scores.map(s => s.matchPercentage || 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
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
    recommendation
  };
}

// Enhanced caching with deterministic keys
export class DeterministicCache {
  private cache: Map<string, { data: unknown; timestamp: number; seed: string }> = new Map();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  generateKey(resumeText: string, jobDescription: string, analysisType: string): string {
    const seed = generateDeterministicSeed(resumeText, jobDescription);
    return `${analysisType}_${seed}`;
  }
  
  get(key: string): unknown | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    
    logger.debug('Cache hit for deterministic scoring', { key, seed: cached.seed });
    return cached.data;
  }
  
  set(key: string, data: unknown, seed: string): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      seed
    });
  }
  
  clear(): void {
    this.cache.clear();
    logger.info('Deterministic cache cleared');
  }
  
  getStats(): { size: number; oldestEntry: number; newestEntry: number } {
    const timestamps = Array.from(this.cache.values()).map(v => v.timestamp);
    return {
      size: this.cache.size,
      oldestEntry: Math.min(...timestamps) || 0,
      newestEntry: Math.max(...timestamps) || 0
    };
  }
}

// Singleton cache instance
export const deterministicCache = new DeterministicCache();

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
  skillMatches: number
): 'low' | 'medium' | 'high' {
  const resumeScore = Math.min(resumeLength / 1000, 1); // Normalize to 1000 chars
  const jobScore = Math.min(jobDescLength / 500, 1);     // Normalize to 500 chars
  const matchScore = Math.min(skillMatches / 10, 1);     // Normalize to 10 skills
  
  const overallScore = (resumeScore + jobScore + matchScore) / 3;
  
  if (overallScore >= 0.7) return 'high';
  if (overallScore >= 0.4) return 'medium';
  return 'low';
}