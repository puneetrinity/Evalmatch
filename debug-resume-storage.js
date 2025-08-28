import fetch from 'node-fetch';
import FormData from 'form-data';

const BASE_URL = 'https://web-production-392cc.up.railway.app';

async function debugResumeStorage() {
  console.log('🔍 DEBUGGING RESUME STORAGE ISSUE\n');
  
  // 1. Test resume upload
  console.log('1️⃣ Testing resume upload...');
  try {
    const resumeContent = `John Smith
Senior Software Engineer
john.smith@email.com | (555) 123-4567

SKILLS
• React, TypeScript, Node.js
• PostgreSQL, MongoDB  
• AWS, Docker, Kubernetes

EXPERIENCE
Senior Software Engineer | TechCorp | 2020-Present
• Built scalable React applications
• Led team of 4 developers
• Implemented microservices architecture`;

    const form = new FormData();
    const buffer = Buffer.from(resumeContent, 'utf-8');
    form.append('file', buffer, {
      filename: 'debug-resume.txt',
      contentType: 'text/plain'
    });

    const uploadResponse = await fetch(`${BASE_URL}/api/resumes`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const uploadData = await uploadResponse.json();
    
    if (uploadResponse.ok) {
      console.log(`✅ Resume uploaded successfully!`);
      console.log(`   ID: ${uploadData.resume.id}`);
      console.log(`   Filename: ${uploadData.resume.filename}`);
      console.log(`   Skills: ${uploadData.resume.skills?.length || 0}`);
      
      const resumeId = uploadData.resume.id;
      
      // 2. Immediately try to fetch resumes list
      console.log('\n2️⃣ Fetching resumes list immediately after upload...');
      const listResponse = await fetch(`${BASE_URL}/api/resumes`);
      const listData = await listResponse.json();
      
      console.log(`Resumes found: ${listData.count}`);
      if (listData.resumes && listData.resumes.length > 0) {
        console.log('✅ Resume found in list!');
        listData.resumes.forEach((r, i) => {
          console.log(`   ${i + 1}. ID: ${r.id}, File: ${r.filename}`);
        });
      } else {
        console.log('❌ No resumes found in list');
      }
      
      // 3. Try to fetch the specific resume
      console.log('\n3️⃣ Fetching specific resume by ID...');
      const getResponse = await fetch(`${BASE_URL}/api/resumes/${resumeId}`);
      const getData = await getResponse.json();
      
      if (getResponse.ok) {
        console.log('✅ Resume fetched by ID successfully!');
        console.log(`   Content length: ${getData.content?.length || 0} characters`);
      } else {
        console.log('❌ Failed to fetch resume by ID:');
        console.log(`   Error: ${getData.error || getData.message}`);
      }
      
      // 4. Wait a moment and try list again
      console.log('\n4️⃣ Waiting 2 seconds and checking list again...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const listResponse2 = await fetch(`${BASE_URL}/api/resumes`);
      const listData2 = await listResponse2.json();
      
      console.log(`Resumes found after wait: ${listData2.count}`);
      if (listData2.resumes && listData2.resumes.length > 0) {
        console.log('✅ Resume still found in list!');
      } else {
        console.log('❌ Resume disappeared from list');
      }
      
      // 5. Try match analysis with this resume
      console.log('\n5️⃣ Testing match analysis with uploaded resume...');
      
      // First create a job
      const jobResponse = await fetch(`${BASE_URL}/api/job-descriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Debug Software Engineer',
          description: 'We need a software engineer with React, Node.js, and TypeScript experience for our growing team.'
        })
      });
      
      const jobData = await jobResponse.json();
      if (jobResponse.ok) {
        const jobId = jobData.jobDescription.id;
        console.log(`   Job created with ID: ${jobId}`);
        
        // Now try match analysis
        const analysisResponse = await fetch(`${BASE_URL}/api/analysis/analyze/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        const analysisData = await analysisResponse.json();
        if (analysisResponse.ok) {
          console.log('✅ Match analysis succeeded!');
          console.log(`   Results: ${analysisData.results?.length || 0}`);
        } else {
          console.log('❌ Match analysis failed:');
          console.log(`   Error: ${analysisData.error || analysisData.message}`);
        }
      } else {
        console.log('❌ Failed to create job for analysis test');
      }
      
    } else {
      console.log(`❌ Resume upload failed:`);
      console.log(`   Status: ${uploadResponse.status}`);
      console.log(`   Error: ${uploadData.error || uploadData.message}`);
    }
    
  } catch (error) {
    console.log(`❌ Debug test error: ${error.message}`);
  }
  
  console.log('\n✅ DEBUG TEST COMPLETE!');
}

debugResumeStorage().catch(console.error);