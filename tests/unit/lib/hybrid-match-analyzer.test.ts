/**
 * Unit Tests for Hybrid Match Analyzer
 * Tests the core matching logic including ML, LLM, and hybrid strategies
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock external dependencies BEFORE importing the module
jest.mock('../../../server/lib/logger');
jest.mock('../../../server/lib/embeddings');
jest.mock('../../../server/lib/embedding-manager'); 
jest.mock('../../../server/lib/skill-processor');
jest.mock('../../../server/lib/enhanced-scoring', () => ({
  calculateEnhancedMatch: jest.fn().mockResolvedValue({
    totalScore: 85,
    confidence: 0.8,
    dimensionScores: {
      skills: 90,
      experience: 80,
      education: 85,
      semantic: 75
    },
    skillBreakdown: [
      { skill: 'JavaScript', matched: true, score: 95, required: true },
      { skill: 'React', matched: true, score: 90, required: true }
    ],
    explanation: {
      strengths: ['Strong technical background'],
      weaknesses: ['Some skill gaps'],
      recommendations: ['Consider additional training']
    }
  })
}));
jest.mock('../../../server/lib/groq', () => ({
  analyzeMatch: jest.fn().mockResolvedValue({
    results: [{
      matchPercentage: 80,
      matchedSkills: ['JavaScript', 'React'],
      missingSkills: ['Vue.js'],
      candidateStrengths: ['Good technical foundation'],
      candidateWeaknesses: ['Limited frontend frameworks'],
      overallAssessment: 'Strong candidate with minor skill gaps'
    }]
  }),
  getGroqServiceStatus: jest.fn().mockReturnValue({ isAvailable: true })
}));
jest.mock('../../../server/lib/openai', () => ({
  analyzeMatch: jest.fn().mockResolvedValue({
    results: [{
      matchPercentage: 85,
      matchedSkills: ['JavaScript', 'React', 'Node.js'],
      missingSkills: ['TypeScript'],
      candidateStrengths: ['Excellent problem-solving'],
      candidateWeaknesses: ['Needs more backend experience'],
      overallAssessment: 'Very strong candidate'
    }]
  }),
  getOpenAIServiceStatus: jest.fn().mockReturnValue({ isAvailable: true })
}));
jest.mock('../../../server/lib/anthropic', () => ({
  analyzeMatch: jest.fn().mockResolvedValue({
    results: [{
      matchPercentage: 82,
      matchedSkills: ['JavaScript', 'React'],
      missingSkills: ['GraphQL'],
      candidateStrengths: ['Strong analytical skills'],
      candidateWeaknesses: ['Limited database experience'],
      overallAssessment: 'Good candidate with potential'
    }]
  }),
  getAnthropicServiceStatus: jest.fn().mockReturnValue({ isAvailable: true })
}));
jest.mock('../../../server/lib/bias-detection', () => ({
  detectMatchingBias: jest.fn().mockResolvedValue({
    biasDetected: false,
    biasScore: 0.1,
    detectedBiases: [],
    fairnessMetrics: {
      biasConfidenceScore: 0.1,
      potentialBiasAreas: [],
      fairnessAssessment: 'No significant bias detected'
    },
    recommendations: []
  })
}));

import { HybridMatchAnalyzer, analyzeMatchHybrid, HYBRID_SCORING_WEIGHTS } from '../../../server/lib/hybrid-match-analyzer';
import { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse } from '../../../shared/schema';
import { UserTierInfo } from '../../../shared/user-tiers';

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
      skills: ['JavaScript', 'React', 'TypeScript', 'CSS'],
      requirements: 'Minimum 3 years experience with React',
      experience: '3-5 years frontend development',
      analyzedData: {
        skills: ['JavaScript', 'React', 'TypeScript', 'CSS'],
        requirements: 'Minimum 3 years experience with React',
        experience: '3-5 years frontend development'
      }
    };
    
    mockUserTier = {
      tier: 'premium',
      name: 'Premium',
      maxRequests: 1000,
      features: ['advanced_analysis', 'bias_detection']
    };
  });

  describe('Basic Functionality', () => {
    test('should create HybridMatchAnalyzer instance', () => {
      expect(analyzer).toBeInstanceOf(HybridMatchAnalyzer);
    });

    test('should have HYBRID_SCORING_WEIGHTS defined', () => {
      expect(HYBRID_SCORING_WEIGHTS).toBeDefined();
      expect(typeof HYBRID_SCORING_WEIGHTS).toBe('object');
    });
  });

  describe('Core Analysis Function', () => {
    test('should call analyzeMatchHybrid function', async () => {
      const result = await analyzeMatchHybrid(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        'resume text',
        'job text'
      );
      
      expect(result).toBeDefined();
      expect(result.matchPercentage).toBeDefined();
      expect(result.analysisMethod).toBeDefined();
      expect(result.matchedSkills).toBeDefined();
    });

    test('should return valid match result structure', async () => {
      const result = await analyzeMatchHybrid(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        'resume text',
        'job text'
      );
      
      expect(result).toHaveProperty('matchPercentage');
      expect(result).toHaveProperty('analysisMethod');
      expect(result).toHaveProperty('matchedSkills');
      expect(result).toHaveProperty('missingSkills');
      expect(result).toHaveProperty('confidenceLevel');
      expect(result).toHaveProperty('biasDetection');
    });
  });

  describe('Analysis Method Detection', () => {
    test('should handle analysis with valid inputs', async () => {
      const result = await analyzer.analyzeMatch(
        mockResumeAnalysis,
        mockJobAnalysis,
        mockUserTier,
        'resume text',
        'job text'
      );
      
      expect(result.analysisMethod).toMatch(/^(hybrid|ml_only|llm_only)$/);
      expect(result.matchPercentage).toBeGreaterThanOrEqual(0);
      expect(result.matchPercentage).toBeLessThanOrEqual(100);
    });
  });
});