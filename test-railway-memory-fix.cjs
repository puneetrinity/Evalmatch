#!/usr/bin/env node
/**
 * Comprehensive Railway Memory Configuration Test
 * Tests both local and deployed configurations
 */

const https = require('https');
const { spawn } = require('child_process');

console.log('🧪 Railway Memory Configuration Test\n');

// Test 1: Local Memory Configuration
console.log('=== Test 1: Local Memory Configuration ===');
testLocalMemory();

// Test 2: Railway Deployment Test
console.log('\n=== Test 2: Railway Deployment Test ===');
testRailwayDeployment();

function testLocalMemory() {
  const v8 = require('v8');
  const memUsage = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  
  const heapLimitMB = Math.round(heapStats.total_heap_size_limit / 1024 / 1024);
  const availableMB = Math.round(heapStats.total_available_size / 1024 / 1024);
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
  
  console.log(`NODE_OPTIONS: ${process.env.NODE_OPTIONS || 'NOT SET'}`);
  console.log(`Node.js Version: ${process.version}`);
  console.log(`V8 Heap Size Limit: ${heapLimitMB}MB`);
  console.log(`V8 Available Size: ${availableMB}MB`);
  console.log(`Current Heap Used: ${heapUsedMB}MB`);
  console.log(`Current Heap Total: ${heapTotalMB}MB`);
  
  if (heapLimitMB > 6000) {
    console.log('✅ LOCAL TEST PASSED: NODE_OPTIONS working correctly');
  } else if (heapLimitMB > 2000) {
    console.log('⚠️  LOCAL TEST PARTIAL: NODE_OPTIONS applied but not full 7GB');
  } else {
    console.log('❌ LOCAL TEST FAILED: NODE_OPTIONS not applied');
  }
}

async function testRailwayDeployment() {
  const railwayUrl = 'https://web-production-392cc.up.railway.app';
  
  console.log(`Testing Railway deployment at: ${railwayUrl}`);
  
  // Test basic health endpoint
  try {
    const healthData = await makeHttpRequest(`${railwayUrl}/api/health`);
    console.log('✅ Health endpoint accessible');
    
    if (healthData.checks) {
      const memoryCheck = healthData.checks.find(c => c.name === 'memory');
      if (memoryCheck) {
        console.log(`Memory check status: ${memoryCheck.status}`);
        console.log(`Memory check message: ${memoryCheck.message}`);
        
        if (memoryCheck.details && memoryCheck.details.limits) {
          const heapLimit = memoryCheck.details.limits.heapSizeLimit;
          console.log(`Railway heap limit: ${heapLimit}MB`);
          
          if (heapLimit > 6000) {
            console.log('✅ RAILWAY TEST PASSED: NODE_OPTIONS working on Railway');
          } else if (heapLimit > 2000) {
            console.log('⚠️  RAILWAY TEST PARTIAL: NODE_OPTIONS partially applied');
          } else {
            console.log('❌ RAILWAY TEST FAILED: NODE_OPTIONS not working on Railway');
          }
        }
      }
    }
  } catch (error) {
    console.log(`❌ Cannot reach Railway health endpoint: ${error.message}`);
    
    // Try memory debug endpoint if it exists
    console.log('Trying debug endpoint...');
    try {
      const debugData = await makeHttpRequest(`${railwayUrl}/api/debug/memory`);
      console.log('Memory debug data:', JSON.stringify(debugData, null, 2));
    } catch (debugError) {
      console.log('Debug endpoint not available:', debugError.message);
    }
  }
}

function makeHttpRequest(url) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname,
      method: 'GET',
      timeout: 10000
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (e) {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.end();
  });
}

// Test 3: Memory Stress Test (only if requested)
if (process.argv.includes('--stress-test')) {
  console.log('\n=== Test 3: Memory Stress Test ===');
  console.log('Testing actual memory allocation...');
  
  function testMemoryAllocation(sizeMB) {
    try {
      console.log(`Attempting to allocate ${sizeMB}MB...`);
      const elementsNeeded = (sizeMB * 1024 * 1024) / 8;
      const array = new Array(elementsNeeded).fill(1);
      
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      
      console.log(`✅ Success! Heap: ${heapUsedMB}/${heapTotalMB}MB`);
      return true;
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
      return false;
    }
  }
  
  // Test progressive allocation
  const testSizes = [100, 500, 1000, 2000, 4000];
  let maxAllocated = 0;
  
  for (const size of testSizes) {
    if (testMemoryAllocation(size)) {
      maxAllocated = size;
    } else {
      break;
    }
    
    // Cleanup
    if (global.gc) global.gc();
  }
  
  console.log(`\nMaximum allocation: ${maxAllocated}MB`);
  if (maxAllocated >= 4000) {
    console.log('✅ STRESS TEST PASSED: Can allocate large amounts of memory');
  } else {
    console.log('❌ STRESS TEST FAILED: Limited memory allocation');
  }
}

console.log('\n🏁 Test completed. Run with --stress-test flag for memory allocation testing.');