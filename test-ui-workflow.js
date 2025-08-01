import fetch from 'node-fetch';
import FormData from 'form-data';

const BASE_URL = 'https://web-production-392cc.up.railway.app';

async function testFullWorkflow() {
  console.log('🧪 TESTING EVALMATCH END-TO-END WORKFLOW\n');
  
  let jobId = null;
  let resumeId = null;

  // 1. TEST JOB CREATION
  console.log('1️⃣ Testing Job Creation...');
  try {
    const jobResponse = await fetch(`${BASE_URL}/api/job-descriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Senior Full Stack Developer',
        description: 'We are seeking a talented Senior Full Stack Developer to join our growing team. The ideal candidate will have 5+ years of experience with React, Node.js, and cloud technologies. You will be responsible for building scalable web applications and mentoring junior developers.'
      })
    });

    const jobData = await jobResponse.json();
    
    if (jobResponse.ok) {
      jobId = jobData.jobDescription.id;
      console.log(`✅ Job created successfully! ID: ${jobId}`);
      console.log(`   Title: ${jobData.jobDescription.title}`);
      console.log(`   Skills found: ${jobData.jobDescription.skills?.length || 0}`);
    } else {
      console.log(`❌ Job creation failed: ${jobData.error || jobData.message}`);
      return;
    }
  } catch (error) {
    console.log(`❌ Job creation error: ${error.message}`);
    return;
  }

  console.log('');

  // 2. TEST BIAS ANALYSIS
  console.log('2️⃣ Testing Bias Analysis...');
  try {
    const biasResponse = await fetch(`${BASE_URL}/api/analysis/analyze-bias/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const biasData = await biasResponse.json();
    
    if (biasResponse.ok) {
      console.log('✅ Bias analysis completed!');
      if (biasData.biasAnalysis) {
        console.log(`   Has bias: ${biasData.biasAnalysis.hasBias}`);
        console.log(`   Bias score: ${biasData.biasAnalysis.biasConfidenceScore || 'N/A'}`);
        console.log(`   Bias types: ${biasData.biasAnalysis.biasTypes?.join(', ') || 'None'}`);
      }
    } else {
      console.log(`❌ Bias analysis failed: ${biasData.error || biasData.message}`);
    }
  } catch (error) {
    console.log(`❌ Bias analysis error: ${error.message}`);
  }

  console.log('');

  // 3. TEST RESUME UPLOAD
  console.log('3️⃣ Testing Resume Upload...');
  try {
    const resumeContent = `Jane Smith
Senior Full Stack Developer
jane.smith@email.com | (555) 123-4567

SUMMARY
Experienced Full Stack Developer with 7+ years building scalable web applications using React, Node.js, TypeScript, and AWS. Strong background in microservices architecture and DevOps practices.

SKILLS
- Frontend: React, Redux, TypeScript, Next.js, HTML5, CSS3
- Backend: Node.js, Express, NestJS, GraphQL, REST APIs
- Databases: PostgreSQL, MongoDB, Redis
- Cloud: AWS (EC2, S3, Lambda), Docker, Kubernetes
- Tools: Git, Jenkins, Terraform, Datadog

EXPERIENCE
Senior Full Stack Developer | TechCorp Inc. | 2020-Present
- Led development of microservices architecture serving 1M+ users
- Reduced API response time by 40% through optimization
- Mentored team of 5 junior developers

Full Stack Developer | StartupXYZ | 2017-2020
- Built React/Node.js SaaS platform from scratch
- Implemented CI/CD pipeline reducing deployment time by 60%

EDUCATION
BS Computer Science | State University | 2017`;

    const form = new FormData();
    const buffer = Buffer.from(resumeContent, 'utf-8');
    form.append('file', buffer, {
      filename: 'jane-smith-resume.txt',
      contentType: 'text/plain'
    });

    const resumeResponse = await fetch(`${BASE_URL}/api/resumes`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    const resumeData = await resumeResponse.json();
    
    if (resumeResponse.ok) {
      resumeId = resumeData.resume.id;
      console.log(`✅ Resume uploaded successfully! ID: ${resumeId}`);
      console.log(`   Filename: ${resumeData.resume.filename}`);
      console.log(`   Skills extracted: ${resumeData.resume.skills?.length || 0}`);
    } else {
      console.log(`❌ Resume upload failed: ${resumeData.error || resumeData.message}`);
    }
  } catch (error) {
    console.log(`❌ Resume upload error: ${error.message}`);
  }

  console.log('');

  // 4. TEST MATCH ANALYSIS
  console.log('4️⃣ Testing Match Analysis...');
  try {
    const analysisResponse = await fetch(`${BASE_URL}/api/analysis/analyze/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const analysisData = await analysisResponse.json();
    
    if (analysisResponse.ok) {
      console.log('✅ Match analysis completed!');
      console.log(`   Resumes analyzed: ${analysisData.results?.length || 0}`);
      
      if (analysisData.results && analysisData.results.length > 0) {
        analysisData.results.forEach((result, index) => {
          console.log(`   Resume ${index + 1}: ${result.matchPercentage}% match`);
          console.log(`     - Matched skills: ${result.matchedSkills?.length || 0}`);
          console.log(`     - Missing skills: ${result.missingSkills?.length || 0}`);
        });
      }
    } else {
      console.log(`❌ Match analysis failed: ${analysisData.error || analysisData.message}`);
    }
  } catch (error) {
    console.log(`❌ Match analysis error: ${error.message}`);
  }

  console.log('');

  // 5. TEST INTERVIEW QUESTIONS
  if (resumeId && jobId) {
    console.log('5️⃣ Testing Interview Questions Generation...');
    try {
      const interviewResponse = await fetch(`${BASE_URL}/api/analysis/interview-questions/${resumeId}/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const interviewData = await interviewResponse.json();
      
      if (interviewResponse.ok) {
        console.log('✅ Interview questions generated!');
        console.log(`   Questions: ${interviewData.questions?.length || 0}`);
        
        if (interviewData.questions && interviewData.questions.length > 0) {
          console.log('   Sample questions:');
          interviewData.questions.slice(0, 3).forEach((q, i) => {
            console.log(`     ${i + 1}. ${q.question}`);
            console.log(`        Category: ${q.category}, Difficulty: ${q.difficulty}`);
          });
        }
      } else {
        console.log(`❌ Interview generation failed: ${interviewData.error || interviewData.message}`);
      }
    } catch (error) {
      console.log(`❌ Interview generation error: ${error.message}`);
    }
  }

  console.log('\n✅ END-TO-END TEST COMPLETE!');
}

testFullWorkflow().catch(console.error);