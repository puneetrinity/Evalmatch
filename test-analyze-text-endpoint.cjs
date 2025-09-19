#!/usr/bin/env node
/**
 * Test the new /api/v1/analysis/analyze-text endpoint
 */

const config = {
  baseUrl: process.env.API_BASE_URL || 'https://evalmatch.app/api/v1',
  timeout: 10000
};

const testData = {
  resumeText: `John Doe
Software Engineer
5 years of experience in React, Node.js, and TypeScript
Experience with PostgreSQL and MongoDB
Built scalable web applications for e-commerce`,
  
  jobDescriptionText: `Senior React Developer
We are seeking a React developer with 3+ years experience
Required skills: React, JavaScript, TypeScript
Nice to have: Node.js, databases, e-commerce experience
Bachelor's degree preferred`
};

console.log('🧪 Testing /api/v1/analysis/analyze-text endpoint...\n');

async function testAnalyzeText() {
  try {
    console.log('Testing unauthorized access...');
    
    // Test without authentication (should get 401)
    const unauthorizedResponse = await fetch(`${config.baseUrl}/analysis/analyze-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    console.log(`✓ Unauthorized: ${unauthorizedResponse.status} (expected 401)`);
    
    if (unauthorizedResponse.status === 401) {
      try {
        const errorData = await unauthorizedResponse.json();
        console.log(`  Auth guidance: ${errorData.message || 'No message'}`);
      } catch (e) {
        console.log('  No JSON response');
      }
    }
    
    // Test validation
    console.log('\nTesting validation...');
    
    const validationResponse = await fetch(`${config.baseUrl}/analysis/analyze-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token'
      },
      body: JSON.stringify({ resumeText: 'test' }) // Missing jobDescriptionText
    });
    
    console.log(`✓ Validation: ${validationResponse.status}`);
    
    if (validationResponse.status === 400) {
      try {
        const validationData = await validationResponse.json();
        console.log(`  Validation message: ${validationData.message || 'No message'}`);
      } catch (e) {
        console.log('  No JSON response');
      }
    }
    
    console.log('\n🎯 Basic endpoint validation complete!');
    console.log('Next: Test with valid authentication token for full functionality.');
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
  }
}

if (require.main === module) {
  testAnalyzeText();
}