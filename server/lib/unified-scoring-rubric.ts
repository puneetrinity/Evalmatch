/**
 * Unified Scoring Rubric
 * 
 * This module provides centralized match quality thresholds and recommendation
 * templates to ensure consistent scoring interpretation across all analyzer components.
 */

import { logger } from "./logger";

// Match quality thresholds - centralized configuration
export const MATCH_QUALITY_THRESHOLDS = {
  EXCELLENT: 85,    // ≥85% - Outstanding match, highly recommended
  STRONG: 70,       // 70-84% - Strong match, recommended with confidence
  MODERATE: 55,     // 55-69% - Moderate match, consider with additional screening
  WEAK: 40,         // 40-54% - Weak match, requires significant development
  POOR: 0,          // <40% - Poor match, not recommended
} as const;

// Match quality levels for type safety
export type MatchQualityLevel = 'excellent' | 'strong' | 'moderate' | 'weak' | 'poor';

// Match quality configuration interface
export interface MatchQualityConfig {
  level: MatchQualityLevel;
  threshold: number;
  range: string;
  description: string;
  recommendation: string;
  actionItems: string[];
  confidenceModifier: number; // Multiplier for confidence scoring
}

// Comprehensive match quality configurations
export const MATCH_QUALITY_CONFIGS: Record<MatchQualityLevel, MatchQualityConfig> = {
  excellent: {
    level: 'excellent',
    threshold: MATCH_QUALITY_THRESHOLDS.EXCELLENT,
    range: '≥85%',
    description: 'Outstanding match with exceptional alignment across all key criteria',
    recommendation: 'Highly recommended - proceed with interview process immediately',
    actionItems: [
      'Schedule interview as high priority candidate',
      'Prepare advanced technical discussions',
      'Consider for senior or specialized roles',
      'Fast-track through hiring process',
    ],
    confidenceModifier: 1.1, // 10% confidence boost for excellent matches
  },
  strong: {
    level: 'strong',
    threshold: MATCH_QUALITY_THRESHOLDS.STRONG,
    range: '70-84%',
    description: 'Strong match with good alignment in most key areas',
    recommendation: 'Recommended - strong candidate worth interviewing',
    actionItems: [
      'Schedule interview with hiring manager',
      'Assess specific skill gaps during interview',
      'Consider for target role or similar positions',
      'Prepare role-specific questions',
    ],
    confidenceModifier: 1.05, // 5% confidence boost for strong matches
  },
  moderate: {
    level: 'moderate',
    threshold: MATCH_QUALITY_THRESHOLDS.MODERATE,
    range: '55-69%',
    description: 'Moderate match with some alignment but notable gaps',
    recommendation: 'Consider with additional screening - potential with development',
    actionItems: [
      'Conduct thorough screening interview',
      'Assess learning ability and growth potential',
      'Consider for junior or training positions',
      'Evaluate cultural fit and motivation',
      'Identify specific development needs',
    ],
    confidenceModifier: 1.0, // No confidence adjustment for moderate matches
  },
  weak: {
    level: 'weak',
    threshold: MATCH_QUALITY_THRESHOLDS.WEAK,
    range: '40-54%',
    description: 'Weak match with significant gaps in key requirements',
    recommendation: 'Not recommended for current role - consider for different positions or future opportunities',
    actionItems: [
      'Review for alternative roles within organization',
      'Consider for entry-level or training programs',
      'Assess transferable skills and potential',
      'Provide feedback on skill development areas',
      'Keep in talent pipeline for future roles',
    ],
    confidenceModifier: 0.9, // 10% confidence reduction for weak matches
  },
  poor: {
    level: 'poor',
    threshold: MATCH_QUALITY_THRESHOLDS.POOR,
    range: '<40%',
    description: 'Poor match with minimal alignment to role requirements',
    recommendation: 'Not recommended - significant skill and experience gaps',
    actionItems: [
      'Politely decline with constructive feedback',
      'Suggest relevant skill development resources',
      'Consider for very different roles if applicable',
      'Maintain professional relationship for future opportunities',
    ],
    confidenceModifier: 0.8, // 20% confidence reduction for poor matches
  },
};

/**
 * Determine match quality level based on match percentage
 */
export function determineMatchQuality(matchPercentage: number): MatchQualityLevel {
  if (matchPercentage >= MATCH_QUALITY_THRESHOLDS.EXCELLENT) {
    return 'excellent';
  } else if (matchPercentage >= MATCH_QUALITY_THRESHOLDS.STRONG) {
    return 'strong';
  } else if (matchPercentage >= MATCH_QUALITY_THRESHOLDS.MODERATE) {
    return 'moderate';
  } else if (matchPercentage >= MATCH_QUALITY_THRESHOLDS.WEAK) {
    return 'weak';
  } else {
    return 'poor';
  }
}

/**
 * Get match quality configuration for a given match percentage
 */
export function getMatchQualityConfig(matchPercentage: number): MatchQualityConfig {
  const level = determineMatchQuality(matchPercentage);
  return MATCH_QUALITY_CONFIGS[level];
}

/**
 * Generate detailed match quality explanation
 */
export function generateMatchQualityExplanation(
  matchPercentage: number,
  confidenceLevel: 'low' | 'medium' | 'high',
  skillsMatched: number,
  totalSkills: number
): {
  quality: MatchQualityConfig;
  explanation: string;
  detailedRecommendation: string;
  nextSteps: string[];
} {
  const quality = getMatchQualityConfig(matchPercentage);
  
  // Generate contextual explanation
  const skillMatchRate = totalSkills > 0 ? Math.round((skillsMatched / totalSkills) * 100) : 0;
  const confidenceText = confidenceLevel === 'high' ? 'high confidence' : 
                        confidenceLevel === 'medium' ? 'moderate confidence' : 'lower confidence';

  const explanation = `This candidate shows a ${quality.level} match (${matchPercentage}%) with ${confidenceText} in the analysis. ` +
    `Skills alignment: ${skillsMatched}/${totalSkills} (${skillMatchRate}%) of required skills matched. ` +
    `${quality.description}`;

  // Adjust recommendation based on confidence level
  let detailedRecommendation = quality.recommendation;
  if (confidenceLevel === 'low') {
    detailedRecommendation += ' Note: Analysis confidence is low - consider gathering additional information before making final decisions.';
  } else if (confidenceLevel === 'high' && quality.level === 'excellent') {
    detailedRecommendation += ' High confidence analysis supports this strong recommendation.';
  }

  // Generate next steps based on quality level and confidence
  let nextSteps = [...quality.actionItems];
  if (confidenceLevel === 'low') {
    nextSteps.unshift('Gather additional candidate information to improve assessment confidence');
  }

  return {
    quality,
    explanation,
    detailedRecommendation,
    nextSteps,
  };
}

/**
 * Apply confidence modifier based on match quality
 */
export function applyQualityConfidenceModifier(
  baseConfidence: number,
  matchPercentage: number
): number {
  const quality = getMatchQualityConfig(matchPercentage);
  const modifiedConfidence = baseConfidence * quality.confidenceModifier;
  
  // Ensure confidence stays within valid bounds
  return Math.max(0.1, Math.min(1.0, modifiedConfidence));
}

/**
 * Get recommendation template based on match quality and specific context
 */
export function getRecommendationTemplate(
  matchPercentage: number,
  context: {
    roleLevel?: 'entry' | 'mid' | 'senior' | 'executive';
    urgency?: 'low' | 'medium' | 'high';
    teamSize?: number;
    isRemote?: boolean;
  } = {}
): {
  primaryRecommendation: string;
  secondaryRecommendations: string[];
  interviewFocus: string[];
} {
  const quality = getMatchQualityConfig(matchPercentage);
  const { roleLevel = 'mid', urgency = 'medium', teamSize = 5, isRemote = false } = context;

  let primaryRecommendation = quality.recommendation;
  const secondaryRecommendations: string[] = [];
  const interviewFocus: string[] = [];

  // Adjust recommendations based on context
  switch (quality.level) {
    case 'excellent':
      if (urgency === 'high') {
        primaryRecommendation = 'Immediate hire recommendation - exceptional candidate for urgent role';
      }
      if (roleLevel === 'senior' || roleLevel === 'executive') {
        secondaryRecommendations.push('Consider for leadership or mentoring responsibilities');
      }
      interviewFocus.push('Advanced technical challenges', 'Leadership potential', 'Cultural fit assessment');
      break;

    case 'strong':
      if (roleLevel === 'entry') {
        secondaryRecommendations.push('Strong candidate with growth potential for entry-level role');
      }
      if (isRemote) {
        interviewFocus.push('Remote work experience and self-management skills');
      }
      interviewFocus.push('Specific skill validation', 'Problem-solving approach', 'Team collaboration');
      break;

    case 'moderate':
      if (teamSize > 10) {
        secondaryRecommendations.push('Consider team dynamics and mentoring availability');
      }
      if (roleLevel === 'entry') {
        primaryRecommendation = 'Good candidate for entry-level role with proper onboarding';
      }
      interviewFocus.push('Learning agility', 'Motivation and drive', 'Specific skill gaps');
      break;

    case 'weak':
      if (urgency === 'low') {
        secondaryRecommendations.push('Consider for future roles after skill development');
      }
      interviewFocus.push('Transferable skills', 'Learning potential', 'Alternative role fit');
      break;

    case 'poor':
      secondaryRecommendations.push('Provide constructive feedback for professional development');
      if (urgency === 'low') {
        secondaryRecommendations.push('Keep in talent pipeline for significant role changes');
      }
      break;
  }

  return {
    primaryRecommendation,
    secondaryRecommendations,
    interviewFocus,
  };
}

/**
 * Validate match percentage and provide quality assessment
 */
export function validateAndAssessMatchQuality(matchPercentage: number): {
  isValid: boolean;
  quality: MatchQualityLevel;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Validate match percentage range
  const isValid = matchPercentage >= 0 && matchPercentage <= 100;
  if (!isValid) {
    warnings.push(`Invalid match percentage: ${matchPercentage}. Must be between 0-100.`);
  }

  const quality = determineMatchQuality(Math.max(0, Math.min(100, matchPercentage)));

  // Provide suggestions based on quality level
  switch (quality) {
    case 'excellent':
      suggestions.push('Verify exceptional match with additional screening to confirm assessment');
      break;
    case 'strong':
      suggestions.push('Focus interview on validating key strengths and addressing minor gaps');
      break;
    case 'moderate':
      suggestions.push('Assess growth potential and willingness to develop missing skills');
      break;
    case 'weak':
      suggestions.push('Consider alternative roles or significant training investment');
      break;
    case 'poor':
      suggestions.push('Review job requirements or candidate profile for potential misalignment');
      break;
  }

  // Add warnings for edge cases
  if (matchPercentage > 95) {
    warnings.push('Exceptionally high match percentage - verify analysis accuracy');
  } else if (matchPercentage < 5) {
    warnings.push('Extremely low match percentage - check for data quality issues');
  }

  return {
    isValid,
    quality,
    warnings,
    suggestions,
  };
}

/**
 * Log match quality assessment for monitoring and debugging
 */
export function logMatchQualityAssessment(
  matchPercentage: number,
  confidenceLevel: 'low' | 'medium' | 'high',
  context: Record<string, any> = {}
): void {
  const quality = getMatchQualityConfig(matchPercentage);
  
  logger.info('Match quality assessment completed', {
    matchPercentage,
    qualityLevel: quality.level,
    qualityRange: quality.range,
    confidenceLevel,
    recommendation: quality.recommendation,
    confidenceModifier: quality.confidenceModifier,
    ...context,
  });
}
