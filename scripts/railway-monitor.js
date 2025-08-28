#!/usr/bin/env node

/**
 * Railway Deployment Monitoring Script
 * 
 * Continuously monitors the health of your Railway deployment with:
 * - Health check intervals
 * - Performance metrics tracking
 * - Alert notifications
 * - Historical data logging
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import https from 'https';

// Configuration
const CONFIG = {
  railwayUrl: process.env.RAILWAY_MONITOR_URL || 'https://web-production-392cc.up.railway.app',
  checkInterval: parseInt(process.env.MONITOR_INTERVAL || '300000'), // 5 minutes default
  alertThreshold: {
    responseTime: 5000, // 5 seconds
    errorRate: 0.1, // 10% error rate
    consecutiveFailures: 3
  },
  logDirectory: './monitoring-logs',
  metricsFile: 'railway-metrics.json',
  alertsFile: 'railway-alerts.json',
  webhookUrl: process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL
};

// Monitoring state
let monitoringState = {
  startTime: Date.now(),
  totalChecks: 0,
  successfulChecks: 0,
  failedChecks: 0,
  consecutiveFailures: 0,
  lastCheck: null,
  metrics: {
    responseTimesMs: [],
    statusCodes: {},
    errors: []
  }
};

// Ensure log directory exists
if (!existsSync(CONFIG.logDirectory)) {
  mkdirSync(CONFIG.logDirectory, { recursive: true });
}

/**
 * Perform health check
 */
async function performHealthCheck() {
  const startTime = Date.now();
  const checkResult = {
    timestamp: new Date().toISOString(),
    success: false,
    responseTime: 0,
    statusCode: null,
    error: null,
    data: null
  };

  try {
    const response = await fetchWithTimeout(`${CONFIG.railwayUrl}/api/health`, {}, 10000);
    const responseTime = Date.now() - startTime;
    
    checkResult.responseTime = responseTime;
    checkResult.statusCode = response.status;
    checkResult.success = response.status === 200;
    
    if (response.status === 200) {
      checkResult.data = await response.json();
    }
    
    // Update metrics
    monitoringState.metrics.responseTimesMs.push(responseTime);
    monitoringState.metrics.statusCodes[response.status] = 
      (monitoringState.metrics.statusCodes[response.status] || 0) + 1;
    
  } catch (error) {
    checkResult.error = error.message;
    monitoringState.metrics.errors.push({
      timestamp: checkResult.timestamp,
      error: error.message
    });
  }
  
  // Update state
  monitoringState.totalChecks++;
  if (checkResult.success) {
    monitoringState.successfulChecks++;
    monitoringState.consecutiveFailures = 0;
  } else {
    monitoringState.failedChecks++;
    monitoringState.consecutiveFailures++;
  }
  monitoringState.lastCheck = checkResult;
  
  return checkResult;
}

/**
 * Check if alerts should be triggered
 */
async function checkAlerts(checkResult) {
  const alerts = [];
  
  // Response time alert
  if (checkResult.responseTime > CONFIG.alertThreshold.responseTime) {
    alerts.push({
      type: 'SLOW_RESPONSE',
      message: `Response time ${checkResult.responseTime}ms exceeds threshold of ${CONFIG.alertThreshold.responseTime}ms`,
      severity: 'warning'
    });
  }
  
  // Consecutive failures alert
  if (monitoringState.consecutiveFailures >= CONFIG.alertThreshold.consecutiveFailures) {
    alerts.push({
      type: 'SERVICE_DOWN',
      message: `Service has failed ${monitoringState.consecutiveFailures} consecutive health checks`,
      severity: 'critical'
    });
  }
  
  // Error rate alert
  const errorRate = monitoringState.failedChecks / monitoringState.totalChecks;
  if (errorRate > CONFIG.alertThreshold.errorRate && monitoringState.totalChecks > 10) {
    alerts.push({
      type: 'HIGH_ERROR_RATE',
      message: `Error rate ${(errorRate * 100).toFixed(2)}% exceeds threshold of ${CONFIG.alertThreshold.errorRate * 100}%`,
      severity: 'warning'
    });
  }
  
  // Send alerts
  if (alerts.length > 0) {
    await sendAlerts(alerts, checkResult);
    logAlerts(alerts);
  }
  
  return alerts;
}

/**
 * Send alerts via webhook
 */
async function sendAlerts(alerts, checkResult) {
  if (!CONFIG.webhookUrl) {
    console.log('⚠️  No webhook URL configured for alerts');
    return;
  }
  
  const alertMessage = {
    text: `🚨 Railway Monitoring Alert`,
    embeds: alerts.map(alert => ({
      title: alert.type.replace(/_/g, ' '),
      description: alert.message,
      color: alert.severity === 'critical' ? 0xFF0000 : 0xFFFF00,
      fields: [
        { name: 'Service URL', value: CONFIG.railwayUrl, inline: true },
        { name: 'Response Time', value: `${checkResult.responseTime}ms`, inline: true },
        { name: 'Status Code', value: checkResult.statusCode || 'N/A', inline: true },
        { name: 'Uptime', value: `${((monitoringState.successfulChecks / monitoringState.totalChecks) * 100).toFixed(2)}%`, inline: true }
      ],
      timestamp: checkResult.timestamp
    }))
  };
  
  try {
    await fetch(CONFIG.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alertMessage)
    });
  } catch (error) {
    console.error('Failed to send webhook alert:', error.message);
  }
}

/**
 * Log metrics to file
 */
function logMetrics() {
  const metricsPath = join(CONFIG.logDirectory, CONFIG.metricsFile);
  
  // Calculate statistics
  const avgResponseTime = monitoringState.metrics.responseTimesMs.length > 0
    ? monitoringState.metrics.responseTimesMs.reduce((a, b) => a + b, 0) / monitoringState.metrics.responseTimesMs.length
    : 0;
  
  const uptime = monitoringState.totalChecks > 0
    ? (monitoringState.successfulChecks / monitoringState.totalChecks) * 100
    : 0;
  
  const metrics = {
    timestamp: new Date().toISOString(),
    summary: {
      uptime: `${uptime.toFixed(2)}%`,
      totalChecks: monitoringState.totalChecks,
      successfulChecks: monitoringState.successfulChecks,
      failedChecks: monitoringState.failedChecks,
      averageResponseTime: `${avgResponseTime.toFixed(2)}ms`,
      monitoringDuration: `${((Date.now() - monitoringState.startTime) / 1000 / 60).toFixed(2)} minutes`
    },
    statusCodes: monitoringState.metrics.statusCodes,
    recentErrors: monitoringState.metrics.errors.slice(-10),
    lastCheck: monitoringState.lastCheck
  };
  
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
}

/**
 * Log alerts to file
 */
function logAlerts(alerts) {
  const alertsPath = join(CONFIG.logDirectory, CONFIG.alertsFile);
  
  let existingAlerts = [];
  if (existsSync(alertsPath)) {
    try {
      existingAlerts = JSON.parse(readFileSync(alertsPath, 'utf8'));
    } catch (error) {
      console.error('Error reading alerts file:', error.message);
    }
  }
  
  const newAlerts = alerts.map(alert => ({
    ...alert,
    timestamp: new Date().toISOString(),
    resolved: false
  }));
  
  existingAlerts.push(...newAlerts);
  
  // Keep only last 100 alerts
  if (existingAlerts.length > 100) {
    existingAlerts = existingAlerts.slice(-100);
  }
  
  writeFileSync(alertsPath, JSON.stringify(existingAlerts, null, 2));
}

/**
 * Print monitoring status
 */
function printStatus() {
  const uptime = monitoringState.totalChecks > 0
    ? (monitoringState.successfulChecks / monitoringState.totalChecks) * 100
    : 0;
  
  console.log('\n📊 Railway Monitoring Status');
  console.log('═══════════════════════════════════════');
  console.log(`🌐 URL: ${CONFIG.railwayUrl}`);
  console.log(`⏱️  Uptime: ${uptime.toFixed(2)}%`);
  console.log(`✅ Successful: ${monitoringState.successfulChecks}`);
  console.log(`❌ Failed: ${monitoringState.failedChecks}`);
  console.log(`🔄 Total Checks: ${monitoringState.totalChecks}`);
  console.log(`⚡ Last Response: ${monitoringState.lastCheck?.responseTime || 'N/A'}ms`);
  console.log(`📅 Running Since: ${new Date(monitoringState.startTime).toLocaleString()}`);
  console.log('═══════════════════════════════════════\n');
}

/**
 * Fetch with timeout helper
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Main monitoring loop
 */
async function startMonitoring() {
  console.log('🚂 Starting Railway Deployment Monitor');
  console.log(`📍 Monitoring: ${CONFIG.railwayUrl}`);
  console.log(`⏰ Check Interval: ${CONFIG.checkInterval / 1000} seconds`);
  console.log(`📁 Logs Directory: ${CONFIG.logDirectory}`);
  console.log('');
  
  // Initial check
  const initialCheck = await performHealthCheck();
  await checkAlerts(initialCheck);
  logMetrics();
  printStatus();
  
  // Set up interval
  setInterval(async () => {
    const checkResult = await performHealthCheck();
    await checkAlerts(checkResult);
    logMetrics();
    
    // Print status every 5 checks
    if (monitoringState.totalChecks % 5 === 0) {
      printStatus();
    }
  }, CONFIG.checkInterval);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping Railway Monitor...');
    logMetrics();
    printStatus();
    process.exit(0);
  });
}

// Start monitoring
startMonitoring().catch(console.error);