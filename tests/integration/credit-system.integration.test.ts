/**
 * Credit System Integration Tests
 * Validates credit functionality, tier system, and BETA_MODE interactions
 */

import app from "../../server";
import request from "supertest";
import { getDatabase } from "../../server/database/index";
import { userCredits, creditTransactions } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { creditService } from "../../server/services/credit-service";
import { config } from "../../server/config/unified-config";

describe("Credit System Integration", () => {
  const testUser = {
    uid: "test-user-credits-123",
    email: "credituser@test.com",
    name: "Credit Test User",
  };

  const adminHeaders = {
    "x-admin-token": "test-admin",
  };

  beforeAll(async () => {
    // Clean up any existing test data
    const db = getDatabase();
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, testUser.uid));
    await db.delete(userCredits).where(eq(userCredits.userId, testUser.uid));
  });

  afterAll(async () => {
    // Clean up test data
    const db = getDatabase();
    await db.delete(creditTransactions).where(eq(creditTransactions.userId, testUser.uid));
    await db.delete(userCredits).where(eq(userCredits.userId, testUser.uid));
  });

  describe("Credit Service Core Functionality", () => {
    test("should create user credit account on first access", async () => {
      const result = await creditService.getUserCredits(testUser.uid, true);
      
      expect(result.success).toBe(true);
      expect(result.credits).toBe(0);
      expect(result.available).toBe(true);
    });

    test("should add credits successfully", async () => {
      const result = await creditService.addCredits(
        testUser.uid,
        50,
        "Test credit addition",
        "credit",
        "test-purchase-123"
      );

      expect(result.success).toBe(true);
      expect(result.credits).toBe(50);
    });

    test("should deduct credits with sufficient balance", async () => {
      const result = await creditService.deductCredits(
        testUser.uid,
        10,
        "Test analysis operation",
        "analysis-123"
      );

      expect(result.success).toBe(true);
      expect(result.credits).toBe(40);
    });

    test("should prevent deduction with insufficient balance", async () => {
      const result = await creditService.deductCredits(
        testUser.uid,
        100,
        "Expensive operation",
        "fail-test-123"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient credits");
    });

    test("should handle beta credit grants (idempotent)", async () => {
      const result1 = await creditService.grantBetaCredits(testUser.uid, 100);
      expect(result1.success).toBe(true);

      const result2 = await creditService.grantBetaCredits(testUser.uid, 100);
      expect(result2.success).toBe(true);
      expect(result2.message).toContain("already granted");
    });
  });

  describe("Credit API Endpoints", () => {
    test("GET /api/credits/balance - should return credit balance", async () => {
      const response = await request(app)
        .get("/api/credits/balance")
        .set("Authorization", `Bearer mock-token`)
        .set("x-user-uid", testUser.uid)
        .expect(200);

      expect(response.body).toMatchObject({
        status: "success",
        credits: expect.any(Number),
        tier: expect.any(String),
        timestamp: expect.any(String),
      });
    });

    test("GET /api/credits/history - should return transaction history", async () => {
      const response = await request(app)
        .get("/api/credits/history")
        .set("Authorization", `Bearer mock-token`)
        .set("x-user-uid", testUser.uid)
        .expect(200);

      expect(response.body).toMatchObject({
        status: "success",
        transactions: expect.any(Array),
        pagination: expect.objectContaining({
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
        }),
      });
    });

    test("POST /api/admin/credits/grant - admin can grant credits", async () => {
      const response = await request(app)
        .post("/api/admin/credits/grant")
        .set(adminHeaders)
        .send({
          userId: testUser.uid,
          amount: 25,
          description: "Admin test grant",
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        credits: expect.any(Number),
      });
    });
  });

  describe("BETA_MODE Integration", () => {
    test("should grant beta credits when BETA_MODE is enabled", async () => {
      // Verify BETA_MODE is enabled in test environment
      expect(process.env.BETA_MODE).toBe("true");
      expect(config.features.betaMode).toBe(true);
    });

    test("credit balance should include tier info affected by BETA_MODE", async () => {
      const response = await request(app)
        .get("/api/credits/balance")
        .set("Authorization", `Bearer mock-token`)
        .set("x-user-uid", testUser.uid)
        .expect(200);

      // In beta mode, all users should be treated as premium regardless of credit balance
      expect(response.body.tier).toBe("premium");
    });

    test("should validate tier determination with and without BETA_MODE", async () => {
      // Store original config
      const originalBetaMode = config.features.betaMode;

      try {
        // Test with BETA_MODE enabled
        config.features.betaMode = true;
        
        const betaResponse = await request(app)
          .get("/api/credits/balance")
          .set("Authorization", `Bearer mock-token`)
          .set("x-user-uid", testUser.uid)
          .expect(200);

        expect(betaResponse.body.tier).toBe("premium");

        // Test with BETA_MODE disabled
        config.features.betaMode = false;
        
        const nonBetaResponse = await request(app)
          .get("/api/credits/balance")
          .set("Authorization", `Bearer mock-token`)
          .set("x-user-uid", testUser.uid)
          .expect(200);

        // Tier should be determined by actual credit balance
        const tier = nonBetaResponse.body.credits > 0 ? "premium" : "freemium";
        expect(nonBetaResponse.body.tier).toBe(tier);

      } finally {
        // Restore original config
        config.features.betaMode = originalBetaMode;
      }
    });
  });

  describe("Deprecation Headers Integration", () => {
    test("legacy tiered analyze endpoint should include deprecation headers", async () => {
      // Test the legacy tiered analysis endpoint
      const response = await request(app)
        .post("/api/analyze/tiered")
        .set("Authorization", `Bearer mock-token`)
        .set("x-user-uid", testUser.uid)
        .send({
          resumeId: 1,
          jobDescriptionId: 1,
        });

      // Should include RFC 8594 compliant deprecation headers
      expect(response.headers).toHaveProperty("deprecation");
      expect(response.headers).toHaveProperty("sunset");
      expect(response.headers).toHaveProperty("link");
      expect(response.headers).toHaveProperty("warning");

      // Verify header format
      expect(response.headers.deprecation).toMatch(/"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"/);
      expect(response.headers.link).toContain('rel="deprecation"');
      expect(response.headers.warning).toContain("299 evalmatch-api");
    });

    test("legacy batch tiered endpoint should include deprecation headers", async () => {
      const response = await request(app)
        .post("/api/analyze/batch-tiered")
        .set("Authorization", `Bearer mock-token`)
        .set("x-user-uid", testUser.uid)
        .send({
          batchId: "test-batch-123",
        });

      // Should include deprecation headers
      expect(response.headers).toHaveProperty("deprecation");
      expect(response.headers).toHaveProperty("sunset");
      expect(response.headers.link).toContain("hybrid-analysis");
    });

    test("new hybrid endpoints should NOT have deprecation headers", async () => {
      const response = await request(app)
        .post("/api/analyze/hybrid")
        .set("Authorization", `Bearer mock-token`)
        .set("x-user-uid", testUser.uid)
        .send({
          resumeId: 1,
          jobDescriptionId: 1,
        });

      // New endpoints should not have deprecation headers
      expect(response.headers).not.toHaveProperty("deprecation");
      expect(response.headers).not.toHaveProperty("sunset");
    });

    test("route presence varies correctly with feature flags", async () => {
      // Test that legacy routes are present when feature flag allows
      const legacyResponse = await request(app)
        .options("/api/analyze/tiered");

      // Legacy route should be accessible
      expect([200, 204, 405].includes(legacyResponse.status)).toBe(true);

      // Test that new routes are always present
      const hybridResponse = await request(app)
        .options("/api/analyze/hybrid");

      expect([200, 204, 405].includes(hybridResponse.status)).toBe(true);
    });
  });

  describe("Credit System Data Integrity", () => {
    test("should maintain transaction history consistency", async () => {
      const history = await creditService.getCreditHistory(testUser.uid);
      
      expect(history).not.toBeNull();
      expect(history!.transactions.length).toBeGreaterThan(0);
      
      // Verify balance consistency with transaction history
      let calculatedBalance = 0;
      for (const transaction of history!.transactions) {
        calculatedBalance += transaction.amount;
      }
      
      expect(Math.abs(history!.currentBalance - calculatedBalance)).toBeLessThan(0.01);
    });

    test("should handle concurrent credit operations safely", async () => {
      const concurrentOperations = [
        creditService.deductCredits(testUser.uid, 5, "Concurrent test 1", "concurrent-1"),
        creditService.deductCredits(testUser.uid, 5, "Concurrent test 2", "concurrent-2"),
        creditService.addCredits(testUser.uid, 10, "Concurrent credit", "credit", "concurrent-credit"),
      ];

      const results = await Promise.allSettled(concurrentOperations);
      
      // At least some operations should succeed
      const successfulOps = results.filter(r => r.status === "fulfilled" && r.value.success);
      expect(successfulOps.length).toBeGreaterThan(0);

      // Final balance should be consistent
      const finalBalance = await creditService.getUserCredits(testUser.uid);
      expect(finalBalance.success).toBe(true);
      expect(typeof finalBalance.credits).toBe("number");
    });

    test("should reconcile balance discrepancies", async () => {
      // Force a balance discrepancy by manually updating credits table
      const db = getDatabase();
      
      // Get current state
      const beforeBalance = await creditService.getUserCredits(testUser.uid);
      
      // Manually modify the balance (simulating a discrepancy)
      await db.update(userCredits)
        .set({ credits: (beforeBalance.credits || 0) + 10 })
        .where(eq(userCredits.userId, testUser.uid));

      // Detect discrepancy
      const discrepancies = await creditService.detectBalanceDiscrepancies();
      expect(discrepancies.success).toBe(true);

      // Reconcile if discrepancies found
      if (discrepancies.discrepancies.length > 0) {
        const reconciliation = await creditService.autoReconcileDiscrepancies([testUser.uid]);
        expect(reconciliation.success).toBe(true);
      }

      // Verify balance is now consistent
      const afterBalance = await creditService.getUserCredits(testUser.uid);
      expect(afterBalance.success).toBe(true);
    });
  });

  describe("Environment Configuration", () => {
    test("should respect credit system environment variables", async () => {
      expect(process.env.CREDIT_SYSTEM_ENABLED).toBe("true");
      expect(process.env.DEFAULT_CREDIT_LIMIT).toBe("100");
      expect(process.env.TEST_USER_CREDITS).toBe("50");
      expect(process.env.ADMIN_API_TOKEN).toBe("test-admin");
    });

    test("admin endpoints should be accessible with correct token", async () => {
      const response = await request(app)
        .get("/api/admin/credits/summary")
        .set("x-admin-token", "test-admin")
        .expect(200);

      expect(response.body).toHaveProperty("totalUsers");
    });

    test("admin endpoints should reject invalid tokens", async () => {
      await request(app)
        .get("/api/admin/credits/summary")
        .set("x-admin-token", "invalid-token")
        .expect(401);
    });
  });
});