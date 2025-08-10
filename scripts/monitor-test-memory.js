#!/usr/bin/env node

/**
 * Memory Usage Monitor for Jest Tests
 * Monitors and reports memory usage during test execution
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class MemoryMonitor {
  constructor() {
    this.samples = [];
    this.interval = null;
    this.logFile = path.join(__dirname, '..', 'test-memory.log');
  }

  start() {
    console.log('🔍 Starting memory monitoring...');
    console.log(`📝 Logging to: ${this.logFile}`);
    
    // Clear existing log
    fs.writeFileSync(this.logFile, '');
    
    this.interval = setInterval(() => {
      const usage = process.memoryUsage();
      const timestamp = new Date().toISOString();
      
      const sample = {
        timestamp,
        rss: Math.round(usage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
        external: Math.round(usage.external / 1024 / 1024) // MB
      };
      
      this.samples.push(sample);
      
      // Log to file
      const logLine = `${timestamp}: RSS=${sample.rss}MB, Heap=${sample.heapUsed}/${sample.heapTotal}MB, External=${sample.external}MB\n`;
      fs.appendFileSync(this.logFile, logLine);
      
      // Console output every 10 samples (10 seconds)
      if (this.samples.length % 10 === 0) {
        console.log(`📊 Memory: RSS=${sample.rss}MB, Heap=${sample.heapUsed}/${sample.heapTotal}MB`);
      }
      
      // Check for memory issues
      if (sample.rss > 1024) { // 1GB
        console.warn(`⚠️  High RSS memory usage: ${sample.rss}MB`);
      }
      
      if (sample.heapUsed > 512) { // 512MB
        console.warn(`⚠️  High heap usage: ${sample.heapUsed}MB`);
      }
    }, 1000); // Sample every second
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    this.generateReport();
  }

  generateReport() {
    if (this.samples.length === 0) {
      console.log('No memory samples collected');
      return;
    }

    const maxRss = Math.max(...this.samples.map(s => s.rss));
    const maxHeap = Math.max(...this.samples.map(s => s.heapUsed));
    const avgRss = Math.round(this.samples.reduce((sum, s) => sum + s.rss, 0) / this.samples.length);
    const avgHeap = Math.round(this.samples.reduce((sum, s) => sum + s.heapUsed, 0) / this.samples.length);
    
    const report = `
📊 Memory Usage Report
===================
Duration: ${Math.round(this.samples.length / 60)} minutes
Samples: ${this.samples.length}

RSS Memory:
- Peak: ${maxRss}MB
- Average: ${avgRss}MB

Heap Memory:
- Peak: ${maxHeap}MB
- Average: ${avgHeap}MB

Log file: ${this.logFile}
`;
    
    console.log(report);
    
    // Write summary to log
    fs.appendFileSync(this.logFile, report);
  }
}

// Run Jest with memory monitoring
function runTestsWithMemoryMonitoring(jestArgs = []) {
  const monitor = new MemoryMonitor();
  monitor.start();
  
  const jestProcess = spawn('node', [
    '--max_old_space_size=2048',
    'node_modules/.bin/jest',
    ...jestArgs
  ], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test'
    }
  });
  
  jestProcess.on('close', (code) => {
    monitor.stop();
    console.log(`\n🏁 Jest exited with code: ${code}`);
    process.exit(code);
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping memory monitoring...');
    monitor.stop();
    jestProcess.kill();
    process.exit(1);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping memory monitoring...');
    monitor.stop();
    jestProcess.kill();
    process.exit(1);
  });
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Memory Monitor for Jest Tests

Usage: node scripts/monitor-test-memory.js [jest-args...]

This script runs Jest with memory monitoring and generates a report.

Examples:
  # Monitor all tests
  node scripts/monitor-test-memory.js
  
  # Monitor specific test file
  node scripts/monitor-test-memory.js tests/unit/lib/scoring-constants.test.ts
  
  # Monitor with Jest options
  node scripts/monitor-test-memory.js --runInBand --verbose
    `);
    process.exit(0);
  }
  
  runTestsWithMemoryMonitoring(args);
}

module.exports = { MemoryMonitor };