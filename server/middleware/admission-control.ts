/**
 * Admission Control Middleware - Reject requests during high memory pressure
 * Protects system stability by throttling expensive operations
 */

import { Request, Response, NextFunction } from 'express';
import { getCurrentSnapshot } from '../observability/health-snapshot';

interface AdmissionConfig {
  rejectOnCritical: boolean;
  throttleOnHigh: boolean;
  skipHealthRoutes: boolean;
}

const DEFAULT_CONFIG: AdmissionConfig = {
  rejectOnCritical: true,
  throttleOnHigh: true,
  skipHealthRoutes: true
};

/**
 * Create admission control middleware
 */
export function createAdmissionControl(config: Partial<AdmissionConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip health/monitoring routes
    if (cfg.skipHealthRoutes && (
      req.path.includes('/health') ||
      req.path.includes('/ready') ||
      req.path.includes('/metrics')
    )) {
      return next();
    }
    
    const snapshot = getCurrentSnapshot();
    const runtime = snapshot.data?.runtime;
    
    if (!runtime) {
      return next(); // No runtime data, allow through
    }
    
    // Critical pressure: reject expensive operations
    if (cfg.rejectOnCritical && runtime.pressure === 'critical') {
      // Allow GET requests (reads) but reject writes and heavy operations
      if (req.method !== 'GET' || isExpensiveRoute(req.path)) {
        res.status(503).json({
          error: 'Service temporarily unavailable',
          reason: 'High memory pressure',
          retryAfter: 30,
          pressure: runtime.pressure,
          heap: `${runtime.heapPct}%`,
          rss: `${runtime.rssPct}%`,
          eventLoopDelay: `${runtime.eventLoopDelayP95Ms}ms`
        });
        return;
      }
    }
    
    // High pressure: add pressure headers for monitoring
    if (runtime.pressure === 'high' || runtime.pressure === 'critical') {
      res.set('X-Memory-Pressure', runtime.pressure);
      res.set('X-Admission-Control', 'active');
    }
    
    // Throttle expensive operations on high pressure
    if (cfg.throttleOnHigh && runtime.pressure === 'high' && isExpensiveRoute(req.path)) {
      // Add artificial delay for expensive operations
      setTimeout(() => next(), 100);
      return;
    }
    
    next();
  };
}

/**
 * Check if route is considered expensive/heavy
 */
function isExpensiveRoute(path: string): boolean {
  const expensivePatterns = [
    '/api/analyze',
    '/api/batch',
    '/api/embeddings',
    '/api/ai/',
    '/api/process',
    '/api/generate',
    '/api/upload'
  ];
  
  return expensivePatterns.some(pattern => path.includes(pattern));
}

/**
 * Get current memory pressure for internal use
 */
export function getMemoryPressure(): string {
  const snapshot = getCurrentSnapshot();
  return snapshot.data?.runtime?.pressure || 'unknown';
}

/**
 * Check if system can handle expensive operations
 */
export function canHandleExpensiveOperation(): boolean {
  const pressure = getMemoryPressure();
  return pressure === 'low' || pressure === 'medium';
}

/**
 * Export configured middleware instances
 */
export const admissionControl = createAdmissionControl();
export const strictAdmissionControl = createAdmissionControl({
  rejectOnCritical: true,
  throttleOnHigh: true,
  skipHealthRoutes: true
});