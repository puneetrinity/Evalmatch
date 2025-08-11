#!/usr/bin/env node

/**
 * Railway Health Check Testing Script
 * Tests all health check endpoints to ensure Railway deployment compatibility
 */

const http = require('http');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOST = 'localhost';
const PORT = 3000;
const BASE_URL = `http://${HOST}:${PORT}`;

let serverProcess = null;

// Health check endpoints to test
const ENDPOINTS = [
  {
    path: '/api/ping',
    name: 'Ultra-simple ping endpoint',
    expectResponse: true,
    maxResponseTime: 100,
    requiredFields: ['success', 'status', 'timestamp', 'uptime']
  },
  {
    path: '/api/health/railway',
    name: 'Railway-optimized health check',
    expectResponse: true,
    maxResponseTime: 500,
    requiredFields: ['success', 'data.status', 'data.railway.deploymentReady', 'timestamp']
  },
  {
    path: '/api/health',
    name: 'Basic health check',
    expectResponse: true,
    maxResponseTime: 3000,
    requiredFields: ['success', 'data.status', 'data.checks', 'timestamp']
  },
  {
    path: '/api/health/detailed',
    name: 'Detailed health check',
    expectResponse: true,
    maxResponseTime: 10000,
    requiredFields: ['success', 'data.status', 'data.performance', 'timestamp']
  }
];

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(endpoint, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const req = http.get(`${BASE_URL}${endpoint}`, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            data: jsonData,
            responseTime,
            headers: res.headers
          });
        } catch (parseError) {
          resolve({
            statusCode: res.statusCode,
            data: data,
            responseTime,
            headers: res.headers,
            parseError: true
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function hasNestedProperty(obj, path) {
  return path.split('.').reduce((current, prop) => {
    return current && current[prop] !== undefined ? current[prop] : undefined;
  }, obj) !== undefined;
}

async function testEndpoint(endpointConfig) {
  log(`\n🔍 Testing: ${endpointConfig.name}`, 'cyan');
  log(`   Endpoint: ${endpointConfig.path}`, 'blue');
  
  try {
    const result = await makeRequest(endpointConfig.path, endpointConfig.maxResponseTime + 1000);
    
    // Check response time
    const responseTimeOk = result.responseTime <= endpointConfig.maxResponseTime;
    if (responseTimeOk) {
      log(`   ✅ Response time: ${result.responseTime}ms (limit: ${endpointConfig.maxResponseTime}ms)`, 'green');
    } else {
      log(`   ❌ Response time: ${result.responseTime}ms (exceeds limit: ${endpointConfig.maxResponseTime}ms)`, 'red');
    }
    
    // Check HTTP status code
    const statusOk = result.statusCode >= 200 && result.statusCode < 300;
    if (statusOk) {
      log(`   ✅ HTTP Status: ${result.statusCode}`, 'green');
    } else {
      log(`   ⚠️  HTTP Status: ${result.statusCode} (acceptable for Railway if not 5xx)`, 'yellow');
    }
    
    // Check for parse errors
    if (result.parseError) {
      log(`   ❌ Response parsing failed - not valid JSON`, 'red');
      log(`   Raw response: ${result.data.substring(0, 200)}...`, 'yellow');
      return false;
    }
    
    // Check required fields
    let fieldsOk = true;
    for (const field of endpointConfig.requiredFields) {
      if (hasNestedProperty(result.data, field)) {
        log(`   ✅ Required field present: ${field}`, 'green');
      } else {
        log(`   ❌ Missing required field: ${field}`, 'red');
        fieldsOk = false;
      }
    }
    
    // Railway-specific checks for the railway endpoint
    if (endpointConfig.path === '/api/health/railway') {
      const railwayData = result.data?.data?.railway;
      if (railwayData) {
        log(`   🚂 Railway deployment ready: ${railwayData.deploymentReady}`, railwayData.deploymentReady ? 'green' : 'yellow');
        log(`   🚂 Startup phase: ${railwayData.startupPhase}`, railwayData.startupPhase ? 'yellow' : 'green');
        if (railwayData.startupGracePeriod) {
          log(`   🚂 Grace period remaining: ${railwayData.gracePeriodRemaining}s`, 'yellow');
        }
      }
    }
    
    // Log important headers
    if (result.headers['x-health-warning']) {
      log(`   ⚠️  Health warning: ${result.headers['x-health-warning']}`, 'yellow');
    }
    if (result.headers['x-health-status']) {
      log(`   📊 Health status header: ${result.headers['x-health-status']}`, 'blue');
    }
    
    return responseTimeOk && fieldsOk && !result.parseError;
    
  } catch (error) {
    log(`   ❌ Request failed: ${error.message}`, 'red');
    return false;
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    log('🚀 Starting server for testing...', 'yellow');
    
    // Check if build directory exists
    if (!fs.existsSync('./build') && !fs.existsSync('./dist')) {
      log('❌ No build directory found. Running build first...', 'red');
      try {
        execSync('npm run build', { stdio: 'inherit' });
        log('✅ Build completed', 'green');
      } catch (buildError) {
        log('❌ Build failed', 'red');
        reject(buildError);
        return;
      }
    }
    
    // Start the server
    const serverScript = fs.existsSync('./build/index.js') ? './build/index.js' : './server/index.ts';
    const command = serverScript.endsWith('.ts') ? 'tsx' : 'node';
    
    log(`Starting server with: ${command} ${serverScript}`, 'blue');
    
    serverProcess = spawn(command, [serverScript], {
      env: { 
        ...process.env, 
        NODE_ENV: 'test',
        PORT: PORT.toString(),
        // Use minimal config for testing
        AUTH_BYPASS_MODE: 'true',
        LOG_LEVEL: 'error', // Reduce noise during testing
        DATABASE_ENABLED: 'false', // Use memory mode for faster startup
      },
      stdio: 'pipe'
    });
    
    let serverReady = false;
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes(`Server running on port ${PORT}`) || output.includes('ready to accept connections')) {
        if (!serverReady) {
          serverReady = true;
          log('✅ Server started successfully', 'green');
          // Wait a moment for full initialization
          setTimeout(() => resolve(), 2000);
        }
      }
      // Log server output during testing
      if (process.env.VERBOSE) {
        process.stdout.write(`[SERVER] ${output}`);
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      if (process.env.VERBOSE) {
        process.stderr.write(`[SERVER ERROR] ${output}`);
      }
    });
    
    serverProcess.on('exit', (code) => {
      if (!serverReady) {
        reject(new Error(`Server exited with code ${code} before becoming ready`));
      }
    });
    
    // Timeout if server doesn't start within 30 seconds
    setTimeout(() => {
      if (!serverReady) {
        reject(new Error('Server failed to start within 30 seconds'));
      }
    }, 30000);
  });
}

function stopServer() {
  if (serverProcess) {
    log('🛑 Stopping server...', 'yellow');
    serverProcess.kill('SIGTERM');
    
    // Force kill if it doesn't stop gracefully
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}

async function runTests() {
  log('🏥 Railway Health Check Testing Suite', 'bright');
  log('=====================================\n', 'bright');
  
  try {
    await startServer();
    
    log('\n📋 Running health check tests...', 'cyan');
    
    const results = [];
    
    for (const endpoint of ENDPOINTS) {
      const success = await testEndpoint(endpoint);
      results.push({ endpoint: endpoint.path, name: endpoint.name, success });
    }
    
    // Summary
    log('\n📊 Test Results Summary', 'bright');
    log('=======================', 'bright');
    
    const passed = results.filter(r => r.success).length;
    const total = results.length;
    
    results.forEach(result => {
      const icon = result.success ? '✅' : '❌';
      const color = result.success ? 'green' : 'red';
      log(`${icon} ${result.name} (${result.endpoint})`, color);
    });
    
    log(`\n🎯 Tests passed: ${passed}/${total}`, passed === total ? 'green' : 'red');
    
    if (passed === total) {
      log('\n🎉 All health checks are Railway-compatible!', 'green');
      log('✅ The application should deploy successfully to Railway.', 'green');
    } else {
      log('\n⚠️  Some health checks failed - review the issues above.', 'yellow');
      log('🔧 Consider fixing the failing endpoints before Railway deployment.', 'yellow');
    }
    
    // Railway deployment recommendations
    log('\n🚂 Railway Deployment Recommendations:', 'cyan');
    log('=====================================', 'cyan');
    log('• Use /api/health/railway for the health check path in Railway settings', 'blue');
    log('• Set initialDelaySeconds to 60-120s to allow for startup time', 'blue');
    log('• Set timeoutSeconds to 10s or less for fast responses', 'blue');
    log('• Use failureThreshold of 3+ to be more tolerant during deployment', 'blue');
    log('• The /api/ping endpoint can be used for ultra-fast liveness checks', 'blue');
    
    return passed === total;
    
  } catch (error) {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    return false;
  } finally {
    stopServer();
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  log('\n🛑 Test interrupted by user', 'yellow');
  stopServer();
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('\n🛑 Test terminated', 'yellow');
  stopServer();
  process.exit(1);
});

// Run the tests
if (require.main === module) {
  runTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      log(`\n💥 Unexpected error: ${error.message}`, 'red');
      console.error(error);
      stopServer();
      process.exit(1);
    });
}

module.exports = { runTests, testEndpoint, makeRequest };