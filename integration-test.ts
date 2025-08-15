#!/usr/bin/env tsx
/**
 * Integration test to verify the complete embedding pipeline works
 */

import { logger } from './server/lib/logger';
import { generateEmbedding, calculateSemanticSimilarityFromEmbeddings } from './server/lib/embeddings';
import { calculateEnhancedMatchWithESCO } from './server/lib/enhanced-scoring';

async function integrationTest() {
  console.log('🔄 Integration Test: Complete Embedding Pipeline\n');
  
  try {
    // Test data representing real-world scenario
    const resumeData = {
      skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
      experience: '5+ years of full-stack JavaScript development',
      education: 'Bachelor of Computer Science',
      content: 'Senior JavaScript Developer with 5 years experience in React, Node.js, and PostgreSQL. Built scalable applications using Docker and AWS.',
    };
    
    const jobData = {
      skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'AWS'],
      experience: '4+ years JavaScript experience required',
      description: 'We need a senior JavaScript developer with React and Node.js experience. TypeScript and AWS knowledge preferred.',
    };
    
    console.log('📊 Testing Complete Enhanced Scoring Pipeline...\n');
    
    // Phase 1: Test without embeddings (fallback mode)
    console.log('Phase 1: Testing fallback mode (no stored embeddings)');
    const startFallback = Date.now();
    const resultFallback = await calculateEnhancedMatchWithESCO(resumeData, jobData);
    const timeFallback = Date.now() - startFallback;
    
    console.log(`✅ Fallback mode completed in ${timeFallback}ms`);
    console.log(`   Total Score: ${resultFallback.totalScore}%`);
    console.log(`   Semantic Score: ${resultFallback.dimensionScores.semantic}%`);
    console.log(`   Skills Matched: ${resultFallback.skillBreakdown.filter(s => s.matched).length}/${resultFallback.skillBreakdown.length}`);
    console.log();
    
    // Phase 2: Generate embeddings 
    console.log('Phase 2: Generating embeddings...');
    const startEmbedding = Date.now();
    const [resumeEmbedding, jobEmbedding] = await Promise.all([
      generateEmbedding(resumeData.content),
      generateEmbedding(jobData.description)
    ]);
    const timeEmbedding = Date.now() - startEmbedding;
    
    console.log(`✅ Embeddings generated in ${timeEmbedding}ms`);
    console.log(`   Resume embedding: ${resumeEmbedding.length} dimensions`);
    console.log(`   Job embedding: ${jobEmbedding.length} dimensions`);
    console.log();
    
    // Phase 3: Test with embeddings (optimized mode)
    console.log('Phase 3: Testing optimized mode (with stored embeddings)');
    const resumeDataWithEmbeddings = {
      ...resumeData,
      embedding: resumeEmbedding,
      skillsEmbedding: resumeEmbedding, // Simplified for test
    };
    
    const jobDataWithEmbeddings = {
      ...jobData,
      embedding: jobEmbedding,
      skillsEmbedding: jobEmbedding, // Simplified for test
    };
    
    const startOptimized = Date.now();
    const resultOptimized = await calculateEnhancedMatchWithESCO(resumeDataWithEmbeddings, jobDataWithEmbeddings);
    const timeOptimized = Date.now() - startOptimized;
    
    console.log(`✅ Optimized mode completed in ${timeOptimized}ms`);
    console.log(`   Total Score: ${resultOptimized.totalScore}%`);
    console.log(`   Semantic Score: ${resultOptimized.dimensionScores.semantic}%`);
    console.log(`   Skills Matched: ${resultOptimized.skillBreakdown.filter(s => s.matched).length}/${resultOptimized.skillBreakdown.length}`);
    console.log();
    
    // Phase 4: Direct semantic similarity test
    console.log('Phase 4: Testing direct semantic similarity...');
    const semanticSimilarity = calculateSemanticSimilarityFromEmbeddings(resumeEmbedding, jobEmbedding);
    console.log(`✅ Direct semantic similarity: ${semanticSimilarity.toFixed(1)}%`);
    console.log();
    
    // Results Analysis
    console.log('📈 Performance Analysis:');
    const speedup = Math.round(timeFallback / Math.max(timeOptimized, 1));
    console.log(`   Fallback time: ${timeFallback}ms`);
    console.log(`   Optimized time: ${timeOptimized}ms`);  
    console.log(`   Speed improvement: ${speedup}x faster with stored embeddings`);
    console.log();
    
    console.log('🎯 Accuracy Analysis:');
    const scoreDifference = Math.abs(resultFallback.totalScore - resultOptimized.totalScore);
    const semanticDifference = Math.abs(resultFallback.dimensionScores.semantic - resultOptimized.dimensionScores.semantic);
    console.log(`   Total score difference: ${scoreDifference.toFixed(1)}%`);
    console.log(`   Semantic score difference: ${semanticDifference.toFixed(1)}%`);
    console.log(`   Score consistency: ${scoreDifference < 2 ? '✅ GOOD' : '❌ POOR'}`);
    console.log();
    
    // Validation
    const validations = [
      { test: 'Embeddings have correct dimensions', pass: resumeEmbedding.length === 384 && jobEmbedding.length === 384 },
      { test: 'Semantic similarity in valid range', pass: semanticSimilarity >= 0 && semanticSimilarity <= 100 },
      { test: 'Total scores in valid range', pass: resultFallback.totalScore >= 0 && resultOptimized.totalScore >= 0 },
      { test: 'Optimized mode is faster', pass: timeOptimized < timeFallback },
      { test: 'Score consistency is good', pass: scoreDifference < 2 },
      { test: 'Skills matching works', pass: resultOptimized.skillBreakdown.some(s => s.matched) },
    ];
    
    const passedValidations = validations.filter(v => v.pass).length;
    
    console.log('✅ Validation Results:');
    validations.forEach(validation => {
      const status = validation.pass ? '✅' : '❌';
      console.log(`   ${status} ${validation.test}`);
    });
    
    console.log();
    if (passedValidations === validations.length) {
      console.log('🎉 INTEGRATION TEST PASSED!');
      console.log('   All embedding functionality is working correctly end-to-end.');
      console.log('   The system can seamlessly switch between optimized and fallback modes.');
    } else {
      console.log(`⚠️  INTEGRATION TEST PARTIAL: ${passedValidations}/${validations.length} validations passed`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ INTEGRATION TEST FAILED:', error);
    process.exit(1);
  }
}

// Run the integration test
integrationTest();