#!/usr/bin/env node
/**
 * Fixed Memory Configuration Diagnostic Script
 * Properly checks V8 heap limits instead of current allocation
 */

console.log('=== Node.js Memory Configuration Check (Fixed) ===\n');

// Check environment variables
console.log('Environment Variables:');
console.log(`NODE_OPTIONS: ${process.env.NODE_OPTIONS || 'NOT SET'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
console.log(`RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'NOT SET'}\n`);

// Check Node.js process information
console.log('Node.js Process Information:');
console.log(`Node.js Version: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`Process ID: ${process.pid}\n`);

// Get V8 heap statistics (the correct way to check memory limits)
console.log('=== V8 Heap Limits (Authoritative) ===');
try {
  const v8 = require('v8');
  const heapStats = v8.getHeapStatistics();
  const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
  const availableMB = Math.round(heapStats.total_available_size / 1024 / 1024);
  const currentHeapMB = Math.round(heapStats.total_heap_size / 1024 / 1024);
  const usedHeapMB = Math.round(heapStats.used_heap_size / 1024 / 1024);
  
  console.log(`V8 Heap Size Limit: ${heapLimitMB} MB`);
  console.log(`V8 Available Size: ${availableMB} MB`);
  console.log(`Current Heap Size: ${currentHeapMB} MB`);
  console.log(`Used Heap Size: ${usedHeapMB} MB`);
  
  // Check if NODE_OPTIONS is properly applied
  const expectedHeapLimitMB = 7168; // From NODE_OPTIONS --max-old-space-size=7168
  const nodeOptionsWorking = heapLimitMB > 2000; // Much higher than default ~1400MB
  const nodeOptionsCorrect = heapLimitMB >= expectedHeapLimitMB * 0.9; // Allow 10% tolerance
  
  console.log('\n=== Configuration Analysis ===');
  if (!nodeOptionsWorking) {
    console.log(`❌ CRITICAL: NODE_OPTIONS not applied!`);
    console.log(`   Heap limit: ${heapLimitMB}MB (expected ~${expectedHeapLimitMB}MB)`);
    console.log(`   Node.js is using default memory limits`);
  } else if (!nodeOptionsCorrect) {
    console.log(`⚠️  WARNING: NODE_OPTIONS partially applied`);
    console.log(`   Heap limit: ${heapLimitMB}MB (expected ${expectedHeapLimitMB}MB)`);
    console.log(`   Memory limit is higher than default but not at target`);
  } else {
    console.log(`✅ SUCCESS: NODE_OPTIONS working correctly!`);
    console.log(`   Heap limit: ${heapLimitMB}MB (target: ${expectedHeapLimitMB}MB)`);
    console.log(`   Available: ${availableMB}MB`);
  }
  
} catch (error) {
  console.log('❌ Could not get V8 heap statistics:', error.message);
}

// Current memory usage (less important but still useful)
console.log('\n=== Current Memory Usage ===');
const memUsage = process.memoryUsage();
const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
const externalMB = Math.round(memUsage.external / 1024 / 1024);
const rssMB = Math.round(memUsage.rss / 1024 / 1024);
const usagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

console.log(`Heap Used: ${heapUsedMB} MB`);
console.log(`Heap Allocated: ${heapTotalMB} MB`);
console.log(`Heap Usage: ${usagePercent}%`);
console.log(`External: ${externalMB} MB`);
console.log(`RSS (Total Memory): ${rssMB} MB`);

console.log('\n=== Key Points ===');
console.log('• Heap Used/Total only shows CURRENT allocation');
console.log('• V8 Heap Size Limit shows MAXIMUM allowed (from NODE_OPTIONS)');
console.log('• Node.js only allocates heap memory as needed');
console.log('• A low "Heap Total" doesn\'t mean NODE_OPTIONS isn\'t working');

console.log('\n=== Next Steps ===');
const v8 = require('v8');
const heapStats = v8.getHeapStatistics();
const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);

if (heapLimitMB > 6000) {
  console.log('✅ Memory configuration is working correctly');
  console.log('• Deploy to Railway - the memory limits should work');
  console.log('• Health checks should now pass');
} else if (heapLimitMB > 2000) {
  console.log('⚠️  Memory configuration partially working');
  console.log('• Check Railway environment variables');
  console.log('• Verify NODE_OPTIONS in railway.toml');
} else {
  console.log('❌ Memory configuration not working');
  console.log('• Set NODE_OPTIONS environment variable');
  console.log('• Check Dockerfile ENV settings');
  console.log('• Verify start.sh script');
}