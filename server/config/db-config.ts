/**
 * Database Configuration
 *
 * This module provides centralized configuration for Neon PostgreSQL
 * with environment-specific settings and connection pooling options.
 */

// Base configuration for different environments
interface NeonDbConfig {
  // Connection pool settings
  pooling: {
    max: number; // Maximum number of clients in the pool
    idleTimeoutMillis: number; // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: number; // Maximum time to wait for a connection
    maxUses: number; // Maximum number of uses for a client before being recycled
  };

  // Retry settings
  retry: {
    maxRetries: number; // Maximum number of retry attempts
    initialDelayMs: number; // Initial delay before first retry
    maxDelayMs: number; // Maximum delay between retries
    backoffFactor: number; // Exponential backoff multiplier
  };

  // Query settings
  query: {
    statementTimeout: number; // SQL statement timeout in milliseconds
    queryTimeout: number; // Overall query timeout in milliseconds
    heartbeatInterval: number; // How often to check connection health
  };

  // Connection status thresholds
  thresholds: {
    maxConsecutiveFailures: number; // Number of failures before marking as unavailable
    minSuccessesForRecovery: number; // Successes needed to mark as available again
  };
}

// Production configuration (optimized for batch processing)
const productionConfig: NeonDbConfig = {
  pooling: {
    max: 15, // Increased for parallel batch processing
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 60000,
    maxUses: 7500,
  },
  retry: {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffFactor: 2.5,
  },
  query: {
    statementTimeout: 60000,
    queryTimeout: 60000,
    heartbeatInterval: 60000,
  },
  thresholds: {
    maxConsecutiveFailures: 3,
    minSuccessesForRecovery: 2,
  },
};

// Development configuration (optimized for batch processing)
const developmentConfig: NeonDbConfig = {
  pooling: {
    max: 12, // Increased for parallel batch processing
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 60000,
    maxUses: 7500,
  },
  retry: {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffFactor: 2.5,
  },
  query: {
    statementTimeout: 60000,
    queryTimeout: 60000,
    heartbeatInterval: 60000,
  },
  thresholds: {
    maxConsecutiveFailures: 3,
    minSuccessesForRecovery: 2,
  },
};

// Test configuration (optimized for automated testing)
const testConfig: NeonDbConfig = {
  pooling: {
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
    maxUses: 1000,
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 300,
    maxDelayMs: 3000,
    backoffFactor: 2,
  },
  query: {
    statementTimeout: 30000,
    queryTimeout: 30000,
    heartbeatInterval: 30000,
  },
  thresholds: {
    maxConsecutiveFailures: 2,
    minSuccessesForRecovery: 1,
  },
};

// Select configuration based on current environment
function getDbConfig(): NeonDbConfig {
  const env = process.env.NODE_ENV || "development";

  switch (env) {
    case "production":
      return productionConfig;
    case "test":
      return testConfig;
    case "development":
    default:
      return developmentConfig;
  }
}

// Export the configuration
export const dbConfig = getDbConfig();

// Helper to get database URL with appropriate connection parameters
export function getRailwayDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || "";

  if (!baseUrl) {
    return "";
  }

  // For Railway PostgreSQL, use the URL as-is - Railway handles SSL and other params
  return baseUrl;
}

// Export connection pool options for easy access
export const poolOptions = {
  connectionString: getRailwayDatabaseUrl(),
  max: dbConfig.pooling.max,
  idleTimeoutMillis: dbConfig.pooling.idleTimeoutMillis,
  connectionTimeoutMillis: dbConfig.pooling.connectionTimeoutMillis,
  maxUses: dbConfig.pooling.maxUses,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
};
