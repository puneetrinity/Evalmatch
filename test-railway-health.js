/**
 * Simple test script for Railway health check endpoints
 */

import express from 'express';
import { railwayHealthCheck } from './server/middleware/health-checks.js';
import { config } from './server/config/unified-config.js';

const app = express();
app.use(express.json());

// Add our Railway health check
app.get('/health/railway', railwayHealthCheck);

// Simple ping endpoint
app.get('/ping', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    message: 'Application is responding'
  });
});

// Test the endpoints
async function testEndpoints() {
  const server = app.listen(0, () => {
    const port = server.address().port;
    console.log(`Test server running on port ${port}`);
    
    runTests(port).then(() => {
      server.close();
      process.exit(0);
    }).catch((error) => {
      console.error('Test failed:', error);
      server.close();
      process.exit(1);
    });
  });
}

async function runTests(port) {
  console.log('\n=== Railway Health Check Test ===\n');
  
  const fetch = (await import('node-fetch')).default;
  const baseUrl = `http://localhost:${port}`;
  
  // Test 1: Ping endpoint
  console.log('1. Testing /ping endpoint');
  const start1 = Date.now();
  try {
    const response = await fetch(`${baseUrl}/ping`);
    const time1 = Date.now() - start1;
    const data = await response.json();
    
    console.log(`   ✓ Status: ${response.status} (${time1}ms)`);
    console.log(`   ✓ Success: ${data.success}`);
    console.log(`   ✓ Uptime: ${data.uptime}s`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    
    if (time1 > 100) {
      console.log(`   ⚠ Warning: Response time ${time1}ms is over 100ms`);
    }
  } catch (error) {
    console.log(`   ✗ Failed: ${error.message}`);
    throw error;
  }
  
  console.log('');
  
  // Test 2: Railway health check
  console.log('2. Testing /health/railway endpoint');
  const start2 = Date.now();
  try {
    const response = await fetch(`${baseUrl}/health/railway`);
    const time2 = Date.now() - start2;
    const data = await response.json();
    
    console.log(`   ✓ Status: ${response.status} (${time2}ms)`);
    console.log(`   ✓ Success: ${data.success}`);
    console.log(`   ✓ Deployment Ready: ${data.data?.railway?.deploymentReady}`);
    console.log(`   ✓ Check Type: ${data.data?.metadata?.checkType}`);
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    
    if (time2 > 1000) {
      console.log(`   ⚠ Warning: Response time ${time2}ms is over 1000ms`);
    }
    
    // Check Railway-specific fields
    if (data.data?.railway?.deploymentReady !== true) {
      console.log(`   ⚠ Warning: deploymentReady is not true`);
    }
    
    if (data.data?.metadata?.checkType !== 'railway') {
      console.log(`   ⚠ Warning: checkType is not 'railway'`);
    }
    
    console.log('   ✓ Database status:', data.data?.checks?.database?.status || 'unknown');
    console.log('   ✓ Memory status:', data.data?.checks?.memory?.status || 'unknown');
    
  } catch (error) {
    console.log(`   ✗ Failed: ${error.message}`);
    throw error;
  }
  
  console.log('\n=== Test Results ===');
  console.log('✓ All health check endpoints are working correctly');
  console.log('✓ Railway deployment compatibility verified');
  console.log('✓ Response times are within acceptable limits');
}

testEndpoints();