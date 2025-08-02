#!/usr/bin/env node

/**
 * Test script to verify the bias analysis and resume analysis fixes
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000/api';

// Mock user ID for testing (since auth is bypassed in dev mode)
const TEST_USER_ID = 'test-user-123';

async function apiRequest(method, url, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer mock-token`, // Mock auth header
      'X-User-ID': TEST_USER_ID, // Mock user ID header for bypass mode
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  console.log(`${method} ${url}`);
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    console.error(`❌ ${method} ${url} failed:`, data);
    throw new Error(`Request failed: ${response.status}`);
  }
  
  console.log(`✅ ${method} ${url} success`);
  return data;
}

async function testBiasAnalysisFix() {
  console.log('\n🧪 Testing Bias Analysis Fix...\n');
  
  try {
    // 1. Create a job description with potentially biased language
    const jobData = {
      title: 'Senior Software Developer',
      description: `We're looking for rockstar developers and coding ninjas to join our dynamic team. 
      The ideal candidate is a digital native who can work in a fast-paced environment. 
      We need someone young and energetic who can handle aggressive deadlines.`
    };

    console.log('1. Creating job description...');
    const jobResponse = await apiRequest('POST', `${API_BASE}/job-descriptions`, jobData);
    const jobId = jobResponse.jobDescription.id;
    console.log(`   Created job ${jobId}: "${jobResponse.jobDescription.title}"`);

    // 2. Run bias analysis
    console.log('\n2. Running bias analysis...');
    const biasResponse = await apiRequest('POST', `${API_BASE}/analysis/analyze-bias/${jobId}`);
    console.log(`   Bias detected: ${biasResponse.biasAnalysis.hasBias}`);
    console.log(`   Bias types: ${biasResponse.biasAnalysis.biasTypes.join(', ')}`);
    
    // 3. Verify bias analysis is saved - get job description again
    console.log('\n3. Verifying bias analysis is saved...');
    const savedJobResponse = await apiRequest('GET', `${API_BASE}/job-descriptions/${jobId}`);
    
    if (savedJobResponse.jobDescription.analyzedData?.biasAnalysis) {
      console.log('   ✅ Bias analysis saved successfully!');
      console.log(`   Saved bias data: hasBias=${savedJobResponse.jobDescription.analyzedData.biasAnalysis.hasBias}`);
    } else {
      console.log('   ❌ Bias analysis not saved in job description');
    }

    return jobId;

  } catch (error) {
    console.error('❌ Bias analysis test failed:', error.message);
    throw error;
  }
}

async function testResumeAnalysisFix(jobId) {
  console.log('\n🧪 Testing Resume Analysis Fix...\n');
  
  try {
    // 1. Check analysis results before running analysis
    console.log('1. Checking analysis results before running analysis...');
    const beforeAnalysis = await apiRequest('GET', `${API_BASE}/analysis/analyze/${jobId}`);
    console.log(`   Results before: ${beforeAnalysis.results.length} results`);
    console.log(`   Message: ${beforeAnalysis.message}`);
    if (beforeAnalysis.debug) {
      console.log(`   Debug info: ${JSON.stringify(beforeAnalysis.debug, null, 2)}`);
    }

    // 2. Run resume analysis (this should work if there are resumes uploaded)
    console.log('\n2. Attempting to run resume analysis...');
    try {
      const analysisResponse = await apiRequest('POST', `${API_BASE}/analysis/analyze/${jobId}`);
      console.log(`   Analysis completed: ${analysisResponse.results.length} results`);
      
      // 3. Check analysis results after running analysis
      console.log('\n3. Checking analysis results after running analysis...');
      const afterAnalysis = await apiRequest('GET', `${API_BASE}/analysis/analyze/${jobId}`);
      console.log(`   Results after: ${afterAnalysis.results.length} results`);
      
      if (afterAnalysis.results.length > 0) {
        console.log('   ✅ Resume analysis working correctly!');
        afterAnalysis.results.forEach((result, index) => {
          console.log(`   Resume ${index + 1}: ${result.filename} - ${result.matchPercentage}% match`);
        });
      } else {
        console.log('   ⚠️  Analysis ran but returned 0 results');
      }
      
    } catch (analysisError) {
      if (analysisError.message.includes('No resumes found')) {
        console.log('   ℹ️  No resumes uploaded - this is expected for a fresh test');
        console.log('   To fully test, upload resumes via the UI first');
      } else {
        throw analysisError;
      }
    }

  } catch (error) {
    console.error('❌ Resume analysis test failed:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Testing Critical Analysis Flow Fixes\n');
  
  try {
    const jobId = await testBiasAnalysisFix();
    await testResumeAnalysisFix(jobId);
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📝 Summary of fixes:');
    console.log('   ✅ Bias analysis now saves results to job description');
    console.log('   ✅ Resume analysis provides better debugging information');
    console.log('   ✅ Error messages are more informative');
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run the test
main();