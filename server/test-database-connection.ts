import { getDatabase } from './database';
import { withRetry } from './lib/db-retry';
import { logger } from './config/logger';

/**
 * Simple test to verify database connectivity
 * This script will try to execute a simple query to check if the database is accessible
 */
async function testDatabaseConnection() {
  logger.info('Testing database connection...');
  
  try {
    // Simple test query that doesn't modify any data
    const result = await withRetry(async () => {
      return await getDatabase().execute('SELECT 1 as test');
    }, 'test-database-connection');
    
    logger.info('Database connection successful!');
    logger.info('Query result:', result);
    
    // Try to get the PostgreSQL version for more information
    const versionResult = await withRetry(async () => {
      return await getDatabase().execute('SELECT version()');
    }, 'check-database-version');
    
    logger.info('Database version:');
    const rows = (versionResult as unknown as { rows?: Array<{ version: string }> }).rows || [];
    if (rows.length > 0) {
      logger.info(rows[0].version);
    } else {
      logger.info('Version information not available');
    }
    
    return true;
  } catch (error) {
    logger.error('Database connection failed:');
    logger.error(error);
    return false;
  }
}

// Execute the test
testDatabaseConnection()
  .then(success => {
    if (success) {
      logger.info('✅ Database connection test completed successfully');
    } else {
      logger.info('❌ Database connection test failed');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    logger.error('Unexpected error during test:', error);
    process.exit(1);
  });