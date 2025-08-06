import { logger } from "./logger";
import {
  calculateSemanticSimilarity,
  cosineSimilarity,
  generateEmbedding,
} from "./embeddings";
import {
  normalizeSkillWithHierarchy,
  findRelatedSkills,
  extractSkillsWithESCO,
  getEnhancedSkills,
} from "./skill-hierarchy";
import { scoreExperienceEnhanced } from "./enhanced-experience-matching";
import stringSimilarity from "string-similarity";

// Type definitions for scoring system
interface SkillBreakdown {
  skill: string;
  matched: boolean;
  required: boolean;
  score?: number;
}

interface MatchResult {
  breakdown: SkillBreakdown[];
  score?: number;
  explanation?: string;
}

// Enhanced scoring weights - configurable per job
export interface ScoringWeights {
  skills: number;
  experience: number;
  education: number;
  semantic: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  skills: 0.50, // 50% - Most important (research-backed optimal range 45-50%)
  experience: 0.28, // 28% - Important but reduced based on research findings (target 25-30%)
  education: 0.15, // 15% - Important (research-backed optimal range 15-20%)
  semantic: 0.07, // 7% - Context understanding re-enabled (research target 10-15%, starting conservative)
};

// Scoring rubrics for consistent evaluation
export const ENHANCED_SCORING_RUBRICS = {
  SKILL_MATCH: {
    EXACT_MATCH: 100,
    STRONG_RELATED: 90,
    MODERATELY_RELATED: 70,
    WEAK_RELATED: 50,
    SEMANTIC_MATCH: 60,
    NO_MATCH: 0,
  },
  EXPERIENCE: {
    EXCEEDS_REQUIREMENT: 100,
    MEETS_REQUIREMENT: 90,
    CLOSE_TO_REQUIREMENT: 70,
    BELOW_REQUIREMENT: 40,
    SIGNIFICANTLY_BELOW: 20,
  },
  EDUCATION: {
    ADVANCED_DEGREE: 100,
    BACHELOR_DEGREE: 80,
    ASSOCIATE_DEGREE: 60,
    CERTIFICATION: 50,
    SELF_TAUGHT: 40,
    NO_FORMAL: 20,
  },
  SEMANTIC: {
    HIGH_SIMILARITY: 100,
    MODERATE_SIMILARITY: 70,
    LOW_SIMILARITY: 40,
    NO_SIMILARITY: 0,
  },
};

export interface EnhancedMatchResult {
  totalScore: number;
  dimensionScores: {
    skills: number;
    experience: number;
    education: number;
    semantic: number;
    overall: number;
  };
  confidence: number;
  explanation: {
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
  };
  skillBreakdown: Array<{
    skill: string;
    required: boolean;
    matched: boolean;
    matchType: "exact" | "related" | "semantic" | "none";
    score: number;
    category?: string;
  }>;
}

/**
 * Enhanced skill matching with hierarchy and semantic understanding
 */
export async function matchSkillsEnhanced(
  resumeSkills: string[],
  jobSkills: string[],
): Promise<{
  score: number;
  breakdown: Array<{
    skill: string;
    required: boolean;
    matched: boolean;
    matchType: "exact" | "related" | "semantic" | "none";
    score: number;
    category?: string;
  }>;
}> {
  const skillBreakdown: Array<{
    skill: string;
    required: boolean;
    matched: boolean;
    matchType: "exact" | "related" | "semantic" | "none";
    score: number;
    category?: string;
  }> = [];

  let totalScore = 0;
  let maxPossibleScore = 0;

  // Normalize all skills
  const normalizedResumeSkills = await Promise.all(
    resumeSkills.map(async (skill) => {
      const normalized = await normalizeSkillWithHierarchy(skill);
      return {
        original: skill,
        ...normalized,
      };
    }),
  );

  const normalizedJobSkills = await Promise.all(
    jobSkills.map(async (skill) => {
      const normalized = await normalizeSkillWithHierarchy(skill);
      return {
        original: skill,
        ...normalized,
      };
    }),
  );

  // Match each required job skill
  for (const jobSkill of normalizedJobSkills) {
    maxPossibleScore += 100;
    let bestMatch: {
      matched: boolean;
      matchType: "exact" | "related" | "semantic" | "none";
      score: number;
      category?: string;
    } = {
      matched: false,
      matchType: "none",
      score: 0,
      category: jobSkill.category,
    };

    // 1. Exact match
    const exactMatch = normalizedResumeSkills.find(
      (resumeSkill) =>
        resumeSkill.normalized.toLowerCase() ===
        jobSkill.normalized.toLowerCase(),
    );
    if (exactMatch) {
      bestMatch = {
        matched: true,
        matchType: "exact",
        score: ENHANCED_SCORING_RUBRICS.SKILL_MATCH.EXACT_MATCH,
        category: jobSkill.category,
      };
    } else {
      // 2. Related skills match
      const relatedSkills = await findRelatedSkills(jobSkill.normalized, 10);
      const relatedMatch = normalizedResumeSkills.find((resumeSkill) =>
        relatedSkills.some(
          (related) =>
            related.skill.toLowerCase() ===
              resumeSkill.normalized.toLowerCase() && related.similarity > 0.7,
        ),
      );

      if (relatedMatch) {
        const relation = relatedSkills.find(
          (r) =>
            r.skill.toLowerCase() === relatedMatch.normalized.toLowerCase(),
        );
        const score =
          relation!.similarity > 0.9
            ? ENHANCED_SCORING_RUBRICS.SKILL_MATCH.STRONG_RELATED
            : ENHANCED_SCORING_RUBRICS.SKILL_MATCH.MODERATELY_RELATED;

        bestMatch = {
          matched: true,
          matchType: "related",
          score: score,
          category: jobSkill.category,
        };
      } else {
        // 3. Semantic similarity fallback with parallel embedding generation
        let bestSemanticScore = 0;
        try {
          // Generate job skill embedding once
          const jobEmbedding = await generateEmbedding(jobSkill.normalized);
          
          // Generate all resume skill embeddings in parallel
          const resumeEmbeddingPromises = normalizedResumeSkills.map(async (resumeSkill) => {
            try {
              const embedding = await generateEmbedding(resumeSkill.normalized);
              return { skill: resumeSkill, embedding };
            } catch (error) {
              logger.warn("Resume skill embedding generation failed:", {
                skill: resumeSkill.normalized,
                error: error instanceof Error ? error.message : "Unknown error"
              });
              return { skill: resumeSkill, embedding: null };
            }
          });
          
          const resumeEmbeddings = await Promise.all(resumeEmbeddingPromises);
          
          // Calculate similarities in parallel
          for (const { skill: resumeSkill, embedding: resumeEmbedding } of resumeEmbeddings) {
            if (!resumeEmbedding) continue;
            
            try {
              const similarity = cosineSimilarity(jobEmbedding, resumeEmbedding);
              
              if (similarity > bestSemanticScore && similarity > 0.6) {
                bestSemanticScore = similarity;
                bestMatch = {
                  matched: true,
                  matchType: "semantic",
                  score: Math.round(
                    similarity * ENHANCED_SCORING_RUBRICS.SKILL_MATCH.SEMANTIC_MATCH,
                  ),
                  category: jobSkill.category,
                };
              }
            } catch (error) {
              logger.warn("Semantic similarity calculation failed:", {
                jobSkill: jobSkill.normalized,
                resumeSkill: resumeSkill.normalized,
                error: error instanceof Error ? error.message : "Unknown error"
              });
            }
          }
        } catch (error) {
          logger.warn("Job skill embedding generation failed:", {
            skill: jobSkill.normalized,
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    }

    skillBreakdown.push({
      skill: jobSkill.normalized,
      required: true,
      matched: bestMatch.matched,
      matchType: bestMatch.matchType,
      score: bestMatch.score,
      category: bestMatch.category,
    });

    totalScore += bestMatch.score;
  }

  // Add bonus for extra relevant skills
  const unmatchedResumeSkills = normalizedResumeSkills.filter(
    (resumeSkill) =>
      !normalizedJobSkills.some(
        (jobSkill) =>
          jobSkill.normalized.toLowerCase() ===
          resumeSkill.normalized.toLowerCase(),
      ),
  );

  for (const extraSkill of unmatchedResumeSkills.slice(0, 5)) {
    // Limit bonus skills
    skillBreakdown.push({
      skill: extraSkill.normalized,
      required: false,
      matched: true,
      matchType: "exact",
      score: 10, // Bonus points
      category: extraSkill.category,
    });
    totalScore += 10;
    maxPossibleScore += 10;
  }

  // Robust score calculation with proper edge case handling
  let finalScore = 0;
  
  if (maxPossibleScore > 0) {
    // Normal case: calculate percentage score
    finalScore = (totalScore / maxPossibleScore) * 100;
    
    // Validate the calculation result
    if (!isFinite(finalScore) || isNaN(finalScore)) {
      logger.warn("Invalid score calculation detected", {
        totalScore,
        maxPossibleScore,
        calculatedScore: finalScore,
      });
      finalScore = 0;
    }
  } else if (normalizedJobSkills.length === 0) {
    // Edge case: no job skills to match against
    logger.warn("No job skills provided for matching");
    finalScore = 0;
  } else {
    // Edge case: job skills exist but maxPossibleScore is 0 (shouldn't happen in normal flow)
    logger.warn("Zero max possible score with existing job skills", {
      jobSkillsCount: normalizedJobSkills.length,
      totalScore,
    });
    finalScore = 0;
  }

  // Single clamping with validation (removing double clamping anti-pattern)
  const clampedScore = Math.min(100, Math.max(0, finalScore));
  
  return {
    score: clampedScore,
    breakdown: skillBreakdown,
  };
}

/**
 * Enhanced experience scoring
 */
export function scoreExperience(
  resumeExperience: string,
  jobExperience: string,
): { score: number; explanation: string } {
  if (!resumeExperience || !jobExperience) {
    return { score: 50, explanation: "Experience information incomplete" };
  }

  const resumeText = resumeExperience.toLowerCase();
  const jobText = jobExperience.toLowerCase();

  // Extract years from experience descriptions
  const resumeYears = extractYearsFromText(resumeText);
  const requiredYears = extractYearsFromText(jobText);

  if (resumeYears >= 0 && requiredYears >= 0) {
    if (resumeYears >= requiredYears * 1.5) {
      return {
        score: ENHANCED_SCORING_RUBRICS.EXPERIENCE.EXCEEDS_REQUIREMENT,
        explanation: `Candidate has ${resumeYears} years vs ${requiredYears} required - exceeds expectations`,
      };
    } else if (resumeYears >= requiredYears) {
      return {
        score: ENHANCED_SCORING_RUBRICS.EXPERIENCE.MEETS_REQUIREMENT,
        explanation: `Candidate has ${resumeYears} years vs ${requiredYears} required - meets requirement`,
      };
    } else if (resumeYears >= requiredYears * 0.7) {
      return {
        score: ENHANCED_SCORING_RUBRICS.EXPERIENCE.CLOSE_TO_REQUIREMENT,
        explanation: `Candidate has ${resumeYears} years vs ${requiredYears} required - close to requirement`,
      };
    } else {
      return {
        score: ENHANCED_SCORING_RUBRICS.EXPERIENCE.BELOW_REQUIREMENT,
        explanation: `Candidate has ${resumeYears} years vs ${requiredYears} required - below requirement`,
      };
    }
  }

  // Fallback to text similarity
  const similarity = stringSimilarity.compareTwoStrings(resumeText, jobText);
  const score = Math.round(similarity * 100);

  return {
    score: Math.max(20, Math.min(80, score)),
    explanation: `Experience match based on description similarity: ${Math.round(similarity * 100)}%`,
  };
}

/**
 * Enhanced education scoring
 */
export function scoreEducation(
  resumeEducation: string,
  jobEducation?: string,
): { score: number; explanation: string } {
  if (!resumeEducation) {
    return { score: 20, explanation: "No education information provided" };
  }

  const education = resumeEducation.toLowerCase();

  // Check for degree levels
  if (education.includes("phd") || education.includes("doctorate")) {
    return {
      score: ENHANCED_SCORING_RUBRICS.EDUCATION.ADVANCED_DEGREE,
      explanation: "PhD/Doctorate degree - highest education level",
    };
  }
  if (education.includes("master") || education.includes("mba")) {
    return {
      score: ENHANCED_SCORING_RUBRICS.EDUCATION.ADVANCED_DEGREE,
      explanation: "Master's degree - advanced education level",
    };
  }
  if (
    education.includes("bachelor") ||
    education.includes("b.s") ||
    education.includes("b.a")
  ) {
    return {
      score: ENHANCED_SCORING_RUBRICS.EDUCATION.BACHELOR_DEGREE,
      explanation: "Bachelor's degree - standard education level",
    };
  }
  if (education.includes("associate") || education.includes("diploma")) {
    return {
      score: ENHANCED_SCORING_RUBRICS.EDUCATION.ASSOCIATE_DEGREE,
      explanation: "Associate degree/Diploma - foundational education",
    };
  }
  if (education.includes("certification") || education.includes("certified")) {
    return {
      score: ENHANCED_SCORING_RUBRICS.EDUCATION.CERTIFICATION,
      explanation: "Professional certifications - specialized training",
    };
  }

  return {
    score: ENHANCED_SCORING_RUBRICS.EDUCATION.SELF_TAUGHT,
    explanation: "Alternative education/self-taught background",
  };
}

/**
 * ESCO-Enhanced scoring function
 * Uses ESCO taxonomy for improved skill matching
 */
export async function calculateEnhancedMatchWithESCO(
  resumeData: {
    skills: string[];
    experience: string;
    education: string;
    content: string;
  },
  jobData: {
    skills: string[];
    experience: string;
    description: string;
  },
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): Promise<EnhancedMatchResult> {
  try {
    // Validate scoring weights sum to approximately 1.0
    const weightSum = weights.skills + weights.experience + weights.education + weights.semantic;
    if (Math.abs(weightSum - 1.0) > 0.01) {
      logger.warn('Scoring weights do not sum to 1.0', {
        weights,
        sum: weightSum,
        difference: Math.abs(weightSum - 1.0)
      });
    }
    
    logger.info('Starting ESCO-enhanced match calculation', {
      resumeSkills: resumeData.skills.length,
      jobSkills: jobData.skills.length,
      hasContent: !!(resumeData.content && jobData.description),
      resumeContentLength: resumeData.content?.length || 0,
      jobDescriptionLength: jobData.description?.length || 0,
      scoringWeights: weights
    });

    // 1. ESCO-Enhanced skill extraction and matching
    logger.info('Calling ESCO skill extraction...');
    const [resumeESCO, jobESCO] = await Promise.all([
      extractSkillsWithESCO(resumeData.content).catch(error => {
        logger.error('Resume ESCO extraction failed:', error);
        return { skills: [], escoSkills: [], pharmaRelated: false, categories: [] };
      }),
      extractSkillsWithESCO(jobData.description).catch(error => {
        logger.error('Job ESCO extraction failed:', error);
        return { skills: [], escoSkills: [], pharmaRelated: false, categories: [] };
      })
    ]);

    // Combine traditional skills with ESCO skills
    const enhancedResumeSkills = [...new Set([
      ...resumeData.skills,
      ...resumeESCO.skills
    ])];

    const enhancedJobSkills = [...new Set([
      ...jobData.skills,
      ...jobESCO.skills
    ])];

    logger.info('ESCO skill enhancement completed', {
      originalResumeSkills: resumeData.skills.length,
      enhancedResumeSkills: enhancedResumeSkills.length,
      originalJobSkills: jobData.skills.length,
      enhancedJobSkills: enhancedJobSkills.length,
      resumePharmaRelated: resumeESCO.pharmaRelated,
      jobPharmaRelated: jobESCO.pharmaRelated
    });

    // 2. Enhanced skill matching with ESCO skills
    logger.info('Starting enhanced skill matching...');
    const skillMatch = await matchSkillsEnhanced(
      enhancedResumeSkills,
      enhancedJobSkills,
    ).catch(error => {
      logger.error('Enhanced skill matching failed:', error);
      return { score: 50, breakdown: [] };
    });

    // 3. Enhanced experience scoring
    logger.info('Starting enhanced experience scoring...');
    const experienceMatch = await scoreExperienceEnhanced(
      resumeData.experience,
      jobData.experience,
    ).catch(error => {
      logger.error('Enhanced experience scoring failed:', error);
      return { score: 50, explanation: 'Experience scoring failed' };
    });

    // 4. Education scoring
    logger.info('Starting education scoring...');
    const educationMatch = scoreEducation(resumeData.education);

    // 5. Semantic similarity (keeping minimal weight)
    logger.info('Starting semantic similarity calculation...');
    const semanticScore = await calculateSemanticSimilarity(
      resumeData.content,
      jobData.description,
    ).catch(error => {
      logger.error('Semantic similarity calculation failed:', error);
      return 50;
    });

    // 6. Pharma domain bonus
    let pharmaBonus = 0;
    if (resumeESCO.pharmaRelated && jobESCO.pharmaRelated) {
      pharmaBonus = 5; // 5% bonus for pharma-pharma matches
      logger.info('Applied pharma domain matching bonus', { bonus: pharmaBonus });
    }

    const baseScore =
      skillMatch.score * weights.skills +
      experienceMatch.score * weights.experience +
      educationMatch.score * weights.education +
      semanticScore * weights.semantic;

    const totalScore = Math.min(100, baseScore + pharmaBonus);

    // Calculate weighted total
    const dimensionScores = {
      skills: skillMatch.score,
      experience: experienceMatch.score,
      education: educationMatch.score,
      semantic: semanticScore,
      overall: Math.round(totalScore),
    };

    // Calculate confidence based on data quality
    const confidence = calculateConfidence({
      hasSkills: resumeData.skills.length > 0,
      hasExperience: !!resumeData.experience,
      hasEducation: !!resumeData.education,
      contentLength: resumeData.content.length,
      skillMatchQuality:
        skillMatch.breakdown.filter((s) => s.matched).length /
        Math.max(skillMatch.breakdown.length, 1),
    });

    // Generate explanations
    const explanation = generateExplanation(
      skillMatch,
      experienceMatch,
      educationMatch,
      semanticScore,
    );

    return {
      totalScore: Math.round(totalScore),
      dimensionScores,
      confidence,
      explanation,
      skillBreakdown: skillMatch.breakdown,
    };
  } catch (error) {
    logger.error("Error in enhanced scoring calculation:", {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      resumeSkillsLength: resumeData.skills?.length || 0,
      jobSkillsLength: jobData.skills?.length || 0,
      hasResumeContent: !!resumeData.content,
      hasJobDescription: !!jobData.description
    });

    // Fallback scoring
    return {
      totalScore: 50,
      dimensionScores: {
        skills: 50,
        experience: 50,
        education: 50,
        semantic: 50,
        overall: 50,
      },
      confidence: 0.3,
      explanation: {
        strengths: ["Resume analysis completed"],
        weaknesses: ["Enhanced scoring temporarily unavailable: " + (error instanceof Error ? error.message : 'Unknown error')],
        recommendations: ["Please try again later"],
      },
      skillBreakdown: [],
    };
  }
}

/**
 * Main enhanced scoring function (original - kept for backward compatibility)
 */
export async function calculateEnhancedMatch(
  resumeData: {
    skills: string[];
    experience: string;
    education: string;
    content: string;
  },
  jobData: {
    skills: string[];
    experience: string;
    description: string;
  },
  weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS,
): Promise<EnhancedMatchResult> {
  // For now, redirect to ESCO-enhanced version for better results
  return calculateEnhancedMatchWithESCO(resumeData, jobData, weights);
}

/**
 * Extract years of experience from text
 */
function extractYearsFromText(text: string): number {
  const patterns = [
    /(\d+)\+?\s*years?\s*(?:of\s*)?experience/i,
    /(\d+)\+?\s*years?\s*in/i,
    /(\d+)\+?\s*yrs?\s*(?:of\s*)?experience/i,
    /experience:\s*(\d+)\+?\s*years?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1]);
    }
  }

  return -1; // No years found
}

/**
 * Calculate confidence score based on data quality
 */
function calculateConfidence(factors: {
  hasSkills: boolean;
  hasExperience: boolean;
  hasEducation: boolean;
  contentLength: number;
  skillMatchQuality: number;
}): number {
  let confidence = 0;

  if (factors.hasSkills) confidence += 0.3;
  if (factors.hasExperience) confidence += 0.2;
  if (factors.hasEducation) confidence += 0.1;
  if (factors.contentLength > 500) confidence += 0.2;
  else if (factors.contentLength > 200) confidence += 0.1;

  confidence += factors.skillMatchQuality * 0.2;

  return Math.min(1.0, Math.max(0.1, confidence));
}

/**
 * Generate human-readable explanations
 */
function generateExplanation(
  skillMatch: { breakdown: SkillBreakdown[]; score: number },
  experienceMatch: { score: number; explanation: string },
  educationMatch: { score: number; explanation: string },
  semanticScore: number,
): {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
} {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];

  // Analyze skills
  const matchedSkills = skillMatch.breakdown.filter(
    (s: SkillBreakdown) => s.matched && s.required,
  );
  const missingSkills = skillMatch.breakdown.filter(
    (s: SkillBreakdown) => !s.matched && s.required,
  );

  if (matchedSkills.length > 0) {
    strengths.push(
      `Strong skill alignment with ${matchedSkills.length} matching requirements`,
    );
  }

  if (missingSkills.length > 0) {
    weaknesses.push(`Missing ${missingSkills.length} required skills`);
    recommendations.push(
      `Consider training in: ${missingSkills
        .slice(0, 3)
        .map((s: SkillBreakdown) => s.skill)
        .join(", ")}`,
    );
  }

  // Analyze experience
  if (experienceMatch.score >= 80) {
    strengths.push("Excellent experience alignment");
  } else if (experienceMatch.score < 50) {
    weaknesses.push("Experience level below requirements");
    recommendations.push(
      "Highlight relevant project experience and transferable skills",
    );
  }

  // Analyze semantic similarity
  if (semanticScore >= 70) {
    strengths.push("Strong contextual match with job requirements");
  } else if (semanticScore < 40) {
    weaknesses.push("Limited contextual alignment with job description");
    recommendations.push("Emphasize relevant domain experience in resume");
  }

  return { strengths, weaknesses, recommendations };
}
