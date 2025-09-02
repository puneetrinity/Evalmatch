/**
 * PHASE 1.3: Safe Health Snapshot (No Dynamic Imports)
 * 
 * Background health sampling with NO dynamic imports or heavy operations.
 * Serves cached static responses to eliminate per-request overhead.
 * 
 * CRITICAL: No imports from config, database bootstrapping, or services.
 */

import { redis } from '../core/redis';
import { monitorEventLoopDelay } from 'perf_hooks';
import * as v8 from 'v8';
import * as fs from 'fs';

interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  ts: number;
  data: any;
  cached: boolean;
}

let lastSnapshot: HealthSnapshot = { 
  status: 'unknown', 
  ts: Date.now(), 
  data: {}, 
  cached: true 
};

let sampling = false;

// Event loop delay monitor
const eld = monitorEventLoopDelay({ resolution: 20 });
eld.enable();

// Cache cgroup memory limit
let cgroupMemoryLimit: number | null = null;

/**
 * Get container memory limit from cgroup
 */
function getCgroupLimitBytes(): number {
  if (cgroupMemoryLimit) return cgroupMemoryLimit;
  
  // cgroup v2
  try {
    const v2 = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
    if (v2 && v2 !== 'max') {
      cgroupMemoryLimit = Number(v2);
      return cgroupMemoryLimit;
    }
  } catch {
    // Ignore cgroup v2 read errors
  }
  
  // cgroup v1
  try {
    const v1 = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim();
    if (v1) {
      cgroupMemoryLimit = Number(v1);
      return cgroupMemoryLimit;
    }
  } catch {
    // Ignore cgroup v1 read errors
  }
  
  // fallback: 8GB for Railway
  cgroupMemoryLimit = 8 * 1024 * 1024 * 1024;
  return cgroupMemoryLimit;
}

/**
 * Get comprehensive runtime health metrics
 */
function getRuntimeHealth() {
  const mem = process.memoryUsage();
  const stats = v8.getHeapStatistics();
  const heapLimit = stats.heap_size_limit;
  const cgroupLimit = getCgroupLimitBytes();
  
  const heapPct = (mem.heapUsed / heapLimit) * 100;
  const rssPct = (mem.rss / cgroupLimit) * 100;
  const eldP95 = eld.percentile(95) / 1e6; // ms
  
  const pressure =
    rssPct > 90 ? 'critical' :
    heapPct > 85 || rssPct > 80 || eldP95 > 100 ? 'high' :
    eldP95 > 40 ? 'medium' : 'low';
  
  return {
    heapUsed: mem.heapUsed,
    heapLimit,
    heapPct: Number(heapPct.toFixed(1)),
    rss: mem.rss,
    rssPct: Number(rssPct.toFixed(1)),
    eventLoopDelayP95Ms: Number(eldP95.toFixed(1)),
    pressure,
    // Additional metrics for monitoring
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    heapLimitMB: Math.round(heapLimit / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
    cgroupLimitMB: Math.round(cgroupLimit / 1024 / 1024)
  };
}

/**
 * Background health sampler - NO dynamic imports allowed
 */
export function startHealthSampler(intervalMs: number = 2000): void {
  console.log('[health-sampler] Starting background sampling');
  
  setInterval(async () => {
    if (sampling) return;
    sampling = true;
    
    const withBudget = <T>(p: Promise<T>, timeoutMs: number): Promise<T> =>
      Promise.race([
        p,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), timeoutMs)
        )
      ]);

    try {
      const startTime = Date.now();
      
      // Fast Redis ping (150ms budget)
      const redisCheck = withBudget(
        redis.ping().then(result => result === 'PONG').catch(() => false),
        150
      );
      
      // Fast database check (just check if URL exists, no connection)
      const dbCheck = Promise.resolve({
        ok: !!process.env.DATABASE_URL,
        configured: !!process.env.DATABASE_URL
      });
      
      // Comprehensive memory and performance check
      const runtimeHealth = getRuntimeHealth();
      
      const [redisOk, dbInfo] = await Promise.all([redisCheck, dbCheck]);
      const latency = Date.now() - startTime;
      
      // Determine overall status based on comprehensive health
      const memoryOk = runtimeHealth.pressure === 'low' || runtimeHealth.pressure === 'medium';
      const isHealthy = redisOk && dbInfo.ok && memoryOk;
      const status = runtimeHealth.pressure === 'critical' ? 'critical' :
                    isHealthy ? 'healthy' : 'degraded';
      
      lastSnapshot = {
        status,
        ts: Date.now(),
        data: {
          redis: redisOk,
          database: dbInfo,
          runtime: runtimeHealth,
          latency,
          uptime: Math.round(process.uptime())
        },
        cached: true
      };
      
    } catch (error) {
      lastSnapshot = {
        status: 'critical',
        ts: Date.now(),
        data: { 
          error: String(error),
          uptime: Math.round(process.uptime())
        },
        cached: true
      };
    } finally {
      sampling = false;
    }
  }, intervalMs);
}

/**
 * Cached readiness handler - serves static snapshot
 */
export function readyzHandler(req: any, res: any): void {
  res.set('X-Health-Cache', 'true');
  res.set('X-Health-Age', Math.round((Date.now() - lastSnapshot.ts) / 1000));
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  // Add comprehensive monitoring headers
  if (lastSnapshot.data && lastSnapshot.data.runtime) {
    const rt = lastSnapshot.data.runtime;
    res.set('X-Heap-Used', `${rt.heapUsedMB}MB`);
    res.set('X-Heap-Limit', `${rt.heapLimitMB}MB`);
    res.set('X-Heap-Percent', `${rt.heapPct}%`);
    res.set('X-RSS-Used', `${rt.rssMB}MB`);
    res.set('X-RSS-Limit', `${rt.cgroupLimitMB}MB`);
    res.set('X-RSS-Percent', `${rt.rssPct}%`);
    res.set('X-Event-Loop-Delay-P95', `${rt.eventLoopDelayP95Ms}ms`);
    res.set('X-Memory-Pressure', rt.pressure);
  }
  
  const httpStatus = lastSnapshot.status === 'healthy' ? 200 : 
                     lastSnapshot.status === 'degraded' ? 200 : 503;
  
  res.status(httpStatus).json({
    ...lastSnapshot,
    currentTime: Date.now()
  });
}

/**
 * Get current snapshot (for internal use)
 */
export function getCurrentSnapshot(): HealthSnapshot {
  return lastSnapshot;
}

/**
 * Get current memory pressure level
 */
export function getMemoryPressure(): string {
  const snapshot = getCurrentSnapshot();
  return snapshot.data?.runtime?.pressure || 'unknown';
}

/**
 * Export runtime health function for external use
 */
export { getRuntimeHealth };