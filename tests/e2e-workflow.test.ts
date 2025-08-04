/**
 * End-to-End Workflow Tests
 * Tests complete user workflows from start to finish
 */

import request from 'supertest';
import { API_ROUTES, buildRoute } from '../shared/api-contracts';

describe('End-to-End Workflow Tests', () => {
  let app: any;
  const testData = {
    jobId: null as number | null,
    resumeId: null as number | null,
    analysisId: null as number | null,
  };

  beforeAll(async () => {
    const { createSimpleTestApp } = await import('./simple-test-server');
    app = await createSimpleTestApp();
  });

  describe('Complete Job Analysis Workflow', () => {
    test('Step 1: Create Job Description', async () => {
      const jobData = {
        title: 'Senior React Developer',
        description: `We are seeking an experienced Senior React Developer to join our dynamic team. 
        
        Key Requirements:
        - 5+ years of experience with React and TypeScript
        - Strong knowledge of Redux, React Hooks, and Context API
        - Experience with modern build tools (Webpack, Vite)
        - Proficiency in CSS frameworks (Tailwind, Material-UI)
        - Understanding of testing frameworks (Jest, React Testing Library)
        - Experience with GraphQL and REST APIs
        - Knowledge of cloud platforms (AWS, Azure, or GCP)
        
        Nice to Have:
        - Next.js framework experience
        - Node.js backend development
        - DevOps experience with Docker and CI/CD
        - Experience with microservices architecture
        
        We offer competitive salary, flexible work arrangements, and excellent growth opportunities.`
      };

      const response = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .send(jobData)
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.jobDescription).toHaveProperty('id');
      expect(response.body.jobDescription.title).toBe(jobData.title);

      testData.jobId = response.body.jobDescription.id;
      console.log(`✓ Job created with ID: ${testData.jobId}`);
    });

    test('Step 2: Upload Resume', async () => {
      const resumeContent = `Sarah Johnson
Senior Frontend Developer
sarah.johnson@email.com | (555) 123-4567 | LinkedIn: /in/sarahjohnson

PROFESSIONAL SUMMARY
Highly skilled Senior Frontend Developer with 6+ years of experience building scalable, 
user-friendly web applications. Expert in React ecosystem with strong TypeScript skills 
and modern development practices.

TECHNICAL SKILLS
Frontend Technologies:
- React (6+ years), Redux, Context API, React Hooks
- TypeScript, JavaScript (ES6+), HTML5, CSS3
- Next.js, Gatsby, Create React App
- Tailwind CSS, Material-UI, Styled Components
- Jest, React Testing Library, Cypress

Build Tools & Development:
- Webpack, Vite, Parcel
- ESLint, Prettier, Husky
- Git, GitHub Actions
- VS Code, Chrome DevTools

Backend & APIs:
- Node.js, Express.js (2 years)
- GraphQL, Apollo Client
- REST APIs, Axios, Fetch
- PostgreSQL, MongoDB

Cloud & DevOps:
- AWS (S3, CloudFront, Lambda)
- Docker, Docker Compose
- Vercel, Netlify deployment
- CI/CD pipelines

PROFESSIONAL EXPERIENCE

Senior Frontend Developer | TechFlow Inc. | March 2021 - Present
• Led frontend development for SaaS platform serving 50K+ users
• Migrated legacy jQuery codebase to React/TypeScript, improving performance by 40%
• Implemented comprehensive testing strategy, achieving 85% code coverage
• Mentored 3 junior developers and established coding standards
• Built responsive design system used across 15+ products
• Integrated GraphQL APIs and optimized data fetching patterns

Frontend Developer | StartupXYZ | June 2019 - March 2021
• Developed React components for e-commerce platform
• Implemented Redux state management for complex shopping cart functionality
• Collaborated with UX team to create pixel-perfect responsive interfaces
• Optimized application performance, reducing bundle size by 30%
• Wrote comprehensive unit and integration tests

Junior Frontend Developer | WebCorp | Jan 2018 - June 2019
• Built interactive dashboards using React and D3.js
• Participated in agile development processes
• Gained experience with modern CSS frameworks and responsive design
• Contributed to open-source projects

EDUCATION
Bachelor of Science in Computer Science
State University | 2017

CERTIFICATIONS
- AWS Certified Solutions Architect Associate (2022)
- React Developer Certification (2020)

PROJECTS
• Personal Portfolio Website - Next.js, TypeScript, Tailwind CSS
• Open Source Component Library - React, Storybook, published on NPM
• Task Management App - React, GraphQL, PostgreSQL`;

      const response = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .send({
          filename: 'sarah-johnson-resume.txt',
          content: resumeContent
        })
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.resume).toHaveProperty('id');
      
      testData.resumeId = response.body.resume.id;
      console.log(`✓ Resume uploaded with ID: ${testData.resumeId}`);
    });

    test('Step 3: Run Bias Analysis', async () => {
      if (!testData.jobId) throw new Error('Job ID not set');

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_BIAS, { jobId: testData.jobId }))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.biasAnalysis).toHaveProperty('hasBias');
      expect(response.body.biasAnalysis).toHaveProperty('biasConfidenceScore');

      console.log(`✓ Bias analysis completed: ${response.body.biasAnalysis.hasBias ? 'Bias detected' : 'No bias detected'}`);
    });

    test('Step 4: Run Match Analysis', async () => {
      if (!testData.jobId) throw new Error('Job ID not set');

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_JOB, { jobId: testData.jobId }))
        .send({})
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.results).toBeDefined();
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBeGreaterThan(0);

      const matchResult = response.body.results[0];
      expect(matchResult).toHaveProperty('matchPercentage');
      expect(matchResult).toHaveProperty('matchedSkills');
      expect(matchResult).toHaveProperty('missingSkills');

      expect(typeof matchResult.matchPercentage).toBe('number');
      expect(matchResult.matchPercentage).toBeGreaterThan(0);
      expect(matchResult.matchPercentage).toBeLessThanOrEqual(100);

      console.log(`✓ Match analysis completed: ${matchResult.matchPercentage}% match`);
      console.log(`  - Matched skills: ${matchResult.matchedSkills?.length || 0}`);
      console.log(`  - Missing skills: ${matchResult.missingSkills?.length || 0}`);
    });

    test('Step 5: Generate Interview Questions', async () => {
      if (!testData.resumeId || !testData.jobId) {
        throw new Error('Resume ID or Job ID not set');
      }

      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.GENERATE_INTERVIEW, {
          resumeId: testData.resumeId,
          jobId: testData.jobId
        }))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.questions).toBeDefined();
      expect(Array.isArray(response.body.questions)).toBe(true);
      expect(response.body.questions.length).toBeGreaterThan(0);

      // Validate question structure
      const question = response.body.questions[0];
      expect(question).toHaveProperty('question');
      expect(question).toHaveProperty('category');
      expect(question).toHaveProperty('difficulty');
      expect(question).toHaveProperty('expectedAnswer');

      console.log(`✓ Interview questions generated: ${response.body.questions.length} questions`);
      console.log(`  Sample question: "${question.question}"`);
    });

    test('Step 6: Retrieve Analysis Results', async () => {
      if (!testData.jobId) throw new Error('Job ID not set');

      const response = await request(app)
        .get(buildRoute(API_ROUTES.ANALYSIS.GET_ANALYSIS, { jobId: testData.jobId }))
        .expect(200);

      expect(response.body.status).toBe('success');
      expect(response.body.results).toBeDefined();
      expect(response.body.results.length).toBeGreaterThan(0);

      console.log(`✓ Analysis results retrieved: ${response.body.results.length} results`);
    });

    test('Step 7: Retrieve Specific Analysis Result', async () => {
      if (!testData.jobId || !testData.resumeId) {
        throw new Error('Job ID or Resume ID not set');
      }

      const response = await request(app)
        .get(buildRoute(API_ROUTES.ANALYSIS.GET_ANALYSIS_BY_RESUME, {
          jobId: testData.jobId,
          resumeId: testData.resumeId
        }))
        .expect(200);

      expect(response.body).toHaveProperty('matchPercentage');
      expect(response.body).toHaveProperty('matchedSkills');
      expect(response.body).toHaveProperty('candidateStrengths');

      console.log(`✓ Specific analysis result retrieved for resume ${testData.resumeId}`);
    });
  });

  describe('Data Persistence Validation', () => {
    test('Job should persist in database', async () => {
      if (!testData.jobId) throw new Error('Job ID not set');

      const response = await request(app)
        .get(buildRoute(API_ROUTES.JOBS.GET_BY_ID, { id: testData.jobId }))
        .expect(200);

      expect(response.body.id).toBe(testData.jobId);
      expect(response.body.title).toBe('Senior React Developer');
      expect(response.body).toHaveProperty('createdAt');

      console.log(`✓ Job data persisted correctly in database`);
    });

    test('Resume should persist in database', async () => {
      if (!testData.resumeId) throw new Error('Resume ID not set');

      const response = await request(app)
        .get(buildRoute(API_ROUTES.RESUMES.GET_BY_ID, { id: testData.resumeId }))
        .expect(200);

      expect(response.body.id).toBe(testData.resumeId);
      expect(response.body.filename).toBe('sarah-johnson-resume.txt');
      expect(response.body).toHaveProperty('content');
      expect(response.body.content).toContain('Sarah Johnson');

      console.log(`✓ Resume data persisted correctly in database`);
    });

    test('Analysis results should persist in database', async () => {
      if (!testData.jobId) throw new Error('Job ID not set');

      // Get analysis results from database
      const response = await request(app)
        .get(buildRoute(API_ROUTES.ANALYSIS.GET_ANALYSIS, { jobId: testData.jobId }))
        .expect(200);

      expect(response.body.results.length).toBeGreaterThan(0);
      
      const result = response.body.results[0];
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('matchPercentage');
      expect(result).toHaveProperty('createdAt');

      console.log(`✓ Analysis results persisted correctly in database`);
    });
  });

  describe('Error Recovery and Edge Cases', () => {
    test('Should handle malformed resume upload gracefully', async () => {
      const response = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .send({
          filename: 'empty-resume.txt',
          content: ''
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      console.log(`✓ Empty resume upload handled gracefully`);
    });

    test('Should handle invalid job ID in analysis', async () => {
      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.ANALYZE_JOB, { jobId: 999999 }))
        .send({})
        .expect(404);

      expect(response.body).toHaveProperty('error');
      console.log(`✓ Invalid job ID handled gracefully`);
    });

    test('Should handle missing parameters in interview generation', async () => {
      const response = await request(app)
        .post(buildRoute(API_ROUTES.ANALYSIS.GENERATE_INTERVIEW, {
          resumeId: 999999,
          jobId: 999999
        }))
        .expect(404);

      expect(response.body).toHaveProperty('error');
      console.log(`✓ Missing data handled gracefully`);
    });
  });

  afterAll(async () => {
    // Cleanup test data
    if (testData.jobId) {
      await request(app)
        .delete(buildRoute(API_ROUTES.JOBS.DELETE, { id: testData.jobId }))
        .catch(() => {
          // Ignore cleanup errors
        });
    }

    // Clear test app and force garbage collection
    const { clearSimpleTestApp } = await import('./simple-test-server');
    clearSimpleTestApp();
    
    if (global.gc) {
      global.gc();
    }

    console.log(`✓ Test cleanup completed`);
  });
});