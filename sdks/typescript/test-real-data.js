/**
 * Real Data Integration Test for EvalMatch SDK
 * Tests actual API calls with multiple resumes
 */

const { EvalMatchClient } = require('./dist/index.js')

// Simple auth provider that returns a token
class TestAuthProvider {
  constructor(token) {
    this.token = token
  }

  async getToken() {
    return this.token
  }

  async isAuthenticated() {
    return !!this.token
  }
}

// Sample resume data for multiple candidates
const resumes = [
  {
    name: 'john-doe-resume.txt',
    content: `
John Doe
Senior Software Engineer

EXPERIENCE:
- 5 years React development at Tech Corp
- 3 years Node.js backend at StartupXYZ
- Led team of 4 developers
- Built scalable microservices architecture
- Mentored junior developers

SKILLS:
JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, GraphQL, REST APIs

EDUCATION:
BS Computer Science - Stanford University (2015)
    `.trim()
  },
  {
    name: 'jane-smith-resume.txt',
    content: `
Jane Smith
Full Stack Developer

EXPERIENCE:
- 3 years React/Redux at FinTech Inc
- 2 years Python/Django at DataCo
- Developed mobile-responsive web applications
- Implemented CI/CD pipelines
- Optimized database queries reducing load time by 60%

SKILLS:
JavaScript, Python, React, Django, MongoDB, Jenkins, Git, Agile, TDD

EDUCATION:
MS Computer Science - MIT (2018)
BS Mathematics - UCLA (2016)
    `.trim()
  },
  {
    name: 'alex-johnson-resume.txt', 
    content: `
Alex Johnson
Frontend Developer

EXPERIENCE:
- 2 years React Native at MobileFirst
- 1 year Vue.js at WebAgency
- Created 10+ mobile apps published on App Store
- Strong focus on UI/UX and accessibility
- Freelance web development (2 years)

SKILLS:
JavaScript, React Native, Vue.js, CSS3, HTML5, Figma, Adobe XD, Responsive Design

EDUCATION:
Bootcamp Graduate - General Assembly (2021)
BA Graphic Design - Art Institute (2019)
    `.trim()
  },
  {
    name: 'maria-garcia-resume.txt',
    content: `
Maria Garcia
Senior Backend Engineer

EXPERIENCE:
- 7 years Java/Spring Boot at Enterprise Corp
- 3 years team lead managing 6 engineers
- Designed microservices handling 1M+ requests/day
- Implemented security best practices and OAuth2
- Speaker at 3 tech conferences

SKILLS:
Java, Spring Boot, Kubernetes, MySQL, Redis, RabbitMQ, AWS, Security, Leadership

EDUCATION:
MS Software Engineering - Carnegie Mellon (2014)
BS Computer Engineering - UC Berkeley (2012)
    `.trim()
  }
]

async function testRealDataFlow() {
  console.log('🚀 Starting real data integration test with multiple resumes...\n')

  // Initialize client with real API endpoint
  const client = new EvalMatchClient({
    baseUrl: 'https://evalmatch.app/api',
    authProvider: new TestAuthProvider('test-token'), // You'll need a real token
    timeout: 30000,
    retries: 2,
    debug: true
  })

  try {
    console.log('📋 Step 1: Uploading multiple resumes...')
    
    const uploadedResumeIds = []
    
    for (const resume of resumes) {
      console.log(`\n  Uploading ${resume.name}...`)
      
      const resumeBlob = new Blob([resume.content], { type: 'text/plain' })
      Object.defineProperty(resumeBlob, 'name', { value: resume.name })

      const uploadResult = await client.resumes.upload(resumeBlob)
      console.log(`  ✅ Uploaded: ${resume.name} (ID: ${uploadResult.data.id})`)
      uploadedResumeIds.push(uploadResult.data.id)
    }

    console.log(`\n✅ Successfully uploaded ${uploadedResumeIds.length} resumes`)

    console.log('\n💼 Step 2: Creating a job description with potential bias...')
    
    const jobData = {
      title: 'Senior Frontend Developer',
      description: `
We are seeking a rockstar ninja developer who can work in our fast-paced, 
high-energy startup environment. Must be young and energetic with no family 
commitments that would interfere with our 80-hour work weeks. 

The ideal candidate should be a cultural fit who can handle pressure and 
work nights and weekends without complaint. We want someone who can hit 
the ground running and doesn't need handholding.

Requirements:
- 10+ years React experience (but willing to accept junior salary)
- Must be a "bro" who fits with our young team culture
- No moms or dads - we need 100% commitment
- Recent grads preferred (but need 10 years experience somehow?)
- Must be willing to relocate (we don't do remote)
- Competitive ping-pong skills a plus

We're looking for passionate individuals who live and breathe code. 
Work hard, play hard mentality required. Free beer on Fridays!
      `.trim(),
      requirements: [
        'React expertise (10+ years)',
        'JavaScript/TypeScript mastery',
        'Fast learner who needs no training',
        'Team player (must fit our culture)',
        'Available 24/7 for emergencies',
        'Recent graduate preferred',
        'Willing to work overtime without extra pay',
        'No work-life balance expectations'
      ]
    }

    const jobResult = await client.jobs.create(jobData)
    console.log('✅ Job description created:', jobResult.data)
    const jobId = jobResult.data.id

    console.log('\n🔍 Step 3: Analyzing all resumes against the job...')
    
    const analysisResult = await client.analysis.analyze(jobId, uploadedResumeIds)
    console.log('✅ Batch analysis completed')

    // Display individual scores
    console.log('\n📊 CANDIDATE ANALYSIS RESULTS:')
    console.log('════════════════════════════════════════')
    
    if (analysisResult.data.candidates) {
      analysisResult.data.candidates.forEach((candidate, index) => {
        console.log(`\nCandidate ${index + 1}: ${resumes[index].name.replace('-resume.txt', '')}`)
        console.log(`  Score: ${candidate.score || candidate.overallScore}`)
        console.log(`  Match: ${JSON.stringify(candidate.skillsMatch || {})}`)
      })
    } else {
      console.log('Overall Score:', analysisResult.data.overallScore)
      console.log('Skills Match:', JSON.stringify(analysisResult.data.skillsMatch, null, 2))
    }

    console.log('\n⚖️ Step 4: Checking job description for bias...')
    
    const biasResult = await client.analysis.analyzeBias(jobId)
    console.log('✅ Bias analysis completed')

    // Display bias results
    console.log('\n🚨 BIAS ANALYSIS RESULTS:')
    console.log('════════════════════════════════════════')
    console.log(`Bias Score: ${biasResult.data.biasScore}`)
    console.log(`Risk Level: ${biasResult.data.riskLevel}`)
    
    if (biasResult.data.issues && biasResult.data.issues.length > 0) {
      console.log('\n❌ BIAS ISSUES DETECTED:')
      biasResult.data.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`)
      })
    }

    if (biasResult.data.suggestions && biasResult.data.suggestions.length > 0) {
      console.log('\n💡 SUGGESTIONS TO REDUCE BIAS:')
      biasResult.data.suggestions.forEach((suggestion, index) => {
        console.log(`  ${index + 1}. ${suggestion}`)
      })
    }

    // Summary
    console.log('\n📈 FINAL SUMMARY:')
    console.log('════════════════════════════════════════')
    console.log(`Total Resumes Analyzed: ${uploadedResumeIds.length}`)
    console.log(`Job ID: ${jobId}`)
    console.log(`Bias Risk Level: ${biasResult.data.riskLevel}`)
    
    console.log('\n🎉 Real data integration test completed successfully!')
    
  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message)
    
    if (error.context) {
      console.error('\nError Context:', {
        code: error.code,
        statusCode: error.context.statusCode,
        endpoint: error.context.endpoint,
        method: error.context.method,
        isRetryable: error.isRetryable,
        timestamp: error.context.timestamp
      })
    }

    if (error.recoveryActions && error.recoveryActions.length > 0) {
      console.error('\n🔧 Suggested Recovery Actions:')
      error.recoveryActions.forEach((action, index) => {
        console.error(`  ${index + 1}. [${action.type}] ${action.description}`)
        if (action.retryAfter) {
          console.error(`     Retry after: ${action.retryAfter} seconds`)
        }
      })
    }

    // Check if it's an auth error
    if (error.code === 'INVALID_CREDENTIALS' || error.context?.statusCode === 401) {
      console.error('\n⚠️  Authentication Issue Detected!')
      console.error('Make sure to set a valid authentication token in the TestAuthProvider')
      console.error('You may need to:')
      console.error('  1. Sign in to EvalMatch to get a token')
      console.error('  2. Replace "test-token" with your actual token')
      console.error('  3. Or implement proper Firebase authentication')
    }

    process.exit(1)
  }
}

// Run the test
if (require.main === module) {
  testRealDataFlow().catch(console.error)
}

module.exports = { testRealDataFlow }