import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { dbConfig, poolOptions, getRailwayDatabaseUrl } from './config/db-config';
import { logger } from './lib/logger';

/**
 * Enhanced PostgreSQL Database Connection with Intelligent Pooling
 * 
 * This module implements an optimized connection strategy for PostgreSQL
 * with proper connection pooling, retry mechanisms, and error handling.
 * 
 * Uses environment-specific configuration from db-config.ts with
 * Railway PostgreSQL optimizations.
 */

// Track query and connection analytics
const connectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  failedConnections: 0,
  totalQueries: 0,
  successfulQueries: 0,
  failedQueries: 0,
  lastReconnectTime: null as (Date | null),
  lastSuccessfulQuery: null as (Date | null),
  connectedSince: null as (Date | null),
  environment: process.env.NODE_ENV || 'development',
  poolSize: dbConfig.pooling.max,
  serverType: 'Railway PostgreSQL',
  optimizationsApplied: false
};

// Create a reusable connection verifier
const checkConnection = async (currentPool: Pool) => {
  try {
    await currentPool.query('SELECT 1');
    connectionStats.lastSuccessfulQuery = new Date();
    connectionStats.successfulQueries++;
    
    // Initialize connectedSince if this is the first successful connection
    if (!connectionStats.connectedSince) {
      connectionStats.connectedSince = new Date();
    }
    
    return true;
  } catch (err) {
    connectionStats.failedQueries++;
    return false;
  }
};

// Ensure DATABASE_URL is available
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Log connection details (without sensitive info)
logger.info('Initializing Railway PostgreSQL connection', {
  mode: process.env.NODE_ENV || 'development',
  poolSize: dbConfig.pooling.max,
  connectionTimeout: `${dbConfig.pooling.connectionTimeoutMillis}ms`,
  statementTimeout: `${dbConfig.query.statementTimeout}ms`
});

// Create enhanced connection pool for Railway PostgreSQL
export const pool = new Pool({
  ...poolOptions,
  application_name: 'EvalMatchAI',
  keepAlive: true,
  allowExitOnIdle: true
});

// Schedule a connection verification after startup
setTimeout(async () => {
  const isVerified = await checkConnection(pool);
  connectionStats.optimizationsApplied = isVerified;
  if (isVerified) {
    logger.info('Railway PostgreSQL connection verified successfully');
  } else {
    logger.warn('Unable to connect to Railway PostgreSQL');
  }
}, 5000);

// Initialize Drizzle ORM with our connection pool
export const db = drizzle(pool, { schema });

// Enhanced connection monitoring
pool.on('connect', () => {
  connectionStats.totalConnections++;
  connectionStats.activeConnections++;
  logger.debug(`Database connection established (active: ${connectionStats.activeConnections})`);
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
  connectionStats.failedConnections++;
});

pool.on('remove', () => {
  connectionStats.activeConnections = Math.max(0, connectionStats.activeConnections - 1);
});

// Connection health maintenance
// Implements a staggered heartbeat system to maintain connection health
// without overwhelming the database during connection issues
let consecutiveFailures = 0;
let heartbeatInterval = dbConfig.query.heartbeatInterval;

const performHeartbeat = async () => {
  try {
    const isConnected = await checkConnection(pool);
    
    if (isConnected) {
      consecutiveFailures = 0;
      // If connection is healthy, gradually return to normal heartbeat interval
      heartbeatInterval = Math.min(dbConfig.query.heartbeatInterval, heartbeatInterval * 0.8);
    } else {
      consecutiveFailures++;
      logger.warn(`Database heartbeat failed (consecutive failures: ${consecutiveFailures})`);
      
      // Exponential backoff for heartbeat attempts during connection issues
      heartbeatInterval = Math.min(300000, heartbeatInterval * 1.5); // Cap at 5 minutes
    }
  } catch (err) {
    logger.error('Error in database heartbeat:', err);
    consecutiveFailures++;
  }
  
  // Schedule next heartbeat with adaptive interval
  setTimeout(performHeartbeat, heartbeatInterval);
};

// Start the initial heartbeat check
setTimeout(performHeartbeat, 15000); // First check after 15 seconds

// Make connection stats available for monitoring
export const getConnectionStats = () => ({ 
  ...connectionStats,
  // Add derived metrics
  uptime: connectionStats.connectedSince 
    ? Math.floor((Date.now() - connectionStats.connectedSince.getTime()) / 1000) 
    : 0,
  connectionSuccessRate: connectionStats.totalConnections > 0
    ? Math.round((connectionStats.totalConnections - connectionStats.failedConnections) / connectionStats.totalConnections * 100)
    : 0,
  querySuccessRate: (connectionStats.successfulQueries + connectionStats.failedQueries) > 0
    ? Math.round(connectionStats.successfulQueries / (connectionStats.successfulQueries + connectionStats.failedQueries) * 100)
    : 0,
  lastHeartbeatInterval: heartbeatInterval,
  currentFailureStreak: consecutiveFailures
});