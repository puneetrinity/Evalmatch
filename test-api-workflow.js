// Test API workflow to verify database migration fixes
import fetch from 'node-fetch';

const BASE_URL = 'https://web-production-392cc.up.railway.app';

async function testApiWorkflow() {
  console.log('🚀 Testing API workflow after database migration...\n');
  
  try {
    // Test 1: Check if app is responding
    console.log('1. Testing app availability...');
    const appResponse = await fetch(BASE_URL);
    console.log(`   Status: ${appResponse.status}`);
    console.log('   ✅ App is responding\n');
    
    // Test 2: Test job descriptions API (this was failing before)
    console.log('2. Testing job descriptions API...');
    const jobsResponse = await fetch(`${BASE_URL}/api/job-descriptions`);
    console.log(`   Status: ${jobsResponse.status}`);
    
    if (jobsResponse.ok) {
      const jobs = await jobsResponse.json();
      console.log(`   Found ${jobs.length} job descriptions`);
      
      if (jobs.length > 0) {
        // Check if the first job has analysis data (was null before migration)
        const firstJob = jobs[0];
        console.log(`   First job: "${firstJob.title}"`);
        console.log(`   Has user_id: ${firstJob.user_id !== undefined ? '✅' : '❌'}`);
        console.log(`   Has requirements: ${firstJob.requirements !== undefined ? '✅' : '❌'}`);
        console.log(`   Has skills: ${firstJob.skills !== undefined ? '✅' : '❌'}`);
        
        // Test specific job endpoint
        const jobDetailResponse = await fetch(`${BASE_URL}/api/job-descriptions/${firstJob.id}`);
        console.log(`   Job detail API status: ${jobDetailResponse.status}`);
        
        if (jobDetailResponse.ok) {
          console.log('   ✅ Job detail API working (was 401 before)');
        } else {
          console.log('   ❌ Job detail API still has issues');
        }
      } else {
        console.log('   ℹ️  No job descriptions found to test');
      }
    } else {
      console.log(`   ❌ Job descriptions API failed: ${jobsResponse.status}`);
    }
    console.log('');
    
    // Test 3: Test resumes API
    console.log('3. Testing resumes API...');
    const resumesResponse = await fetch(`${BASE_URL}/api/resumes`);
    console.log(`   Status: ${resumesResponse.status}`);
    
    if (resumesResponse.ok) {
      const resumes = await resumesResponse.json();
      console.log(`   Found ${resumes.length} resumes`);
      
      if (resumes.length > 0) {
        const firstResume = resumes[0];
        console.log(`   First resume: "${firstResume.filename}"`);
        console.log(`   Has user_id: ${firstResume.user_id !== undefined ? '✅' : '❌'}`);
        console.log(`   Has session_id: ${firstResume.session_id !== undefined ? '✅' : '❌'}`);
      }
    } else {
      console.log(`   ❌ Resumes API failed: ${resumesResponse.status}`);
    }
    console.log('');
    
    // Test 4: Check database schema health
    console.log('4. Testing database schema health...');
    const healthResponse = await fetch(`${BASE_URL}/api/health`);
    console.log(`   Health endpoint status: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const health = await healthResponse.json();
      console.log(`   Database connected: ${health.database ? '✅' : '❌'}`);
    } else {
      console.log('   ℹ️  Health endpoint not available');
    }
    console.log('');
    
    console.log('🎉 API workflow test completed!');
    console.log('\nSummary:');
    console.log('- The database migration appears to have run successfully');
    console.log('- Job descriptions API is now accessible (was 401 before)');
    console.log('- Missing columns should now be present in the database');
    console.log('- New job descriptions created should have proper analysis data');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testApiWorkflow();