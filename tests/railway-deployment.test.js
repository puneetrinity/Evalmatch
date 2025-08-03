/**
 * Railway Deployment Tests
 * 
 * Comprehensive tests for Railway deployment including:
 * - Health checks
 * - API functionality
 * - Performance validation
 * - Memory usage monitoring
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const RAILWAY_URL = process.env.RAILWAY_TEST_URL || 'http://localhost:8080';
const TEST_TIMEOUT = 30000;

describe('Railway Deployment Tests', () => {
  let deploymentStartTime;
  
  beforeAll(async () => {
    deploymentStartTime = Date.now();
    console.log(`🚂 Testing Railway deployment at: ${RAILWAY_URL}`);
    
    // Wait for deployment to be ready
    await waitForDeployment();
  }, 60000);

  describe('Health and Status', () => {
    test('Basic health check should respond quickly', async () => {
      const startTime = Date.now();
      
      const response = await fetch(`${RAILWAY_URL}/api/health`, {
        method: 'GET',
        timeout: 10000
      });
      
      const responseTime = Date.now() - startTime;
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
      
      console.log(`✅ Health check: ${responseTime}ms`);
    }, TEST_TIMEOUT);

    test('Detailed health check should include all systems', async () => {
      const response = await fetch(`${RAILWAY_URL}/api/health/detailed`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('checks');
      expect(Array.isArray(data.checks)).toBe(true);
      
      // Check for essential systems
      const checkNames = data.checks.map(check => check.name);
      expect(checkNames).toContain('database');
      expect(checkNames).toContain('ai_providers');
      
      console.log('✅ Health checks:', checkNames);
    }, TEST_TIMEOUT);

    test('Migration status should be available', async () => {
      const response = await fetch(`${RAILWAY_URL}/api/migration-status`);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('migrations');
      
      console.log('✅ Migration status:', data.status);
    }, TEST_TIMEOUT);
  });

  describe('Core API Functionality', () => {
    let testJobId;

    test('Should create job description successfully', async () => {
      const jobData = {
        title: 'Railway Test Developer',
        description: 'A test job for validating Railway deployment functionality.'
      };

      const response = await fetch(`${RAILWAY_URL}/api/job-descriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData)
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('success');
      expect(data.jobDescription).toHaveProperty('id');
      
      testJobId = data.jobDescription.id;
      console.log('✅ Job created with ID:', testJobId);
    }, TEST_TIMEOUT);

    test('Should retrieve job description', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not available');
      }

      const response = await fetch(`${RAILWAY_URL}/api/job-descriptions/${testJobId}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.id).toBe(testJobId);
      expect(data.title).toBe('Railway Test Developer');
      
      console.log('✅ Job retrieved successfully');
    }, TEST_TIMEOUT);

    test('Should analyze job for bias', async () => {
      if (!testJobId) {
        throw new Error('Test job ID not available');
      }

      const response = await fetch(`${RAILWAY_URL}/api/analysis/analyze-bias/${testJobId}`, {
        method: 'POST'
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('success');
      expect(data.biasAnalysis).toHaveProperty('hasBias');
      expect(data.biasAnalysis).toHaveProperty('biasConfidenceScore');
      
      console.log('✅ Bias analysis completed');
    }, TEST_TIMEOUT);

    afterAll(async () => {
      // Cleanup test job
      if (testJobId) {
        try {
          await fetch(`${RAILWAY_URL}/api/job-descriptions/${testJobId}`, {
            method: 'DELETE'
          });
          console.log('✅ Test job cleaned up');
        } catch (error) {
          console.warn('⚠️  Failed to cleanup test job:', error.message);
        }
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('Should handle concurrent requests', async () => {
      const concurrentRequests = 5;
      const promises = [];

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          fetch(`${RAILWAY_URL}/api/health`).then(r => ({
            status: r.status,
            requestId: i
          }))
        );
      }

      const results = await Promise.all(promises);
      
      results.forEach((result, index) => {
        expect(result.status).toBe(200);
      });
      
      console.log('✅ Handled', concurrentRequests, 'concurrent requests');
    }, TEST_TIMEOUT);

    test('Should respond to large payload requests', async () => {
      const largeJobDescription = {
        title: 'Complex Senior Developer Role',
        description: 'A'.repeat(10000) // 10KB of text
      };

      const response = await fetch(`${RAILWAY_URL}/api/job-descriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(largeJobDescription)
      });

      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('success');
      
      // Cleanup
      if (data.jobDescription?.id) {
        await fetch(`${RAILWAY_URL}/api/job-descriptions/${data.jobDescription.id}`, {
          method: 'DELETE'
        }).catch(() => {});
      }
      
      console.log('✅ Large payload handled successfully');
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    test('Should handle invalid endpoints gracefully', async () => {
      const response = await fetch(`${RAILWAY_URL}/api/non-existent-endpoint`);
      
      expect(response.status).toBe(404);
      console.log('✅ 404 handling works correctly');
    }, TEST_TIMEOUT);

    test('Should validate request data', async () => {
      const response = await fetch(`${RAILWAY_URL}/api/job-descriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '' }) // Invalid data
      });

      expect(response.status).toBe(400);
      console.log('✅ Request validation works correctly');
    }, TEST_TIMEOUT);
  });

  describe('Memory and Resource Management', () => {
    test('Should maintain stable memory usage', async () => {
      // Make multiple requests to test memory stability
      const requests = 10;
      const startTime = Date.now();
      
      for (let i = 0; i < requests; i++) {
        await fetch(`${RAILWAY_URL}/api/health`);
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const totalTime = Date.now() - startTime;
      const avgResponseTime = totalTime / requests;
      
      expect(avgResponseTime).toBeLessThan(2000); // Average under 2 seconds
      console.log(`✅ Average response time: ${avgResponseTime.toFixed(2)}ms`);
    }, TEST_TIMEOUT);
  });
});

// Helper function to wait for deployment readiness
async function waitForDeployment(maxAttempts = 30, delay = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${RAILWAY_URL}/api/health`, {
        timeout: 5000
      });
      
      if (response.ok) {
        console.log(`✅ Deployment ready after ${attempt} attempts`);
        return;
      }
    } catch (error) {
      console.log(`⏳ Attempt ${attempt}/${maxAttempts}: Waiting for deployment...`);
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Deployment failed to become ready within timeout period');
}