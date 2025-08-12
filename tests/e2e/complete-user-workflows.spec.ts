/**
 * Complete User Workflows E2E Tests
 * End-to-end testing of complete user journeys using Playwright
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// Test configuration
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = 'e2e.test@example.com';
const TEST_PASSWORD = 'TestPassword123!';

test.describe('Complete User Workflows', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test.describe('User Authentication Flow', () => {
    test('should complete full authentication workflow', async () => {
      // Navigate to application
      await page.goto(BASE_URL);
      await expect(page).toHaveTitle(/EvalMatch/);

      // Check if login modal/page is present
      const loginButton = page.locator('button:has-text("Login"), a:has-text("Sign In")').first();
      await expect(loginButton).toBeVisible({ timeout: 10000 });
      
      // Click login
      await loginButton.click();

      // Check if we're on login page or modal opened
      await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible({ timeout: 5000 });

      // Fill login form
      await page.fill('input[type="email"], input[placeholder*="email" i]', TEST_EMAIL);
      await page.fill('input[type="password"], input[placeholder*="password" i]', TEST_PASSWORD);

      // Submit login
      const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').first();
      await submitButton.click();

      // Wait for authentication to complete
      await page.waitForLoadState('networkidle');
      
      // Verify successful authentication
      // This could be checking for user menu, dashboard, or absence of login button
      await expect(page.locator('button:has-text("Login")')).not.toBeVisible();
      
      // Look for user indicator (profile menu, welcome message, etc.)
      const userIndicators = [
        page.locator('[data-testid="user-menu"]'),
        page.locator('button:has-text("Profile")'),
        page.locator('.user-menu'),
        page.locator('[aria-label*="user" i]')
      ];

      let userIndicatorFound = false;
      for (const indicator of userIndicators) {
        try {
          await expect(indicator).toBeVisible({ timeout: 2000 });
          userIndicatorFound = true;
          break;
        } catch (e) {
          // Continue checking other indicators
        }
      }

      if (!userIndicatorFound) {
        // Alternative: check if we're on a dashboard/main page
        await expect(page.url()).not.toContain('login');
        await expect(page.url()).not.toContain('auth');
      }
    });
  });

  test.describe('Job Description Management Workflow', () => {
    test.beforeEach(async () => {
      // Ensure we're authenticated for each test
      await ensureAuthenticated(page);
    });

    test('should create and manage job description', async () => {
      // Navigate to job creation page
      await navigateToJobCreation(page);

      // Fill job description form
      const jobTitle = 'E2E Test Senior Developer';
      const jobDescription = `
        We are seeking an experienced Senior Developer for our growing team.
        
        Key Requirements:
        - 5+ years of experience with React, Node.js, and TypeScript
        - Strong knowledge of PostgreSQL and Redis
        - Experience with AWS cloud services
        - Understanding of microservices architecture
        - Excellent problem-solving and communication skills
        
        Preferred Qualifications:
        - Experience with Docker and Kubernetes
        - Knowledge of GraphQL and modern testing frameworks
        - Background in agile development methodologies
        
        We offer competitive compensation and excellent benefits.
      `;

      await page.fill('input[name="title"], input[placeholder*="title" i], #job-title', jobTitle);
      await page.fill('textarea[name="description"], textarea[placeholder*="description" i], #job-description', jobDescription);

      // Submit job creation
      const createButton = page.locator('button:has-text("Create"), button:has-text("Save"), button[type="submit"]').first();
      await createButton.click();

      // Wait for job to be created
      await page.waitForLoadState('networkidle');
      
      // Verify job creation success
      await expect(page.locator('text="Job created successfully", text="Success", .success-message')).toBeVisible({ timeout: 10000 });
      
      // Verify job appears in list
      await expect(page.locator(`text="${jobTitle}"`)).toBeVisible();

      // Test job editing
      const editButton = page.locator('button:has-text("Edit"), [aria-label*="edit" i], .edit-btn').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        
        const updatedTitle = 'Updated E2E Test Senior Developer';
        await page.fill('input[name="title"], input[placeholder*="title" i], #job-title', updatedTitle);
        
        const saveButton = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]').first();
        await saveButton.click();
        
        await page.waitForLoadState('networkidle');
        await expect(page.locator(`text="${updatedTitle}"`)).toBeVisible();
      }
    });

    test('should run bias analysis on job description', async () => {
      // Navigate to job list or create a job first
      await navigateToJobCreation(page);

      // Create a potentially biased job description
      const biasedJobTitle = 'Young and Energetic Developer Wanted';
      const biasedDescription = `
        Looking for a young, energetic developer to join our dynamic team.
        Must be a recent college graduate with fresh ideas and willing to work long hours.
        We want someone who can keep up with our fast-paced environment.
        Native English speaker preferred.
      `;

      await page.fill('input[name="title"], input[placeholder*="title" i], #job-title', biasedJobTitle);
      await page.fill('textarea[name="description"], textarea[placeholder*="description" i], #job-description', biasedDescription);

      // Submit job creation
      await page.locator('button:has-text("Create"), button:has-text("Save"), button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle');

      // Look for bias analysis option
      const biasAnalysisButton = page.locator('button:has-text("Check Bias"), button:has-text("Analyze Bias"), [data-testid="bias-analysis"]').first();
      
      if (await biasAnalysisButton.isVisible()) {
        await biasAnalysisButton.click();
        await page.waitForLoadState('networkidle');

        // Verify bias analysis results
        const biasResults = page.locator('.bias-analysis-results, [data-testid="bias-results"]');
        await expect(biasResults).toBeVisible({ timeout: 15000 });

        // Should detect bias in the description
        const biasDetected = page.locator('text="Bias detected", text="Potential bias", .bias-warning');
        await expect(biasDetected).toBeVisible();

        // Should show bias score
        const biasScore = page.locator('[data-testid="bias-score"], .bias-score');
        if (await biasScore.isVisible()) {
          const scoreText = await biasScore.textContent();
          expect(scoreText).toMatch(/\d+%|\d+\.\d+/);
        }
      }
    });
  });

  test.describe('Resume Upload and Analysis Workflow', () => {
    test.beforeEach(async () => {
      await ensureAuthenticated(page);
    });

    test('should upload and analyze resume files', async () => {
      // Navigate to resume upload page
      await navigateToResumeUpload(page);

      // Test text file upload
      const textResume = createTestResumeFile('software-engineer-resume.txt', `
        John Doe
        Senior Software Engineer
        john.doe@email.com | (555) 123-4567

        PROFESSIONAL SUMMARY
        Experienced software engineer with 8+ years developing scalable web applications.
        Expert in React, Node.js, and TypeScript with strong database and cloud skills.

        TECHNICAL SKILLS
        • Frontend: React, Redux, TypeScript, HTML5, CSS3, JavaScript ES6+
        • Backend: Node.js, Express.js, Python, GraphQL, REST APIs
        • Databases: PostgreSQL, MongoDB, Redis
        • Cloud: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes
        • Tools: Git, Jest, Jenkins, JIRA

        PROFESSIONAL EXPERIENCE
        Senior Software Engineer | TechCorp Inc. | 2020 - Present
        • Led development of microservices architecture serving 1M+ daily users
        • Implemented React frontend with TypeScript improving code quality by 40%
        • Designed PostgreSQL database schema optimizing query performance
        • Mentored team of 6 junior developers and conducted code reviews

        Software Engineer | StartupXYZ | 2018 - 2020
        • Built scalable Node.js APIs handling 100K+ requests per day
        • Developed React components for customer-facing dashboard
        • Integrated AWS services including Lambda, S3, and RDS
        • Participated in agile development and sprint planning

        EDUCATION
        Bachelor of Science in Computer Science
        University of Technology | 2016

        CERTIFICATIONS
        • AWS Solutions Architect Associate
        • Certified Kubernetes Administrator
      `);

      // Upload file
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(textResume);

      // Submit upload
      const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Submit"), button[type="submit"]').first();
      await uploadButton.click();

      // Wait for analysis to complete
      await page.waitForLoadState('networkidle');
      
      // Verify upload success
      await expect(page.locator('text="Upload successful", text="Analysis complete", .success')).toBeVisible({ timeout: 20000 });

      // Verify analyzed data is displayed
      await expect(page.locator('text="John Doe"')).toBeVisible();
      
      // Check for skills extraction
      const skillsSection = page.locator('.skills, [data-testid="extracted-skills"]');
      if (await skillsSection.isVisible()) {
        await expect(skillsSection.locator('text="React"')).toBeVisible();
        await expect(skillsSection.locator('text="Node.js"')).toBeVisible();
        await expect(skillsSection.locator('text="TypeScript"')).toBeVisible();
      }

      // Clean up test file
      fs.unlinkSync(textResume);
    });

    test('should handle batch resume upload', async () => {
      await navigateToResumeUpload(page);

      // Look for batch upload option
      const batchUploadButton = page.locator('button:has-text("Batch Upload"), [data-testid="batch-upload"]').first();
      
      if (await batchUploadButton.isVisible()) {
        await batchUploadButton.click();

        // Create multiple test files
        const testFiles = [
          createTestResumeFile('resume1.txt', 'Resume 1 Content - React Developer'),
          createTestResumeFile('resume2.txt', 'Resume 2 Content - Python Developer'),
          createTestResumeFile('resume3.txt', 'Resume 3 Content - Data Scientist')
        ];

        // Upload multiple files
        const batchFileInput = page.locator('input[type="file"][multiple], input[type="file"]');
        await batchFileInput.setInputFiles(testFiles);

        const batchSubmitButton = page.locator('button:has-text("Upload All"), button:has-text("Process Batch"), button[type="submit"]').first();
        await batchSubmitButton.click();

        // Wait for batch processing
        await page.waitForLoadState('networkidle');

        // Verify batch upload results
        await expect(page.locator('.batch-results, [data-testid="batch-results"]')).toBeVisible({ timeout: 30000 });
        
        // Should show summary of uploads
        const summary = page.locator('.upload-summary, [data-testid="upload-summary"]');
        if (await summary.isVisible()) {
          await expect(summary.locator('text="3"')).toBeVisible(); // 3 files processed
        }

        // Clean up test files
        testFiles.forEach(file => fs.unlinkSync(file));
      }
    });
  });

  test.describe('Complete Matching and Analysis Workflow', () => {
    test.beforeEach(async () => {
      await ensureAuthenticated(page);
    });

    test('should complete full resume-job matching workflow', async () => {
      // Step 1: Create a job description
      await navigateToJobCreation(page);
      
      const jobTitle = 'Full Stack Developer Position';
      const jobDescription = `
        We are looking for a Full Stack Developer with React and Node.js experience.
        Required skills: React, Node.js, TypeScript, PostgreSQL, AWS
        Preferred skills: Docker, Kubernetes, GraphQL
      `;

      await page.fill('input[name="title"], #job-title', jobTitle);
      await page.fill('textarea[name="description"], #job-description', jobDescription);
      await page.locator('button:has-text("Create"), button[type="submit"]').first().click();
      await page.waitForLoadState('networkidle');

      // Step 2: Upload a matching resume
      await navigateToResumeUpload(page);
      
      const matchingResume = createTestResumeFile('matching-resume.txt', `
        Jane Smith - Full Stack Developer
        Skills: React, Node.js, TypeScript, PostgreSQL, AWS, Docker
        Experience: 5 years building scalable web applications
        
        EXPERIENCE:
        Senior Developer at TechCorp - Built React applications with Node.js backend
        Used PostgreSQL for database management and AWS for deployment
        Experienced with TypeScript and modern development practices
      `);

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(matchingResume);
      await page.locator('button:has-text("Upload")').first().click();
      await page.waitForLoadState('networkidle');

      // Step 3: Navigate to analysis/matching page
      await navigateToAnalysis(page);

      // Step 4: Run matching analysis
      const analyzeButton = page.locator('button:has-text("Analyze"), button:has-text("Run Analysis"), [data-testid="analyze-btn"]').first();
      
      if (await analyzeButton.isVisible()) {
        await analyzeButton.click();
        await page.waitForLoadState('networkidle');

        // Wait for analysis results
        const analysisResults = page.locator('.analysis-results, [data-testid="analysis-results"]');
        await expect(analysisResults).toBeVisible({ timeout: 30000 });

        // Verify match results are displayed
        const matchPercentage = page.locator('.match-percentage, [data-testid="match-score"]');
        if (await matchPercentage.isVisible()) {
          const matchText = await matchPercentage.textContent();
          expect(matchText).toMatch(/\d+%/);
        }

        // Verify matched skills are shown
        const matchedSkills = page.locator('.matched-skills, [data-testid="matched-skills"]');
        if (await matchedSkills.isVisible()) {
          await expect(matchedSkills.locator('text="React"')).toBeVisible();
          await expect(matchedSkills.locator('text="Node.js"')).toBeVisible();
        }

        // Check for candidate strengths
        const strengths = page.locator('.candidate-strengths, [data-testid="strengths"]');
        if (await strengths.isVisible()) {
          expect(await strengths.textContent()).toBeTruthy();
        }
      }

      // Clean up test file
      fs.unlinkSync(matchingResume);
    });

    test('should generate interview questions', async () => {
      // Ensure we have job and resume data from previous tests or create them
      await navigateToAnalysis(page);

      // Look for interview question generation
      const interviewButton = page.locator('button:has-text("Generate Questions"), button:has-text("Interview"), [data-testid="interview-questions"]').first();
      
      if (await interviewButton.isVisible()) {
        await interviewButton.click();
        await page.waitForLoadState('networkidle');

        // Wait for questions to be generated
        const questionsContainer = page.locator('.interview-questions, [data-testid="interview-questions"]');
        await expect(questionsContainer).toBeVisible({ timeout: 20000 });

        // Verify questions are displayed
        const questions = page.locator('.question, [data-testid="question"]');
        const questionCount = await questions.count();
        expect(questionCount).toBeGreaterThan(0);

        // Verify question structure
        for (let i = 0; i < Math.min(questionCount, 3); i++) {
          const question = questions.nth(i);
          await expect(question).toBeVisible();
          
          const questionText = await question.textContent();
          expect(questionText).toBeTruthy();
          expect(questionText!.length).toBeGreaterThan(10);
        }

        // Check for question categories
        const categories = page.locator('.question-category, [data-testid="question-category"]');
        if ((await categories.count()) > 0) {
          const categoryText = await categories.first().textContent();
          expect(['technical', 'behavioral', 'cultural', 'experience'].some(cat => 
            categoryText!.toLowerCase().includes(cat)
          )).toBe(true);
        }
      }
    });
  });

  test.describe('Data Persistence and Navigation', () => {
    test.beforeEach(async () => {
      await ensureAuthenticated(page);
    });

    test('should maintain data across page navigation', async () => {
      // Create a job
      await navigateToJobCreation(page);
      
      const persistenceJobTitle = 'Persistence Test Job';
      await page.fill('input[name="title"], #job-title', persistenceJobTitle);
      await page.fill('textarea[name="description"], #job-description', 'Test job for persistence');
      await page.locator('button:has-text("Create")').first().click();
      await page.waitForLoadState('networkidle');

      // Navigate away and back
      await page.goto(BASE_URL);
      await navigateToJobList(page);

      // Verify job still exists
      await expect(page.locator(`text="${persistenceJobTitle}"`)).toBeVisible();

      // Upload a resume
      await navigateToResumeUpload(page);
      
      const persistenceResume = createTestResumeFile('persistence-test.txt', 'Persistence Test Resume Content');
      await page.locator('input[type="file"]').setInputFiles(persistenceResume);
      await page.locator('button:has-text("Upload")').first().click();
      await page.waitForLoadState('networkidle');

      // Navigate away and back to resume list
      await page.goto(BASE_URL);
      await navigateToResumeList(page);

      // Verify resume still exists
      await expect(page.locator('text="persistence-test.txt", text="Persistence Test"')).toBeVisible();

      // Clean up
      fs.unlinkSync(persistenceResume);
    });

    test('should handle browser refresh during operations', async () => {
      // Start creating a job
      await navigateToJobCreation(page);
      
      await page.fill('input[name="title"], #job-title', 'Refresh Test Job');
      await page.fill('textarea[name="description"], #job-description', 'Job for testing refresh behavior');

      // Refresh before submitting
      await page.reload();

      // Form should be cleared (expected behavior for most forms)
      const titleValue = await page.locator('input[name="title"], #job-title').inputValue();
      expect(titleValue).toBe('');

      // Complete the form again and submit
      await page.fill('input[name="title"], #job-title', 'Refresh Test Job Completed');
      await page.fill('textarea[name="description"], #job-description', 'Job completed after refresh');
      await page.locator('button:has-text("Create")').first().click();
      await page.waitForLoadState('networkidle');

      // Verify job was created successfully
      await expect(page.locator('text="Refresh Test Job Completed"')).toBeVisible();
    });
  });

  test.describe('Error Handling and Edge Cases', () => {
    test.beforeEach(async () => {
      await ensureAuthenticated(page);
    });

    test('should handle network errors gracefully', async () => {
      await navigateToJobCreation(page);

      // Fill form with valid data
      await page.fill('input[name="title"], #job-title', 'Network Error Test Job');
      await page.fill('textarea[name="description"], #job-description', 'Testing network error handling');

      // Simulate network failure by going offline (if supported)
      if (page.context().setOffline) {
        await page.context().setOffline(true);
        
        // Try to submit
        await page.locator('button:has-text("Create")').first().click();

        // Should show error message
        await expect(page.locator('text="Network error", text="Connection failed", .error')).toBeVisible({ timeout: 10000 });

        // Restore network
        await page.context().setOffline(false);
        
        // Retry submission
        await page.locator('button:has-text("Create"), button:has-text("Retry")').first().click();
        await page.waitForLoadState('networkidle');
        
        // Should succeed after network restoration
        await expect(page.locator('text="Network Error Test Job"')).toBeVisible();
      }
    });

    test('should handle invalid file uploads', async () => {
      await navigateToResumeUpload(page);

      // Create an invalid file (too large or wrong type)
      const invalidFile = createTestResumeFile('invalid.exe', 'This is not a resume file');

      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(invalidFile);
      
      const uploadButton = page.locator('button:has-text("Upload")').first();
      await uploadButton.click();

      // Should show error message
      await expect(page.locator('text="Invalid file", text="File not supported", .error')).toBeVisible({ timeout: 10000 });

      // Clean up
      fs.unlinkSync(invalidFile);
    });

    test('should validate required form fields', async () => {
      await navigateToJobCreation(page);

      // Try to submit empty form
      const submitButton = page.locator('button:has-text("Create"), button[type="submit"]').first();
      await submitButton.click();

      // Should show validation errors
      const validationErrors = page.locator('.error, .validation-error, [role="alert"]');
      await expect(validationErrors.first()).toBeVisible();

      // Fill only title, leave description empty
      await page.fill('input[name="title"], #job-title', 'Validation Test');
      await submitButton.click();

      // Should still show validation error for missing description
      await expect(validationErrors.first()).toBeVisible();

      // Fill all required fields
      await page.fill('textarea[name="description"], #job-description', 'Now with proper description');
      await submitButton.click();
      await page.waitForLoadState('networkidle');

      // Should succeed with all fields filled
      await expect(page.locator('text="Validation Test"')).toBeVisible();
    });
  });

  // Helper functions
  async function ensureAuthenticated(page: Page): Promise<void> {
    // Check if already authenticated by looking for user indicators
    const loginButton = page.locator('button:has-text("Login"), a:has-text("Sign In")');
    
    if (await loginButton.isVisible()) {
      // Need to authenticate
      await loginButton.click();
      await page.fill('input[type="email"]', TEST_EMAIL);
      await page.fill('input[type="password"]', TEST_PASSWORD);
      await page.locator('button[type="submit"], button:has-text("Login")').first().click();
      await page.waitForLoadState('networkidle');
    }
  }

  async function navigateToJobCreation(page: Page): Promise<void> {
    // Try multiple navigation approaches
    const navOptions = [
      () => page.click('a[href*="job"], button:has-text("Create Job"), [data-testid="create-job"]'),
      () => page.click('nav a:has-text("Jobs"), .nav-jobs'),
      () => page.goto(`${BASE_URL}/job-description`),
      () => page.goto(`${BASE_URL}/jobs/create`)
    ];

    for (const navOption of navOptions) {
      try {
        await navOption();
        await page.waitForLoadState('networkidle');
        
        // Check if we're on job creation page
        const titleInput = page.locator('input[name="title"], #job-title, input[placeholder*="title" i]');
        if (await titleInput.isVisible({ timeout: 2000 })) {
          return; // Successfully navigated
        }
      } catch (e) {
        // Try next navigation option
      }
    }

    // Fallback: direct navigation
    await page.goto(`${BASE_URL}/jobs`);
    await page.waitForLoadState('networkidle');
  }

  async function navigateToResumeUpload(page: Page): Promise<void> {
    const navOptions = [
      () => page.click('a[href*="upload"], button:has-text("Upload"), [data-testid="upload-resume"]'),
      () => page.click('nav a:has-text("Upload"), .nav-upload'),
      () => page.goto(`${BASE_URL}/upload`)
    ];

    for (const navOption of navOptions) {
      try {
        await navOption();
        await page.waitForLoadState('networkidle');
        
        const fileInput = page.locator('input[type="file"]');
        if (await fileInput.isVisible({ timeout: 2000 })) {
          return;
        }
      } catch (e) {
        // Try next option
      }
    }

    await page.goto(`${BASE_URL}/upload`);
  }

  async function navigateToAnalysis(page: Page): Promise<void> {
    const navOptions = [
      () => page.click('a[href*="analysis"], button:has-text("Analysis"), [data-testid="analysis"]'),
      () => page.click('nav a:has-text("Analysis"), .nav-analysis'),
      () => page.goto(`${BASE_URL}/analysis`)
    ];

    for (const navOption of navOptions) {
      try {
        await navOption();
        await page.waitForLoadState('networkidle');
        
        if (page.url().includes('analysis')) {
          return;
        }
      } catch (e) {
        // Try next option
      }
    }

    await page.goto(`${BASE_URL}/analysis`);
  }

  async function navigateToJobList(page: Page): Promise<void> {
    await page.click('a[href*="job"], nav a:has-text("Jobs")');
    await page.waitForLoadState('networkidle');
  }

  async function navigateToResumeList(page: Page): Promise<void> {
    await page.click('a[href*="resume"], nav a:has-text("Resumes")');
    await page.waitForLoadState('networkidle');
  }

  function createTestResumeFile(filename: string, content: string): string {
    const filePath = path.join(__dirname, '..', 'temp', filename);
    
    // Ensure temp directory exists
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content);
    return filePath;
  }
});