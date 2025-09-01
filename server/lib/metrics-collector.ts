/**
 * Phase 2.3: Detailed metrics collection and health score calculation
 * Provides comprehensive system monitoring with business-friendly health scores
 */

import { logger } from "./logger";
import { queueManager } from "./queue-manager";
import { cacheManager } from "./redis-cache";
import { serviceLevelManager } from "./service-level-manager";
import { getCacheStats } from "./cached-ai-operations";

export interface SystemMetrics {
  timestamp: string;
  healthScore: number; // 0-100
  status: "EXCELLENT" | "GOOD" | "WARNING" | "CRITICAL";
  
  // Performance metrics
  performance: {
    avgResponseTimeMs: number;
    p95ResponseTimeMs: number;
    p99ResponseTimeMs: number;
    successRate: number; // 0-1
    requestsPerMinute: number;
    concurrentRequests: number;
  };
  
  // System resources
  system: {
    memoryUsageMB: number;
    memoryUsagePercent: number;
    cpuUsagePercent: number;
    heapUsedMB: number;
    heapTotalMB: number;
  };
  
  // Cache performance
  cache: {
    hitRate: number; // 0-1
    totalKeys: number;
    memoryUsage: string;
    providerBreakdown: Record<string, number>;
    connected: boolean;
  };
  
  // Queue status
  queues: {
    totalWaiting: number;
    totalActive: number;
    totalFailed: number;
    avgWaitTimeMs: number;
    oldestJobAgeMs: number;
  };
  
  // Service level
  serviceLevel: {
    current: string;
    featuresEnabled: Record<string, boolean>;
    limits: Record<string, any>;
    lastChange?: string;
  };
  
  // Provider status (placeholder for Phase 2.1)
  providers: {
    groq: ProviderStatus;
    openai: ProviderStatus;
    anthropic: ProviderStatus;
  };
  
  // Business metrics
  business: {
    analysesCompletedToday: number;
    averageAnalysisTimeMs: number;
    costSavingsFromCache: number; // Estimated dollars saved
    userSatisfactionScore?: number;
  };
}

interface ProviderStatus {
  available: boolean;
  responseTimeMs: number;
  errorRate: number;
  requestsToday: number;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
}

// Rolling metrics storage (in-memory for now, could be Redis/DB later)
class MetricsStore {
  private responseTimeSamples: number[] = [];
  private errorCount = 0;
  private requestCount = 0;
  private resetTime = Date.now();
  
  // Keep last 1000 response time samples for percentile calculation
  recordResponseTime(timeMs: number): void {
    this.responseTimeSamples.push(timeMs);
    if (this.responseTimeSamples.length > 1000) {
      this.responseTimeSamples.shift(); // Remove oldest
    }
  }
  
  recordRequest(success: boolean): void {
    this.requestCount++;
    if (!success) {
      this.errorCount++;
    }
    
    // Reset hourly counters
    const now = Date.now();
    if (now - this.resetTime > 60 * 60 * 1000) { // 1 hour
      this.requestCount = 0;
      this.errorCount = 0;
      this.resetTime = now;
    }
  }
  
  getPercentile(percentile: number): number {
    if (this.responseTimeSamples.length === 0) return 0;
    
    const sorted = [...this.responseTimeSamples].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] || 0;
  }
  
  getSuccessRate(): number {
    if (this.requestCount === 0) return 1;
    return (this.requestCount - this.errorCount) / this.requestCount;
  }
  
  getRequestsPerMinute(): number {
    const timeElapsed = (Date.now() - this.resetTime) / 1000 / 60; // minutes
    return timeElapsed > 0 ? this.requestCount / timeElapsed : 0;
  }
  
  getAverageResponseTime(): number {
    if (this.responseTimeSamples.length === 0) return 0;
    return this.responseTimeSamples.reduce((sum, time) => sum + time, 0) / this.responseTimeSamples.length;
  }
}

export class MetricsCollector {
  private static instance: MetricsCollector | null = null;
  private metricsStore = new MetricsStore();
  private startTime = Date.now();
  
  private constructor() {}
  
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }
  
  /**
   * Record a request completion
   */
  recordRequest(responseTimeMs: number, success: boolean = true): void {
    this.metricsStore.recordResponseTime(responseTimeMs);
    this.metricsStore.recordRequest(success);
  }
  
  /**
   * Collect comprehensive system metrics
   */
  async collectMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date().toISOString();
    
    // System resources
    const memoryUsage = process.memoryUsage();
    const system = {
      memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      memoryUsagePercent: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
      cpuUsagePercent: await this.getCPUUsage(),
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    };
    
    // Performance metrics
    const performance = {
      avgResponseTimeMs: Math.round(this.metricsStore.getAverageResponseTime()),
      p95ResponseTimeMs: Math.round(this.metricsStore.getPercentile(95)),
      p99ResponseTimeMs: Math.round(this.metricsStore.getPercentile(99)),
      successRate: this.metricsStore.getSuccessRate(),
      requestsPerMinute: Math.round(this.metricsStore.getRequestsPerMinute()),
      concurrentRequests: await this.getConcurrentRequests(),
    };
    
    // Cache metrics
    const cacheStats = await getCacheStats();
    const cache = {
      hitRate: (cacheStats.hitRate || 0) / 100, // Convert to 0-1
      totalKeys: cacheStats.totalKeys || 0,
      memoryUsage: cacheStats.memoryUsage || "unknown",
      providerBreakdown: cacheStats.providerBreakdown || {},
      connected: cacheStats.connected,
    };
    
    // Queue metrics
    const queueStats = await queueManager.getQueueStats();
    const queues = {
      totalWaiting: Object.values(queueStats).reduce((sum: number, stats: any) => sum + (stats.waiting || 0), 0),
      totalActive: Object.values(queueStats).reduce((sum: number, stats: any) => sum + (stats.active || 0), 0),
      totalFailed: Object.values(queueStats).reduce((sum: number, stats: any) => sum + (stats.failed || 0), 0),
      avgWaitTimeMs: 0, // TODO: Implement queue timing
      oldestJobAgeMs: 0,
    };
    
    // Service level
    const serviceLevelConfig = serviceLevelManager.getCurrentConfig();
    const serviceLevel = {
      current: serviceLevelConfig.level,
      featuresEnabled: serviceLevelConfig.features,
      limits: serviceLevelConfig.limits,
    };
    
    // Provider status (placeholder - will be implemented in Phase 2.1)
    const providers = {
      groq: { available: true, responseTimeMs: 1200, errorRate: 0.02, requestsToday: 450, status: "HEALTHY" as const },
      openai: { available: true, responseTimeMs: 2100, errorRate: 0.01, requestsToday: 120, status: "HEALTHY" as const },
      anthropic: { available: true, responseTimeMs: 1800, errorRate: 0.03, requestsToday: 80, status: "HEALTHY" as const },
    };
    
    // Business metrics
    const analysesCompletedToday = Math.round(this.metricsStore.getRequestsPerMinute() * 60 * 24);
    const business = {
      analysesCompletedToday,
      averageAnalysisTimeMs: performance.avgResponseTimeMs,
      costSavingsFromCache: this.calculateCostSavings(cache.hitRate, analysesCompletedToday),
    };
    
    // Calculate overall health score
    const healthScore = this.calculateHealthScore({
      performance,
      system,
      cache,
      queues,
      providers
    });
    
    const status = this.getStatusFromHealthScore(healthScore);
    
    return {
      timestamp,
      healthScore,
      status,
      performance,
      system,
      cache,
      queues,
      serviceLevel,
      providers,
      business,
    };
  }
  
  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(metrics: {
    performance: SystemMetrics['performance'];
    system: SystemMetrics['system'];
    cache: SystemMetrics['cache'];
    queues: SystemMetrics['queues'];
    providers: SystemMetrics['providers'];
  }): number {
    let score = 100;
    
    // Performance impact (40% weight)
    if (metrics.performance.successRate < 0.95) score -= (0.95 - metrics.performance.successRate) * 400; // -20 for 90% success
    if (metrics.performance.p95ResponseTimeMs > 4000) score -= Math.min(20, (metrics.performance.p95ResponseTimeMs - 4000) / 200);
    
    // System health impact (25% weight)  
    if (metrics.system.memoryUsagePercent > 80) score -= (metrics.system.memoryUsagePercent - 80) / 2; // -10 for 90% memory
    if (metrics.system.cpuUsagePercent > 80) score -= (metrics.system.cpuUsagePercent - 80) / 2;
    
    // Cache performance impact (20% weight)
    if (metrics.cache.hitRate < 0.5) score -= (0.5 - metrics.cache.hitRate) * 40; // -20 for 0% cache hit
    if (!metrics.cache.connected) score -= 15;
    
    // Queue health impact (10% weight)
    if (metrics.queues.totalWaiting > 100) score -= Math.min(10, (metrics.queues.totalWaiting - 100) / 20);
    
    // Provider availability impact (5% weight)
    const availableProviders = Object.values(metrics.providers).filter(p => p.available).length;
    if (availableProviders < 3) score -= (3 - availableProviders) * 2.5; // -5 for each unavailable provider
    
    return Math.max(0, Math.round(score));
  }
  
  /**
   * Get status category from health score
   */
  private getStatusFromHealthScore(score: number): SystemMetrics['status'] {
    if (score >= 95) return "EXCELLENT";
    if (score >= 80) return "GOOD";  
    if (score >= 60) return "WARNING";
    return "CRITICAL";
  }
  
  /**
   * Calculate estimated cost savings from cache
   */
  private calculateCostSavings(hitRate: number, totalRequests: number): number {
    const costPerRequest = 0.001; // Rough estimate: $0.001 per AI request
    const cachedRequests = totalRequests * hitRate;
    return Math.round(cachedRequests * costPerRequest * 100) / 100; // Round to cents
  }
  
  /**
   * Get CPU usage percentage (simplified)
   */
  private async getCPUUsage(): Promise<number> {
    // Simplified CPU calculation - in production, use better method
    const usage = process.cpuUsage();
    const total = usage.user + usage.system;
    return Math.min(100, Math.round(total / 1000000)); // Convert to percentage approximation
  }
  
  /**
   * Get current concurrent requests (estimate from queue + active processing)
   */
  private async getConcurrentRequests(): Promise<number> {
    try {
      const queueStats = await queueManager.getQueueStats();
      return Object.values(queueStats).reduce((sum: number, stats: any) => sum + (stats.active || 0), 0);
    } catch {
      return 0;
    }
  }
  
  /**
   * Get metrics summary for quick status checks
   */
  async getHealthSummary(): Promise<{
    score: number;
    status: string;
    responseTime: string;
    successRate: string;
    cacheHitRate: string;
    queueDepth: number;
    alerts: string[];
  }> {
    const metrics = await this.collectMetrics();
    const alerts: string[] = [];
    
    // Generate alerts based on thresholds
    if (metrics.performance.successRate < 0.95) {
      alerts.push(`Low success rate: ${Math.round(metrics.performance.successRate * 100)}%`);
    }
    if (metrics.performance.p95ResponseTimeMs > 4000) {
      alerts.push(`High response time: ${metrics.performance.p95ResponseTimeMs}ms p95`);
    }
    if (metrics.cache.hitRate < 0.5) {
      alerts.push(`Low cache hit rate: ${Math.round(metrics.cache.hitRate * 100)}%`);
    }
    if (metrics.system.memoryUsagePercent > 85) {
      alerts.push(`High memory usage: ${metrics.system.memoryUsagePercent}%`);
    }
    if (metrics.queues.totalWaiting > 50) {
      alerts.push(`Queue backlog: ${metrics.queues.totalWaiting} jobs waiting`);
    }
    
    return {
      score: metrics.healthScore,
      status: metrics.status,
      responseTime: `${metrics.performance.avgResponseTimeMs}ms avg`,
      successRate: `${Math.round(metrics.performance.successRate * 100)}%`,
      cacheHitRate: `${Math.round(metrics.cache.hitRate * 100)}%`,
      queueDepth: metrics.queues.totalWaiting + metrics.queues.totalActive,
      alerts,
    };
  }
}

// Export singleton instance
export const metricsCollector = MetricsCollector.getInstance();