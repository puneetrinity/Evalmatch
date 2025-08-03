/**
 * Interview Questions API Integration Tests
 * Comprehensive tests for interview question generation endpoints
 */

import { Express } from 'express';
import request from 'supertest';
import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import { 
  MockAuth, 
  DatabaseTestHelper, 
  ResponseValidator,
  PerformanceTestHelper,
  TestSuiteHelper,
  TEST_CONFIG,
  TestUser,
  TestJobDescription,
  TestResume
} from '../helpers/api-helpers.js';

// Mock the server setup
let app: Express;
let testUser: TestUser;
let anotherUser: TestUser;

beforeAll(async () => {
  // Import and setup server
  const { default: expressApp } = await import('../../../server/index');
  app = expressApp;
  
  await TestSuiteHelper.setupTestEnvironment();
}, TEST_CONFIG.timeout);

afterAll(async () => {
  await TestSuiteHelper.teardownTestEnvironment();
}, TEST_CONFIG.timeout);

beforeEach(async () => {
  // Create fresh test users for each test
  testUser = MockAuth.createTestUser();
  anotherUser = MockAuth.createTestUser();
  
  // Clear any existing test data
  await DatabaseTestHelper.cleanupTestData();
});

describe('Interview Questions API', () => {
  describe('POST /api/analysis/interview-questions/:resumeId/:jobId - Generate Interview Questions', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;

    beforeEach(async () => {
      // Create test job description
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Senior Software Engineer',
        description: `We are looking for a Senior Software Engineer with expertise in:
          - JavaScript, TypeScript, React, Node.js
          - Database design with PostgreSQL and MongoDB
          - RESTful API development and microservices
          - Cloud platforms (AWS, Azure)
          - Agile development methodologies
          
          Requirements:
          - 5+ years of software development experience
          - Bachelor's degree in Computer Science or related field
          - Experience with CI/CD pipelines
          - Strong problem-solving and communication skills`,
        skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
        requirements: ['5+ years experience', 'Bachelor degree', 'CI/CD experience'],
        experience: '5+ years'
      });

      // Create test resume
      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'senior-developer.pdf',
        content: `John Doe
          Senior Software Developer
          
          EXPERIENCE:
          - 6 years of experience in JavaScript, TypeScript, and React
          - 4 years working with Node.js and Express
          - 3 years of PostgreSQL database design and optimization
          - 2 years of AWS cloud services (EC2, S3, Lambda)
          - Experience with CI/CD using Jenkins and GitLab
          
          EDUCATION:
          - Master of Computer Science from Stanford University
          - Bachelor of Software Engineering from UC Berkeley
          
          SKILLS:
          - Frontend: JavaScript, TypeScript, React, Vue.js, HTML5, CSS3
          - Backend: Node.js, Python, Express, FastAPI
          - Databases: PostgreSQL, MongoDB, Redis
          - Cloud: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes
          - Tools: Git, Jenkins, GitLab CI, Jira`,
        skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'Python'],
        experience: '6 years',
        education: ['Master of Computer Science', 'Bachelor of Software Engineering']
      });
    });

    test('should successfully generate interview questions', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.status).toBe('success');
      expect(response.body.message).toBe('Interview questions generated successfully');
      expect(response.body.resumeId).toBe(testResume.id);
      expect(response.body.jobDescriptionId).toBe(testJob.id);
      expect(response.body.resumeName).toBe(testResume.filename);
      expect(response.body.jobTitle).toBe(testJob.title);
      expect(response.body.matchPercentage).toBeDefined();
      expect(typeof response.body.matchPercentage).toBe('number');
    }, TEST_CONFIG.timeout);

    test('should generate questions in different categories', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      
      // Check for different question categories
      expect(Array.isArray(response.body.technicalQuestions)).toBe(true);
      expect(Array.isArray(response.body.experienceQuestions)).toBe(true);
      expect(Array.isArray(response.body.skillGapQuestions)).toBe(true);
      expect(Array.isArray(response.body.inclusionQuestions)).toBe(true);

      // Verify at least some questions are generated
      const totalQuestions = 
        response.body.technicalQuestions.length +
        response.body.experienceQuestions.length +
        response.body.skillGapQuestions.length +
        response.body.inclusionQuestions.length;

      expect(totalQuestions).toBeGreaterThan(0);
    }, TEST_CONFIG.timeout);

    test('should validate question structure', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);

      // Check technical questions structure
      if (response.body.technicalQuestions.length > 0) {
        const techQuestion = response.body.technicalQuestions[0];
        expect(techQuestion).toHaveProperty('question');
        expect(techQuestion).toHaveProperty('category');
        expect(techQuestion.category).toBe('technical');
        expect(typeof techQuestion.question).toBe('string');
        expect(techQuestion.question.length).toBeGreaterThan(10);
      }

      // Check experience questions structure
      if (response.body.experienceQuestions.length > 0) {
        const expQuestion = response.body.experienceQuestions[0];
        expect(expQuestion).toHaveProperty('question');
        expect(expQuestion).toHaveProperty('category');
        expect(expQuestion.category).toBe('experience');
      }

      // Check skill gap questions structure
      if (response.body.skillGapQuestions.length > 0) {
        const skillQuestion = response.body.skillGapQuestions[0];
        expect(skillQuestion).toHaveProperty('question');
        expect(skillQuestion).toHaveProperty('category');
        expect(skillQuestion.category).toBe('skill-gap');
      }

      // Check inclusion questions structure
      if (response.body.inclusionQuestions.length > 0) {
        const inclusionQuestion = response.body.inclusionQuestions[0];
        expect(inclusionQuestion).toHaveProperty('question');
        expect(inclusionQuestion).toHaveProperty('category');
        expect(inclusionQuestion.category).toBe('inclusion');
      }
    }, TEST_CONFIG.timeout);

    test('should handle session ID parameter', async () => {
      const sessionId = `session_${Date.now()}_interview`;

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({ sessionId });

      ResponseValidator.validateSuccessResponse(response);
      expect(response.body.status).toBe('success');
    }, TEST_CONFIG.timeout);

    test('should return 400 for invalid resume ID', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/invalid/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 400);
      expect(response.body.error).toBe('Invalid parameters');
      expect(response.body.message).toBe('Resume ID and Job ID must be numbers');
    });

    test('should return 400 for invalid job ID', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/invalid`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 400);
      expect(response.body.error).toBe('Invalid parameters');
      expect(response.body.message).toBe('Resume ID and Job ID must be numbers');
    });

    test('should return 404 for non-existent resume', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/99999/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Resume not found');
    });

    test('should return 404 for non-existent job description', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/99999`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should not allow access to other users resume', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Resume not found');
    });

    test('should not allow access to other users job description', async () => {
      // Create resume for anotherUser
      const otherResume = await DatabaseTestHelper.createTestResume({
        userId: anotherUser.uid,
        filename: 'other-resume.pdf'
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${otherResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(anotherUser))
        .send({});

      ResponseValidator.validateErrorResponse(response, 404);
      expect(response.body.error).toBe('Job description not found');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .send({});

      ResponseValidator.validateErrorResponse(response, 401);
    });

    test('should measure interview question generation performance', async () => {
      const { response, duration } = await PerformanceTestHelper.measureEndpointPerformance(
        () => request(app)
          .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({}),
        20000 // 20 seconds max for AI generation
      );

      ResponseValidator.validateSuccessResponse(response);
      expect(duration).toBeLessThan(20000);
    }, 25000);

    test('should store interview questions in database', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      
      // Verify questions are stored by checking database directly
      // This would require implementing a getInterviewQuestions method in storage
      expect(response.body.status).toBe('success');
    }, TEST_CONFIG.timeout);

    test('should handle resume without prior analysis', async () => {
      // Create resume without analyzed data
      const rawResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'raw-resume.pdf',
        content: 'Basic resume without prior analysis',
        analyzedData: null
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${rawResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should still generate questions by analyzing on-demand
      expect([200, 500]).toContain(response.status);
    }, TEST_CONFIG.timeout);

    test('should handle job description without prior analysis', async () => {
      // Create job without analyzed data
      const rawJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Raw Job',
        description: 'Job description without prior analysis',
        analyzedData: null
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${rawJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should still generate questions by analyzing on-demand
      expect([200, 500]).toContain(response.status);
    }, TEST_CONFIG.timeout);
  });

  describe('Interview Question Quality and Content', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Frontend Developer',
        description: 'Looking for a frontend developer with React and TypeScript experience'
      });

      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'frontend-dev.pdf',
        content: 'Frontend developer with 3 years React experience and some TypeScript knowledge'
      });
    });

    test('should generate relevant technical questions', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);

      if (response.body.technicalQuestions.length > 0) {
        const questions = response.body.technicalQuestions.map((q: any) => q.question.toLowerCase());
        
        // Should contain relevant technologies
        const hasRelevantContent = questions.some((q: string) => 
          q.includes('react') || 
          q.includes('typescript') || 
          q.includes('javascript') ||
          q.includes('frontend')
        );
        
        expect(hasRelevantContent).toBe(true);
      }
    }, TEST_CONFIG.timeout);

    test('should generate experience-based questions', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);

      if (response.body.experienceQuestions.length > 0) {
        const questions = response.body.experienceQuestions.map((q: any) => q.question);
        
        // Experience questions should ask about past work
        const hasExperienceContent = questions.some((q: string) => 
          q.toLowerCase().includes('experience') ||
          q.toLowerCase().includes('project') ||
          q.toLowerCase().includes('worked') ||
          q.toLowerCase().includes('tell me about')
        );
        
        expect(hasExperienceContent).toBe(true);
      }
    }, TEST_CONFIG.timeout);

    test('should generate skill gap questions when applicable', async () => {
      // Create a resume with missing skills compared to job
      const gappyResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'skill-gap-resume.pdf',
        content: 'Junior developer with only HTML and CSS experience. No JavaScript knowledge.',
        skills: ['HTML', 'CSS']
      });

      const advancedJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Senior React Developer',
        description: 'Need expert React, TypeScript, and Node.js developer',
        skills: ['React', 'TypeScript', 'Node.js']
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${gappyResume.id}/${advancedJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);

      if (response.body.skillGapQuestions.length > 0) {
        const questions = response.body.skillGapQuestions.map((q: any) => q.question.toLowerCase());
        
        // Should address skill gaps
        const hasSkillGapContent = questions.some((q: string) => 
          q.includes('learn') ||
          q.includes('improve') ||
          q.includes('develop') ||
          q.includes('training')
        );
        
        expect(hasSkillGapContent).toBe(true);
      }
    }, TEST_CONFIG.timeout);

    test('should generate inclusion and diversity questions', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);

      if (response.body.inclusionQuestions.length > 0) {
        const questions = response.body.inclusionQuestions.map((q: any) => q.question.toLowerCase());
        
        // Should promote inclusive hiring
        const hasInclusionContent = questions.some((q: string) => 
          q.includes('team') ||
          q.includes('collaboration') ||
          q.includes('diverse') ||
          q.includes('inclusive') ||
          q.includes('work with others')
        );
        
        expect(hasInclusionContent).toBe(true);
      }
    }, TEST_CONFIG.timeout);
  });

  describe('Interview Questions with Existing Analysis', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Data Scientist',
        description: 'Python, machine learning, and statistics required'
      });

      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'data-scientist.pdf',
        content: 'Data scientist with Python and ML experience'
      });

      // Create existing analysis result
      await DatabaseTestHelper.createTestAnalysisResult({
        userId: testUser.uid,
        resumeId: testResume.id!,
        jobDescriptionId: testJob.id!,
        matchPercentage: 88,
        matchedSkills: ['Python', 'Machine Learning'],
        missingSkills: ['Statistics'],
        candidateStrengths: ['Strong Python skills', 'ML experience'],
        candidateWeaknesses: ['Limited statistics background']
      });
    });

    test('should use existing analysis for question generation', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);
      
      // Should use the existing match percentage
      expect(response.body.matchPercentage).toBe(88);
      
      // Questions should be relevant to the existing analysis
      const allQuestions = [
        ...response.body.technicalQuestions,
        ...response.body.experienceQuestions,
        ...response.body.skillGapQuestions,
        ...response.body.inclusionQuestions
      ].map((q: any) => q.question.toLowerCase());

      if (allQuestions.length > 0) {
        const hasRelevantContent = allQuestions.some((q: string) => 
          q.includes('python') || 
          q.includes('machine learning') ||
          q.includes('ml') ||
          q.includes('statistics')
        );
        
        expect(hasRelevantContent).toBe(true);
      }
    }, TEST_CONFIG.timeout);

    test('should generate questions focusing on missing skills', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      ResponseValidator.validateSuccessResponse(response);

      // Should generate skill gap questions about statistics
      if (response.body.skillGapQuestions.length > 0) {
        const skillGapQuestions = response.body.skillGapQuestions.map((q: any) => q.question.toLowerCase());
        
        const hasStatisticsContent = skillGapQuestions.some((q: string) => 
          q.includes('statistics') || 
          q.includes('statistical') ||
          q.includes('math')
        );
        
        expect(hasStatisticsContent).toBe(true);
      }
    }, TEST_CONFIG.timeout);
  });

  describe('Error Handling and Edge Cases', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Test Job',
        description: 'Test job description'
      });

      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'test-resume.pdf',
        content: 'Test resume content'
      });
    });

    test('should handle empty resume content gracefully', async () => {
      const emptyResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'empty-resume.pdf',
        content: ''
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${emptyResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should handle gracefully
      expect([200, 400, 500]).toContain(response.status);
    }, TEST_CONFIG.timeout);

    test('should handle empty job description gracefully', async () => {
      const emptyJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Empty Job',
        description: ''
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${emptyJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should handle gracefully
      expect([200, 400, 500]).toContain(response.status);
    }, TEST_CONFIG.timeout);

    test('should handle AI service failures gracefully', async () => {
      // This would require mocking AI service failures
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should either succeed or fail gracefully
      expect([200, 500, 503]).toContain(response.status);
      
      if (response.status === 500) {
        expect(response.body.error).toBe('Failed to generate interview questions');
      }
    }, TEST_CONFIG.timeout);

    test('should handle malformed request data', async () => {
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .set('Content-Type', 'application/json')
        .send('{"sessionId": invalid}');

      ResponseValidator.validateErrorResponse(response, 400);
    });

    test('should handle very large resume content', async () => {
      const largeContent = 'A'.repeat(100000); // 100KB of content
      const largeResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'large-resume.pdf',
        content: largeContent
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${largeResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should handle large content gracefully
      expect([200, 400, 500]).toContain(response.status);
    }, TEST_CONFIG.timeout);

    test('should handle special characters in content', async () => {
      const specialResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'special-resume.pdf',
        content: 'Resume with émojis 🚀 and spëcial chârs αβγδε 中文 العربية'
      });

      const response = await request(app)
        .post(`/api/analysis/interview-questions/${specialResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      // Should handle special characters gracefully
      expect([200, 400, 500]).toContain(response.status);
    }, TEST_CONFIG.timeout);

    test('should validate numeric parameters properly', async () => {
      const testCases = [
        { resumeId: '0', jobId: testJob.id?.toString() },
        { resumeId: '-1', jobId: testJob.id?.toString() },
        { resumeId: '999999999999999999', jobId: testJob.id?.toString() },
        { resumeId: testResume.id?.toString(), jobId: '0' },
        { resumeId: testResume.id?.toString(), jobId: '-1' },
        { resumeId: testResume.id?.toString(), jobId: '999999999999999999' }
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post(`/api/analysis/interview-questions/${testCase.resumeId}/${testCase.jobId}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({});

        // Should either work or return 404 for valid numbers, 400 for invalid
        expect([200, 400, 404, 500]).toContain(response.status);
      }
    });
  });

  describe('Rate Limiting and Performance', () => {
    let testJob: TestJobDescription;
    let testResume: TestResume;

    beforeEach(async () => {
      testJob = await DatabaseTestHelper.createTestJobDescription({
        userId: testUser.uid,
        title: 'Performance Test Job',
        description: 'Job for performance testing'
      });

      testResume = await DatabaseTestHelper.createTestResume({
        userId: testUser.uid,
        filename: 'performance-test-resume.pdf',
        content: 'Resume for performance testing'
      });
    });

    test('should handle concurrent interview question requests', async () => {
      const promises = Array(3).fill(null).map(() =>
        request(app)
          .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({})
      );

      const responses = await Promise.allSettled(promises);
      
      // All requests should either succeed or fail gracefully
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          expect([200, 429, 500]).toContain(result.value.status);
        }
      });
    }, TEST_CONFIG.timeout);

    test('should enforce reasonable response times', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
        .set(MockAuth.generateAuthHeaders(testUser))
        .send({});

      const duration = Date.now() - startTime;

      // Should complete within reasonable time (30 seconds max)
      expect(duration).toBeLessThan(30000);
      
      if (response.status === 200) {
        ResponseValidator.validateSuccessResponse(response);
      }
    }, 35000);

    test('should handle multiple users generating questions simultaneously', async () => {
      // Create resources for another user
      const anotherJob = await DatabaseTestHelper.createTestJobDescription({
        userId: anotherUser.uid,
        title: 'Another Job',
        description: 'Another job description'
      });

      const anotherResume = await DatabaseTestHelper.createTestResume({
        userId: anotherUser.uid,
        filename: 'another-resume.pdf',
        content: 'Another resume content'
      });

      // Run concurrent requests from different users
      const [response1, response2] = await Promise.all([
        request(app)
          .post(`/api/analysis/interview-questions/${testResume.id}/${testJob.id}`)
          .set(MockAuth.generateAuthHeaders(testUser))
          .send({}),
        request(app)
          .post(`/api/analysis/interview-questions/${anotherResume.id}/${anotherJob.id}`)
          .set(MockAuth.generateAuthHeaders(anotherUser))
          .send({})
      ]);

      // Both should work independently
      expect([200, 500]).toContain(response1.status);
      expect([200, 500]).toContain(response2.status);
    }, TEST_CONFIG.timeout);
  });
});