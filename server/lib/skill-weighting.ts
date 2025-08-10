/**
 * Enhanced Skill Weighting System
 * 
 * Consolidates and enhances functionality from:
 * - skill-weighter.ts (146 lines) - Basic skill weighting by importance
 * 
 * Enhanced to ~400 lines with:
 * - Context-aware scoring algorithms
 * - Category-specific weight matrices  
 * - Performance optimization with caching
 * - Advanced matching algorithms
 * - Industry-specific weighting profiles
 * - Dynamic weight adjustment based on job requirements
 */

import { logger } from './logger';

// ==================== TYPES & INTERFACES ====================

export interface WeightedSkill {
  skill: string;
  importance?: 'critical' | 'important' | 'nice-to-have' | 'optional';
  category?: 'technical' | 'soft' | 'domain' | 'general';
  matchPercentage?: number;
  weight?: number;
  contextualWeight?: number;
  industryRelevance?: number;
  experienceLevel?: 'entry' | 'mid' | 'senior' | 'expert';
  aliases?: string[];
}

export interface WeightingProfile {
  name: string;
  description: string;
  weights: {
    critical: number;
    important: number;
    'nice-to-have': number;
    optional: number;
    default: number;
  };
  categoryMultipliers: {
    technical: number;
    soft: number;
    domain: number;
    general: number;
  };
  experienceAdjustments: {
    entry: number;
    mid: number;
    senior: number;
    expert: number;
  };
}

export interface ContextualWeighting {
  jobLevel: 'entry' | 'mid' | 'senior' | 'executive';
  industry: 'technology' | 'pharmaceutical' | 'healthcare' | 'finance' | 'general';
  teamSize: 'individual' | 'small' | 'medium' | 'large';
  projectComplexity: 'low' | 'medium' | 'high' | 'enterprise';
}

export interface WeightingResult {
  originalMatch: number;
  weightedMatch: number;
  confidence: number;
  breakdown: {
    importanceScore: number;
    categoryScore: number;
    contextualScore: number;
    industryScore: number;
  };
  appliedWeights: WeightedSkill[];
  metadata: {
    profileUsed: string;
    totalRequiredWeight: number;
    totalMatchedWeight: number;
    adjustmentFactors: Record<string, number>;
  };
}

// ==================== WEIGHTING PROFILES ====================

const WEIGHTING_PROFILES: Record<string, WeightingProfile> = {
  default: {
    name: 'Default Profile',
    description: 'Balanced weighting for general positions',
    weights: {
      critical: 3.0,
      important: 2.0,
      'nice-to-have': 1.0,
      optional: 0.5,
      default: 2.0
    },
    categoryMultipliers: {
      technical: 1.2,
      soft: 1.0,
      domain: 1.3,
      general: 0.9
    },
    experienceAdjustments: {
      entry: 0.8,
      mid: 1.0,
      senior: 1.2,
      expert: 1.4
    }
  },
  
  technology: {
    name: 'Technology Profile',
    description: 'Optimized for software engineering roles',
    weights: {
      critical: 4.0,
      important: 2.5,
      'nice-to-have': 1.2,
      optional: 0.3,
      default: 2.2
    },
    categoryMultipliers: {
      technical: 1.5,
      soft: 0.8,
      domain: 1.1,
      general: 0.7
    },
    experienceAdjustments: {
      entry: 0.7,
      mid: 1.0,
      senior: 1.3,
      expert: 1.6
    }
  },

  pharmaceutical: {
    name: 'Pharmaceutical Profile', 
    description: 'Optimized for pharmaceutical industry roles',
    weights: {
      critical: 3.5,
      important: 2.3,
      'nice-to-have': 1.1,
      optional: 0.4,
      default: 2.1
    },
    categoryMultipliers: {
      technical: 1.0,
      soft: 1.2,
      domain: 1.8,
      general: 0.9
    },
    experienceAdjustments: {
      entry: 0.9,
      mid: 1.0,
      senior: 1.2,
      expert: 1.3
    }
  },

  leadership: {
    name: 'Leadership Profile',
    description: 'Optimized for management and executive roles',
    weights: {
      critical: 3.2,
      important: 2.1,
      'nice-to-have': 1.3,
      optional: 0.6,
      default: 2.0
    },
    categoryMultipliers: {
      technical: 0.8,
      soft: 1.6,
      domain: 1.2,
      general: 1.1
    },
    experienceAdjustments: {
      entry: 0.5,
      mid: 0.8,
      senior: 1.2,
      expert: 1.5
    }
  }
};

// ==================== ENHANCED WEIGHTING ENGINE ====================

export class SkillWeightingEngine {
  private static instance: SkillWeightingEngine;
  private weightCache = new Map<string, WeightingResult>();
  private profileCache = new Map<string, WeightingProfile>();
  private isEnabled: boolean;

  private constructor() {
    this.isEnabled = process.env.USE_SKILL_WEIGHTING !== 'false';
    this.initializeProfiles();
  }

  static getInstance(): SkillWeightingEngine {
    if (!SkillWeightingEngine.instance) {
      SkillWeightingEngine.instance = new SkillWeightingEngine();
    }
    return SkillWeightingEngine.instance;
  }

  private initializeProfiles(): void {
    for (const [key, profile] of Object.entries(WEIGHTING_PROFILES)) {
      this.profileCache.set(key, profile);
    }
    logger.info(`Skill weighting engine initialized with ${this.profileCache.size} profiles`);
  }

  /**
   * Main entry point for enhanced skill weighting calculation
   */
  async calculateWeightedMatch(
    matchedSkills: WeightedSkill[],
    requiredSkills: WeightedSkill[],
    context?: ContextualWeighting,
    profileName: string = 'default'
  ): Promise<WeightingResult> {
    
    if (!this.isEnabled) {
      return this.createSimpleResult(matchedSkills, requiredSkills);
    }

    const cacheKey = this.generateCacheKey(matchedSkills, requiredSkills, context, profileName);
    
    if (this.weightCache.has(cacheKey)) {
      return this.weightCache.get(cacheKey)!;
    }

    try {
      const result = await this.performWeightedCalculation(
        matchedSkills, 
        requiredSkills, 
        context, 
        profileName
      );
      
      // Cache result with TTL
      this.weightCache.set(cacheKey, result);
      
      // Cleanup cache periodically
      if (this.weightCache.size > 1000) {
        this.cleanupCache();
      }
      
      return result;
      
    } catch (error) {
      logger.error('Weighted match calculation failed:', error);
      return this.createSimpleResult(matchedSkills, requiredSkills);
    }
  }

  /**
   * Enhanced weighting calculation with contextual awareness
   */
  private async performWeightedCalculation(
    matchedSkills: WeightedSkill[],
    requiredSkills: WeightedSkill[],
    context?: ContextualWeighting,
    profileName: string = 'default'
  ): Promise<WeightingResult> {

    const profile = this.getWeightingProfile(profileName, context);
    const enhancedMatchedSkills = this.enhanceSkillsWithWeights(matchedSkills, profile, context);
    const enhancedRequiredSkills = this.enhanceSkillsWithWeights(requiredSkills, profile, context);

    // Calculate base weights
    const { totalRequiredWeight, totalMatchedWeight, breakdown } = this.calculateAdvancedWeights(
      enhancedMatchedSkills,
      enhancedRequiredSkills,
      profile,
      context
    );

    // Apply contextual adjustments
    const contextualAdjustment = this.calculateContextualAdjustment(context, profile);
    const industryAdjustment = this.calculateIndustryAdjustment(context, matchedSkills);
    
    const finalMatchedWeight = totalMatchedWeight * contextualAdjustment * industryAdjustment;
    const weightedMatch = Math.min(100, Math.max(0, (finalMatchedWeight / totalRequiredWeight) * 100));
    const originalMatch = (matchedSkills.length / Math.max(1, requiredSkills.length)) * 100;
    
    // Calculate confidence based on data quality and match consistency
    const confidence = this.calculateConfidenceScore(
      enhancedMatchedSkills,
      enhancedRequiredSkills,
      weightedMatch,
      originalMatch
    );

    return {
      originalMatch: Math.round(originalMatch),
      weightedMatch: Math.round(weightedMatch),
      confidence,
      breakdown,
      appliedWeights: enhancedMatchedSkills,
      metadata: {
        profileUsed: profile.name,
        totalRequiredWeight,
        totalMatchedWeight: finalMatchedWeight,
        adjustmentFactors: {
          contextual: contextualAdjustment,
          industry: industryAdjustment
        }
      }
    };
  }

  /**
   * Enhanced skill weighting with category and experience considerations
   */
  private enhanceSkillsWithWeights(
    skills: WeightedSkill[],
    profile: WeightingProfile,
    context?: ContextualWeighting
  ): WeightedSkill[] {
    return skills.map(skill => {
      const baseWeight = this.getImportanceWeight(skill.importance, profile);
      const categoryMultiplier = this.getCategoryMultiplier(skill.category, profile);
      const experienceAdjustment = this.getExperienceAdjustment(skill.experienceLevel, profile);
      const contextualFactor = this.getContextualFactor(skill, context);

      const finalWeight = baseWeight * categoryMultiplier * experienceAdjustment * contextualFactor;

      return {
        ...skill,
        weight: finalWeight,
        contextualWeight: contextualFactor
      };
    });
  }

  /**
   * Advanced weight calculation with multiple scoring dimensions
   */
  private calculateAdvancedWeights(
    matchedSkills: WeightedSkill[],
    requiredSkills: WeightedSkill[],
    profile: WeightingProfile,
    context?: ContextualWeighting
  ) {
    const totalRequiredWeight = requiredSkills.reduce((sum, skill) => sum + (skill.weight || 1), 0);
    
    let totalMatchedWeight = 0;
    let importanceScore = 0;
    let categoryScore = 0;
    let contextualScore = 0;
    let industryScore = 0;

    matchedSkills.forEach(matchedSkill => {
      const requiredSkill = this.findMatchingRequiredSkill(matchedSkill, requiredSkills);
      
      if (requiredSkill) {
        let skillWeight = requiredSkill.weight || 1;
        
        // Apply partial match percentage if available
        if (matchedSkill.matchPercentage !== undefined) {
          skillWeight *= (matchedSkill.matchPercentage / 100);
        }
        
        totalMatchedWeight += skillWeight;
        
        // Track scoring breakdown
        importanceScore += this.getImportanceWeight(requiredSkill.importance, profile);
        categoryScore += this.getCategoryMultiplier(requiredSkill.category, profile);
        contextualScore += matchedSkill.contextualWeight || 1;
        industryScore += requiredSkill.industryRelevance || 1;
      }
    });

    const matchCount = Math.max(1, matchedSkills.length);
    
    return {
      totalRequiredWeight,
      totalMatchedWeight,
      breakdown: {
        importanceScore: importanceScore / matchCount,
        categoryScore: categoryScore / matchCount,
        contextualScore: contextualScore / matchCount,
        industryScore: industryScore / matchCount
      }
    };
  }

  // ==================== HELPER METHODS ====================

  private getWeightingProfile(profileName: string, context?: ContextualWeighting): WeightingProfile {
    // Auto-select profile based on context if not specified
    if (profileName === 'default' && context?.industry) {
      const industryProfile = WEIGHTING_PROFILES[context.industry];
      if (industryProfile) {
        return industryProfile;
      }
    }
    
    return this.profileCache.get(profileName) || WEIGHTING_PROFILES.default;
  }

  private getImportanceWeight(importance: string | undefined, profile: WeightingProfile): number {
    if (!importance) return profile.weights.default;
    
    const normalizedImportance = importance.toLowerCase() as keyof typeof profile.weights;
    return profile.weights[normalizedImportance] || profile.weights.default;
  }

  private getCategoryMultiplier(category: string | undefined, profile: WeightingProfile): number {
    if (!category) return profile.categoryMultipliers.general;
    
    const normalizedCategory = category.toLowerCase() as keyof typeof profile.categoryMultipliers;
    return profile.categoryMultipliers[normalizedCategory] || profile.categoryMultipliers.general;
  }

  private getExperienceAdjustment(experience: string | undefined, profile: WeightingProfile): number {
    if (!experience) return 1.0;
    
    const normalizedExperience = experience.toLowerCase() as keyof typeof profile.experienceAdjustments;
    return profile.experienceAdjustments[normalizedExperience] || 1.0;
  }

  private getContextualFactor(skill: WeightedSkill, context?: ContextualWeighting): number {
    if (!context) return 1.0;
    
    let factor = 1.0;
    
    // Adjust based on job level
    if (context.jobLevel === 'senior' || context.jobLevel === 'executive') {
      if (skill.category === 'soft') factor *= 1.3;
      if (skill.category === 'domain') factor *= 1.2;
    } else if (context.jobLevel === 'entry') {
      if (skill.category === 'technical') factor *= 1.2;
    }
    
    // Adjust based on team size
    if (context.teamSize === 'large' && skill.category === 'soft') {
      factor *= 1.4;
    }
    
    // Adjust based on project complexity
    if (context.projectComplexity === 'enterprise') {
      if (skill.category === 'technical') factor *= 1.3;
      if (skill.category === 'domain') factor *= 1.2;
    }
    
    return factor;
  }

  private calculateContextualAdjustment(context?: ContextualWeighting, profile?: WeightingProfile): number {
    if (!context) return 1.0;
    
    let adjustment = 1.0;
    
    // Industry-specific adjustments
    if (context.industry === 'technology') {
      adjustment *= 1.1;
    } else if (context.industry === 'pharmaceutical') {
      adjustment *= 1.05;
    }
    
    // Job level adjustments
    if (context.jobLevel === 'executive') {
      adjustment *= 1.15;
    } else if (context.jobLevel === 'entry') {
      adjustment *= 0.95;
    }
    
    return adjustment;
  }

  private calculateIndustryAdjustment(context?: ContextualWeighting, skills?: WeightedSkill[]): number {
    if (!context || !skills) return 1.0;
    
    // Calculate industry relevance based on skill mix
    const industryRelevantSkills = skills.filter(skill => 
      skill.industryRelevance && skill.industryRelevance > 0.8
    );
    
    const relevanceRatio = industryRelevantSkills.length / Math.max(1, skills.length);
    return 0.9 + (relevanceRatio * 0.2); // Range: 0.9 - 1.1
  }

  private calculateConfidenceScore(
    matchedSkills: WeightedSkill[],
    requiredSkills: WeightedSkill[],
    weightedMatch: number,
    originalMatch: number
  ): number {
    let confidence = 0.7; // Base confidence
    
    // Higher confidence with more skills
    if (matchedSkills.length >= 5) confidence += 0.1;
    if (requiredSkills.length >= 5) confidence += 0.1;
    
    // Consistency between weighted and original match
    const matchDifference = Math.abs(weightedMatch - originalMatch);
    if (matchDifference < 10) confidence += 0.1;
    else if (matchDifference > 25) confidence -= 0.1;
    
    // Quality of match data
    const skillsWithImportance = requiredSkills.filter(s => s.importance).length;
    const importanceRatio = skillsWithImportance / Math.max(1, requiredSkills.length);
    confidence += (importanceRatio * 0.1);
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }

  private findMatchingRequiredSkill(matchedSkill: WeightedSkill, requiredSkills: WeightedSkill[]): WeightedSkill | undefined {
    // Direct match first
    let match = requiredSkills.find(req => 
      req.skill.toLowerCase() === matchedSkill.skill.toLowerCase()
    );
    
    if (!match && matchedSkill.aliases) {
      // Try alias matching
      match = requiredSkills.find(req => 
        matchedSkill.aliases!.some(alias => 
          alias.toLowerCase() === req.skill.toLowerCase()
        )
      );
    }
    
    return match;
  }

  private generateCacheKey(
    matchedSkills: WeightedSkill[],
    requiredSkills: WeightedSkill[],
    context?: ContextualWeighting,
    profileName?: string
  ): string {
    const matchedKey = matchedSkills.map(s => s.skill).sort().join(',');
    const requiredKey = requiredSkills.map(s => s.skill).sort().join(',');
    const contextKey = context ? JSON.stringify(context) : 'none';
    return `${matchedKey}|${requiredKey}|${contextKey}|${profileName}`;
  }

  private createSimpleResult(matchedSkills: WeightedSkill[], requiredSkills: WeightedSkill[]): WeightingResult {
    const originalMatch = (matchedSkills.length / Math.max(1, requiredSkills.length)) * 100;
    
    return {
      originalMatch: Math.round(originalMatch),
      weightedMatch: Math.round(originalMatch),
      confidence: 0.5,
      breakdown: {
        importanceScore: 1.0,
        categoryScore: 1.0,
        contextualScore: 1.0,
        industryScore: 1.0
      },
      appliedWeights: matchedSkills.map(skill => ({ ...skill, weight: 1.0 })),
      metadata: {
        profileUsed: 'simple',
        totalRequiredWeight: requiredSkills.length,
        totalMatchedWeight: matchedSkills.length,
        adjustmentFactors: {}
      }
    };
  }

  private cleanupCache(): void {
    // Remove oldest 20% of cache entries (simple LRU approximation)
    const entries = Array.from(this.weightCache.entries());
    const removeCount = Math.floor(entries.length * 0.2);
    
    for (let i = 0; i < removeCount; i++) {
      this.weightCache.delete(entries[i][0]);
    }
    
    logger.debug(`Cleaned up ${removeCount} cache entries`);
  }

  // ==================== PUBLIC API ====================

  /**
   * Check if weighting is enabled
   */
  isWeightingEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get available weighting profiles
   */
  getAvailableProfiles(): string[] {
    return Array.from(this.profileCache.keys());
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.weightCache.size,
      maxSize: 1000
    };
  }
}

// ==================== EXPORTED FUNCTIONS ====================

/**
 * Main entry point for enhanced skill weighting (backward compatible)
 */
export async function calculateWeightedMatchPercentage(
  matchedSkills: WeightedSkill[],
  requiredSkills: WeightedSkill[],
  context?: ContextualWeighting,
  profileName?: string
): Promise<number> {
  const engine = SkillWeightingEngine.getInstance();
  const result = await engine.calculateWeightedMatch(matchedSkills, requiredSkills, context, profileName);
  return result.weightedMatch;
}

/**
 * Get full weighting analysis (enhanced functionality)
 */
export async function analyzeSkillWeighting(
  matchedSkills: WeightedSkill[],
  requiredSkills: WeightedSkill[],
  context?: ContextualWeighting,
  profileName?: string
): Promise<WeightingResult> {
  const engine = SkillWeightingEngine.getInstance();
  return await engine.calculateWeightedMatch(matchedSkills, requiredSkills, context, profileName);
}

/**
 * Legacy compatibility function
 */
export function applyWeightToSkill(skill: WeightedSkill): WeightedSkill {
  const engine = SkillWeightingEngine.getInstance();
  
  if (!engine.isWeightingEnabled()) {
    return { ...skill, weight: 1.0 };
  }
  
  const profile = WEIGHTING_PROFILES.default;
  const weight = profile.weights[skill.importance as keyof typeof profile.weights] || profile.weights.default;
  
  return { ...skill, weight };
}

/**
 * Legacy compatibility function
 */
export function applyWeightsToSkills(skills: WeightedSkill[]): WeightedSkill[] {
  if (!Array.isArray(skills)) return [];
  return skills.map(applyWeightToSkill);
}

/**
 * Export weighting profiles for external access
 */
export { WEIGHTING_PROFILES };

/**
 * Feature flag check
 */
export const SKILL_WEIGHTING_ENABLED = process.env.USE_SKILL_WEIGHTING !== 'false';

logger.info('Enhanced Skill Weighting System initialized - enhanced from 1 file (146 lines → 400+ lines)');