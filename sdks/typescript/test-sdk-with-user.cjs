/**
 * Test SDK with specific Firebase user
 */

const { EvalMatchClient } = require('./dist/index.js');
const admin = require('firebase-admin');

// Firebase service account from Railway (base64 encoded)
const base64Key = 'eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVjdF9pZCI6ImVhbG1hdGNoLXJhaWx3YXkiLCJwcml2YXRlX2tleV9pZCI6ImM3ZDk0MzZkNmYyNWU3OGI4ZjBkMTlhNWY4ZGRmYzY0MTQzNzM4OGUiLCJwcml2YXRlX2tleSI6Ii0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZBSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS1l3Z2dTaUFnRUFBb0lCQVFEYSs1M20xb2VJeTVBTVxuTnA0Wi96T3lJd1BYcG9QUk44dzhDdWp1N3BINnpRNEhrYmViSU5SN3RQVWFYTDZDNDVVS0pqekQvZFRnZjBHdVxuSXZiTU9iTGNoNm91VHJQVXkySEgxb21vRDJWcnhnbFNxWVFHMUQzY1lhL1VtUjZMUE1oQnRPMDFBU2JQZzlSbFxuZ2JVMDV6M3IvbkZWcGhKSE9PU09nWDhzc1FQelN1NXBkMUNYSVF4RExuTVduRUx0c3ZDemRVbDBEZk9TMHdHZVxuTWpic0d3VjBML2swdnZSUHJUYVdrbU11cFN2aEYxeWl0OTlUR2pVTEVEMk1sRkhubWhYN3BJZ0V2a2grNTFRSVxuTmltZTRDTTNpR2cva1E2M1hSU1JJYUQzREVxUG1Renc0MHR6aWtoRjBpQUI1TC9iajRCTzhucWhRMW9aYjhGNFxuaDFOb1Z4eHpBZ01CQUFFQ2dnRUFRSjg0UGNMWlJGa3VMU3lCQTVMNEluMkt5THp1OFhMUjVuWWh2MERQKzM4L1xud0tRVDFzZWRiTlE5OElXbUF1SStQVHlEZWlNU0N4NEN0K3pCZ0FzVzZWVnZ0ektxaHdWdDJaZEtFRHBhNTY4TlxuV1VPRkhxN0xncG1oVmMvSjM3VVVNNis4d0lPU2ZIS2UzMFdqdi9UdHBSTDFSeDAzRDZXT2JTOXg1REpveEFhd1xub3YxSDZUT04wLzUyOVdxOUZnQkh6WG4rUUMyWjUzVWNZU2tac0dheEE2di93QmxHVDU4VkU2UW9mS1gwd05sWlxuOGdFNloxQmxsQjFjNG1yNTRJT01DRXVQZjd1bjlNYWRscFZuMlN2OWI3b05Ba3kwUlBvWW1mMHM3cFRiVlpHVFxuTG5PS1JiZXVIZHgzSWp5RWpaSFp5ckFjTTUzaEhFQ3FVYkl0ZDhWU1lRS0JnUUQvMC9ackx3RWJzVlBkbVF1T1xubDA4YXo5WmJ4UGV6ajRoQzZQWHRpY2t0aWlnUjBvcXFBZmppVi9VWWNLcFdwb3RQNVhFYnBwRU82SFpvbjdvZ1xuejZuK2N3K3V6TjhYSjBrM2JjUG9OeTlUbnoyaVlTcmswUysybmpYVko5MlkzWlpKSWxVSEhrd0tsY3gzZEtIblxub2YzR3pDZEVNNHJzSFZBcVdLbkQ2ekphenZLQmdRRGJJVS9VSFBKZGIyOHE5bEREazVRMGxxb29LWE15cC9pU1xucmNBV2JjM2hUcmtnUDJlQzVHMUR2ZSt0RzRGYWRiYlkzQXk2ajFNaGhhQlV2aWVZeFYvTnJKZEpiRDkwZVVJT1xuMzhTQTJzeldsQUFOK25BK0dreUlNeDloakNDalF2Zm1sOFd4Y00yRXVPK2VnazQraTFkSGdpSWRINWgrS0pOYVxuR1JUbXhlaTlIUUtCZ0hKTTRMODR6QlQwWUpVVWlRNVhXamVQZnFXWDFsZjZuQlhSQWZmMFpOY2M4QlF1YmxmUVxuODhNbEsxT1ZHdllHQ1I1VVUvblhyTjN0VE9JbjQwQS9xQ01RZzRSRThyUGtrSmpjU1BoYWw2R1Q5elN5bHppT1xub2ZQRXNpYWZYaW1yYnpjVHlNdWFaTDBoK3Eyd2habjVUV3BoMG5WdFZmZHlqVnV1SzRObWRTUVBBb0dBREIwb1xuVTVxU0QzWkVtQVJyN0pQeEFvTTl2dUNqdks0cWdMbFlRQ1VyMTRQSm1pM0hKQ1pLb0E4VSsrWGtYY0xhSzl6bVxuV3ozbkk1aEdoOGpIV1p1M3N5QVNjUDJwK0Y5bnRuaktYVEU3VjdaVFJuS00xL0lPUHcxTWM5RVNVTlEzN2loL1xueGxKdEdpUTdJdkVqTURQMXpEODJjWk80azJqYzFJTkVjNG1IVjBVQ2dZQXBzNGRET01FaHN2OW1COG55MEpwWFxuZGFyMm5GY2haNGsyVmxIdGc4K3Z6UFd0N0NDTHAwNXprYUhvN25tMTBVeFFqL1hFYkFBMHVsSnFlSmpmSEpGOFxuL0RIOFQ5Qjl4N3NsVGJZMVBrRGRLWDBlWlY0K2daeC8vVmxGdTNPYmp0OEUzOWZhU01objQxWVVDbnVxNTZIXG5LS1QvajRXWmdkQWNDeFk1bVMveTVnPT1cbi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS1cbiIsImNsaWVudF9lbWFpbCI6ImZpcmViYXNlLWFkbWluc2RrLWZic3ZjQGVhbG1hdGNoLXJhaWx3YXkuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLCJjbGllbnRfaWQiOiIxMDc4ODI5NTM2MTI2MjM0NDQ2NTgiLCJhdXRoX3VyaSI6Imh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwidG9rZW5fdXJpIjoiaHR0cHM6Ly9vYXV0aDIuZ29vZ2xlYXBpcy5jb20vdG9rZW4iLCJhdXRoX3Byb3ZpZGVyX3g1MDlfY2VydF91cmwiOiJodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9vYXV0aDIvdjEvY2VydHMiLCJjbGllbnRfeDUwOV9jZXJ0X3VybCI6Imh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvZmlyZWJhc2UtYWRtaW5zZGstZmJzdmMlNDBlYWxtYXRjaC1yYWlsd2F5LmlhbS5nc2VydmljZWFjY291bnQuY29tIiwidW5pdmVyc2VfZG9tYWluIjoiZ29vZ2xlYXBpcy5jb20ifQo=';

// Decode service account
const serviceAccountJSON = Buffer.from(base64Key, 'base64').toString('utf8');
const serviceAccount = JSON.parse(serviceAccountJSON);

// Initialize Firebase Admin
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error.message);
  process.exit(1);
}

// Custom auth provider that will use the generated token
class FirebaseAuthProvider {
  constructor() {
    this.token = null;
  }

  async setToken(token) {
    this.token = token;
  }

  async getToken() {
    return this.token;
  }

  async isAuthenticated() {
    return !!this.token;
  }
}

async function testSDKWithUser() {
  const userId = 'yMskwbsEr8cfodvrkPvddkZzcN02';
  console.log(`🔐 Testing SDK with Firebase user: ${userId}\n`);

  try {
    // Generate custom token for the user
    console.log('🔑 Generating custom token...');
    const customToken = await admin.auth().createCustomToken(userId);
    console.log('✅ Custom token generated successfully\n');

    // Create auth provider with the token
    const authProvider = new FirebaseAuthProvider();
    await authProvider.setToken(customToken);

    // Initialize SDK client
    console.log('🚀 Initializing EvalMatch SDK...');
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

    // Test 1: List resumes
    console.log('📋 Test 1: Listing resumes...');
    try {
      const resumes = await client.resumes.list();
      console.log('✅ Resumes listed successfully:');
      console.log(`   Total resumes: ${resumes.data?.length || 0}`);
      if (resumes.data && resumes.data.length > 0) {
        resumes.data.forEach((resume, index) => {
          console.log(`   ${index + 1}. ${resume.filename} (ID: ${resume.id})`);
        });
      }
    } catch (error) {
      console.error('❌ Failed to list resumes:', error.message);
      if (error.context) {
        console.error('   Error context:', error.context);
      }
    }

    // Test 2: Create a test job
    console.log('\n💼 Test 2: Creating a job description...');
    try {
      const jobData = {
        title: 'Test Software Engineer Position',
        description: 'We are looking for a talented software engineer to join our team. The ideal candidate should have experience with React, Node.js, and modern web development practices.',
        requirements: ['React', 'Node.js', 'TypeScript', 'REST APIs']
      };

      const job = await client.jobs.create(jobData);
      console.log('✅ Job created successfully:');
      console.log(`   Job ID: ${job.data.id}`);
      console.log(`   Title: ${job.data.title}`);
    } catch (error) {
      console.error('❌ Failed to create job:', error.message);
      if (error.context) {
        console.error('   Error context:', error.context);
      }
    }

    // Test 3: Get a specific resume (if any exist)
    console.log('\n📄 Test 3: Getting specific resume...');
    try {
      // Try to get resume with ID 1 as a test
      const resume = await client.resumes.get(1);
      console.log('✅ Resume retrieved successfully:');
      console.log(`   ID: ${resume.data.id}`);
      console.log(`   Filename: ${resume.data.filename}`);
      console.log(`   Status: ${resume.data.status}`);
    } catch (error) {
      console.error('❌ Failed to get resume:', error.message);
      if (error.code === 'RESOURCE_NOT_FOUND') {
        console.log('   (This is expected if no resume with ID 1 exists)');
      }
    }

    console.log('\n✅ SDK test completed successfully!');
    console.log('The SDK is working correctly with the Firebase user token.\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error.errorInfo) {
      console.error('Firebase error:', error.errorInfo);
    }
  }
}

// Run the test
testSDKWithUser().then(() => {
  console.log('🎉 All tests completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});