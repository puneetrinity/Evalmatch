/**
 * Phase 3.4: Performance monitoring integration for complete request tracking
 * 
 * Request-scoped performance tracking with operation timing and alerting
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';
import crypto from 'crypto';

interface PerformanceMetrics {
  requestId: string;
  startTime: number;
  endTime?: number;
  totalTime?: number;
  breakdown: {
    dataExtraction?: number;
    llmAnalysis?: number;
    mlAnalysis?: number;
    escoMatching?: number;
    embeddingGeneration?: number;
    scoringCalculation?: number;
    cacheOperations?: number;
  };
  cacheStats?: {
    escoHitRate?: number;
    embeddingHitRate?: number;
  };
}

// ✅ CRITICAL: Request-scoped performance tracking
export function initializePerformanceTracking(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();

  const metrics: PerformanceMetrics = {
    requestId,
    startTime: Date.now(),
    breakdown: {}
  };

  // Attach to request for access throughout pipeline
  (req as any).performanceMetrics = metrics;

  // Capture response timing
  res.on('finish', () => {
    metrics.endTime = Date.now();
    metrics.totalTime = metrics.endTime - metrics.startTime;

    logPerformanceMetrics(metrics, req.path);
  });

  next();
}

// ✅ CRITICAL: Operation timing wrapper
export function trackOperation<T>(
  operationName: keyof PerformanceMetrics['breakdown'],
  operation: () => Promise<T>,
  req?: Request
): Promise<{ result: T; duration: number }> {
  const startTime = Date.now();

  return operation().then(result => {
    const duration = Date.now() - startTime;

    if (req) {
      const metrics = (req as any).performanceMetrics as PerformanceMetrics;
      if (metrics) {
        metrics.breakdown[operationName] = duration;
      }
    }

    return { result, duration };
  }).catch(error => {
    const duration = Date.now() - startTime;
    
    if (req) {
      const metrics = (req as any).performanceMetrics as PerformanceMetrics;
      if (metrics) {
        metrics.breakdown[operationName] = duration;
      }
    }
    
    throw error;
  });
}

// ✅ Helper function to get metrics from request
export function getRequestMetrics(req: Request): PerformanceMetrics | null {
  return (req as any).performanceMetrics || null;
}

function logPerformanceMetrics(metrics: PerformanceMetrics, path: string): void {
  const { totalTime, breakdown } = metrics;

  // ✅ PII sanitization - no user data in performance logs
  const sanitizedPath = sanitizePathForLogging(path);

  // Log performance data
  logger.info('Request performance metrics', {
    requestId: metrics.requestId,
    path: sanitizedPath,
    totalTime,
    breakdown,
    isSlowRequest: totalTime && totalTime > 2000 // Flag requests >2s
  });

  // Alert on slow requests
  if (totalTime && totalTime > 3000) {
    logger.warn('Slow request detected', {
      requestId: metrics.requestId,
      path: sanitizedPath,
      totalTime,
      breakdown
    });
  }

  // Update performance counters (could send to metrics service)
  updatePerformanceCounters(sanitizedPath, totalTime || 0, breakdown);
}

// ✅ PII sanitization for request paths
function sanitizePathForLogging(path: string): string {
  // Remove user IDs, email addresses, and other PII from paths
  return path
    .replace(/\/users\/[^/]+/g, '/users/[USER_ID]')
    .replace(/\/resume\/[^/]+/g, '/resume/[RESUME_ID]')
    .replace(/\/analysis\/[^/]+/g, '/analysis/[ANALYSIS_ID]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[UUID]');
}

// ✅ Placeholder for metrics aggregation
function updatePerformanceCounters(
  path: string,
  totalTime: number,
  breakdown: PerformanceMetrics['breakdown']
): void {
  // Implementation would send to Prometheus, StatsD, etc.
  // For now, just debug logging
  logger.debug('Performance counters updated', {
    path,
    totalTime,
    operationCount: Object.keys(breakdown).length
  });
}

// ✅ Export interface for use in other modules
export { PerformanceMetrics };