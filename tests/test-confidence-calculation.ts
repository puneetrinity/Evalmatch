/**
 * Test suite for confidence score calculation
 */

import { calculateConfidenceLevel } from '../server/lib/consistent-scoring';

interface TestCase {
  name: string;
  resumeLength: number;
  jobDescLength: number;
  skillMatches: number;
  expected: 'low' | 'medium' | 'high';
}

const testCases: TestCase[] = [
  // High confidence cases
  {
    name: 'High confidence - comprehensive data',
    resumeLength: 1500,
    jobDescLength: 800,
    skillMatches: 12,
    expected: 'high'
  },
  {
    name: 'High confidence - good balance',
    resumeLength: 1200,
    jobDescLength: 600,
    skillMatches: 8,
    expected: 'high'
  },
  
  // Medium confidence cases
  {
    name: 'Medium confidence - adequate data',
    resumeLength: 800,
    jobDescLength: 400,
    skillMatches: 5,
    expected: 'medium'
  },
  {
    name: 'Medium confidence - long resume, short job desc',
    resumeLength: 1500,
    jobDescLength: 200,
    skillMatches: 6,
    expected: 'medium'
  },
  
  // Low confidence cases
  {
    name: 'Low confidence - minimal data',
    resumeLength: 300,
    jobDescLength: 150,
    skillMatches: 2,
    expected: 'low'
  },
  {
    name: 'Low confidence - very short texts',
    resumeLength: 100,
    jobDescLength: 50,
    skillMatches: 1,
    expected: 'low'
  },
  {
    name: 'Low confidence - no skill matches',
    resumeLength: 800,
    jobDescLength: 400,
    skillMatches: 0,
    expected: 'low'
  }
];

function runConfidenceTests(): void {
  console.log('🧪 Running Confidence Score Calculation Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    try {
      const result = calculateConfidenceLevel(
        testCase.resumeLength,
        testCase.jobDescLength,
        testCase.skillMatches
      );
      
      if (result === testCase.expected) {
        console.log(`✅ ${testCase.name}`);
        console.log(`   Input: resume=${testCase.resumeLength}, job=${testCase.jobDescLength}, skills=${testCase.skillMatches}`);
        console.log(`   Result: ${result} (expected: ${testCase.expected})\n`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   Input: resume=${testCase.resumeLength}, job=${testCase.jobDescLength}, skills=${testCase.skillMatches}`);
        console.log(`   Result: ${result}, Expected: ${testCase.expected}\n`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${testCase.name} - Error: ${error.message}\n`);
      failed++;
    }
  }
  
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All confidence calculation tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Review the confidence calculation logic.');
  }
}

// Test edge cases
function testEdgeCases(): void {
  console.log('\n🔍 Testing Edge Cases\n');
  
  const edgeCases = [
    { name: 'Zero lengths', resume: 0, job: 0, skills: 0 },
    { name: 'Negative values', resume: -100, job: -50, skills: -5 },
    { name: 'Very large values', resume: 10000, job: 5000, skills: 100 },
    { name: 'Mixed valid/invalid', resume: 1000, job: 0, skills: 5 }
  ];
  
  for (const edge of edgeCases) {
    try {
      const result = calculateConfidenceLevel(edge.resume, edge.job, edge.skills);
      console.log(`✅ ${edge.name}: ${result}`);
    } catch (error) {
      console.log(`❌ ${edge.name}: Error - ${error.message}`);
    }
  }
}

// Test confidence score distribution
function testDistribution(): void {
  console.log('\n📈 Testing Confidence Score Distribution\n');
  
  const results = { low: 0, medium: 0, high: 0 };
  const totalTests = 100;
  
  for (let i = 0; i < totalTests; i++) {
    const resumeLength = Math.random() * 2000;
    const jobLength = Math.random() * 1000;
    const skillMatches = Math.floor(Math.random() * 15);
    
    const confidence = calculateConfidenceLevel(resumeLength, jobLength, skillMatches);
    results[confidence]++;
  }
  
  console.log('Distribution across 100 random inputs:');
  console.log(`High confidence: ${results.high}%`);
  console.log(`Medium confidence: ${results.medium}%`);
  console.log(`Low confidence: ${results.low}%`);
  
  // Check for reasonable distribution
  if (results.low > 0 && results.medium > 0 && results.high > 0) {
    console.log('✅ Good distribution across all confidence levels');
  } else {
    console.log('⚠️  Skewed distribution detected');
  }
}

// Run all tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runConfidenceTests();
  testEdgeCases();
  testDistribution();
}

export { runConfidenceTests, testEdgeCases, testDistribution };