#!/usr/bin/env tsx
/**
 * Quick test to verify basic embedding functionality
 */

import { logger } from './server/lib/logger';

async function quickTest() {
  console.log('🚀 Quick Embedding Test Starting...\n');
  
  try {
    // Test 1: Import check
    console.log('1. Testing imports...');
    const { generateEmbedding, calculateSemanticSimilarityFromEmbeddings } = await import('./server/lib/embeddings');
    const { createResumeService } = await import('./server/services/resume-service');
    const { createJobService } = await import('./server/services/job-service');
    console.log('✅ All imports successful\n');
    
    // Test 2: Basic embedding generation
    console.log('2. Testing embedding generation...');
    const testText = 'JavaScript React Node.js development';
    const embedding = await generateEmbedding(testText);
    
    if (!embedding || embedding.length !== 384) {
      throw new Error(`Expected 384-dimensional embedding, got ${embedding?.length || 'null'}`);
    }
    
    console.log(`✅ Embedding generated: ${embedding.length} dimensions`);
    console.log(`   Sample values: [${embedding.slice(0, 3).map(n => n.toFixed(3)).join(', ')}, ...]`);
    console.log();
    
    // Test 3: Similarity calculation
    console.log('3. Testing similarity calculation...');
    const text1 = 'JavaScript React development';
    const text2 = 'React JavaScript coding';
    const text3 = 'Python Django development';
    
    const [emb1, emb2, emb3] = await Promise.all([
      generateEmbedding(text1),
      generateEmbedding(text2), 
      generateEmbedding(text3)
    ]);
    
    const sim12 = calculateSemanticSimilarityFromEmbeddings(emb1, emb2);
    const sim13 = calculateSemanticSimilarityFromEmbeddings(emb1, emb3);
    
    console.log(`✅ Similarity JS-React vs JS-React: ${sim12.toFixed(1)}%`);
    console.log(`   Similarity JS-React vs Python:   ${sim13.toFixed(1)}%`);
    console.log(`   ✅ Similar texts have higher similarity: ${sim12 > sim13 ? 'YES' : 'NO'}`);
    console.log();
    
    // Test 4: Service instantiation
    console.log('4. Testing service instantiation...');
    const resumeService = createResumeService();
    const jobService = createJobService();
    console.log('✅ Resume and Job services created successfully\n');
    
    // Test 5: Check enhanced scoring function
    console.log('5. Testing enhanced scoring import...');
    const { calculateEnhancedMatchWithESCO } = await import('./server/lib/enhanced-scoring');
    console.log('✅ Enhanced scoring function imported successfully\n');
    
    console.log('🎉 QUICK TEST PASSED!');
    console.log('   All core embedding functionality is working.');
    console.log('   Run the full test with: npx tsx test-embeddings.ts');
    
  } catch (error) {
    console.error('❌ QUICK TEST FAILED:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
quickTest();