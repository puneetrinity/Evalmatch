/**
 * Legacy Database Module
 * 
 * This module is DEPRECATED and replaced by database/index.ts
 * Kept for backward compatibility during migration.
 */

import { getDatabase, getPool, getConnectionStats, isDatabaseAvailable } from './database';
import * as schema from "@shared/schema";

// Legacy exports for backward compatibility - using lazy initialization
export const db = new Proxy({} as any, {
  get(target, prop) {
    const database = getDatabase();
    return (database as any)[prop as string];
  }
});

export const pool = new Proxy({} as any, {
  get(target, prop) {
    const poolInstance = getPool();
    return poolInstance ? (poolInstance as any)[prop as string] : undefined;
  }
});

export { getConnectionStats };