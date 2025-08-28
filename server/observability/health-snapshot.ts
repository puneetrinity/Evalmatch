/**
 * PHASE 1.3: Safe Health Snapshot (No Dynamic Imports)
 * 
 * Background health sampling with NO dynamic imports or heavy operations.
 * Serves cached static responses to eliminate per-request overhead.
 * 
 * CRITICAL: No imports from config, database bootstrapping, or services.
 */

import { redis } from '../core/redis';

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
      
      // Memory check (instant)
      const memoryCheck = (() => {
        const mem = process.memoryUsage();
        const usagePercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
        return {
          ok: usagePercent < 90,
          usagePercent,
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024)
        };
      })();
      
      const [redisOk, dbInfo] = await Promise.all([redisCheck, dbCheck]);
      const latency = Date.now() - startTime;
      
      // Determine overall status
      const isHealthy = redisOk && dbInfo.ok && memoryCheck.ok;
      const status = isHealthy ? 'healthy' : 
                    (redisOk || dbInfo.ok) ? 'degraded' : 'critical';
      
      lastSnapshot = {
        status,
        ts: Date.now(),
        data: {
          redis: redisOk,
          database: dbInfo,
          memory: memoryCheck,
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