/**
 * Unit Tests for Scoring Rubrics and Constants
 * Tests the scoring configuration and weightings
 */

import { describe, test, expect } from '@jest/globals';
import { 
  DEFAULT_SCORING_WEIGHTS, 
  ENHANCED_SCORING_RUBRICS
} from '../../../server/lib/enhanced-scoring';
import { HYBRID_SCORING_WEIGHTS } from '../../../server/lib/hybrid-match-analyzer';

describe('Scoring Rubrics and Weights', () => {
  describe('Default Scoring Weights', () => {
    test('should have correct weight distribution', () => {
      expect(DEFAULT_SCORING_WEIGHTS).toEqual({
        skills: 0.50,
        experience: 0.30,
        education: 0.15,
        semantic: 0.05,
        cultural: 0.0
      });
    });

    test('should sum to 1.0 (excluding cultural)', () => {
      const { cultural, ...activeWeights } = DEFAULT_SCORING_WEIGHTS;
      const sum = Object.values(activeWeights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });

    test('should prioritize skills appropriately', () => {
      expect(DEFAULT_SCORING_WEIGHTS.skills).toBeGreaterThan(DEFAULT_SCORING_WEIGHTS.experience);
      expect(DEFAULT_SCORING_WEIGHTS.experience).toBeGreaterThan(DEFAULT_SCORING_WEIGHTS.education);
      expect(DEFAULT_SCORING_WEIGHTS.education).toBeGreaterThan(DEFAULT_SCORING_WEIGHTS.semantic);
    });

    test('should have removed cultural assessment', () => {
      expect(DEFAULT_SCORING_WEIGHTS.cultural).toBe(0);
    });
  });

  describe('Hybrid Scoring Weights', () => {
    test('should match default weights', () => {
      expect(HYBRID_SCORING_WEIGHTS).toEqual(DEFAULT_SCORING_WEIGHTS);
    });
  });

  describe('Enhanced Scoring Rubrics', () => {
    test('should have skill match scoring levels', () => {
      expect(ENHANCED_SCORING_RUBRICS.SKILL_MATCH).toEqual({
        EXACT_MATCH: 100,
        STRONG_RELATED: 90,
        MODERATELY_RELATED: 70,
        WEAK_RELATED: 50,
        SEMANTIC_MATCH: 60,
        NO_MATCH: 0
      });
    });

    test('should have experience scoring levels', () => {
      expect(ENHANCED_SCORING_RUBRICS.EXPERIENCE).toEqual({
        EXCEEDS_REQUIREMENT: 100,
        MEETS_REQUIREMENT: 90,
        CLOSE_TO_REQUIREMENT: 70,
        BELOW_REQUIREMENT: 40,
        SIGNIFICANTLY_BELOW: 20
      });
    });

    test('should have education scoring levels', () => {
      expect(ENHANCED_SCORING_RUBRICS.EDUCATION).toEqual({
        ADVANCED_DEGREE: 100,
        BACHELOR_DEGREE: 80,
        ASSOCIATE_DEGREE: 60,
        CERTIFICATION: 50,
        SELF_TAUGHT: 40,
        NO_FORMAL: 20
      });
    });

    test('should have semantic scoring levels', () => {
      expect(ENHANCED_SCORING_RUBRICS.SEMANTIC).toEqual({
        HIGH_SIMILARITY: 100,
        MODERATE_SIMILARITY: 70,
        LOW_SIMILARITY: 40,
        NO_SIMILARITY: 0
      });
    });

    test('should maintain logical score ordering', () => {
      // Skills
      expect(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.EXACT_MATCH)
        .toBeGreaterThan(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.STRONG_RELATED);
      expect(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.STRONG_RELATED)
        .toBeGreaterThan(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.MODERATELY_RELATED);
      
      // Experience
      expect(ENHANCED_SCORING_RUBRICS.EXPERIENCE.EXCEEDS_REQUIREMENT)
        .toBeGreaterThan(ENHANCED_SCORING_RUBRICS.EXPERIENCE.MEETS_REQUIREMENT);
      expect(ENHANCED_SCORING_RUBRICS.EXPERIENCE.MEETS_REQUIREMENT)
        .toBeGreaterThan(ENHANCED_SCORING_RUBRICS.EXPERIENCE.CLOSE_TO_REQUIREMENT);
      
      // Education
      expect(ENHANCED_SCORING_RUBRICS.EDUCATION.ADVANCED_DEGREE)
        .toBeGreaterThan(ENHANCED_SCORING_RUBRICS.EDUCATION.BACHELOR_DEGREE);
      expect(ENHANCED_SCORING_RUBRICS.EDUCATION.BACHELOR_DEGREE)
        .toBeGreaterThan(ENHANCED_SCORING_RUBRICS.EDUCATION.ASSOCIATE_DEGREE);
    });

    test('should use reasonable score ranges', () => {
      // All skill match scores should be between 0 and 100
      Object.values(ENHANCED_SCORING_RUBRICS.SKILL_MATCH).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      // All experience scores should be between 0 and 100
      Object.values(ENHANCED_SCORING_RUBRICS.EXPERIENCE).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      // All education scores should be between 0 and 100
      Object.values(ENHANCED_SCORING_RUBRICS.EDUCATION).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Weight Configuration Validation', () => {
    test('should ensure no negative weights', () => {
      Object.values(DEFAULT_SCORING_WEIGHTS).forEach(weight => {
        expect(weight).toBeGreaterThanOrEqual(0);
      });
    });

    test('should ensure weights are reasonable proportions', () => {
      Object.values(DEFAULT_SCORING_WEIGHTS).forEach(weight => {
        expect(weight).toBeLessThanOrEqual(1.0);
      });
    });

    test('should maintain skills as primary factor', () => {
      expect(DEFAULT_SCORING_WEIGHTS.skills).toBeGreaterThanOrEqual(0.4); // At least 40%
    });

    test('should keep experience as secondary factor', () => {
      expect(DEFAULT_SCORING_WEIGHTS.experience).toBeGreaterThanOrEqual(0.2); // At least 20%
    });
  });

  describe('Configuration Consistency', () => {
    test('should maintain consistent maximum scores', () => {
      expect(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.EXACT_MATCH).toBe(100);
      expect(ENHANCED_SCORING_RUBRICS.EXPERIENCE.EXCEEDS_REQUIREMENT).toBe(100);
      expect(ENHANCED_SCORING_RUBRICS.EDUCATION.ADVANCED_DEGREE).toBe(100);
      expect(ENHANCED_SCORING_RUBRICS.SEMANTIC.HIGH_SIMILARITY).toBe(100);
    });

    test('should maintain consistent minimum scores', () => {
      expect(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.NO_MATCH).toBe(0);
      expect(ENHANCED_SCORING_RUBRICS.SEMANTIC.NO_SIMILARITY).toBe(0);
    });

    test('should provide reasonable middle-ground scores', () => {
      // Skills
      expect(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.MODERATELY_RELATED).toBe(70);
      expect(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.SEMANTIC_MATCH).toBe(60);
      
      // Experience
      expect(ENHANCED_SCORING_RUBRICS.EXPERIENCE.CLOSE_TO_REQUIREMENT).toBe(70);
      
      // Education
      expect(ENHANCED_SCORING_RUBRICS.EDUCATION.BACHELOR_DEGREE).toBe(80);
      expect(ENHANCED_SCORING_RUBRICS.EDUCATION.CERTIFICATION).toBe(50);
    });
  });
});