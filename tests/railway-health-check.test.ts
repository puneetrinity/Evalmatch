/**
 * Railway Health Check Tests
 * Validates that health check endpoints are Railway-compatible
 */

import request from 'supertest';
import app from '../server/index';

describe('Railway Health Check Compatibility', () => {
  describe('Railway-optimized endpoints', () => {
    test('/api/ping should respond immediately with 200', async () => {
      const start = Date.now();
      const response = await request(app).get('/api/ping');
      const responseTime = Date.now() - start;
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('alive');
      expect(responseTime).toBeLessThan(100); // Should be under 100ms
    });

    test('/api/health/railway should be fast and Railway-compatible', async () => {
      const start = Date.now();
      const response = await request(app).get('/api/health/railway');
      const responseTime = Date.now() - start;
      
      expect(response.status).toBe(200); // Should return 200 for Railway deployment
      expect(response.body.success).toBe(true);
      expect(response.body.data.railway.deploymentReady).toBe(true);
      expect(responseTime).toBeLessThan(2000); // Should be under 2 seconds
      
      // Check Railway-specific metadata
      expect(response.body.data.metadata.checkType).toBe('railway');
      expect(response.body.data.metadata.optimizedFor).toBe('Railway deployment validation');
    });

    test('/api/health (basic) should be more permissive for Railway', async () => {
      const start = Date.now();
      const response = await request(app).get('/api/health');
      const responseTime = Date.now() - start;
      
      // Should return 200 even if some services are degraded (Railway-compatible)
      expect([200, 503]).toContain(response.status);
      expect(responseTime).toBeLessThan(5000); // Should be under 5 seconds
      
      if (response.status === 200) {
        expect(response.body.success).toBe(true);
      }
    });
  });

  describe('Response time requirements', () => {
    test('All Railway health endpoints should respond quickly', async () => {
      const endpoints = [
        '/api/ping',
        '/api/health/railway',
        '/api/health'
      ];

      for (const endpoint of endpoints) {
        const start = Date.now();
        const response = await request(app).get(endpoint);
        const responseTime = Date.now() - start;
        
        console.log(`${endpoint}: ${responseTime}ms - Status: ${response.status}`);
        
        // Railway expects fast responses for deployment validation
        if (endpoint === '/api/ping') {
          expect(responseTime).toBeLessThan(100);
        } else if (endpoint === '/api/health/railway') {
          expect(responseTime).toBeLessThan(1000);
        } else {
          expect(responseTime).toBeLessThan(5000);
        }
      }
    });
  });

  describe('Railway deployment scenarios', () => {
    test('Health checks should be permissive during startup phase', async () => {
      // Simulate early startup by checking endpoints shortly after server start
      const response = await request(app).get('/api/health/railway');
      
      // Should return 200 even during startup phase
      expect(response.status).toBe(200);
      expect(response.body.data.railway.deploymentReady).toBe(true);
      
      // May have startup warnings but should still be deployment-ready
      if (response.body.data.warnings) {
        expect(response.body.data.warnings).toContain('Application recently started');
      }
    });

    test('Health check should fail only on critical issues', async () => {
      // This test validates our failure criteria
      const response = await request(app).get('/api/health/railway');
      
      if (response.status === 503) {
        // If it fails, it should be for a critical reason
        expect(response.body.data.issues).toBeDefined();
        expect(response.body.data.issues.some((issue: string) => 
          issue.includes('Critical') || issue.includes('unavailable after startup')
        )).toBe(true);
      }
    });
  });

  describe('Header compatibility', () => {
    test('Health check endpoints should set Railway-compatible headers', async () => {
      const response = await request(app).get('/api/health/railway');
      
      expect(response.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
      expect(response.headers['x-health-check-type']).toBe('railway');
      expect(response.headers['x-request-id']).toMatch(/^railway-\d+$/);
    });

    test('Basic health check should indicate degraded status in headers', async () => {
      const response = await request(app).get('/api/health');
      
      if (response.status === 200 && response.headers['x-health-warning']) {
        expect(['degraded', 'unhealthy-non-critical']).toContain(response.headers['x-health-warning']);
      }
    });
  });

  describe('Error handling', () => {
    test('Health check failures should still provide useful information', async () => {
      // Even if health checks fail, Railway should get meaningful responses
      const response = await request(app).get('/api/health/railway');
      
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.data.uptime).toBeDefined();
      expect(response.body.data.checks).toBeDefined();
    });
  });
});

describe('Health Check Performance Analysis', () => {
  test('Measure and log performance of all health endpoints', async () => {
    const endpoints = [
      { path: '/api/ping', name: 'Ping (minimal)' },
      { path: '/api/health/railway', name: 'Railway (optimized)' },
      { path: '/api/health', name: 'Basic' },
      { path: '/api/health/detailed', name: 'Detailed (comprehensive)' }
    ];

    console.log('\n=== Health Check Performance Analysis ===');
    
    for (const endpoint of endpoints) {
      const measurements = [];
      
      // Take 3 measurements
      for (let i = 0; i < 3; i++) {
        const start = Date.now();
        const response = await request(app).get(endpoint.path);
        const responseTime = Date.now() - start;
        
        measurements.push({
          responseTime,
          status: response.status,
          success: response.body.success
        });
      }
      
      const avgTime = measurements.reduce((sum, m) => sum + m.responseTime, 0) / measurements.length;
      const minTime = Math.min(...measurements.map(m => m.responseTime));
      const maxTime = Math.max(...measurements.map(m => m.responseTime));
      
      console.log(`${endpoint.name.padEnd(20)}: ${avgTime.toFixed(0)}ms avg (${minTime}-${maxTime}ms)`);
      
      // Validate Railway requirements
      if (endpoint.path === '/api/ping') {
        expect(avgTime).toBeLessThan(100);
      } else if (endpoint.path === '/api/health/railway') {
        expect(avgTime).toBeLessThan(1000);
      }
    }
    
    console.log('==========================================\n');
  });
});