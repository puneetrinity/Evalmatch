#!/usr/bin/env node
/**
 * Railway Memory Test Script
 * Tests if NODE_OPTIONS is working on Railway deployment
 */

const v8 = require('v8');

console.log('🚄 Railway Memory Configuration Test\n');

console.log('Environment Variables:');
console.log(`NODE_OPTIONS: ${process.env.NODE_OPTIONS || 'NOT SET'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
console.log(`RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'NOT SET'}\n`);

console.log('V8 Heap Statistics:');
const heapStats = v8.getHeapStatistics();
const limitMB = Math.round(heapStats.total_heap_size_limit / 1024 / 1024);
const availableMB = Math.round(heapStats.total_available_size / 1024 / 1024);

console.log(`Heap Size Limit: ${limitMB} MB`);
console.log(`Available Size: ${availableMB} MB`);

console.log('\nMemory Usage:');
const memUsage = process.memoryUsage();
console.log(`Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`);
console.log(`Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
console.log(`RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB`);

console.log('\n🔍 Analysis:');
if (limitMB > 6000) {
  console.log('✅ SUCCESS: 7GB heap limit is configured correctly');
  console.log('   Memory health checks should pass');
} else if (limitMB > 1000) {
  console.log(`⚠️  PARTIAL: Heap limit is ${limitMB}MB (expected ~7168MB)`);
  console.log('   NODE_OPTIONS may be partially applied');
} else {
  console.log('❌ FAILED: Using default heap limit');
  console.log('   NODE_OPTIONS is not being applied');
  console.log('   Memory health checks will fail at 96% usage');
}

console.log('\n🧪 Memory Allocation Test:');
try {
  // Allocate 200MB to trigger heap expansion
  console.log('Allocating 200MB to test heap expansion...');
  const largeArray = new Array(25 * 1024 * 1024).fill(0); // 200MB
  
  const newMemUsage = process.memoryUsage();
  const newHeapMB = Math.round(newMemUsage.heapTotal / 1024 / 1024);
  const newUsedMB = Math.round(newMemUsage.heapUsed / 1024 / 1024);
  const newUsagePercent = Math.round((newMemUsage.heapUsed / newMemUsage.heapTotal) * 100);
  
  console.log(`After allocation:`);
  console.log(`  Heap Total: ${newHeapMB} MB`);
  console.log(`  Heap Used: ${newUsedMB} MB`);
  console.log(`  Usage: ${newUsagePercent}%`);
  
  if (newUsagePercent < 90) {
    console.log('✅ Memory allocation successful - heap can expand');
  } else {
    console.log('⚠️  High memory usage after allocation');
  }
  
} catch (error) {
  console.log('❌ Memory allocation failed:', error.message);
}

console.log('\n📋 Railway Deployment Checklist:');
console.log('1. ✓ NODE_OPTIONS set in railway.toml');
console.log('2. ✓ NODE_OPTIONS set in railway.json startCommand');
console.log('3. ✓ NODE_OPTIONS set in Dockerfile ENV');
console.log('4. ✓ start.sh script exports NODE_OPTIONS');
console.log('\nIf this test fails on Railway, check the deployment logs for:');
console.log('- Environment variable conflicts');
console.log('- Process spawn chain issues');
console.log('- Railway platform limitations');