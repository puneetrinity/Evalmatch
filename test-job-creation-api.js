// Test job creation API directly
const testJobCreation = async () => {
  const baseUrl = 'https://web-production-392cc.up.railway.app';
  
  console.log('🧪 Testing job creation API...\n');
  
  try {
    // Test job creation endpoint
    const response = await fetch(`${baseUrl}/api/job-descriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Note: This will fail without proper auth token, but we can see the error
      },
      body: JSON.stringify({
        title: 'Test Job Title',
        description: 'This is a test job description for API testing purposes.'
      })
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    console.log('Response:', responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('✅ Job created with ID:', data.id || data.jobDescription?.id);
    } else {
      console.log('❌ Job creation failed');
      if (response.status === 401) {
        console.log('   → Authentication required (expected)');
      }
    }
    
  } catch (error) {
    console.log('❌ Request failed:', error.message);
  }
};

testJobCreation();