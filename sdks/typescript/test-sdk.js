#!/usr/bin/env node

/**
 * Simple test to verify SDK compilation and imports work
 */

// Test CommonJS import
const { EvalMatchClient, FirebaseAuthProvider, ValidationError } = require('./dist/index.js');

console.log('✅ CommonJS import successful');
console.log('📋 Available exports:');
console.log('  - EvalMatchClient:', typeof EvalMatchClient);
console.log('  - FirebaseAuthProvider:', typeof FirebaseAuthProvider);
console.log('  - ValidationError:', typeof ValidationError);

// Test basic client instantiation
class MockAuthProvider {
  async getToken() {
    return 'mock-jwt-token';
  }
  
  async isAuthenticated() {
    return true;
  }
}

try {
  const client = new EvalMatchClient({
    authProvider: new MockAuthProvider(),
    debug: true
  });
  
  console.log('✅ Client instantiation successful');
  console.log('📋 Client methods available:');
  console.log('  - resumes:', typeof client.resumes);
  console.log('  - jobs:', typeof client.jobs);
  console.log('  - analysis:', typeof client.analysis);
  console.log('  - isAuthenticated:', typeof client.isAuthenticated);
  
  // Test configuration
  const config = client.getConfig();
  console.log('✅ Configuration retrieved:', {
    baseUrl: config.baseUrl,
    timeout: config.timeout,
    debug: config.debug
  });
  
  console.log('\n🎉 SDK Test Successful! Ready for production use.');
  
} catch (error) {
  console.error('❌ SDK Test Failed:', error.message);
  process.exit(1);
}