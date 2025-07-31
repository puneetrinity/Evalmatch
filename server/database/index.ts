/**
 * Unified Database Module
 * 
 * Single, clean PostgreSQL implementation with proper connection pooling,
 * migrations, and error handling. Replaces the scattered db.ts, storage.ts,
 * and migration files with a coherent database layer.
 */

import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@shared/schema';
import { sql } from 'drizzle-orm';
import { config } from '../config/unified-config';
import { logger } from '../config/logger';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection pool
let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// Connection statistics
interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  lastSuccessfulQuery: Date | null;
  connectedSince: Date | null;
}

const stats: ConnectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  failedConnections: 0,
  totalQueries: 0,
  successfulQueries: 0,
  failedQueries: 0,
  lastSuccessfulQuery: null,
  connectedSince: null,
};

/**
 * Initialize PostgreSQL database connection
 */
export async function initializeDatabase(): Promise<void> {
  if (!config.database.enabled || !config.database.url) {
    logger.info('Database disabled - will use memory storage fallback');
    return;
  }

  try {
    logger.info('🔌 Initializing PostgreSQL connection...');

    // Create connection pool
    pool = new Pool({
      connectionString: config.database.url,
      max: config.database.poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: config.database.connectionTimeout,
      ssl: config.env === 'production' ? { rejectUnauthorized: false } : false,
      application_name: 'EvalMatch',
    });

    // Set up connection event handlers
    setupConnectionHandlers(pool);

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();

    stats.connectedSince = new Date();
    logger.info('✅ PostgreSQL connection established successfully');

    // Initialize Drizzle ORM
    db = drizzle(pool, { schema });
    logger.info('✅ Drizzle ORM initialized');

    // Run migrations
    await runMigrations();

  } catch (error) {
    logger.error('❌ Failed to initialize database:', error);
    
    if (config.env === 'production') {
      logger.warn('Database initialization failed in production - continuing with memory storage');
      pool = null;
      db = null;
    } else {
      throw error;
    }
  }
}

/**
 * Set up connection pool event handlers
 */
function setupConnectionHandlers(pool: Pool): void {
  pool.on('connect', () => {
    stats.totalConnections++;
    stats.activeConnections++;
    logger.debug(`Database connection established (active: ${stats.activeConnections})`);
  });

  pool.on('error', (err) => {
    logger.error('PostgreSQL pool error:', err);
    stats.failedConnections++;
  });

  pool.on('remove', () => {
    stats.activeConnections = Math.max(0, stats.activeConnections - 1);
    logger.debug(`Database connection removed (active: ${stats.activeConnections})`);
  });
}

/**
 * Get database instance (Drizzle ORM)
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized - call initializeDatabase() first');
  }
  return db;
}

/**
 * Get raw connection pool
 */
export function getPool(): Pool | null {
  return pool;
}

/**
 * Check if database is available
 */
export function isDatabaseAvailable(): boolean {
  return pool !== null && db !== null;
}

/**
 * Execute a raw SQL query with error handling
 */
export async function executeQuery<T = any>(query: string, params?: any[]): Promise<T[]> {
  if (!pool) {
    throw new Error('Database not available');
  }

  try {
    stats.totalQueries++;
    const result = await pool.query(query, params);
    stats.successfulQueries++;
    stats.lastSuccessfulQuery = new Date();
    return result.rows;
  } catch (error) {
    stats.failedQueries++;
    logger.error('Query execution failed:', { query, error });
    throw error;
  }
}

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  if (!pool) {
    return false;
  }

  try {
    const result = await pool.query('SELECT 1 as test');
    return result.rows[0]?.test === 1;
  } catch (error) {
    logger.error('Database connectivity test failed:', error);
    return false;
  }
}

/**
 * Get database connection statistics
 */
export function getConnectionStats(): ConnectionStats & {
  uptime: number;
  connectionSuccessRate: number;
  querySuccessRate: number;
} {
  return {
    ...stats,
    uptime: stats.connectedSince 
      ? Math.floor((Date.now() - stats.connectedSince.getTime()) / 1000) 
      : 0,
    connectionSuccessRate: stats.totalConnections > 0
      ? Math.round((stats.totalConnections - stats.failedConnections) / stats.totalConnections * 100)
      : 0,
    querySuccessRate: (stats.successfulQueries + stats.failedQueries) > 0
      ? Math.round(stats.successfulQueries / (stats.successfulQueries + stats.failedQueries) * 100)
      : 0,
  };
}

/**
 * Run database migrations
 */
async function runMigrations(): Promise<void> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  try {
    logger.info('🔄 Running database migrations...');

    // Find migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '001_consolidated_schema.sql');
    
    if (!fs.existsSync(migrationPath)) {
      logger.warn('No migration file found - assuming database is already set up');
      return;
    }

    // Read and execute migration
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    await executeQuery(migrationSQL);

    logger.info('✅ Database migrations completed successfully');

  } catch (error) {
    logger.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Close database connections gracefully
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
      logger.info('✅ Database connections closed gracefully');
    } catch (error) {
      logger.error('Error closing database connections:', error);
    } finally {
      pool = null;
      db = null;
    }
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database connections...');
  await closeDatabase();
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database connections...');
  await closeDatabase();
});

// Export the schema for use in other modules
export { schema };