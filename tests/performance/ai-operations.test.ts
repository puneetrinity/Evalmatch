/**
 * Performance Tests for AI Operations
 * Tests AI provider response times, model switching, and batch processing
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import { performance } from 'perf_hooks';
import { testResumeContent, testJobDescriptions, mockAIResponses } from '../fixtures/test-data';

describe('AI Operations Performance Tests', () => {
  let app: any;
  let testJobId: number;
  let testResumeIds: number[] = [];
  
  const aiMetrics: Array<{
    operation: string;
    provider: string;
    duration: number;
    tokens?: number;
    success: boolean;
    cacheHit?: boolean;
  }> = [];

  beforeAll(async () => {
    const { createFixedTestApp } = await import('../helpers/test-server-fixed');
    app = await createFixedTestApp();
    
    // Set up test data
    await setupTestData();
  });

  afterAll(async () => {
    // Generate AI performance report
    generateAIPerformanceReport();
    
    const { clearFixedTestApp } = await import('../helpers/test-server-fixed');
    clearFixedTestApp();
  });

  describe('Resume Analysis Performance', () => {
    test('should analyze resume within performance thresholds', async () => {
      const resumeContent = testResumeContent.softwareEngineer;
      const startTime = performance.now();

      const response = await request(app)
        .post('/api/resumes')
        .attach('file', Buffer.from(resumeContent), 'performance-test.txt')
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Performance assertions for resume analysis
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      expect(response.body.resume.analyzedData).toBeTruthy();
      expect(response.body.resume.analyzedData.skills).toBeInstanceOf(Array);
      
      recordAIMetric('resume_analysis', 'hybrid', duration, 0, true);
      testResumeIds.push(response.body.resume.id);
    });

    test('should handle batch resume analysis efficiently', async () => {
      const batchSize = 5;
      const resumeContents = [
        testResumeContent.softwareEngineer,
        testResumeContent.dataScientist,
        testResumeContent.projectManager,
        testResumeContent.softwareEngineer.replace('John Doe', 'Alice Smith'),
        testResumeContent.dataScientist.replace('Jane Smith', 'Bob Johnson')
      ];

      const startTime = performance.now();
      const uploadPromises = resumeContents.map((content, i) =>
        request(app)
          .post('/api/resumes')
          .attach('file', Buffer.from(content), `batch-resume-${i}.txt`)
          .expect(200)
      );

      const responses = await Promise.all(uploadPromises);
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgDurationPerResume = duration / batchSize;

      // Performance assertions for batch analysis
      expect(avgDurationPerResume).toBeLessThan(10000); // Average < 10 seconds per resume
      expect(duration).toBeLessThan(45000); // Total batch time < 45 seconds
      
      responses.forEach(response => {
        expect(response.body.resume.analyzedData).toBeTruthy();
      });

      recordAIMetric('batch_resume_analysis', 'hybrid', avgDurationPerResume, 0, true);
    });

    test('should demonstrate AI provider fallback performance', async () => {
      // Test with different AI provider configurations
      const providers = ['groq', 'openai', 'anthropic'];
      const performanceResults: Record<string, number> = {};

      for (const provider of providers) {
        // Mock provider-specific behavior
        process.env[`TEST_AI_PROVIDER`] = provider;
        
        const startTime = performance.now();
        
        const response = await request(app)
          .post('/api/resumes')
          .attach('file', Buffer.from(testResumeContent.softwareEngineer), `${provider}-test.txt`)
          .expect(200);

        const endTime = performance.now();
        const duration = endTime - startTime;
        performanceResults[provider] = duration;

        recordAIMetric('resume_analysis', provider, duration, 0, true);
        expect(response.body.resume.analyzedData).toBeTruthy();
      }

      // Analyze provider performance differences
      const durations = Object.values(performanceResults);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxVariation = Math.max(...durations) - Math.min(...durations);

      // Provider variation should be reasonable
      expect(maxVariation).toBeLessThan(avgDuration * 0.5); // Max 50% variation
      
      console.log('AI Provider Performance Comparison:', performanceResults);
    });
  });

  describe('Job Analysis Performance', () => {
    test('should analyze job descriptions quickly', async () => {
      const jobData = testJobDescriptions[0];
      const startTime = performance.now();

      const response = await request(app)
        .post('/api/job-descriptions')
        .send({
          title: jobData.title,
          description: jobData.description
        })
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
      expect(response.body.jobDescription.analyzedData).toBeTruthy();
      
      recordAIMetric('job_analysis', 'hybrid', duration, 0, true);
      testJobId = response.body.jobDescription.id;
    });

    test('should perform bias analysis efficiently', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not available');
      }

      const startTime = performance.now();

      const response = await request(app)
        .post(`/api/analysis/analyze-bias/${testJobId}`)
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(8000); // Should complete within 8 seconds
      expect(response.body.biasAnalysis).toBeTruthy();
      expect(typeof response.body.biasAnalysis.biasConfidenceScore).toBe('number');
      
      recordAIMetric('bias_analysis', 'hybrid', duration, 0, true);
    });
  });

  describe('Matching Algorithm Performance', () => {
    test('should perform resume-job matching within time limits', async () => {
      if (!testJobId || testResumeIds.length === 0) {
        throw new Error('Test data not available');
      }

      const startTime = performance.now();

      const response = await request(app)
        .post(`/api/analysis/analyze/${testJobId}`)
        .send({})
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;
      const resultsCount = response.body.results.length;
      const avgTimePerMatch = duration / Math.max(resultsCount, 1);

      // Performance assertions for matching
      expect(duration).toBeLessThan(20000); // Should complete within 20 seconds
      expect(avgTimePerMatch).toBeLessThan(3000); // Average < 3 seconds per match
      expect(resultsCount).toBeGreaterThan(0);

      // Verify match quality
      response.body.results.forEach((result: any) => {
        expect(result.matchPercentage).toBeGreaterThanOrEqual(0);
        expect(result.matchPercentage).toBeLessThanOrEqual(100);
        expect(result.matchedSkills).toBeInstanceOf(Array);
      });

      recordAIMetric('matching_analysis', 'hybrid', avgTimePerMatch, 0, true);
    });

    test('should handle large-scale matching efficiently', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not available');
      }

      // Create additional test resumes for large-scale testing
      const additionalResumes = 15;
      const resumeCreationPromises = Array(additionalResumes).fill(null).map((_, i) =>
        request(app)
          .post('/api/resumes')
          .attach('file', Buffer.from(
            testResumeContent.softwareEngineer.replace('John Doe', `Test Candidate ${i}`)
          ), `large-scale-${i}.txt`)
          .expect(200)
      );

      await Promise.all(resumeCreationPromises);

      const startTime = performance.now();

      const response = await request(app)
        .post(`/api/analysis/analyze/${testJobId}`)
        .send({})
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;
      const resultsCount = response.body.results.length;
      const avgTimePerMatch = duration / resultsCount;

      // Performance assertions for large-scale matching
      expect(duration).toBeLessThan(60000); // Should complete within 60 seconds
      expect(avgTimePerMatch).toBeLessThan(2000); // Average < 2 seconds per match
      expect(resultsCount).toBeGreaterThan(additionalResumes);

      recordAIMetric('large_scale_matching', 'hybrid', avgTimePerMatch, 0, true);
      
      console.log(`Large-scale matching: ${resultsCount} matches in ${duration.toFixed(0)}ms`);
    });
  });

  describe('Interview Question Generation Performance', () => {
    test('should generate interview questions within time limits', async () => {
      if (!testJobId || testResumeIds.length === 0) {
        throw new Error('Test data not available');
      }

      const resumeId = testResumeIds[0];
      const startTime = performance.now();

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${resumeId}/${testJobId}`)
        .expect(200);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(12000); // Should complete within 12 seconds
      expect(response.body.questions).toBeInstanceOf(Array);
      expect(response.body.questions.length).toBeGreaterThan(0);

      // Verify question quality
      response.body.questions.forEach((q: any) => {
        expect(q.question).toBeTruthy();
        expect(q.category).toBeTruthy();
        expect(q.difficulty).toBeTruthy();
      });

      recordAIMetric('interview_generation', 'hybrid', duration, 0, true);
    });

    test('should handle batch interview question generation', async () => {
      if (!testJobId || testResumeIds.length < 3) {
        throw new Error('Insufficient test data');
      }

      const batchSize = Math.min(3, testResumeIds.length);
      const startTime = performance.now();

      const questionPromises = testResumeIds.slice(0, batchSize).map(resumeId =>
        request(app)
          .post(`/api/analysis/interview-questions/${resumeId}/${testJobId}`)
          .expect(200)
      );

      const responses = await Promise.all(questionPromises);
      const endTime = performance.now();
      const duration = endTime - startTime;
      const avgDurationPerSet = duration / batchSize;

      expect(avgDurationPerSet).toBeLessThan(8000); // Average < 8 seconds per set
      expect(duration).toBeLessThan(30000); // Total time < 30 seconds

      responses.forEach(response => {
        expect(response.body.questions).toBeInstanceOf(Array);
        expect(response.body.questions.length).toBeGreaterThan(0);
      });

      recordAIMetric('batch_interview_generation', 'hybrid', avgDurationPerSet, 0, true);
    });
  });

  describe('AI Provider Resilience & Caching', () => {
    test('should demonstrate caching performance benefits', async () => {
      const jobData = {
        title: 'Cache Test Position',
        description: 'This is a test job description for caching performance analysis.'
      };

      // First request (no cache)
      const startTime1 = performance.now();
      const response1 = await request(app)
        .post('/api/job-descriptions')
        .send(jobData)
        .expect(200);
      const duration1 = performance.now() - startTime1;

      const jobId = response1.body.jobDescription.id;

      // Second request (should hit cache if implemented)
      const startTime2 = performance.now();
      const response2 = await request(app)
        .get(`/api/job-descriptions/${jobId}`)
        .expect(200);
      const duration2 = performance.now() - startTime2;

      recordAIMetric('job_creation', 'hybrid', duration1, 0, true, false);
      recordAIMetric('job_retrieval', 'cache', duration2, 0, true, true);

      // Cache should significantly improve performance
      expect(duration2).toBeLessThan(duration1 * 0.2); // Cache should be at least 5x faster
      
      console.log(`Cache performance: Creation ${duration1.toFixed(0)}ms, Retrieval ${duration2.toFixed(0)}ms`);
    });

    test('should handle AI provider timeouts gracefully', async () => {
      // Simulate timeout scenario
      const originalTimeout = process.env.AI_PROVIDER_TIMEOUT;
      process.env.AI_PROVIDER_TIMEOUT = '1000'; // Very short timeout

      const startTime = performance.now();

      try {
        const response = await request(app)
          .post('/api/resumes')
          .attach('file', Buffer.from(testResumeContent.softwareEngineer), 'timeout-test.txt')
          .timeout(5000); // Allow some time for graceful handling

        const endTime = performance.now();
        const duration = endTime - startTime;

        // Should either succeed with fallback or fail gracefully
        if (response.status === 200) {
          expect(response.body.resume.analyzedData).toBeTruthy();
          recordAIMetric('timeout_fallback', 'fallback', duration, 0, true);
        } else {
          expect(duration).toBeLessThan(10000); // Should fail quickly
          recordAIMetric('timeout_handling', 'error', duration, 0, false);
        }
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        recordAIMetric('timeout_error', 'error', duration, 0, false);
        // Timeout errors are acceptable in this test
        expect(duration).toBeLessThan(10000);
      } finally {
        // Restore original timeout
        if (originalTimeout) {
          process.env.AI_PROVIDER_TIMEOUT = originalTimeout;
        } else {
          delete process.env.AI_PROVIDER_TIMEOUT;
        }
      }
    });
  });

  // Helper functions
  async function setupTestData(): Promise<void> {
    // Create initial test data
    const jobResponse = await request(app)
      .post('/api/job-descriptions')
      .send({
        title: 'Performance Test Job',
        description: testJobDescriptions[0].description
      })
      .expect(200);
    
    testJobId = jobResponse.body.jobDescription.id;

    // Upload a few initial resumes
    const resumeResponse = await request(app)
      .post('/api/resumes')
      .attach('file', Buffer.from(testResumeContent.softwareEngineer), 'initial-resume.txt')
      .expect(200);
    
    testResumeIds.push(resumeResponse.body.resume.id);
  }

  function recordAIMetric(
    operation: string, 
    provider: string, 
    duration: number, 
    tokens: number, 
    success: boolean, 
    cacheHit?: boolean
  ): void {
    aiMetrics.push({
      operation,
      provider,
      duration,
      tokens: tokens || undefined,
      success,
      cacheHit
    });
  }

  function generateAIPerformanceReport(): void {
    const successfulMetrics = aiMetrics.filter(m => m.success);
    const failedMetrics = aiMetrics.filter(m => !m.success);
    
    const report = {
      testRunDate: new Date().toISOString(),
      summary: {
        totalOperations: aiMetrics.length,
        successfulOperations: successfulMetrics.length,
        failedOperations: failedMetrics.length,
        successRate: (successfulMetrics.length / aiMetrics.length) * 100,
        avgDuration: successfulMetrics.reduce((acc, m) => acc + m.duration, 0) / successfulMetrics.length,
        maxDuration: Math.max(...successfulMetrics.map(m => m.duration)),
        minDuration: Math.min(...successfulMetrics.map(m => m.duration))
      },
      operationBreakdown: generateOperationBreakdown(),
      providerComparison: generateProviderComparison(),
      recommendations: generateAIRecommendations()
    };

    console.log('🤖 AI Performance Test Report:', JSON.stringify(report, null, 2));
  }

  function generateOperationBreakdown(): Record<string, any> {
    const breakdown: Record<string, any> = {};
    
    aiMetrics.forEach(metric => {
      if (!breakdown[metric.operation]) {
        breakdown[metric.operation] = {
          count: 0,
          avgDuration: 0,
          successRate: 0,
          totalDuration: 0
        };
      }
      
      breakdown[metric.operation].count++;
      breakdown[metric.operation].totalDuration += metric.duration;
      
      if (metric.success) {
        breakdown[metric.operation].successRate++;
      }
    });
    
    // Calculate averages and success rates
    Object.keys(breakdown).forEach(operation => {
      const data = breakdown[operation];
      data.avgDuration = data.totalDuration / data.count;
      data.successRate = (data.successRate / data.count) * 100;
      delete data.totalDuration; // Clean up
    });
    
    return breakdown;
  }

  function generateProviderComparison(): Record<string, any> {
    const comparison: Record<string, any> = {};
    
    aiMetrics.forEach(metric => {
      if (!comparison[metric.provider]) {
        comparison[metric.provider] = {
          operations: 0,
          avgDuration: 0,
          successRate: 0,
          totalDuration: 0,
          successes: 0
        };
      }
      
      comparison[metric.provider].operations++;
      comparison[metric.provider].totalDuration += metric.duration;
      
      if (metric.success) {
        comparison[metric.provider].successes++;
      }
    });
    
    // Calculate averages and success rates
    Object.keys(comparison).forEach(provider => {
      const data = comparison[provider];
      data.avgDuration = data.totalDuration / data.operations;
      data.successRate = (data.successes / data.operations) * 100;
      delete data.totalDuration;
      delete data.successes;
    });
    
    return comparison;
  }

  function generateAIRecommendations(): string[] {
    const recommendations: string[] = [];
    
    const avgDuration = successfulMetrics.reduce((acc, m) => acc + m.duration, 0) / successfulMetrics.length;
    const successRate = (successfulMetrics.length / aiMetrics.length) * 100;
    
    if (avgDuration > 8000) {
      recommendations.push('AI operations are taking longer than optimal - consider optimization or provider tuning');
    }
    
    if (successRate < 95) {
      recommendations.push('AI operation success rate below 95% - implement better error handling and fallbacks');
    }
    
    const cacheMetrics = aiMetrics.filter(m => m.cacheHit);
    if (cacheMetrics.length === 0) {
      recommendations.push('No cache hits detected - implement AI response caching for better performance');
    }
    
    const timeoutMetrics = aiMetrics.filter(m => m.operation.includes('timeout'));
    if (timeoutMetrics.length > 0) {
      recommendations.push('Consider implementing circuit breaker pattern for better resilience');
    }
    
    return recommendations;
  }

  const successfulMetrics = aiMetrics.filter(m => m.success);
});