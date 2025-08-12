/**
 * Load Testing for Concurrent Operations
 * Tests system performance under high concurrent load
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { performance } from 'perf_hooks';
import { API_ROUTES } from '../../shared/api-contracts';

describe('Concurrent Operations Load Tests', () => {
  let app: any;
  const authToken = 'mock-load-test-token';
  const loadTestMetrics: Array<{
    testName: string;
    concurrency: number;
    duration: number;
    successCount: number;
    errorCount: number;
    avgResponseTime: number;
    maxResponseTime: number;
    minResponseTime: number;
    throughput: number; // requests per second
  }> = [];

  beforeAll(async () => {
    const { createFixedTestApp } = await import('../helpers/test-server-fixed');
    app = await createFixedTestApp();
  });

  afterAll(async () => {
    generateLoadTestReport();
    
    const { clearFixedTestApp } = await import('../helpers/test-server-fixed');
    clearFixedTestApp();
  });

  describe('Health Endpoint Load Tests', () => {
    test('should handle high concurrent health checks', async () => {
      const concurrency = 100;
      const testName = 'health_check_load';

      const startTime = performance.now();
      
      const promises = Array(concurrency).fill(null).map(() => 
        request(app)
          .get(API_ROUTES.HEALTH.BASIC)
          .then(res => ({ success: true, responseTime: performance.now(), status: res.status }))
          .catch(err => ({ success: false, responseTime: performance.now(), error: err }))
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();
      
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // Performance assertions
      expect(successCount).toBeGreaterThan(concurrency * 0.95); // 95% success rate
      expect(duration).toBeLessThan(5000); // Complete within 5 seconds
      expect(successCount + errorCount).toBe(concurrency);
    });

    test('should maintain response time under load', async () => {
      const concurrency = 50;
      const iterations = 3;
      const testName = 'health_response_time';

      const allResults: any[] = [];

      for (let iteration = 0; iteration < iterations; iteration++) {
        const startTime = performance.now();
        
        const promises = Array(concurrency).fill(null).map(() => {
          const requestStart = performance.now();
          return request(app)
            .get(API_ROUTES.HEALTH.BASIC)
            .then(res => ({
              success: true,
              responseTime: performance.now() - requestStart,
              status: res.status
            }))
            .catch(err => ({
              success: false,
              responseTime: performance.now() - requestStart,
              error: err
            }));
        });

        const results = await Promise.all(promises);
        allResults.push(...results);
        
        // Brief pause between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const successfulResults = allResults.filter(r => r.success);
      const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length;
      const maxResponseTime = Math.max(...successfulResults.map(r => r.responseTime));

      recordLoadTestMetric(testName, concurrency * iterations, 
        performance.now() - (performance.now() - (iterations * 1000)), 
        successfulResults.length, allResults.length - successfulResults.length, allResults);

      // Response time should remain reasonable under load
      expect(avgResponseTime).toBeLessThan(1000); // Average < 1 second
      expect(maxResponseTime).toBeLessThan(3000); // Max < 3 seconds
    });
  });

  describe('Job Description Load Tests', () => {
    test('should handle concurrent job creation', async () => {
      const concurrency = 20;
      const testName = 'job_creation_load';

      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map((_, i) => {
        const requestStart = performance.now();
        return request(app)
          .post(API_ROUTES.JOBS.CREATE)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Load Test Job ${i}`,
            description: `This is load test job number ${i} created to test concurrent job creation performance.`
          })
          .then(res => ({
            success: res.status === 200,
            responseTime: performance.now() - requestStart,
            status: res.status,
            jobId: res.body?.jobDescription?.id
          }))
          .catch(err => ({
            success: false,
            responseTime: performance.now() - requestStart,
            error: err
          }));
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // Assertions for job creation load
      expect(successCount).toBeGreaterThan(concurrency * 0.8); // 80% success rate minimum
      expect(duration).toBeLessThan(15000); // Complete within 15 seconds
    });

    test('should handle concurrent job retrieval', async () => {
      // First create a job to retrieve
      const jobResponse = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Load Test Job for Retrieval',
          description: 'Job created for load testing retrieval operations'
        })
        .expect(200);

      const jobId = jobResponse.body.jobDescription.id;
      const concurrency = 50;
      const testName = 'job_retrieval_load';

      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map(() => {
        const requestStart = performance.now();
        return request(app)
          .get(`/api/job-descriptions/${jobId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .then(res => ({
            success: res.status === 200,
            responseTime: performance.now() - requestStart,
            status: res.status
          }))
          .catch(err => ({
            success: false,
            responseTime: performance.now() - requestStart,
            error: err
          }));
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // Read operations should have higher success rates
      expect(successCount).toBeGreaterThan(concurrency * 0.95); // 95% success rate
      expect(duration).toBeLessThan(8000); // Complete within 8 seconds
    });
  });

  describe('Resume Upload Load Tests', () => {
    test('should handle concurrent resume uploads', async () => {
      const concurrency = 15; // Lower for file uploads
      const testName = 'resume_upload_load';

      const resumeContent = `
        Load Test Resume
        Software Engineer
        email@example.com

        SKILLS
        - JavaScript, TypeScript, React
        - Node.js, Express, PostgreSQL
        - AWS, Docker, Kubernetes

        EXPERIENCE
        Senior Developer | Company | 2020-2024
        - Built scalable applications
        - Led development team
        - Implemented best practices
      `;

      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map((_, i) => {
        const requestStart = performance.now();
        return request(app)
          .post(API_ROUTES.RESUMES.UPLOAD)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(resumeContent), `load-test-resume-${i}.txt`)
          .then(res => ({
            success: res.status === 200,
            responseTime: performance.now() - requestStart,
            status: res.status,
            resumeId: res.body?.resume?.id
          }))
          .catch(err => ({
            success: false,
            responseTime: performance.now() - requestStart,
            error: err
          }));
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // File upload operations are more resource intensive
      expect(successCount).toBeGreaterThan(concurrency * 0.7); // 70% success rate minimum
      expect(duration).toBeLessThan(30000); // Complete within 30 seconds
    });

    test('should handle large file uploads under load', async () => {
      const concurrency = 5; // Very low for large files
      const testName = 'large_file_upload_load';

      // Create larger resume content (not too large to avoid timeouts)
      const largeResumeContent = `
        Large Resume Content for Load Testing
        ${'This is repeated content to make the file larger. '.repeat(1000)}
        
        Professional Summary with extensive details about experience and qualifications.
        ${'Additional detailed information about projects and achievements. '.repeat(500)}
      `;

      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map((_, i) => {
        const requestStart = performance.now();
        return request(app)
          .post(API_ROUTES.RESUMES.UPLOAD)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(largeResumeContent), `large-resume-${i}.txt`)
          .timeout(20000) // Longer timeout for large files
          .then(res => ({
            success: res.status === 200,
            responseTime: performance.now() - requestStart,
            status: res.status
          }))
          .catch(err => ({
            success: false,
            responseTime: performance.now() - requestStart,
            error: err
          }));
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // Large file uploads should still succeed but may take longer
      expect(successCount).toBeGreaterThan(concurrency * 0.6); // 60% success rate minimum
      expect(duration).toBeLessThan(60000); // Complete within 60 seconds
    });
  });

  describe('Analysis Operation Load Tests', () => {
    let testJobId: number;
    let testResumeIds: number[];

    test.beforeAll(async () => {
      // Set up test data for analysis operations
      const jobResponse = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Load Test Analysis Job',
          description: 'Job for testing analysis operations under load with React, Node.js, TypeScript requirements'
        })
        .expect(200);

      testJobId = jobResponse.body.jobDescription.id;

      // Create multiple resumes for analysis
      const resumePromises = Array(10).fill(null).map((_, i) =>
        request(app)
          .post(API_ROUTES.RESUMES.UPLOAD)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(`Resume ${i} with React and Node.js experience`), `analysis-resume-${i}.txt`)
          .expect(200)
      );

      const resumeResponses = await Promise.all(resumePromises);
      testResumeIds = resumeResponses.map(res => res.body.resume.id);
    });

    test('should handle concurrent bias analysis requests', async () => {
      const concurrency = 10;
      const testName = 'bias_analysis_load';

      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map(() => {
        const requestStart = performance.now();
        return request(app)
          .post(`/api/analysis/analyze-bias/${testJobId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .then(res => ({
            success: res.status === 200,
            responseTime: performance.now() - requestStart,
            status: res.status
          }))
          .catch(err => ({
            success: false,
            responseTime: performance.now() - requestStart,
            error: err
          }));
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // AI operations might have lower success rates due to API limits
      expect(successCount).toBeGreaterThan(concurrency * 0.5); // 50% success rate minimum
      expect(duration).toBeLessThan(45000); // Complete within 45 seconds
    });

    test('should handle concurrent matching analysis', async () => {
      const concurrency = 8; // Lower for complex operations
      const testName = 'matching_analysis_load';

      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map(() => {
        const requestStart = performance.now();
        return request(app)
          .post(`/api/analysis/analyze/${testJobId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .timeout(25000) // Longer timeout for complex analysis
          .then(res => ({
            success: res.status === 200,
            responseTime: performance.now() - requestStart,
            status: res.status,
            resultCount: res.body?.results?.length || 0
          }))
          .catch(err => ({
            success: false,
            responseTime: performance.now() - requestStart,
            error: err
          }));
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // Complex analysis operations
      expect(successCount).toBeGreaterThan(concurrency * 0.4); // 40% success rate minimum
      expect(duration).toBeLessThan(120000); // Complete within 2 minutes
    });

    test('should handle concurrent interview question generation', async () => {
      const concurrency = 6;
      const testName = 'interview_generation_load';

      const startTime = performance.now();

      const promises = Array(concurrency).fill(null).map((_, i) => {
        const resumeId = testResumeIds[i % testResumeIds.length];
        const requestStart = performance.now();
        
        return request(app)
          .post(`/api/analysis/interview-questions/${resumeId}/${testJobId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .timeout(30000) // Long timeout for AI generation
          .then(res => ({
            success: res.status === 200,
            responseTime: performance.now() - requestStart,
            status: res.status,
            questionCount: res.body?.questions?.length || 0
          }))
          .catch(err => ({
            success: false,
            responseTime: performance.now() - requestStart,
            error: err
          }));
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const duration = endTime - startTime;

      recordLoadTestMetric(testName, concurrency, duration, successCount, errorCount, results);

      // AI-powered operations may have variable success rates
      expect(successCount).toBeGreaterThan(concurrency * 0.3); // 30% success rate minimum
      expect(duration).toBeLessThan(180000); // Complete within 3 minutes
    });
  });

  describe('Mixed Workload Tests', () => {
    test('should handle mixed concurrent operations', async () => {
      const testName = 'mixed_workload';
      const operationsPerType = 5;

      const startTime = performance.now();

      // Create different types of operations
      const healthChecks = Array(operationsPerType).fill(null).map(() =>
        request(app).get(API_ROUTES.HEALTH.BASIC)
      );

      const jobCreations = Array(operationsPerType).fill(null).map((_, i) =>
        request(app)
          .post(API_ROUTES.JOBS.CREATE)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Mixed Load Job ${i}`,
            description: `Mixed workload test job ${i}`
          })
      );

      const resumeUploads = Array(operationsPerType).fill(null).map((_, i) =>
        request(app)
          .post(API_ROUTES.RESUMES.UPLOAD)
          .set('Authorization', `Bearer ${authToken}`)
          .attach('file', Buffer.from(`Mixed workload resume ${i}`), `mixed-resume-${i}.txt`)
      );

      // Execute all operations concurrently
      const allPromises = [
        ...healthChecks.map(p => p.then(res => ({ type: 'health', success: res.status === 200, responseTime: performance.now() }))),
        ...jobCreations.map(p => p.then(res => ({ type: 'job', success: res.status === 200, responseTime: performance.now() }))),
        ...resumeUploads.map(p => p.then(res => ({ type: 'resume', success: res.status === 200, responseTime: performance.now() })))
      ];

      const results = await Promise.all(allPromises.map(p => 
        p.catch(err => ({ type: 'error', success: false, responseTime: performance.now(), error: err }))
      ));

      const endTime = performance.now();
      const duration = endTime - startTime;
      const totalOperations = operationsPerType * 3;

      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;

      recordLoadTestMetric(testName, totalOperations, duration, successCount, errorCount, results);

      // Mixed workload should handle reasonable load
      expect(successCount).toBeGreaterThan(totalOperations * 0.6); // 60% success rate
      expect(duration).toBeLessThan(45000); // Complete within 45 seconds

      // Check distribution of operations
      const healthSuccess = results.filter(r => r.type === 'health' && r.success).length;
      const jobSuccess = results.filter(r => r.type === 'job' && r.success).length;
      const resumeSuccess = results.filter(r => r.type === 'resume' && r.success).length;

      expect(healthSuccess).toBeGreaterThan(0); // At least some health checks succeeded
      expect(jobSuccess).toBeGreaterThan(0); // At least some job creations succeeded
      expect(resumeSuccess).toBeGreaterThan(0); // At least some resume uploads succeeded
    });
  });

  describe('Stress Tests', () => {
    test('should handle burst traffic patterns', async () => {
      const testName = 'burst_traffic';
      const burstSize = 25;
      const burstCount = 3;
      const burstInterval = 2000; // 2 seconds between bursts

      const allResults: any[] = [];
      const startTime = performance.now();

      for (let burst = 0; burst < burstCount; burst++) {
        const burstStartTime = performance.now();
        
        const burstPromises = Array(burstSize).fill(null).map(() =>
          request(app)
            .get(API_ROUTES.HEALTH.BASIC)
            .then(res => ({
              success: res.status === 200,
              responseTime: performance.now() - burstStartTime,
              burst: burst + 1
            }))
            .catch(err => ({
              success: false,
              responseTime: performance.now() - burstStartTime,
              burst: burst + 1,
              error: err
            }))
        );

        const burstResults = await Promise.all(burstPromises);
        allResults.push(...burstResults);

        // Wait before next burst (except for last burst)
        if (burst < burstCount - 1) {
          await new Promise(resolve => setTimeout(resolve, burstInterval));
        }
      }

      const endTime = performance.now();
      const duration = endTime - startTime;
      const totalOperations = burstSize * burstCount;

      const successCount = allResults.filter(r => r.success).length;
      const errorCount = allResults.filter(r => !r.success).length;

      recordLoadTestMetric(testName, totalOperations, duration, successCount, errorCount, allResults);

      // Burst traffic should be handled reasonably
      expect(successCount).toBeGreaterThan(totalOperations * 0.7); // 70% success rate
      
      // Check that each burst had some successful requests
      for (let burst = 1; burst <= burstCount; burst++) {
        const burstSuccesses = allResults.filter(r => r.burst === burst && r.success).length;
        expect(burstSuccesses).toBeGreaterThan(burstSize * 0.5); // At least 50% success per burst
      }
    });
  });

  // Helper functions
  function recordLoadTestMetric(
    testName: string,
    concurrency: number,
    duration: number,
    successCount: number,
    errorCount: number,
    results: any[]
  ): void {
    const successfulResults = results.filter(r => r.success && r.responseTime);
    const responseTimes = successfulResults.map(r => r.responseTime);
    
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
    
    const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
    const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
    const throughput = (successCount / (duration / 1000)); // requests per second

    loadTestMetrics.push({
      testName,
      concurrency,
      duration,
      successCount,
      errorCount,
      avgResponseTime,
      maxResponseTime,
      minResponseTime,
      throughput
    });
  }

  function generateLoadTestReport(): void {
    const report = {
      testRunDate: new Date().toISOString(),
      summary: {
        totalTests: loadTestMetrics.length,
        totalOperations: loadTestMetrics.reduce((sum, m) => sum + m.concurrency, 0),
        totalSuccesses: loadTestMetrics.reduce((sum, m) => sum + m.successCount, 0),
        totalErrors: loadTestMetrics.reduce((sum, m) => sum + m.errorCount, 0),
        overallSuccessRate: loadTestMetrics.reduce((sum, m) => sum + m.successCount, 0) / 
          loadTestMetrics.reduce((sum, m) => sum + (m.successCount + m.errorCount), 0) * 100,
        avgThroughput: loadTestMetrics.reduce((sum, m) => sum + m.throughput, 0) / loadTestMetrics.length,
        maxThroughput: Math.max(...loadTestMetrics.map(m => m.throughput))
      },
      detailedResults: loadTestMetrics,
      performanceAnalysis: analyzePerformance(),
      recommendations: generateLoadTestRecommendations()
    };

    console.log('🚀 Load Test Report:', JSON.stringify(report, null, 2));
  }

  function analyzePerformance(): any {
    const healthTests = loadTestMetrics.filter(m => m.testName.includes('health'));
    const crudTests = loadTestMetrics.filter(m => m.testName.includes('job') || m.testName.includes('resume'));
    const analysisTests = loadTestMetrics.filter(m => m.testName.includes('analysis') || m.testName.includes('bias'));

    return {
      healthEndpoints: {
        avgSuccessRate: healthTests.reduce((sum, t) => sum + (t.successCount / (t.successCount + t.errorCount)), 0) / healthTests.length * 100,
        avgThroughput: healthTests.reduce((sum, t) => sum + t.throughput, 0) / healthTests.length,
        avgResponseTime: healthTests.reduce((sum, t) => sum + t.avgResponseTime, 0) / healthTests.length
      },
      crudOperations: {
        avgSuccessRate: crudTests.reduce((sum, t) => sum + (t.successCount / (t.successCount + t.errorCount)), 0) / crudTests.length * 100,
        avgThroughput: crudTests.reduce((sum, t) => sum + t.throughput, 0) / crudTests.length,
        avgResponseTime: crudTests.reduce((sum, t) => sum + t.avgResponseTime, 0) / crudTests.length
      },
      analysisOperations: {
        avgSuccessRate: analysisTests.reduce((sum, t) => sum + (t.successCount / (t.successCount + t.errorCount)), 0) / analysisTests.length * 100,
        avgThroughput: analysisTests.reduce((sum, t) => sum + t.throughput, 0) / analysisTests.length,
        avgResponseTime: analysisTests.reduce((sum, t) => sum + t.avgResponseTime, 0) / analysisTests.length
      }
    };
  }

  function generateLoadTestRecommendations(): string[] {
    const recommendations: string[] = [];
    const overallSuccessRate = loadTestMetrics.reduce((sum, m) => sum + m.successCount, 0) / 
      loadTestMetrics.reduce((sum, m) => sum + (m.successCount + m.errorCount), 0) * 100;

    if (overallSuccessRate < 80) {
      recommendations.push('Overall success rate is below 80% - consider scaling infrastructure or optimizing bottlenecks');
    }

    const avgResponseTime = loadTestMetrics.reduce((sum, m) => sum + m.avgResponseTime, 0) / loadTestMetrics.length;
    if (avgResponseTime > 2000) {
      recommendations.push('Average response time exceeds 2 seconds - investigate performance bottlenecks');
    }

    const maxConcurrency = Math.max(...loadTestMetrics.map(m => m.concurrency));
    const highConcurrencyTests = loadTestMetrics.filter(m => m.concurrency >= maxConcurrency * 0.8);
    const highConcurrencySuccessRate = highConcurrencyTests.reduce((sum, m) => sum + m.successCount, 0) / 
      highConcurrencyTests.reduce((sum, m) => sum + (m.successCount + m.errorCount), 0) * 100;

    if (highConcurrencySuccessRate < 70) {
      recommendations.push('High concurrency operations have low success rates - implement better resource management and queuing');
    }

    const analysisTests = loadTestMetrics.filter(m => m.testName.includes('analysis'));
    if (analysisTests.length > 0) {
      const analysisSuccessRate = analysisTests.reduce((sum, m) => sum + m.successCount, 0) / 
        analysisTests.reduce((sum, m) => sum + (m.successCount + m.errorCount), 0) * 100;
      
      if (analysisSuccessRate < 60) {
        recommendations.push('AI analysis operations have low success rates - implement circuit breakers and better error handling');
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('System performed well under load - consider increasing test concurrency to find limits');
    }

    return recommendations;
  }
});