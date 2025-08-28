// Debug Railway deployment issues
console.log('🔍 Railway Deployment Diagnostics\n');

// Check environment variables that might be used
const envVars = [
  'DATABASE_URL',
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_PROJECT_ID',
  'NODE_ENV',
  'PORT'
];

console.log('📋 Environment Variables:');
envVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    // Mask sensitive information
    const maskedValue = varName.includes('DATABASE') || varName.includes('PASSWORD') 
      ? value.replace(/:[^:@]+@/, ':***@') 
      : value;
    console.log(`   ${varName}=${maskedValue}`);
  } else {
    console.log(`   ${varName}=<not set>`);
  }
});

console.log('\n🌐 Network Connectivity Test:');

// Test basic DNS resolution
import { promises as dns } from 'dns';

async function testConnectivity() {
  try {
    // Test Railway domain resolution
    console.log('1️⃣ Testing DNS resolution for Railway...');
    const railwayIPs = await dns.resolve4('junction.proxy.rlwy.net');
    console.log('✅ Railway DNS resolved:', railwayIPs);
    
    // Test application domain resolution  
    console.log('\n2️⃣ Testing application domain...');
    const appIPs = await dns.resolve4('evalmatch-production.up.railway.app');
    console.log('✅ App domain resolved:', appIPs);
    
  } catch (error) {
    console.log('❌ DNS resolution failed:', error.message);
  }
}

testConnectivity().catch(console.error);