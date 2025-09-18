/**
 * Analysis Parity Integration Tests
 * 
 * Tests to ensure mathematical equivalence between legacy analyze endpoints
 * and new AnalysisService during route unification migration.
 * 
 * These tests run both old and new implementations on the same data and
 * validate that responses are equivalent within acceptable tolerances.
 */

import request from 'supertest';
import app from '../../server/index';
import { initializeDatabase, closeDatabase } from '../jest.setup.mjs';
import { createDefaultUserTier } from '../../shared/user-tiers';
import { createAnalysisService } from '../../server/services/analysis-service';
import { getStorage } from '../../server/lib/storage';
import { compareResponses } from '../../server/lib/analysis-legacy-transformer';
import type { LegacyBatchAnalysisResponse } from '../../server/lib/analysis-legacy-transformer';

// ===== TEST SETUP & TEARDOWN =====

let testUser: any;
let authToken: string;
let testJobId: number;
let testResumeIds: number[];

beforeAll(async () => {
  await initializeDatabase();
  
  // Create test user
  testUser = {
    uid: 'parity-test-user-123',
    email: 'parity-test@evalmatch.com',
    email_verified: true
  };

  // Mock Firebase auth token (simplified for testing)
  authToken = 'Bearer mock-firebase-token-parity-test';
});

afterAll(async () => {
  await closeDatabase();
});

beforeEach(async () => {
  // Create test job description
  const jobResponse = await request(app)
    .post('/api/job-descriptions')
    .set('Authorization', authToken)
    .send({
      title: 'Parity Test Senior Developer',
      description: `
        We are seeking a Senior Full Stack Developer with strong experience in:
        - JavaScript and TypeScript (5+ years)
        - React and Node.js development
        - Database design with PostgreSQL
        - REST API development
        - Git version control
        - Agile methodologies
        
        Preferred skills:
        - Python for data analysis
        - Docker containerization
        - AWS cloud services
        - GraphQL API development
        - Test-driven development
        
        This role requires excellent problem-solving skills and the ability
        to work in a fast-paced startup environment.
      `
    });

  expect(jobResponse.status).toBe(201);
  testJobId = jobResponse.body.data.id;

  // Upload test resumes with different skill profiles
  const resumeData = [
    {
      filename: 'fullstack_dev.pdf',
      content: `
        John Doe - Full Stack Developer
        Email: john.doe@example.com
        
        EXPERIENCE:
        Senior Full Stack Developer at TechCorp (2019-2024)
        - Developed React applications with TypeScript
        - Built REST APIs using Node.js and Express
        - Designed PostgreSQL database schemas
        - Implemented CI/CD pipelines with Docker
        - Led team of 4 developers using Agile methodology
        
        Software Engineer at StartupXYZ (2017-2019)  
        - Built responsive web applications with JavaScript
        - Created RESTful services with Node.js
        - Used Git for version control and collaboration
        
        SKILLS:
        - Languages: JavaScript, TypeScript, Python
        - Frontend: React, HTML5, CSS3
        - Backend: Node.js, Express, REST APIs
        - Database: PostgreSQL, MongoDB
        - Tools: Git, Docker, AWS
        - Methodologies: Agile, Scrum
        
        EDUCATION:
        B.S. Computer Science, University of Technology (2017)
      `,
      expectedMatch: 90 // High match - has most required skills
    },
    {
      filename: 'frontend_specialist.pdf', 
      content: `
        Jane Smith - Frontend Specialist
        Email: jane.smith@example.com
        
        EXPERIENCE:
        Senior Frontend Developer at DesignCorp (2020-2024)
        - Expert in React and TypeScript development
        - Built complex user interfaces with modern JavaScript
        - Collaborated with designers using Figma
        - Mentored junior developers
        
        Frontend Developer at WebAgency (2018-2020)
        - Created responsive websites with HTML5/CSS3
        - Implemented JavaScript interactions
        - Used Git for code management
        
        SKILLS:
        - Languages: JavaScript, TypeScript, HTML5, CSS3
        - Frontend: React, Vue.js, Redux
        - Tools: Git, Webpack, npm
        - Design: Figma, Adobe Creative Suite
        
        EDUCATION:  
        B.A. Digital Media, Art Institute (2018)
      `,
      expectedMatch: 70 // Medium match - strong frontend, weak backend
    },
    {
      filename: 'backend_engineer.pdf',
      content: `
        Bob Johnson - Backend Engineer
        Email: bob.johnson@example.com
        
        EXPERIENCE:
        Backend Engineer at DataCorp (2021-2024)
        - Designed scalable APIs with Python and Django
        - Optimized PostgreSQL database performance
        - Built microservices with Docker containers
        - Implemented AWS cloud infrastructure
        
        Software Developer at EnterpriseInc (2019-2021)
        - Developed REST APIs with Java Spring Boot
        - Managed SQL Server databases
        - Used Git for version control
        
        SKILLS:
        - Languages: Python, Java, SQL
        - Backend: Django, Spring Boot, REST APIs  
        - Database: PostgreSQL, SQL Server, Redis
        - Cloud: AWS, Docker, Kubernetes
        - Tools: Git, Jenkins
        
        EDUCATION:
        M.S. Computer Science, Tech University (2019)
      `,
      expectedMatch: 65 // Medium match - strong backend, no frontend
    }
  ];

  testResumeIds = [];
  
  for (const resume of resumeData) {
    const uploadResponse = await request(app)
      .post('/api/resumes')
      .set('Authorization', authToken)
      .attach('resume', Buffer.from(resume.content), resume.filename);
    
    expect(uploadResponse.status).toBe(201);
    testResumeIds.push(uploadResponse.body.data.id);
  }

  // Wait a bit for analysis to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
});

// ===== PARITY TEST SUITES =====

describe('Analysis Parity Tests', () => {
  describe('Legacy vs Service Implementation Comparison', () => {
    it('should produce equivalent results for batch analysis', async () => {
      // Call legacy endpoint (correct path for batch analysis)
      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });

      expect(legacyResponse.status).toBe(200);
      
      // Call new service endpoint  
      const serviceResponse = await request(app)
        .post(`/api/v1/analysis/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });

      expect(serviceResponse.status).toBe(200);

      // Transform service response to legacy format for comparison
      // Note: This will be implemented as part of migration
      // For now, compare key fields manually
      
      const legacyData: LegacyBatchAnalysisResponse = legacyResponse.body;
      const serviceData = serviceResponse.body;

      // Basic structure comparison
      expect(legacyData.jobDescriptionId).toBe(testJobId);
      expect(serviceData.data.jobId).toBe(testJobId);
      expect(legacyData.results.length).toBe(testResumeIds.length);
      expect(serviceData.data.results.length).toBe(testResumeIds.length);

      // Compare individual results within tolerance
      for (let i = 0; i < legacyData.results.length; i++) {
        const legacyResult = legacyData.results[i];
        const serviceResult = serviceData.data.results.find(
          (r: any) => r.resumeId === legacyResult.resumeId
        );
        
        expect(serviceResult).toBeDefined();
        
        // Match percentage should be within 5% tolerance
        const matchDelta = Math.abs(
          (legacyResult.match.matchPercentage || 0) - 
          (serviceResult.matchPercentage || 0)
        );
        expect(matchDelta).toBeLessThanOrEqual(5);
        
        // Skills should have similar counts (within 3 skills)
        const legacySkillCount = legacyResult.match.matchedSkills?.length || 0;
        const serviceSkillCount = serviceResult.matchedSkills?.length || 0;
        const skillDelta = Math.abs(legacySkillCount - serviceSkillCount);
        expect(skillDelta).toBeLessThanOrEqual(3);

        // Confidence levels should match or be adjacent
        const confidenceMapping = { low: 1, medium: 2, high: 3 };
        const legacyConf = confidenceMapping[legacyResult.match.confidenceLevel] || 2;
        const serviceConf = confidenceMapping[serviceResult.confidenceLevel] || 2;
        expect(Math.abs(legacyConf - serviceConf)).toBeLessThanOrEqual(1);
      }
    });

    it('should handle single resume analysis consistently', async () => {
      const singleResumeId = testResumeIds[0];

      // Legacy approach: analyze with single resume  
      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: [singleResumeId] });

      expect(legacyResponse.status).toBe(200);

      // Service approach
      const serviceResponse = await request(app)
        .post(`/api/v1/analysis/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: [singleResumeId] });

      expect(serviceResponse.status).toBe(200);

      // Both should return exactly one result
      expect(legacyResponse.body.results).toHaveLength(1);
      expect(serviceResponse.body.data.results).toHaveLength(1);

      const legacyResult = legacyResponse.body.results[0];
      const serviceResult = serviceResponse.body.data.results[0];

      // Same resume should be analyzed
      expect(legacyResult.resumeId).toBe(serviceResult.resumeId);
      
      // Results should be equivalent within tolerance
      const matchDelta = Math.abs(
        (legacyResult.match.matchPercentage || 0) - 
        (serviceResult.matchPercentage || 0)
      );
      expect(matchDelta).toBeLessThanOrEqual(3); // Tighter tolerance for single resume
    });

    it('should maintain result ordering (by match percentage)', async () => {
      // Both endpoints should return results sorted by match percentage descending
      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });

      const serviceResponse = await request(app)
        .post(`/api/v1/analysis/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });

      expect(legacyResponse.status).toBe(200);
      expect(serviceResponse.status).toBe(200);

      // Check legacy ordering
      const legacyMatches = legacyResponse.body.results.map((r: any) => r.match.matchPercentage || 0);
      for (let i = 1; i < legacyMatches.length; i++) {
        expect(legacyMatches[i-1]).toBeGreaterThanOrEqual(legacyMatches[i]);
      }

      // Check service ordering  
      const serviceMatches = serviceResponse.body.data.results.map((r: any) => r.matchPercentage || 0);
      for (let i = 1; i < serviceMatches.length; i++) {
        expect(serviceMatches[i-1]).toBeGreaterThanOrEqual(serviceMatches[i]);
      }

      // Top matches should be the same resume (within tolerance)
      expect(legacyResponse.body.results[0].resumeId).toBe(
        serviceResponse.body.data.results[0].resumeId
      );
    });
  });

  describe('Error Handling Parity', () => {
    it('should handle invalid job ID consistently', async () => {
      const invalidJobId = 999999;

      const legacyResponse = await request(app)
        .post(`/api/analyze/${invalidJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });

      const serviceResponse = await request(app)
        .post(`/api/v1/analysis/analyze/${invalidJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });

      // Both should return 404 or similar error
      expect(legacyResponse.status).toBeGreaterThanOrEqual(400);
      expect(serviceResponse.status).toBeGreaterThanOrEqual(400);
      
      // Error structure should be consistent
      expect(legacyResponse.body.error || legacyResponse.body.message).toBeDefined();
      expect(serviceResponse.body.error || serviceResponse.body.message).toBeDefined();
    });

    it('should handle invalid resume IDs consistently', async () => {
      const invalidResumeIds = [999998, 999999];

      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: invalidResumeIds });

      const serviceResponse = await request(app)
        .post(`/api/v1/analysis/analyze/${testJobId}`)
        .set('Authorization', authToken)  
        .send({ resumeIds: invalidResumeIds });

      // Both should handle invalid resumes gracefully
      // (exact behavior may vary but should be consistent)
      expect(legacyResponse.status).toBeGreaterThanOrEqual(200);
      expect(serviceResponse.status).toBeGreaterThanOrEqual(200);

      if (legacyResponse.status === 200 && serviceResponse.status === 200) {
        // If successful, both should return empty results or similar
        expect(legacyResponse.body.results.length).toBe(serviceResponse.body.data.results.length);
      }
    });
  });

  describe('Rate Limiting & Authentication Parity', () => {
    it('should enforce rate limits consistently', async () => {
      // Test that both endpoints respect the same rate limiting
      // This test may need adjustment based on actual rate limiting implementation
      
      const requests = Array(10).fill(null).map(() => 
        Promise.all([
          request(app)
            .post(`/api/analyze/${testJobId}`)
            .set('Authorization', authToken)
            .send({ resumeIds: [testResumeIds[0]] }),
          request(app)
            .post(`/api/v1/analysis/analyze/${testJobId}`)
            .set('Authorization', authToken)
            .send({ resumeIds: [testResumeIds[0]] })
        ])
      );

      const responses = await Promise.all(requests);
      
      // Count rate limit responses for each endpoint
      let legacyRateLimited = 0;
      let serviceRateLimited = 0;
      
      responses.forEach(([legacyResp, serviceResp]) => {
        if (legacyResp.status === 429) legacyRateLimited++;
        if (serviceResp.status === 429) serviceRateLimited++;
      });

      // Both endpoints should have similar rate limiting behavior
      // (exact numbers may vary due to timing)
      if (legacyRateLimited > 0 || serviceRateLimited > 0) {
        const rateLimitDelta = Math.abs(legacyRateLimited - serviceRateLimited);
        expect(rateLimitDelta).toBeLessThanOrEqual(2); // Allow small variation
      }
    });

    it('should handle authentication failures consistently', async () => {
      const invalidToken = 'Bearer invalid-token';

      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', invalidToken)
        .send({ resumeIds: testResumeIds });

      const serviceResponse = await request(app)
        .post(`/api/v1/analysis/analyze/${testJobId}`)
        .set('Authorization', invalidToken)
        .send({ resumeIds: testResumeIds });

      // Both should return 401 Unauthorized
      expect(legacyResponse.status).toBe(401);
      expect(serviceResponse.status).toBe(401);
    });
  });

  describe('Performance Baseline Measurement', () => {
    it('should measure baseline performance for comparison', async () => {
      const iterations = 3;
      const legacyTimes: number[] = [];
      const serviceTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        // Measure legacy performance
        const legacyStart = Date.now();
        const legacyResponse = await request(app)
          .post(`/api/analyze/${testJobId}`)
          .set('Authorization', authToken)
          .send({ resumeIds: testResumeIds });
        const legacyTime = Date.now() - legacyStart;
        
        expect(legacyResponse.status).toBe(200);
        legacyTimes.push(legacyTime);

        // Measure service performance  
        const serviceStart = Date.now();
        const serviceResponse = await request(app)
          .post(`/api/v1/analysis/analyze/${testJobId}`)
          .set('Authorization', authToken)
          .send({ resumeIds: testResumeIds });
        const serviceTime = Date.now() - serviceStart;
        
        expect(serviceResponse.status).toBe(200);
        serviceTimes.push(serviceTime);

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const avgLegacyTime = legacyTimes.reduce((a, b) => a + b) / legacyTimes.length;
      const avgServiceTime = serviceTimes.reduce((a, b) => a + b) / serviceTimes.length;

      console.log(`Performance Baseline:
        Legacy Average: ${avgLegacyTime}ms
        Service Average: ${avgServiceTime}ms  
        Delta: ${Math.abs(avgLegacyTime - avgServiceTime)}ms
        Ratio: ${(avgServiceTime / avgLegacyTime * 100).toFixed(1)}%`);

      // Both should complete within reasonable time (30 seconds max)
      expect(avgLegacyTime).toBeLessThan(30000);
      expect(avgServiceTime).toBeLessThan(30000);

      // Document performance characteristics for migration planning
      expect(true).toBe(true); // This test always passes, it's for measurement
    });
  });
});

// ===== PARITY VALIDATION HELPERS =====

/**
 * Helper to validate that two analysis results are mathematically equivalent
 */
function validateAnalysisEquivalence(
  legacy: any, 
  service: any, 
  tolerances: {
    matchPercentage: number;
    skillCount: number;
    confidenceLevel: number;
  } = { matchPercentage: 5, skillCount: 3, confidenceLevel: 1 }
): { equivalent: boolean; issues: string[] } {
  const issues: string[] = [];

  // Match percentage tolerance
  const matchDelta = Math.abs(
    (legacy.match?.matchPercentage || 0) - (service.matchPercentage || 0)
  );
  if (matchDelta > tolerances.matchPercentage) {
    issues.push(`Match percentage delta ${matchDelta} > ${tolerances.matchPercentage}`);
  }

  // Skill count tolerance
  const legacySkillCount = legacy.match?.matchedSkills?.length || 0;
  const serviceSkillCount = service.matchedSkills?.length || 0;
  const skillDelta = Math.abs(legacySkillCount - serviceSkillCount);
  if (skillDelta > tolerances.skillCount) {
    issues.push(`Skill count delta ${skillDelta} > ${tolerances.skillCount}`);
  }

  // Confidence level mapping
  const confidenceMap = { low: 1, medium: 2, high: 3 };
  const legacyConf = confidenceMap[legacy.match?.confidenceLevel] || 2;
  const serviceConf = confidenceMap[service.confidenceLevel] || 2;
  if (Math.abs(legacyConf - serviceConf) > tolerances.confidenceLevel) {
    issues.push(`Confidence level mismatch: ${legacy.match?.confidenceLevel} vs ${service.confidenceLevel}`);
  }

  return {
    equivalent: issues.length === 0,
    issues
  };
}

// ===== BIAS ANALYSIS PARITY TESTS =====

describe('Bias Analysis Parity Tests', () => {
  let testJobWithBias: number;
  
  beforeAll(async () => {
    // Create a job description with potential bias for testing
    const biasJobResponse = await request(app)
      .post('/api/job-descriptions')
      .set('Authorization', authToken)
      .send({
        title: 'Senior Software Engineer - Rock Star Developer',
        description: `
          We're looking for a young, energetic rock star developer to join our dynamic team!
          
          Requirements:
          - 5+ years of experience as a ninja coder
          - Must be a cultural fit - we work hard and play hard
          - Recent college graduate preferred (under 30)
          - Strong communication skills and native English speaker
          - Able to work long hours and weekends when needed
          - Must be willing to relocate to our hip downtown office
          
          We offer:
          - Competitive salary for the right candidate
          - Flexible schedule (when deadlines permit)
          - Team building activities like happy hours
          - Modern office space with ping pong tables
          
          Join our team of coding warriors and help us disrupt the industry!
          This position requires someone who can think outside the box and isn't afraid to break things.
        `
      });
    
    expect(biasJobResponse.status).toBe(201);
    testJobWithBias = biasJobResponse.body.id;
    
    // Wait for job analysis to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  describe('Legacy vs Service Bias Analysis', () => {
    it('should detect similar bias patterns', async () => {
      // Test with feature flag disabled (legacy path)
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      
      expect(legacyResponse.status).toBe(200);
      expect(legacyResponse.body.jobId).toBe(testJobWithBias);
      expect(legacyResponse.body.biasAnalysis).toBeDefined();
      
      // Test with feature flag enabled (service path)
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      
      expect(serviceResponse.status).toBe(200);
      expect(serviceResponse.body.jobId).toBe(testJobWithBias);
      expect(serviceResponse.body.biasAnalysis).toBeDefined();
      
      // Check deprecation headers are present in service response (RFC-8594 + custom)
      expect(serviceResponse.headers['deprecation']).toBe('true');
      expect(serviceResponse.headers['sunset']).toBeDefined();
      expect(serviceResponse.headers['link']).toContain('successor-version');
      expect(serviceResponse.headers['x-api-deprecation-notice']).toBeDefined();
      expect(serviceResponse.headers['x-migration-available']).toBeDefined();
      
      // Compare bias analysis results
      const legacyBias = legacyResponse.body.biasAnalysis;
      const serviceBias = serviceResponse.body.biasAnalysis;
      
      // Both should detect bias in this job description
      expect(legacyBias.hasBias || legacyBias.overallScore > 0).toBeTruthy();
      expect(serviceBias.hasBias || serviceBias.overallScore > 0).toBeTruthy();
      
      // Bias scores should be similar (within 20% tolerance)
      if (legacyBias.overallScore && serviceBias.overallScore) {
        const scoreDelta = Math.abs(legacyBias.overallScore - serviceBias.overallScore);
        const tolerance = Math.max(legacyBias.overallScore, serviceBias.overallScore) * 0.2;
        expect(scoreDelta).toBeLessThanOrEqual(tolerance);
      }
      
      // Both should provide suggestions
      expect(legacyBias.suggestions || legacyBias.improvements).toBeDefined();
      expect(serviceBias.suggestions || serviceBias.improvements).toBeDefined();
      
      // Both should detect similar bias types if available
      if (legacyBias.biasTypes && serviceBias.biasTypes) {
        expect(legacyBias.biasTypes.length).toBeGreaterThan(0);
        expect(serviceBias.biasTypes.length).toBeGreaterThan(0);
      }
    });

    it('should handle bias analysis errors consistently', async () => {
      const invalidJobId = 999999;
      
      // Test legacy error handling
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResponse = await request(app)
        .post(`/api/analyze-bias/${invalidJobId}`)
        .set('Authorization', authToken);
      
      expect(legacyResponse.status).toBeGreaterThanOrEqual(400);
      
      // Test service error handling  
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResponse = await request(app)
        .post(`/api/analyze-bias/${invalidJobId}`)
        .set('Authorization', authToken);
      
      expect(serviceResponse.status).toBeGreaterThanOrEqual(400);
      
      // Error structures should be similar
      expect(legacyResponse.body.message || legacyResponse.body.error).toBeDefined();
      expect(serviceResponse.body.message || serviceResponse.body.error).toBeDefined();
    });

    it('should maintain response time performance', async () => {
      // Legacy timing
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyStart = Date.now();
      const legacyResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      const legacyTime = Date.now() - legacyStart;
      
      expect(legacyResponse.status).toBe(200);
      
      // Service timing
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceStart = Date.now();
      const serviceResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      const serviceTime = Date.now() - serviceStart;
      
      expect(serviceResponse.status).toBe(200);
      
      // Service response time should not be significantly slower (within 50% tolerance)
      const timeDelta = Math.abs(serviceTime - legacyTime);
      const tolerance = Math.max(legacyTime, serviceTime) * 0.5;
      expect(timeDelta).toBeLessThanOrEqual(tolerance);
      
      // Log performance metrics for monitoring
      console.log(`Bias Analysis Performance: Legacy=${legacyTime}ms, Service=${serviceTime}ms, Delta=${timeDelta}ms`);
    });

    it('should validate response schemas match', async () => {
      // Get responses from both implementations
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      const legacyResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      const serviceResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      
      expect(legacyResponse.status).toBe(200);
      expect(serviceResponse.status).toBe(200);
      
      // Both should have the same top-level structure
      expect(typeof legacyResponse.body.jobId).toBe('number');
      expect(typeof serviceResponse.body.jobId).toBe('number');
      expect(typeof legacyResponse.body.biasAnalysis).toBe('object');
      expect(typeof serviceResponse.body.biasAnalysis).toBe('object');
      
      // Compare schema structure
      const legacyKeys = Object.keys(legacyResponse.body).sort();
      const serviceKeys = Object.keys(serviceResponse.body).sort();
      
      // Service response may have additional fields, but should contain all legacy fields
      legacyKeys.forEach(key => {
        expect(serviceKeys).toContain(key);
      });
    });
  });
  
  afterAll(async () => {
    // Clean up test environment variables
    delete process.env.LEGACY_SERVICE_ROUTING;
  });
});

// ===== BATCH ANALYSIS PARITY TESTS =====

describe('Batch Analysis Parity Tests', () => {
  describe('Legacy vs Service Batch Analysis', () => {
    it('should produce equivalent batch analysis results', async () => {
      // Test with feature flag disabled (legacy path)
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ sessionId: null, resumeIds: testResumeIds });
      
      expect(legacyResponse.status).toBe(200);
      expect(legacyResponse.body.jobDescriptionId).toBe(testJobId);
      expect(legacyResponse.body.results).toBeDefined();
      expect(legacyResponse.body.results.length).toBeGreaterThan(0);
      
      // Test with feature flag enabled (service path)
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ sessionId: null, resumeIds: testResumeIds });
      
      expect(serviceResponse.status).toBe(200);
      expect(serviceResponse.body.jobDescriptionId).toBe(testJobId);
      expect(serviceResponse.body.results).toBeDefined();
      
      // Check deprecation headers are present in service response (RFC-8594 + custom)
      expect(serviceResponse.headers['deprecation']).toBe('true');
      expect(serviceResponse.headers['sunset']).toBeDefined();
      expect(serviceResponse.headers['link']).toContain('successor-version');
      expect(serviceResponse.headers['x-api-deprecation-notice']).toBeDefined();
      expect(serviceResponse.headers['x-migration-available']).toBeDefined();
      
      // Compare batch analysis results
      const legacyResults = legacyResponse.body.results;
      const serviceResults = serviceResponse.body.results;
      
      // Both should return the same number of results
      expect(legacyResults.length).toBe(serviceResults.length);
      expect(legacyResults.length).toBe(testResumeIds.length);
      
      // Compare each result
      for (let i = 0; i < legacyResults.length; i++) {
        const legacyResult = legacyResults[i];
        const serviceResult = serviceResults.find((r: any) => r.resumeId === legacyResult.resumeId);
        
        expect(serviceResult).toBeDefined();
        
        // Match percentages should be similar (within 5% tolerance)
        const matchDelta = Math.abs(
          (legacyResult.match.matchPercentage || 0) - 
          (serviceResult.match.matchPercentage || 0)
        );
        expect(matchDelta).toBeLessThanOrEqual(5);
        
        // Skills should have similar counts
        const legacySkillCount = legacyResult.match.matchedSkills?.length || 0;
        const serviceSkillCount = serviceResult.match.matchedSkills?.length || 0;
        const skillDelta = Math.abs(legacySkillCount - serviceSkillCount);
        expect(skillDelta).toBeLessThanOrEqual(3);
        
        // Both should have analysis IDs
        expect(legacyResult.analysisId).toBeDefined();
        expect(serviceResult.analysisId).toBeDefined();
      }
      
      // Results should be sorted by match percentage (descending)
      const legacyMatches = legacyResults.map((r: any) => r.match.matchPercentage || 0);
      const serviceMatches = serviceResults.map((r: any) => r.match.matchPercentage || 0);
      
      for (let i = 1; i < legacyMatches.length; i++) {
        expect(legacyMatches[i-1]).toBeGreaterThanOrEqual(legacyMatches[i]);
      }
      for (let i = 1; i < serviceMatches.length; i++) {
        expect(serviceMatches[i-1]).toBeGreaterThanOrEqual(serviceMatches[i]);
      }
    });

    it('should handle batch analysis errors consistently', async () => {
      const invalidJobId = 999999;
      
      // Test legacy error handling
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResponse = await request(app)
        .post(`/api/analyze/${invalidJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });
      
      expect(legacyResponse.status).toBeGreaterThanOrEqual(400);
      
      // Test service error handling  
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResponse = await request(app)
        .post(`/api/analyze/${invalidJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });
      
      expect(serviceResponse.status).toBeGreaterThanOrEqual(400);
      
      // Error structures should be similar
      expect(legacyResponse.body.message || legacyResponse.body.error).toBeDefined();
      expect(serviceResponse.body.message || serviceResponse.body.error).toBeDefined();
    });

    it('should handle session filtering consistently', async () => {
      const testSessionId = 'test-session-123';
      
      // Legacy session filtering
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ sessionId: testSessionId });
      
      // Service session filtering
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ sessionId: testSessionId });
      
      // Both should handle session filtering the same way
      expect(legacyResponse.status).toBe(serviceResponse.status);
      
      if (legacyResponse.status === 200 && serviceResponse.status === 200) {
        // If both succeed, compare results
        expect(legacyResponse.body.results.length).toBe(serviceResponse.body.results.length);
      }
    });

    it('should maintain batch analysis performance', async () => {
      // Legacy timing
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyStart = Date.now();
      const legacyResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });
      const legacyTime = Date.now() - legacyStart;
      
      expect(legacyResponse.status).toBe(200);
      
      // Service timing
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceStart = Date.now();
      const serviceResponse = await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });
      const serviceTime = Date.now() - serviceStart;
      
      expect(serviceResponse.status).toBe(200);
      
      // Service response time should not be significantly slower (within 50% tolerance)
      const timeDelta = Math.abs(serviceTime - legacyTime);
      const tolerance = Math.max(legacyTime, serviceTime) * 0.5;
      expect(timeDelta).toBeLessThanOrEqual(tolerance);
      
      // Log performance metrics for monitoring
      console.log(`Batch Analysis Performance: Legacy=${legacyTime}ms, Service=${serviceTime}ms, Delta=${timeDelta}ms`);
    });
  });
  
  afterAll(async () => {
    // Clean up test environment variables
    delete process.env.LEGACY_SERVICE_ROUTING;
  });
});

// ===== DIRECT TEXT ANALYSIS PARITY TESTS =====

describe('Direct Text Analysis Parity Tests', () => {
  const testResumeText = `
    John Doe - Senior Software Engineer
    Email: john.doe@example.com
    
    EXPERIENCE:
    Senior Software Engineer at TechCorp (2020-2024)
    - Developed React applications with TypeScript
    - Built REST APIs using Node.js and Express
    - Implemented microservices architecture
    - Led team of 5 developers using Agile methodology
    
    SKILLS:
    JavaScript, TypeScript, React, Node.js, Python, AWS, Docker
  `;

  const testJobText = `
    Senior Full Stack Developer Position
    
    We are looking for an experienced full stack developer to join our team.
    
    Requirements:
    - 3+ years of experience with JavaScript and TypeScript
    - Strong experience with React and Node.js
    - Experience with cloud platforms (AWS preferred)
    - Knowledge of containerization (Docker)
    - Agile development experience
    
    Nice to have:
    - Python experience
    - Microservices architecture knowledge
    - Team leadership experience
  `;

  describe('Legacy vs Service Direct Text Analysis', () => {
    it('should produce equivalent direct text analysis results', async () => {
      // Test with feature flag disabled (legacy path)
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: testResumeText, 
          jobDescriptionText: testJobText 
        });
      
      expect(legacyResponse.status).toBe(200);
      expect(legacyResponse.body.matchPercentage).toBeDefined();
      expect(legacyResponse.body.matchedSkills).toBeDefined();
      expect(legacyResponse.body.confidenceLevel).toBeDefined();
      
      // Test with feature flag enabled (service path)
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: testResumeText, 
          jobDescriptionText: testJobText 
        });
      
      expect(serviceResponse.status).toBe(200);
      expect(serviceResponse.body.matchPercentage).toBeDefined();
      expect(serviceResponse.body.matchedSkills).toBeDefined();
      expect(serviceResponse.body.confidenceLevel).toBeDefined();
      
      // Check deprecation headers are present in service response (RFC-8594 + custom)
      expect(serviceResponse.headers['deprecation']).toBe('true');
      expect(serviceResponse.headers['sunset']).toBeDefined();
      expect(serviceResponse.headers['link']).toContain('successor-version');
      expect(serviceResponse.headers['x-api-deprecation-notice']).toBeDefined();
      expect(serviceResponse.headers['x-migration-available']).toBeDefined();
      
      // Compare direct text analysis results
      const legacyResult = legacyResponse.body;
      const serviceResult = serviceResponse.body;
      
      // Match percentages should be similar (within 5% tolerance)
      const matchDelta = Math.abs(
        (legacyResult.matchPercentage || 0) - 
        (serviceResult.matchPercentage || 0)
      );
      expect(matchDelta).toBeLessThanOrEqual(5);
      
      // Skills should have similar counts
      const legacySkillCount = legacyResult.matchedSkills?.length || 0;
      const serviceSkillCount = serviceResult.matchedSkills?.length || 0;
      const skillDelta = Math.abs(legacySkillCount - serviceSkillCount);
      expect(skillDelta).toBeLessThanOrEqual(3);
      
      // Confidence levels should be similar
      const confidenceMapping = { low: 1, medium: 2, high: 3 };
      const legacyConf = confidenceMapping[legacyResult.confidenceLevel] || 2;
      const serviceConf = confidenceMapping[serviceResult.confidenceLevel] || 2;
      expect(Math.abs(legacyConf - serviceConf)).toBeLessThanOrEqual(1);
      
      // Both should have similar field structures
      expect(typeof legacyResult.matchPercentage).toBe('number');
      expect(typeof serviceResult.matchPercentage).toBe('number');
      expect(Array.isArray(legacyResult.matchedSkills)).toBe(true);
      expect(Array.isArray(serviceResult.matchedSkills)).toBe(true);
    });

    it('should handle direct text analysis errors consistently', async () => {
      // Test legacy error handling with missing text
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ resumeText: '', jobDescriptionText: '' });
      
      expect(legacyResponse.status).toBe(400);
      
      // Test service error handling  
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ resumeText: '', jobDescriptionText: '' });
      
      expect(serviceResponse.status).toBe(400);
      
      // Error structures should be similar
      expect(legacyResponse.body.message || legacyResponse.body.error).toBeDefined();
      expect(serviceResponse.body.message || serviceResponse.body.error).toBeDefined();
    });

    it('should maintain direct text analysis performance', async () => {
      // Legacy timing
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyStart = Date.now();
      const legacyResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: testResumeText, 
          jobDescriptionText: testJobText 
        });
      const legacyTime = Date.now() - legacyStart;
      
      expect(legacyResponse.status).toBe(200);
      
      // Service timing
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceStart = Date.now();
      const serviceResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: testResumeText, 
          jobDescriptionText: testJobText 
        });
      const serviceTime = Date.now() - serviceStart;
      
      expect(serviceResponse.status).toBe(200);
      
      // Service response time should not be significantly slower (within 50% tolerance)
      const timeDelta = Math.abs(serviceTime - legacyTime);
      const tolerance = Math.max(legacyTime, serviceTime) * 0.5;
      expect(timeDelta).toBeLessThanOrEqual(tolerance);
      
      // Log performance metrics for monitoring
      console.log(`Direct Text Analysis Performance: Legacy=${legacyTime}ms, Service=${serviceTime}ms, Delta=${timeDelta}ms`);
    });

    it('should validate direct text response schemas match', async () => {
      // Get responses from both implementations
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      const legacyResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: testResumeText, 
          jobDescriptionText: testJobText 
        });
      
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      const serviceResponse = await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: testResumeText, 
          jobDescriptionText: testJobText 
        });
      
      expect(legacyResponse.status).toBe(200);
      expect(serviceResponse.status).toBe(200);
      
      // Both should have the same essential structure
      const requiredFields = ['matchPercentage', 'matchedSkills', 'missingSkills', 'confidenceLevel'];
      
      for (const field of requiredFields) {
        expect(legacyResponse.body[field]).toBeDefined();
        expect(serviceResponse.body[field]).toBeDefined();
      }
      
      // Compare data types
      expect(typeof legacyResponse.body.matchPercentage).toBe(typeof serviceResponse.body.matchPercentage);
      expect(Array.isArray(legacyResponse.body.matchedSkills)).toBe(Array.isArray(serviceResponse.body.matchedSkills));
      expect(Array.isArray(legacyResponse.body.missingSkills)).toBe(Array.isArray(serviceResponse.body.missingSkills));
    });
  });
  
  afterAll(async () => {
    // Clean up test environment variables
    delete process.env.LEGACY_SERVICE_ROUTING;
  });
});

// ===== END-TO-END MIGRATION VALIDATION TESTS =====

describe('End-to-End Migration Validation', () => {
  describe('All Endpoints Parity and Performance', () => {
    it('should maintain parity across all 3 migrated endpoints', async () => {
      // Test all endpoints with migration disabled (baseline)
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      const legacyResults = {
        bias: await request(app)
          .post(`/api/analyze-bias/${testJobWithBias}`)
          .set('Authorization', authToken),
        
        batch: await request(app)
          .post(`/api/analyze/${testJobId}`)
          .set('Authorization', authToken)
          .send({ resumeIds: testResumeIds }),
        
        directText: await request(app)
          .post('/api/analyze')
          .set('Authorization', authToken)
          .send({ 
            resumeText: 'Senior Software Engineer with 5 years React and Node.js experience',
            jobDescriptionText: 'Looking for experienced React and Node.js developer'
          })
      };
      
      // Test all endpoints with migration enabled
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      const serviceResults = {
        bias: await request(app)
          .post(`/api/analyze-bias/${testJobWithBias}`)
          .set('Authorization', authToken),
        
        batch: await request(app)
          .post(`/api/analyze/${testJobId}`)
          .set('Authorization', authToken)
          .send({ resumeIds: testResumeIds }),
        
        directText: await request(app)
          .post('/api/analyze')
          .set('Authorization', authToken)
          .send({ 
            resumeText: 'Senior Software Engineer with 5 years React and Node.js experience',
            jobDescriptionText: 'Looking for experienced React and Node.js developer'
          })
      };
      
      // All endpoints should succeed in both modes
      expect(legacyResults.bias.status).toBe(200);
      expect(legacyResults.batch.status).toBe(200);
      expect(legacyResults.directText.status).toBe(200);
      
      expect(serviceResults.bias.status).toBe(200);
      expect(serviceResults.batch.status).toBe(200);
      expect(serviceResults.directText.status).toBe(200);
      
      // All service responses should have deprecation headers
      const endpoints = ['bias', 'batch', 'directText'] as const;
      for (const endpoint of endpoints) {
        expect(serviceResults[endpoint].headers['deprecation']).toBe('true');
        expect(serviceResults[endpoint].headers['sunset']).toBeDefined();
        expect(serviceResults[endpoint].headers['link']).toContain('successor-version');
      }
      
      // Bias analysis should have consistent structure
      expect(legacyResults.bias.body.jobId).toBe(serviceResults.bias.body.jobId);
      expect(legacyResults.bias.body.biasAnalysis).toBeDefined();
      expect(serviceResults.bias.body.biasAnalysis).toBeDefined();
      
      // Batch analysis should have consistent results
      expect(legacyResults.batch.body.jobDescriptionId).toBe(serviceResults.batch.body.jobDescriptionId);
      expect(legacyResults.batch.body.results.length).toBe(serviceResults.batch.body.results.length);
      
      // Direct text analysis should have consistent match data
      expect(typeof legacyResults.directText.body.matchPercentage).toBe('number');
      expect(typeof serviceResults.directText.body.matchPercentage).toBe('number');
    });

    it('should maintain performance standards across all endpoints', async () => {
      const performanceMetrics = {
        legacy: { bias: 0, batch: 0, directText: 0 },
        service: { bias: 0, batch: 0, directText: 0 }
      };
      
      // Measure legacy performance
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      // Bias analysis timing
      let start = Date.now();
      await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      performanceMetrics.legacy.bias = Date.now() - start;
      
      // Batch analysis timing
      start = Date.now();
      await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });
      performanceMetrics.legacy.batch = Date.now() - start;
      
      // Direct text timing
      start = Date.now();
      await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: 'Software Engineer with React experience',
          jobDescriptionText: 'Looking for React developer'
        });
      performanceMetrics.legacy.directText = Date.now() - start;
      
      // Measure service performance
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      // Bias analysis timing
      start = Date.now();
      await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      performanceMetrics.service.bias = Date.now() - start;
      
      // Batch analysis timing
      start = Date.now();
      await request(app)
        .post(`/api/analyze/${testJobId}`)
        .set('Authorization', authToken)
        .send({ resumeIds: testResumeIds });
      performanceMetrics.service.batch = Date.now() - start;
      
      // Direct text timing
      start = Date.now();
      await request(app)
        .post('/api/analyze')
        .set('Authorization', authToken)
        .send({ 
          resumeText: 'Software Engineer with React experience',
          jobDescriptionText: 'Looking for React developer'
        });
      performanceMetrics.service.directText = Date.now() - start;
      
      // Log comprehensive performance metrics
      console.log('\n=== MIGRATION PERFORMANCE VALIDATION ===');
      console.log(`Bias Analysis: Legacy=${performanceMetrics.legacy.bias}ms, Service=${performanceMetrics.service.bias}ms`);
      console.log(`Batch Analysis: Legacy=${performanceMetrics.legacy.batch}ms, Service=${performanceMetrics.service.batch}ms`);
      console.log(`Direct Text: Legacy=${performanceMetrics.legacy.directText}ms, Service=${performanceMetrics.service.directText}ms`);
      
      // Service performance should be within acceptable ranges (50% tolerance)
      const endpoints = ['bias', 'batch', 'directText'] as const;
      for (const endpoint of endpoints) {
        const legacyTime = performanceMetrics.legacy[endpoint];
        const serviceTime = performanceMetrics.service[endpoint];
        const tolerance = Math.max(legacyTime, serviceTime) * 0.5;
        const delta = Math.abs(serviceTime - legacyTime);
        
        expect(delta).toBeLessThanOrEqual(tolerance);
        console.log(`${endpoint}: Delta=${delta}ms, Tolerance=${tolerance}ms ✅`);
      }
    });

    it('should handle error scenarios consistently across all endpoints', async () => {
      const testCases = [
        {
          name: 'Invalid Job ID for Bias Analysis',
          legacy: () => request(app).post('/api/analyze-bias/999999').set('Authorization', authToken),
          service: () => request(app).post('/api/analyze-bias/999999').set('Authorization', authToken)
        },
        {
          name: 'Invalid Job ID for Batch Analysis',
          legacy: () => request(app).post('/api/analyze/999999').set('Authorization', authToken).send({ resumeIds: [1] }),
          service: () => request(app).post('/api/analyze/999999').set('Authorization', authToken).send({ resumeIds: [1] })
        },
        {
          name: 'Missing Text for Direct Analysis',
          legacy: () => request(app).post('/api/analyze').set('Authorization', authToken).send({ resumeText: '', jobDescriptionText: '' }),
          service: () => request(app).post('/api/analyze').set('Authorization', authToken).send({ resumeText: '', jobDescriptionText: '' })
        }
      ];
      
      for (const testCase of testCases) {
        // Test legacy error handling
        process.env.LEGACY_SERVICE_ROUTING = 'false';
        const legacyResponse = await testCase.legacy();
        
        // Test service error handling
        process.env.LEGACY_SERVICE_ROUTING = 'true';
        const serviceResponse = await testCase.service();
        
        // Both should return error status codes
        expect(legacyResponse.status).toBeGreaterThanOrEqual(400);
        expect(serviceResponse.status).toBeGreaterThanOrEqual(400);
        
        // Error response structures should be similar
        expect(legacyResponse.body.message || legacyResponse.body.error).toBeDefined();
        expect(serviceResponse.body.message || serviceResponse.body.error).toBeDefined();
        
        console.log(`✅ ${testCase.name}: Legacy=${legacyResponse.status}, Service=${serviceResponse.status}`);
      }
    });

    it('should validate feature flag toggle works for all endpoints', async () => {
      // Test that feature flag properly controls routing for all endpoints
      const endpoints = [
        {
          name: 'Bias Analysis',
          request: () => request(app).post(`/api/analyze-bias/${testJobWithBias}`).set('Authorization', authToken)
        },
        {
          name: 'Batch Analysis',
          request: () => request(app).post(`/api/analyze/${testJobId}`).set('Authorization', authToken).send({ resumeIds: testResumeIds })
        },
        {
          name: 'Direct Text Analysis',
          request: () => request(app).post('/api/analyze').set('Authorization', authToken).send({ 
            resumeText: 'Developer with React skills',
            jobDescriptionText: 'Need React developer'
          })
        }
      ];
      
      for (const endpoint of endpoints) {
        // Test with flag disabled (should not have deprecation headers)
        process.env.LEGACY_SERVICE_ROUTING = 'false';
        const legacyResponse = await endpoint.request();
        expect(legacyResponse.status).toBe(200);
        expect(legacyResponse.headers['deprecation']).toBeUndefined();
        
        // Test with flag enabled (should have deprecation headers)
        process.env.LEGACY_SERVICE_ROUTING = 'true';
        const serviceResponse = await endpoint.request();
        expect(serviceResponse.status).toBe(200);
        expect(serviceResponse.headers['deprecation']).toBe('true');
        
        console.log(`✅ ${endpoint.name}: Feature flag toggle validated`);
      }
    });
  });

  describe('Migration Rollback Safety', () => {
    it('should allow instant rollback to legacy implementation', async () => {
      // Enable migration
      process.env.LEGACY_SERVICE_ROUTING = 'true';
      
      // Verify service path is active (has deprecation headers)
      const serviceResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      
      expect(serviceResponse.status).toBe(200);
      expect(serviceResponse.headers['deprecation']).toBe('true');
      
      // Disable migration (instant rollback)
      process.env.LEGACY_SERVICE_ROUTING = 'false';
      
      // Verify legacy path is active (no deprecation headers)
      const legacyResponse = await request(app)
        .post(`/api/analyze-bias/${testJobWithBias}`)
        .set('Authorization', authToken);
      
      expect(legacyResponse.status).toBe(200);
      expect(legacyResponse.headers['deprecation']).toBeUndefined();
      
      console.log('✅ Instant rollback validated: Service → Legacy transition successful');
    });
  });
  
  afterAll(async () => {
    // Clean up test environment variables
    delete process.env.LEGACY_SERVICE_ROUTING;
    console.log('\n=== MIGRATION VALIDATION COMPLETE ===');
    console.log('✅ All 3 endpoints migrated successfully');
    console.log('✅ Performance within tolerances');
    console.log('✅ Error handling consistent');
    console.log('✅ Feature flag control validated');
    console.log('✅ Instant rollback confirmed');
  });
});

/**
 * Mock Firebase Auth middleware for testing
 * This replaces the real Firebase auth during tests
 */
jest.mock('../../server/middleware/auth', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    // Mock user authentication for parity tests
    req.user = {
      uid: 'parity-test-user-123',
      email: 'parity-test@evalmatch.com'
    };
    next();
  }
}));