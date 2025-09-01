/**
 * OPTIMIZED: Lightweight Health Snapshot for Small Containers
 * 
 * - Caches primitives only (no large objects)
 * - 5 second cache TTL (reduced from 2s sampling)
 * - Adds heap monitoring headers
 */

import { redis } from '../core/redis';
import { Request, Response } from 'express';

interface LightweightSnapshot {
  status: 'healthy' | 'degraded' | 'critical';
  ts: number;
  heapPercent: number;
  redis: boolean;
  db: boolean;
}

let lastSnapshot: LightweightSnapshot | null = null;
let snapshotTime = 0;
const CACHE_TTL = 5000; // 5 seconds

/**
 * Get lightweight health snapshot (primitives only)
 */
async function getHealthSnapshot(): Promise<LightweightSnapshot> {
  const now = Date.now();
  
  // Return cached snapshot if fresh
  if (lastSnapshot && (now - snapshotTime) < CACHE_TTL) {
    return lastSnapshot;
  }
  
  try {
    // Memory check (instant)
    const mem = process.memoryUsage();
    const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    
    // Fast Redis ping (100ms budget)
    const redisOk = await Promise.race([
      redis.ping().then(() => true).catch(() => false),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 100))
    ]);
    
    // DB check (just config check, no connection)
    const dbOk = !!process.env.DATABASE_URL;
    
    // Determine status based on heap
    const status = heapPercent < 80 ? 'healthy' :
                   heapPercent < 90 ? 'degraded' : 'critical';
    
    lastSnapshot = {
      status,
      ts: now,
      heapPercent,
      redis: redisOk,
      db: dbOk
    };
    
    snapshotTime = now;
    return lastSnapshot;
    
  } catch (error) {
    return {
      status: 'critical',
      ts: now,
      heapPercent: 100,
      redis: false,
      db: false
    };
  }
}

/**
 * Optimized readiness handler with heap monitoring
 */
export async function optimizedReadyzHandler(req: Request, res: Response): Promise<void> {
  const snapshot = await getHealthSnapshot();
  
  // Add heap monitoring headers
  res.set('X-Heap-Percent', `${snapshot.heapPercent}%`);
  res.set('X-Health-Cache', 'true');
  res.set('X-Cache-Age', Math.round((Date.now() - snapshot.ts) / 1000).toString());
  res.set('Cache-Control', 'no-cache');
  
  const httpStatus = snapshot.status === 'healthy' ? 200 :
                    snapshot.status === 'degraded' ? 200 : 503;
  
  res.status(httpStatus).json({
    status: snapshot.status,
    heap: `${snapshot.heapPercent}%`,
    redis: snapshot.redis,
    db: snapshot.db,
    ts: snapshot.ts
  });
}

/**
 * Force garbage collection endpoint (dev only)
 */
export function gcHandler(req: Request, res: Response): void {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'GC not allowed in production' });
    return;
  }
  
  if (global.gc) {
    const before = process.memoryUsage().heapUsed;
    global.gc();
    const after = process.memoryUsage().heapUsed;
    const freed = before - after;
    
    res.json({
      success: true,
      freedMB: Math.round(freed / 1024 / 1024),
      heapUsedMB: Math.round(after / 1024 / 1024)
    });
  } else {
    res.status(400).json({
      error: 'GC not exposed. Run with --expose-gc flag'
    });
  }
}
