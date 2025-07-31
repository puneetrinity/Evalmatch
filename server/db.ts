/**
 * Legacy Database Module
 * 
 * This module is DEPRECATED and replaced by database/index.ts
 * Kept for backward compatibility during migration.
 */

import { getDatabase, getPool, getConnectionStats, isDatabaseAvailable } from './database';
import * as schema from "@shared/schema";

// Legacy exports for backward compatibility
export const db = getDatabase();
export const pool = getPool();
export { getConnectionStats };