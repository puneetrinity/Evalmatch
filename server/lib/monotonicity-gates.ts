/**
 * Phase 4.2: Monotonicity Gates and Hard Requirements
 * 
 * Implements gates that must be applied BEFORE blending to ensure
 * fundamental requirements are respected and monotonicity is preserved.
 */

import { logger } from './logger';

interface RequirementGates {
  requiredSkills: string[];
  minimumYearsExperience?: number;
  mustHaveEducation?: string[];
  preferredQualifications?: string[];
}

interface MonotonicityResult {
  adjustedScore: number;
  violations: string[];
  gatesPassed: string[];
  recommendations: string[];
}

// ✅ CRITICAL: Apply gates BEFORE blending, not after
export function applyMonotonicityGates(
  mlScore: number,
  llmScore: number,
  candidateProfile: any,
  requirements: RequirementGates
): { adjustedMLScore: number; adjustedLLMScore: number; violations: string[] } {
  const violations: string[] = [];
  let mlAdjustment = 1.0;
  let llmAdjustment = 1.0;

  // ✅ CRITICAL: Required skills gate
  if (requirements.requiredSkills && requirements.requiredSkills.length > 0) {
    const candidateSkills = (candidateProfile.skills || []).map((s: any) =>
      (s.name || s.skill || s).toLowerCase()
    );

    const missingSkills = requirements.requiredSkills.filter(reqSkill => {
      const reqSkillLower = reqSkill.toLowerCase();
      return !candidateSkills.some((candSkill: string) =>
        candSkill.includes(reqSkillLower) || reqSkillLower.includes(candSkill)
      );
    });

    if (missingSkills.length > 0) {
      const penalty = Math.min(0.4, missingSkills.length * 0.1); // Max 40% penalty
      mlAdjustment *= (1 - penalty);
      llmAdjustment *= (1 - penalty);
      violations.push(`Missing required skills: ${missingSkills.join(', ')}`);

      logger.info('Required skills gate violation', {
        missingSkills,
        penalty,
        candidateSkills: candidateSkills.slice(0, 10)
      });
    }
  }

  // ✅ CRITICAL: Minimum experience gate
  if (requirements.minimumYearsExperience && candidateProfile.totalExperience !== undefined) {
    if (candidateProfile.totalExperience < requirements.minimumYearsExperience) {
      const experienceRatio = candidateProfile.totalExperience / requirements.minimumYearsExperience;
      const penalty = Math.min(0.3, 1 - experienceRatio); // Max 30% penalty
      mlAdjustment *= (1 - penalty);
      llmAdjustment *= (1 - penalty);
      violations.push(`Insufficient experience: ${candidateProfile.totalExperience}Y < ${requirements.minimumYearsExperience}Y required`);

      logger.info('Minimum experience gate violation', {
        candidateExperience: candidateProfile.totalExperience,
        requiredExperience: requirements.minimumYearsExperience,
        penalty
      });
    }
  }

  // ✅ CRITICAL: Education requirements gate
  if (requirements.mustHaveEducation && requirements.mustHaveEducation.length > 0) {
    const candidateEducation = (candidateProfile.education || []).map((e: any) =>
      (e.degree || e.level || e).toLowerCase()
    );

    const missingEducation = requirements.mustHaveEducation.filter(reqEd => {
      const reqEdLower = reqEd.toLowerCase();
      return !candidateEducation.some((candEd: string) =>
        candEd.includes(reqEdLower) || reqEdLower.includes(candEd)
      );
    });

    if (missingEducation.length > 0) {
      const penalty = Math.min(0.2, missingEducation.length * 0.1); // Max 20% penalty for education
      mlAdjustment *= (1 - penalty);
      llmAdjustment *= (1 - penalty);
      violations.push(`Missing required education: ${missingEducation.join(', ')}`);

      logger.info('Education requirement gate violation', {
        missingEducation,
        penalty,
        candidateEducation
      });
    }
  }

  // Apply adjustments with floor values
  const adjustedMLScore = Math.max(10, mlScore * mlAdjustment); // Never go below 10
  const adjustedLLMScore = Math.max(10, llmScore * llmAdjustment);

  logger.debug('Monotonicity gates applied', {
    originalScores: { ml: mlScore, llm: llmScore },
    adjustments: { ml: mlAdjustment, llm: llmAdjustment },
    adjustedScores: { ml: adjustedMLScore, llm: adjustedLLMScore },
    violationsCount: violations.length
  });

  return {
    adjustedMLScore: Math.round(adjustedMLScore),
    adjustedLLMScore: Math.round(adjustedLLMScore),
    violations
  };
}

// ✅ CRITICAL: Monotonicity validation - adding skills cannot reduce score
export function validateMonotonicity(
  baseCandidate: any,
  enhancedCandidate: any,
  scoringFunction: (_candidate: any) => number
): { isMonotonic: boolean; violation?: string } {
  const baseScore = scoringFunction(baseCandidate);
  const enhancedScore = scoringFunction(enhancedCandidate);

  // Enhanced candidate should never score lower
  if (enhancedScore < baseScore) {
    logger.warn('Monotonicity violation detected', {
      baseScore,
      enhancedScore,
      difference: enhancedScore - baseScore
    });

    return {
      isMonotonic: false,
      violation: `Enhanced candidate scored ${enhancedScore} vs base ${baseScore}`
    };
  }

  return { isMonotonic: true };
}

// ✅ Helper function to extract requirements from job description
export function extractRequirementGates(jobDescription: any): RequirementGates {
  const requirements: RequirementGates = {
    requiredSkills: []
  };

  // Extract required skills
  if (jobDescription.requiredSkills) {
    requirements.requiredSkills = Array.isArray(jobDescription.requiredSkills)
      ? jobDescription.requiredSkills
      : jobDescription.requiredSkills.split(',').map((s: string) => s.trim());
  }

  // Extract minimum experience
  if (jobDescription.minimumExperience || jobDescription.minimumYearsExperience) {
    requirements.minimumYearsExperience = jobDescription.minimumExperience || jobDescription.minimumYearsExperience;
  }

  // Extract education requirements
  if (jobDescription.requiredEducation || jobDescription.educationRequirements) {
    const education = jobDescription.requiredEducation || jobDescription.educationRequirements;
    requirements.mustHaveEducation = Array.isArray(education)
      ? education
      : [education];
  }

  // Extract preferred qualifications
  if (jobDescription.preferredQualifications) {
    requirements.preferredQualifications = Array.isArray(jobDescription.preferredQualifications)
      ? jobDescription.preferredQualifications
      : jobDescription.preferredQualifications.split(',').map((s: string) => s.trim());
  }

  return requirements;
}

// ✅ Helper function to validate that gates preserve score ordering
export function validateGateConsistency(
  candidates: any[],
  requirements: RequirementGates,
  originalScores: number[]
): { isConsistent: boolean; violations: string[] } {
  const violations: string[] = [];
  
  // Apply gates to all candidates
  const adjustedScores = candidates.map((candidate, index) => {
    const result = applyMonotonicityGates(
      originalScores[index],
      originalScores[index], // Use same score for both ML and LLM for this test
      candidate,
      requirements
    );
    return result.adjustedMLScore;
  });

  // Check if relative ordering is preserved
  for (let i = 0; i < candidates.length - 1; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const originalOrder = originalScores[i] > originalScores[j];
      const adjustedOrder = adjustedScores[i] > adjustedScores[j];
      
      if (originalOrder !== adjustedOrder) {
        violations.push(
          `Gate application changed relative ordering between candidates ${i} and ${j}`
        );
      }
    }
  }

  return {
    isConsistent: violations.length === 0,
    violations
  };
}

// Export types for use in other modules
export type { RequirementGates, MonotonicityResult };