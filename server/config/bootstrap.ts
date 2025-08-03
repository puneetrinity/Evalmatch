/**
 * Bootstrap Configuration
 *
 * Minimal configuration without circular dependencies.
 * Used for initial app startup and breaking dependency cycles.
 */

export const bootstrap = {
  port: parseInt(process.env.PORT || "5000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  authBypassMode: process.env.AUTH_BYPASS_MODE === "true",
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
};
