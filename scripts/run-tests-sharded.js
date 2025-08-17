#!/usr/bin/env node

/**
 * Test Sharding Runner
 * Runs tests in parallel shards with proper isolation
 */

import { spawn } from 'child_process';
import { cpus } from 'os';
import { promises as fs } from 'fs';
import path from 'path';

// Configuration
const TOTAL_SHARDS = parseInt(process.env.TOTAL_SHARDS || '4', 10);
const MAX_PARALLEL_SHARDS = Math.min(TOTAL_SHARDS, Math.floor(cpus().length / 2));
const JEST_CONFIG = process.argv.includes('--config') 
  ? process.argv[process.argv.indexOf('--config') + 1]
  : 'jest.config.shard.mjs';

// Parse command line arguments
const args = process.argv.slice(2).filter(arg => !arg.startsWith('--shard'));
const testPattern = args.find(arg => !arg.startsWith('--'));

console.log(`🚀 Running tests with ${TOTAL_SHARDS} shards (${MAX_PARALLEL_SHARDS} parallel)`);

// Create necessary directories
async function setupDirectories() {
  const dirs = [
    '.jest-cache',
    'coverage',
    'test-results'
  ];
  
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Run a single shard
function runShard(shardIndex) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      JEST_SHARD_INDEX: shardIndex.toString(),
      JEST_TOTAL_SHARDS: TOTAL_SHARDS.toString(),
      NODE_OPTIONS: '--max_old_space_size=2048'
    };
    
    const jestArgs = [
      '--experimental-vm-modules',
      'node_modules/.bin/jest',
      '--config', JEST_CONFIG,
      ...args
    ];
    
    if (testPattern) {
      jestArgs.push(testPattern);
    }
    
    console.log(`\n📦 Starting shard ${shardIndex}/${TOTAL_SHARDS}`);
    
    const startTime = Date.now();
    const child = spawn('node', jestArgs, {
      env,
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (code === 0) {
        console.log(`✅ Shard ${shardIndex} completed in ${duration}s`);
        resolve({ shard: shardIndex, duration, success: true });
      } else {
        console.error(`❌ Shard ${shardIndex} failed with code ${code}`);
        resolve({ shard: shardIndex, duration, success: false, code });
      }
    });
    
    child.on('error', (error) => {
      console.error(`❌ Shard ${shardIndex} error:`, error);
      reject(error);
    });
  });
}

// Run shards with concurrency limit
async function runShardsInBatches() {
  const results = [];
  
  for (let i = 0; i < TOTAL_SHARDS; i += MAX_PARALLEL_SHARDS) {
    const batch = [];
    
    for (let j = 0; j < MAX_PARALLEL_SHARDS && i + j < TOTAL_SHARDS; j++) {
      batch.push(runShard(i + j + 1));
    }
    
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }
  
  return results;
}

// Merge coverage reports
async function mergeCoverage() {
  try {
    console.log('\n📊 Merging coverage reports...');
    
    const coverageFiles = [];
    for (let i = 1; i <= TOTAL_SHARDS; i++) {
      const coverageFile = `coverage/shard-${i}/coverage-final.json`;
      try {
        await fs.access(coverageFile);
        coverageFiles.push(coverageFile);
      } catch {
        // Coverage file doesn't exist for this shard
      }
    }
    
    if (coverageFiles.length > 0) {
      // Merge using nyc
      const { spawn: spawnSync } = await import('child_process');
      const nyc = spawnSync('npx', [
        'nyc', 'merge',
        'coverage',
        'coverage/merged/coverage.json'
      ], { stdio: 'inherit' });
      
      // Generate report
      if (nyc.error) {
        console.warn('⚠️  Could not merge coverage reports');
      } else {
        console.log('✅ Coverage reports merged');
      }
    }
  } catch (error) {
    console.warn('⚠️  Coverage merge failed:', error.message);
  }
}

// Main execution
async function main() {
  const startTime = Date.now();
  
  try {
    await setupDirectories();
    
    const results = await runShardsInBatches();
    
    // Summary
    console.log('\n📋 Test Sharding Summary:');
    console.log('========================');
    
    let allSuccess = true;
    results.forEach(({ shard, duration, success }) => {
      const status = success ? '✅' : '❌';
      console.log(`${status} Shard ${shard}: ${duration}s`);
      if (!success) allSuccess = false;
    });
    
    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nTotal time: ${totalDuration}s`);
    
    // Merge coverage if all tests passed
    if (allSuccess && args.includes('--coverage')) {
      await mergeCoverage();
    }
    
    // Exit with appropriate code
    process.exit(allSuccess ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test sharding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}