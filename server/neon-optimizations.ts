/**
 * Neon PostgreSQL Optimizations
 * 
 * This module provides specialized connection and query optimizations
 * for Neon PostgreSQL, improving performance and reliability.
 */
import { Pool, PoolClient } from 'pg';
import { dbConfig } from './config/db-config';

/**
 * Apply Neon-specific optimizations to a connection
 */
export async function applyNeonOptimizations(client: PoolClient) {
  try {
    // Set statement timeout to prevent long-running queries
    await client.query(`SET statement_timeout = ${dbConfig.query.statementTimeout}`);
    
    // Enable synchronous commit for better reliability
    await client.query('SET synchronous_commit = on');
    
    // Set work memory for better query performance
    await client.query('SET work_mem = \'4MB\'');
    
    // Optimize maintenance work memory for better performance
    await client.query('SET maintenance_work_mem = \'64MB\'');
    
    // Set a reasonable cost limit to prevent excessive planning
    await client.query('SET cpu_tuple_cost = 0.03');
    
    // Set default transaction isolation level
    await client.query('SET default_transaction_isolation = \'read committed\'');
    
    console.log('Applied Neon PostgreSQL optimizations');
    return true;
  } catch (error) {
    console.error('Failed to apply Neon optimizations:', error);
    return false;
  }
}

/**
 * Configure a standard PostgreSQL pool with Neon-optimized settings
 */
export function createNeonCompatiblePool(options: Record<string, unknown>): Pool {
  const pool = new Pool({
    ...options,
    // Default client_encoding ensures proper character handling
    application_name: 'EvalMatchAI',
    // Enable prepared statement caching for better performance
    statement_cache_size: 100,
    // Enable TCP keepalive packets
    keepalive: true,
    // Cleanup idle connections
    allowExitOnIdle: true
  });
  
  // Apply optimizations to each new client
  pool.on('connect', async (client) => {
    await applyNeonOptimizations(client);
  });
  
  return pool;
}

/**
 * Verify connectivity to the Neon PostgreSQL database
 */
export async function verifyNeonConnection(pool: Pool): Promise<boolean> {
  try {
    // Test basic connectivity
    const basicResult = await pool.query('SELECT 1 as connection_test');
    
    if (basicResult.rows[0].connection_test !== 1) {
      throw new Error('Basic connectivity test failed');
    }
    
    // Check PostgreSQL version (Neon typically runs recent PostgreSQL)
    const versionResult = await pool.query('SELECT version()');
    const versionString = versionResult.rows[0].version;
    console.log(`Connected to: ${versionString}`);
    
    // Verify we can access system tables (basic permissions check)
    await pool.query('SELECT count(*) FROM pg_catalog.pg_tables');
    
    // All tests passed
    return true;
  } catch (error) {
    console.error('Failed to verify Neon connection:', error);
    return false;
  }
}