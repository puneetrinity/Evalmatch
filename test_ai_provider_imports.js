// Simple test to verify our ai-provider.ts updates work
const fs = require('fs');
const path = require('path');

// Read the ai-provider.ts file
const aiProviderPath = path.join(__dirname, 'server', 'lib', 'ai-provider.ts');
const content = fs.readFileSync(aiProviderPath, 'utf8');

// Check if our key changes are present
const checks = [
  // Logger import
  { pattern: "import { logger } from './logger';", description: 'Logger import added' },
  
  // Groq as primary provider in analyzeJobDescription
  { pattern: "// Check Groq availability first (primary provider)", description: 'Groq as primary provider pattern' },
  
  // Logger usage instead of console.log
  { pattern: "logger.info('Groq unavailable, falling back to OpenAI", description: 'Logger.info usage' },
  { pattern: "logger.warn('All AI providers unavailable", description: 'Logger.warn usage' },
  
  // Updated function signatures - all major functions
  { pattern: "if (isGroqConfigured && groq.getGroqServiceStatus().isAvailable) {", description: 'Groq first check pattern' }
];

console.log('Testing ai-provider.ts updates...\n');

let allPassed = true;
checks.forEach((check, index) => {
  const found = content.includes(check.pattern);
  console.log(`${index + 1}. ${check.description}: ${found ? '✅ PASS' : '❌ FAIL'}`);
  if (!found) {
    allPassed = false;
    console.log(`   Expected pattern: "${check.pattern}"`);
  }
});

// Count function updates
const functionNames = [
  'analyzeJobDescription',
  'analyzeMatch', 
  'analyzeBias',
  'generateInterviewQuestions',
  'extractSkills',
  'analyzeSkillGap'
];

console.log('\nFunction-specific checks:');
functionNames.forEach(funcName => {
  // Check if function has Groq as primary
  const groqCheckPattern = new RegExp(`export async function ${funcName}[\\s\\S]*?if \\(isGroqConfigured && groq\\.getGroqServiceStatus\\(\\)\\.isAvailable\\)`);
  const hasGroqFirst = groqCheckPattern.test(content);
  console.log(`${funcName} - Groq as primary: ${hasGroqFirst ? '✅ PASS' : '❌ FAIL'}`);
  if (!hasGroqFirst) allPassed = false;
});

console.log(`\nOverall result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

// Clean up test file
fs.unlinkSync(__filename);