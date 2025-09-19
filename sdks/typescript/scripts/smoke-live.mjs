#!/usr/bin/env node

/**
 * Live SDK Smoke Test Script
 * 
 * Tests the built SDK against production EvalMatch API to validate:
 * - Token authentication and status
 * - User profile access
 * - Credits balance and reachability
 * - Resume listing
 * - Text analysis functionality
 * 
 * Usage:
 *   node scripts/smoke-live.mjs --token YOUR_TOKEN [--base https://evalmatch.app/api]
 * 
 * Prerequisites:
 *   - npm run build (to generate dist/index.mjs)
 *   - Valid EvalMatch API token
 */

import { EvalMatchClient } from '../dist/index.mjs'
import { parseArgs } from 'node:util'

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    token: { type: 'string', short: 't' },
    base: { type: 'string', short: 'b', default: 'https://evalmatch.app/api' },
    help: { type: 'boolean', short: 'h' }
  }
})

if (args.help || !args.token) {
  console.log(`
Live SDK Smoke Test

Usage:
  node scripts/smoke-live.mjs --token YOUR_TOKEN [--base https://evalmatch.app/api]

Options:
  -t, --token   EvalMatch API token (required)
  -b, --base    Base URL for API (default: https://evalmatch.app/api)
  -h, --help    Show this help

Example:
  node scripts/smoke-live.mjs --token em_ac0c99756992deba95a8de27e50fa2a7_4e633ceeaee77e843f73e0103fc3f35f3cecab93e15370397d120fb4ea9e1277
`)
  process.exit(args.help ? 0 : 1)
}

// Initialize client with API token authentication
const client = new EvalMatchClient({
  baseUrl: args.base,
  authProvider: {
    getToken: async () => args.token,
    isAuthenticated: async () => true
  },
  timeout: 10000
})

/**
 * Utility to run a test with error handling and formatting
 */
async function runTest(name, testFn) {
  process.stdout.write(`🔍 ${name}... `)
  try {
    const result = await testFn()
    console.log('✅')
    return result
  } catch (error) {
    console.log('❌')
    console.log(`   Error: ${error.message}`)
    if (error.status) {
      console.log(`   Status: ${error.status}`)
    }
    return null
  }
}

/**
 * Format object for display, limiting depth and length
 */
function formatResult(obj, maxLength = 100) {
  const str = JSON.stringify(obj, null, 2)
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

async function main() {
  console.log('🚀 EvalMatch SDK Live Smoke Test')
  console.log(`📍 Base URL: ${args.base}`)
  console.log(`🔑 Token: ${args.token.substring(0, 20)}...`)
  console.log('')

  // Test 1: Token Status (token-only endpoint)
  const tokenStatus = await runTest('Token Status', async () => {
    const status = await client.tokens.statusByToken()
    
    console.log(`   Token ID: ${status.token.id}`)
    console.log(`   Name: ${status.token.name}`)
    console.log(`   Status: ${status.token.status}`)
    console.log(`   Permissions: ${status.token.permissions.join(', ')}`)
    console.log(`   Usage Today: ${status.usage.requestsToday}`)
    console.log(`   Usage This Month: ${status.usage.requestsThisMonth}`)
    
    return status
  })

  // Test 2: User Profile
  const userProfile = await runTest('User Profile', async () => {
    const profile = await client.user.getProfile()
    
    console.log(`   User ID: ${profile.id}`)
    console.log(`   Tier: ${profile.tier || 'N/A'}`)
    if (profile.creditSummary) {
      console.log(`   Credits Available: ${profile.creditSummary.available}`)
    }
    
    return profile
  })

  // Test 3: Credits Balance
  const creditsBalance = await runTest('Credits Balance', async () => {
    const balance = await client.credits.getBalance()
    
    console.log(`   Available: ${balance.available || balance.credits}`)
    console.log(`   Total Purchased: ${balance.totalPurchased || 'N/A'}`)
    console.log(`   Total Used: ${balance.totalUsed || 'N/A'}`)
    console.log(`   Tier: ${balance.tier || 'N/A'}`)
    
    return balance
  })

  // Test 4: Credits Reachability (history and packages)
  await runTest('Credits History', async () => {
    const history = await client.credits.getHistory()
    console.log(`   Transaction count: ${Array.isArray(history) ? history.length : 'N/A'}`)
    return history
  })

  await runTest('Credits Packages', async () => {
    const packages = await client.credits.getPackages()
    console.log(`   Available packages: ${Array.isArray(packages) ? packages.length : 'N/A'}`)
    return packages
  })

  // Test 5: Resume Listing
  const resumes = await runTest('Resume List', async () => {
    const resumeList = await client.resumes.list()
    
    console.log(`   Resume count: ${Array.isArray(resumeList) ? resumeList.length : 'N/A'}`)
    if (Array.isArray(resumeList) && resumeList.length > 0) {
      console.log(`   First resume ID: ${resumeList[0].id}`)
    }
    
    return resumeList
  })

  // Test 6: Text Analysis (core functionality)
  const analysisResult = await runTest('Text Analysis', async () => {
    const sampleResume = `John Doe
Senior React Developer

Experience:
- 5 years React development
- JavaScript, TypeScript expertise
- Node.js backend experience
- AWS cloud deployment
- Git version control
- Agile methodologies`

    const sampleJob = `Senior Frontend Developer

Requirements:
- React expertise (3+ years)
- TypeScript proficiency
- Modern JavaScript (ES6+)
- RESTful API integration
- Version control (Git)
- Responsive design skills`

    const analysis = await client.analysis.analyzeText({
      resumeText: sampleResume,
      jobDescriptionText: sampleJob
    })
    
    console.log(`   Match Percentage: ${analysis.matchPercentage}%`)
    console.log(`   Matched Skills: ${analysis.matchedSkills?.length || 0} skills`)
    console.log(`   Missing Skills: ${analysis.missingSkills?.length || 0} skills`)
    console.log(`   Confidence: ${analysis.confidenceLevel}`)
    
    if (analysis.matchedSkills?.length > 0) {
      console.log(`   Top Matches: ${analysis.matchedSkills.slice(0, 3).join(', ')}`)
    }
    
    return analysis
  })

  // Summary
  console.log('')
  console.log('📊 Smoke Test Summary:')
  const tests = [
    { name: 'Token Status', result: tokenStatus },
    { name: 'User Profile', result: userProfile },
    { name: 'Credits Balance', result: creditsBalance },
    { name: 'Text Analysis', result: analysisResult }
  ]

  const passed = tests.filter(t => t.result !== null).length
  const total = tests.length

  console.log(`   ✅ Passed: ${passed}/${total}`)
  
  if (passed === total) {
    console.log('🎉 All smoke tests passed! SDK is working correctly.')
    process.exit(0)
  } else {
    console.log('⚠️  Some tests failed. Check API connectivity and token permissions.')
    process.exit(1)
  }
}

// Handle uncaught errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message)
  process.exit(1)
})

// Run the smoke test
main().catch((error) => {
  console.error('❌ Smoke test failed:', error.message)
  process.exit(1)
})