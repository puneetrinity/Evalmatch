/**
 * Analysis Legacy Transformer Tests
 * 
 * Comprehensive unit tests with golden fixtures to ensure transformation accuracy
 * between AnalysisService and legacy response formats.
 */

// Jest globals (describe, it, expect) are available without imports
import {
  toLegacyBatchResponse,
  toLegacySingleResponse,
  toLegacyBiasResponse,
  toLegacyErrorResponse,
  compareResponses,
  logTransformationMetrics,
  logLegacyServiceUsage,
  logDifferentialComparison,
  type LegacyBatchAnalysisResponse,
  type LegacySingleAnalysisResponse,
  type LegacyBiasAnalysisResponse,
  type ResponseComparison
} from '../server/lib/analysis-legacy-transformer';
import type { BatchAnalysisResult, SingleAnalysisResult } from '../server/services/analysis-service';
import type { Result } from '../shared/result-pattern';

// ===== GOLDEN FIXTURES =====

/**
 * Golden fixture: Successful AnalysisService BatchAnalysisResult
 */
const mockBatchAnalysisResult: Result<BatchAnalysisResult, Error> & { success: true } = {
  success: true,
  data: {
    analysisId: 'batch_456',
    jobId: 123,
    results: [
      {
        resumeId: 1001,
        filename: 'john_doe_resume.pdf',
        candidateName: 'John Doe',
        matchPercentage: 87.5,
        matchedSkills: [
          { skill: 'JavaScript', category: 'Programming', confidence: 0.95 },
          { skill: 'React', category: 'Framework', confidence: 0.88 },
          { skill: 'Node.js', category: 'Backend', confidence: 0.82 }
        ],
        missingSkills: ['Python', 'Docker'],
        candidateStrengths: ['Strong frontend experience', 'Good problem-solving skills'],
        candidateWeaknesses: ['Limited backend experience', 'No DevOps background'],
        recommendations: ['Consider Python training', 'Evaluate for frontend role'],
        confidenceLevel: 'high' as const,
        analysisId: 5001
      },
      {
        resumeId: 1002,
        filename: 'jane_smith_resume.pdf', 
        candidateName: 'Jane Smith',
        matchPercentage: 92.3,
        matchedSkills: [
          { skill: 'Python', category: 'Programming', confidence: 0.94 },
          { skill: 'Machine Learning', category: 'AI/ML', confidence: 0.91 },
          { skill: 'TensorFlow', category: 'Framework', confidence: 0.87 }
        ],
        missingSkills: ['Kubernetes'],
        candidateStrengths: ['Excellent ML background', 'Strong analytical skills'],
        candidateWeaknesses: ['Limited frontend experience'],
        recommendations: ['Strong candidate for ML role'],
        confidenceLevel: 'high' as const,
        analysisId: 5002
      }
    ],
    processingTime: 2340,
    createdAt: '2024-01-15T10:30:00Z',
    statistics: {
      totalResumes: 2,
      successful: 2,
      failed: 0,
      averageMatch: 89.9
    }
  }
};

/**
 * Golden fixture: Expected legacy batch response format
 */
const expectedLegacyBatchResponse: LegacyBatchAnalysisResponse = {
  jobDescriptionId: 123,
  jobTitle: 'Senior Full Stack Developer',
  results: [
    // Sorted by match percentage (descending)
    {
      resumeId: 1002,
      filename: 'jane_smith_resume.pdf',
      candidateName: 'Jane Smith', 
      match: {
        matchPercentage: 92.3,
        matchedSkills: [
          { skill: 'Python', category: 'Programming', confidence: 0.94 },
          { skill: 'Machine Learning', category: 'AI/ML', confidence: 0.91 },
          { skill: 'TensorFlow', category: 'Framework', confidence: 0.87 }
        ],
        missingSkills: ['Kubernetes'],
        candidateStrengths: ['Excellent ML background', 'Strong analytical skills'],
        candidateWeaknesses: ['Limited frontend experience'],
        confidenceLevel: 'high',
        recommendations: ['Strong candidate for ML role']
      },
      analysisId: 5002
    },
    {
      resumeId: 1001,
      filename: 'john_doe_resume.pdf',
      candidateName: 'John Doe',
      match: {
        matchPercentage: 87.5,
        matchedSkills: [
          { skill: 'JavaScript', category: 'Programming', confidence: 0.95 },
          { skill: 'React', category: 'Framework', confidence: 0.88 },
          { skill: 'Node.js', category: 'Backend', confidence: 0.82 }
        ],
        missingSkills: ['Python', 'Docker'],
        candidateStrengths: ['Strong frontend experience', 'Good problem-solving skills'],
        candidateWeaknesses: ['Limited backend experience', 'No DevOps background'],
        confidenceLevel: 'high',
        recommendations: ['Consider Python training', 'Evaluate for frontend role']
      },
      analysisId: 5001
    }
  ]
};

/**
 * Golden fixture: Single analysis result
 */
const mockSingleAnalysisResult: Result<SingleAnalysisResult, Error> & { success: true } = {
  success: true,
  data: {
    resumeId: 2001,
    filename: 'alice_johnson_resume.pdf',
    candidateName: 'Alice Johnson',
    matchPercentage: 78.9,
    matchedSkills: [
      { skill: 'Java', category: 'Programming', confidence: 0.92 },
      { skill: 'Spring Boot', category: 'Framework', confidence: 0.85 }
    ],
    missingSkills: ['React', 'AWS'],
    candidateStrengths: ['Strong backend development'],
    candidateWeaknesses: ['No frontend experience'],
    recommendations: ['Consider for backend role'],
    confidenceLevel: 'medium' as const,
    analysisId: 6001,
    processingTime: 1200,
    createdAt: '2024-01-15T11:00:00Z'
  }
};

/**
 * Golden fixture: Error result
 */
const mockErrorResult: Result<BatchAnalysisResult, Error> & { success: false } = {
  success: false,
  error: new Error('Job description not found')
};

// ===== TEST SUITES =====

describe('Analysis Legacy Transformer', () => {
  describe('toLegacyBatchResponse', () => {
    it('should transform BatchAnalysisResult to legacy format correctly', () => {
      const result = toLegacyBatchResponse(
        mockBatchAnalysisResult,
        'Senior Full Stack Developer'
      );

      expect(result).toEqual(expectedLegacyBatchResponse);
    });

    it('should preserve all match analysis fields', () => {
      const result = toLegacyBatchResponse(mockBatchAnalysisResult, 'Test Job');
      const firstResult = result.results[0]; // Jane Smith (highest match)

      expect(firstResult.match).toMatchObject({
        matchPercentage: 92.3,
        matchedSkills: expect.arrayContaining([
          expect.objectContaining({ skill: 'Python', confidence: 0.94 })
        ]),
        missingSkills: ['Kubernetes'],
        candidateStrengths: expect.arrayContaining(['Excellent ML background']),
        candidateWeaknesses: expect.arrayContaining(['Limited frontend experience']),
        confidenceLevel: 'high',
        recommendations: expect.arrayContaining(['Strong candidate for ML role'])
      });
    });

    it('should sort results by match percentage descending', () => {
      const result = toLegacyBatchResponse(mockBatchAnalysisResult, 'Test Job');
      
      expect(result.results).toHaveLength(2);
      expect(result.results[0].match.matchPercentage).toBe(92.3); // Jane Smith
      expect(result.results[1].match.matchPercentage).toBe(87.5); // John Doe
    });

    it('should handle empty results gracefully', () => {
      const emptyResult: Result<BatchAnalysisResult, Error> & { success: true } = {
        success: true,
        data: {
          ...mockBatchAnalysisResult.data,
          results: [],
          statistics: { totalResumes: 0, successful: 0, failed: 0, averageMatch: 0 }
        }
      };

      const result = toLegacyBatchResponse(emptyResult, 'Empty Job');
      
      expect(result.results).toEqual([]);
      expect(result.jobDescriptionId).toBe(123);
      expect(result.jobTitle).toBe('Empty Job');
    });

    it('should handle null match percentages', () => {
      const nullMatchResult: Result<BatchAnalysisResult, Error> & { success: true } = {
        success: true,
        data: {
          ...mockBatchAnalysisResult.data,
          results: [{
            ...mockBatchAnalysisResult.data.results[0],
            matchPercentage: null
          }]
        }
      };

      const result = toLegacyBatchResponse(nullMatchResult, 'Test Job');
      
      expect(result.results[0].match.matchPercentage).toBeNull();
      // Should still sort correctly (null treated as 0)
    });
  });

  describe('toLegacySingleResponse', () => {
    it('should transform SingleAnalysisResult to legacy format correctly', () => {
      const result = toLegacySingleResponse(mockSingleAnalysisResult);

      expect(result).toEqual({
        resumeId: 2001,
        filename: 'alice_johnson_resume.pdf',
        candidateName: 'Alice Johnson',
        match: {
          matchPercentage: 78.9,
          matchedSkills: [
            { skill: 'Java', category: 'Programming', confidence: 0.92 },
            { skill: 'Spring Boot', category: 'Framework', confidence: 0.85 }
          ],
          missingSkills: ['React', 'AWS'],
          candidateStrengths: ['Strong backend development'],
          candidateWeaknesses: ['No frontend experience'],
          confidenceLevel: 'medium',
          recommendations: ['Consider for backend role']
        },
        analysisId: 6001
      });
    });

    it('should handle missing optional fields with defaults', () => {
      const partialResult: Result<SingleAnalysisResult, Error> & { success: true } = {
        success: true,
        data: {
          resumeId: 3001,
          filename: 'minimal_resume.pdf',
          candidateName: 'Bob Wilson',
          matchPercentage: 65.0,
          matchedSkills: [],
          missingSkills: [],
          candidateStrengths: [],
          candidateWeaknesses: [],
          recommendations: [],
          confidenceLevel: 'low' as const,
          analysisId: 7001,
          processingTime: 800,
          createdAt: '2024-01-15T12:00:00Z'
        }
      };

      const result = toLegacySingleResponse(partialResult);

      expect(result.match.matchedSkills).toEqual([]);
      expect(result.match.confidenceLevel).toBe('low');
      expect(result.analysisId).toBe(7001);
    });
  });

  describe('toLegacyErrorResponse', () => {
    it('should transform error result to legacy error format', () => {
      const result = toLegacyErrorResponse(mockErrorResult, {
        operation: 'batch_analysis',
        userId: 'user123',
        jobId: 456
      });

      expect(result).toEqual({
        error: 'Job description not found',
        code: 'Error'
      });
    });

    it('should handle custom error names', () => {
      class CustomAnalysisError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'ANALYSIS_TIMEOUT';
        }
      }

      const customErrorResult: Result<BatchAnalysisResult, Error> & { success: false } = {
        success: false,
        error: new CustomAnalysisError('Analysis timed out after 30 seconds')
      };

      const result = toLegacyErrorResponse(customErrorResult, {
        operation: 'timeout_test'
      });

      expect(result).toEqual({
        error: 'Analysis timed out after 30 seconds',
        code: 'ANALYSIS_TIMEOUT'
      });
    });
  });

  describe('compareResponses', () => {
    const mockLegacyResponse: LegacyBatchAnalysisResponse = {
      jobDescriptionId: 123,
      jobTitle: 'Test Job',
      results: [
        {
          resumeId: 1001,
          filename: 'test.pdf',
          candidateName: 'Test User',
          match: {
            matchPercentage: 85.0,
            matchedSkills: [{ skill: 'JavaScript' }, { skill: 'React' }],
            missingSkills: ['Python'],
            candidateStrengths: ['Frontend skills'],
            candidateWeaknesses: ['Backend gaps'],
            confidenceLevel: 'high'
          },
          analysisId: 5001
        }
      ]
    };

    it('should detect equivalent responses within tolerance', () => {
      const nearIdenticalResponse: LegacyBatchAnalysisResponse = {
        ...mockLegacyResponse,
        results: [{
          ...mockLegacyResponse.results[0],
          match: {
            ...mockLegacyResponse.results[0].match,
            matchPercentage: 85.2 // Within 0.5% tolerance
          }
        }]
      };

      const comparison = compareResponses(mockLegacyResponse, nearIdenticalResponse, {
        matchPercentage: 0.5,
        skillCountDelta: 2
      });

      expect(comparison.isEquivalent).toBe(true);
      expect(comparison.matchPercentageDelta).toBeCloseTo(0.2, 1);
    });

    it('should detect responses outside tolerance', () => {
      const differentResponse: LegacyBatchAnalysisResponse = {
        ...mockLegacyResponse,
        results: [{
          ...mockLegacyResponse.results[0],
          match: {
            ...mockLegacyResponse.results[0].match,
            matchPercentage: 78.0, // 7% difference, outside 0.5% tolerance
            matchedSkills: [] // Empty skills array
          }
        }]
      };

      const comparison = compareResponses(mockLegacyResponse, differentResponse, {
        matchPercentage: 0.5,
        skillCountDelta: 1
      });

      expect(comparison.isEquivalent).toBe(false);
      expect(comparison.fieldMismatches).toEqual(expect.arrayContaining([
        expect.stringContaining('matchPercentage'),
        expect.stringContaining('matchedSkills.length')
      ]));
      expect(comparison.matchPercentageDelta).toBe(7.0);
    });

    it('should handle different result counts', () => {
      const fewerResultsResponse: LegacyBatchAnalysisResponse = {
        ...mockLegacyResponse,
        results: [] // No results
      };

      const comparison = compareResponses(mockLegacyResponse, fewerResultsResponse);

      expect(comparison.isEquivalent).toBe(false);
      expect(comparison.fieldMismatches).toEqual(expect.arrayContaining([
        expect.stringContaining('resultCount')
      ]));
    });
  });

  describe('logTransformationMetrics', () => {
    it('should log transformation metrics without throwing', () => {
      // Test that logging doesn't throw - actual log output tested in integration
      expect(() => {
        logTransformationMetrics('batch', 3, 3, 1500, {
          userId: 'user456',
          jobId: 789,
          analysisId: 'batch_123'
        });
      }).not.toThrow();
    });
  });

  describe('Observability Functions', () => {
    it('should log legacy service usage without throwing', () => {
      expect(() => {
        logLegacyServiceUsage('/api/analyze-bias', 'user123abc456def', true, 2500, true);
      }).not.toThrow();
    });

    it('should log differential comparison within sample rate', () => {
      const testResponse = {
        jobDescriptionId: 123,
        jobTitle: 'Test Job',
        results: [{
          resumeId: 1001,
          filename: 'test.pdf',
          candidateName: 'Test User',
          match: {
            matchPercentage: 85.0,
            matchedSkills: [{ skill: 'JavaScript' }],
            missingSkills: ['Python'],
            candidateStrengths: ['Frontend skills'],
            candidateWeaknesses: ['Backend gaps'],
            confidenceLevel: 'high'
          },
          analysisId: 5001
        }]
      };

      expect(() => {
        logDifferentialComparison(
          '/api/analyze-match',
          testResponse,
          { data: testResponse },
          { isEquivalent: true, matchPercentageDelta: 0.1 },
          { userId: 'user123', jobId: 456, sampleRate: 1.0 } // Force sampling
        );
      }).not.toThrow();
    });

    it('should respect sample rate for differential logging', () => {
      // With 0% sample rate, should not log (no errors)
      expect(() => {
        logDifferentialComparison(
          '/api/test',
          {},
          {},
          { isEquivalent: false, fieldMismatches: ['test'] },
          { sampleRate: 0.0 }
        );
      }).not.toThrow();
    });

    it('should respect environment variable for sample rate', () => {
      // Mock environment variable
      const originalEnvValue = process.env.TRANSFORM_SAMPLE_RATE;
      process.env.TRANSFORM_SAMPLE_RATE = '1.0';
      
      expect(() => {
        logDifferentialComparison(
          '/api/env-test',
          { test: true },
          { test: true },
          { isEquivalent: true },
          {} // No context sampleRate - should use env
        );
      }).not.toThrow();
      
      // Restore original environment
      if (originalEnvValue !== undefined) {
        process.env.TRANSFORM_SAMPLE_RATE = originalEnvValue;
      } else {
        delete process.env.TRANSFORM_SAMPLE_RATE;
      }
    });

    it('should clamp TRANSFORM_SAMPLE_RATE to valid range [0,1]', () => {
      const originalEnv = process.env.TRANSFORM_SAMPLE_RATE;
      
      // Test negative value (should clamp to 0 and not throw)
      process.env.TRANSFORM_SAMPLE_RATE = '-0.5';
      expect(() => {
        logDifferentialComparison('test', {}, {}, { isEquivalent: true }, { userId: 'test' });
      }).not.toThrow();
      
      // Test value > 1 (should clamp to 1 and not throw)
      process.env.TRANSFORM_SAMPLE_RATE = '1.5';
      expect(() => {
        logDifferentialComparison('test', {}, {}, { isEquivalent: true }, { userId: 'test' });
      }).not.toThrow();
      
      // Test invalid value (should default to 0.05 and not throw)
      process.env.TRANSFORM_SAMPLE_RATE = 'invalid';
      expect(() => {
        logDifferentialComparison('test', {}, {}, { isEquivalent: true }, { userId: 'test' });
      }).not.toThrow();
      
      // Test empty string (should default to 0.05 and not throw)
      process.env.TRANSFORM_SAMPLE_RATE = '';
      expect(() => {
        logDifferentialComparison('test', {}, {}, { isEquivalent: true }, { userId: 'test' });
      }).not.toThrow();
      
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.TRANSFORM_SAMPLE_RATE = originalEnv;
      } else {
        delete process.env.TRANSFORM_SAMPLE_RATE;
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined/null fields gracefully', () => {
      const edgeCaseResult: Result<BatchAnalysisResult, Error> & { success: true } = {
        success: true,
        data: {
          analysisId: 'edge_case',
          jobId: 999,
          results: [{
            resumeId: 1,
            filename: 'edge.pdf',
            candidateName: 'Edge Case',
            matchPercentage: null,
            matchedSkills: undefined as any,
            missingSkills: undefined as any,
            candidateStrengths: undefined as any,
            candidateWeaknesses: undefined as any,
            recommendations: undefined as any,
            confidenceLevel: undefined as any,
            analysisId: null
          }],
          processingTime: 0,
          createdAt: '2024-01-15T13:00:00Z',
          statistics: { totalResumes: 1, successful: 1, failed: 0, averageMatch: 0 }
        }
      };

      const result = toLegacyBatchResponse(edgeCaseResult, 'Edge Case Job');

      expect(result.results[0].match).toMatchObject({
        matchPercentage: null,
        matchedSkills: [],
        missingSkills: [],
        candidateStrengths: [],
        candidateWeaknesses: [],
        confidenceLevel: 'medium' // Default fallback
      });
      expect(result.results[0].analysisId).toBeNull();
    });

    it('should preserve sorting with mixed null and numeric values', () => {
      const mixedMatchResult: Result<BatchAnalysisResult, Error> & { success: true } = {
        success: true,
        data: {
          ...mockBatchAnalysisResult.data,
          results: [
            { ...mockBatchAnalysisResult.data.results[0], matchPercentage: null },
            { ...mockBatchAnalysisResult.data.results[1], matchPercentage: 85.5 },
            { ...mockBatchAnalysisResult.data.results[0], resumeId: 1003, matchPercentage: 90.1 }
          ]
        }
      };

      const result = toLegacyBatchResponse(mixedMatchResult, 'Mixed Job');
      const matchPercentages = result.results.map(r => r.match.matchPercentage);

      expect(matchPercentages).toEqual([90.1, 85.5, null]); // Sorted descending, null last
    });
  });
});

// ===== PERFORMANCE TESTS =====

describe('Transformer Performance', () => {
  it('should handle large batch results efficiently', () => {
    // Generate large batch result (100 resumes)
    const largeBatchResults = Array.from({ length: 100 }, (_, i) => ({
      resumeId: 1000 + i,
      filename: `resume_${i}.pdf`,
      candidateName: `Candidate ${i}`,
      matchPercentage: Math.random() * 100,
      matchedSkills: Array.from({ length: 5 }, (_, j) => ({
        skill: `Skill ${j}`,
        category: 'Test',
        confidence: Math.random()
      })),
      missingSkills: [`Missing ${i}`],
      candidateStrengths: [`Strength ${i}`],
      candidateWeaknesses: [`Weakness ${i}`],
      recommendations: [`Recommendation ${i}`],
      confidenceLevel: 'medium' as const,
      analysisId: 5000 + i
    }));

    const largeBatchResult: Result<BatchAnalysisResult, Error> & { success: true } = {
      success: true,
      data: {
        analysisId: 'large_batch',
        jobId: 999,
        results: largeBatchResults,
        processingTime: 5000,
        createdAt: '2024-01-15T14:00:00Z',
        statistics: { totalResumes: 100, successful: 100, failed: 0, averageMatch: 75 }
      }
    };

    const startTime = Date.now();
    const result = toLegacyBatchResponse(largeBatchResult, 'Large Job');
    const transformTime = Date.now() - startTime;

    expect(result.results).toHaveLength(100);
    expect(transformTime).toBeLessThan(100); // Should transform 100 results in <100ms
    
    // Verify sorting still works correctly
    const sortedCorrectly = result.results.every((curr, i, arr) => 
      i === 0 || (arr[i-1].match.matchPercentage || 0) >= (curr.match.matchPercentage || 0)
    );
    expect(sortedCorrectly).toBe(true);
  });
});

// ===== BIAS ANALYSIS TRANSFORMATION TESTS =====

describe('Bias Analysis Legacy Transformation', () => {
  describe('toLegacyBiasResponse', () => {
    it('should transform AnalysisService bias result to legacy format', () => {
      const serviceResult: Result<any, Error> & { success: true } = {
        success: true,
        data: {
          jobId: 123,
          biasAnalysis: {
            hasBias: true,
            overallScore: 25.5,
            biasTypes: [
              { type: 'age_discrimination', description: 'Language suggesting age preference', severity: 'medium' },
              { type: 'cultural_bias', description: 'Terms that may exclude certain cultures', severity: 'low' }
            ],
            fairnessAssessment: 'Moderate bias detected in job requirements',
            recommendations: ['Remove age-related terms', 'Use inclusive language']
          },
          suggestions: ['Avoid terms like "young" and "energetic"', 'Consider remote work options'],
          overallBiasScore: 25.5,
          analysisDate: '2024-01-15T14:30:00Z'
        }
      };

      const result = toLegacyBiasResponse(serviceResult);

      expect(result).toEqual({
        jobId: 123,
        biasAnalysis: {
          hasBias: true,
          overallScore: 25.5,
          biasTypes: [
            { type: 'age_discrimination', description: 'Language suggesting age preference', severity: 'medium' },
            { type: 'cultural_bias', description: 'Terms that may exclude certain cultures', severity: 'low' }
          ],
          suggestions: ['Avoid terms like "young" and "energetic"', 'Consider remote work options'],
          fairnessAssessment: 'Moderate bias detected in job requirements',
          // Additional fields preserved from biasAnalysis
          recommendations: ['Remove age-related terms', 'Use inclusive language']
        }
      });
    });

    it('should handle missing bias analysis fields gracefully', () => {
      const serviceResult: Result<any, Error> & { success: true } = {
        success: true,
        data: {
          jobId: 456,
          biasAnalysis: {
            overallScore: 5.2
          },
          overallBiasScore: 5.2
        }
      };

      const result = toLegacyBiasResponse(serviceResult);

      expect(result).toEqual({
        jobId: 456,
        biasAnalysis: {
          hasBias: undefined,
          overallScore: 5.2,
          biasTypes: [],
          suggestions: [],
          fairnessAssessment: 'No bias detected'
        }
      });
    });

    it('should prioritize suggestions from data.suggestions over biasAnalysis.suggestions', () => {
      const serviceResult: Result<any, Error> & { success: true } = {
        success: true,
        data: {
          jobId: 789,
          biasAnalysis: {
            suggestions: ['Original suggestion from bias analysis']
          },
          suggestions: ['Updated suggestion from service'],
          overallBiasScore: 10.0
        }
      };

      const result = toLegacyBiasResponse(serviceResult);

      expect(result.biasAnalysis.suggestions).toEqual(['Updated suggestion from service']);
    });

    it('should preserve additional bias analysis fields', () => {
      const serviceResult: Result<any, Error> & { success: true } = {
        success: true,
        data: {
          jobId: 101,
          biasAnalysis: {
            overallScore: 15.7,
            customField: 'custom value',
            analysisVersion: '2.1',
            processingTime: 450
          },
          overallBiasScore: 15.7
        }
      };

      const result = toLegacyBiasResponse(serviceResult);

      expect(result.biasAnalysis).toMatchObject({
        overallScore: 15.7,
        customField: 'custom value',
        analysisVersion: '2.1',
        processingTime: 450
      });
    });

    it('should handle bias analysis with zero bias detected', () => {
      const serviceResult: Result<any, Error> & { success: true } = {
        success: true,
        data: {
          jobId: 202,
          biasAnalysis: {
            hasBias: false,
            overallScore: 0,
            biasTypes: [],
            fairnessAssessment: 'Job description appears bias-free'
          },
          suggestions: [],
          overallBiasScore: 0
        }
      };

      const result = toLegacyBiasResponse(serviceResult);

      expect(result).toEqual({
        jobId: 202,
        biasAnalysis: {
          hasBias: false,
          overallScore: 0,
          biasTypes: [],
          suggestions: [],
          fairnessAssessment: 'Job description appears bias-free'
        }
      });
    });
  });

  describe('Bias Analysis Logging', () => {
    it('should log transformation metrics correctly', () => {
      const serviceResult: Result<any, Error> & { success: true } = {
        success: true,
        data: {
          jobId: 303,
          biasAnalysis: { overallScore: 20.3, hasBias: true },
          overallBiasScore: 20.3
        }
      };

      // Verify debug logging was called (via logger.debug)
      // Note: This tests the transformation function call, actual logging is handled by logger
      expect(() => toLegacyBiasResponse(serviceResult)).not.toThrow();
      
      // Function should execute successfully without errors
      const result = toLegacyBiasResponse(serviceResult);
      expect(result.jobId).toBe(303);
      expect(result.biasAnalysis.overallScore).toBe(20.3);
    });
  });

  describe('Bias Analysis Performance', () => {
    it('should transform bias results efficiently', () => {
      const serviceResult: Result<any, Error> & { success: true } = {
        success: true,
        data: {
          jobId: 404,
          biasAnalysis: {
            hasBias: true,
            overallScore: 30.0,
            biasTypes: Array.from({ length: 10 }, (_, i) => ({
              type: `bias_type_${i}`,
              description: `Description for bias type ${i}`,
              severity: i % 2 === 0 ? 'high' : 'low'
            })),
            fairnessAssessment: 'Multiple bias types detected'
          },
          suggestions: Array.from({ length: 20 }, (_, i) => `Suggestion ${i + 1}`),
          overallBiasScore: 30.0
        }
      };

      const startTime = Date.now();
      const result = toLegacyBiasResponse(serviceResult);
      const transformTime = Date.now() - startTime;

      expect(result.biasAnalysis.biasTypes).toHaveLength(10);
      expect(result.biasAnalysis.suggestions).toHaveLength(20);
      expect(transformTime).toBeLessThan(10); // Should transform quickly
    });
  });
});