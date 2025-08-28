/**
 * Application Metrics and Monitoring
 *
 * This module handles collecting and reporting application metrics
 * for monitoring application health and performance.
 */

import { logger } from "../config/logger";
import os from "os";

// Metrics storage
const metrics = {
  // Request metrics
  requestCount: 0,
  requestsPerEndpoint: new Map<string, number>(),
  responseTimeTotal: 0,
  responseTimeByEndpoint: new Map<string, number[]>(),
  errorCount: 0,

  // PDF processing metrics
  pdfProcessingCount: 0,
  pdfProcessingTimes: [] as number[],
  pdfExtractionSuccessCount: 0,
  pdfExtractionFailCount: 0,

  // AI API metrics
  aiApiCalls: 0,
  aiApiTokensTotal: 0,
  aiApiCost: 0,
  aiApiErrors: 0,

  // Database metrics
  dbQueryCount: 0,
  dbQueryErrors: 0,
  dbConnectionErrors: 0,

  // System metrics
  startTime: Date.now(),
  lastReportTime: Date.now(),
};

// Performance tracking for individual operations
const activeOperations = new Map<
  string,
  { startTime: number; operationType: string }
>();

/**
 * Track the start of an operation (API request, PDF processing, etc.)
 */
export function startOperation(id: string, operationType: string): void {
  activeOperations.set(id, { startTime: Date.now(), operationType });
}

/**
 * Track the end of an operation and record metrics
 */
export function endOperation(
  id: string,
  success: boolean = true,
  details: Record<string, unknown> = {},
): void {
  const operation = activeOperations.get(id);
  if (!operation) return;

  const duration = Date.now() - operation.startTime;
  activeOperations.delete(id);

  // Record metrics based on operation type
  switch (operation.operationType) {
    case "http_request": {
      metrics.requestCount++;
      metrics.responseTimeTotal += duration;

      // Track by endpoint
      const endpoint = String(details.endpoint || "unknown");
      metrics.requestsPerEndpoint.set(
        endpoint,
        (metrics.requestsPerEndpoint.get(endpoint) || 0) + 1,
      );

      // Store response time for this endpoint
      const times = metrics.responseTimeByEndpoint.get(endpoint) || [];
      times.push(duration);
      metrics.responseTimeByEndpoint.set(endpoint, times);

      if (!success) metrics.errorCount++;
      break;
    }

    case "pdf_processing":
      metrics.pdfProcessingCount++;
      metrics.pdfProcessingTimes.push(duration);
      if (success) {
        metrics.pdfExtractionSuccessCount++;
      } else {
        metrics.pdfExtractionFailCount++;
      }
      break;

    case "ai_api":
      metrics.aiApiCalls++;
      if (details.tokens) metrics.aiApiTokensTotal += Number(details.tokens);
      if (details.cost) metrics.aiApiCost += Number(details.cost);
      if (!success) metrics.aiApiErrors++;
      break;

    case "db_query":
      metrics.dbQueryCount++;
      if (!success) metrics.dbQueryErrors++;
      break;
  }
}

/**
 * Record a database connection error
 */
export function recordDbConnectionError(): void {
  metrics.dbConnectionErrors++;
}

/**
 * Get system resource usage metrics
 */
function getSystemMetrics() {
  return {
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
      usedPercent: (
        ((os.totalmem() - os.freemem()) / os.totalmem()) *
        100
      ).toFixed(2),
    },
    cpu: {
      loadAvg: os.loadavg(),
      uptime: os.uptime(),
    },
    process: {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    },
  };
}

/**
 * Calculate average response time for an endpoint
 */
function getAverageResponseTime(endpoint?: string): number {
  if (endpoint) {
    const times = metrics.responseTimeByEndpoint.get(endpoint);
    if (!times || times.length === 0) return 0;
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  return metrics.requestCount > 0
    ? metrics.responseTimeTotal / metrics.requestCount
    : 0;
}

/**
 * Get PDF processing metrics
 */
function getPdfMetrics() {
  const avgProcessingTime =
    metrics.pdfProcessingTimes.length > 0
      ? metrics.pdfProcessingTimes.reduce((sum, time) => sum + time, 0) /
        metrics.pdfProcessingTimes.length
      : 0;

  const successRate =
    metrics.pdfProcessingCount > 0
      ? (
          (metrics.pdfExtractionSuccessCount / metrics.pdfProcessingCount) *
          100
        ).toFixed(2)
      : "0";

  return {
    processed: metrics.pdfProcessingCount,
    successRate: `${successRate}%`,
    avgProcessingTime,
    failureCount: metrics.pdfExtractionFailCount,
  };
}

/**
 * Get AI API usage metrics
 */
function getAiMetrics() {
  return {
    calls: metrics.aiApiCalls,
    tokensUsed: metrics.aiApiTokensTotal,
    estimatedCost: `$${metrics.aiApiCost.toFixed(4)}`,
    errorRate:
      metrics.aiApiCalls > 0
        ? `${((metrics.aiApiErrors / metrics.aiApiCalls) * 100).toFixed(2)}%`
        : "0%",
  };
}

/**
 * Get database metrics
 */
function getDbMetrics() {
  return {
    queries: metrics.dbQueryCount,
    errors: metrics.dbQueryErrors,
    connectionErrors: metrics.dbConnectionErrors,
    errorRate:
      metrics.dbQueryCount > 0
        ? `${((metrics.dbQueryErrors / metrics.dbQueryCount) * 100).toFixed(2)}%`
        : "0%",
  };
}

/**
 * Get application uptime in a human-readable format
 */
function getUptimeFormatted(): string {
  const uptime = Date.now() - metrics.startTime;
  const seconds = Math.floor(uptime / 1000) % 60;
  const minutes = Math.floor(uptime / (1000 * 60)) % 60;
  const hours = Math.floor(uptime / (1000 * 60 * 60)) % 24;
  const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Generate a full metrics report
 */
export function getMetricsReport() {
  return {
    uptime: getUptimeFormatted(),
    http: {
      requestCount: metrics.requestCount,
      averageResponseTime: getAverageResponseTime(),
      errorCount: metrics.errorCount,
      errorRate:
        metrics.requestCount > 0
          ? `${((metrics.errorCount / metrics.requestCount) * 100).toFixed(2)}%`
          : "0%",
      endpointBreakdown: Array.from(metrics.requestsPerEndpoint.entries()).map(
        ([endpoint, count]) => ({
          endpoint,
          count,
          averageResponseTime: getAverageResponseTime(endpoint),
        }),
      ),
    },
    pdf: getPdfMetrics(),
    ai: getAiMetrics(),
    db: getDbMetrics(),
    system: getSystemMetrics(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log metrics periodically (e.g., every hour)
 */
export function startMetricsReporting(
  intervalMs: number = 3600000,
): NodeJS.Timeout {
  return setInterval(() => {
    const report = getMetricsReport();
    logger.info({ metrics: report }, "Periodic metrics report");
    metrics.lastReportTime = Date.now();
  }, intervalMs);
}

/**
 * Reset metrics counters
 */
export function resetMetrics() {
  metrics.requestCount = 0;
  metrics.requestsPerEndpoint.clear();
  metrics.responseTimeTotal = 0;
  metrics.responseTimeByEndpoint.clear();
  metrics.errorCount = 0;
  metrics.pdfProcessingCount = 0;
  metrics.pdfProcessingTimes = [];
  metrics.pdfExtractionSuccessCount = 0;
  metrics.pdfExtractionFailCount = 0;
  metrics.aiApiCalls = 0;
  metrics.aiApiTokensTotal = 0;
  metrics.aiApiCost = 0;
  metrics.aiApiErrors = 0;
  metrics.dbQueryCount = 0;
  metrics.dbQueryErrors = 0;
  metrics.dbConnectionErrors = 0;
  activeOperations.clear();
}
