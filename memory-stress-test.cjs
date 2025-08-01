#!/usr/bin/env node
/**
 * Memory Stress Test for Railway
 * Tests actual memory allocation limits
 */

console.log('🧪 Memory Stress Test\n');

console.log('NODE_OPTIONS:', process.env.NODE_OPTIONS || 'NOT SET');
console.log('Node.js Version:', process.version, '\n');

function allocateMemory(sizeMB) {
  console.log(`Attempting to allocate ${sizeMB}MB...`);
  try {
    // Allocate array of numbers (8 bytes each)
    const elementsNeeded = (sizeMB * 1024 * 1024) / 8;
    const array = new Array(elementsNeeded).fill(1);
    
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
    
    console.log(`✅ Success! Heap: ${heapUsedMB}/${heapTotalMB}MB (${usagePercent}%)`);
    return true;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return false;
  }
}

console.log('Testing memory allocation limits...\n');

// Test progressive memory allocation
const testSizes = [100, 500, 1000, 2000, 4000, 6000];
let maxAllocated = 0;

for (const sizeMB of testSizes) {
  if (allocateMemory(sizeMB)) {
    maxAllocated = sizeMB;
  } else {
    break;
  }
  
  // Cleanup
  if (global.gc) {
    global.gc();
  }
  
  console.log(''); // Empty line for readability
}

console.log(`\n📊 Results:`);
console.log(`Maximum allocation: ${maxAllocated}MB`);

if (maxAllocated >= 6000) {
  console.log('✅ SUCCESS: Can allocate >6GB - NODE_OPTIONS is working');
} else if (maxAllocated >= 2000) {
  console.log('⚠️  PARTIAL: Can allocate >2GB but less than expected');
} else if (maxAllocated >= 1000) {
  console.log('⚠️  LIMITED: Can allocate >1GB but not enough for 7GB setting');
} else {
  console.log('❌ FAILED: Limited to default heap size');
}

console.log('\n💡 For Railway deployment:');
console.log('- Set NODE_OPTIONS in multiple places (ENV, startCommand, toml)');
console.log('- Use memory health check to verify allocation');
console.log('- Consider Railway memory limits vs Node.js heap limits');