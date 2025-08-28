#!/usr/bin/env node

/**
 * Quick manual test for skill extraction contamination fixes
 * Run with: node test-skill-extraction.mjs
 */

// Since this is an ES module, we need dynamic import
async function runTest() {
  console.log("🧪 TESTING SKILL EXTRACTION FIXES");
  console.log("================================\n");

  try {
    // Dynamic import of the TypeScript module
    const { SKILL_DICTIONARY } = await import('./server/lib/skill-processor.js');
    
    console.log("📚 Loaded skill dictionary with categories:");
    for (const [category, skills] of Object.entries(SKILL_DICTIONARY)) {
      const skillCount = Object.keys(skills).length;
      console.log(`   - ${category}: ${skillCount} skills`);
      
      // Show first few skills in each category
      const skillNames = Object.keys(skills).slice(0, 3);
      console.log(`     Examples: ${skillNames.join(', ')}${skillCount > 3 ? '...' : ''}`);
    }
    
    console.log("\n🔍 Testing problematic aliases that were removed:");
    
    // Check if problematic aliases were removed
    const checkAliases = [
      { skill: 'TypeScript', badAlias: 'TS', category: 'technical' },
      { skill: 'Machine Learning', badAlias: 'AI', category: 'technical' },
      { skill: 'Project Management', badAlias: 'PM', category: 'soft' }
    ];
    
    checkAliases.forEach(({ skill, badAlias, category }) => {
      const skillData = SKILL_DICTIONARY[category]?.[skill];
      if (skillData) {
        const hasProblematicAlias = skillData.aliases.includes(badAlias);
        console.log(`   ${skill}: ${hasProblematicAlias ? '❌ Still has' : '✅ Removed'} "${badAlias}" alias`);
        console.log(`     Current aliases: [${skillData.aliases.join(', ')}]`);
      }
    });
    
    console.log("\n🧮 Testing word boundary regex logic:");
    
    // Test word boundary logic manually
    const testTexts = [
      "I have training experience in AI development",
      "Looking for PM with details about projects", 
      "Developer with TS experience and training",
      "Machine learning expert with AI expertise"
    ];
    
    testTexts.forEach(text => {
      console.log(`\n   Text: "${text}"`);
      
      // Test problematic short aliases
      const shortAliases = ['AI', 'PM', 'TS'];
      shortAliases.forEach(alias => {
        const includesMatch = text.toLowerCase().includes(alias.toLowerCase());
        const regexPattern = new RegExp(`\\b${alias.toLowerCase()}\\b`, 'i');
        const regexMatch = regexPattern.test(text);
        
        console.log(`     "${alias}": includes()=${includesMatch}, regex=${regexMatch} ${includesMatch !== regexMatch ? '👍 FIXED' : ''}`);
      });
    });
    
  } catch (error) {
    console.error("❌ Error loading skill processor:", error.message);
    console.error("   Make sure the TypeScript files are compiled first");
  }
}

runTest().catch(console.error);