import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
import { dbConfig, poolOptions, getNeonDatabaseUrl } from './config/db-config';
import { createNeonCompatiblePool, verifyNeonConnection } from './neon-optimizations';

/**
 * Enhanced Neon Database Connection with Intelligent Pooling
 * 
 * This module implements an optimized connection strategy for Neon PostgreSQL
 * with proper connection pooling, retry mechanisms, and error handling.
 * 
 * Uses environment-specific configuration from db-config.ts with
 * Neon-specific optimizations.
 */

// Configure Neon for WebSocket support
neonConfig.webSocketConstructor = ws;

// We need to disable the type check as the types are outdated
neonConfig.pipelineConnect = true as any;

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
  serverType: 'Neon PostgreSQL',
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
console.log(`Initializing Neon PostgreSQL connection (${process.env.NODE_ENV || 'development'} mode)`);
console.log(`Connection pool size: ${dbConfig.pooling.max}`);
console.log(`Connection timeout: ${dbConfig.pooling.connectionTimeoutMillis}ms`);
console.log(`Statement timeout: ${dbConfig.query.statementTimeout}ms`);

// Create enhanced connection pool with Neon-specific optimizations
export const pool = createNeonCompatiblePool(poolOptions);

// Schedule a connection verification after startup
setTimeout(async () => {
  const isVerified = await verifyNeonConnection(pool);
  connectionStats.optimizationsApplied = isVerified;
  if (isVerified) {
    console.log('Neon PostgreSQL connection verified and optimized successfully');
  } else {
    console.warn('Unable to fully optimize Neon PostgreSQL connection');
  }
}, 5000);

// Initialize Drizzle ORM with our connection pool
export const db = drizzle({ client: pool, schema });

// Enhanced connection monitoring
pool.on('connect', () => {
  connectionStats.totalConnections++;
  connectionStats.activeConnections++;
  console.log(`Database connection established (active: ${connectionStats.activeConnections})`);
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
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
      console.warn(`Database heartbeat failed (consecutive failures: ${consecutiveFailures})`);
      
      // Exponential backoff for heartbeat attempts during connection issues
      heartbeatInterval = Math.min(300000, heartbeatInterval * 1.5); // Cap at 5 minutes
    }
  } catch (err) {
    console.error('Error in database heartbeat:', err);
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