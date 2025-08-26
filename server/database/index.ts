/**
 * Unified Database Module
 *
 * Single, clean PostgreSQL implementation with proper connection pooling,
 * migrations, and error handling. Replaces the scattered db.ts, storage.ts,
 * and migration files with a coherent database layer.
 */

import { Pool, PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";
import { config } from "../config/unified-config";
import { logger } from "../config/logger";
import fs from "fs";
import path from "path";

// ES modules equivalent of __dirname - handle both CommonJS and ES modules
let currentDirPath: string;

// In test environment or when __dirname is not available, use process.cwd()
// This avoids syntax errors with import.meta.url in CommonJS environments
if (process.env.NODE_ENV === 'test' || typeof __dirname === 'undefined') {
  currentDirPath = path.join(process.cwd(), 'server', 'database');
} else {
  currentDirPath = __dirname;
}

// Database connection pool
let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// Connection statistics with leak detection
interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  lastSuccessfulQuery: Date | null;
  connectedSince: Date | null;
  connectionRetries: number;
  connectionTimeouts: number;
  queryTimeouts: number;
  poolExhausted: number;
  averageQueryTime: number;
  maxQueryTime: number;
  healthCheckFailures: number;
  // Leak detection metrics
  potentialLeaks: number;
  leaksDetected: number;
  leaksResolved: number;
  longestConnectionAge: number;
  staleConnections: number;
  forcedConnectionCleanups: number;
}

const stats: ConnectionStats = {
  totalConnections: 0,
  activeConnections: 0,
  failedConnections: 0,
  totalQueries: 0,
  successfulQueries: 0,
  failedQueries: 0,
  lastSuccessfulQuery: null,
  connectedSince: null,
  connectionRetries: 0,
  connectionTimeouts: 0,
  queryTimeouts: 0,
  poolExhausted: 0,
  averageQueryTime: 0,
  maxQueryTime: 0,
  healthCheckFailures: 0,
  // Leak detection metrics
  potentialLeaks: 0,
  leaksDetected: 0,
  leaksResolved: 0,
  longestConnectionAge: 0,
  staleConnections: 0,
  forcedConnectionCleanups: 0,
};

// Query timing tracking
const queryTimes: number[] = [];
const MAX_QUERY_TIME_SAMPLES = 100;

// Connection leak detection and tracking
interface TrackedConnection {
  id: string;
  acquiredAt: number;
  lastUsedAt: number;
  stackTrace: string;
  queryCount: number;
  isHealthCheck: boolean;
  warningIssued: boolean;
}

const trackedConnections = new Map<string, TrackedConnection>();
const CONNECTION_LEAK_THRESHOLD = 60000; // 60 seconds
const CONNECTION_STALE_THRESHOLD = 300000; // 5 minutes
const CONNECTION_CLEANUP_INTERVAL = 30000; // 30 seconds

let connectionCleanupTimer: NodeJS.Timeout | null = null;
let connectionIdCounter = 0;

/**
 * Generate unique connection ID for tracking
 */
function generateConnectionId(): string {
  return `conn_${Date.now()}_${++connectionIdCounter}`;
}

/**
 * Track a connection acquisition for leak detection
 */
function trackConnectionAcquisition(connectionId: string, isHealthCheck = false): void {
  const stackTrace = new Error().stack || 'No stack trace available';
  
  trackedConnections.set(connectionId, {
    id: connectionId,
    acquiredAt: Date.now(),
    lastUsedAt: Date.now(),
    stackTrace,
    queryCount: 0,
    isHealthCheck,
    warningIssued: false,
  });
  
  logger.debug(`Connection acquired and tracked: ${connectionId}`, {
    totalTracked: trackedConnections.size,
    isHealthCheck,
  });
}

/**
 * Track connection usage (queries)
 */
function trackConnectionUsage(connectionId: string): void {
  const tracked = trackedConnections.get(connectionId);
  if (tracked) {
    tracked.lastUsedAt = Date.now();
    tracked.queryCount++;
  }
}

/**
 * Track connection release and remove from tracking
 */
function trackConnectionRelease(connectionId: string): void {
  const tracked = trackedConnections.get(connectionId);
  if (tracked) {
    const lifespan = Date.now() - tracked.acquiredAt;
    logger.debug(`Connection released: ${connectionId}`, {
      lifespan,
      queryCount: tracked.queryCount,
      isHealthCheck: tracked.isHealthCheck,
    });
    
    trackedConnections.delete(connectionId);
    
    // Update statistics if connection was held too long
    if (lifespan > CONNECTION_LEAK_THRESHOLD && !tracked.isHealthCheck) {
      stats.potentialLeaks++;
      if (lifespan > CONNECTION_STALE_THRESHOLD) {
        stats.staleConnections++;
      }
    }
  }
}

/**
 * Detect and handle connection leaks
 */
async function detectAndHandleConnectionLeaks(): Promise<void> {
  if (!pool) return;
  
  const now = Date.now();
  const leakedConnections: TrackedConnection[] = [];
  const staleConnections: TrackedConnection[] = [];
  
  for (const [id, tracked] of trackedConnections) {
    const age = now - tracked.acquiredAt;
    const timeSinceLastUse = now - tracked.lastUsedAt;
    
    // Skip health check connections (they're expected to be short-lived)
    if (tracked.isHealthCheck) continue;
    
    // Detect potential leaks
    if (age > CONNECTION_LEAK_THRESHOLD) {
      if (!tracked.warningIssued) {
        logger.warn(`Potential connection leak detected`, {
          connectionId: id,
          age,
          timeSinceLastUse,
          queryCount: tracked.queryCount,
          stackTrace: tracked.stackTrace.split('\n').slice(0, 5).join('\n'), // First 5 lines only
        });
        tracked.warningIssued = true;
      }
      
      leakedConnections.push(tracked);
      stats.leaksDetected++;
      
      // Mark as stale if it's been inactive for too long
      if (timeSinceLastUse > CONNECTION_STALE_THRESHOLD) {
        staleConnections.push(tracked);
      }
    }
    
    // Update longest connection age metric
    if (age > stats.longestConnectionAge) {
      stats.longestConnectionAge = age;
    }
  }
  
  // Handle stale connections
  if (staleConnections.length > 0) {
    logger.error(`Detected ${staleConnections.length} stale connections that need cleanup`, {
      staleConnectionIds: staleConnections.map(c => c.id),
      ages: staleConnections.map(c => now - c.acquiredAt),
    });
    
    // In a real PostgreSQL environment, we might need to kill these connections
    // For now, we'll remove them from tracking as they're likely already dead
    for (const staleConn of staleConnections) {
      trackedConnections.delete(staleConn.id);
      stats.leaksResolved++;
      stats.forcedConnectionCleanups++;
    }
  }
  
  // Log summary if there are any leaks
  if (leakedConnections.length > 0) {
    logger.warn(`Connection leak detection summary`, {
      totalLeaks: leakedConnections.length,
      staleConnections: staleConnections.length,
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      },
    });
  }
}

/**
 * Start connection leak detection monitoring
 */
function startConnectionLeakDetection(): void {
  if (connectionCleanupTimer) {
    clearInterval(connectionCleanupTimer);
  }
  
  connectionCleanupTimer = setInterval(async () => {
    try {
      await detectAndHandleConnectionLeaks();
    } catch (error) {
      logger.error('Connection leak detection failed:', error);
    }
  }, CONNECTION_CLEANUP_INTERVAL);
  
  logger.info('Connection leak detection started', {
    cleanupInterval: CONNECTION_CLEANUP_INTERVAL,
    leakThreshold: CONNECTION_LEAK_THRESHOLD,
    staleThreshold: CONNECTION_STALE_THRESHOLD,
  });
}

/**
 * Stop connection leak detection monitoring
 */
function stopConnectionLeakDetection(): void {
  if (connectionCleanupTimer) {
    clearInterval(connectionCleanupTimer);
    connectionCleanupTimer = null;
    logger.info('Connection leak detection stopped');
  }
}

// Circuit breaker state
interface CircuitBreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

const circuitBreaker: CircuitBreakerState = {
  state: "CLOSED",
  failureCount: 0,
  lastFailureTime: 0,
  nextAttemptTime: 0,
};

// Configuration constants
const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  TIMEOUT_MS: 30000, // 30 seconds
  RETRY_INTERVAL_MS: 60000, // 1 minute
};

// Enhanced timeout configuration
const TIMEOUT_CONFIG = {
  CONNECTION_ACQUISITION: {
    PRODUCTION: 8000,   // 8 seconds in production
    DEVELOPMENT: 15000, // 15 seconds in development
    TEST: 5000,         // 5 seconds in test
  },
  QUERY_EXECUTION: {
    PRODUCTION: 30000,  // 30 seconds in production
    DEVELOPMENT: 60000, // 60 seconds in development
    TEST: 10000,        // 10 seconds in test
  },
  HEALTH_CHECK: {
    PRODUCTION: 5000,   // 5 seconds for health checks
    DEVELOPMENT: 10000, // 10 seconds in development
    TEST: 3000,         // 3 seconds in test
  },
};

const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
let healthCheckTimer: NodeJS.Timeout | null = null;

// Timeout utilities and enhanced error handling
interface TimeoutError extends Error {
  isTimeout: true;
  timeoutType: 'connection' | 'query' | 'health_check';
  duration: number;
  context?: string;
}

/**
 * Create a timeout error with enhanced information
 */
function createTimeoutError(
  type: 'connection' | 'query' | 'health_check',
  duration: number,
  context?: string,
): TimeoutError {
  const error = new Error(
    `${type.charAt(0).toUpperCase() + type.slice(1)} timeout after ${duration}ms${context ? ` (${context})` : ''}`
  ) as TimeoutError;
  
  error.isTimeout = true;
  error.timeoutType = type;
  error.duration = duration;
  error.context = context;
  error.name = 'TimeoutError';
  
  return error;
}

/**
 * Get environment-specific timeout value
 */
function getTimeout(
  category: keyof typeof TIMEOUT_CONFIG,
  environment: string = config.env
): number {
  const timeoutConfig = TIMEOUT_CONFIG[category];
  
  switch (environment) {
    case 'production':
      return timeoutConfig.PRODUCTION;
    case 'test':
      return timeoutConfig.TEST;
    case 'development':
    default:
      return timeoutConfig.DEVELOPMENT;
  }
}

/**
 * Create a timeout promise with enhanced error information
 */
function createTimeoutPromise<T = never>(
  timeoutMs: number,
  type: 'connection' | 'query' | 'health_check',
  context?: string,
): Promise<T> {
  return new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(createTimeoutError(type, timeoutMs, context));
    }, timeoutMs);
  });
}

/**
 * Execute an operation with environment-specific timeout and enhanced error handling
 */
async function withTimeout<T>(
  operation: () => Promise<T>,
  category: keyof typeof TIMEOUT_CONFIG,
  context?: string,
  customTimeoutMs?: number,
): Promise<T> {
  const timeoutMs = customTimeoutMs || getTimeout(category);
  const type = category === 'CONNECTION_ACQUISITION' ? 'connection' :
               category === 'HEALTH_CHECK' ? 'health_check' : 'query';
  
  const timeoutPromise = createTimeoutPromise<T>(timeoutMs, type, context);
  
  try {
    const result = await Promise.race([
      operation(),
      timeoutPromise,
    ]);
    return result;
  } catch (error) {
    // Enhanced timeout error logging
    if (error && typeof error === 'object' && 'isTimeout' in error && error.isTimeout) {
      const timeoutError = error as TimeoutError;
      
      // Update timeout statistics
      if (timeoutError.timeoutType === 'connection') {
        stats.connectionTimeouts++;
      } else if (timeoutError.timeoutType === 'query') {
        stats.queryTimeouts++;
      }
      
      logger.warn(`${timeoutError.timeoutType} timeout detected`, {
        type: timeoutError.timeoutType,
        duration: timeoutError.duration,
        context: timeoutError.context,
        environment: config.env,
        timeoutConfig: TIMEOUT_CONFIG[category],
      });
    }
    
    throw error;
  }
}

// Query caching with generic types
interface CachedQuery<T = unknown> {
  result: T[];
  timestamp: number;
  ttl: number;
}

const queryCache = new Map<string, CachedQuery<unknown>>();
const CACHE_CLEANUP_INTERVAL = 300000; // 5 minutes
let cacheCleanupTimer: NodeJS.Timeout | null = null;

// Cache statistics tracking
let cacheHits = 0;
let cacheMisses = 0;

// Prepared statements cache
const preparedStatements = new Map<string, boolean>();

/**
 * Initialize PostgreSQL database connection
 */
export async function initializeDatabase(): Promise<void> {
  if (!config.database.enabled) {
    logger.info(
      "Database disabled in configuration - will use memory storage fallback",
    );
    return;
  }

  if (!config.database.url) {
    const errorMsg = "Database is enabled but DATABASE_URL is not configured";
    logger.error(`❌ ${errorMsg}`);

    if (config.env === "production") {
      logger.error(
        "CRITICAL: Production environment requires valid database configuration",
      );
      throw new Error(`${errorMsg} - check environment variables`);
    } else {
      logger.warn(
        "Development environment missing database URL - this will cause connection failures",
      );
      throw new Error(`${errorMsg} - set DATABASE_URL environment variable`);
    }
  }

  try {
    logger.info("🔌 Initializing PostgreSQL connection...");

    // Create optimized connection pool with environment-specific settings
    const poolConfig = getOptimizedPoolConfig();

    pool = new Pool({
      connectionString: config.database.url,
      ...poolConfig,

      // SSL configuration
      ssl:
        config.env === "production"
          ? {
              rejectUnauthorized: false,
              // Enable SSL session reuse for better performance
              secureProtocol: "TLSv1_2_method",
            }
          : false,

      // Application identification
      application_name: `EvalMatch-${config.env}-${process.pid}`,
    });

    // Set up enhanced connection event handlers
    setupConnectionHandlers(pool);

    // Test initial connection and warm up pool
    await warmUpConnectionPool(pool);

    // Validate pool configuration
    await validatePoolConfiguration(pool);

    stats.connectedSince = new Date();
    logger.info("✅ PostgreSQL connection established successfully");

    // Initialize Drizzle ORM (without automatic migrations)
    db = drizzle(pool, { schema });
    logger.info("✅ Drizzle ORM initialized");

    // Run ONLY custom SQL migrations (Drizzle meta migrations disabled to prevent conflicts)
    await runMigrations();
    
    // Also run emergency migrations from migrate.cjs as a backup
    // This ensures critical columns are added even if SQL migrations fail
    try {
      // Try multiple possible paths for the emergency migration script
      const possibleMigrationScripts = [
        '../migrate.cjs',
        './migrate.cjs', 
        '../../migrate.cjs',
        path.join(currentDirPath, '..', 'migrate.cjs'),
        path.join(process.cwd(), 'server', 'migrate.cjs'),
        path.join(process.cwd(), 'build', 'migrate.cjs'),
      ];
      
      let migrationScript = null;
      for (const scriptPath of possibleMigrationScripts) {
        try {
          const resolved = path.resolve(scriptPath.startsWith('/') ? scriptPath : path.join(currentDirPath, scriptPath));
          if (fs.existsSync(resolved)) {
            migrationScript = require(resolved);
            logger.debug(`Found emergency migration script: ${resolved}`);
            break;
          }
        } catch (e) {
          // Try next path
          continue;
        }
      }
      
      if (migrationScript && migrationScript.runMigration) {
        logger.info("🔧 Running emergency column migrations...");
        await migrationScript.runMigration();
      } else {
        logger.debug("Emergency migration script not found - SQL migrations should be sufficient");
      }
    } catch (error) {
      logger.warn("Emergency migration script failed:", (error as Error).message);
      // Non-fatal - SQL migrations should handle everything
    }

    // Start periodic health checks
    startPeriodicHealthChecks();

    // Start cache cleanup
    startCacheCleanup();

    // Start connection leak detection
    startConnectionLeakDetection();
  } catch (error) {
    logger.error("❌ Failed to initialize database:", error);

    // In production, database connection failures should be fatal
    // Silent fallbacks mask critical infrastructure issues
    if (config.env === "production") {
      logger.error(
        "CRITICAL: Database connection failed in production environment",
      );
      logger.error(
        "Application cannot run safely without database connectivity",
      );
      throw new Error(
        `Database initialization failed in production: ${(error as Error).message}`,
      );
    } else {
      // In development/test, we can be more permissive to aid development
      logger.warn(
        "Database initialization failed in development - will throw error to maintain consistency",
      );
      throw error;
    }
  }
}

/**
 * Get optimized pool configuration based on environment and best practices
 */
function getOptimizedPoolConfig() {
  const env = config.env;
  const isProduction = env === "production";
  const isTest = env === "test";
  const _isDevelopment = env === "development";

  // Optimized environment-specific pool sizing based on research and best practices
  const poolConfigs = {
    production: {
      min: 8, // Maintain minimum connections for immediate availability
      max: 25, // Increased from 20 for better scalability (PostgreSQL default is 100)
      acquireTimeoutMillis: 8000, // Faster acquisition timeout for production
      createTimeoutMillis: 10000, // Connection creation timeout
      destroyTimeoutMillis: 5000, // Connection destruction timeout
      reapIntervalMillis: 1000, // Check for idle connections every second
      createRetryIntervalMillis: 200, // Retry connection creation every 200ms
      propagateCreateError: false, // Don't propagate create errors immediately
      maxUses: 10000, // Higher connection reuse for production
      validateOnBorrow: true, // Validate connections when borrowed
    },
    development: {
      min: 3, // Lower minimum for development
      max: 15, // Reasonable maximum for development
      acquireTimeoutMillis: 15000,
      createTimeoutMillis: 15000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 500,
      propagateCreateError: false,
      maxUses: 7500,
      validateOnBorrow: false, // Skip validation in development for speed
    },
    test: {
      min: 1, // Minimal connections for tests
      max: 8, // Small pool for parallel test execution
      acquireTimeoutMillis: 5000,
      createTimeoutMillis: 8000,
      destroyTimeoutMillis: 2000,
      reapIntervalMillis: 500,
      createRetryIntervalMillis: 100,
      propagateCreateError: true, // Fail fast in tests
      maxUses: 1000, // Low reuse for test isolation
      validateOnBorrow: false,
    },
  };

  const poolConfig = poolConfigs[env] || poolConfigs.development;

  return {
    // Core pool settings
    min: poolConfig.min,
    max: poolConfig.max,

    // Enhanced timeout settings based on environment
    connectionTimeoutMillis: poolConfig.acquireTimeoutMillis,
    acquireTimeoutMillis: poolConfig.acquireTimeoutMillis,
    createTimeoutMillis: poolConfig.createTimeoutMillis,
    destroyTimeoutMillis: poolConfig.destroyTimeoutMillis,
    reapIntervalMillis: poolConfig.reapIntervalMillis,
    createRetryIntervalMillis: poolConfig.createRetryIntervalMillis,

    // Connection lifecycle management
    idleTimeoutMillis: isProduction ? 45000 : isTest ? 3000 : 60000,
    maxUses: poolConfig.maxUses,

    // Query and statement timeouts
    query_timeout: isProduction ? 30000 : isTest ? 10000 : 60000,
    statement_timeout: isProduction ? 28000 : isTest ? 9000 : 55000,

    // Connection validation and health
    validateOnBorrow: poolConfig.validateOnBorrow,
    testOnBorrow: isProduction, // Test connections in production
    evictionRunIntervalMillis: isProduction ? 30000 : 60000,
    numTestsPerEvictionRun: 3,

    // Performance optimizations
    keepAlive: true,
    keepAliveInitialDelayMillis: isProduction ? 5000 : 15000,
    allowExitOnIdle: !isProduction, // Keep connections in production

    // Error handling and resilience
    propagateCreateError: poolConfig.propagateCreateError,
  };
}

/**
 * Set up enhanced connection pool event handlers with monitoring
 */
function setupConnectionHandlers(pool: Pool): void {
  pool.on("connect", (client) => {
    stats.totalConnections++;
    stats.activeConnections++;
    resetCircuitBreaker(); // Reset on successful connection
    logger.info(`✅ Database connection established`, {
      activeConnections: stats.activeConnections,
      totalConnections: stats.totalConnections,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    });

    // Set up client-level error handling
    client.on("error", (err) => {
      logger.error("PostgreSQL client error:", {
        error: err.message,
        code: (err as NodeJS.ErrnoException).code,
        severity: 'severity' in err ? (err as { severity?: string }).severity : undefined,
        stack: config.env === "development" ? err.stack : undefined,
        connectionInfo: {
          processID: 'processID' in client ? (client as { processID?: number }).processID : undefined,
          database: 'database' in client ? (client as { database?: string }).database : undefined,
        },
      });
      handleConnectionError(err);
    });
  });

  pool.on("error", (err) => {
    logger.error("PostgreSQL pool error:", {
      error: err.message,
      code: (err as NodeJS.ErrnoException).code,
      severity: 'severity' in err ? (err as { severity?: string }).severity : undefined,
      stack: config.env === "development" ? err.stack : undefined,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
        failed: stats.failedConnections,
      },
    });
    stats.failedConnections++;
    handleConnectionError(err);
  });

  pool.on("remove", () => {
    stats.activeConnections = Math.max(0, stats.activeConnections - 1);
    logger.debug(
      `Database connection removed (active: ${stats.activeConnections})`,
    );
  });

  pool.on("acquire", () => {
    logger.debug("Connection acquired from pool");
  });

  pool.on("release", () => {
    logger.debug("Connection released to pool");
  });
}

/**
 * Get database instance (Drizzle ORM)
 */
export function getDatabase() {
  if (!db) {
    // Provide more context about why database is not available
    if (!config.database.enabled) {
      throw new Error(
        "Database is disabled in configuration - enable database or use memory storage methods",
      );
    }
    throw new Error(
      "Database not initialized - database connection failed during startup",
    );
  }
  return db;
}

/**
 * Get raw connection pool
 */
export function getPool(): Pool | null {
  return pool;
}

/**
 * Check if database is available and properly initialized
 */
export function isDatabaseAvailable(): boolean {
  // If database is disabled in config, it's not available
  if (!config.database.enabled) {
    return false;
  }

  // Both pool and db must be initialized
  return pool !== null && db !== null;
}

/**
 * Circuit breaker and error handling
 */
function handleConnectionError(error: Error): void {
  circuitBreaker.failureCount++;
  circuitBreaker.lastFailureTime = Date.now();

  if (circuitBreaker.failureCount >= CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
    circuitBreaker.state = "OPEN";
    circuitBreaker.nextAttemptTime =
      Date.now() + CIRCUIT_BREAKER.RETRY_INTERVAL_MS;
    logger.warn(
      `Circuit breaker opened due to ${circuitBreaker.failureCount} failures`,
    );
  }

  // Track specific error types
  if (error.message.includes("timeout")) {
    stats.connectionTimeouts++;
  }
}

function resetCircuitBreaker(): void {
  if (circuitBreaker.state !== "CLOSED") {
    logger.info("Circuit breaker reset - connection restored");
    circuitBreaker.state = "CLOSED";
    circuitBreaker.failureCount = 0;
  }
}

function checkCircuitBreaker(): void {
  if (circuitBreaker.state === "OPEN") {
    if (Date.now() >= circuitBreaker.nextAttemptTime) {
      circuitBreaker.state = "HALF_OPEN";
      logger.info("Circuit breaker half-open - attempting connection");
    } else {
      throw new Error(
        "Circuit breaker is open - database connections temporarily unavailable",
      );
    }
  }
}

/**
 * Execute a raw SQL query with enhanced error handling, timeouts, and leak detection
 */
export async function executeQuery<T = unknown>(
  query: string,
  params?: unknown[],
  isHealthCheck = false,
): Promise<T[]> {
  if (!pool) {
    if (!config.database.enabled) {
      throw new Error(
        "Database queries not available - database is disabled in configuration",
      );
    }
    throw new Error(
      "Database connection not available - initialization may have failed",
    );
  }

  // Check circuit breaker
  checkCircuitBreaker();

  const startTime = Date.now();
  const connectionId = generateConnectionId();
  let client: PoolClient | null = null;

  try {
    stats.totalQueries++;

    // Get connection with enhanced timeout handling
    client = await withTimeout(
      () => pool!.connect(),
      'CONNECTION_ACQUISITION',
      `query: ${query.substring(0, 50)}...`,
    );
    
    // Track connection acquisition for leak detection
    trackConnectionAcquisition(connectionId, isHealthCheck);

    // Execute query with enhanced timeout and usage tracking
    trackConnectionUsage(connectionId);

    const timeoutCategory = isHealthCheck ? 'HEALTH_CHECK' : 'QUERY_EXECUTION';
    const result = await withTimeout(
      () => client!.query(query, params),
      timeoutCategory,
      `${isHealthCheck ? 'health_check' : 'query'}: ${query.substring(0, 50)}...`,
    );

    // Track query performance
    const queryTime = Date.now() - startTime;
    trackQueryPerformance(queryTime);

    stats.successfulQueries++;
    stats.lastSuccessfulQuery = new Date();
    resetCircuitBreaker();

    return result.rows;
  } catch (error) {
    const queryTime = Date.now() - startTime;

    stats.failedQueries++;

    // Enhanced timeout error handling
    if (error && typeof error === 'object' && 'isTimeout' in error && error.isTimeout) {
      const timeoutError = error as TimeoutError;
      
      logger.error(`Database operation timeout`, {
        timeoutType: timeoutError.timeoutType,
        duration: timeoutError.duration,
        context: timeoutError.context,
        query: query.substring(0, 100),
        connectionId,
        environment: config.env,
      });
      
      // Don't trigger circuit breaker for timeouts in development (might be debugging)
      if (config.env !== 'development') {
        handleConnectionError(timeoutError);
      }
    } else {
      // Handle other error types
      const errorMessage = (error as Error).message;
      
      if (errorMessage.includes("timeout")) {
        // Legacy timeout handling for non-enhanced timeouts
        stats.queryTimeouts++;
        logger.warn(`Legacy timeout detected after ${queryTime}ms:`, {
          query: query.substring(0, 100),
          connectionId,
        });
      }
      
      // Handle pool exhaustion
      if (errorMessage.includes("pool") && errorMessage.includes("exhausted")) {
        stats.poolExhausted++;
        logger.error("Connection pool exhausted", { connectionId });
      }
      
      handleConnectionError(error as Error);
    }

    // Comprehensive error logging
    logger.error("Query execution failed:", {
      query: query.substring(0, 200),
      error: (error as Error).message,
      errorType: (error as Error).name,
      isTimeout: error && typeof error === 'object' && 'isTimeout' in error,
      queryTime,
      connectionId,
      isHealthCheck,
    });
    
    throw error;
  } finally {
    if (client) {
      client.release();
      // Track connection release for leak detection
      trackConnectionRelease(connectionId);
    }
  }
}

/**
 * Track query performance metrics
 */
function trackQueryPerformance(queryTime: number): void {
  queryTimes.push(queryTime);

  // Keep only recent samples
  if (queryTimes.length > MAX_QUERY_TIME_SAMPLES) {
    queryTimes.shift();
  }

  // Update statistics
  stats.averageQueryTime =
    queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
  stats.maxQueryTime = Math.max(stats.maxQueryTime, queryTime);
}

/**
 * Test database connectivity
 */
export async function testConnection(): Promise<boolean> {
  if (!pool) {
    return false;
  }

  try {
    const result = await pool.query("SELECT 1 as test");
    return result.rows[0]?.test === 1;
  } catch (error) {
    logger.error("Database connectivity test failed:", error);
    return false;
  }
}

/**
 * Comprehensive database connection test for health checks
 */
export async function testDatabaseConnection(): Promise<{
  success: boolean;
  message: string;
  details?: {
    connectionCount?: number;
    queryTime?: number;
    version?: string;
  };
}> {
  if (!pool) {
    return {
      success: false,
      message: "Database pool not initialized",
    };
  }

  const startTime = Date.now();

  try {
    // Test basic connectivity
    const testResult = await pool.query("SELECT 1 as test");
    const queryTime = Date.now() - startTime;

    if (testResult.rows[0]?.test !== 1) {
      return {
        success: false,
        message: "Database query returned unexpected result",
      };
    }

    // Get additional connection info
    const stats = getConnectionStats();

    return {
      success: true,
      message: "Database connection healthy",
      details: {
        connectionCount: stats.activeConnections,
        queryTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Database connection failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Periodic health checks for connection pool
 */
function startPeriodicHealthChecks(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
  }

  healthCheckTimer = setInterval(async () => {
    try {
      await performHealthCheck();
    } catch (error) {
      logger.warn("Periodic health check failed:", error);
    }
  }, HEALTH_CHECK_INTERVAL);

  logger.info(
    `Started periodic health checks every ${HEALTH_CHECK_INTERVAL / 1000}s`,
  );
}

async function performHealthCheck(): Promise<void> {
  if (!pool) return;

  try {
    const startTime = Date.now();
    // Use executeQuery with health check flag for proper tracking
    const result = await executeQuery(
      "SELECT 1 as health_check, NOW() as server_time",
      [],
      true // Mark as health check
    );
    const responseTime = Date.now() - startTime;

    if ((result[0] as { health_check?: number })?.health_check === 1) {
      logger.debug(`Health check passed in ${responseTime}ms`);
    } else {
      throw new Error("Health check returned unexpected result");
    }
  } catch (error) {
    stats.healthCheckFailures++;
    logger.warn("Health check failed:", error);
    handleConnectionError(error as Error);
  }
}

/**
 * Get comprehensive database connection statistics
 */
export function getConnectionStats(): ConnectionStats & {
  uptime: number;
  connectionSuccessRate: number;
  querySuccessRate: number;
  poolInfo: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  circuitBreakerState: string;
  queryPerformance: {
    averageTime: number;
    maxTime: number;
    slowQueries: number;
  };
  timeoutConfiguration: {
    environment: string;
    connectionAcquisition: number;
    queryExecution: number;
    healthCheck: number;
  };
  timeoutStatistics: {
    connectionTimeouts: number;
    queryTimeouts: number;
    totalTimeouts: number;
  };
  connectionLeaks: {
    potentialLeaks: number;
    leaksDetected: number;
    leaksResolved: number;
    longestConnectionAge: number;
    staleConnections: number;
    forcedCleanups: number;
    currentlyTracked: number;
  };
} {
  const poolInfo = pool
    ? {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount,
      }
    : { totalCount: 0, idleCount: 0, waitingCount: 0 };

  return {
    ...stats,
    uptime: stats.connectedSince
      ? Math.floor((Date.now() - stats.connectedSince.getTime()) / 1000)
      : 0,
    connectionSuccessRate:
      stats.totalConnections > 0
        ? Math.round(
            ((stats.totalConnections - stats.failedConnections) /
              stats.totalConnections) *
              100,
          )
        : 0,
    querySuccessRate:
      stats.successfulQueries + stats.failedQueries > 0
        ? Math.round(
            (stats.successfulQueries /
              (stats.successfulQueries + stats.failedQueries)) *
              100,
          )
        : 0,
    poolInfo,
    circuitBreakerState: circuitBreaker.state,
    queryPerformance: {
      averageTime: Math.round(stats.averageQueryTime),
      maxTime: stats.maxQueryTime,
      slowQueries: queryTimes.filter((time) => time > 1000).length, // Queries over 1s
    },
    timeoutConfiguration: {
      environment: config.env,
      connectionAcquisition: getTimeout('CONNECTION_ACQUISITION'),
      queryExecution: getTimeout('QUERY_EXECUTION'),
      healthCheck: getTimeout('HEALTH_CHECK'),
    },
    timeoutStatistics: {
      connectionTimeouts: stats.connectionTimeouts,
      queryTimeouts: stats.queryTimeouts,
      totalTimeouts: stats.connectionTimeouts + stats.queryTimeouts,
    },
    connectionLeaks: {
      potentialLeaks: stats.potentialLeaks,
      leaksDetected: stats.leaksDetected,
      leaksResolved: stats.leaksResolved,
      longestConnectionAge: stats.longestConnectionAge,
      staleConnections: stats.staleConnections,
      forcedCleanups: stats.forcedConnectionCleanups,
      currentlyTracked: trackedConnections.size,
    },
  };
}

/**
 * Run database migrations
 */
async function runMigrations(): Promise<void> {
  if (!db) {
    throw new Error("Database not initialized");
  }

  try {
    logger.info("🔄 Running database migrations...");

    // Try multiple possible locations for migrations directory
    const possibleMigrationDirs = [
      path.join(currentDirPath, "..", "migrations"),              // server/migrations (dev)
      path.join(currentDirPath, "migrations"),                    // database/migrations 
      path.join(currentDirPath, "..", "..", "migrations"),        // root/migrations
      path.join(process.cwd(), "server", "migrations"),      // from project root
      path.join(process.cwd(), "build", "migrations"),       // production build
      path.join(process.cwd(), "migrations"),                // direct in working dir
    ];

    let migrationsDir: string | null = null;
    
    for (const dir of possibleMigrationDirs) {
      logger.debug(`Checking for migrations directory: ${dir}`);
      if (fs.existsSync(dir)) {
        migrationsDir = dir;
        logger.info(`Found migrations directory: ${dir}`);
        break;
      }
    }

    if (!migrationsDir) {
      logger.warn("No migrations directory found - assuming database is already set up", {
        searchedPaths: possibleMigrationDirs,
        currentWorkingDir: process.cwd(),
        currentDirPath,
      });
      return;
    }

    // Get all SQL migration files and sort them (exclude disabled files)
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql") && !file.includes(".disabled"))
      .sort();

    if (migrationFiles.length === 0) {
      logger.warn(
        "No migration files found - assuming database is already set up",
      );
      return;
    }

    // Run each migration file in order
    for (const migrationFile of migrationFiles) {
      const migrationPath = path.join(migrationsDir, migrationFile);
      logger.info(`🔄 Running migration: ${migrationFile}`);

      try {
        const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
        logger.debug(`Migration SQL length: ${migrationSQL.length} characters`);
        
        // Execute the entire migration as a single transaction
        // This handles PostgreSQL DO blocks and other complex procedural code properly
        logger.debug(`Executing migration as single transaction`);
        await executeQuery(migrationSQL);
        
        logger.info(`✅ Migration completed: ${migrationFile}`);
      } catch (error) {
        const pgError = error as { message?: string; code?: string; detail?: string };
        logger.error(`❌ Migration failed for file: ${migrationFile}`, {
          error: pgError.message || 'Unknown error',
          errorCode: pgError.code,
          errorDetail: pgError.detail,
          migrationFile
        });
        throw error;
      }
    }

    logger.info("✅ All database migrations completed successfully");
  } catch (error) {
    logger.error("❌ Migration failed:", error);
    throw error;
  }
}

/**
 * Close database connections gracefully with cleanup
 */
export async function closeDatabase(): Promise<void> {
  // Stop health checks
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }

  // Stop cache cleanup
  if (cacheCleanupTimer) {
    clearInterval(cacheCleanupTimer);
    cacheCleanupTimer = null;
  }

  // Stop connection leak detection
  stopConnectionLeakDetection();

  // Clear caches
  queryCache.clear();
  preparedStatements.clear();

  if (pool) {
    try {
      logger.info("Closing database connections gracefully...");

      // Set a timeout for graceful shutdown
      const shutdownTimeout = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Database shutdown timeout")), 10000);
      });

      const gracefulShutdown = pool.end();

      await Promise.race([gracefulShutdown, shutdownTimeout]);
      logger.info("✅ Database connections closed gracefully");
    } catch (error) {
      logger.error("Error during graceful database shutdown:", error);
      logger.warn("Forcing database connection termination...");

      // Force close if graceful shutdown fails
      try {
        await pool.end();
      } catch (forceError) {
        logger.error("Failed to force close database connections:", forceError);
      }
    } finally {
      pool = null;
      db = null;

      // Reset statistics
      Object.assign(stats, {
        activeConnections: 0,
        connectedSince: null,
      });

      logger.info("Database cleanup completed");
    }
  }
}

/**
 * Advanced connection validation with retry logic
 */
export async function validateConnection(retries = 3): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      checkCircuitBreaker();

      const result = await executeQuery(
        "SELECT 1 as test, version() as pg_version",
      );
      if ((result[0] as { test?: number })?.test === 1) {
        logger.debug(`Connection validation successful (attempt ${attempt})`);
        return true;
      }
    } catch (error) {
      logger.warn(
        `Connection validation failed (attempt ${attempt}/${retries}):`,
        error,
      );

      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
        logger.debug(`Retrying connection validation in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        stats.connectionRetries++;
      }
    }
  }

  return false;
}

/**
 * Get pool health metrics for monitoring
 */
export function getPoolHealth(): {
  healthy: boolean;
  metrics: {
    connections: {
      total: number;
      idle: number;
      active: number;
      waiting: number;
    };
    performance: {
      avgQueryTime: number;
      maxQueryTime: number;
      slowQueries: number;
    };
    errors: {
      connectionFailures: number;
      queryFailures: number;
      timeouts: number;
    };
    circuitBreaker: { state: string; failures: number };
  };
} {
  const poolInfo = pool
    ? {
        total: pool.totalCount,
        idle: pool.idleCount,
        active: pool.totalCount - pool.idleCount,
        waiting: pool.waitingCount,
      }
    : { total: 0, idle: 0, active: 0, waiting: 0 };

  const isHealthy =
    pool !== null &&
    circuitBreaker.state !== "OPEN" &&
    stats.healthCheckFailures < 5;

  return {
    healthy: isHealthy,
    metrics: {
      connections: poolInfo,
      performance: {
        avgQueryTime: Math.round(stats.averageQueryTime),
        maxQueryTime: stats.maxQueryTime,
        slowQueries: queryTimes.filter((time) => time > 1000).length,
      },
      errors: {
        connectionFailures: stats.failedConnections,
        queryFailures: stats.failedQueries,
        timeouts: stats.connectionTimeouts + stats.queryTimeouts,
      },
      circuitBreaker: {
        state: circuitBreaker.state,
        failures: circuitBreaker.failureCount,
      },
    },
  };
}

// Enhanced graceful shutdown handling
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, initiating graceful database shutdown...");
  await closeDatabase();
});

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, initiating graceful database shutdown...");
  await closeDatabase();
});

// Handle uncaught exceptions that might affect database connections
process.on("uncaughtException", async (error) => {
  logger.error("Uncaught exception - closing database connections:", error);
  await closeDatabase();
  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  logger.error("Unhandled rejection - database may be affected:", {
    reason,
    promise,
  });
  // Don't close database for unhandled rejections unless it's database-related
  if (reason && typeof reason === "object" && "message" in reason) {
    const message = (reason as Error).message;
    if (
      message.includes("database") ||
      message.includes("connection") ||
      message.includes("pool")
    ) {
      logger.warn("Database-related unhandled rejection detected");
      handleConnectionError(reason as Error);
    }
  }
});

/**
 * Query caching functionality
 */
function generateCacheKey(query: string, params?: unknown[]): string {
  return `${query}:${JSON.stringify(params || [])}`;
}

function isQueryCacheable(query: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();

  // Only cache SELECT queries that don't contain functions that return different results
  return (
    normalizedQuery.startsWith("select") &&
    !normalizedQuery.includes("now()") &&
    !normalizedQuery.includes("current_timestamp") &&
    !normalizedQuery.includes("random()") &&
    !normalizedQuery.includes("uuid_generate")
  );
}

function getCachedQuery<T = unknown>(cacheKey: string): T[] | null {
  const cached = queryCache.get(cacheKey) as CachedQuery<T> | undefined;
  if (!cached) {
    cacheMisses++;
    return null;
  }

  if (Date.now() - cached.timestamp > cached.ttl) {
    queryCache.delete(cacheKey);
    cacheMisses++;
    return null;
  }

  cacheHits++;
  return cached.result;
}

function setCachedQuery<T = unknown>(
  cacheKey: string,
  result: T[],
  ttlMs = 60000,
): void {
  queryCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
    ttl: ttlMs,
  } as CachedQuery<T>);
}

function startCacheCleanup(): void {
  if (cacheCleanupTimer) {
    clearInterval(cacheCleanupTimer);
  }

  cacheCleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of queryCache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        queryCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }
  }, CACHE_CLEANUP_INTERVAL);
}

/**
 * Execute a cached query (for SELECT statements)
 */
export async function executeCachedQuery<T = unknown>(
  query: string,
  params?: unknown[],
  cacheTtlMs = 60000,
): Promise<T[]> {
  if (!isQueryCacheable(query)) {
    return executeQuery<T>(query, params);
  }

  const cacheKey = generateCacheKey(query, params);
  const cachedResult = getCachedQuery<T>(cacheKey);

  if (cachedResult) {
    logger.debug("Cache hit for query:", query.substring(0, 50));
    return cachedResult;
  }

  const result = await executeQuery<T>(query, params);
  setCachedQuery<T>(cacheKey, result, cacheTtlMs);

  logger.debug("Cache miss - result cached for query:", query.substring(0, 50));
  return result;
}

/**
 * Execute a prepared statement
 */
export async function executePreparedStatement<T = unknown>(
  name: string,
  query: string,
  params?: unknown[],
): Promise<T[]> {
  if (!pool) {
    throw new Error("Database pool not available");
  }

  checkCircuitBreaker();

  const client = await pool.connect();
  try {
    // Prepare statement if not already prepared
    if (!preparedStatements.has(name)) {
      await client.query(`PREPARE ${name} AS ${query}`);
      preparedStatements.set(name, true);
      logger.debug(`Prepared statement '${name}'`);
    }

    // Execute prepared statement
    const result = await client.query(
      `EXECUTE ${name}${params ? `(${params.map((_, i) => `$${i + 1}`).join(", ")})` : ""}`,
      params,
    );
    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Clear query cache
 */
export function clearQueryCache(): void {
  const size = queryCache.size;
  queryCache.clear();
  logger.info(`Cleared query cache (${size} entries)`);
}

/**
 * Get detailed connection leak information for monitoring
 */
export function getConnectionLeakDetails(): {
  activeConnections: Array<{
    id: string;
    age: number;
    timeSinceLastUse: number;
    queryCount: number;
    isHealthCheck: boolean;
    warningIssued: boolean;
    isPotentialLeak: boolean;
    isStale: boolean;
  }>;
  summary: {
    total: number;
    potentialLeaks: number;
    staleConnections: number;
    healthCheckConnections: number;
    oldestConnectionAge: number;
  };
  thresholds: {
    leakThreshold: number;
    staleThreshold: number;
  };
} {
  const now = Date.now();
  const connections = [];
  let potentialLeaks = 0;
  let staleConnections = 0;
  let healthCheckConnections = 0;
  let oldestAge = 0;

  for (const [id, tracked] of trackedConnections) {
    const age = now - tracked.acquiredAt;
    const timeSinceLastUse = now - tracked.lastUsedAt;
    const isPotentialLeak = age > CONNECTION_LEAK_THRESHOLD;
    const isStale = timeSinceLastUse > CONNECTION_STALE_THRESHOLD;

    if (isPotentialLeak) potentialLeaks++;
    if (isStale) staleConnections++;
    if (tracked.isHealthCheck) healthCheckConnections++;
    if (age > oldestAge) oldestAge = age;

    connections.push({
      id,
      age,
      timeSinceLastUse,
      queryCount: tracked.queryCount,
      isHealthCheck: tracked.isHealthCheck,
      warningIssued: tracked.warningIssued,
      isPotentialLeak,
      isStale,
    });
  }

  return {
    activeConnections: connections.sort((a, b) => b.age - a.age), // Sort by age descending
    summary: {
      total: connections.length,
      potentialLeaks,
      staleConnections,
      healthCheckConnections,
      oldestConnectionAge: oldestAge,
    },
    thresholds: {
      leakThreshold: CONNECTION_LEAK_THRESHOLD,
      staleThreshold: CONNECTION_STALE_THRESHOLD,
    },
  };
}

/**
 * Get timeout configuration and statistics for monitoring
 */
export function getTimeoutConfiguration(): {
  configuration: {
    environment: string;
    connectionAcquisition: number;
    queryExecution: number;
    healthCheck: number;
  };
  statistics: {
    connectionTimeouts: number;
    queryTimeouts: number;
    totalTimeouts: number;
    timeoutRate: number;
  };
  thresholds: {
    connectionAcquisitionWarning: number;
    queryExecutionWarning: number;
    healthCheckWarning: number;
  };
} {
  const totalOperations = stats.totalQueries + stats.totalConnections;
  const totalTimeouts = stats.connectionTimeouts + stats.queryTimeouts;
  const timeoutRate = totalOperations > 0 ? (totalTimeouts / totalOperations) * 100 : 0;

  return {
    configuration: {
      environment: config.env,
      connectionAcquisition: getTimeout('CONNECTION_ACQUISITION'),
      queryExecution: getTimeout('QUERY_EXECUTION'),
      healthCheck: getTimeout('HEALTH_CHECK'),
    },
    statistics: {
      connectionTimeouts: stats.connectionTimeouts,
      queryTimeouts: stats.queryTimeouts,
      totalTimeouts,
      timeoutRate: Math.round(timeoutRate * 100) / 100,
    },
    thresholds: {
      connectionAcquisitionWarning: getTimeout('CONNECTION_ACQUISITION') * 0.8,
      queryExecutionWarning: getTimeout('QUERY_EXECUTION') * 0.8,
      healthCheckWarning: getTimeout('HEALTH_CHECK') * 0.8,
    },
  };
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  size: number;
  hitRate: number;
  oldestEntry: number;
} {
  const now = Date.now();
  let oldestTimestamp = now;

  for (const cached of queryCache.values()) {
    if (cached.timestamp < oldestTimestamp) {
      oldestTimestamp = cached.timestamp;
    }
  }

  const totalRequests = cacheHits + cacheMisses;
  const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

  return {
    size: queryCache.size,
    hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimal places
    oldestEntry: Math.floor((now - oldestTimestamp) / 1000),
  };
}

/**
 * Warm up the connection pool by creating initial connections
 */
async function warmUpConnectionPool(pool: Pool): Promise<void> {
  logger.info("🔥 Warming up connection pool...");

  try {
    const poolConfig = getOptimizedPoolConfig();
    const minConnections = poolConfig.min;
    const warmUpPromises: Promise<void>[] = [];

    // Create minimum number of connections
    for (let i = 0; i < minConnections; i++) {
      warmUpPromises.push(
        (async () => {
          const client = await pool.connect();
          try {
            // Test the connection with a simple query
            await client.query(
              "SELECT 1 as warmup_test, NOW() as connected_at",
            );
            logger.debug(
              `Connection ${i + 1}/${minConnections} warmed up successfully`,
            );
          } finally {
            client.release();
          }
        })(),
      );
    }

    await Promise.all(warmUpPromises);
    logger.info(
      `✅ Connection pool warmed up with ${minConnections} connections`,
    );
  } catch (error) {
    logger.warn("⚠️  Pool warm-up partially failed:", error);
    // Don't throw - the pool should still work even if warm-up fails
  }
}

/**
 * Validate pool configuration after initialization
 */
async function validatePoolConfiguration(pool: Pool): Promise<void> {
  logger.info("🔍 Validating pool configuration...");

  try {
    // Test connection acquisition time
    const startTime = Date.now();
    const client = await pool.connect();
    const acquireTime = Date.now() - startTime;

    try {
      // Test query execution
      const queryStart = Date.now();
      const result = await client.query(`
        SELECT 
          current_database() as database_name,
          current_user as username,
          version() as postgres_version,
          NOW() as server_time,
          pg_backend_pid() as backend_pid
      `);
      const queryTime = Date.now() - queryStart;

      // Log configuration validation results
      const dbInfo = result.rows[0];
      logger.info("✅ Pool configuration validated:", {
        database: dbInfo.database_name,
        user: dbInfo.username,
        postgresVersion: dbInfo.postgres_version.split(" ")[1], // Extract version number
        backendPid: dbInfo.backend_pid,
        connectionAcquireTime: `${acquireTime}ms`,
        queryExecutionTime: `${queryTime}ms`,
        poolStats: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
      });

      // Warn if performance is below expectations
      if (acquireTime > 1000) {
        logger.warn(
          `⚠️  Slow connection acquisition: ${acquireTime}ms (expected < 1000ms)`,
        );
      }

      if (queryTime > 100) {
        logger.warn(
          `⚠️  Slow query execution: ${queryTime}ms (expected < 100ms for simple queries)`,
        );
      }
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error("❌ Pool configuration validation failed:", error);
    throw error;
  }
}

// Export the schema for use in other modules
export { schema };
