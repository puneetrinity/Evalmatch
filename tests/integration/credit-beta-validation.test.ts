/**
 * Credit System and Beta Mode Validation Test
 * Validates environment setup and basic credit/beta functionality
 */

import { config } from "../../server/config/unified-config";

describe("Credit System and Beta Mode Validation", () => {
  describe("Environment Configuration", () => {
    test("should have all required environment variables set", () => {
      expect(process.env.ADMIN_API_TOKEN).toBe("test-admin");
      expect(process.env.BETA_MODE).toBe("true");
      expect(process.env.CREDIT_SYSTEM_ENABLED).toBe("true");
      expect(process.env.DATABASE_ENABLED).toBe("true");
      expect(process.env.DEFAULT_CREDIT_LIMIT).toBe("100");
      expect(process.env.TEST_USER_CREDITS).toBe("50");
    });

    test("should have database URL configured for tests", () => {
      expect(process.env.TEST_DATABASE_URL).toBeTruthy();
      expect(process.env.DATABASE_URL).toBeTruthy();
    });
  });

  describe("Beta Mode Configuration", () => {
    test("should enable beta mode in test environment", () => {
      expect(config.features.betaMode).toBe(true);
    });

    test("should have beta mode environment variables properly set", () => {
      expect(process.env.BETA_MODE).toBe("true");
    });
  });

  describe("Credit System Environment Integration", () => {
    test("should have credit system enabled", () => {
      expect(process.env.CREDIT_SYSTEM_ENABLED).toBe("true");
    });

    test("should have test credit amounts configured", () => {
      expect(parseInt(process.env.DEFAULT_CREDIT_LIMIT!)).toBe(100);
      expect(parseInt(process.env.TEST_USER_CREDITS!)).toBe(50);
    });
  });

  describe("Admin Authentication Setup", () => {
    test("should have admin token configured for protected routes", () => {
      expect(process.env.ADMIN_API_TOKEN).toBe("test-admin");
    });
  });

  describe("Test Stabilization Validation", () => {
    test("should have all stabilization environment variables from plan", () => {
      // Admin/Beta environment defaults (from plan implementation)
      expect(process.env.ADMIN_API_TOKEN).toBe("test-admin");
      expect(process.env.BETA_MODE).toBe("true");
      
      // Credit system configuration defaults (new addition)
      expect(process.env.CREDIT_SYSTEM_ENABLED).toBe("true");
      expect(process.env.DEFAULT_CREDIT_LIMIT).toBe("100");
      expect(process.env.TEST_USER_CREDITS).toBe("50");
      
      // Database configuration (for integration tests)
      expect(process.env.DATABASE_ENABLED).toBe("true");
      
      // AI provider mocks (from original plan)
      expect(process.env.OPENAI_API_KEY).toBe("mock-openai-api-key");
      expect(process.env.GROQ_API_KEY).toBe("mock-groq-api-key");
      expect(process.env.ANTHROPIC_API_KEY).toBe("mock-anthropic-api-key");
    });

    test("should have test modes enabled", () => {
      expect(process.env.NODE_ENV).toBe("test");
      expect(process.env.DISABLE_EXTERNAL_SERVICES).toBe("true");
      expect(process.env.MOCK_AI_PROVIDERS).toBe("true");
      expect(process.env.AUTH_BYPASS_MODE).toBe("true");
    });
  });
});