/**
 * Jest Global Teardown
 * Runs once after all tests complete
 */

export default async function globalTeardown() {
  console.log('🧹 Starting Jest global teardown...');
  
  try {
    // Force close any remaining database connections
    if (global.testDbConnection) {
      await global.testDbConnection.end();
      global.testDbConnection = null;
    }
    
    // Give a small delay to allow connections to close properly
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ Jest global teardown completed');
  } catch (error) {
    console.error('❌ Error during global teardown:', error);
  }
}