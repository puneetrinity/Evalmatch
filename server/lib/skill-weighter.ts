/**
 * Skill Weighting Module
 *
 * Handles weighting of skills based on their importance levels for more accurate
 * match calculations.
 */

// Feature flag to enable/disable skill weighting
export const SKILL_WEIGHTING_ENABLED =
  process.env.USE_SKILL_WEIGHTING !== "false";

// Weight multipliers for different importance levels
const IMPORTANCE_WEIGHTS = {
  critical: 3.0,
  important: 2.0,
  "nice-to-have": 1.0,
  optional: 1.0,
  // Default for skills without specified importance
  default: 2.0,
};

/**
 * Simple interface for a skill with importance
 */
interface WeightedSkill {
  skill: string;
  importance?: string;
  matchPercentage?: number;
  weight?: number;
}

/**
 * Apply weight to a single skill based on its importance
 * @param skill The skill object potentially with importance field
 * @returns The skill with calculated weight
 */
export function applyWeightToSkill(skill: WeightedSkill): WeightedSkill {
  // If weighting is disabled, return skill with default weight
  if (!SKILL_WEIGHTING_ENABLED) {
    return { ...skill, weight: 1.0 };
  }

  // Determine the weight based on importance
  let weight = IMPORTANCE_WEIGHTS.default;

  if (skill.importance) {
    const importanceKey = skill.importance.toLowerCase();
    if (importanceKey === "critical") {
      weight = IMPORTANCE_WEIGHTS.critical;
    } else if (importanceKey === "important") {
      weight = IMPORTANCE_WEIGHTS.important;
    } else if (
      importanceKey === "nice-to-have" ||
      importanceKey === "optional"
    ) {
      weight = IMPORTANCE_WEIGHTS["nice-to-have"];
    }
  }

  // Return the skill with the calculated weight
  return {
    ...skill,
    weight,
  };
}

/**
 * Apply weights to an array of skills
 * @param skills Array of skill objects
 * @returns Array of skills with weights
 */
export function applyWeightsToSkills(skills: WeightedSkill[]): WeightedSkill[] {
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills.map(applyWeightToSkill);
}

/**
 * Calculate a weighted match percentage based on matched skills and their importance
 * @param matchedSkills Array of matched skills with potentially importance levels
 * @param requiredSkills Array of required skills with importance levels
 * @returns Weighted match percentage (0-100)
 */
export function calculateWeightedMatchPercentage(
  matchedSkills: WeightedSkill[],
  requiredSkills: WeightedSkill[],
): number {
  // If weighting is disabled or data is invalid, calculate simple match percentage
  if (
    !SKILL_WEIGHTING_ENABLED ||
    !Array.isArray(matchedSkills) ||
    !Array.isArray(requiredSkills) ||
    requiredSkills.length === 0
  ) {
    return (matchedSkills.length / Math.max(1, requiredSkills.length)) * 100;
  }

  // Apply weights to skills
  const weightedMatchedSkills = applyWeightsToSkills(matchedSkills);
  const weightedRequiredSkills = applyWeightsToSkills(requiredSkills);

  // Calculate total weight of required skills
  const totalRequiredWeight = weightedRequiredSkills.reduce(
    (sum, skill) => sum + (skill.weight || 1),
    0,
  );

  // Calculate sum of weights of matched skills
  let totalMatchedWeight = 0;

  // For each matched skill
  weightedMatchedSkills.forEach((matchedSkill) => {
    // Find the corresponding required skill by name
    const requiredSkill = weightedRequiredSkills.find(
      (reqSkill) =>
        reqSkill.skill.toLowerCase() === matchedSkill.skill.toLowerCase(),
    );

    // If found, add its weight to the total
    if (requiredSkill) {
      totalMatchedWeight += requiredSkill.weight || 1;

      // Apply match percentage if available (partial matches)
      if (matchedSkill.matchPercentage !== undefined) {
        totalMatchedWeight *= matchedSkill.matchPercentage / 100;
      }
    }
  });

  // Calculate weighted match percentage
  const weightedPercentage = (totalMatchedWeight / totalRequiredWeight) * 100;

  // Return a value between 0-100
  return Math.min(100, Math.max(0, Math.round(weightedPercentage)));
}

/**
 * Helper function to log information about skill weighting
 */
export function logWeightingInfo(message: string): void {
  console.log(
    `[SKILL_WEIGHTER] ${message} (enabled=${SKILL_WEIGHTING_ENABLED})`,
  );
}
