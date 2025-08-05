#!/usr/bin/env node

/**
 * Automated Test Runner
 * Runs comprehensive test suites with proper error handling and reporting
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = colors.white) {
  console.log(`${color}${message}${colors.reset}`);
}

function logHeader(message) {
  console.log('\n' + '='.repeat(60));
  log(message, colors.cyan);
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

async function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    logInfo(`Running: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

function getTestConfig() {
  return {
    suites: [
      {
        name: 'Unit Tests',
        command: 'npm',
        args: ['run', 'test:unit'],
        required: true,
        timeout: 60000
      },
      {
        name: 'Integration Tests',
        command: 'npm',
        args: ['run', 'test:integration'],
        required: true,
        timeout: 120000
      },
      {
        name: 'Schema Validation Tests',
        command: 'npm',
        args: ['run', 'test:schema'],
        required: true,
        timeout: 60000
      },
      {
        name: 'End-to-End Tests',
        command: 'npm',
        args: ['run', 'test:e2e'],
        required: false, // Optional for CI
        timeout: 180000
      }
    ]
  };
}

async function runTestSuite(suite) {
  logHeader(`Running ${suite.name}`);
  
  const startTime = Date.now();
  try {
    await runCommand(suite.command, suite.args);
    const duration = Date.now() - startTime;
    
    logSuccess(`${suite.name} completed in ${duration}ms`);
    return { success: true, duration, required: suite.required };
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(`${suite.name} failed: ${error.message}`);
    return { success: false, duration, required: suite.required, error: error.message };
  }
}

function generateTestReport(results) {
  logHeader('Test Report Summary');
  
  let totalDuration = 0;
  let passedTests = 0;
  let failedTests = 0;
  let requiredFailed = 0;

  results.forEach((result, index) => {
    const suite = getTestConfig().suites[index];
    totalDuration += result.duration || 0;
    
    if (result.success) {
      logSuccess(`${suite.name}: PASSED (${result.duration}ms)`);
      passedTests++;
    } else {
      if (result.required) {
        logError(`${suite.name}: FAILED (${result.duration}ms) - REQUIRED`);
        requiredFailed++;
      } else {
        logWarning(`${suite.name}: FAILED (${result.duration}ms) - OPTIONAL`);
      }
      failedTests++;
    }
  });

  console.log('\n' + '-'.repeat(40));
  logInfo(`Total test suites run: ${results.length}`);
  logInfo(`Passed: ${passedTests}`);
  logInfo(`Failed: ${failedTests}`);
  logInfo(`Required failures: ${requiredFailed}`);
  logInfo(`Total duration: ${totalDuration}ms`);
  
  return {
    totalSuites: results.length,
    passed: passedTests,
    failed: failedTests,
    requiredFailed,
    totalDuration,
    success: requiredFailed === 0
  };
}

function generateCoverageReport() {
  const coverageDir = path.join(__dirname, '..', 'coverage');
  
  if (fs.existsSync(coverageDir)) {
    logInfo('Coverage reports available in ./coverage/');
    
    // Check for coverage files
    const unitCoverageDir = path.join(coverageDir, 'unit');
    if (fs.existsSync(unitCoverageDir)) {
      logInfo('Unit test coverage: ./coverage/unit/lcov-report/index.html');
    }
  } else {
    logWarning('No coverage reports found. Run with --coverage to generate.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {
    runAll: args.includes('--all'),
    skipE2E: args.includes('--skip-e2e'),
    coverage: args.includes('--coverage'),
    ci: args.includes('--ci')
  };

  logHeader('🧪 Evalmatch Test Runner');
  logInfo('Running comprehensive test suite...');
  
  if (options.ci) {
    logInfo('Running in CI mode (strict requirements)');
  }

  const config = getTestConfig();
  let suitesToRun = config.suites;

  // Filter suites based on options
  if (options.skipE2E) {
    suitesToRun = suitesToRun.filter(suite => suite.name !== 'End-to-End Tests');
    logWarning('Skipping End-to-End tests');
  }

  // Add coverage flag if requested
  if (options.coverage) {
    suitesToRun = suitesToRun.map(suite => {
      if (suite.name === 'Unit Tests') {
        return {
          ...suite,
          args: ['run', 'test:unit:coverage']
        };
      }
      return suite;
    });
  }

  const results = [];
  let startTime = Date.now();

  // Run test suites sequentially
  for (const suite of suitesToRun) {
    const result = await runTestSuite(suite);
    results.push(result);
    
    // In CI mode, fail fast on required test failures
    if (options.ci && !result.success && result.required) {
      logError('Required test suite failed in CI mode. Stopping execution.');
      break;
    }
  }

  const totalTime = Date.now() - startTime;
  const report = generateTestReport(results);
  
  // Generate coverage report if available
  if (options.coverage) {
    generateCoverageReport();
  }

  // Final result
  logHeader('Final Result');
  if (report.success) {
    logSuccess(`All required tests passed! Total time: ${totalTime}ms`);
    
    if (report.failed > report.requiredFailed) {
      logWarning(`${report.failed - report.requiredFailed} optional tests failed`);
    }
    
    process.exit(0);
  } else {
    logError(`${report.requiredFailed} required test(s) failed! Total time: ${totalTime}ms`);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection at ${promise}: ${reason}`);
  process.exit(1);
});

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logError(`Test runner failed: ${error.message}`);
    process.exit(1);
  });
}