#!/usr/bin/env node
/**
 * Memory Configuration Diagnostic Script
 * Run this to verify Node.js memory settings are applied correctly
 */

console.log('=== Node.js Memory Configuration Check ===\n');

// Check environment variables
console.log('Environment Variables:');
console.log(`NODE_OPTIONS: ${process.env.NODE_OPTIONS || 'NOT SET'}`);
console.log(`EMBEDDING_MODEL: ${process.env.EMBEDDING_MODEL || 'NOT SET'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}\n`);

// Check Node.js process information
console.log('Node.js Process Information:');
console.log(`Node.js Version: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`Process ID: ${process.pid}\n`);

// Check memory configuration
const memUsage = process.memoryUsage();
const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
const externalMB = Math.round(memUsage.external / 1024 / 1024);
const rssMB = Math.round(memUsage.rss / 1024 / 1024);
const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

console.log('Memory Usage:');
console.log(`Heap Used: ${heapUsedMB} MB`);
console.log(`Heap Total: ${heapTotalMB} MB`);
console.log(`Heap Usage: ${usagePercent}%`);
console.log(`External: ${externalMB} MB`);
console.log(`RSS (Resident Set Size): ${rssMB} MB\n`);

// Check for expected configuration using V8 heap statistics first
console.log('Configuration Analysis:');
const expectedHeapGB = 7;
const expectedHeapMB = expectedHeapGB * 1024;

// This will be set by the V8 check below
let v8HeapLimitMB = 0;

if (usagePercent > 90) {
  console.log('❌ CRITICAL: Memory usage is critically high (>90%)');
  console.log('   This will cause health check failures');
} else if (usagePercent > 75) {
  console.log('⚠️  WARNING: Memory usage is high (>75%)');
  console.log('   Monitor for potential issues');
} else {
  console.log('✅ SUCCESS: Memory usage is healthy');
}

console.log('\n=== Recommendations ===');
if (heapTotalMB < 100) {
  console.log('1. Ensure NODE_OPTIONS is set in the environment');
  console.log('2. Check that Railway is using the correct start command');
  console.log('3. Verify Docker ENV variables are not being overridden');
} else if (usagePercent > 75) {
  console.log('1. Consider increasing heap size further');
  console.log('2. Check for memory leaks in the application');
  console.log('3. Monitor embedding model memory usage');
} else {
  console.log('Memory configuration appears to be working correctly!');
}

console.log('\n=== V8 Heap Configuration ===');
// Check V8 flags to see if they're applied
try {
  const v8 = await import('v8');
  const heapStats = v8.getHeapStatistics();
  console.log(`Heap Size Limit: ${Math.round(heapStats.heap_size_limit / 1024 / 1024)} MB`);
  console.log(`Total Available Size: ${Math.round(heapStats.total_available_size / 1024 / 1024)} MB`);
  
  if (heapStats.heap_size_limit > 2000 * 1024 * 1024) {
    console.log('✅ SUCCESS: V8 heap limit is configured correctly');
  } else {
    console.log('❌ CRITICAL: V8 heap limit is still at default');
  }
} catch (error) {
  console.log('Could not get V8 heap statistics:', error.message);
}

console.log('\n=== Test Command ===');
console.log('To test with explicit NODE_OPTIONS:');
console.log('NODE_OPTIONS="--max-old-space-size=7168" node check-memory.js');