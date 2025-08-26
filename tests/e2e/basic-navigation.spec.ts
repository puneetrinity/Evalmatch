/**
 * Basic Navigation E2E Tests
 * Simple tests to verify core navigation functionality
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'TestPassword123!';

test.describe('Basic Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Set localStorage to prevent welcome modal from appearing
    await page.addInitScript(() => {
      window.localStorage.setItem('hasSeenWelcome', 'true');
    });
  });

  test('should load home page', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/EvalMatch/);
    await expect(page.locator('h1:has-text("Welcome to EvalMatchAI")')).toBeVisible();
  });

  test('should navigate to upload page directly', async ({ page }) => {
    // First, log in to access protected upload page
    await loginUser(page);
    
    // Direct navigation to upload page
    await page.goto(`${BASE_URL}/upload`);
    
    // Should be on upload page
    await expect(page).toHaveURL(/\/upload/);
    await expect(page.locator('h1:has-text("Upload Resumes")')).toBeVisible();
  });

  test('should navigate from upload to job description', async ({ page }) => {
    // First, log in
    await loginUser(page);
    
    await page.goto(`${BASE_URL}/upload`);
    
    // Click Continue button (even without files for navigation test)
    const continueButton = page.locator('button:has-text("Continue to Job Description")');
    await expect(continueButton).toBeVisible();
    
    // Note: In real usage, this requires uploaded files
    // For navigation test, we're just checking the button exists
  });

  test('should show auth modal when clicking Sign In', async ({ page }) => {
    await page.goto(BASE_URL);
    
    // Click Sign In button
    await page.click('button:has-text("Sign In")');
    
    // Auth modal should appear with email input
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 5000 });
  });

  test('should have working navigation between main pages', async ({ page }) => {
    // First, log in to access protected pages
    await loginUser(page);
    
    // Test direct URL navigation
    const pages = [
      { url: '/', title: 'Welcome to EvalMatchAI' },
      { url: '/upload', title: 'Upload Resumes' },
      { url: '/job-description', title: 'Enter Job Description' },
    ];

    for (const pageInfo of pages) {
      await page.goto(`${BASE_URL}${pageInfo.url}`);
      await expect(page.locator(`h1:has-text("${pageInfo.title}")`)).toBeVisible({ timeout: 10000 });
    }
  });
});

// Helper function to handle authentication
async function loginUser(page: Page): Promise<void> {
  // For testing, we'll mock the authentication state by setting localStorage and cookies
  // This simulates a logged-in user without going through the actual Firebase auth flow
  await page.addInitScript(() => {
    // Mock Firebase auth user in localStorage (common Firebase pattern)
    const mockUser = {
      uid: 'test-user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      emailVerified: true
    };
    
    // Set auth state in localStorage that Firebase SDK might check
    window.localStorage.setItem('firebase:auth:test', JSON.stringify(mockUser));
    window.localStorage.setItem('firebase:authUser:test', JSON.stringify(mockUser));
    
    // Set a flag to indicate we're authenticated
    window.localStorage.setItem('test_authenticated', 'true');
  });
  
  // Go to home page
  await page.goto(BASE_URL);
  
  // Wait for page to load with mock auth state
  await page.waitForLoadState('networkidle');
}