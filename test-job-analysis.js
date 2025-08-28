// Test script to debug job description analysis
const fetch = require('node-fetch');

async function testJobAnalysis() {
  const jobData = {
    title: "Test Python Developer",
    description: "Python developer with 3+ years experience"
  };

  // Get auth token first - you'll need to replace this with a real token from your browser
  const authToken = "YOUR_FIREBASE_TOKEN_HERE";

  try {
    console.log('Creating job description...');
    const response = await fetch('https://web-production-392cc.up.railway.app/api/job-descriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(jobData)
    });

    const result = await response.json();
    console.log('Response:', result);
    
    if (!response.ok) {
      console.error('Error:', response.status, result);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
}

// testJobAnalysis();
console.log('Replace YOUR_FIREBASE_TOKEN_HERE with a real token and uncomment the function call');