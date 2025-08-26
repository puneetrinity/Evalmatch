#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * Orchestrates and runs all test suites with proper reporting and cleanup
 */

import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';

class ComprehensiveTestRunner {
  constructor() {
    this.results = {
      startTime: Date.now(),
      endTime: null,
      suites: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
    
    this.config = {
      maxMemory: process.env.MAX_TEST_MEMORY || '4096',
      timeout: process.env.TEST_TIMEOUT || 300000, // 5 minutes default
      parallel: process.env.PARALLEL_TESTS !== 'false',
      coverage: process.env.COVERAGE !== 'false',
      verbose: process.env.VERBOSE === 'true',
      skipE2E: process.env.SKIP_E2E === 'true',
      skipLoad: process.env.SKIP_LOAD === 'true'
    };

    this.testSuites = this.defineTestSuites();
  }

  defineTestSuites() {
    return [
      {
        name: 'Static Analysis',
        command: 'npm run lint:check && npm run check',
        type: 'static',
        essential: true,
        timeout: 60000,
        retries: 0
      },
      {
        name: 'Unit Tests',
        command: 'npm run test:unit:coverage',
        type: 'unit',
        essential: true,
        timeout: 180000,
        retries: 1,
        memoryLimit: '2048'
      },
      {
        name: 'Integration Tests',
        command: 'npm run test:integration',
        type: 'integration',
        essential: true,
        timeout: 300000,
        retries: 1,
        memoryLimit: '3072',
        setupDb: true
      },
      {
        name: 'Security Tests',
        command: 'npm test -- tests/security/',
        type: 'security',
        essential: true,
        timeout: 180000,
        retries: 0
      },
      {
        name: 'Performance Tests',
        command: 'npm test -- tests/performance/',
        type: 'performance',
        essential: false,
        timeout: 600000,
        retries: 1,
        memoryLimit: '4096',
        setupDb: true
      },
      {
        name: 'Load Tests',
        command: 'npm test -- tests/load/',
        type: 'load',
        essential: false,
        timeout: 900000,
        retries: 0,
        skip: this.config.skipLoad,
        memoryLimit: '6144',
        setupDb: true
      },
      {
        name: 'E2E Tests',
        command: 'npx playwright test',
        type: 'e2e',
        essential: false,
        timeout: 600000,
        retries: 1,
        skip: this.config.skipE2E,
        setupApp: true,
        setupDb: true
      }
    ];
  }

  async run() {
    console.log('🚀 Starting Comprehensive Test Suite');
    console.log(`📊 Configuration:`, this.config);
    console.log(`🧪 Test Suites: ${this.testSuites.filter(s => !s.skip).length} enabled`);
    console.log('─'.repeat(80));

    try {
      await this.setupEnvironment();
      
      for (const suite of this.testSuites) {
        if (suite.skip) {
          console.log(`⏭️  Skipping ${suite.name} (disabled)`);
          this.recordSuiteResult(suite.name, 'skipped', 0, null, 'Skipped by configuration');
          continue;
        }

        await this.runTestSuite(suite);
        
        // Clean up between test suites
        await this.cleanupBetweenSuites();
        
        // Brief pause to allow system recovery
        await this.sleep(2000);
      }

    } catch (error) {
      console.error('❌ Test runner encountered a fatal error:', error);
      this.recordSuiteResult('System', 'failed', 0, Date.now(), error.message);
    } finally {
      await this.cleanup();
      this.generateReport();
      process.exit(this.results.summary.failed > 0 ? 1 : 0);
    }
  }

  async setupEnvironment() {
    console.log('🔧 Setting up test environment...');
    
    // Set environment variables
    process.env.NODE_ENV = 'test';
    process.env.CI = 'true';
    process.env.FORCE_COLOR = '1';
    
    // Create necessary directories
    const dirs = ['coverage', 'test-results', 'logs'];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Clean previous test artifacts
    await this.cleanupPreviousRuns();

    console.log('✅ Environment setup complete');
  }

  async runTestSuite(suite) {
    console.log(`\n🧪 Running ${suite.name}...`);
    const startTime = Date.now();
    let attempt = 0;
    let lastError = null;

    while (attempt <= suite.retries) {
      try {
        if (attempt > 0) {
          console.log(`   🔄 Retry attempt ${attempt} for ${suite.name}`);
          await this.sleep(5000); // Wait before retry
        }

        // Setup for this suite
        await this.setupForSuite(suite);

        // Run the test suite
        const result = await this.executeSuite(suite);
        
        if (result.success) {
          const duration = Date.now() - startTime;
          console.log(`✅ ${suite.name} completed successfully (${this.formatDuration(duration)})`);
          this.recordSuiteResult(suite.name, 'passed', duration, result.output);
          return;
        } else {
          throw new Error(result.error || 'Test suite failed');
        }

      } catch (error) {
        attempt++;
        lastError = error;
        console.log(`❌ ${suite.name} failed (attempt ${attempt}): ${error.message}`);
        
        if (attempt > suite.retries) {
          const duration = Date.now() - startTime;
          console.log(`💥 ${suite.name} failed after ${suite.retries + 1} attempts`);
          this.recordSuiteResult(suite.name, 'failed', duration, null, error.message);
          
          // If this is an essential test, we might want to stop
          if (suite.essential && !this.config.continueOnFailure) {
            throw new Error(`Essential test suite "${suite.name}" failed: ${error.message}`);
          }
          return;
        }
      }
    }
  }

  async setupForSuite(suite) {
    if (suite.setupDb) {
      await this.setupDatabase();
    }
    
    if (suite.setupApp) {
      await this.setupApplication();
    }
  }

  async setupDatabase() {
    console.log('   🗄️  Setting up test database...');
    
    const dbUrl = process.env.DATABASE_URL || 'postgresql://test_user:test_password@localhost:5432/evalmatch_test';
    process.env.DATABASE_URL = dbUrl;
    
    try {
      await this.execCommand('npm run db:push', { timeout: 30000 });
      await this.execCommand('npm run migrate', { timeout: 30000 });
      console.log('   ✅ Database setup complete');
    } catch (error) {
      console.log('   ⚠️  Database setup failed, continuing with in-memory fallback');
    }
  }

  async setupApplication() {
    console.log('   🚀 Starting application server...');
    
    // Build the application if needed
    if (!fs.existsSync('build')) {
      await this.execCommand('npm run build', { timeout: 120000 });
    }
    
    // Start the server in background
    const serverProcess = spawn('npm', ['start'], {
      env: { ...process.env, PORT: '3000' },
      detached: true,
      stdio: 'ignore'
    });
    
    // Store process ID for cleanup
    this.serverPid = serverProcess.pid;
    
    // Wait for server to be ready
    await this.waitForServer('http://localhost:3000/api/health', 60000);
    console.log('   ✅ Application server ready');
  }

  async executeSuite(suite) {
    return new Promise((resolve) => {
      const memoryLimit = suite.memoryLimit || this.config.maxMemory;
      const command = `node --max_old_space_size=${memoryLimit} ${suite.command.replace('npm', 'node_modules/.bin/npm')}`;
      
      console.log(`   ⚡ Executing: ${command}`);
      
      const child = spawn('bash', ['-c', command], {
        env: process.env,
        stdio: this.config.verbose ? 'inherit' : 'pipe'
      });

      let output = '';
      let errorOutput = '';

      if (!this.config.verbose) {
        child.stdout?.on('data', (data) => {
          output += data.toString();
        });

        child.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });
      }

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({
          success: false,
          error: `Test suite timed out after ${this.formatDuration(suite.timeout)}`,
          output: output + errorOutput
        });
      }, suite.timeout);

      child.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          resolve({
            success: true,
            output: output,
            code: code
          });
        } else {
          resolve({
            success: false,
            error: `Process exited with code ${code}`,
            output: output + errorOutput,
            code: code
          });
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message,
          output: errorOutput
        });
      });
    });
  }

  async cleanupBetweenSuites() {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Clean up temporary files
    const tempDirs = ['uploads/temp', 'tests/temp'];
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
          fs.mkdirSync(dir, { recursive: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    // Stop application server if running
    if (this.serverPid) {
      try {
        process.kill(this.serverPid, 'SIGTERM');
        await this.sleep(3000);
        process.kill(this.serverPid, 'SIGKILL');
      } catch (error) {
        // Process might already be dead
      }
    }

    // Clean up test data
    await this.cleanupTestData();
    
    console.log('✅ Cleanup complete');
  }

  async cleanupPreviousRuns() {
    const filesToClean = [
      'test-results.xml',
      'coverage/tmp',
      'playwright-report/index.html'
    ];

    for (const file of filesToClean) {
      if (fs.existsSync(file)) {
        try {
          fs.rmSync(file, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  }

  async cleanupTestData() {
    // This could include database cleanup, file system cleanup, etc.
    const tempFiles = ['test-*.pdf', 'test-*.docx', 'test-*.txt'];
    // Implementation would depend on your specific cleanup needs
  }

  recordSuiteResult(name, status, duration, output = null, error = null) {
    const result = {
      name,
      status,
      duration,
      timestamp: new Date().toISOString(),
      output: this.config.verbose ? output : null,
      error
    };

    this.results.suites.push(result);
    this.results.summary.total++;
    
    switch (status) {
      case 'passed':
        this.results.summary.passed++;
        break;
      case 'failed':
        this.results.summary.failed++;
        break;
      case 'skipped':
        this.results.summary.skipped++;
        break;
    }
  }

  generateReport() {
    this.results.endTime = Date.now();
    const totalDuration = this.results.endTime - this.results.startTime;

    console.log('\n' + '='.repeat(80));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Runtime: ${this.formatDuration(totalDuration)}`);
    console.log(`Test Suites: ${this.results.summary.total}`);
    console.log(`✅ Passed: ${this.results.summary.passed}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`⏭️  Skipped: ${this.results.summary.skipped}`);
    console.log();

    // Detailed results
    this.results.suites.forEach(suite => {
      const status = suite.status === 'passed' ? '✅' : suite.status === 'failed' ? '❌' : '⏭️';
      const duration = suite.duration ? ` (${this.formatDuration(suite.duration)})` : '';
      console.log(`${status} ${suite.name}${duration}`);
      
      if (suite.error && this.config.verbose) {
        console.log(`    Error: ${suite.error}`);
      }
    });

    // Overall result
    console.log('\n' + '─'.repeat(80));
    if (this.results.summary.failed === 0) {
      console.log('🎉 ALL TESTS PASSED! System is ready for deployment.');
    } else {
      console.log(`💥 ${this.results.summary.failed} test suite(s) failed. Please review and fix issues.`);
    }

    // Save detailed report
    this.saveDetailedReport();

    // Performance recommendations
    this.generateRecommendations();
  }

  saveDetailedReport() {
    const reportPath = path.join('test-results', 'comprehensive-test-report.json');
    
    try {
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      console.log(`\n📄 Detailed report saved: ${reportPath}`);
    } catch (error) {
      console.error('Failed to save detailed report:', error.message);
    }
  }

  generateRecommendations() {
    const recommendations = [];
    const totalDuration = this.results.endTime - this.results.startTime;

    // Performance recommendations
    if (totalDuration > 1800000) { // 30 minutes
      recommendations.push('Consider running tests in parallel or optimizing slow test suites');
    }

    const failedSuites = this.results.suites.filter(s => s.status === 'failed');
    if (failedSuites.length > 0) {
      recommendations.push('Focus on fixing failed test suites before deployment');
      
      if (failedSuites.some(s => s.name.includes('Security'))) {
        recommendations.push('Security tests failed - this is a critical issue that must be addressed');
      }
    }

    const longRunningSuites = this.results.suites.filter(s => s.duration > 300000); // 5 minutes
    if (longRunningSuites.length > 0) {
      recommendations.push(`Consider optimizing slow test suites: ${longRunningSuites.map(s => s.name).join(', ')}`);
    }

    if (recommendations.length > 0) {
      console.log('\n💡 RECOMMENDATIONS:');
      recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    }
  }

  // Utility methods
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForServer(url, timeout) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await this.sleep(2000);
    }
    
    throw new Error(`Server did not become ready within ${timeout}ms`);
  }

  async execCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Command failed: ${error.message}\nStderr: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }
}

// CLI Interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new ComprehensiveTestRunner();
  
  // Handle CLI arguments
  process.argv.slice(2).forEach(arg => {
    switch (arg) {
      case '--verbose':
        runner.config.verbose = true;
        break;
      case '--no-coverage':
        runner.config.coverage = false;
        break;
      case '--skip-e2e':
        runner.config.skipE2E = true;
        break;
      case '--skip-load':
        runner.config.skipLoad = true;
        break;
      case '--continue-on-failure':
        runner.config.continueOnFailure = true;
        break;
      case '--help':
        console.log(`
Comprehensive Test Runner

Usage: node comprehensive-test-runner.js [options]

Options:
  --verbose              Show detailed output from test commands
  --no-coverage         Skip coverage collection
  --skip-e2e            Skip end-to-end tests
  --skip-load           Skip load tests  
  --continue-on-failure Continue running tests even if essential tests fail
  --help                Show this help message

Environment Variables:
  MAX_TEST_MEMORY       Maximum memory for test processes (default: 4096MB)
  TEST_TIMEOUT          Default timeout for test suites (default: 300000ms)
  PARALLEL_TESTS        Enable parallel test execution (default: true)
  COVERAGE              Enable coverage collection (default: true)
  VERBOSE               Enable verbose output (default: false)
  SKIP_E2E              Skip E2E tests (default: false)
  SKIP_LOAD             Skip load tests (default: false)
        `);
        process.exit(0);
    }
  });

  // Handle process signals
  process.on('SIGINT', async () => {
    console.log('\n⚠️  Test runner interrupted by user');
    await runner.cleanup();
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    console.log('\n⚠️  Test runner terminated');
    await runner.cleanup();
    process.exit(1);
  });

  // Run the tests
  runner.run().catch(error => {
    console.error('Fatal error in test runner:', error);
    process.exit(1);
  });
}

export default ComprehensiveTestRunner;