#!/usr/bin/env node

/**
 * Test local EvalMatch SDK usage
 */

// Import the SDK from local build
const { EvalMatchClient, FirebaseAuthProvider, ValidationError } = require('./sdks/typescript/dist/index.js');

async function testLocalSDK() {
  console.log('🧪 Testing Local EvalMatch SDK...\n');
  
  try {
    // 1. Create client instance
    console.log('1️⃣ Creating EvalMatch client...');
    const client = new EvalMatchClient({
      baseUrl: 'https://evalmatch.app/api',
      timeout: 10000,
      debug: true
    });
    console.log('✅ Client created successfully\n');
    
    // 2. Check available methods
    console.log('2️⃣ Available SDK methods:');
    console.log('📁 Resumes:', Object.keys(client.resumes || {}));
    console.log('💼 Jobs:', Object.keys(client.jobs || {})); 
    console.log('🧠 Analysis:', Object.keys(client.analysis || {}));
    console.log('🔐 Auth:', typeof client.isAuthenticated);
    console.log('');
    
    // 3. Test configuration
    console.log('3️⃣ Client configuration:');
    const config = client.getConfig();
    console.log('⚙️ Config:', JSON.stringify(config, null, 2));
    console.log('');
    
    // 4. Test error classes
    console.log('4️⃣ Testing error handling...');
    try {
      throw new ValidationError('Test validation error');
    } catch (error) {
      console.log('✅ ValidationError caught:', error.name, '-', error.message);
    }
    console.log('');
    
    // 5. Test Firebase auth provider
    console.log('5️⃣ Firebase auth provider available:');
    console.log('🔥 FirebaseAuthProvider:', typeof FirebaseAuthProvider);
    console.log('');
    
    console.log('🎉 Local SDK Test Successful!');
    console.log('💡 You can now use this SDK in any local project with:');
    console.log('   npm install file:./sdks/typescript');
    console.log('   import { EvalMatchClient } from "@evalmatch/sdk";');
    
  } catch (error) {
    console.error('❌ SDK Test Failed:', error.message);
  }
}

testLocalSDK();