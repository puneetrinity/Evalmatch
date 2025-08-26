#!/usr/bin/env node

/**
 * Memory-Optimized Test Runner
 * Runs tests in batches to prevent memory exhaustion
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const MAX_MEMORY_MB = 2048;
const UNIT_TEST_MEMORY_MB = 1024;
const INTEGRATION_TEST_MEMORY_MB = 2048;
const E2E_TEST_MEMORY_MB = 3072;

// Test batches configuration
const TEST_BATCHES = {
  unit: {
    memory: UNIT_TEST_MEMORY_MB,
    config: 'jest.config.unit.mjs',
    patterns: [
      'tests/unit/lib/scoring-constants.test.ts',
      'tests/unit/shared/api-contracts.test.ts',
      'tests/unit/shared/schema-validation.test.ts',
      'tests/unit/lib/error-handling.test.ts',
      'tests/unit/lib/batch-persistence.test.ts',
      'tests/unit/lib/batch-recovery.test.ts'
    ]
  },
  integration: {
    memory: INTEGRATION_TEST_MEMORY_MB,
    config: 'jest.config.integration.mjs',
    patterns: [
      'tests/schema-validation.test.ts',
      'tests/integration/api/auth.test.ts',
      'tests/integration/api/analysis.test.ts', 
      'tests/integration/api/resumes.test.ts',
      'tests/integration/api/job-descriptions.test.ts'
    ]
  },
  'integration-large': {
    memory: INTEGRATION_TEST_MEMORY_MB,
    config: 'jest.config.integration.mjs',
    patterns: [
      'tests/integration/api/batches.test.ts',
      'tests/integration/api/interview-questions.test.ts'
    ]
  },
  components: {
    memory: INTEGRATION_TEST_MEMORY_MB,
    config: 'jest.config.ui.mjs',
    patterns: [
      'tests/components/**/*.test.tsx',
      'tests/hooks/**/*.test.ts'
    ]
  }
};

// Utility functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

function runTestBatch(batchName, batch, options = {}) {
  log(`Starting test batch: ${batchName}`, 'info');
  
  const patterns = batch.patterns.join(' ');
  const nodeArgs = `--max_old_space_size=${batch.memory}`;
  const jestArgs = [
    `--config ${batch.config}`,
    '--runInBand', // Sequential execution
    '--no-cache', // Prevent cache buildup
    '--logHeapUsage', // Monitor memory
    options.coverage ? '--coverage' : '--no-coverage',
    options.verbose ? '--verbose' : '',
    patterns
  ].filter(Boolean).join(' ');

  const command = `node ${nodeArgs} node_modules/.bin/jest ${jestArgs}`;
  
  log(`Command: ${command}`, 'info');
  log(`Memory limit: ${batch.memory}MB`, 'info');
  
  try {
    const result = execSync(command, {
      stdio: 'inherit',
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      env: {
        ...process.env,
        NODE_ENV: 'test',
        FORCE_COLOR: '1'
      }
    });
    log(`✅ Batch ${batchName} completed successfully`, 'success');
    return true;
  } catch (error) {
    log(`❌ Batch ${batchName} failed with exit code: ${error.status}`, 'error');
    if (options.failFast) {
      process.exit(error.status || 1);
    }
    return false;
  }
}

function cleanupBetweenBatches() {
  log('🧹 Cleaning up between test batches...', 'info');
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
    log('Forced garbage collection', 'info');
  }
  
  // Small delay to let system recover
  return new Promise(resolve => setTimeout(resolve, 2000));
}

async function runMemoryOptimizedTests(options = {}) {
  log('🚀 Starting memory-optimized test execution', 'info');
  log(`Max memory per process: ${MAX_MEMORY_MB}MB`, 'info');
  
  const results = {};
  let totalPassed = 0;
  let totalFailed = 0;
  
  const batchOrder = options.batchOrder || Object.keys(TEST_BATCHES);
  
  for (const batchName of batchOrder) {
    const batch = TEST_BATCHES[batchName];
    if (!batch) {
      log(`⚠️  Unknown batch: ${batchName}`, 'warn');
      continue;
    }
    
    const success = runTestBatch(batchName, batch, options);
    results[batchName] = success;
    
    if (success) {
      totalPassed++;
    } else {
      totalFailed++;
    }
    
    // Cleanup between batches
    if (batchName !== batchOrder[batchOrder.length - 1]) {
      await cleanupBetweenBatches();
    }
  }
  
  // Summary
  log('\n📊 Test Execution Summary', 'info');
  log(`Total batches: ${Object.keys(results).length}`, 'info');
  log(`Passed: ${totalPassed}`, 'success');
  log(`Failed: ${totalFailed}`, totalFailed > 0 ? 'error' : 'info');
  
  for (const [batch, success] of Object.entries(results)) {
    const status = success ? '✅' : '❌';
    log(`  ${status} ${batch}`, success ? 'success' : 'error');
  }
  
  const exitCode = totalFailed > 0 ? 1 : 0;
  log(`Exiting with code: ${exitCode}`, exitCode === 0 ? 'success' : 'error');
  process.exit(exitCode);
}

// CLI handling - ES module equivalent of require.main === module
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--coverage':
        options.coverage = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--fail-fast':
        options.failFast = true;
        break;
      case '--batch':
        options.batchOrder = args[i + 1] ? args[i + 1].split(',') : undefined;
        i++; // Skip next argument
        break;
      case '--help':
        console.log(`
Memory-Optimized Test Runner

Usage: node scripts/test-memory-optimized.js [options]

Options:
  --coverage     Enable coverage reporting
  --verbose      Enable verbose output
  --fail-fast    Stop on first batch failure
  --batch        Run specific batches (comma-separated)
  --help         Show this help message

Examples:
  # Run all test batches
  node scripts/test-memory-optimized.js
  
  # Run only unit tests
  node scripts/test-memory-optimized.js --batch unit
  
  # Run with coverage
  node scripts/test-memory-optimized.js --coverage
        `);
        process.exit(0);
        break;
    }
  }
  
  runMemoryOptimizedTests(options);
}

export { runMemoryOptimizedTests, TEST_BATCHES };