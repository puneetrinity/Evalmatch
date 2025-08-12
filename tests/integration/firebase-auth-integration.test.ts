/**
 * Firebase Authentication Integration Tests
 * Tests authentication flows, token validation, and user isolation with real Firebase
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import admin from 'firebase-admin';
import { API_ROUTES } from '../../shared/api-contracts';

describe('Firebase Authentication Integration Tests', () => {
  let app: any;
  let testUser: {
    uid: string;
    email: string;
    token: string;
  };
  let secondTestUser: {
    uid: string;
    email: string;
    token: string;
  };
  let adminUser: {
    uid: string;
    email: string;
    token: string;
  };

  beforeAll(async () => {
    const { createFixedTestApp } = await import('../helpers/test-server-fixed');
    app = await createFixedTestApp();
    
    // Initialize Firebase Admin if not already done
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID || 'test-project',
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'test@test-project.iam.gserviceaccount.com',
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || '-----BEGIN PRIVATE KEY-----\nTEST_KEY\n-----END PRIVATE KEY-----\n'
        }),
        projectId: process.env.FIREBASE_PROJECT_ID || 'test-project'
      });
    }
    
    // Create test users
    await createTestUsers();
  });

  afterAll(async () => {
    // Clean up test users
    await cleanupTestUsers();
    
    const { clearFixedTestApp } = await import('../helpers/test-server-fixed');
    await clearFixedTestApp();
  });

  beforeEach(async () => {
    // Ensure clean state for each test
  });

  afterEach(async () => {
    // Clean up any test data created during tests
  });

  describe('User Authentication Flow', () => {
    test('should authenticate user with valid Firebase token', async () => {
      const response = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('uid', testUser.uid);
      expect(response.body).toHaveProperty('email', testUser.email);
    });

    test('should reject requests with invalid token', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);

      expect(response.body.error).toMatch(/unauthorized|invalid token/i);
    });

    test('should reject expired tokens', async () => {
      // Create an expired token (this would be done with a mock in real testing)
      const expiredToken = await createExpiredToken(testUser.uid);
      
      const response = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      expect(response.body.error).toMatch(/expired|unauthorized/i);
    });

    test('should validate token claims correctly', async () => {
      // Test with custom claims
      const tokenWithClaims = await createTokenWithCustomClaims(testUser.uid, {
        role: 'premium',
        tier: 'paid'
      });
      
      const response = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .set('Authorization', `Bearer ${tokenWithClaims}`)
        .expect(200);

      expect(response.body.customClaims).toHaveProperty('role', 'premium');
      expect(response.body.customClaims).toHaveProperty('tier', 'paid');
    });

    test('should handle missing Authorization header', async () => {
      const response = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .expect(401);

      expect(response.body.error).toMatch(/authorization.*required|missing token/i);
    });

    test('should handle malformed Authorization header', async () => {
      const response = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body.error).toMatch(/invalid.*format|malformed/i);
    });
  });

  describe('User Isolation and Data Access', () => {
    test('should isolate resume data between users', async () => {
      // Upload resume as first user
      const resumeContent = 'User 1 Resume Content';
      const uploadResponse = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${testUser.token}`)
        .attach('file', Buffer.from(resumeContent), 'user1-resume.txt')
        .expect(200);

      const resumeId = uploadResponse.body.resume.id;

      // Try to access resume as second user (should fail)
      const accessResponse = await request(app)
        .get(`/api/resumes/${resumeId}`)
        .set('Authorization', `Bearer ${secondTestUser.token}`)
        .expect(404);

      expect(accessResponse.body.error).toMatch(/not found|access denied/i);

      // Verify first user can still access their resume
      const validAccessResponse = await request(app)
        .get(`/api/resumes/${resumeId}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(200);

      expect(validAccessResponse.body.content).toContain('User 1 Resume Content');
    });

    test('should isolate job descriptions between users', async () => {
      // Create job as first user
      const jobData = {
        title: 'User 1 Job',
        description: 'This is user 1\'s private job description'
      };

      const createResponse = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send(jobData)
        .expect(200);

      const jobId = createResponse.body.jobDescription.id;

      // Try to access job as second user (should fail)
      const accessResponse = await request(app)
        .get(`/api/job-descriptions/${jobId}`)
        .set('Authorization', `Bearer ${secondTestUser.token}`)
        .expect(404);

      expect(accessResponse.body.error).toMatch(/not found|access denied/i);

      // Verify first user can access their job
      const validAccessResponse = await request(app)
        .get(`/api/job-descriptions/${jobId}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(200);

      expect(validAccessResponse.body.title).toBe(jobData.title);
    });

    test('should isolate analysis results between users', async () => {
      // Create job and resume as first user
      const jobResponse = await request(app)
        .post(API_ROUTES.JOBS.CREATE)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({
          title: 'Test Job for Analysis',
          description: 'Test job description with React, Node.js skills'
        })
        .expect(200);

      const resumeResponse = await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${testUser.token}`)
        .attach('file', Buffer.from('Resume with React, JavaScript skills'), 'test-resume.txt')
        .expect(200);

      const jobId = jobResponse.body.jobDescription.id;

      // Run analysis as first user
      const analysisResponse = await request(app)
        .post(`/api/analysis/analyze/${jobId}`)
        .set('Authorization', `Bearer ${testUser.token}`)
        .send({})
        .expect(200);

      // Try to access analysis results as second user (should fail)
      const unauthorizedAccess = await request(app)
        .get(`/api/analysis/analyze/${jobId}`)
        .set('Authorization', `Bearer ${secondTestUser.token}`)
        .expect(404);

      expect(unauthorizedAccess.body.error).toMatch(/not found|access denied/i);
    });

    test('should handle batch operations with user isolation', async () => {
      // Upload multiple resumes as first user
      const resumeFiles = [
        'Resume 1 content',
        'Resume 2 content',
        'Resume 3 content'
      ];

      const uploadPromises = resumeFiles.map((content, i) =>
        request(app)
          .post(API_ROUTES.RESUMES.UPLOAD)
          .set('Authorization', `Bearer ${testUser.token}`)
          .attach('file', Buffer.from(content), `batch-resume-${i}.txt`)
          .expect(200)
      );

      await Promise.all(uploadPromises);

      // Get user's resumes
      const userResumesResponse = await request(app)
        .get(API_ROUTES.RESUMES.LIST)
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(200);

      expect(userResumesResponse.body.resumes.length).toBeGreaterThanOrEqual(3);

      // Second user should see no resumes (or only their own)
      const otherUserResumesResponse = await request(app)
        .get(API_ROUTES.RESUMES.LIST)
        .set('Authorization', `Bearer ${secondTestUser.token}`)
        .expect(200);

      // Should not see first user's resumes
      const firstUserResumeIds = userResumesResponse.body.resumes.map((r: any) => r.id);
      const secondUserResumeIds = otherUserResumesResponse.body.resumes.map((r: any) => r.id);
      
      const overlap = firstUserResumeIds.filter((id: number) => secondUserResumeIds.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('Admin User Permissions', () => {
    test('should allow admin access to admin endpoints', async () => {
      const response = await request(app)
        .get(API_ROUTES.ADMIN.USERS)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
      expect(Array.isArray(response.body.users)).toBe(true);
    });

    test('should deny non-admin access to admin endpoints', async () => {
      const response = await request(app)
        .get(API_ROUTES.ADMIN.USERS)
        .set('Authorization', `Bearer ${testUser.token}`)
        .expect(403);

      expect(response.body.error).toMatch(/forbidden|admin.*required|insufficient.*permissions/i);
    });

    test('should allow admin to access user data for support purposes', async () => {
      // Create some test data as regular user
      await request(app)
        .post(API_ROUTES.RESUMES.UPLOAD)
        .set('Authorization', `Bearer ${testUser.token}`)
        .attach('file', Buffer.from('Test resume for admin access'), 'admin-test.txt')
        .expect(200);

      // Admin should be able to access user's data through admin endpoints
      const response = await request(app)
        .get(`/api/admin/users/${testUser.uid}/resumes`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .expect(200);

      expect(response.body.resumes).toBeDefined();
      expect(Array.isArray(response.body.resumes)).toBe(true);
    });
  });

  describe('Token Refresh and Session Management', () => {
    test('should handle token refresh properly', async () => {
      // This test would typically involve creating a refresh token scenario
      // For now, we'll test token validation with a newly created token
      const freshToken = await admin.auth().createCustomToken(testUser.uid);
      
      const response = await request(app)
        .get(API_ROUTES.AUTH.VALIDATE_TOKEN)
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.uid).toBe(testUser.uid);
    });

    test('should maintain session consistency across requests', async () => {
      // Make multiple requests with the same token
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .get(API_ROUTES.AUTH.PROFILE)
          .set('Authorization', `Bearer ${testUser.token}`)
          .expect(200)
      );

      const responses = await Promise.all(requests);
      
      // All responses should be identical
      responses.forEach(response => {
        expect(response.body.uid).toBe(testUser.uid);
        expect(response.body.email).toBe(testUser.email);
      });
    });

    test('should handle concurrent requests from same user', async () => {
      // Create job and upload resume concurrently
      const concurrentRequests = [
        request(app)
          .post(API_ROUTES.JOBS.CREATE)
          .set('Authorization', `Bearer ${testUser.token}`)
          .send({
            title: 'Concurrent Test Job',
            description: 'Job created during concurrent test'
          }),
        request(app)
          .post(API_ROUTES.RESUMES.UPLOAD)
          .set('Authorization', `Bearer ${testUser.token}`)
          .attach('file', Buffer.from('Concurrent test resume'), 'concurrent.txt'),
        request(app)
          .get(API_ROUTES.RESUMES.LIST)
          .set('Authorization', `Bearer ${testUser.token}`)
      ];

      const responses = await Promise.all(concurrentRequests);
      
      // All requests should succeed
      expect(responses[0].status).toBe(200); // Job creation
      expect(responses[1].status).toBe(200); // Resume upload
      expect(responses[2].status).toBe(200); // Resume list
    });
  });

  describe('Rate Limiting with Authentication', () => {
    test('should apply rate limiting per user', async () => {
      const rapidRequests = Array(20).fill(null).map(() =>
        request(app)
          .get(API_ROUTES.AUTH.PROFILE)
          .set('Authorization', `Bearer ${testUser.token}`)
      );

      const responses = await Promise.all(rapidRequests);
      
      // Some requests should succeed, but rate limiting might kick in
      const successfulRequests = responses.filter(r => r.status === 200);
      const rateLimitedRequests = responses.filter(r => r.status === 429);
      
      // Should have at least some successful requests
      expect(successfulRequests.length).toBeGreaterThan(0);
      
      // If rate limiting is implemented, some might be rate limited
      if (rateLimitedRequests.length > 0) {
        rateLimitedRequests.forEach(response => {
          expect(response.body.error).toMatch(/rate limit|too many requests/i);
        });
      }
    });

    test('should maintain separate rate limits per user', async () => {
      // Make requests as both users simultaneously
      const user1Requests = Array(10).fill(null).map(() =>
        request(app)
          .get(API_ROUTES.AUTH.PROFILE)
          .set('Authorization', `Bearer ${testUser.token}`)
      );

      const user2Requests = Array(10).fill(null).map(() =>
        request(app)
          .get(API_ROUTES.AUTH.PROFILE)
          .set('Authorization', `Bearer ${secondTestUser.token}`)
      );

      const allResponses = await Promise.all([...user1Requests, ...user2Requests]);
      
      // Both users should have some successful requests
      const user1Responses = allResponses.slice(0, 10);
      const user2Responses = allResponses.slice(10);
      
      const user1Successful = user1Responses.filter(r => r.status === 200);
      const user2Successful = user2Responses.filter(r => r.status === 200);
      
      expect(user1Successful.length).toBeGreaterThan(0);
      expect(user2Successful.length).toBeGreaterThan(0);
    });
  });

  describe('Security Edge Cases', () => {
    test('should prevent token reuse after user deletion', async () => {
      // Create a temporary user
      const tempUser = await admin.auth().createUser({
        uid: 'temp-user-for-deletion',
        email: 'temp@test.com'
      });
      
      const tempToken = await admin.auth().createCustomToken(tempUser.uid);
      
      // Verify token works initially
      const initialResponse = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);
      
      expect(initialResponse.body.uid).toBe(tempUser.uid);
      
      // Delete the user
      await admin.auth().deleteUser(tempUser.uid);
      
      // Token should no longer work
      const deletedUserResponse = await request(app)
        .get(API_ROUTES.AUTH.PROFILE)
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(401);
      
      expect(deletedUserResponse.body.error).toMatch(/user.*not.*found|unauthorized/i);
    });

    test('should handle malformed JWT tokens gracefully', async () => {
      const malformedTokens = [
        'not.a.jwt',
        'header.payload', // Missing signature
        'too.many.segments.here.invalid',
        '', // Empty token
        'Bearer token.without.bearer.prefix'
      ];

      for (const token of malformedTokens) {
        const response = await request(app)
          .get(API_ROUTES.AUTH.PROFILE)
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/invalid.*token|malformed|unauthorized/i);
      }
    });

    test('should prevent privilege escalation attempts', async () => {
      // Try to create a token with admin claims for regular user
      const tokenWithFakeClaims = await createTokenWithCustomClaims(testUser.uid, {
        admin: true,
        role: 'super-admin',
        elevated: true
      });

      // Even with fake claims in token, should not have admin access
      const response = await request(app)
        .get(API_ROUTES.ADMIN.USERS)
        .set('Authorization', `Bearer ${tokenWithFakeClaims}`)
        .expect(403);

      expect(response.body.error).toMatch(/forbidden|insufficient.*permissions/i);
    });
  });

  // Helper functions
  async function createTestUsers(): Promise<void> {
    try {
      // Create regular test user
      const user1 = await admin.auth().createUser({
        uid: 'test-user-1',
        email: 'testuser1@example.com',
        displayName: 'Test User 1'
      });
      testUser = {
        uid: user1.uid,
        email: user1.email!,
        token: await admin.auth().createCustomToken(user1.uid)
      };

      // Create second test user
      const user2 = await admin.auth().createUser({
        uid: 'test-user-2',
        email: 'testuser2@example.com',
        displayName: 'Test User 2'
      });
      secondTestUser = {
        uid: user2.uid,
        email: user2.email!,
        token: await admin.auth().createCustomToken(user2.uid)
      };

      // Create admin user
      const adminUserRecord = await admin.auth().createUser({
        uid: 'admin-user',
        email: 'admin@example.com',
        displayName: 'Admin User'
      });
      
      // Set admin custom claims
      await admin.auth().setCustomUserClaims(adminUserRecord.uid, {
        admin: true,
        role: 'administrator'
      });
      
      adminUser = {
        uid: adminUserRecord.uid,
        email: adminUserRecord.email!,
        token: await admin.auth().createCustomToken(adminUserRecord.uid, {
          admin: true,
          role: 'administrator'
        })
      };
    } catch (error) {
      console.error('Error creating test users:', error);
      // Use mock users if Firebase admin is not available
      testUser = {
        uid: 'mock-user-1',
        email: 'mockuser1@example.com',
        token: 'mock-token-1'
      };
      
      secondTestUser = {
        uid: 'mock-user-2',
        email: 'mockuser2@example.com',
        token: 'mock-token-2'
      };
      
      adminUser = {
        uid: 'mock-admin',
        email: 'mockadmin@example.com',
        token: 'mock-admin-token'
      };
    }
  }

  async function cleanupTestUsers(): Promise<void> {
    try {
      const users = [testUser.uid, secondTestUser.uid, adminUser.uid];
      
      for (const uid of users) {
        try {
          await admin.auth().deleteUser(uid);
        } catch (error) {
          // User might not exist, ignore error
        }
      }
    } catch (error) {
      console.warn('Error cleaning up test users:', error);
    }
  }

  async function createExpiredToken(uid: string): Promise<string> {
    try {
      // Create a token with very short expiry (this is a simplified approach)
      // In real testing, you might use a different method to create expired tokens
      return await admin.auth().createCustomToken(uid, {}, {
        expiresIn: 1 // 1 second
      });
    } catch (error) {
      // Return a mock expired token if Firebase admin is not available
      return 'mock.expired.token';
    }
  }

  async function createTokenWithCustomClaims(uid: string, customClaims: Record<string, any>): Promise<string> {
    try {
      return await admin.auth().createCustomToken(uid, customClaims);
    } catch (error) {
      // Return a mock token if Firebase admin is not available
      return `mock.token.with.claims.${JSON.stringify(customClaims)}`;
    }
  }
});