/**
 * Unit tests for ML Score Extraction Utilities
 * Tests the newly implemented ML score extraction functions
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { 
  extractMLScores, 
  extractConfidenceMetrics, 
  extractProviderMetrics,
  HybridMatchResult 
} from '../../../server/lib/hybrid-match-analyzer';
import { logger } from '../../../server/lib/logger';

// Mock logger
jest.mock('../../../server/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('ML Score Extraction Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Mock hybrid match result for testing
  const createMockResult = (overrides: Partial<HybridMatchResult> = {}): HybridMatchResult => ({
    matchPercentage: 75,
    matchedSkills: ['JavaScript', 'React', 'Node.js'],
    missingSkills: ['Python', 'AWS'],
    candidateStrengths: ['Strong frontend skills'],
    candidateWeaknesses: ['Limited backend experience'],
    recommendations: ['Learn Python'],
    reasoning: 'Good overall match with strong technical skills and relevant experience.',
    confidence: 0.8,
    analysisMethod: 'groq',
    actualWeights: {
      skills: 0.6,
      experience: 0.3,
      education: 0.1,
      ml: 0.4,
      llm: 0.6
    },
    biasDetection: {
      hasBias: false,
      biasScore: 5,
      detectedBiases: [],
      recommendations: [],
      fairnessMetrics: {
        demographicParity: 0.95,
        equalizedOdds: 0.9,
        calibration: 0.85
      },
      explanation: 'No significant bias detected'
    },
    matchInsights: null,
    ...overrides
  });

  describe('extractMLScores()', () => {
    it('should extract all score types from result', () => {
      const result = createMockResult();
      const aiProvider = 'groq';
      
      const scores = extractMLScores(result, aiProvider);
      
      expect(scores).toHaveProperty('mlScore');
      expect(scores).toHaveProperty('llmScore');
      expect(scores).toHaveProperty('biasAdjustedLLMScore');
    });

    it('should calculate LLM score from match percentage', () => {
      const result = createMockResult({ matchPercentage: 85 });
      
      const scores = extractMLScores(result, 'groq');
      
      expect(scores.llmScore).toBe(85);
    });

    it('should calculate ML score from quantifiable factors', () => {
      const result = createMockResult({
        matchedSkills: ['JavaScript', 'React'],
        missingSkills: ['Python'],
        confidence: 0.9,
        actualWeights: {
          skills: 0.6,
          experience: 0.3,
          education: 0.1,
          ml: 0.4,
          llm: 0.6
        }
      });
      
      const scores = extractMLScores(result, 'groq');
      
      expect(scores.mlScore).toBeGreaterThan(0);
      expect(scores.mlScore).toBeLessThanOrEqual(100);
      expect(typeof scores.mlScore).toBe('number');
    });

    it('should calculate bias-adjusted LLM score', () => {
      const result = createMockResult({
        matchPercentage: 80,
        biasDetection: {
          hasBias: true,
          biasScore: 20,
          detectedBiases: [],
          recommendations: [],
          fairnessMetrics: {
            demographicParity: 0.8,
            equalizedOdds: 0.8,
            calibration: 0.8
          },
          explanation: 'Some bias detected'
        }
      });
      
      const scores = extractMLScores(result, 'groq');
      
      expect(scores.biasAdjustedLLMScore).toBeLessThan(scores.llmScore!);
      expect(scores.biasAdjustedLLMScore).toBeGreaterThanOrEqual(0);
      expect(scores.biasAdjustedLLMScore).toBeLessThanOrEqual(100);
    });

    it('should handle missing skills gracefully', () => {
      const result = createMockResult({
        matchedSkills: [],
        missingSkills: undefined,
        actualWeights: undefined
      });
      
      const scores = extractMLScores(result, 'openai');
      
      expect(scores.mlScore).toBeNull();
      expect(scores.llmScore).toBe(result.matchPercentage);
    });

    it('should log debug information', () => {
      const result = createMockResult();
      
      extractMLScores(result, 'anthropic');
      
      expect(logger.debug).toHaveBeenCalledWith('ML scores extracted',
        expect.objectContaining({
          aiProvider: 'anthropic',
          mlScore: expect.any(Number),
          llmScore: expect.any(Number),
          hasBias: expect.any(Boolean)
        })
      );
    });

    it('should handle extraction errors gracefully', () => {
      const invalidResult = null as any;
      
      const scores = extractMLScores(invalidResult, 'groq');
      
      expect(scores.mlScore).toBeNull();
      expect(scores.llmScore).toBeUndefined();
      expect(scores.biasAdjustedLLMScore).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith('Failed to extract ML scores',
        expect.objectContaining({
          aiProvider: 'groq',
          error: expect.any(String)
        })
      );
    });
  });

  describe('extractConfidenceMetrics()', () => {
    it('should extract all confidence metric types', () => {
      const result = createMockResult();
      
      const metrics = extractConfidenceMetrics(result, 'groq');
      
      expect(metrics).toHaveProperty('overallConfidence');
      expect(metrics).toHaveProperty('skillsConfidence');
      expect(metrics).toHaveProperty('reasoningQuality');
    });

    it('should use result confidence for overall confidence', () => {
      const result = createMockResult({ confidence: 0.85 });
      
      const metrics = extractConfidenceMetrics(result, 'groq');
      
      expect(metrics.overallConfidence).toBe(0.85);
    });

    it('should calculate skills confidence from match ratios', () => {
      const result = createMockResult({
        matchedSkills: ['JavaScript', 'React'],
        missingSkills: ['Python']
      });
      
      const metrics = extractConfidenceMetrics(result, 'groq');
      
      // 2 matched / (2 matched + 1 missing) = 2/3 ≈ 0.67
      expect(metrics.skillsConfidence).toBeCloseTo(2/3, 2);
    });

    it('should calculate reasoning quality from text length', () => {
      const shortReasoning = createMockResult({ 
        reasoning: 'Short analysis' 
      });
      const longReasoning = createMockResult({ 
        reasoning: 'A very detailed and comprehensive analysis that explains the candidate match in great depth with specific examples and thorough evaluation of skills, experience, and overall fit. This detailed reasoning demonstrates high quality analysis with extensive consideration of multiple factors and provides actionable insights for both the employer and candidate. The analysis covers technical competencies, soft skills alignment, cultural fit indicators, and growth potential while maintaining objectivity and fairness throughout the evaluation process.'
      });
      
      const shortMetrics = extractConfidenceMetrics(shortReasoning, 'groq');
      const longMetrics = extractConfidenceMetrics(longReasoning, 'groq');
      
      expect(longMetrics.reasoningQuality).toBeGreaterThan(shortMetrics.reasoningQuality);
      expect(longMetrics.reasoningQuality).toBeLessThanOrEqual(1.0);
    });

    it('should fallback to overall confidence when skills data missing', () => {
      const result = createMockResult({
        matchedSkills: undefined,
        missingSkills: undefined,
        confidence: 0.75
      });
      
      const metrics = extractConfidenceMetrics(result, 'groq');
      
      expect(metrics.skillsConfidence).toBe(0.75);
    });

    it('should log debug information', () => {
      const result = createMockResult();
      
      extractConfidenceMetrics(result, 'openai');
      
      expect(logger.debug).toHaveBeenCalledWith('Confidence metrics extracted',
        expect.objectContaining({
          aiProvider: 'openai',
          overallConfidence: expect.any(Number),
          skillsConfidence: expect.any(Number),
          reasoningQuality: expect.any(Number)
        })
      );
    });

    it('should handle extraction errors gracefully', () => {
      const invalidResult = null as any;
      
      const metrics = extractConfidenceMetrics(invalidResult, 'anthropic');
      
      expect(metrics.overallConfidence).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith('Failed to extract confidence metrics',
        expect.objectContaining({
          aiProvider: 'anthropic'
        })
      );
    });
  });

  describe('extractProviderMetrics()', () => {
    it('should extract provider performance metrics', () => {
      const processingTime = 1500;
      const aiProvider = 'groq';
      
      const metrics = extractProviderMetrics(processingTime, aiProvider);
      
      expect(metrics).toHaveProperty('provider');
      expect(metrics).toHaveProperty('responseTime');
      expect(metrics).toHaveProperty('efficiency');
      expect(metrics.provider).toBe('groq');
      expect(metrics.responseTime).toBe(1500);
    });

    it('should rate Groq as high efficiency for fast responses', () => {
      const fastTime = 1000;
      
      const metrics = extractProviderMetrics(fastTime, 'groq');
      
      expect(metrics.efficiency).toBe('high');
    });

    it('should rate OpenAI efficiency appropriately', () => {
      const fastTime = 2000;
      const mediumTime = 6000;
      const slowTime = 12000;
      
      const fastMetrics = extractProviderMetrics(fastTime, 'openai');
      const mediumMetrics = extractProviderMetrics(mediumTime, 'openai');
      const slowMetrics = extractProviderMetrics(slowTime, 'openai');
      
      expect(fastMetrics.efficiency).toBe('high');
      expect(mediumMetrics.efficiency).toBe('medium');
      expect(slowMetrics.efficiency).toBe('low');
    });

    it('should rate Anthropic with appropriate thresholds', () => {
      const fastTime = 3000;
      const mediumTime = 8000;
      const slowTime = 15000;
      
      const fastMetrics = extractProviderMetrics(fastTime, 'anthropic');
      const mediumMetrics = extractProviderMetrics(mediumTime, 'anthropic');
      const slowMetrics = extractProviderMetrics(slowTime, 'anthropic');
      
      expect(fastMetrics.efficiency).toBe('high');
      expect(mediumMetrics.efficiency).toBe('medium');
      expect(slowMetrics.efficiency).toBe('low');
    });

    it('should handle unknown providers with OpenAI defaults', () => {
      const processingTime = 5000;
      const unknownProvider = 'unknown-ai';
      
      const metrics = extractProviderMetrics(processingTime, unknownProvider);
      
      expect(metrics.provider).toBe(unknownProvider);
      expect(metrics.efficiency).toBe('medium'); // Based on OpenAI thresholds
    });

    it('should log debug information', () => {
      extractProviderMetrics(2500, 'groq');
      
      expect(logger.debug).toHaveBeenCalledWith('Provider metrics extracted',
        expect.objectContaining({
          provider: 'groq',
          responseTime: 2500,
          efficiency: expect.stringMatching(/^(high|medium|low)$/)
        })
      );
    });
  });

  describe('Integration tests', () => {
    it('should work together to provide complete ML insights', () => {
      const result = createMockResult({
        matchPercentage: 82,
        confidence: 0.88,
        matchedSkills: ['JavaScript', 'TypeScript', 'React'],
        missingSkills: ['AWS'],
        reasoning: 'Comprehensive analysis showing strong technical alignment'
      });
      const processingTime = 2200;
      const aiProvider = 'groq';
      
      const scores = extractMLScores(result, aiProvider);
      const confidence = extractConfidenceMetrics(result, aiProvider);
      const performance = extractProviderMetrics(processingTime, aiProvider);
      
      // Should provide comprehensive insights
      expect(scores.llmScore).toBe(82);
      expect(scores.mlScore).toBeGreaterThan(0);
      expect(confidence.overallConfidence).toBe(0.88);
      expect(confidence.skillsConfidence).toBeCloseTo(0.75); // 3/(3+1)
      expect(performance.provider).toBe('groq');
      expect(performance.efficiency).toBe('medium'); // 2200ms for groq
    });

    it('should handle complete extraction workflow', () => {
      const result = createMockResult();
      const processingTime = 1800;
      const aiProvider = 'openai';
      
      // Should not throw errors
      expect(() => {
        extractMLScores(result, aiProvider);
        extractConfidenceMetrics(result, aiProvider);
        extractProviderMetrics(processingTime, aiProvider);
      }).not.toThrow();
      
      // Should log appropriate information
      expect(logger.debug).toHaveBeenCalledTimes(3);
    });
  });
});