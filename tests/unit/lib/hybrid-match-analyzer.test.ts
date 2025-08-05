/**
 * Unit Tests for Hybrid Match Analyzer
 * Tests the core matching logic including ML, LLM, and hybrid strategies
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { HybridMatchAnalyzer, analyzeMatchHybrid, HYBRID_SCORING_WEIGHTS } from '../../../server/lib/hybrid-match-analyzer';
import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse } from '../../../shared/schema';
import { UserTierInfo } from '../../../shared/user-tiers';

// Mock external dependencies
jest.mock('../../../server/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
}));

jest.mock('../../../server/lib/enhanced-scoring', () => ({
  calculateEnhancedMatch: jest.fn(),
  ScoringWeights: {}
}));

jest.mock('../../../server/lib/groq', () => ({
  getGroqServiceStatus: jest.fn(() => ({ isAvailable: true })),
  analyzeMatch: jest.fn()
}));

jest.mock('../../../server/lib/openai', () => ({
  getOpenAIServiceStatus: jest.fn(() => ({ isAvailable: true })),
  analyzeMatch: jest.fn()
}));

jest.mock('../../../server/lib/anthropic', () => ({
  getAnthropicServiceStatus: jest.fn(() => ({ isAvailable: true })),
  analyzeMatch: jest.fn()
}));

jest.mock('../../../server/lib/bias-detection', () => ({
  detectMatchingBias: jest.fn()
}));

jest.mock('../../../server/config', () => ({
  config: {
    anthropicApiKey: 'test-key'
  }
}));

const mockCalculateEnhancedMatch = require('../../../server/lib/enhanced-scoring').calculateEnhancedMatch as jest.MockedFunction<any>;
const mockGroqAnalyzeMatch = require('../../../server/lib/groq').analyzeMatch as jest.MockedFunction<any>;
const mockOpenAIAnalyzeMatch = require('../../../server/lib/openai').analyzeMatch as jest.MockedFunction<any>;
const mockAnthropicAnalyzeMatch = require('../../../server/lib/anthropic').analyzeMatch as jest.MockedFunction<any>;
const mockDetectMatchingBias = require('../../../server/lib/bias-detection').detectMatchingBias as jest.MockedFunction<any>;

describe('HybridMatchAnalyzer', () => {
  let analyzer: HybridMatchAnalyzer;
  let mockResumeAnalysis: AnalyzeResumeResponse;
  let mockJobAnalysis: AnalyzeJobDescriptionResponse;
  let mockUserTier: UserTierInfo;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up environment for tests
    process.env.GROQ_API_KEY = 'test-groq-key';
    
    analyzer = new HybridMatchAnalyzer();
    
    mockResumeAnalysis = {
      filename: 'test-resume.pdf',
      skills: ['JavaScript', 'React', 'Node.js', 'TypeScript'],
      experience: 'Senior Software Engineer with 5 years experience',
      education: ['BS Computer Science'],
      analyzedData: {
        skills: ['JavaScript', 'React', 'Node.js', 'TypeScript'],
        experience: 'Senior Software Engineer with 5 years experience',
        education: ['BS Computer Science']
      }
    };
    
    mockJobAnalysis = {
      title: 'Senior Frontend Developer',
      skills: ['JavaScript', 'React', 'TypeScript', 'Vue.js'],
      experience: '5+ years frontend development experience',
      analyzedData: {
        requiredSkills: ['JavaScript', 'React', 'TypeScript', 'Vue.js'],
        experienceLevel: 'Senior'
      }
    };
    
    mockUserTier = {
      tier: 'free',
      features: {
        maxResumes: 10,
        maxJobDescriptions: 5,
        maxAnalyses: 20,
        aiAnalysis: true,
        batchProcessing: false,
        advancedAnalytics: false,
        prioritySupport: false,
        customIntegrations: false
      },
      limits: {
        resumes: 10,
        jobDescriptions: 5,
        analyses: 20
      }
    };
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with correct AI provider configuration', () => {
      expect(analyzer).toBeInstanceOf(HybridMatchAnalyzer);
    });

    test('should detect Groq configuration correctly', () => {
      process.env.GROQ_API_KEY = 'test-key';
      const newAnalyzer = new HybridMatchAnalyzer();
      expect(newAnalyzer).toBeInstanceOf(HybridMatchAnalyzer);
    });

    test('should handle missing AI provider configuration', () => {
      delete process.env.GROQ_API_KEY;
      const newAnalyzer = new HybridMatchAnalyzer();
      expect(newAnalyzer).toBeInstanceOf(HybridMatchAnalyzer);
    });
  });

  describe('Analysis Strategy Determination', () => {
    test('should choose hybrid strategy when full text and AI providers available', async () => {
      const resumeText = 'Full resume text content';
      const jobText = 'Full job description text content';
      
      // Mock ML analysis result
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 75,
        confidence: 0.8,
        dimensionScores: {
          skills: 80,
          experience: 70,
          education: 75,
          semantic: 65
        },
        skillBreakdown: [
          { skill: 'JavaScript', matched: true, score: 95, required: true },
          { skill: 'React', matched: true, score: 90, required: true },
          { skill: 'Vue.js', matched: false, score: 0, required: true }
        ],
        explanation: {
          strengths: ['Strong JavaScript skills', 'React expertise'],
          weaknesses: ['Missing Vue.js experience'],
          recommendations: ['Consider learning Vue.js']
        }
      });
      
      // Mock LLM analysis result
      mockGroqAnalyzeMatch.mockResolvedValue({
        results: [{
          matchPercentage: 78,
          matchedSkills: ['JavaScript', 'React', 'TypeScript'],
          missingSkills: ['Vue.js'],
          candidateStrengths: ['Excellent frontend skills'],
          candidateWeaknesses: ['Limited Vue.js knowledge'],
          recommendations: ['Strong candidate for React-focused role']
        }]
      });
      
      // Mock bias detection
      mockDetectMatchingBias.mockResolvedValue({
        hasBias: false,
        biasScore: 0.1,
        detectedBiases: [],
        fairnessMetrics: {
          biasConfidenceScore: 0.1,
          potentialBiasAreas: [],
          fairnessAssessment: 'No significant bias detected'
        }
      });

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        resumeText,
        jobText
      );

      expect(result.analysisMethod).toBe('hybrid');
      expect(result.matchPercentage).toBeGreaterThan(0);
      expect(result.matchedSkills).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            skill: expect.any(String),
            matchPercentage: expect.any(Number)
          })
        ])
      );
      expect(result.biasDetection).toBeDefined();
    });

    test('should fallback to ML-only when AI providers unavailable', async () => {
      // Mock all AI providers as unavailable
      require('../../../server/lib/groq').getGroqServiceStatus.mockReturnValue({ isAvailable: false });
      require('../../../server/lib/openai').getOpenAIServiceStatus.mockReturnValue({ isAvailable: false });
      require('../../../server/lib/anthropic').getAnthropicServiceStatus.mockReturnValue({ isAvailable: false });
      
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 72,
        confidence: 0.7,
        dimensionScores: {
          skills: 75,
          experience: 70,
          education: 68,
          semantic: 60
        },
        skillBreakdown: [
          { skill: 'JavaScript', matched: true, score: 95, required: true },
          { skill: 'React', matched: true, score: 90, required: true }
        ],
        explanation: {
          strengths: ['JavaScript proficiency'],
          weaknesses: ['Missing some required skills'],
          recommendations: ['Consider skill development']
        }
      });

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        'resume text',
        'job text'
      );

      expect(result.analysisMethod).toBe('ml_only');
      expect(result.matchPercentage).toBe(72);
      expect(result.confidenceLevel).toBe('medium');
    });

    test('should use LLM-only when no full text but AI available', async () => {
      mockGroqAnalyzeMatch.mockResolvedValue({
        results: [{
          matchPercentage: 82,
          matchedSkills: ['JavaScript', 'React'],
          missingSkills: ['Vue.js'],
          candidateStrengths: ['Strong technical background'],
          candidateWeaknesses: ['Some skill gaps'],
          recommendations: ['Good fit with training']
        }]
      });

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier
        // No text provided
      );

      expect(result.analysisMethod).toBe('llm_only');
      expect(result.matchPercentage).toBe(82);
      expect(result.matchedSkills.length).toBeGreaterThan(0);
    });
  });

  describe('Scoring Weights', () => {
    test('should use correct hybrid scoring weights', () => {
      expect(HYBRID_SCORING_WEIGHTS).toEqual({
        skills: 0.50,
        experience: 0.30,
        education: 0.15,
        semantic: 0.05,
        cultural: 0.0
      });
    });

    test('should apply weights correctly in analysis', async () => {
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 80,
        confidence: 0.85,
        dimensionScores: {
          skills: 85,
          experience: 75,
          education: 70,
          semantic: 60
        },
        skillBreakdown: [],
        explanation: {
          strengths: [],
          weaknesses: [],
          recommendations: []
        }
      });

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier
      );

      expect(mockCalculateEnhancedMatch).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        HYBRID_SCORING_WEIGHTS
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle ML analysis failure gracefully', async () => {
      mockCalculateEnhancedMatch.mockRejectedValue(new Error('ML analysis failed'));

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier
      );

      expect(result.analysisMethod).toBe('ml_only');
      expect(result.matchPercentage).toBe(50); // Fallback score
      expect(result.confidenceLevel).toBe('low');
      expect(result.candidateWeaknesses).toContain('Detailed analysis temporarily unavailable');
    });

    test('should handle LLM analysis failure gracefully', async () => {
      mockGroqAnalyzeMatch.mockRejectedValue(new Error('LLM analysis failed'));
      mockOpenAIAnalyzeMatch.mockRejectedValue(new Error('OpenAI failed'));
      mockAnthropicAnalyzeMatch.mockRejectedValue(new Error('Anthropic failed'));

      // Should still work with just ML
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 70,
        confidence: 0.6,
        dimensionScores: { skills: 70, experience: 70, education: 70, semantic: 70 },
        skillBreakdown: [],
        explanation: { strengths: [], weaknesses: [], recommendations: [] }
      });

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        'resume text',
        'job text'
      );

      expect(result.analysisMethod).toBe('ml_only');
      expect(result.matchPercentage).toBe(70);
    });

    test('should handle bias detection failure gracefully', async () => {
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 75,
        confidence: 0.8,
        dimensionScores: { skills: 75, experience: 75, education: 75, semantic: 75 },
        skillBreakdown: [],
        explanation: { strengths: [], weaknesses: [], recommendations: [] }
      });

      mockDetectMatchingBias.mockRejectedValue(new Error('Bias detection failed'));

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        'resume text',
        'job text'
      );

      expect(result.biasDetection).toBeUndefined();
      expect(result.matchPercentage).toBe(75); // Analysis should still complete
    });
  });

  describe('Result Blending', () => {
    test('should blend ML and LLM results correctly', async () => {
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 70,
        confidence: 0.6,
        dimensionScores: {
          skills: 75,
          experience: 65,
          education: 70,
          semantic: 60
        },
        skillBreakdown: [
          { skill: 'JavaScript', matched: true, score: 95, required: true },
          { skill: 'React', matched: true, score: 90, required: true },
          { skill: 'Vue.js', matched: false, score: 0, required: true }
        ],
        explanation: {
          strengths: ['JavaScript expertise'],
          weaknesses: ['Missing Vue.js'],
          recommendations: ['Learn Vue.js']
        }
      });

      mockGroqAnalyzeMatch.mockResolvedValue({
        results: [{
          matchPercentage: 85,
          matchedSkills: ['JavaScript', 'React', 'TypeScript'],
          missingSkills: ['Vue.js'],
          candidateStrengths: ['Strong frontend skills'],
          candidateWeaknesses: ['Limited framework diversity'],
          recommendations: ['Excellent React developer']
        }]
      });

      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        'resume text',
        'job text'
      );

      expect(result.analysisMethod).toBe('hybrid');
      // Result should be blend of 70 (ML) and 85 (LLM) weighted by ML confidence (0.6)
      // Expected: 70 * 0.6 + 85 * 0.4 = 42 + 34 = 76
      expect(result.matchPercentage).toBeCloseTo(76, 0);
      
      // Should combine skills from both analyses
      const skillNames = result.matchedSkills.map(s => s.skill);
      expect(skillNames).toContain('JavaScript');
      expect(skillNames).toContain('React');
      expect(skillNames).toContain('TypeScript');
      
      // Should combine insights
      expect(result.candidateStrengths).toEqual(
        expect.arrayContaining(['JavaScript expertise', 'Strong frontend skills'])
      );
    });
  });

  describe('Factory Function', () => {
    test('should create analyzer and perform analysis via factory function', async () => {
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 80,
        confidence: 0.75,
        dimensionScores: { skills: 80, experience: 80, education: 80, semantic: 80 },
        skillBreakdown: [],
        explanation: { strengths: [], weaknesses: [], recommendations: [] }
      });

      const result = await analyzeMatchHybrid(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier
      );

      expect(result).toBeDefined();
      expect(result.matchPercentage).toBe(80);
      expect(result.confidence).toBe(0.75);
    });
  });

  describe('Confidence Level Calculation', () => {
    test('should assign correct confidence levels', async () => {
      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 85,
        confidence: 0.9,
        dimensionScores: { skills: 85, experience: 85, education: 85, semantic: 85 },
        skillBreakdown: [],
        explanation: { strengths: [], weaknesses: [], recommendations: [] }
      });

      const highResult = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier
      );
      expect(highResult.confidenceLevel).toBe('high');

      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 65,
        confidence: 0.6,
        dimensionScores: { skills: 65, experience: 65, education: 65, semantic: 65 },
        skillBreakdown: [],
        explanation: { strengths: [], weaknesses: [], recommendations: [] }
      });

      const mediumResult = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier
      );
      expect(mediumResult.confidenceLevel).toBe('medium');

      mockCalculateEnhancedMatch.mockResolvedValue({
        totalScore: 45,
        confidence: 0.3,
        dimensionScores: { skills: 45, experience: 45, education: 45, semantic: 45 },
        skillBreakdown: [],
        explanation: { strengths: [], weaknesses: [], recommendations: [] }
      });

      const lowResult = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier
      );
      expect(lowResult.confidenceLevel).toBe('low');
    });
  });
});