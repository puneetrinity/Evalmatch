#!/usr/bin/env node

/**
 * Static analysis of the skill processor fixes
 * This analyzes the source code directly without importing the module
 */

import fs from 'fs';
import path from 'path';

console.log("🔍 COMPREHENSIVE CODE REVIEW: SKILL PROCESSOR CONTAMINATION FIXES");
console.log("================================================================\n");

const skillProcessorPath = './server/lib/skill-processor.ts';
const sourceCode = fs.readFileSync(skillProcessorPath, 'utf8');
const lines = sourceCode.split('\n');

// 1. ANALYZE ALIAS CHANGES
console.log("1. ✅ ALIAS CONTAMINATION FIXES");
console.log("──────────────────────────────");

const problematicAliases = [
  { skill: 'TypeScript', oldAlias: 'TS', line: 'aliases: [\'TS\']' },
  { skill: 'Machine Learning', oldAlias: 'AI', line: 'aliases: [\'ML\', \'AI\'' },
  { skill: 'Project Management', oldAlias: 'PM', line: 'aliases: [\'PM\'' }
];

problematicAliases.forEach(({ skill, oldAlias, line }) => {
  const hasOldAlias = sourceCode.includes(line);
  const newAliasPattern = new RegExp(`'${skill}'[\\s\\S]*?aliases:\\s*\\[([^\\]]+)\\]`);
  const match = sourceCode.match(newAliasPattern);
  
  console.log(`   ${skill}:`);
  console.log(`     ❌ Old problematic alias "${oldAlias}": ${hasOldAlias ? 'STILL PRESENT' : 'REMOVED ✅'}`);
  
  if (match) {
    const currentAliases = match[1].split(',').map(a => a.trim().replace(/'/g, ''));
    console.log(`     📝 Current aliases: [${currentAliases.join(', ')}]`);
    const hasProblematic = currentAliases.some(alias => 
      [oldAlias, 'AI', 'PM', 'TS'].includes(alias)
    );
    if (hasProblematic) {
      console.log(`     ⚠️  WARNING: Still contains short problematic aliases!`);
    }
  }
  console.log('');
});

// 2. ANALYZE WORD BOUNDARY IMPLEMENTATION
console.log("\n2. 🎯 WORD BOUNDARY REGEX IMPLEMENTATION");
console.log("───────────────────────────────────────");

const regexImplementation = {
  escapeRegex: sourceCode.includes('escapeRegex(text: string): string'),
  wordBoundaryMain: sourceCode.includes('\\\\b${this.escapeRegex(skillName.toLowerCase())}\\\\b'),
  wordBoundaryAlias: sourceCode.includes('\\\\b${this.escapeRegex(alias.toLowerCase())}\\\\b'),
  fallbackLogic: sourceCode.includes('// Fallback for regex issues'),
  tryBlockSkill: sourceCode.includes('try {') && sourceCode.includes('skillRegex.test'),
  tryBlockAlias: sourceCode.includes('aliasRegex.test')
};

Object.entries(regexImplementation).forEach(([feature, implemented]) => {
  console.log(`   ${implemented ? '✅' : '❌'} ${feature}: ${implemented ? 'IMPLEMENTED' : 'MISSING'}`);
});

// 3. ANALYZE DOMAIN FILTERING
console.log("\n3. 🏢 DOMAIN FILTERING IMPLEMENTATION");
console.log("────────────────────────────────────");

const domainFiltering = {
  shouldSkipCategory: sourceCode.includes('shouldSkipCategory(category: string, domain: string)'),
  domainParameter: sourceCode.includes('extractLocalSkills(text: string, domain: string = \'auto\')'),
  techDomainLogic: sourceCode.includes('case \'technology\':'),
  pharmaDomainLogic: sourceCode.includes('case \'pharmaceutical\':'),
  defaultDomainLogic: sourceCode.includes('default:') && sourceCode.includes('Skip programming skills for HR/sales'),
  categorySkipping: sourceCode.includes('if (this.shouldSkipCategory(category, domain))')
};

Object.entries(domainFiltering).forEach(([feature, implemented]) => {
  console.log(`   ${implemented ? '✅' : '❌'} ${feature}: ${implemented ? 'IMPLEMENTED' : 'MISSING'}`);
});

// 4. ANALYZE SECURITY AND ERROR HANDLING
console.log("\n4. 🛡️ SECURITY & ERROR HANDLING");
console.log("──────────────────────────────");

const securityFeatures = {
  regexEscaping: sourceCode.includes('text.replace(/[.*+?^${}()|[\\]\\\\]/g, \'\\\\$&\')'),
  errorHandling: sourceCode.includes('catch (error)') && sourceCode.includes('Regex failed'),
  fallbackMatching: sourceCode.includes('normalizedText.includes(` ${'),
  debugLogging: sourceCode.includes('logger.debug')
};

Object.entries(securityFeatures).forEach(([feature, implemented]) => {
  console.log(`   ${implemented ? '✅' : '❌'} ${feature}: ${implemented ? 'IMPLEMENTED' : 'MISSING'}`);
});

// 5. ANALYZE INTEGRATION POINTS
console.log("\n5. 🔗 INTEGRATION & BACKWARD COMPATIBILITY");
console.log("─────────────────────────────────────────");

const integration = {
  signatureChange: sourceCode.includes('extractLocalSkills(text: string, domain: string = \'auto\')'),
  domainPassed: sourceCode.includes('this.extractLocalSkills(text, domain)'),
  escoIntegration: sourceCode.includes('extractESCOSkills(text, domain)'),
  contaminationCheck: sourceCode.includes('detectContamination(skill.normalized, domain)')
};

Object.entries(integration).forEach(([feature, implemented]) => {
  console.log(`   ${implemented ? '✅' : '❌'} ${feature}: ${implemented ? 'IMPLEMENTED' : 'MISSING'}`);
});

// 6. PERFORMANCE ANALYSIS
console.log("\n6. ⚡ PERFORMANCE IMPACT ANALYSIS");
console.log("────────────────────────────────");

// Count regex operations per skill extraction
const skillDictionaryMatch = sourceCode.match(/SKILL_DICTIONARY = {[\s\S]*?^};/m);
if (skillDictionaryMatch) {
  const skillDictContent = skillDictionaryMatch[0];
  const skillsCount = (skillDictContent.match(/'[^']*':\s*{/g) || []).length;
  const aliasesCount = (skillDictContent.match(/aliases:\s*\[[^\]]*\]/g) || []).length;
  
  console.log(`   📊 Skill dictionary size: ${skillsCount} skills`);
  console.log(`   📊 Total aliases: ${aliasesCount} alias arrays`);
  
  // Estimate regex operations per extraction
  const avgAliases = 3; // estimated average aliases per skill
  const regexOpsPerText = skillsCount * (1 + avgAliases); // main skill + aliases
  console.log(`   🔍 Estimated regex operations per text: ~${regexOpsPerText}`);
  
  if (regexOpsPerText > 1000) {
    console.log(`   ⚠️  WARNING: High regex operation count may impact performance`);
  } else {
    console.log(`   ✅ Regex operation count appears reasonable`);
  }
}

// 7. CODE QUALITY ASSESSMENT
console.log("\n7. 📝 CODE QUALITY ASSESSMENT");
console.log("────────────────────────────");

const qualityMetrics = {
  hasComments: (sourceCode.match(/\/\*\*[\s\S]*?\*\//g) || []).length > 5,
  hasTypeAnnotations: sourceCode.includes(': string') && sourceCode.includes(': boolean'),
  hasErrorTypes: sourceCode.includes('catch (error)'),
  hasLogging: sourceCode.includes('logger.debug') && sourceCode.includes('logger.error'),
  hasConstants: sourceCode.includes('const '),
  hasFunctionDocumentation: sourceCode.includes('/**') && sourceCode.includes('* @param')
};

Object.entries(qualityMetrics).forEach(([metric, passes]) => {
  console.log(`   ${passes ? '✅' : '❌'} ${metric}: ${passes ? 'GOOD' : 'NEEDS IMPROVEMENT'}`);
});

console.log("\n8. 🎯 SUMMARY AND RECOMMENDATIONS");
console.log("─────────────────────────────────");

// Calculate overall health score
const allChecks = [
  ...Object.values(regexImplementation),
  ...Object.values(domainFiltering),
  ...Object.values(securityFeatures),
  ...Object.values(integration),
  ...Object.values(qualityMetrics)
];

const passedChecks = allChecks.filter(Boolean).length;
const totalChecks = allChecks.length;
const healthScore = Math.round((passedChecks / totalChecks) * 100);

console.log(`   📊 Implementation Health Score: ${healthScore}% (${passedChecks}/${totalChecks} checks passed)`);

if (healthScore >= 90) {
  console.log(`   ✅ EXCELLENT: Implementation is comprehensive and robust`);
} else if (healthScore >= 75) {
  console.log(`   👍 GOOD: Implementation is solid with minor areas for improvement`);
} else if (healthScore >= 60) {
  console.log(`   ⚠️  MODERATE: Implementation has several issues that should be addressed`);
} else {
  console.log(`   ❌ POOR: Implementation has significant issues requiring immediate attention`);
}

console.log(`\n🔍 Analysis complete. Review detailed findings above.`);