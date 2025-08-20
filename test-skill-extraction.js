#!/usr/bin/env node

/**
 * Quick manual test for skill extraction contamination fixes
 */

// Use require for CommonJS
const { SkillProcessor } = require('./server/lib/skill-processor');

const processor = SkillProcessor.getInstance();

async function testSkillExtraction() {
  console.log("🧪 TESTING SKILL EXTRACTION FIXES");
  console.log("================================\n");

  const testCases = [
    {
      name: "HR Job (should NOT extract technical skills)",
      text: "Looking for HR Manager with training experience and details about employee relations",
      domain: "hr",
      shouldNotContain: ["TypeScript", "Machine Learning", "AI"],
      shouldContain: ["training"]
    },
    {
      name: "Tech Job with substring contamination",
      text: "Software Developer with AI experience in machine learning details",
      domain: "technology", 
      shouldContain: ["Machine Learning"],
      shouldNotContain: [] // This should work correctly
    },
    {
      name: "Sales Job (test PM and TS aliases)",
      text: "Sales Manager with PM experience in training programs",
      domain: "sales",
      shouldNotContain: ["TypeScript", "Project Management"], // PM should not match Project Management
      shouldContain: ["training"]
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Text: ${testCase.text}`);
    console.log(`   Domain: ${testCase.domain}`);
    
    try {
      const skills = await processor.extractSkills(testCase.text, testCase.domain);
      const skillNames = skills.map(s => s.normalized);
      
      console.log(`   ✅ Extracted: [${skillNames.join(', ')}]`);
      
      // Check for contamination
      const contamination = testCase.shouldNotContain.filter(skill => 
        skillNames.some(s => s.toLowerCase().includes(skill.toLowerCase()))
      );
      
      const missing = testCase.shouldContain.filter(skill => 
        !skillNames.some(s => s.toLowerCase().includes(skill.toLowerCase()))
      );
      
      if (contamination.length > 0) {
        console.log(`   ❌ CONTAMINATION DETECTED: ${contamination.join(', ')}`);
      } else {
        console.log(`   ✅ No contamination detected`);
      }
      
      if (missing.length > 0) {
        console.log(`   ⚠️  Missing expected skills: ${missing.join(', ')}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }
}

testSkillExtraction().catch(console.error);