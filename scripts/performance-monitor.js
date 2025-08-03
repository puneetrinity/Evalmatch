#!/usr/bin/env node

/**
 * Railway Performance Monitoring Script
 * 
 * Monitors performance metrics of your Railway deployment including:
 * - Response time percentiles (p50, p90, p95, p99)
 * - Throughput (requests per second)
 * - Error rates and status code distribution
 * - Resource usage patterns
 * - Endpoint-specific performance
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import https from 'https';
import { spawn } from 'child_process';

// Configuration
const CONFIG = {
  railwayUrl: process.env.RAILWAY_MONITOR_URL || 'https://web-production-392cc.up.railway.app',
  endpoints: [
    { path: '/api/health', method: 'GET', name: 'Health Check' },
    { path: '/api/job-descriptions', method: 'GET', name: 'List Jobs' },
    { path: '/api/resumes', method: 'GET', name: 'List Resumes' },
    { path: '/api/migration-status', method: 'GET', name: 'Migration Status' }
  ],
  performanceTests: {
    duration: 30, // seconds
    connections: 10, // concurrent connections
    pipelining: 2, // requests per connection
    interval: 300000 // 5 minutes between tests
  },
  thresholds: {
    p50: 200, // 200ms
    p90: 500, // 500ms
    p95: 1000, // 1s
    p99: 2000, // 2s
    errorRate: 0.01, // 1%
    throughput: 100 // requests per second
  },
  reportDirectory: './performance-reports',
  alertWebhook: process.env.PERFORMANCE_WEBHOOK_URL
};

// Performance tracking state
let performanceState = {
  startTime: Date.now(),
  totalTests: 0,
  endpointMetrics: {},
  alerts: [],
  trends: {
    responseTime: [],
    throughput: [],
    errorRate: []
  }
};

// Initialize endpoint metrics
CONFIG.endpoints.forEach(endpoint => {
  performanceState.endpointMetrics[endpoint.name] = {
    responseTimes: [],
    statusCodes: {},
    errors: 0,
    totalRequests: 0
  };
});

// Ensure report directory exists
if (!existsSync(CONFIG.reportDirectory)) {
  mkdirSync(CONFIG.reportDirectory, { recursive: true });
}

/**
 * Run autocannon performance test
 */
async function runPerformanceTest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = `${CONFIG.railwayUrl}${endpoint.path}`;
    const args = [
      '-c', CONFIG.performanceTests.connections.toString(),
      '-d', CONFIG.performanceTests.duration.toString(),
      '-p', CONFIG.performanceTests.pipelining.toString(),
      '--json',
      url
    ];

    if (endpoint.method !== 'GET') {
      args.push('-m', endpoint.method);
    }

    console.log(`📊 Running performance test for ${endpoint.name}...`);
    
    const autocannon = spawn('npx', ['autocannon', ...args]);
    let output = '';
    let error = '';

    autocannon.stdout.on('data', (data) => {
      output += data.toString();
    });

    autocannon.stderr.on('data', (data) => {
      error += data.toString();
    });

    autocannon.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Autocannon failed: ${error}`));
      } else {
        try {
          const results = JSON.parse(output);
          resolve(results);
        } catch (parseError) {
          reject(new Error(`Failed to parse autocannon output: ${parseError.message}`));
        }
      }
    });
  });
}

/**
 * Analyze performance results
 */
function analyzeResults(endpoint, results) {
  const analysis = {
    endpoint: endpoint.name,
    timestamp: new Date().toISOString(),
    summary: {
      totalRequests: results.requests.total,
      totalErrors: results.errors || 0,
      duration: results.duration,
      throughput: results.throughput.mean,
      errorRate: results.errors ? results.errors / results.requests.total : 0
    },
    latency: {
      p50: results.latency.p50,
      p90: results.latency.p90,
      p95: results.latency.p95,
      p99: results.latency.p99,
      p999: results.latency.p99_9,
      mean: results.latency.mean,
      stddev: results.latency.stddev,
      min: results.latency.min,
      max: results.latency.max
    },
    statusCodes: results.statusCodeStats || {}
  };

  // Update endpoint metrics
  const metrics = performanceState.endpointMetrics[endpoint.name];
  metrics.totalRequests += analysis.summary.totalRequests;
  metrics.errors += analysis.summary.totalErrors;
  
  // Track response times for trend analysis
  metrics.responseTimes.push({
    timestamp: analysis.timestamp,
    p50: analysis.latency.p50,
    p90: analysis.latency.p90,
    p95: analysis.latency.p95,
    p99: analysis.latency.p99,
    mean: analysis.latency.mean
  });

  // Keep only last 100 data points
  if (metrics.responseTimes.length > 100) {
    metrics.responseTimes = metrics.responseTimes.slice(-100);
  }

  // Update status codes
  Object.entries(analysis.statusCodes).forEach(([code, count]) => {
    metrics.statusCodes[code] = (metrics.statusCodes[code] || 0) + count;
  });

  return analysis;
}

/**
 * Check thresholds and generate alerts
 */
function checkThresholds(analysis) {
  const alerts = [];
  const thresholds = CONFIG.thresholds;

  // Latency thresholds
  if (analysis.latency.p50 > thresholds.p50) {
    alerts.push({
      type: 'LATENCY_P50',
      severity: 'warning',
      message: `P50 latency ${analysis.latency.p50}ms exceeds threshold ${thresholds.p50}ms for ${analysis.endpoint}`
    });
  }

  if (analysis.latency.p90 > thresholds.p90) {
    alerts.push({
      type: 'LATENCY_P90',
      severity: 'warning',
      message: `P90 latency ${analysis.latency.p90}ms exceeds threshold ${thresholds.p90}ms for ${analysis.endpoint}`
    });
  }

  if (analysis.latency.p99 > thresholds.p99) {
    alerts.push({
      type: 'LATENCY_P99',
      severity: 'critical',
      message: `P99 latency ${analysis.latency.p99}ms exceeds threshold ${thresholds.p99}ms for ${analysis.endpoint}`
    });
  }

  // Error rate threshold
  if (analysis.summary.errorRate > thresholds.errorRate) {
    alerts.push({
      type: 'HIGH_ERROR_RATE',
      severity: 'critical',
      message: `Error rate ${(analysis.summary.errorRate * 100).toFixed(2)}% exceeds threshold ${thresholds.errorRate * 100}% for ${analysis.endpoint}`
    });
  }

  // Throughput threshold
  if (analysis.summary.throughput < thresholds.throughput) {
    alerts.push({
      type: 'LOW_THROUGHPUT',
      severity: 'warning',
      message: `Throughput ${analysis.summary.throughput.toFixed(2)} req/s below threshold ${thresholds.throughput} req/s for ${analysis.endpoint}`
    });
  }

  return alerts;
}

/**
 * Send performance alerts
 */
async function sendAlerts(alerts, analysis) {
  if (!CONFIG.alertWebhook || alerts.length === 0) {
    return;
  }

  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  const alertMessage = {
    text: `🚨 Performance Alert for ${analysis.endpoint}`,
    embeds: [{
      title: 'Performance Threshold Violations',
      color: criticalAlerts.length > 0 ? 0xFF0000 : 0xFFFF00,
      fields: [
        {
          name: 'Endpoint',
          value: analysis.endpoint,
          inline: true
        },
        {
          name: 'Critical Alerts',
          value: criticalAlerts.length.toString(),
          inline: true
        },
        {
          name: 'Warnings',
          value: warningAlerts.length.toString(),
          inline: true
        },
        {
          name: 'P50/P90/P99 Latency',
          value: `${analysis.latency.p50}ms / ${analysis.latency.p90}ms / ${analysis.latency.p99}ms`,
          inline: false
        },
        {
          name: 'Throughput',
          value: `${analysis.summary.throughput.toFixed(2)} req/s`,
          inline: true
        },
        {
          name: 'Error Rate',
          value: `${(analysis.summary.errorRate * 100).toFixed(2)}%`,
          inline: true
        },
        {
          name: 'Alert Details',
          value: alerts.map(a => `• ${a.message}`).join('\n').substring(0, 1024),
          inline: false
        }
      ],
      timestamp: analysis.timestamp
    }]
  };

  try {
    await fetch(CONFIG.alertWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertMessage)
    });
  } catch (error) {
    console.error('Failed to send performance alert:', error.message);
  }
}

/**
 * Generate performance report
 */
function generateReport() {
  const report = {
    metadata: {
      startTime: new Date(performanceState.startTime).toISOString(),
      reportTime: new Date().toISOString(),
      duration: `${((Date.now() - performanceState.startTime) / 1000 / 60).toFixed(2)} minutes`,
      totalTests: performanceState.totalTests,
      railwayUrl: CONFIG.railwayUrl
    },
    endpointPerformance: {},
    overallMetrics: {
      totalRequests: 0,
      totalErrors: 0,
      averageLatency: {},
      statusCodeDistribution: {}
    },
    alerts: performanceState.alerts.slice(-50), // Last 50 alerts
    recommendations: []
  };

  // Compile endpoint performance
  Object.entries(performanceState.endpointMetrics).forEach(([name, metrics]) => {
    if (metrics.responseTimes.length === 0) return;

    const latestMetrics = metrics.responseTimes[metrics.responseTimes.length - 1];
    const avgMetrics = {
      p50: metrics.responseTimes.reduce((sum, m) => sum + m.p50, 0) / metrics.responseTimes.length,
      p90: metrics.responseTimes.reduce((sum, m) => sum + m.p90, 0) / metrics.responseTimes.length,
      p95: metrics.responseTimes.reduce((sum, m) => sum + m.p95, 0) / metrics.responseTimes.length,
      p99: metrics.responseTimes.reduce((sum, m) => sum + m.p99, 0) / metrics.responseTimes.length
    };

    report.endpointPerformance[name] = {
      totalRequests: metrics.totalRequests,
      totalErrors: metrics.errors,
      errorRate: metrics.totalRequests > 0 ? (metrics.errors / metrics.totalRequests) * 100 : 0,
      latestLatency: latestMetrics,
      averageLatency: avgMetrics,
      statusCodes: metrics.statusCodes,
      trend: calculateTrend(metrics.responseTimes)
    };

    // Update overall metrics
    report.overallMetrics.totalRequests += metrics.totalRequests;
    report.overallMetrics.totalErrors += metrics.errors;
    
    Object.entries(metrics.statusCodes).forEach(([code, count]) => {
      report.overallMetrics.statusCodeDistribution[code] = 
        (report.overallMetrics.statusCodeDistribution[code] || 0) + count;
    });
  });

  // Calculate overall average latency
  const allResponseTimes = Object.values(performanceState.endpointMetrics)
    .flatMap(m => m.responseTimes);
  
  if (allResponseTimes.length > 0) {
    report.overallMetrics.averageLatency = {
      p50: allResponseTimes.reduce((sum, m) => sum + m.p50, 0) / allResponseTimes.length,
      p90: allResponseTimes.reduce((sum, m) => sum + m.p90, 0) / allResponseTimes.length,
      p95: allResponseTimes.reduce((sum, m) => sum + m.p95, 0) / allResponseTimes.length,
      p99: allResponseTimes.reduce((sum, m) => sum + m.p99, 0) / allResponseTimes.length
    };
  }

  // Generate recommendations
  report.recommendations = generateRecommendations(report);

  return report;
}

/**
 * Calculate performance trend
 */
function calculateTrend(responseTimes) {
  if (responseTimes.length < 2) return 'stable';

  const recent = responseTimes.slice(-10);
  const older = responseTimes.slice(-20, -10);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((sum, m) => sum + m.mean, 0) / recent.length;
  const olderAvg = older.reduce((sum, m) => sum + m.mean, 0) / older.length;

  const changePercent = ((recentAvg - olderAvg) / olderAvg) * 100;

  if (changePercent > 10) return 'degrading';
  if (changePercent < -10) return 'improving';
  return 'stable';
}

/**
 * Generate performance recommendations
 */
function generateRecommendations(report) {
  const recommendations = [];

  // Check overall error rate
  const overallErrorRate = report.overallMetrics.totalRequests > 0 
    ? (report.overallMetrics.totalErrors / report.overallMetrics.totalRequests) * 100 
    : 0;

  if (overallErrorRate > 5) {
    recommendations.push({
      priority: 'high',
      category: 'reliability',
      recommendation: `High error rate detected (${overallErrorRate.toFixed(2)}%). Investigate error logs and implement retry mechanisms.`
    });
  }

  // Check latency
  if (report.overallMetrics.averageLatency.p95 > 1000) {
    recommendations.push({
      priority: 'high',
      category: 'performance',
      recommendation: 'P95 latency exceeds 1 second. Consider implementing caching, query optimization, or horizontal scaling.'
    });
  }

  // Check endpoint-specific issues
  Object.entries(report.endpointPerformance).forEach(([endpoint, metrics]) => {
    if (metrics.trend === 'degrading') {
      recommendations.push({
        priority: 'medium',
        category: 'performance',
        recommendation: `Performance degradation detected for ${endpoint}. Monitor closely and investigate recent changes.`
      });
    }

    if (metrics.errorRate > 10) {
      recommendations.push({
        priority: 'high',
        category: 'reliability',
        recommendation: `${endpoint} has ${metrics.errorRate.toFixed(2)}% error rate. Check endpoint implementation and dependencies.`
      });
    }
  });

  // Check status code distribution
  const status5xx = Object.entries(report.overallMetrics.statusCodeDistribution)
    .filter(([code]) => code.startsWith('5'))
    .reduce((sum, [, count]) => sum + count, 0);

  if (status5xx > report.overallMetrics.totalRequests * 0.01) {
    recommendations.push({
      priority: 'critical',
      category: 'reliability',
      recommendation: 'High rate of 5xx errors detected. Check server logs and infrastructure health immediately.'
    });
  }

  return recommendations;
}

/**
 * Save performance report
 */
function saveReport(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = join(CONFIG.reportDirectory, `performance-report-${timestamp}.json`);
  
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Also save as latest report
  const latestPath = join(CONFIG.reportDirectory, 'latest-performance-report.json');
  writeFileSync(latestPath, JSON.stringify(report, null, 2));
  
  console.log(`📊 Performance report saved to ${reportPath}`);
}

/**
 * Print performance summary
 */
function printSummary(report) {
  console.log('\n📈 Performance Summary');
  console.log('═══════════════════════════════════════');
  console.log(`🌐 Railway URL: ${CONFIG.railwayUrl}`);
  console.log(`⏱️  Monitoring Duration: ${report.metadata.duration}`);
  console.log(`📊 Total Tests Run: ${report.metadata.totalTests}`);
  console.log(`📨 Total Requests: ${report.overallMetrics.totalRequests.toLocaleString()}`);
  console.log(`❌ Total Errors: ${report.overallMetrics.totalErrors.toLocaleString()}`);
  
  if (report.overallMetrics.averageLatency.p50) {
    console.log(`\n⚡ Latency Percentiles (Overall)`);
    console.log(`   P50: ${report.overallMetrics.averageLatency.p50.toFixed(0)}ms`);
    console.log(`   P90: ${report.overallMetrics.averageLatency.p90.toFixed(0)}ms`);
    console.log(`   P95: ${report.overallMetrics.averageLatency.p95.toFixed(0)}ms`);
    console.log(`   P99: ${report.overallMetrics.averageLatency.p99.toFixed(0)}ms`);
  }
  
  console.log(`\n📊 Endpoint Performance`);
  Object.entries(report.endpointPerformance).forEach(([endpoint, metrics]) => {
    const trend = metrics.trend === 'improving' ? '📈' : 
                  metrics.trend === 'degrading' ? '📉' : '➡️';
    console.log(`   ${endpoint}: ${metrics.errorRate.toFixed(2)}% errors ${trend}`);
  });
  
  if (report.recommendations.length > 0) {
    console.log(`\n💡 Top Recommendations`);
    report.recommendations
      .filter(r => r.priority === 'high' || r.priority === 'critical')
      .slice(0, 3)
      .forEach(rec => {
        console.log(`   • [${rec.priority.toUpperCase()}] ${rec.recommendation}`);
      });
  }
  
  console.log('═══════════════════════════════════════\n');
}

/**
 * Run performance test cycle
 */
async function runTestCycle() {
  console.log(`\n🔄 Starting performance test cycle ${performanceState.totalTests + 1}`);
  
  for (const endpoint of CONFIG.endpoints) {
    try {
      const results = await runPerformanceTest(endpoint);
      const analysis = analyzeResults(endpoint, results);
      const alerts = checkThresholds(analysis);
      
      if (alerts.length > 0) {
        performanceState.alerts.push(...alerts.map(a => ({
          ...a,
          timestamp: analysis.timestamp,
          endpoint: endpoint.name
        })));
        await sendAlerts(alerts, analysis);
      }
      
      console.log(`✅ ${endpoint.name}: P50=${analysis.latency.p50}ms, P99=${analysis.latency.p99}ms, Errors=${analysis.summary.errorRate.toFixed(2)}%`);
      
      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Failed to test ${endpoint.name}: ${error.message}`);
      performanceState.endpointMetrics[endpoint.name].errors++;
    }
  }
  
  performanceState.totalTests++;
  
  // Generate and save report
  const report = generateReport();
  saveReport(report);
  printSummary(report);
}

/**
 * Main monitoring loop
 */
async function startMonitoring() {
  console.log('🚀 Starting Railway Performance Monitor');
  console.log(`📍 Target: ${CONFIG.railwayUrl}`);
  console.log(`⏰ Test Interval: ${CONFIG.performanceTests.interval / 1000 / 60} minutes`);
  console.log(`📊 Test Duration: ${CONFIG.performanceTests.duration} seconds per endpoint`);
  console.log(`🔗 Concurrent Connections: ${CONFIG.performanceTests.connections}`);
  console.log('');
  
  // Check if autocannon is available
  try {
    await new Promise((resolve, reject) => {
      const check = spawn('npx', ['autocannon', '--version']);
      check.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error('autocannon not available'));
      });
    });
  } catch (error) {
    console.error('❌ autocannon not found. Installing...');
    await new Promise((resolve) => {
      const install = spawn('npm', ['install', '-g', 'autocannon']);
      install.on('close', () => resolve());
    });
  }
  
  // Run initial test cycle
  await runTestCycle();
  
  // Schedule regular test cycles
  setInterval(runTestCycle, CONFIG.performanceTests.interval);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping Performance Monitor...');
    const finalReport = generateReport();
    saveReport(finalReport);
    printSummary(finalReport);
    process.exit(0);
  });
}

// Start monitoring
startMonitoring().catch(console.error);