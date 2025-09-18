/**
 * Jest Global Teardown
 * Runs once after all tests complete
 */

export default async function globalTeardown() {
  console.log('🧹 Starting Jest global teardown...');
  
  try {
    // Import and call the comprehensive database cleanup function
    try {
      const { closeDatabase } = await import('../server/database/index.ts');
      await closeDatabase();
      console.log('✅ Database closed via closeDatabase()');
    } catch (importError) {
      console.log('⚠️  Could not import closeDatabase, falling back to manual cleanup');
      
      // Fallback: Force close any remaining database connections
      if (global.testDbConnection) {
        await global.testDbConnection.end();
        global.testDbConnection = null;
      }
    }
    
    // Additional cleanup for any remaining handles
    if (global.gc) {
      global.gc();
    }
    
    // Give extra time for connections to close properly
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log('✅ Jest global teardown completed');
  } catch (error) {
    console.error('❌ Error during global teardown:', error);
  }
}