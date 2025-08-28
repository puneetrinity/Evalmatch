// Simple API test without complex Jest setup
import fetch from 'node-fetch';

const BASE_URL = 'https://web-production-392cc.up.railway.app';

async function testBasicAPI() {
  console.log('🧪 Testing Basic API Functionality\n');

  // Test 1: Health Check
  console.log('1️⃣ Testing Health Check...');
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Health check passed');
      console.log(`   Status: ${data.status}, Uptime: ${data.uptime}s`);
    } else {
      console.log('❌ Health check failed');
    }
  } catch (error) {
    console.log(`❌ Health check error: ${error.message}`);
  }

  // Test 2: Job Creation
  console.log('\n2️⃣ Testing Job Creation...');
  let jobId = null;
  try {
    const response = await fetch(`${BASE_URL}/api/job-descriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test API Job',
        description: 'This is a test job for API validation'
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      jobId = data.jobDescription.id;
      console.log('✅ Job creation passed');
      console.log(`   Job ID: ${jobId}, Title: ${data.jobDescription.title}`);
    } else {
      console.log('❌ Job creation failed');
      console.log(`   Error: ${data.error || data.message}`);
    }
  } catch (error) {
    console.log(`❌ Job creation error: ${error.message}`);
  }

  // Test 3: Bias Analysis (if job was created)
  if (jobId) {
    console.log('\n3️⃣ Testing Bias Analysis...');
    try {
      const response = await fetch(`${BASE_URL}/api/analysis/analyze-bias/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log('✅ Bias analysis passed');
        console.log(`   Has bias: ${data.biasAnalysis?.hasBias}, Score: ${data.biasAnalysis?.biasConfidenceScore}`);
      } else {
        console.log('❌ Bias analysis failed');
        console.log(`   Error: ${data.error || data.message}`);
      }
    } catch (error) {
      console.log(`❌ Bias analysis error: ${error.message}`);
    }
  }

  // Test 4: Resume Upload
  console.log('\n4️⃣ Testing Resume Upload...');
  try {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    const resumeContent = 'John Doe\nSoftware Engineer\n5 years React experience';
    
    form.append('file', resumeContent, {
      filename: 'test-resume.txt',
      contentType: 'text/plain'
    });

    const response = await fetch(`${BASE_URL}/api/resumes`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Resume upload passed');
      console.log(`   Resume ID: ${data.resume?.id}, Filename: ${data.resume?.filename}`);
    } else {
      console.log('❌ Resume upload failed');
      console.log(`   Error: ${data.error || data.message}`);
    }
  } catch (error) {
    console.log(`❌ Resume upload error: ${error.message}`);
  }

  console.log('\n✅ Basic API test completed!');
}

testBasicAPI().catch(console.error);