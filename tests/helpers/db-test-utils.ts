/**
 * Database Test Utilities
 * 
 * Provides transaction-based test isolation for integration tests.
 * Each test runs in a transaction that gets rolled back, ensuring
 * clean state between tests without the overhead of database resets.
 */

import { getDatabase, executeQuery } from '../../server/database/index';
import { logger } from '../../server/config/logger';
import type { Pool, PoolClient } from 'pg';

/**
 * Runs a test function within a database transaction that gets rolled back.
 * This ensures test isolation without affecting the database state.
 * 
 * @param testFn The test function to run within the transaction
 * @returns The result of the test function
 */
export async function withTestTransaction<T>(testFn: () => Promise<T>): Promise<T> {
  const pool = getDatabase();
  
  if (!pool) {
    throw new Error('Database not initialized. Ensure database connection is established before running integration tests.');
  }

  let client: PoolClient | null = null;
  
  try {
    // Get a dedicated client for this test transaction
    client = await pool.connect();
    
    // Start transaction
    await client.query('BEGIN');
    logger.debug('Started test transaction');
    
    // Store original executeQuery to restore later
    const originalExecuteQuery = executeQuery;
    
    // Override executeQuery to use our transaction client
    // This ensures all database operations within the test use the same transaction
    const mockExecuteQuery = async <TResult = unknown>(
      query: string, 
      params?: unknown[]
    ): Promise<TResult[]> => {
      try {
        const result = await client!.query(query, params);
        return result.rows as TResult[];
      } catch (error) {
        logger.error('Query failed in test transaction:', error);
        throw error;
      }
    };
    
    // Temporarily replace the global executeQuery function
    (global as any).executeQuery = mockExecuteQuery;
    
    try {
      // Run the test function
      const result = await testFn();
      
      logger.debug('Test completed successfully, rolling back transaction');
      return result;
      
    } finally {
      // Restore original executeQuery
      (global as any).executeQuery = originalExecuteQuery;
    }
    
  } catch (error) {
    logger.error('Test transaction failed:', error);
    throw error;
    
  } finally {
    if (client) {
      try {
        // Always rollback to clean up test data
        await client.query('ROLLBACK');
        logger.debug('Test transaction rolled back');
      } catch (rollbackError) {
        logger.error('Failed to rollback test transaction:', rollbackError);
      } finally {
        // Release client back to pool
        client.release();
      }
    }
  }
}

/**
 * Sets up the test database with migrations.
 * Call this in beforeAll() of your integration test suites.
 */
export async function setupTestDatabase(): Promise<void> {
  try {
    logger.info('Setting up test database...');
    
    // Check if database is enabled
    const pool = getDatabase();
    if (!pool) {
      // For now, skip database tests if DB is disabled
      logger.warn('Database is disabled - skipping database-dependent tests');
      return;
    }
    
    // Test the connection
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      logger.info('Database connection verified');
    } finally {
      client.release();
    }
    
    // Note: Migrations should be run separately in CI/test setup
    // This function just verifies the connection is working
    
  } catch (error) {
    logger.error('Failed to setup test database:', error);
    throw error;
  }
}

/**
 * Cleanup test database connections.
 * Call this in afterAll() if needed, though Jest usually handles cleanup automatically.
 */
export async function cleanupTestDatabase(): Promise<void> {
  try {
    const pool = getDatabase();
    if (pool) {
      await pool.end();
      logger.info('Test database connections closed');
    }
  } catch (error) {
    logger.warn('Error during test database cleanup:', error);
  }
}

/**
 * Creates test data within the current transaction.
 * This is a helper for setting up test scenarios.
 * 
 * @param tableName The table to insert data into
 * @param data The data to insert
 * @returns The inserted record(s)
 */
export async function createTestData<T>(
  tableName: string, 
  data: Record<string, unknown>
): Promise<T> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  
  const query = `
    INSERT INTO ${tableName} (${columns.join(', ')}) 
    VALUES (${placeholders}) 
    RETURNING *
  `;
  
  const result = await executeQuery<T>(query, values);
  
  if (!result || result.length === 0) {
    throw new Error(`Failed to create test data in ${tableName}`);
  }
  
  return result[0];
}