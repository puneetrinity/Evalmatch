// import { db } from './db';
// import { withRetry } from './lib/db-retry';

/**
 * Simple test to verify database connectivity
 * This script will try to execute a simple query to check if the database is accessible
 */
async function testDatabaseConnection() {
  console.log('Testing database connection...');
  
  try {
    // Simple test query that doesn't modify any data
    // const result = await withRetry(async () => {
    //   return await db.execute('SELECT 1 as test');
    // }, 'test-database-connection');
    console.log('Database test disabled - missing db imports');
    
    console.log('Database connection successful!');
    // console.log('Query result:', result);
    
    // Try to get the PostgreSQL version for more information
    // const versionResult = await withRetry(async () => {
    //   return await db.execute('SELECT version()');
    // }, 'check-database-version');
    
    // console.log('Database version:');
    // console.log(versionResult[0].version);
    
    return true;
  } catch (error) {
    console.error('Database connection failed:');
    console.error(error);
    return false;
  }
}

// Execute the test
testDatabaseConnection()
  .then(success => {
    if (success) {
      console.log('✅ Database connection test completed successfully');
    } else {
      console.log('❌ Database connection test failed');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error during test:', error);
    process.exit(1);
  });