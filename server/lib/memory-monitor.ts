/**
 * Memory monitoring and alerting for production
 */

import { logger } from './logger';

interface MemoryMetrics {
  heapUsedMB: number;
  heapTotalMB: number;
  heapPercent: number;
  externalMB: number;
  rssMB: number;
}

interface MemoryPressure {
  isHighPressure: boolean;
  isCriticalPressure: boolean;
  heapPercent: number;
  rssMB: number;
  level: 'low' | 'medium' | 'high' | 'critical';
}

export class MemoryMonitor {
  private lastAlert = 0;
  private readonly alertCooldown = 60_000; // 1 minute between alerts
  
  getMetrics(): MemoryMetrics {
    const mem = process.memoryUsage();
    return {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      heapPercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      externalMB: Math.round(mem.external / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024)
    };
  }
  
  checkAndAlert(): void {
    const metrics = this.getMetrics();
    const now = Date.now();
    
    // Alert on high memory usage
    if (metrics.heapPercent > 85 && (now - this.lastAlert) > this.alertCooldown) {
      logger.warn('⚠️ High memory usage detected', metrics);
      this.lastAlert = now;
      
      // Try to free memory
      if (global.gc && metrics.heapPercent > 90) {
        logger.info('🧹 Triggering garbage collection');
        global.gc();
        
        const afterMetrics = this.getMetrics();
        logger.info('📊 GC complete', {
          before: metrics.heapUsedMB,
          after: afterMetrics.heapUsedMB,
          freedMB: metrics.heapUsedMB - afterMetrics.heapUsedMB
        });
      }
    }
  }
  
  startMonitoring(intervalMs: number = 30_000): void {
    setInterval(() => this.checkAndAlert(), intervalMs);
    logger.info('📊 Memory monitoring started', {
      interval: intervalMs,
      initialMetrics: this.getMetrics()
    });
  }
}

export const memoryMonitor = new MemoryMonitor();

/**
 * Get current memory pressure status for circuit breaker integration
 * Determines if circuit breakers should be force-opened due to memory constraints
 */
export function getMemoryPressure(): MemoryPressure {
  const metrics = memoryMonitor.getMetrics();
  
  // Define thresholds based on Railway container limits
  const HIGH_HEAP_THRESHOLD = 80;  // 80% heap usage triggers high pressure
  const CRITICAL_HEAP_THRESHOLD = 90; // 90% heap usage triggers critical pressure
  const HIGH_RSS_THRESHOLD = 400; // 400MB RSS triggers high pressure
  const CRITICAL_RSS_THRESHOLD = 500; // 500MB RSS triggers critical pressure
  
  const isHighPressure = metrics.heapPercent >= HIGH_HEAP_THRESHOLD || metrics.rssMB >= HIGH_RSS_THRESHOLD;
  const isCriticalPressure = metrics.heapPercent >= CRITICAL_HEAP_THRESHOLD || metrics.rssMB >= CRITICAL_RSS_THRESHOLD;
  
  let level: MemoryPressure['level'] = 'low';
  if (isCriticalPressure) {
    level = 'critical';
  } else if (isHighPressure) {
    level = 'high';
  } else if (metrics.heapPercent >= 60 || metrics.rssMB >= 300) {
    level = 'medium';
  }
  
  return {
    isHighPressure,
    isCriticalPressure,
    heapPercent: metrics.heapPercent,
    rssMB: metrics.rssMB,
    level
  };
}
