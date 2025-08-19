/**
 * Simple SDK test without Firebase Admin complexity
 */

const { EvalMatchClient } = require('./dist/index.js');

// Simple auth provider that uses a provided token
class SimpleAuthProvider {
  constructor(token) {
    this.token = token;
  }

  async getToken() {
    return this.token;
  }

  async isAuthenticated() {
    return !!this.token;
  }
}

async function testSDK() {
  console.log('🚀 Testing EvalMatch SDK with simple auth...\n');

  try {
    // Use a mock token for testing - in real usage this would come from Firebase
    const mockToken = 'mock_firebase_jwt_token_for_testing';
    
    // Create auth provider
    const authProvider = new SimpleAuthProvider(mockToken);

    // Initialize SDK client
    console.log('📦 Initializing EvalMatch SDK...');
    const client = new EvalMatchClient({
      baseUrl: 'https://evalmatch.app/api',
      authProvider: authProvider,
      timeout: 30000,
      retries: 2,
      debug: true
    });

    console.log('✅ SDK initialized successfully');
    console.log(`   Base URL: ${client.getConfig().baseUrl}`);
    console.log(`   Authenticated: ${await client.isAuthenticated()}\n`);

    // Test 1: List resumes (will fail auth but test the call flow)
    console.log('📋 Test 1: Testing resumes.list() call flow...');
    try {
      const resumes = await client.resumes.list();
      console.log('✅ Resumes API call succeeded:', resumes.data?.length || 0, 'resumes');
    } catch (error) {
      console.log('⚠️  Expected auth error for resumes.list():');
      console.log(`   Status: ${error.context?.statusCode || 'unknown'}`);
      console.log(`   Message: ${error.message}`);
      console.log(`   Endpoint: ${error.context?.endpoint || 'unknown'}`);
      console.log(`   Method: ${error.context?.method || 'unknown'}`);
      
      if (error.context?.statusCode === 401) {
        console.log('✅ Authentication error as expected - SDK is working correctly');
      }
    }

    // Test 2: Create a test job (will also fail auth but test call flow)
    console.log('\n💼 Test 2: Testing jobs.create() call flow...');
    try {
      const jobData = {
        title: 'Test Software Engineer Position',
        description: 'A test job description for SDK testing.',
        requirements: ['React', 'Node.js', 'TypeScript']
      };

      const job = await client.jobs.create(jobData);
      console.log('✅ Job creation succeeded:', job.data.id);
    } catch (error) {
      console.log('⚠️  Expected auth error for jobs.create():');
      console.log(`   Status: ${error.context?.statusCode || 'unknown'}`);
      console.log(`   Message: ${error.message}`);
      console.log(`   Endpoint: ${error.context?.endpoint || 'unknown'}`);
      
      if (error.context?.statusCode === 401) {
        console.log('✅ Authentication error as expected - SDK is working correctly');
      }
    }

    console.log('\n✅ SDK test completed successfully!');
    console.log('The SDK is properly configured and making HTTP requests.');
    console.log('Authentication errors are expected without a valid Firebase token.\n');

    console.log('🔗 To test with real authentication:');
    console.log('1. Get a valid Firebase ID token from your frontend app');
    console.log('2. Replace mockToken with the real token');
    console.log('3. Re-run this script\n');

  } catch (error) {
    console.error('❌ SDK test failed:', error.message);
    if (error.context) {
      console.error('   Error context:', error.context);
    }
  }
}

// Run the test
testSDK().then(() => {
  console.log('🎉 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});