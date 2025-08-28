#!/usr/bin/env node

/**
 * Simple test script for health check endpoints
 * Tests the health check system without requiring full environment setup
 */

import express from 'express';
import { initializeHealthChecks, basicHealthCheck, detailedHealthCheck, readinessProbe, livenessProbe } from './server/middleware/health-checks.ts';

const app = express();
const port = 3001;

// Mock configuration for testing
process.env.NODE_ENV = 'development';
process.env.AUTH_BYPASS_MODE = 'true';

// Initialize health checks
initializeHealthChecks();

// Set up health check routes
app.get('/health', basicHealthCheck);
app.get('/health/detailed', detailedHealthCheck);
app.get('/ready', readinessProbe);
app.get('/live', livenessProbe);

app.get('/', (req, res) => {
  res.json({
    message: 'Health Check Test Server',
    endpoints: [
      'GET /health - Basic health check',
      'GET /health/detailed - Detailed health check',
      'GET /ready - Readiness probe',
      'GET /live - Liveness probe'
    ]
  });
});

app.listen(port, () => {
  console.log(`Health check test server running on http://localhost:${port}`);
  console.log('Available endpoints:');
  console.log('- GET /health - Basic health check');
  console.log('- GET /health/detailed - Detailed health check');
  console.log('- GET /ready - Readiness probe');
  console.log('- GET /live - Liveness probe');
});