/**
 * Unified Scoring Weights Configuration
 * 
 * Centralized scoring weights to ensure consistency across all analyzer modules.
 * These weights are research-backed and optimized for accurate resume-job matching.
 */

export interface ScoringWeights {
  skills: number;
  experience: number;
  education: number;
  semantic: number;
}

/**
 * Unified scoring weights used across all analyzer modules
 * 
 * Research-backed optimal distribution:
 * - Skills: 50% - Most critical factor for job performance
 * - Experience: 30% - Important for role readiness and capability
 * - Education: 15% - Foundation but less predictive than skills/experience
 * - Semantic: 5% - Contextual understanding and domain alignment
 * 
 * Total: 100% (0.50 + 0.30 + 0.15 + 0.05 = 1.00)
 */
export const UNIFIED_SCORING_WEIGHTS: ScoringWeights = {
  skills: 0.50,      // 50% - Primary factor for job match
  experience: 0.30,  // 30% - Secondary factor for capability assessment
  education: 0.15,   // 15% - Tertiary factor for foundational knowledge
  semantic: 0.05,    // 5% - Contextual understanding and domain fit
};

/**
 * Validate that scoring weights sum to 1.0 (100%)
 */
export function validateScoringWeights(weights: ScoringWeights): boolean {
  const sum = weights.skills + weights.experience + weights.education + weights.semantic;
  const tolerance = 0.001; // Allow for floating point precision
  return Math.abs(sum - 1.0) < tolerance;
}

/**
 * Get normalized scoring weights (ensures they sum to exactly 1.0)
 */
export function getNormalizedScoringWeights(weights: ScoringWeights): ScoringWeights {
  const sum = weights.skills + weights.experience + weights.education + weights.semantic;
  
  if (sum === 0) {
    throw new Error('All scoring weights cannot be zero');
  }
  
  return {
    skills: weights.skills / sum,
    experience: weights.experience / sum,
    education: weights.education / sum,
    semantic: weights.semantic / sum,
  };
}

/**
 * Scoring weight validation at module load time
 */
if (!validateScoringWeights(UNIFIED_SCORING_WEIGHTS)) {
  throw new Error(
    `Invalid unified scoring weights: ${JSON.stringify(UNIFIED_SCORING_WEIGHTS)}. ` +
    'Weights must sum to 1.0 (100%)'
  );
}

// Export individual weights for backward compatibility
export const SKILLS_WEIGHT = UNIFIED_SCORING_WEIGHTS.skills;
export const EXPERIENCE_WEIGHT = UNIFIED_SCORING_WEIGHTS.experience;
export const EDUCATION_WEIGHT = UNIFIED_SCORING_WEIGHTS.education;
export const SEMANTIC_WEIGHT = UNIFIED_SCORING_WEIGHTS.semantic;
