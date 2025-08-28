/**
 * Phase 4.1: Score vs Confidence Separation with Explanations
 * 
 * Provides detailed confidence analysis separate from matching scores
 * with explanations and recommendations for transparency.
 */

import { logger } from './logger';

interface ConfidenceFactors {
  dataCompleteness: number;
  providerReliability: number;
  skillCoverage: number;
  experienceClarity: number;
  biasDetection: number;
}

interface ConfidenceAnalysis {
  overallConfidence: number;
  factors: ConfidenceFactors;
  explanations: string[];
  recommendations: string[];
}

export function calculateSeparateConfidence(
  resumeData: any,
  jobData: any,
  providerResults: any,
  escoResults: any,
  biasResults: any
): ConfidenceAnalysis {
  const explanations: string[] = [];
  const recommendations: string[] = [];
  const factors: ConfidenceFactors = {
    dataCompleteness: 1.0,
    providerReliability: 1.0,
    skillCoverage: 1.0,
    experienceClarity: 1.0,
    biasDetection: 1.0
  };

  // ✅ CRITICAL: Data completeness analysis
  if (!resumeData.skills || resumeData.skills.length < 3) {
    factors.dataCompleteness *= 0.7;
    explanations.push("Resume contains limited skills information");
    recommendations.push("Ensure resume includes comprehensive skills section");
  }

  if (!resumeData.experience || resumeData.experience.length === 0) {
    factors.dataCompleteness *= 0.8;
    explanations.push("No clear work experience dates found in resume");
    recommendations.push("Include specific employment dates in resume");
  }

  if (!jobData.requirements || jobData.requirements.length < 3) {
    factors.dataCompleteness *= 0.8;
    explanations.push("Job description has limited requirements specified");
    recommendations.push("Provide more detailed job requirements for better matching");
  }

  // ✅ CRITICAL: Provider reliability analysis
  const lowConfidenceProviders = providerResults.filter((r: any) => r.confidence < 0.6);
  if (lowConfidenceProviders.length > 0) {
    factors.providerReliability *= 0.85;
    explanations.push(`${lowConfidenceProviders.length} AI provider(s) expressed low confidence`);
  }

  if (providerResults.some((r: any) => r.failed)) {
    factors.providerReliability *= 0.9;
    explanations.push("One or more AI providers failed analysis");
  }

  // ✅ CRITICAL: Skill coverage analysis
  const skillMatchRate = escoResults.skills?.length > 0 ?
    Math.min(1.0, escoResults.skills.length / 10) : 0.3;
  factors.skillCoverage = skillMatchRate;

  if (skillMatchRate < 0.5) {
    explanations.push("Limited skill matches found between resume and job requirements");
    recommendations.push("Consider reviewing resume for relevant technical skills");
  }

  // ✅ CRITICAL: Experience clarity analysis
  if (resumeData.totalExperience === undefined || resumeData.totalExperience === null) {
    factors.experienceClarity *= 0.6;
    explanations.push("Unable to determine total years of experience");
    recommendations.push("Include clear employment dates in resume");
  } else if (resumeData.totalExperience < 1) {
    factors.experienceClarity *= 0.8;
    explanations.push("Limited professional experience detected");
  }

  // ✅ CRITICAL: Bias detection impact
  if (biasResults && biasResults.overallBias > 0.3) {
    factors.biasDetection = Math.max(0.5, 1.0 - biasResults.overallBias);
    explanations.push("Potential bias detected in matching algorithm");
    recommendations.push("Review analysis for potential algorithmic bias");
  }

  // Calculate overall confidence
  const overallConfidence = Object.values(factors).reduce((product, factor) => product * factor, 1.0);

  logger.debug('Confidence analysis completed', {
    overallConfidence,
    factors,
    explanationsCount: explanations.length,
    recommendationsCount: recommendations.length
  });

  return {
    overallConfidence: Math.max(0.1, overallConfidence),
    factors,
    explanations,
    recommendations
  };
}

// ✅ CRITICAL: Confidence level classification
export function getConfidenceLevel(confidence: number): {
  level: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW';
  description: string;
  color: string;
} {
  if (confidence >= 0.8) {
    return {
      level: 'HIGH',
      description: 'High confidence in analysis results',
      color: 'green'
    };
  } else if (confidence >= 0.6) {
    return {
      level: 'MEDIUM',
      description: 'Moderate confidence - results generally reliable',
      color: 'yellow'
    };
  } else if (confidence >= 0.4) {
    return {
      level: 'LOW',
      description: 'Low confidence - interpret results cautiously',
      color: 'orange'
    };
  } else {
    return {
      level: 'VERY_LOW',
      description: 'Very low confidence - results may be unreliable',
      color: 'red'
    };
  }
}

// ✅ Helper function to analyze confidence factors for specific scenarios
export function analyzeConfidenceFactors(analysis: ConfidenceAnalysis): {
  primaryIssues: string[];
  actionableRecommendations: string[];
  confidenceLevel: ReturnType<typeof getConfidenceLevel>;
} {
  const primaryIssues: string[] = [];
  const actionableRecommendations: string[] = [];

  // Identify primary issues based on factor severity
  if (analysis.factors.dataCompleteness < 0.7) {
    primaryIssues.push("Insufficient data quality");
    actionableRecommendations.push("Improve input data completeness");
  }

  if (analysis.factors.providerReliability < 0.8) {
    primaryIssues.push("AI provider reliability concerns");
    actionableRecommendations.push("Verify AI provider configurations");
  }

  if (analysis.factors.skillCoverage < 0.5) {
    primaryIssues.push("Limited skill matching");
    actionableRecommendations.push("Review skill extraction and matching logic");
  }

  if (analysis.factors.experienceClarity < 0.7) {
    primaryIssues.push("Unclear experience information");
    actionableRecommendations.push("Enhance experience parsing accuracy");
  }

  if (analysis.factors.biasDetection < 0.8) {
    primaryIssues.push("Potential algorithmic bias");
    actionableRecommendations.push("Review bias detection and mitigation strategies");
  }

  const confidenceLevel = getConfidenceLevel(analysis.overallConfidence);

  return {
    primaryIssues,
    actionableRecommendations,
    confidenceLevel
  };
}

// Export types for use in other modules
export type { ConfidenceFactors, ConfidenceAnalysis };