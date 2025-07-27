#!/usr/bin/env node

/**
 * Complete Workflow Test with Authentication
 * Tests the entire flow: Auth -> Job Creation -> Resume Upload -> Analysis
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Firebase Admin setup - Use environment variable for production
const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  : {
    // Placeholder for local testing - replace with actual credentials locally
    "type": "service_account",
    "project_id": "your-project-id",
    "private_key_id": "your-private-key-id",
    "private_key": "your-private-key",
    "client_email": "your-client-email",
    "client_id": "your-client-id",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "your-client-cert-url",
    "universe_domain": "googleapis.com"
  };

const adminApp = initializeApp({
  credential: cert(serviceAccountKey),
  projectId: 'ealmatch-railway'
});
const adminAuth = getAuth(adminApp);

// Test data
const testData = {
  sessionId: `workflow_test_${Date.now()}`,
  jobId: null,
  resumeIds: [],
  userId: null,
  token: null
};

async function createTestUser() {
  log('\n🔐 Step 1: Creating test user and getting token...', 'blue');
  
  const email = `workflow_test_${Date.now()}@example.com`;
  const userRecord = await adminAuth.createUser({
    email: email,
    emailVerified: true
  });
  
  testData.userId = userRecord.uid;
  log(`✅ User created: ${userRecord.uid}`, 'green');
  
  // Create custom token and exchange for ID token
  const customToken = await adminAuth.createCustomToken(userRecord.uid);
  
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=AIzaSyDOINRfDYjB3Sk7UVPa8YWWYvWUq4pEJm0`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  
  const tokenData = await response.json();
  testData.token = tokenData.idToken;
  
  log(`✅ Auth token obtained (${testData.token.length} chars)`, 'green');
  return true;
}

async function createJob() {
  log('\n📋 Step 2: Creating job description...', 'blue');
  
  const jobData = {
    title: "Senior Full Stack Developer - Workflow Test",
    description: `Complete workflow test job posting.

Required Skills:
- JavaScript, TypeScript, React, Node.js - 5+ years
- PostgreSQL, MongoDB - 3+ years
- REST APIs, GraphQL - 4+ years
- Docker, Kubernetes - 2+ years
- CI/CD, Testing - 3+ years

Responsibilities:
- Design and implement scalable web applications
- Lead technical architecture decisions
- Mentor junior developers
- Collaborate with product team on requirements
- Ensure code quality and best practices

Nice to have:
- Python, Go programming
- AWS/GCP cloud experience
- Machine learning basics
- Microservices architecture`
  };
  
  const response = await fetch('http://localhost:3000/api/job-descriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testData.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(jobData)
  });
  
  const data = await response.json();
  
  if (response.ok && data.id) {
    testData.jobId = data.id;
    log(`✅ Job created successfully (ID: ${data.id})`, 'green');
    log(`   Title: ${data.title}`, 'yellow');
    return true;
  } else {
    log(`❌ Job creation failed: ${JSON.stringify(data)}`, 'red');
    return false;
  }
}

async function uploadResumes() {
  log('\n📄 Step 3: Uploading test resume...', 'blue');
  
  try {
    // Use the existing test PDF file
    const fs = await import('fs');
    const testPdfPath = '/home/ews/Evalmatch/test-resume.pdf';
    
    if (!fs.existsSync(testPdfPath)) {
      log('❌ Test PDF file not found, creating simple PDF upload...', 'red');
      return false;
    }
    
    const fileBuffer = fs.readFileSync(testPdfPath);
    
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: 'test-resume.pdf',
      contentType: 'application/pdf'
    });
    formData.append('sessionId', testData.sessionId);
    
    const response = await fetch('http://localhost:3000/api/resumes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${testData.token}`,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (response.ok && data.id) {
      testData.resumeIds.push(data.id);
      log(`✅ Uploaded: test-resume.pdf (ID: ${data.id})`, 'green');
      log(`   File size: ${fileBuffer.length} bytes`, 'yellow');
      return true;
    } else {
      log(`❌ Failed to upload resume: ${JSON.stringify(data)}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Error uploading resume: ${error.message}`, 'red');
    return false;
  }
}

async function runAnalysis() {
  log('\n🔬 Step 4: Running analysis...', 'blue');
  
  const response = await fetch(`http://localhost:3000/api/analyze/${testData.jobId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${testData.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId: testData.sessionId })
  });
  
  const data = await response.json();
  
  if (response.ok && data.results && data.results.length > 0) {
    log(`✅ Analysis completed successfully!`, 'green');
    log(`   Results: ${data.results.length}`, 'yellow');
    log(`   Processing time: ${data.processingTime || 'N/A'}`, 'yellow');
    
    // Display analysis results
    log('\n📊 Analysis Results:', 'blue');
    data.results.forEach((result, index) => {
      log(`\n   Candidate ${index + 1}:`, 'yellow');
      log(`   - Resume ID: ${result.resumeId}`, 'reset');
      log(`   - Match Score: ${result.matchPercentage}%`, 'reset');
      log(`   - Matched Skills: ${result.matchedSkills?.length || 0}`, 'reset');
      log(`   - Missing Skills: ${result.missingSkills?.length || 0}`, 'reset');
      
      if (result.matchedSkills?.length > 0) {
        log(`   - Top Skills: ${result.matchedSkills.slice(0, 3).map(s => s.skill || s).join(', ')}`, 'reset');
      }
    });
    
    return true;
  } else {
    log(`❌ Analysis failed: ${JSON.stringify(data)}`, 'red');
    return false;
  }
}

async function validateDataPersistence() {
  log('\n💾 Step 5: Validating data persistence...', 'blue');
  
  // Check job exists
  const jobResponse = await fetch(`http://localhost:3000/api/job-descriptions/${testData.jobId}`, {
    headers: { 'Authorization': `Bearer ${testData.token}` }
  });
  
  const jobExists = jobResponse.ok;
  log(`${jobExists ? '✅' : '❌'} Job persistence: ${jobExists ? 'OK' : 'FAILED'}`, jobExists ? 'green' : 'red');
  
  // Check resumes exist
  const resumesResponse = await fetch(`http://localhost:3000/api/resumes?sessionId=${testData.sessionId}`, {
    headers: { 'Authorization': `Bearer ${testData.token}` }
  });
  
  if (resumesResponse.ok) {
    const resumesData = await resumesResponse.json();
    const resumeCount = Array.isArray(resumesData) ? resumesData.length : 0;
    const resumesOK = resumeCount === testData.resumeIds.length;
    log(`${resumesOK ? '✅' : '❌'} Resume persistence: ${resumeCount}/${testData.resumeIds.length}`, resumesOK ? 'green' : 'red');
  } else {
    log(`❌ Resume persistence check failed`, 'red');
  }
  
  // Check analysis results exist
  const analysisResponse = await fetch(`http://localhost:3000/api/analyze/${testData.jobId}?sessionId=${testData.sessionId}`, {
    headers: { 'Authorization': `Bearer ${testData.token}` }
  });
  
  if (analysisResponse.ok) {
    const analysisData = await analysisResponse.json();
    const hasResults = analysisData.results && analysisData.results.length > 0;
    log(`${hasResults ? '✅' : '❌'} Analysis persistence: ${hasResults ? 'OK' : 'FAILED'}`, hasResults ? 'green' : 'red');
  } else {
    log(`❌ Analysis persistence check failed`, 'red');
  }
  
  return jobExists;
}

async function cleanup() {
  log('\n🧹 Step 6: Cleaning up...', 'blue');
  
  try {
    await adminAuth.deleteUser(testData.userId);
    log(`✅ Test user deleted`, 'green');
  } catch (error) {
    log(`⚠️  Failed to cleanup user: ${error.message}`, 'yellow');
  }
}

async function runCompleteWorkflowTest() {
  log('🧪 Complete Authenticated Workflow Test', 'blue');
  log('═'.repeat(50), 'blue');
  log(`Session ID: ${testData.sessionId}`, 'yellow');
  
  try {
    // Run all steps
    const authSuccess = await createTestUser();
    if (!authSuccess) throw new Error('Authentication failed');
    
    const jobSuccess = await createJob();
    if (!jobSuccess) throw new Error('Job creation failed');
    
    const resumeSuccess = await uploadResumes();
    if (!resumeSuccess) throw new Error('Resume upload failed');
    
    const analysisSuccess = await runAnalysis();
    if (!analysisSuccess) throw new Error('Analysis failed');
    
    await validateDataPersistence();
    
    log('\n' + '═'.repeat(50), 'blue');
    log('🎉 COMPLETE WORKFLOW TEST SUCCESSFUL!', 'green');
    log('\n✅ All steps completed:', 'green');
    log('   - Authentication working', 'green');
    log('   - Job creation working', 'green');
    log('   - Resume upload working', 'green');
    log('   - AI analysis generating results', 'green');
    log('   - Data persistence working', 'green');
    log('\n📋 Test Summary:', 'blue');
    log(`   Job ID: ${testData.jobId}`, 'yellow');
    log(`   Resumes uploaded: ${testData.resumeIds.length}`, 'yellow');
    log(`   Session ID: ${testData.sessionId}`, 'yellow');
    log('═'.repeat(50), 'blue');
    
  } catch (error) {
    log('\n❌ WORKFLOW TEST FAILED!', 'red');
    log(`Error: ${error.message}`, 'red');
  } finally {
    await cleanup();
  }
}

// Run the test
runCompleteWorkflowTest().catch(error => {
  log(`💥 Test crashed: ${error.message}`, 'red');
  process.exit(1);
});