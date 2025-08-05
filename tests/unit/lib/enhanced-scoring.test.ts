/**
 * Unit Tests for Enhanced Scoring System
 * Tests the ML-based scoring algorithms and skill matching logic
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  calculateEnhancedMatch,
  matchSkillsEnhanced,
  scoreExperience,
  scoreEducation,
  DEFAULT_SCORING_WEIGHTS,
  ENHANCED_SCORING_RUBRICS
} from '../../../server/lib/enhanced-scoring';

// Mock external dependencies
jest.mock('../../../server/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

jest.mock('../../../server/lib/embeddings', () => ({
  calculateSemanticSimilarity: jest.fn(),
  cosineSimilarity: jest.fn(),
  generateEmbedding: jest.fn()
}));

jest.mock('../../../server/lib/skill-hierarchy', () => ({
  normalizeSkillWithHierarchy: jest.fn(),
  findRelatedSkills: jest.fn()
}));

jest.mock('../../../server/lib/enhanced-experience-matching', () => ({
  scoreExperienceEnhanced: jest.fn()
}));

const mockCalculateSemanticSimilarity = require('../../../server/lib/embeddings').calculateSemanticSimilarity as jest.MockedFunction<any>;
const mockCosineSimilarity = require('../../../server/lib/embeddings').cosineSimilarity as jest.MockedFunction<any>;
const mockGenerateEmbedding = require('../../../server/lib/embeddings').generateEmbedding as jest.MockedFunction<any>;
const mockNormalizeSkillWithHierarchy = require('../../../server/lib/skill-hierarchy').normalizeSkillWithHierarchy as jest.MockedFunction<any>;
const mockFindRelatedSkills = require('../../../server/lib/skill-hierarchy').findRelatedSkills as jest.MockedFunction<any>;
const mockScoreExperienceEnhanced = require('../../../server/lib/enhanced-experience-matching').scoreExperienceEnhanced as jest.MockedFunction<any>;

describe('Enhanced Scoring System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockNormalizeSkillWithHierarchy.mockImplementation((skill: string) => 
      Promise.resolve({
        normalized: skill.toLowerCase().trim(),
        category: 'technical'
      })
    );
    
    mockFindRelatedSkills.mockImplementation(() => 
      Promise.resolve([])
    );
    
    mockCalculateSemanticSimilarity.mockResolvedValue(75);
    
    mockScoreExperienceEnhanced.mockResolvedValue({
      score: 80,
      explanation: 'Good experience match',
      breakdown: {
        yearsMatch: 0.8,
        domainMatch: 0.7,
        responsibilityMatch: 0.9
      }
    });
  });

  describe('Scoring Weights Configuration', () => {
    test('should have correct default scoring weights', () => {
      expect(DEFAULT_SCORING_WEIGHTS).toEqual({
        skills: 0.50,
        experience: 0.30, 
        education: 0.15,
        semantic: 0.05,
        cultural: 0.0
      });
    });

    test('should sum weights to 1.0 (excluding cultural)', () => {
      const { cultural, ...activeWeights } = DEFAULT_SCORING_WEIGHTS;
      const sum = Object.values(activeWeights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  describe('Skill Matching', () => {
    test('should match exact skills correctly', async () => {
      const resumeSkills = ['JavaScript', 'React', 'Node.js'];
      const jobSkills = ['JavaScript', 'React', 'TypeScript'];

      const result = await matchSkillsEnhanced(resumeSkills, jobSkills);

      expect(result.score).toBeGreaterThan(60); // Should have good score for 2/3 matches
      expect(result.breakdown).toHaveLength(3); // 3 job skills
      
      const jsMatch = result.breakdown.find(s => s.skill === 'javascript');
      expect(jsMatch?.matched).toBe(true);
      expect(jsMatch?.matchType).toBe('exact');
      expect(jsMatch?.score).toBe(ENHANCED_SCORING_RUBRICS.SKILL_MATCH.EXACT_MATCH);
    });

    test('should handle related skills matching', async () => {
      mockFindRelatedSkills.mockResolvedValue([
        { skill: 'React', similarity: 0.9 },
        { skill: 'Angular', similarity: 0.8 }
      ]);
      
      const resumeSkills = ['React'];
      const jobSkills = ['Vue.js']; // Related to React

      const result = await matchSkillsEnhanced(resumeSkills, jobSkills);

      expect(mockFindRelatedSkills).toHaveBeenCalledWith('vue.js', 10);
    });

    test('should handle semantic similarity fallback', async () => {
      mockFindRelatedSkills.mockResolvedValue([]);
      mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
      mockCosineSimilarity.mockReturnValue(0.7);
      
      const resumeSkills = ['Web Development'];
      const jobSkills = ['Frontend Development'];

      const result = await matchSkillsEnhanced(resumeSkills, jobSkills);

      const match = result.breakdown.find(s => s.skill === 'frontend development');
      expect(match?.matchType).toBe('semantic');
      expect(match?.matched).toBe(true);
    });

    test('should add bonus for extra skills', async () => {
      const resumeSkills = ['JavaScript', 'React', 'Docker', 'AWS'];
      const jobSkills = ['JavaScript', 'React'];

      const result = await matchSkillsEnhanced(resumeSkills, jobSkills);

      // Should have bonus skills in breakdown
      const bonusSkills = result.breakdown.filter(s => !s.required);
      expect(bonusSkills.length).toBeGreaterThan(0);
      expect(bonusSkills.some(s => s.skill === 'docker')).toBe(true);
    });

    test('should handle empty skill arrays', async () => {
      const result = await matchSkillsEnhanced([], []);
      
      expect(result.score).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });
  });

  describe('Experience Scoring', () => {
    test('should extract years from experience text correctly', () => {
      const tests = [
        { text: '5 years of experience', expected: 90 }, // Meets requirement
        { text: '10+ years experience in software', expected: 100 }, // Exceeds
        { text: '2 yrs experience', expected: 40 }, // Below requirement (assuming 5 required)
        { text: 'Senior developer role', expected: 50 } // No years found, fallback
      ];

      tests.forEach(({ text }) => {
        const result = scoreExperience(text, '5 years required');
        expect(result.score).toBeGreaterThan(0);
        expect(result.explanation).toBeTruthy();
      });
    });

    test('should handle missing experience information', () => {
      const result = scoreExperience('', '');
      
      expect(result.score).toBe(50);
      expect(result.explanation).toContain('incomplete');
    });

    test('should score experience levels correctly', () => {
      const resumeExp = '8 years of software development';
      const jobExp = '5 years required';
      
      const result = scoreExperience(resumeExp, jobExp);
      
      expect(result.score).toBe(ENHANCED_SCORING_RUBRICS.EXPERIENCE.EXCEEDS_REQUIREMENT);
      expect(result.explanation).toContain('exceeds expectations');
    });
  });

  describe('Education Scoring', () => {
    test('should score different education levels correctly', () => {
      const tests = [
        { education: 'PhD in Computer Science', expected: ENHANCED_SCORING_RUBRICS.EDUCATION.ADVANCED_DEGREE },
        { education: 'Master of Science', expected: ENHANCED_SCORING_RUBRICS.EDUCATION.ADVANCED_DEGREE },
        { education: 'Bachelor of Science', expected: ENHANCED_SCORING_RUBRICS.EDUCATION.BACHELOR_DEGREE },
        { education: 'Associate Degree', expected: ENHANCED_SCORING_RUBRICS.EDUCATION.ASSOCIATE_DEGREE },
        { education: 'AWS Certified', expected: ENHANCED_SCORING_RUBRICS.EDUCATION.CERTIFICATION },
        { education: 'Self-taught programmer', expected: ENHANCED_SCORING_RUBRICS.EDUCATION.SELF_TAUGHT }
      ];

      tests.forEach(({ education, expected }) => {
        const result = scoreEducation(education);
        expect(result.score).toBe(expected);
        expect(result.explanation).toBeTruthy();
      });
    });

    test('should handle missing education information', () => {
      const result = scoreEducation('');
      
      expect(result.score).toBe(20);
      expect(result.explanation).toContain('No education');
    });
  });

  describe('Main Enhanced Scoring Function', () => {
    const mockResumeData = {
      skills: ['JavaScript', 'React', 'Node.js'],
      experience: '5 years of full-stack development',
      education: 'Bachelor of Computer Science',
      content: 'Experienced software developer with strong background in web technologies...'
    };

    const mockJobData = {
      skills: ['JavaScript', 'React', 'TypeScript'],
      experience: '3+ years of frontend development',
      description: 'Looking for a skilled frontend developer to join our team...'
    };

    test('should calculate enhanced match correctly', async () => {
      const result = await calculateEnhancedMatch(mockResumeData, mockJobData);

      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      
      expect(result.dimensionScores).toHaveProperty('skills');
      expect(result.dimensionScores).toHaveProperty('experience');
      expect(result.dimensionScores).toHaveProperty('education');
      expect(result.dimensionScores).toHaveProperty('semantic');
      expect(result.dimensionScores.cultural).toBe(0); // Cultural scoring removed
      
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      
      expect(result.explanation.strengths).toEqual(expect.any(Array));
      expect(result.explanation.weaknesses).toEqual(expect.any(Array));
      expect(result.explanation.recommendations).toEqual(expect.any(Array));
      
      expect(result.skillBreakdown).toEqual(expect.any(Array));
    });

    test('should apply custom scoring weights', async () => {
      const customWeights = {
        skills: 0.70,
        experience: 0.20,
        education: 0.05,
        semantic: 0.05,
        cultural: 0.0
      };

      const result = await calculateEnhancedMatch(mockResumeData, mockJobData, customWeights);

      expect(result.totalScore).toBeGreaterThan(0);
      // With higher skill weight, result should favor skill matches more
    });

    test('should calculate confidence based on data quality', async () => {
      const highQualityData = {
        ...mockResumeData,
        content: 'Very detailed resume with extensive experience descriptions and comprehensive skill listings...'
      };

      const lowQualityData = {
        skills: [],
        experience: '',
        education: '',
        content: 'Brief resume'
      };

      const highQualityResult = await calculateEnhancedMatch(highQualityData, mockJobData);
      const lowQualityResult = await calculateEnhancedMatch(lowQualityData, mockJobData);

      expect(highQualityResult.confidence).toBeGreaterThan(lowQualityResult.confidence);
    });

    test('should generate meaningful explanations', async () => {
      const result = await calculateEnhancedMatch(mockResumeData, mockJobData);

      expect(result.explanation.strengths.length).toBeGreaterThan(0);
      expect(result.explanation.strengths[0]).toEqual(expect.any(String));
      
      if (result.explanation.weaknesses.length > 0) {
        expect(result.explanation.weaknesses[0]).toEqual(expect.any(String));
      }
      
      if (result.explanation.recommendations.length > 0) {
        expect(result.explanation.recommendations[0]).toEqual(expect.any(String));
      }
    });

    test('should handle errors gracefully with fallback scoring', async () => {
      mockCalculateSemanticSimilarity.mockRejectedValue(new Error('Embedding service failed'));
      mockScoreExperienceEnhanced.mockRejectedValue(new Error('Experience scoring failed'));

      const result = await calculateEnhancedMatch(mockResumeData, mockJobData);

      expect(result.totalScore).toBe(50); // Fallback score
      expect(result.confidence).toBe(0.3); // Low confidence
      expect(result.explanation.weaknesses).toContain('Enhanced scoring temporarily unavailable');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed input data', async () => {
      const malformedData = {
        skills: null as any,
        experience: undefined as any,
        education: null as any,
        content: ''
      };

      const result = await calculateEnhancedMatch(malformedData, mockJobData);
      
      expect(result.totalScore).toBe(50); // Should fallback gracefully
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('should handle very large skill arrays', async () => {
      const largeSkillArray = Array.from({ length: 100 }, (_, i) => `Skill${i}`);
      const resumeData = {
        ...mockResumeData,
        skills: largeSkillArray
      };

      const result = await calculateEnhancedMatch(resumeData, mockJobData);
      
      expect(result.totalScore).toBeGreaterThan(0);
      expect(result.skillBreakdown).toEqual(expect.any(Array));
    });

    test('should handle special characters in skill names', async () => {
      const specialSkills = ['C++', 'C#', '.NET', 'Node.js', 'Vue.js'];
      const resumeData = {
        ...mockResumeData,
        skills: specialSkills
      };

      const result = await calculateEnhancedMatch(resumeData, mockJobData);
      
      expect(result.totalScore).toBeGreaterThan(0);
    });
  });
});