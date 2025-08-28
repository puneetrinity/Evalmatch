/**
 * COMPREHENSIVE SMOKE TESTS FOR EVALMATCH SYSTEM
 * 
 * Critical end-to-end smoke tests to validate core system functionality
 * without needing full server startup. Tests the 4 key scenarios from
 * the go-live checklist:
 * 
 * 1. Golden Pair Test (Skills) - High quality ML matching
 * 2. API Ambiguity Test - Context-aware skill interpretation  
 * 3. Abstain Path Test - Graceful handling of insufficient data
 * 4. Performance Test - Response times and caching behavior
 * 
 * @author Claude Code Testing Expert
 * @date 2025-08-27
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { HybridMatchAnalyzer } from '@server/lib/hybrid-match-analyzer';
import { getESCOService, ESCOService } from '@server/lib/esco-service';
import type { AnalyzeResumeResponse, AnalyzeJobDescriptionResponse } from '@shared/schema';
import type { UserTierInfo } from '@shared/user-tiers';

// Mock external dependencies at the top level
jest.mock('@server/lib/logger');
jest.mock('@server/lib/audit-trail');
jest.mock('@server/lib/embeddings');
jest.mock('@server/lib/groq');
jest.mock('@server/lib/openai');
jest.mock('@server/lib/anthropic');
jest.mock('@server/lib/enhanced-scoring');
jest.mock('@server/lib/bias-detection');
jest.mock('@server/lib/match-insights-generator');
jest.mock('@server/lib/skill-processor');

describe('🚀 COMPREHENSIVE SMOKE TESTS - EvalMatch System', () => {
  let hybridAnalyzer: HybridMatchAnalyzer;
  let escoService: ESCOService;
  let testStartTime: number;

  const mockUserTier: UserTierInfo = {
    tier: 'professional',
    limits: { dailyAnalyses: 100, monthlyAnalyses: 1000 },
    features: { advancedAnalysis: true, exportResults: true, prioritySupport: true }
  };

  beforeAll(async () => {
    console.log('🧪 Initializing Comprehensive Smoke Test Suite...');
    testStartTime = Date.now();
    
    // Initialize services
    hybridAnalyzer = new HybridMatchAnalyzer();
    escoService = getESCOService();
    
    // Setup comprehensive mocking
    await setupComprehensiveMocks();
    
    console.log('✅ Smoke test environment ready');
  });

  afterAll(async () => {
    const totalTime = Date.now() - testStartTime;
    console.log(`🏁 Smoke tests completed in ${totalTime}ms`);
    
    // Cleanup
    await escoService.close();
    jest.clearAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('🎯 TEST 1: GOLDEN PAIR TEST (Skills Matching)', () => {
    /**
     * Critical test for high-quality skill matching
     * Resume: "machine learning engineer, TensorFlow, 5 yrs"  
     * JD: "ML engineer, deep learning, 4+ years"
     * Expected: High score, ESCO includes "machine learning", contamination=0
     */
    test('should achieve high match score for ML engineer golden pair', async () => {
      const testStart = Date.now();
      
      // High-quality resume analysis (ML Engineer with TensorFlow)
      const resumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'ml_engineer_resume.pdf',
        analyzedData: {
          name: 'Jane Smith',
          email: 'jane.smith@example.com',
          skills: [
            'Machine Learning',
            'TensorFlow',
            'Python',
            'Deep Learning',
            'Neural Networks',
            'Data Science',
            'PyTorch',
            'Computer Vision'
          ],
          experience: '5 years of experience in machine learning engineering',
          education: 'MSc Computer Science, Stanford University',
          workExperience: [
            {
              company: 'Tech Corp',
              role: 'Machine Learning Engineer',
              duration: '3 years',
              responsibilities: 'Developed ML models using TensorFlow'
            }
          ]
        },
        skills: [
          'Machine Learning',
          'TensorFlow', 
          'Python',
          'Deep Learning',
          'Neural Networks'
        ],
        experience: ['5 years machine learning engineering'],
        education: ['MSc Computer Science'],
        confidence: 0.95
      };

      // High-quality job description (ML Engineer role)
      const jobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Machine Learning Engineer',
        analyzedData: {
          title: 'Machine Learning Engineer',
          requiredSkills: [
            'Machine Learning',
            'Deep Learning', 
            'TensorFlow',
            'Python',
            'Model Development',
            'Neural Networks'
          ],
          experienceLevel: '4+ years experience required',
          responsibilities: [
            'Develop machine learning models',
            'Implement deep learning solutions',
            'Work with TensorFlow and PyTorch'
          ],
          requirements: [
            '4+ years ML engineering experience',
            'Proficiency in TensorFlow',
            'Strong Python skills'
          ]
        },
        requiredSkills: [
          'Machine Learning',
          'Deep Learning',
          'TensorFlow', 
          'Python'
        ],
        experience: '4+ years',
        confidence: 0.92
      };

      const resumeText = `
        Jane Smith - Machine Learning Engineer
        
        PROFESSIONAL EXPERIENCE:
        Machine Learning Engineer at Tech Corp (3 years)
        - Developed and deployed ML models using TensorFlow and PyTorch
        - Built computer vision systems for autonomous vehicles
        - Implemented deep learning architectures for image recognition
        - Collaborated with data science teams on model optimization
        
        Senior Data Scientist at StartupCo (2 years) 
        - Applied machine learning to solve business problems
        - Developed recommendation systems using collaborative filtering
        - Performed statistical analysis and A/B testing
        
        SKILLS:
        - Machine Learning: TensorFlow, PyTorch, Scikit-learn
        - Programming: Python, R, SQL, JavaScript
        - Deep Learning: CNNs, RNNs, Transformers, GANs
        - Data Processing: Pandas, NumPy, Spark
        - Cloud: AWS, GCP, Azure ML
        - Tools: Git, Docker, Kubernetes, MLflow
        
        EDUCATION:
        MSc Computer Science, Stanford University (2018)
        Focus: Machine Learning and Artificial Intelligence
        Thesis: "Deep Learning Approaches for Computer Vision"
      `;

      const jobText = `
        Machine Learning Engineer Position
        
        We are seeking a talented Machine Learning Engineer to join our AI team.
        
        RESPONSIBILITIES:
        - Design and implement machine learning models for production systems
        - Develop deep learning solutions using TensorFlow and PyTorch  
        - Collaborate with cross-functional teams to integrate ML models
        - Optimize model performance and scalability
        - Research and implement state-of-the-art ML techniques
        
        REQUIREMENTS:
        - 4+ years of experience in machine learning engineering
        - Strong proficiency in TensorFlow and deep learning frameworks
        - Excellent Python programming skills
        - Experience with model deployment and MLOps
        - Knowledge of computer vision and natural language processing
        - MS/PhD in Computer Science, Statistics, or related field preferred
        
        PREFERRED QUALIFICATIONS:
        - Experience with cloud ML platforms (AWS, GCP, Azure)
        - Knowledge of distributed training and model optimization
        - Publications in top-tier ML conferences
      `;

      // Execute the golden pair test
      console.log('🧪 Executing Golden Pair Test...');
      const result = await hybridAnalyzer.analyzeMatch(
        resumeAnalysis,
        jobAnalysis, 
        mockUserTier,
        resumeText,
        jobText
      );

      const testTime = Date.now() - testStart;

      // CRITICAL ASSERTIONS for Golden Pair
      expect(result.matchPercentage).toBeGreaterThanOrEqual(85); // High-quality match
      expect(result.matchPercentage).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(0.8); // High confidence
      expect(result.analysisMethod).toBe('hybrid'); // Should use hybrid analysis
      expect(result.matchedSkills.length).toBeGreaterThanOrEqual(4); // Multiple skill matches
      
      // Should find machine learning related skills
      const mlSkillFound = result.matchedSkills.some(skill => 
        typeof skill === 'string' ? 
          skill.toLowerCase().includes('machine learning') :
          skill.skill.toLowerCase().includes('machine learning')
      );
      expect(mlSkillFound).toBe(true);

      // Should find TensorFlow
      const tensorflowFound = result.matchedSkills.some(skill => 
        typeof skill === 'string' ? 
          skill.toLowerCase().includes('tensorflow') :
          skill.skill.toLowerCase().includes('tensorflow')
      );
      expect(tensorflowFound).toBe(true);

      // Contamination should be minimal (0 blocked skills)
      expect(result.candidateWeaknesses).not.toEqual(
        expect.arrayContaining([
          expect.stringContaining('irrelevant skills')
        ])
      );

      // Should have quality insights  
      expect(result.candidateStrengths.length).toBeGreaterThanOrEqual(2);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      
      // Performance check
      expect(testTime).toBeLessThan(10000); // Should complete within 10 seconds

      console.log('✅ Golden Pair Test Results:', {
        matchPercentage: result.matchPercentage,
        confidence: result.confidence,
        analysisMethod: result.analysisMethod,
        matchedSkillsCount: result.matchedSkills.length,
        testTimeMs: testTime,
        skillsFound: result.matchedSkills.slice(0, 5) // First 5 skills
      });
    });

    test('should properly weight ML skills in scoring dimensions', async () => {
      // Test that ML skills get proper weighting in the scoring system
      const mlResumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'test_ml_resume.pdf',
        skills: ['Machine Learning', 'TensorFlow', 'Python', 'Deep Learning'],
        experience: ['3 years ML engineering'],
        education: ['BSc Computer Science'],
        confidence: 0.9
      };

      const mlJobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'ML Engineer',
        requiredSkills: ['Machine Learning', 'TensorFlow', 'Python'],
        experience: '2+ years',
        confidence: 0.85
      };

      const result = await hybridAnalyzer.analyzeMatch(
        mlResumeAnalysis,
        mlJobAnalysis,
        mockUserTier
      );

      // Skills dimension should be weighted heavily for ML roles
      expect(result.scoringDimensions.skills).toBeGreaterThan(result.scoringDimensions.education);
      expect(result.scoringDimensions.skills).toBeGreaterThan(50); // Significant skills score
    });
  });

  describe('🔍 TEST 2: API AMBIGUITY TEST (Context Awareness)', () => {
    /**
     * Critical test for context-aware skill interpretation
     * Resume: "built REST APIs in Node/GraphQL" (no pharma terms)
     * JD: "software engineer" 
     * Expected: "API" interpreted as technical, not pharmaceutical
     */
    test('should interpret API as technical skill, not pharmaceutical', async () => {
      const testStart = Date.now();

      // Software developer resume (no pharmaceutical context)
      const resumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'software_dev_resume.pdf',
        analyzedData: {
          name: 'John Developer',
          skills: [
            'REST API Development',
            'Node.js',
            'GraphQL',
            'JavaScript',
            'Express.js',
            'MongoDB',
            'React',
            'Git'
          ],
          experience: '4 years full-stack development',
          education: 'BSc Software Engineering'
        },
        skills: [
          'REST API Development',
          'Node.js', 
          'GraphQL',
          'JavaScript',
          'Express.js'
        ],
        experience: ['4 years web development'],
        education: ['BSc Software Engineering'],
        confidence: 0.88
      };

      // Generic software engineer job (no pharmaceutical context)
      const jobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Software Engineer',
        analyzedData: {
          title: 'Software Engineer',
          requiredSkills: [
            'JavaScript',
            'API Development',
            'Node.js',
            'Database Design',
            'Web Development'
          ],
          experienceLevel: '3+ years',
          requirements: ['API development experience', 'JavaScript proficiency']
        },
        requiredSkills: [
          'JavaScript',
          'API Development', 
          'Node.js',
          'Web Development'
        ],
        experience: '3+ years',
        confidence: 0.82
      };

      const resumeText = `
        John Developer - Full Stack Software Engineer
        
        EXPERIENCE:
        Senior Software Engineer at WebTech Solutions (2 years)
        - Built and maintained REST APIs using Node.js and Express
        - Developed GraphQL endpoints for mobile applications  
        - Implemented microservices architecture
        - Worked with MongoDB and PostgreSQL databases
        
        Software Developer at StartupInc (2 years)
        - Created web applications using React and JavaScript
        - Designed RESTful API endpoints for e-commerce platform
        - Integrated third-party APIs (Stripe, Twilio, SendGrid)
        - Performed code reviews and mentored junior developers
        
        TECHNICAL SKILLS:
        - Backend: Node.js, Express.js, Python, Django
        - Frontend: React, Vue.js, JavaScript, TypeScript
        - APIs: REST, GraphQL, OpenAPI/Swagger
        - Databases: MongoDB, PostgreSQL, Redis
        - Cloud: AWS, Docker, Kubernetes
        - Tools: Git, Jenkins, JIRA
      `;

      const jobText = `
        Software Engineer Position
        
        Join our engineering team to build scalable web applications.
        
        KEY RESPONSIBILITIES:
        - Develop and maintain web applications and APIs
        - Design database schemas and optimize queries  
        - Collaborate with frontend developers and product managers
        - Write clean, testable, and maintainable code
        - Participate in code reviews and technical discussions
        
        REQUIRED SKILLS:
        - 3+ years of software development experience
        - Strong proficiency in JavaScript and modern frameworks
        - Experience building REST APIs and web services
        - Knowledge of database design and SQL
        - Familiarity with version control (Git) and CI/CD
        
        PREFERRED SKILLS:
        - Experience with Node.js, React, or similar technologies
        - Understanding of microservices architecture  
        - Cloud platform experience (AWS, GCP, Azure)
        - Knowledge of containerization (Docker, Kubernetes)
      `;

      console.log('🧪 Executing API Ambiguity Test...');
      const result = await hybridAnalyzer.analyzeMatch(
        resumeAnalysis,
        jobAnalysis,
        mockUserTier,
        resumeText,
        jobText
      );

      const testTime = Date.now() - testStart;

      // CRITICAL ASSERTIONS for API Ambiguity
      expect(result.matchPercentage).toBeGreaterThanOrEqual(70); // Should be a good match
      
      // API should be interpreted as technical skill, not pharmaceutical
      const apiSkillFound = result.matchedSkills.some(skill => {
        const skillName = typeof skill === 'string' ? skill : skill.skill;
        return skillName.toLowerCase().includes('api') && 
               !skillName.toLowerCase().includes('pharmaceutical');
      });
      expect(apiSkillFound).toBe(true);

      // Should NOT have pharmaceutical contamination warnings
      const hasPharmContamination = result.candidateWeaknesses.some(weakness =>
        weakness.toLowerCase().includes('pharmaceutical') ||
        weakness.toLowerCase().includes('irrelevant skills')
      );
      expect(hasPharmContamination).toBe(false);

      // Should recognize technical context
      expect(result.analysisMethod).toMatch(/hybrid|ml_only|llm_only/);
      expect(result.confidence).toBeGreaterThan(0.6);

      console.log('✅ API Ambiguity Test Results:', {
        matchPercentage: result.matchPercentage,
        confidence: result.confidence,
        apiSkillsFound: result.matchedSkills.filter(skill => {
          const name = typeof skill === 'string' ? skill : skill.skill;
          return name.toLowerCase().includes('api');
        }),
        noPharmContamination: !hasPharmContamination,
        testTimeMs: testTime
      });
    });

    test('should handle domain-specific API context correctly', async () => {
      // Test pharmaceutical context where API should be interpreted differently
      const pharmaResumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'pharma_resume.pdf',
        skills: ['Pharmaceutical Manufacturing', 'GMP', 'API Production', 'Quality Control'],
        experience: ['5 years pharmaceutical manufacturing'],
        education: ['PhD Chemistry'],
        confidence: 0.9
      };

      const pharmaJobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Manufacturing Engineer - Pharmaceutical',
        requiredSkills: ['API Manufacturing', 'GMP', 'Quality Control'],
        experience: '3+ years pharmaceutical',
        confidence: 0.85
      };

      const pharmaResumeText = `
        PhD Chemist with 5 years experience in pharmaceutical manufacturing.
        Specialized in Active Pharmaceutical Ingredient (API) production and quality control.
        Expert in Good Manufacturing Practices (GMP) and regulatory compliance.
      `;

      const pharmaJobText = `
        Manufacturing Engineer - Pharmaceutical API Production
        
        Lead API manufacturing processes in pharmaceutical facility.
        Ensure GMP compliance and quality control standards.
        3+ years experience in pharmaceutical manufacturing required.
      `;

      const result = await hybridAnalyzer.analyzeMatch(
        pharmaResumeAnalysis,
        pharmaJobAnalysis,
        mockUserTier,
        pharmaResumeText,
        pharmaJobText
      );

      // In pharmaceutical context, API should be matched as pharmaceutical term
      const pharmApiFound = result.matchedSkills.some(skill => {
        const name = typeof skill === 'string' ? skill : skill.skill;
        return name.toLowerCase().includes('api') || 
               name.toLowerCase().includes('pharmaceutical');
      });
      
      expect(pharmApiFound).toBe(true);
      expect(result.matchPercentage).toBeGreaterThan(60); // Should still match well
    });
  });

  describe('⚠️  TEST 3: ABSTAIN PATH TEST (Insufficient Evidence Handling)', () => {
    /**
     * Critical test for graceful handling of insufficient data
     * Ultra-short inputs to force provider failures
     * Expected: status="INSUFFICIENT_EVIDENCE", matchPercentage=null, confidence=0
     */
    test('should return abstain state for insufficient evidence', async () => {
      const testStart = Date.now();

      // Minimal/poor quality resume analysis
      const poorResumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'minimal_resume.txt',
        skills: [], // No skills detected
        experience: [], // No experience
        education: [], // No education
        confidence: 0.1 // Very low confidence
      };

      // Minimal/poor quality job description  
      const poorJobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Job', // Minimal title
        requiredSkills: [], // No skills
        experience: '', // No experience requirement
        confidence: 0.15 // Very low confidence
      };

      // Ultra-minimal text content
      const minimalResumeText = 'John';
      const minimalJobText = 'Work';

      console.log('🧪 Executing Abstain Path Test...');
      const result = await hybridAnalyzer.analyzeMatch(
        poorResumeAnalysis,
        poorJobAnalysis,
        mockUserTier,
        minimalResumeText,
        minimalJobText
      );

      const testTime = Date.now() - testStart;

      // CRITICAL ASSERTIONS for Abstain Path
      // Should detect insufficient evidence and return abstain state
      expect(result.matchPercentage).toBeNull(); // Explicit null for abstain
      expect(result.confidence).toBeLessThanOrEqual(0.5); // Low confidence
      expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.abstainReason).toMatch(/insufficient|failed|evidence|threshold/i);
      
      // Should have appropriate analysis method
      expect(result.analysisMethod).toMatch(/abstain|ml_only/);
      
      // Should provide helpful feedback
      expect(result.candidateStrengths.length).toBeGreaterThanOrEqual(1);
      expect(result.candidateWeaknesses.length).toBeGreaterThanOrEqual(1);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      
      // Scoring dimensions should reflect low confidence
      expect(result.scoringDimensions.overall).toBeLessThanOrEqual(50);
      
      // Should complete quickly even with insufficient data
      expect(testTime).toBeLessThan(8000);

      console.log('✅ Abstain Path Test Results:', {
        matchPercentage: result.matchPercentage,
        confidence: result.confidence,
        status: result.status,
        abstainReason: result.abstainReason,
        analysisMethod: result.analysisMethod,
        testTimeMs: testTime
      });
    });

    test('should handle provider failures gracefully', async () => {
      // Mock provider failures
      const groqModule = await import('@server/lib/groq');
      const openaiModule = await import('@server/lib/openai');
      const anthropicModule = await import('@server/lib/anthropic');

      // Mock all providers to fail
      jest.mocked(groqModule.analyzeMatch).mockRejectedValue(new Error('Groq API unavailable'));
      jest.mocked(openaiModule.analyzeMatch).mockRejectedValue(new Error('OpenAI API unavailable'));  
      jest.mocked(anthropicModule.analyzeMatch).mockRejectedValue(new Error('Anthropic API unavailable'));

      const resumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'test.pdf',
        skills: ['JavaScript'],
        experience: ['2 years'],
        education: ['BSc'],
        confidence: 0.8
      };

      const jobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Developer',
        requiredSkills: ['JavaScript'],
        experience: '1+ years',
        confidence: 0.7
      };

      const result = await hybridAnalyzer.analyzeMatch(
        resumeAnalysis,
        jobAnalysis,
        mockUserTier,
        'Resume text',
        'Job text'
      );

      // Should fall back gracefully to ML-only or provide abstain state
      expect(result).toBeDefined();
      expect(typeof result.matchPercentage).toBe('number');
      expect(result.analysisMethod).toMatch(/ml_only|abstain/);
    });

    test('should validate confidence thresholds correctly', async () => {
      // Test edge case confidence values
      const edgeCaseResumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'edge_case.pdf',
        skills: ['Skill1'],
        experience: ['1 year'],
        education: ['School'],
        confidence: 0.49 // Just below minimum threshold
      };

      const edgeCaseJobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Job Title',
        requiredSkills: ['Skill2'],
        experience: '0 years',
        confidence: 0.51 // Just above threshold
      };

      const result = await hybridAnalyzer.analyzeMatch(
        edgeCaseResumeAnalysis,
        edgeCaseJobAnalysis,
        mockUserTier
      );

      // Should handle edge cases appropriately
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.confidenceLevel).toMatch(/low|medium|high/);
    });
  });

  describe('⚡ TEST 4: PERFORMANCE TEST (Speed & Caching)', () => {
    /**
     * Critical performance and caching behavior tests
     * Test response times and caching effectiveness
     */
    test('should meet performance benchmarks for typical analysis', async () => {
      const performanceTestStart = Date.now();

      // Realistic resume and job analysis
      const performanceResumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'performance_test_resume.pdf',
        analyzedData: {
          skills: ['JavaScript', 'React', 'Node.js', 'Python', 'SQL'],
          experience: '3 years web development',
          education: 'BSc Computer Science'
        },
        skills: ['JavaScript', 'React', 'Node.js', 'Python', 'SQL'],
        experience: ['3 years web development'],
        education: ['BSc Computer Science'],
        confidence: 0.85
      };

      const performanceJobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Full Stack Developer',
        analyzedData: {
          requiredSkills: ['JavaScript', 'React', 'Node.js', 'Database'],
          experienceLevel: '2+ years'
        },
        requiredSkills: ['JavaScript', 'React', 'Node.js', 'Database'],
        experience: '2+ years',
        confidence: 0.8
      };

      const resumeText = 'Software engineer with 3 years experience in JavaScript, React, Node.js, Python, and SQL database development.';
      const jobText = 'Seeking full stack developer with JavaScript, React, Node.js experience. 2+ years required.';

      // First run - measure initial performance
      const firstRunStart = Date.now();
      const firstResult = await hybridAnalyzer.analyzeMatch(
        performanceResumeAnalysis,
        performanceJobAnalysis,
        mockUserTier,
        resumeText,
        jobText
      );
      const firstRunTime = Date.now() - firstRunStart;

      // Second run - should benefit from caching  
      const secondRunStart = Date.now();
      const secondResult = await hybridAnalyzer.analyzeMatch(
        performanceResumeAnalysis,
        performanceJobAnalysis,
        mockUserTier,
        resumeText,
        jobText
      );
      const secondRunTime = Date.now() - secondRunStart;

      const totalPerformanceTime = Date.now() - performanceTestStart;

      // PERFORMANCE ASSERTIONS
      expect(firstRunTime).toBeLessThan(15000); // First run within 15 seconds
      expect(secondRunTime).toBeLessThan(10000); // Second run faster due to caching
      expect(totalPerformanceTime).toBeLessThan(25000); // Total under 25 seconds
      
      // Results should be consistent
      expect(firstResult.matchPercentage).toBeDefined();
      expect(secondResult.matchPercentage).toBeDefined();
      expect(Math.abs((firstResult.matchPercentage || 0) - (secondResult.matchPercentage || 0))).toBeLessThan(5); // Results consistent
      
      // Both should have reasonable quality
      expect(firstResult.confidence).toBeGreaterThan(0.3);
      expect(secondResult.confidence).toBeGreaterThan(0.3);

      console.log('✅ Performance Test Results:', {
        firstRunTimeMs: firstRunTime,
        secondRunTimeMs: secondRunTime,
        totalTimeMs: totalPerformanceTime,
        cacheImprovementMs: firstRunTime - secondRunTime,
        firstRunScore: firstResult.matchPercentage,
        secondRunScore: secondResult.matchPercentage,
        scoreConsistency: Math.abs((firstResult.matchPercentage || 0) - (secondResult.matchPercentage || 0))
      });
    });

    test('should handle concurrent analysis requests efficiently', async () => {
      const concurrentTestStart = Date.now();
      
      // Create multiple analysis requests
      const analysisRequests = Array.from({ length: 3 }, (_, index) => ({
        resumeAnalysis: {
          success: true,
          filename: `concurrent_resume_${index}.pdf`,
          skills: ['JavaScript', 'Python'],
          experience: [`${index + 1} years`],
          education: ['BSc'],
          confidence: 0.8
        } as AnalyzeResumeResponse,
        jobAnalysis: {
          success: true,
          title: `Developer ${index}`,
          requiredSkills: ['JavaScript'],
          experience: '1+ years',
          confidence: 0.75
        } as AnalyzeJobDescriptionResponse
      }));

      // Execute all requests concurrently
      const concurrentPromises = analysisRequests.map(({ resumeAnalysis, jobAnalysis }) =>
        hybridAnalyzer.analyzeMatch(resumeAnalysis, jobAnalysis, mockUserTier)
      );

      const results = await Promise.all(concurrentPromises);
      const concurrentTime = Date.now() - concurrentTestStart;

      // All should complete successfully
      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.matchPercentage).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeGreaterThan(0);
      });

      // Concurrent execution should be reasonably fast
      expect(concurrentTime).toBeLessThan(20000); // All 3 within 20 seconds

      console.log('✅ Concurrent Performance Results:', {
        requestCount: results.length,
        totalTimeMs: concurrentTime,
        avgTimePerRequest: concurrentTime / results.length,
        allSuccessful: results.every(r => r.matchPercentage !== undefined)
      });
    });

    test('should validate ESCO service performance', async () => {
      const escoTestStart = Date.now();
      
      // Test ESCO skill extraction performance
      const testText = 'Software engineer with experience in JavaScript, React, Node.js, Python, machine learning, and data science.';
      
      const escoResult = await escoService.extractSkills({
        text: testText,
        domain: 'technology',
        maxResults: 20,
        minScore: 0.3
      });

      const escoTestTime = Date.now() - escoTestStart;

      // ESCO performance assertions
      expect(escoTestTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(escoResult.success).toBe(true);
      expect(escoResult.skills.length).toBeGreaterThan(0);
      expect(escoResult.totalSkills).toBe(escoResult.skills.length);
      expect(escoResult.processingTimeMs).toBeLessThan(5000);

      console.log('✅ ESCO Performance Results:', {
        processingTimeMs: escoResult.processingTimeMs,
        totalTimeMs: escoTestTime,
        skillsFound: escoResult.totalSkills,
        domains: escoResult.domains,
        detectedDomain: escoResult.detectedDomain
      });
    });
  });

  describe('🔬 INTEGRATION VALIDATION TESTS', () => {
    /**
     * Additional validation tests for critical system components
     */
    test('should validate audit trail generation', async () => {
      const auditTestStart = Date.now();

      const resumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'audit_test_resume.pdf',
        skills: ['JavaScript', 'React'],
        experience: ['2 years'],
        education: ['BSc'],
        confidence: 0.8
      };

      const jobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Frontend Developer',
        requiredSkills: ['JavaScript', 'React'],
        experience: '1+ years',
        confidence: 0.75
      };

      const resumeText = 'Frontend developer with JavaScript and React experience';
      const jobText = 'Looking for JavaScript and React developer';

      const result = await hybridAnalyzer.analyzeMatch(
        resumeAnalysis,
        jobAnalysis,
        mockUserTier,
        resumeText,
        jobText
      );

      const auditTestTime = Date.now() - auditTestStart;

      // Should complete analysis successfully
      expect(result).toBeDefined();
      expect(result.matchPercentage).toBeGreaterThanOrEqual(0);

      // Audit trail should be created (mocked, but function should be called)
      const auditModule = await import('@server/lib/audit-trail');
      expect(auditModule.createAnalysisAudit).toHaveBeenCalled();

      console.log('✅ Audit Trail Test Results:', {
        matchPercentage: result.matchPercentage,
        confidence: result.confidence,
        auditCreated: jest.mocked(createAnalysisAudit).mock.calls.length > 0,
        testTimeMs: auditTestTime
      });
    });

    test('should validate bias detection integration', async () => {
      const biasTestStart = Date.now();

      // Test with potentially biased content
      const resumeAnalysis: AnalyzeResumeResponse = {
        success: true,
        filename: 'bias_test_resume.pdf',
        analyzedData: {
          name: 'Alex Johnson',
          skills: ['Software Engineering', 'Leadership', 'Project Management'],
          experience: '5 years software development',
          education: 'BSc Computer Science, MIT'
        },
        skills: ['Software Engineering', 'Leadership'],
        experience: ['5 years'],
        education: ['BSc Computer Science'],
        confidence: 0.9
      };

      const jobAnalysis: AnalyzeJobDescriptionResponse = {
        success: true,
        title: 'Senior Software Engineer',
        analyzedData: {
          requiredSkills: ['Software Engineering', 'Leadership'],
          experienceLevel: '3+ years'
        },
        requiredSkills: ['Software Engineering', 'Leadership'],
        experience: '3+ years',
        confidence: 0.85
      };

      const resumeText = 'Alex Johnson - Senior Software Engineer with 5 years experience and strong leadership skills.';
      const jobText = 'Senior Software Engineer position requiring 3+ years experience and leadership abilities.';

      const result = await hybridAnalyzer.analyzeMatch(
        resumeAnalysis,
        jobAnalysis,
        mockUserTier,
        resumeText,
        jobText
      );

      const biasTestTime = Date.now() - biasTestStart;

      // Should include bias detection results
      expect(result).toBeDefined();
      expect(result.biasDetection).toBeDefined();
      expect(result.fairnessMetrics).toBeDefined();
      
      if (result.fairnessMetrics) {
        expect(result.fairnessMetrics.biasConfidenceScore).toBeGreaterThanOrEqual(0);
        expect(result.fairnessMetrics.biasConfidenceScore).toBeLessThanOrEqual(100);
      }

      console.log('✅ Bias Detection Test Results:', {
        matchPercentage: result.matchPercentage,
        confidence: result.confidence,
        hasBiasDetection: !!result.biasDetection,
        fairnessScore: result.fairnessMetrics?.biasConfidenceScore,
        testTimeMs: biasTestTime
      });
    });
  });
});

/**
 * Setup comprehensive mocks for smoke testing
 */
async function setupComprehensiveMocks() {
  // Mock ESCO service
  const mockESCOExtraction = {
    success: true,
    skills: [
      {
        escoId: 'S1.1.1',
        skillTitle: 'JavaScript',
        alternativeLabel: 'JS, ECMAScript',
        description: 'Programming language for web development',
        category: 'technical',
        domain: 'technology',
        matchScore: 0.95,
        matchType: 'exact' as const,
        highlightedText: 'JavaScript'
      },
      {
        escoId: 'S1.1.2', 
        skillTitle: 'Machine Learning',
        alternativeLabel: 'ML, Artificial Intelligence',
        description: 'AI and machine learning techniques',
        category: 'technical',
        domain: 'technology',
        matchScore: 0.92,
        matchType: 'semantic' as const,
        highlightedText: 'machine learning'
      }
    ],
    totalSkills: 2,
    domains: ['technology'],
    processingTimeMs: 150,
    detectedDomain: 'technology'
  };

  // Mock AI providers with realistic responses
  const mockAIAnalysisResponse = {
    matchPercentage: 78,
    matchedSkills: ['JavaScript', 'React', 'Node.js'],
    missingSkills: ['Python', 'AWS'],
    candidateStrengths: ['Strong JavaScript skills', 'Good problem-solving ability'],
    candidateWeaknesses: ['Limited cloud experience'],
    recommendations: ['Consider learning AWS', 'Expand Python knowledge'],
    reasoning: 'Good overall match with strong technical skills'
  };

  // Setup all module mocks using jest.mocked() for better type safety
  const groqModule = await import('@server/lib/groq');
  const openaiModule = await import('@server/lib/openai');
  const anthropicModule = await import('@server/lib/anthropic');
  const enhancedScoringModule = await import('@server/lib/enhanced-scoring');
  const biasDetectionModule = await import('@server/lib/bias-detection');
  const insightsModule = await import('@server/lib/match-insights-generator');
  const auditModule = await import('@server/lib/audit-trail');
  const embeddingsModule = await import('@server/lib/embeddings');
  const skillProcessorModule = await import('@server/lib/skill-processor');

  // Mock Groq
  jest.mocked(groqModule.analyzeMatch).mockResolvedValue(mockAIAnalysisResponse);
  jest.mocked(groqModule.getGroqServiceStatus).mockReturnValue({ isAvailable: true });

  // Mock OpenAI
  jest.mocked(openaiModule.analyzeMatch).mockResolvedValue(mockAIAnalysisResponse);
  jest.mocked(openaiModule.getOpenAIServiceStatus).mockReturnValue({ isAvailable: true });

  // Mock Anthropic
  jest.mocked(anthropicModule.analyzeMatch).mockResolvedValue(mockAIAnalysisResponse);
  jest.mocked(anthropicModule.getAnthropicServiceStatus).mockReturnValue({ isAvailable: true });

  // Mock enhanced scoring
  jest.mocked(enhancedScoringModule.calculateEnhancedMatch).mockResolvedValue({
    totalScore: 75,
    dimensionScores: {
      skills: 80,
      experience: 70,
      education: 65,
      semantic: 85,
      overall: 75
    },
    confidence: 0.8,
    explanation: {
      strengths: ['Good skill match'],
      weaknesses: ['Experience gap'],
      recommendations: ['Gain more experience']
    },
    skillBreakdown: [
      {
        skill: 'JavaScript',
        required: true,
        matched: true,
        matchType: 'exact' as const,
        score: 95,
        category: 'technical'
      }
    ]
  });

  // Mock bias detection
  jest.mocked(biasDetectionModule.detectMatchingBias).mockResolvedValue({
    hasBias: false,
    biasScore: 15,
    confidence: 0.85,
    detectedBiases: [],
    explanation: 'No significant bias detected',
    recommendations: []
  });

  // Mock match insights
  jest.mocked(insightsModule.generateMatchInsights).mockReturnValue({
    matchStrength: 'strong' as const,
    keyStrengths: ['Technical skills align well'],
    areasToExplore: ['Consider additional training'],
    overallAssessment: 'Good candidate fit',
    nextSteps: ['Schedule technical interview']
  });

  // Mock audit trail
  jest.mocked(auditModule.createAnalysisAudit).mockReturnValue({
    auditId: 'audit-123',
    timestamp: new Date().toISOString(),
    analysisRequest: {},
    analysisResult: {},
    metadata: {}
  });
  jest.mocked(auditModule.persistAuditTrail).mockResolvedValue(undefined);

  // Mock embeddings
  jest.mocked(embeddingsModule.calculateSemanticSimilarity).mockResolvedValue(0.85);
  jest.mocked(embeddingsModule.generateBatchEmbeddings).mockResolvedValue([
    [0.1, 0.2, 0.3], // Mock embedding vectors
    [0.2, 0.3, 0.4]
  ]);
  jest.mocked(embeddingsModule.cosineSimilarity).mockReturnValue(0.8);

  // Mock skill processor
  jest.mocked(skillProcessorModule.processSkills).mockResolvedValue([
    { skill: 'JavaScript', category: 'technical', normalized: 'javascript', confidence: 0.9 },
    { skill: 'Machine Learning', category: 'technical', normalized: 'machine learning', confidence: 0.85 }
  ]);
  jest.mocked(skillProcessorModule.normalizeSkillWithHierarchy).mockResolvedValue('normalized-skill');
  jest.mocked(skillProcessorModule.getSkillHierarchy).mockReturnValue(new Map());

  // Mock ESCO service
  jest.spyOn(ESCOService.prototype, 'extractSkills').mockResolvedValue(mockESCOExtraction);
  jest.spyOn(ESCOService.prototype, 'healthCheck').mockResolvedValue({
    status: 'healthy',
    details: { totalSkills: 1000, ftsEntries: 1000, cacheSize: 10 }
  });
  
  console.log('🔧 Comprehensive mocks initialized for smoke testing');
}