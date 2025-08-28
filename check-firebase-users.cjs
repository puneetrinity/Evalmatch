const admin = require('firebase-admin');

// Get service account from Railway environment variable
// Use the base64 encoded version from Railway
const base64Key = 'eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVjdF9pZCI6ImVhbG1hdGNoLXJhaWx3YXkiLCJwcml2YXRlX2tleV9pZCI6ImM3ZDk0MzZkNmYyNWU3OGI4ZjBkMTlhNWY4ZGRmYzY0MTQzNzM4OGUiLCJwcml2YXRlX2tleSI6Ii0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZBSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS1l3Z2dTaUFnRUFBb0lCQVFEYSs1M20xb2VJeTVBTVxuTnA0Wi96T3lJd1BYcG9QUk44dzhDdWp1N3BINnpRNEhrYmViSU5SN3RQVWFYTDZDNDVVS0pqekQvZFRnZjBHdVxuSXZiTU9iTGNoNm91VHJQVXkySEgxb21vRDJWcnhnbFNxWVFHMUQzY1lhL1VtUjZMUE1oQnRPMDFBU2JQZzlSbFxuZ2JVMDV6M3IvbkZWcGhKSE9PU09nWDhzc1FQelN1NXBkMUNYSVF4RExuTVduRUx0c3ZDemRVbDBEZk9TMHdHZVxuTWpic0d3VjBML2swdnZSUHJUYVdrbU11cFN2aEYxeWl0OTlUR2pVTEVEMk1sRkhubWhYN3BJZ0V2a2grNTFRSVxuTmltZTRDTTNpR2cva1E2M1hSU1JJYUQzREVxUG1Renc0MHR6aWtoRjBpQUI1TC9iajRCTzhucWhRMW9aYjhGNFxuaDFOb1Z4eHpBZ01CQUFFQ2dnRUFRSjg0UGNMWlJGa3VMU3lCQTVMNEluMkt5THp1OFhMUjVuWWh2MERQKzM4L1xud0tRVDFzZWRiTlE5OElXbUF1SStQVHlEZWlNU0N4NEN0K3pCZ0FzVzZWVnZ0ektxaHdWdDJaZEtFRHBhNTY4TlxuV1VPRkhxN0xncG1oVmMvSjM3VVVNNis4d0lPU2ZIS2UzMFdqdi9UdHBSTDFSeDAzRDZXT2JTOXg1REpveEFhd1xub3YxSDZUT04wLzUyOVdxOUZnQkh6WG4rUUMyWjUzVWNZU2tac0dheEE2di93QmxHVDU4VkU2UW9mS1gwd05sWlxuOGdFNloxQmxsQjFjNG1yNTRJT01DRXVQZjd1bjlNYWRscFZuMlN2OWI3b05Ba3kwUlBvWW1mMHM3cFRiVlpHVFxuTG5PS1JiZXVIZHgzSWp5RWpaSFp5ckFjTTUzaEhFQ3FVYkl0ZDhWU1lRS0JnUUQvMC9ackx3RWJzVlBkbVF1T1xubDA4YXo5WmJ4UGV6ajRoQzZQWHRpY2t0aWlnUjBvcXFBZmppVi9VWWNLcFdwb3RQNVhFYnBwRU82SFpvbjdvZ1xuejZuK2N3K3V6TjhYSjBrM2JjUG9OeTlUbnoyaVlTcmswUysybmpYVko5MlkzWlpKSWxVSEhrd0tsY3gzZEtIblxub2YzR3pDZEVNNHJzSFZBcVdLbkQ2ekphenZLQmdRRGJJVS9VSFBKZGIyOHE5bEREazVRMGxxb29LWE15cC9pU1xucmNBV2JjM2hUcmtnUDJlQzVHMUR2ZSt0RzRGYWRiYlkzQXk2ajFNaGhhQlV2aWVZeFYvTnJKZEpiRDkwZVVJT1xuMzhTQTJzeldsQUFOK25BK0dreUlNeDloakNDalF2Zm1sOFd4Y00yRXVPK2VnazQraTFkSGdpSWRINWgrS0pOYVxuR1JUbXhlaTlIUUtCZ0hKTTRMODR6QlQwWUpVVWlRNVhXamVQZnFXWDFsZjZuQlhSQWZmMFpOY2M4QlF1YmxmUVxuODhNbEsxT1ZHdllHQ1I1VVUvblhyTjN0VE9JbjQwQS9xQ01RZzRSRThyUGtrSmpjU1BoYWw2R1Q5elN5bHppT1xub2ZQRXNpYWZYaW1yYnpjVHlNdWFaTDBoK3Eyd2habjVUV3BoMG5WdFZmZHlqVnV1SzRObWRTUVBBb0dBREIwb1xuVTVxU0QzWkVtQVJyN0pQeEFvTTl2dUNqdks0cWdMbFlRQ1VyMTRQSm1pM0hKQ1pLb0E4VSsrWGtYY0xhSzl6bVxuV3ozbkk1aEdoOGpIV1p1M3N5QVNjUDJwK0Y5bnRuaktYVEU3VjdaVFJuS00xL0lPUHcxTWM5RVNVTlEzN2loL1xueGxKdEdpUTdJdkVqTURQMXpEODJjWk80azJqYzFJTkVjNG1IVjBVQ2dZQXBzNGRET01FaHN2OW1COG55MEpwWFxuZGFyMm5GY2haNGsyVmxIdGc4K3Z6UFd0N0NDTHAwNXprYUhvN25tMTBVeFFqL1hFYkFBMHVsSnFlSmpmSEpGOFxuL0RIOFQ5Qjl4N3NsVGJZMVBrRGRLWDBlWlY0K2daeC8vVmxGdTNPYmp0OEUzOWZhU01objQxWVVDbnVxNTZIXG5LS1QvajRXWmdkQWNDeFk1bVMveTVnPT1cbi0tLS0tRU5EIFBSSVZBVEUgS0VZLS0tLS1cbiIsImNsaWVudF9lbWFpbCI6ImZpcmViYXNlLWFkbWluc2RrLWZic3ZjQGVhbG1hdGNoLXJhaWx3YXkuaWFtLmdzZXJ2aWNlYWNjb3VudC5jb20iLCJjbGllbnRfaWQiOiIxMDc4ODI5NTM2MTI2MjM0NDQ2NTgiLCJhdXRoX3VyaSI6Imh0dHBzOi8vYWNjb3VudHMuZ29vZ2xlLmNvbS9vL29hdXRoMi9hdXRoIiwidG9rZW5fdXJpIjoiaHR0cHM6Ly9vYXV0aDIuZ29vZ2xlYXBpcy5jb20vdG9rZW4iLCJhdXRoX3Byb3ZpZGVyX3g1MDlfY2VydF91cmwiOiJodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9vYXV0aDIvdjEvY2VydHMiLCJjbGllbnRfeDUwOV9jZXJ0X3VybCI6Imh0dHBzOi8vd3d3Lmdvb2dsZWFwaXMuY29tL3JvYm90L3YxL21ldGFkYXRhL3g1MDkvZmlyZWJhc2UtYWRtaW5zZGstZmJzdmMlNDBlYWxtYXRjaC1yYWlsd2F5LmlhbS5nc2VydmljZWFjY291bnQuY29tIiwidW5pdmVyc2VfZG9tYWluIjoiZ29vZ2xlYXBpcy5jb20ifQo=';

// Decode base64 to get the service account JSON
const serviceAccountJSON = Buffer.from(base64Key, 'base64').toString('utf8');
const serviceAccount = JSON.parse(serviceAccountJSON);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

async function listUsers() {
  console.log('🔍 Checking Firebase users for project:', serviceAccount.project_id);
  console.log('================================================\n');
  
  try {
    // List users
    const listUsersResult = await admin.auth().listUsers(1000);
    
    console.log(`✅ Found ${listUsersResult.users.length} users:\n`);
    
    listUsersResult.users.forEach((userRecord, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`  UID: ${userRecord.uid}`);
      console.log(`  Email: ${userRecord.email || 'N/A'}`);
      console.log(`  Display Name: ${userRecord.displayName || 'N/A'}`);
      console.log(`  Disabled: ${userRecord.disabled}`);
      console.log(`  Created: ${new Date(userRecord.metadata.creationTime).toLocaleString()}`);
      console.log(`  Last Sign In: ${userRecord.metadata.lastSignInTime ? 
        new Date(userRecord.metadata.lastSignInTime).toLocaleString() : 'Never'}`);
      console.log(`  Provider(s): ${userRecord.providerData.map(p => p.providerId).join(', ') || 'None'}`);
      console.log('---');
    });
    
    if (listUsersResult.pageToken) {
      console.log('\n⚠️  More users exist. Only showing first 1000.');
    }
    
    // Generate a custom token for the first user for SDK testing
    if (listUsersResult.users.length > 0) {
      const testUser = listUsersResult.users[0];
      console.log('\n🔑 Generating custom token for SDK testing...');
      
      try {
        const customToken = await admin.auth().createCustomToken(testUser.uid);
        console.log(`\n✅ Custom token generated for user: ${testUser.email || testUser.uid}`);
        console.log('\n📋 Use this token in your SDK test:\n');
        console.log(customToken);
        console.log('\n💡 Add this to your test script as:');
        console.log(`const AUTH_TOKEN = '${customToken}';`);
      } catch (tokenError) {
        console.error('❌ Error generating custom token:', tokenError.message);
      }
    } else {
      console.log('\n⚠️  No users found. Create a user first in Firebase Console.');
    }
    
  } catch (error) {
    console.error('❌ Error listing users:', error.message);
    console.error('Details:', error);
  }
}

// Run the check
listUsers().then(() => {
  console.log('\n✅ Firebase user check complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});