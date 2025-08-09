/**
 * PERFORMANCE: Comprehensive Performance Monitoring System
 * 
 * Tracks memory usage, response times, circuit breaker health,
 * cache hit rates, and database performance to prevent issues.
 */

import { logger } from './logger';
import { cacheManager } from './redis-cache';

interface PerformanceMetrics {
  timestamp: number;
  memory: {
    used: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  responseTime: {
    avg: number;
    p95: number;
    p99: number;
  };
  requestCount: number;
  errorRate: number;
  cacheHitRate: number;
  circuitBreakerStats: {
    openBreakers: number;
    totalFailures: number;
  };
  databaseStats: {
    activeConnections: number;
    queryTime: number;
  };
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private requestTimes: number[] = [];
  private errors = 0;
  private requests = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  private readonly MAX_METRICS_HISTORY = 1440; // 24 hours of minute-by-minute data
  private readonly ALERT_THRESHOLDS = {
    MEMORY_USAGE: 0.85, // 85% of heap
    ERROR_RATE: 0.05, // 5% error rate
    RESPONSE_TIME_P95: 5000, // 5 seconds
    CACHE_HIT_RATE: 0.3, // 30% minimum
  };

  constructor() {
    this.startMonitoring();
  }

  // Track request performance
  trackRequest(responseTime: number, isError = false): void {
    this.requests++;
    this.requestTimes.push(responseTime);
    
    if (isError) {
      this.errors++;
    }
    
    // Keep only recent request times for calculations
    if (this.requestTimes.length > 1000) {
      this.requestTimes = this.requestTimes.slice(-1000);
    }
  }

  // Track cache performance
  trackCacheHit(): void {
    this.cacheHits++;
  }

  trackCacheMiss(): void {
    this.cacheMisses++;
  }

  // Get current performance snapshot
  getCurrentMetrics(): PerformanceMetrics {
    const memUsage = process.memoryUsage();
    const sortedTimes = [...this.requestTimes].sort((a, b) => a - b);
    
    return {
      timestamp: Date.now(),
      memory: {
        used: memUsage.heapUsed / memUsage.heapTotal,
        total: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      responseTime: {
        avg: this.requestTimes.length > 0 
          ? this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length 
          : 0,
        p95: sortedTimes.length > 0 
          ? sortedTimes[Math.floor(sortedTimes.length * 0.95)] || 0 
          : 0,
        p99: sortedTimes.length > 0 
          ? sortedTimes[Math.floor(sortedTimes.length * 0.99)] || 0 
          : 0,
      },
      requestCount: this.requests,
      errorRate: this.requests > 0 ? this.errors / this.requests : 0,
      cacheHitRate: (this.cacheHits + this.cacheMisses) > 0 
        ? this.cacheHits / (this.cacheHits + this.cacheMisses) 
        : 0,
      circuitBreakerStats: {
        openBreakers: 0, // This would be populated from circuit breaker stats
        totalFailures: 0,
      },
      databaseStats: {
        activeConnections: 0, // This would be populated from database pool
        queryTime: 0,
      },
    };
  }

  // Start continuous monitoring
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const metrics = this.getCurrentMetrics();
      this.metrics.push(metrics);
      
      // Keep only recent metrics
      if (this.metrics.length > this.MAX_METRICS_HISTORY) {
        this.metrics = this.metrics.slice(-this.MAX_METRICS_HISTORY);
      }
      
      // Check for alerts
      this.checkForAlerts(metrics);
      
      // Log performance summary
      if (this.metrics.length % 60 === 0) { // Every hour
        this.logPerformanceSummary();
      }
    }, 60000); // Every minute
  }

  // Check for performance alerts
  private checkForAlerts(metrics: PerformanceMetrics): void {
    const alerts: string[] = [];

    // Memory usage alert
    if (metrics.memory.used > this.ALERT_THRESHOLDS.MEMORY_USAGE) {
      alerts.push(`High memory usage: ${(metrics.memory.used * 100).toFixed(1)}%`);
    }

    // Error rate alert
    if (metrics.errorRate > this.ALERT_THRESHOLDS.ERROR_RATE) {
      alerts.push(`High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`);
    }

    // Response time alert
    if (metrics.responseTime.p95 > this.ALERT_THRESHOLDS.RESPONSE_TIME_P95) {
      alerts.push(`Slow response times: P95 ${metrics.responseTime.p95}ms`);
    }

    // Cache hit rate alert
    if (metrics.cacheHitRate < this.ALERT_THRESHOLDS.CACHE_HIT_RATE && (this.cacheHits + this.cacheMisses) > 100) {
      alerts.push(`Low cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%`);
    }

    // Log alerts
    if (alerts.length > 0) {
      logger.warn('Performance alerts detected', {
        alerts,
        metrics: {
          memoryUsage: `${(metrics.memory.used * 100).toFixed(1)}%`,
          errorRate: `${(metrics.errorRate * 100).toFixed(1)}%`,
          responseTimeP95: `${metrics.responseTime.p95}ms`,
          cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(1)}%`,
        }
      });
    }
  }

  // Log performance summary
  private logPerformanceSummary(): void {
    const recentMetrics = this.metrics.slice(-60); // Last hour
    if (recentMetrics.length === 0) return;

    const avgMemory = recentMetrics.reduce((sum, m) => sum + m.memory.used, 0) / recentMetrics.length;
    const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime.avg, 0) / recentMetrics.length;
    const avgErrorRate = recentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / recentMetrics.length;
    const avgCacheHitRate = recentMetrics.reduce((sum, m) => sum + m.cacheHitRate, 0) / recentMetrics.length;

    logger.info('Hourly performance summary', {
      period: 'last 60 minutes',
      averages: {
        memoryUsage: `${(avgMemory * 100).toFixed(1)}%`,
        responseTime: `${avgResponseTime.toFixed(0)}ms`,
        errorRate: `${(avgErrorRate * 100).toFixed(2)}%`,
        cacheHitRate: `${(avgCacheHitRate * 100).toFixed(1)}%`,
      },
      totals: {
        requests: recentMetrics[recentMetrics.length - 1]?.requestCount || 0,
        errors: Math.round(recentMetrics.reduce((sum, m) => sum + (m.errorRate * m.requestCount), 0)),
      }
    });
  }

  // Get performance trends
  getTrends(minutes = 60): {
    memoryTrend: 'increasing' | 'decreasing' | 'stable';
    responseTimeTrend: 'increasing' | 'decreasing' | 'stable';
    errorRateTrend: 'increasing' | 'decreasing' | 'stable';
  } {
    const recentMetrics = this.metrics.slice(-minutes);
    if (recentMetrics.length < 2) {
      return { memoryTrend: 'stable', responseTimeTrend: 'stable', errorRateTrend: 'stable' };
    }

    const first = recentMetrics[0];
    const last = recentMetrics[recentMetrics.length - 1];
    const threshold = 0.1; // 10% change threshold

    const memoryChange = (last.memory.used - first.memory.used) / first.memory.used;
    const responseTimeChange = (last.responseTime.avg - first.responseTime.avg) / (first.responseTime.avg || 1);
    const errorRateChange = (last.errorRate - first.errorRate);

    return {
      memoryTrend: Math.abs(memoryChange) < threshold ? 'stable' : 
                   memoryChange > 0 ? 'increasing' : 'decreasing',
      responseTimeTrend: Math.abs(responseTimeChange) < threshold ? 'stable' : 
                        responseTimeChange > 0 ? 'increasing' : 'decreasing',
      errorRateTrend: Math.abs(errorRateChange) < 0.01 ? 'stable' : 
                     errorRateChange > 0 ? 'increasing' : 'decreasing',
    };
  }

  // Cleanup and shutdown
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Get metrics for API endpoint
  getMetricsForAPI() {
    const current = this.getCurrentMetrics();
    const trends = this.getTrends();
    
    return {
      current,
      trends,
      history: this.metrics.slice(-60), // Last hour
      alerts: this.checkAlertsForAPI(current),
    };
  }

  private checkAlertsForAPI(metrics: PerformanceMetrics): string[] {
    const alerts: string[] = [];
    
    if (metrics.memory.used > this.ALERT_THRESHOLDS.MEMORY_USAGE) {
      alerts.push('high_memory');
    }
    if (metrics.errorRate > this.ALERT_THRESHOLDS.ERROR_RATE) {
      alerts.push('high_errors');
    }
    if (metrics.responseTime.p95 > this.ALERT_THRESHOLDS.RESPONSE_TIME_P95) {
      alerts.push('slow_response');
    }
    if (metrics.cacheHitRate < this.ALERT_THRESHOLDS.CACHE_HIT_RATE) {
      alerts.push('low_cache_hits');
    }
    
    return alerts;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Graceful shutdown
process.on('SIGTERM', () => performanceMonitor.destroy());
process.on('SIGINT', () => performanceMonitor.destroy());

// Express middleware for tracking requests
export const trackRequest = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    performanceMonitor.trackRequest(responseTime, isError);
  });
  
  next();
};