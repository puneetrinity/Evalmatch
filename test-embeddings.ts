#!/usr/bin/env tsx
/**
 * Comprehensive test script for embedding functionality
 * Tests the complete pipeline: Resume upload → Embedding generation → Job matching
 */

import { logger } from './server/lib/logger';
import { generateEmbedding, calculateSemanticSimilarityFromEmbeddings, cosineSimilarity } from './server/lib/embeddings';
import { createResumeService } from './server/services/resume-service';
import { createJobService } from './server/services/job-service';
import { calculateEnhancedMatchWithESCO } from './server/lib/enhanced-scoring';
import { isSuccess } from './shared/result-types';

// Test data
const TEST_RESUME_CONTENT = `
John Smith
Senior Software Engineer

EXPERIENCE:
- 5+ years of JavaScript, React, and Node.js development
- Built scalable web applications using microservices architecture
- Experience with PostgreSQL, Redis, and Docker
- Led team of 4 developers on e-commerce platform

SKILLS:
JavaScript, TypeScript, React, Node.js, PostgreSQL, Docker, AWS, GraphQL

EDUCATION:
Bachelor of Computer Science, MIT (2018)
`;

const TEST_JOB_DESCRIPTION = `
Senior Full-Stack Developer Position

We're looking for an experienced full-stack developer to join our team.

REQUIREMENTS:
- 4+ years experience with JavaScript/TypeScript
- Strong React and Node.js skills
- Database experience (PostgreSQL preferred)
- Experience with cloud platforms (AWS)
- Team leadership experience

RESPONSIBILITIES:
- Build and maintain web applications
- Work with microservices architecture
- Mentor junior developers
- Collaborate with product teams

SKILLS: React, Node.js, TypeScript, PostgreSQL, AWS, Docker, GraphQL
`;

interface TestResult {
  name: string;
  success: boolean;
  duration: number;
  details?: any;
  error?: string;
}

class EmbeddingTester {
  private results: TestResult[] = [];

  async runAllTests(): Promise<void> {
    logger.info('🚀 Starting comprehensive embedding tests...');
    
    try {
      await this.testBasicEmbeddingGeneration();
      await this.testEmbeddingSimilarity();
      await this.testResumeServiceWithEmbeddings();
      await this.testJobServiceWithEmbeddings();
      await this.testOptimizedSemanticSimilarity();
      await this.testEnhancedScoringWithEmbeddings();
      
      this.printResults();
    } catch (error) {
      logger.error('Test suite failed:', error);
      process.exit(1);
    }
  }

  private async runTest(name: string, testFn: () => Promise<any>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`🧪 Running: ${name}`);
      const details = await testFn();
      
      const result: TestResult = {
        name,
        success: true,
        duration: Date.now() - startTime,
        details
      };
      
      logger.info(`✅ PASSED: ${name} (${result.duration}ms)`);
      this.results.push(result);
      return result;
    } catch (error) {
      const result: TestResult = {
        name,
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
      
      logger.error(`❌ FAILED: ${name} (${result.duration}ms)`, error);
      this.results.push(result);
      return result;
    }
  }

  private async testBasicEmbeddingGeneration(): Promise<void> {
    await this.runTest('Basic Embedding Generation', async () => {
      const embedding = await generateEmbedding('test text for embedding generation');
      
      if (!embedding || embedding.length === 0) {
        throw new Error('Embedding generation returned empty result');
      }
      
      if (embedding.length !== 384) {
        throw new Error(`Expected 384-dimensional embedding, got ${embedding.length}`);
      }
      
      return {
        embeddingLength: embedding.length,
        sampleValues: embedding.slice(0, 3)
      };
    });
  }

  private async testEmbeddingSimilarity(): Promise<void> {
    await this.runTest('Embedding Similarity Calculation', async () => {
      const text1 = 'JavaScript React Node.js development';
      const text2 = 'React JavaScript Node development';
      const text3 = 'Python Django Flask development';
      
      const [emb1, emb2, emb3] = await Promise.all([
        generateEmbedding(text1),
        generateEmbedding(text2),
        generateEmbedding(text3)
      ]);
      
      const similarity12 = cosineSimilarity(emb1, emb2);
      const similarity13 = cosineSimilarity(emb1, emb3);
      
      // Similar texts should have higher similarity
      if (similarity12 <= similarity13) {
        throw new Error(`Expected similar texts to have higher similarity: ${similarity12} vs ${similarity13}`);
      }
      
      return {
        similarity12: Math.round(similarity12 * 100),
        similarity13: Math.round(similarity13 * 100),
        passed: similarity12 > similarity13
      };
    });
  }

  private async testResumeServiceWithEmbeddings(): Promise<void> {
    await this.runTest('Resume Service Embedding Generation', async () => {
      const resumeService = createResumeService();
      
      // Create test file buffer
      const testFile = {
        originalname: 'test-resume.txt',
        mimetype: 'text/plain',
        size: TEST_RESUME_CONTENT.length,
        buffer: Buffer.from(TEST_RESUME_CONTENT)
      };
      
      // Upload with auto-analysis (should generate embeddings)
      const uploadResult = await resumeService.uploadResume({
        userId: 'test-user-123',
        file: testFile,
        autoAnalyze: true
      });
      
      if (!isSuccess(uploadResult)) {
        throw new Error(`Resume upload failed: ${uploadResult.error.message}`);
      }
      
      const resume = uploadResult.data;
      
      return {
        resumeId: resume.id,
        hasAnalysis: !!resume.analyzedData,
        extractedTextLength: resume.extractedText?.length || 0,
        processingTime: resume.processingTime
      };
    });
  }

  private async testJobServiceWithEmbeddings(): Promise<void> {
    await this.runTest('Job Service Embedding Generation', async () => {
      const jobService = createJobService();
      
      // Create job with immediate analysis (should generate embeddings)
      const jobResult = await jobService.createJobDescription({
        userId: 'test-user-123',
        title: 'Senior Full-Stack Developer',
        description: TEST_JOB_DESCRIPTION,
        requirements: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
        analyzeImmediately: true
      });
      
      if (!isSuccess(jobResult)) {
        throw new Error(`Job creation failed: ${jobResult.error.message}`);
      }
      
      const job = jobResult.data;
      
      return {
        jobId: job.job.id,
        hasAnalysis: !!job.analysis,
        processingTime: job.processingTime
      };
    });
  }

  private async testOptimizedSemanticSimilarity(): Promise<void> {
    await this.runTest('Optimized vs On-the-fly Semantic Similarity', async () => {
      // Generate embeddings once
      const resumeEmbedding = await generateEmbedding(TEST_RESUME_CONTENT);
      const jobEmbedding = await generateEmbedding(TEST_JOB_DESCRIPTION);
      
      // Test optimized version (using pre-generated embeddings)
      const startOptimized = Date.now();
      const optimizedScore = calculateSemanticSimilarityFromEmbeddings(resumeEmbedding, jobEmbedding);
      const optimizedTime = Date.now() - startOptimized;
      
      // Test on-the-fly version (generates embeddings)
      const { calculateSemanticSimilarity } = await import('./server/lib/embeddings');
      const startOnTheFly = Date.now();
      const onTheFlyScore = await calculateSemanticSimilarity(TEST_RESUME_CONTENT, TEST_JOB_DESCRIPTION);
      const onTheFlyTime = Date.now() - startOnTheFly;
      
      // Scores should be very similar
      const scoreDifference = Math.abs(optimizedScore - onTheFlyScore);
      if (scoreDifference > 1) {
        throw new Error(`Score difference too large: ${scoreDifference}`);
      }
      
      const speedup = onTheFlyTime / Math.max(optimizedTime, 1);
      
      return {
        optimizedScore: Math.round(optimizedScore),
        onTheFlyScore: Math.round(onTheFlyScore),
        optimizedTime,
        onTheFlyTime,
        speedupFactor: Math.round(speedup),
        scoreDifference
      };
    });
  }

  private async testEnhancedScoringWithEmbeddings(): Promise<void> {
    await this.runTest('Enhanced Scoring with Embedding Optimization', async () => {
      // Generate embeddings for test data
      const resumeEmbedding = await generateEmbedding(TEST_RESUME_CONTENT);
      const jobEmbedding = await generateEmbedding(TEST_JOB_DESCRIPTION);
      
      const resumeData = {
        skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Docker'],
        experience: '5+ years of JavaScript development',
        education: 'Bachelor of Computer Science',
        content: TEST_RESUME_CONTENT,
        embedding: resumeEmbedding,
        skillsEmbedding: resumeEmbedding // Simplified for test
      };
      
      const jobData = {
        skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
        experience: '4+ years experience required',
        description: TEST_JOB_DESCRIPTION,
        embedding: jobEmbedding,
        skillsEmbedding: jobEmbedding // Simplified for test
      };
      
      // Test with embeddings (optimized)
      const startWithEmbeddings = Date.now();
      const resultWithEmbeddings = await calculateEnhancedMatchWithESCO(resumeData, jobData);
      const timeWithEmbeddings = Date.now() - startWithEmbeddings;
      
      // Test without embeddings (fallback)
      const resumeDataNoEmbeddings = { ...resumeData, embedding: undefined, skillsEmbedding: undefined };
      const jobDataNoEmbeddings = { ...jobData, embedding: undefined, skillsEmbedding: undefined };
      
      const startWithoutEmbeddings = Date.now();
      const resultWithoutEmbeddings = await calculateEnhancedMatchWithESCO(resumeDataNoEmbeddings, jobDataNoEmbeddings);
      const timeWithoutEmbeddings = Date.now() - startWithoutEmbeddings;
      
      const speedup = timeWithoutEmbeddings / Math.max(timeWithEmbeddings, 1);
      
      return {
        optimizedScore: resultWithEmbeddings.totalScore,
        fallbackScore: resultWithoutEmbeddings.totalScore,
        optimizedTime: timeWithEmbeddings,
        fallbackTime: timeWithoutEmbeddings,
        speedupFactor: Math.round(speedup),
        skillsMatched: resultWithEmbeddings.skillBreakdown.filter(s => s.matched).length,
        confidence: resultWithEmbeddings.confidence,
        semanticScore: resultWithEmbeddings.dimensionScores.semantic
      };
    });
  }

  private printResults(): void {
    const passed = this.results.filter(r => r.success).length;
    const total = this.results.length;
    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);
    
    console.log('\n' + '='.repeat(80));
    console.log('🧪 EMBEDDING FUNCTIONALITY TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`✅ PASSED: ${passed}/${total} tests`);
    console.log(`⏱️  TOTAL TIME: ${totalTime}ms`);
    console.log('='.repeat(80));
    
    this.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      const duration = `${result.duration}ms`.padEnd(8);
      
      console.log(`${status} ${(index + 1).toString().padStart(2)}. ${result.name} (${duration})`);
      
      if (result.success && result.details) {
        Object.entries(result.details).forEach(([key, value]) => {
          console.log(`   📊 ${key}: ${JSON.stringify(value)}`);
        });
      } else if (!result.success && result.error) {
        console.log(`   ❌ Error: ${result.error}`);
      }
      
      console.log();
    });
    
    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED! Embedding functionality is working correctly.');
    } else {
      console.log(`⚠️  ${total - passed} test(s) failed. Please check the errors above.`);
      process.exit(1);
    }
  }
}

// Run the tests
async function main() {
  const tester = new EmbeddingTester();
  await tester.runAllTests();
}

// Run the tests if this file is executed directly
main().catch((error) => {
  console.error('Test suite crashed:', error);
  process.exit(1);
});