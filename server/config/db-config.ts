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
    max: number;               // Maximum number of clients in the pool
    idleTimeoutMillis: number; // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: number; // Maximum time to wait for a connection
    maxUses: number;           // Maximum number of uses for a client before being recycled
  };
  
  // Retry settings
  retry: {
    maxRetries: number;        // Maximum number of retry attempts
    initialDelayMs: number;    // Initial delay before first retry
    maxDelayMs: number;        // Maximum delay between retries
    backoffFactor: number;     // Exponential backoff multiplier
  };
  
  // Query settings
  query: {
    statementTimeout: number;  // SQL statement timeout in milliseconds
    queryTimeout: number;      // Overall query timeout in milliseconds
    heartbeatInterval: number; // How often to check connection health
  };
  
  // Connection status thresholds
  thresholds: {
    maxConsecutiveFailures: number; // Number of failures before marking as unavailable
    minSuccessesForRecovery: number; // Successes needed to mark as available again
  };
}

// Production configuration
const productionConfig: NeonDbConfig = {
  pooling: {
    max: 10, 
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
  }
};

// Development configuration
const developmentConfig: NeonDbConfig = {
  pooling: {
    max: 8,
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
  }
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
  }
};

// Select configuration based on current environment
function getDbConfig(): NeonDbConfig {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return productionConfig;
    case 'test':
      return testConfig;
    case 'development':
    default:
      return developmentConfig;
  }
}

// Export the configuration
export const dbConfig = getDbConfig();

// Helper to get database URL with appropriate connection parameters
export function getNeonDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL || '';
  
  if (!baseUrl) {
    return '';
  }
  
  // Parse the URL to add connection parameters if needed
  try {
    const url = new URL(baseUrl);
    
    // Add connection parameters if they don't exist
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', String(Math.floor(dbConfig.pooling.connectionTimeoutMillis / 1000)));
    }
    
    if (!url.searchParams.has('statement_timeout')) {
      url.searchParams.set('statement_timeout', String(dbConfig.query.statementTimeout));
    }
    
    if (!url.searchParams.has('idle_in_transaction_session_timeout')) {
      url.searchParams.set('idle_in_transaction_session_timeout', '30000');
    }
    
    return url.toString();
  } catch (error) {
    console.warn('Failed to parse DATABASE_URL, using as-is');
    return baseUrl;
  }
}

// Export connection pool options for easy access
export const poolOptions = {
  connectionString: getNeonDatabaseUrl(),
  max: dbConfig.pooling.max,
  idleTimeoutMillis: dbConfig.pooling.idleTimeoutMillis,
  connectionTimeoutMillis: dbConfig.pooling.connectionTimeoutMillis,
  maxUses: dbConfig.pooling.maxUses,
  keepAlive: true,
  allowExitOnIdle: true,
  statement_timeout: dbConfig.query.statementTimeout,
  query_timeout: dbConfig.query.queryTimeout
};