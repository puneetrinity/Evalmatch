/**
 * Comprehensive Health Check System
 *
 * Provides detailed health monitoring for:
 * - Database connectivity and performance
 * - External API availability
 * - Memory usage and system resources
 * - Application-specific health metrics
 * - Dependency status checks
 */

import { Request, Response } from "express";
import { logger } from "../config/logger";
import { config } from "../config/unified-config";

// Error handling utility for health checks
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return getErrorMessage(error);
  return String(error);
};

const getErrorDetails = (error: unknown) => ({
  message: getErrorMessage(error),
  stack: error instanceof Error ? error instanceof Error ? error.stack : undefined : undefined,
  type: error instanceof Error ? error.constructor.name : typeof error,
});

// Health check result interface
export interface HealthCheckResult {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  responseTime: number;
  message?: string;
  details?: any;
  lastChecked: string;
}

// Overall health status
export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  requestId?: string;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    critical?: number;
    warnings?: number;
    successRate?: number;
    averageResponseTime?: number;
  };
  performance?: {
    responseTime: number;
    cacheHitRate: number;
    averageCheckTime: number;
    slowestCheck: { name: string; time: number } | null;
    fastestCheck: { name: string; time: number } | null;
    totalRequests: number;
    recommendations: string[];
  };
  metadata?: {
    checkType: string;
    responseTime: number;
    performanceThresholds?: any;
    nextScheduledCheck?: string;
    cacheStatistics?: any;
    [key: string]: any;
  };
}

// Health check function type
type HealthCheckFunction = () => Promise<HealthCheckResult>;

// Registry of all health checks
const healthChecks = new Map<string, HealthCheckFunction>();

// Enhanced cache for health check results with performance tracking
interface CachedHealthResult {
  result: HealthCheckResult;
  expires: number;
  createdAt: number;
  hitCount: number;
  lastAccessed: number;
}

const healthCache = new Map<string, CachedHealthResult>();
const CACHE_TTL = 30000; // 30 seconds for most checks
const CACHE_TTL_FAST = 15000; // 15 seconds for fast checks (basic health)
const CACHE_TTL_SLOW = 60000; // 60 seconds for expensive checks (AI connectivity)

// Performance tracking
interface PerformanceStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  slowestCheck: { name: string; time: number } | null;
  fastestCheck: { name: string; time: number } | null;
  checksPerformed: Map<string, { count: number; totalTime: number }>;
}

const performanceStats: PerformanceStats = {
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averageResponseTime: 0,
  slowestCheck: null,
  fastestCheck: null,
  checksPerformed: new Map(),
};

/**
 * Register a health check
 */
export function registerHealthCheck(
  name: string,
  checkFn: HealthCheckFunction,
): void {
  healthChecks.set(name, checkFn);
  logger.debug(`Health check registered: ${name}`);
}

/**
 * Database connectivity and performance health check
 */
async function checkDatabase(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = "database";

  try {
    if (!config.database.enabled) {
      return {
        name: checkName,
        status: "degraded",
        responseTime: Date.now() - startTime,
        message: "Database disabled - using memory storage fallback",
        details: {
          enabled: false,
          fallbackMode: "memory",
          reason: "Database explicitly disabled in configuration",
        },
        lastChecked: new Date().toISOString(),
      };
    }

    // Dynamic import to avoid circular dependencies
    const { 
      testDatabaseConnection, 
      getConnectionStats, 
      getConnectionLeakDetails,
      getPoolHealth,
      getPool 
    } = await import("../database");

    // Run multiple database tests in parallel
    const testPromises = [
      // Basic connectivity test
      testDatabaseConnection(),
      // Get connection pool statistics
      Promise.resolve(getConnectionStats()),
      // Get connection leak details
      Promise.resolve(getConnectionLeakDetails()),
      // Get pool health metrics
      Promise.resolve(getPoolHealth()),
    ];

    const [connectivityResult, connectionStats, leakDetails, poolHealth] =
      await Promise.allSettled(testPromises);

    // Safely extract results
    const connectionStatsValue = connectionStats.status === 'fulfilled' ? connectionStats.value : null;
    const leakDetailsValue = leakDetails.status === 'fulfilled' ? leakDetails.value : null;
    const poolHealthValue = poolHealth.status === 'fulfilled' ? poolHealth.value : null;

    const responseTime = Date.now() - startTime;

    // Additional performance tests
    const performanceTests = {
      basicQuery: false,
      transactionTest: false,
      concurrentConnections: false,
      queryPerformance: 0,
    };

    // Test query performance with a simple query
    const pool = getPool();
    if (pool && (connectivityResult as any).success) {
      try {
        const queryStartTime = Date.now();

        // Test basic query performance
        await pool.query("SELECT 1 as test, NOW() as timestamp");
        performanceTests.basicQuery = true;
        performanceTests.queryPerformance = Date.now() - queryStartTime;

        // Test transaction capability
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT 1");
          await client.query("COMMIT");
          performanceTests.transactionTest = true;
        } catch (txError) {
          await client.query("ROLLBACK");
          logger.warn("Transaction test failed:", (txError as any).message);
        } finally {
          client.release();
        }

        // Test concurrent connections (lightweight test)
        try {
          const concurrentTests = Array(3)
            .fill(null)
            .map(() => pool.query("SELECT 1"));
          await Promise.all(concurrentTests);
          performanceTests.concurrentConnections = true;
        } catch (concurrentError) {
          logger.warn(
            "Concurrent connection test failed:",
            (concurrentError as any).message,
          );
        }
      } catch (performanceError) {
        logger.warn(
          "Database performance tests failed:",
          (performanceError as any).message,
        );
      }
    }

    // Determine overall status based on all tests
    let status: "healthy" | "degraded" | "unhealthy";
    let message: string;
    let issues: string[] = [];

    if (!(connectivityResult as any).success) {
      status = "unhealthy";
      message = (connectivityResult as any).message;
      issues.push("Database connectivity failed");
    } else {
      // Check for performance issues
      const hasPerformanceIssues =
        responseTime > 2000 ||
        performanceTests.queryPerformance > 500 ||
        connectionStatsValue?.querySuccessRate < 95;

      const hasConnectionIssues =
        connectionStatsValue?.activeConnections === 0 ||
        (connectionStatsValue?.failedConnections || 0) >
          (connectionStatsValue?.totalConnections || 1) * 0.1;

      // Check for connection leak issues
      const hasLeakIssues = leakDetailsValue && (
        leakDetailsValue.summary.potentialLeaks > 5 ||
        leakDetailsValue.summary.staleConnections > 0
      );

      // Check pool health
      const hasPoolIssues = poolHealthValue && !poolHealthValue.healthy;

      // Determine status based on severity
      if (hasPoolIssues || (leakDetailsValue?.summary.potentialLeaks || 0) > 10) {
        status = "unhealthy";
        if (hasPoolIssues) issues.push("Connection pool unhealthy");
        if ((leakDetailsValue?.summary.potentialLeaks || 0) > 10) {
          issues.push(`Critical connection leaks: ${leakDetailsValue?.summary.potentialLeaks}`);
        }
      } else if (hasConnectionIssues || hasLeakIssues || hasPerformanceIssues) {
        status = "degraded";
        if (hasConnectionIssues) issues.push("Connection pool issues detected");
        if (hasLeakIssues) issues.push(`Connection leaks detected: ${leakDetailsValue?.summary.potentialLeaks || 0}`);
        if (hasPerformanceIssues) issues.push("Performance issues detected");
      } else {
        status = "healthy";
      }

      // Generate appropriate message
      if (issues.length > 0) {
        message = `Database accessible but issues detected: ${issues.join(", ")} (${responseTime}ms response)`;
      } else {
        message = `Database fully operational (${responseTime}ms response)`;
      }
    }

    return {
      name: checkName,
      status,
      responseTime,
      message,
      details: {
        enabled: true,
        connectivity: {
          success: (connectivityResult as any).success,
          queryTime: (connectivityResult as any).details?.queryTime,
          connectionCount: (connectivityResult as any).details?.connectionCount,
        },
        connectionPool: connectionStatsValue ? {
          total: connectionStatsValue.totalConnections,
          active: connectionStatsValue.activeConnections,
          failed: connectionStatsValue.failedConnections,
          successRate: connectionStatsValue.querySuccessRate,
          uptime: connectionStatsValue.uptime,
          lastSuccessfulQuery: connectionStatsValue.lastSuccessfulQuery,
          poolInfo: connectionStatsValue.poolInfo,
          circuitBreakerState: connectionStatsValue.circuitBreakerState,
        } : null,
        performance: {
          tests: performanceTests,
          overallResponseTime: responseTime,
          thresholds: {
            responseTimeWarning: "2000ms",
            queryTimeWarning: "500ms",
            successRateWarning: "95%",
          },
        },
        connectionLeaks: leakDetailsValue ? {
          summary: leakDetailsValue.summary,
          thresholds: leakDetailsValue.thresholds,
          issues: issues.filter(issue => issue.includes('leak')),
        } : null,
        poolHealth: poolHealthValue ? {
          healthy: poolHealthValue.healthy,
          metrics: poolHealthValue.metrics,
        } : null,
        configuration: {
          url: config.database.url ? "configured" : "missing",
          poolSize: config.database.poolSize,
          connectionTimeout: config.database.connectionTimeout,
        },
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: checkName,
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      message: `Database check failed: ${getErrorMessage(error)}`,
      details: {
        enabled: config.database.enabled,
        error: getErrorMessage(error),
        stack: error instanceof Error ? error instanceof Error ? error.stack : undefined : undefined,
      },
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Memory usage health check with NODE_OPTIONS verification
 */
async function checkMemoryUsage(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = "memory";

  try {
    const memUsage = process.memoryUsage();
    const mbUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
    const mbTotal = Math.round(memUsage.heapTotal / 1024 / 1024);
    const usagePercent = Math.round(
      (memUsage.heapUsed / memUsage.heapTotal) * 100,
    );

    // Get V8 heap statistics to verify NODE_OPTIONS
    const v8 = await import("v8");
    const heapStats = v8.getHeapStatistics();
    const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
    const availableMB = Math.round(
      heapStats.total_available_size / 1024 / 1024,
    );

    // Check if NODE_OPTIONS is properly applied
    // Railway and other cloud platforms may have different memory constraints
    // Be flexible with heap limit expectations based on available system memory
    const systemMemoryGB = Math.round(mbTotal / 1024);
    const expectedHeapLimitMB = systemMemoryGB >= 8 ? 7168 : Math.min(7168, mbTotal * 0.8); // Use 80% of system memory if less than 8GB
    const nodeOptionsApplied = heapLimitMB > 2000; // Much higher than default ~1.7GB
    const nodeOptionsWorking = heapLimitMB >= Math.min(expectedHeapLimitMB * 0.7, 4000); // Accept at least 4GB or 70% of expected
    const nodeOptionsCorrect = nodeOptionsWorking;

    let status: "healthy" | "degraded" | "unhealthy" = "healthy";
    let message = `Memory: ${mbUsed}/${mbTotal}MB (${usagePercent}%), Limit: ${heapLimitMB}MB`;

    // Primary concern: Is NODE_OPTIONS working reasonably?
    if (!nodeOptionsApplied) {
      status = "unhealthy";
      message = `NODE_OPTIONS not applied! Heap limit: ${heapLimitMB}MB (expected >${2000}MB)`;
    } else if (!nodeOptionsWorking && systemMemoryGB >= 8) {
      // Only complain about low heap limit if system has plenty of memory
      status = "degraded";
      message = `NODE_OPTIONS could be higher. Heap limit: ${heapLimitMB}MB (system has ${systemMemoryGB}GB)`;
    }
    // Secondary concern: Current memory usage
    else if (usagePercent > 90) {
      status = "unhealthy";
      message += " - Critical memory usage";
    } else if (usagePercent > 75) {
      status = "degraded";
      message += " - High memory usage";
    } else {
      message += " - NODE_OPTIONS working correctly";
    }

    return {
      name: checkName,
      status,
      responseTime: Date.now() - startTime,
      message,
      details: {
        current: {
          heapUsed: mbUsed,
          heapTotal: mbTotal,
          usagePercent,
          external: Math.round(memUsage.external / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        limits: {
          heapSizeLimit: heapLimitMB,
          totalAvailable: availableMB,
          nodeOptionsApplied,
          nodeOptionsCorrect,
          expectedLimit: expectedHeapLimitMB,
          actualvsExpected: `${heapLimitMB}MB vs ${expectedHeapLimitMB}MB`,
        },
        configuration: {
          nodeOptions: process.env.NODE_OPTIONS || "NOT SET",
          nodeVersion: process.version,
          railwayEnv: !!process.env.RAILWAY_ENVIRONMENT,
        },
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: checkName,
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      message: `Memory check failed: ${getErrorMessage(error)}`,
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * AI Service availability check with actual connectivity testing
 */
async function checkAIServices(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = "ai_services";

  try {
    const providerResults = [];
    const issues = [];
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;

    // Test OpenAI connectivity
    if (process.env.OPENAI_API_KEY) {
      try {
        const testStartTime = Date.now();
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Test with a minimal API call (list models is lightweight)
        await Promise.race([
          openai.models.list(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000),
          ),
        ]);

        const responseTime = Date.now() - testStartTime;
        const status = responseTime > 2000 ? "degraded" : "healthy";

        providerResults.push({
          name: "OpenAI",
          status,
          responseTime,
          configured: true,
          accessible: true,
        });

        if (status === "healthy") healthyCount++;
        else if (status === "degraded") degradedCount++;
      } catch (error) {
        providerResults.push({
          name: "OpenAI",
          status: "unhealthy",
          configured: true,
          accessible: false,
          error: getErrorMessage(error),
        });
        issues.push(`OpenAI connectivity failed: ${getErrorMessage(error)}`);
        unhealthyCount++;
      }
    } else {
      providerResults.push({
        name: "OpenAI",
        status: "unhealthy",
        configured: false,
        accessible: false,
      });
      issues.push("OpenAI not configured");
      unhealthyCount++;
    }

    // Test Anthropic connectivity
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const testStartTime = Date.now();
        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        // Test with a minimal message (very short to minimize cost)
        await Promise.race([
          anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 5,
            messages: [{ role: "user", content: "Hi" }],
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000),
          ),
        ]);

        const responseTime = Date.now() - testStartTime;
        const status = responseTime > 3000 ? "degraded" : "healthy";

        providerResults.push({
          name: "Anthropic",
          status,
          responseTime,
          configured: true,
          accessible: true,
        });

        if (status === "healthy") healthyCount++;
        else if (status === "degraded") degradedCount++;
      } catch (error) {
        providerResults.push({
          name: "Anthropic",
          status: "unhealthy",
          configured: true,
          accessible: false,
          error: getErrorMessage(error),
        });
        issues.push(`Anthropic connectivity failed: ${getErrorMessage(error)}`);
        unhealthyCount++;
      }
    } else {
      providerResults.push({
        name: "Anthropic",
        status: "unhealthy",
        configured: false,
        accessible: false,
      });
      issues.push("Anthropic not configured");
      unhealthyCount++;
    }

    // Test Groq connectivity
    if (process.env.GROQ_API_KEY) {
      try {
        const testStartTime = Date.now();
        const Groq = (await import("groq-sdk")).default;
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

        // Test with a minimal chat completion
        await Promise.race([
          groq.chat.completions.create({
            model: "llama-3.1-8b-instant",
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 5000),
          ),
        ]);

        const responseTime = Date.now() - testStartTime;
        const status = responseTime > 2000 ? "degraded" : "healthy";

        providerResults.push({
          name: "Groq",
          status,
          responseTime,
          configured: true,
          accessible: true,
        });

        if (status === "healthy") healthyCount++;
        else if (status === "degraded") degradedCount++;
      } catch (error) {
        providerResults.push({
          name: "Groq",
          status: "unhealthy",
          configured: true,
          accessible: false,
          error: getErrorMessage(error),
        });
        issues.push(`Groq connectivity failed: ${getErrorMessage(error)}`);
        unhealthyCount++;
      }
    } else {
      providerResults.push({
        name: "Groq",
        status: "unhealthy",
        configured: false,
        accessible: false,
      });
      issues.push("Groq not configured");
      unhealthyCount++;
    }

    // Determine overall status
    let overallStatus: "healthy" | "degraded" | "unhealthy";
    if (healthyCount === 0 && degradedCount === 0) {
      overallStatus = "unhealthy";
    } else if (healthyCount === 0) {
      overallStatus = "degraded";
    } else if (unhealthyCount === 0) {
      overallStatus = "healthy";
    } else {
      overallStatus = "degraded";
    }

    const availableProviders = providerResults
      .filter((p) => p.accessible)
      .map((p) => p.name);

    const message =
      availableProviders.length > 0
        ? `AI providers accessible: ${availableProviders.join(", ")} (${healthyCount} healthy, ${degradedCount} degraded, ${unhealthyCount} unhealthy)`
        : "No AI providers accessible";

    return {
      name: checkName,
      status: overallStatus,
      responseTime: Date.now() - startTime,
      message,
      details: {
        providers: providerResults,
        summary: {
          total: providerResults.length,
          healthy: healthyCount,
          degraded: degradedCount,
          unhealthy: unhealthyCount,
          accessible: availableProviders.length,
        },
        issues: issues.length > 0 ? issues : undefined,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: checkName,
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      message: `AI services check failed: ${getErrorMessage(error)}`,
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Firebase authentication health check with comprehensive connectivity testing
 */
async function checkFirebaseAuth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = "firebase_auth";

  try {
    // Check if Firebase is configured
    if (!config.firebase.configured) {
      return {
        name: checkName,
        status: "degraded",
        responseTime: Date.now() - startTime,
        message: "Firebase not configured - using auth bypass mode",
        details: {
          configured: false,
          bypassMode: process.env.AUTH_BYPASS_MODE === "true",
          projectId: config.firebase.projectId || "not-set",
          hasServiceAccount: !!(
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
            process.env.GOOGLE_APPLICATION_CREDENTIALS
          ),
        },
        lastChecked: new Date().toISOString(),
      };
    }

    // Import unified Firebase auth system
    const { isFirebaseAuthAvailable, getFirebaseAuthStatus, verifyFirebaseConfiguration } = await import("../auth/firebase-auth");

    // Check if Firebase auth is available
    if (!isFirebaseAuthAvailable()) {
      const authStatus = getFirebaseAuthStatus();
      return {
        name: checkName,
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        message: authStatus.error || "Firebase Admin Auth not initialized - check service account configuration",
        details: {
          configured: true,
          initialized: authStatus.initialized,
          projectId: authStatus.projectId,
          hasServiceAccountKey: !!(
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64
          ),
          authStatus,
        },
        lastChecked: new Date().toISOString(),
      };
    }

    // Use the comprehensive Firebase verification from unified auth system
    const testStartTime = Date.now();
    
    try {
      const verificationResult = await verifyFirebaseConfiguration();
      const authStatus = getFirebaseAuthStatus();
      const testResponseTime = Date.now() - testStartTime;

      // Determine status based on verification result and response time
      let status: "healthy" | "degraded" | "unhealthy";
      let message: string;

      if (verificationResult.status === "success") {
        if (testResponseTime > 3000) {
          status = "degraded";
          message = `Firebase Auth accessible but slow (${testResponseTime}ms)`;
        } else {
          status = "healthy";
          message = "Firebase authentication service fully operational";
        }
      } else if (verificationResult.status === "not_configured") {
        status = "degraded";
        message = "Firebase not configured - using auth bypass mode";
      } else {
        status = "unhealthy";
        message = verificationResult.error || "Firebase Auth service not accessible";
      }

      return {
        name: checkName,
        status,
        responseTime: Date.now() - startTime,
        message,
        details: {
          configured: true,
          initialized: authStatus.initialized,
          projectId: authStatus.projectId,
          verification: verificationResult,
          authStatus,
          testResponseTime,
          credentials: {
            hasServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
            hasServiceAccountKeyBase64: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64,
            hasCredentialsFile: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
            type: process.env.FIREBASE_SERVICE_ACCOUNT_KEY_BASE64
              ? "service-account-key-base64"
              : process.env.FIREBASE_SERVICE_ACCOUNT_KEY
                ? "service-account-key"
                : process.env.GOOGLE_APPLICATION_CREDENTIALS
                  ? "credentials-file"
                  : "default",
          },
        },
        lastChecked: new Date().toISOString(),
      };
    } catch (error) {
      const authStatus = getFirebaseAuthStatus();
      return {
        name: checkName,
        status: "unhealthy",
        responseTime: Date.now() - startTime,
        message: `Firebase Auth service test failed: ${getErrorMessage(error)}`,
        details: {
          configured: true,
          initialized: authStatus.initialized,
          projectId: authStatus.projectId,
          error: getErrorMessage(error),
          errorCode: (error as any)?.code || "unknown",
          authStatus,
        },
        lastChecked: new Date().toISOString(),
      };
    }
  } catch (error) {
    return {
      name: checkName,
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      message: `Firebase auth check failed: ${getErrorMessage(error)}`,
      details: {
        error: getErrorMessage(error),
        configured: config.firebase.configured,
      },
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * File system health check (for uploads)
 */
async function checkFileSystem(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = "file_system";

  try {
    const fs = await import("fs/promises");
    const path = await import("path");

    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    const testFile = path.join(uploadDir, ".health-check");

    // Ensure upload directory exists
    try {
      await fs.mkdir(uploadDir, { recursive: true });
    } catch (mkdirError) {
      // Directory might already exist, continue
    }

    // Test write access
    await fs.writeFile(testFile, "health-check");

    // Test read access
    const content = await fs.readFile(testFile, "utf8");

    // Clean up test file
    await fs.unlink(testFile);

    const success = content === "health-check";

    return {
      name: checkName,
      status: success ? "healthy" : "unhealthy",
      responseTime: Date.now() - startTime,
      message: success
        ? "File system read/write operations working"
        : "File system access failed",
      details: {
        uploadDir,
        canWrite: true,
        canRead: success,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: checkName,
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      message: `File system check failed: ${getErrorMessage(error)}`,
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * External service dependencies health check
 */
async function checkExternalDependencies(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = "external_dependencies";

  try {
    const dependencyTests = [];
    const issues = [];

    // Test DNS resolution for critical external services
    const criticalDomains = [
      "api.openai.com",
      "api.anthropic.com",
      "api.groq.com",
      "securetoken.googleapis.com",
      "identitytoolkit.googleapis.com",
    ];

    // Test each domain
    for (const domain of criticalDomains) {
      const testStartTime = Date.now();
      try {
        const dns = await import("dns/promises");
        await Promise.race([
          dns.lookup(domain),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("DNS lookup timeout")), 3000),
          ),
        ]);

        dependencyTests.push({
          service: domain,
          status: "healthy",
          responseTime: Date.now() - testStartTime,
          accessible: true,
        });
      } catch (error) {
        dependencyTests.push({
          service: domain,
          status: "unhealthy",
          responseTime: Date.now() - testStartTime,
          accessible: false,
          error: getErrorMessage(error),
        });
        issues.push(`${domain}: ${getErrorMessage(error)}`);
      }
    }

    // Test network connectivity with a basic HTTP check
    const networkTests = [];

    // Test basic internet connectivity
    try {
      const testStartTime = Date.now();
      const https = await import("https");
      const { promisify } = await import("util");

      const testConnection = () =>
        new Promise((resolve, reject) => {
          const req = https.request(
            {
              hostname: "www.google.com",
              port: 443,
              path: "/",
              method: "HEAD",
              timeout: 5000,
            },
            (res) => {
              resolve(res.statusCode);
            },
          );

          req.on("error", reject);
          req.on("timeout", () => reject(new Error("Connection timeout")));
          req.end();
        });

      await testConnection();
      networkTests.push({
        test: "internet_connectivity",
        status: "healthy",
        responseTime: Date.now() - testStartTime,
      });
    } catch (networkError: unknown) {
      networkTests.push({
        test: "internet_connectivity",
        status: "unhealthy",
        error: getErrorMessage(networkError),
      });
      issues.push(`Internet connectivity: ${getErrorMessage(networkError)}`);
    }

    // Determine overall status
    const healthyDns = dependencyTests.filter(
      (t) => t.status === "healthy",
    ).length;
    const totalDns = dependencyTests.length;
    const networkHealthy = networkTests.some((t) => t.status === "healthy");

    let status: "healthy" | "degraded" | "unhealthy";
    let message: string;

    if (!networkHealthy) {
      status = "unhealthy";
      message = "No internet connectivity detected";
    } else if (healthyDns === 0) {
      status = "unhealthy";
      message = "All external service domains unreachable";
    } else if (healthyDns < totalDns * 0.5) {
      status = "degraded";
      message = `Limited external service access (${healthyDns}/${totalDns} domains reachable)`;
    } else if (healthyDns < totalDns) {
      status = "degraded";
      message = `Most external services accessible (${healthyDns}/${totalDns} domains reachable)`;
    } else {
      status = "healthy";
      message = "All external service dependencies accessible";
    }

    return {
      name: checkName,
      status,
      responseTime: Date.now() - startTime,
      message,
      details: {
        dnsTests: dependencyTests,
        networkTests,
        summary: {
          totalDomains: totalDns,
          accessibleDomains: healthyDns,
          successRate: Math.round((healthyDns / totalDns) * 100),
          internetConnectivity: networkHealthy,
        },
        issues: issues.length > 0 ? issues : undefined,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: checkName,
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      message: `External dependencies check failed: ${getErrorMessage(error)}`,
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * System resources and application metrics health check
 */
async function checkSystemResources(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const checkName = "system_resources";

  try {
    const uptime = process.uptime();
    const nodeVersion = process.version;
    const platform = process.platform;
    const arch = process.arch;

    // Get system resource information
    const os = await import("os");
    const fs = await import("fs/promises");

    // CPU information
    const cpuInfo = {
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || "unknown",
      loadAverage: os.loadavg(), // [1min, 5min, 15min]
      usage: 0, // Will calculate below
    };

    // Calculate approximate CPU usage
    const startCpuUsage = process.cpuUsage();
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms
    const endCpuUsage = process.cpuUsage(startCpuUsage);
    const totalCpuTime = endCpuUsage.user + endCpuUsage.system;
    cpuInfo.usage = Math.round((totalCpuTime / 100000) * 100) / 100; // Convert to percentage

    // Memory information (system and process)
    const systemMemory = {
      total: Math.round(os.totalmem() / 1024 / 1024), // MB
      free: Math.round(os.freemem() / 1024 / 1024), // MB
      used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024), // MB
      usagePercent: Math.round(
        ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
      ),
    };

    const processMemory = process.memoryUsage();
    const processMemoryMB = {
      heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(processMemory.heapTotal / 1024 / 1024),
      external: Math.round(processMemory.external / 1024 / 1024),
      rss: Math.round(processMemory.rss / 1024 / 1024), // Resident Set Size
      heapUsagePercent: Math.round(
        (processMemory.heapUsed / processMemory.heapTotal) * 100,
      ),
    };

    // Disk space information (current working directory)
    let diskInfo = {
      available: 0,
      total: 0,
      used: 0,
      usagePercent: 0,
      path: process.cwd(),
    };

    try {
      const stats = await fs.stat(process.cwd());
      if (platform !== "win32") {
        // Unix-like systems - try to get disk space using statvfs equivalent
        // This is a simplified approach - in production you might want to use a library like 'diskusage'
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);

        try {
          const { stdout } = await execAsync(
            `df -k "${process.cwd()}" | tail -1`,
          );
          const parts = stdout.trim().split(/\s+/);
          if (parts.length >= 4) {
            diskInfo.total = Math.round(parseInt(parts[1]) / 1024); // Convert KB to MB
            diskInfo.used = Math.round(parseInt(parts[2]) / 1024);
            diskInfo.available = Math.round(parseInt(parts[3]) / 1024);
            diskInfo.usagePercent = Math.round(
              (diskInfo.used / diskInfo.total) * 100,
            );
          }
        } catch (diskError: unknown) {
          logger.warn(
            "Could not get disk usage information:",
            getErrorMessage(diskError),
          );
        }
      }
    } catch (diskStatError: unknown) {
      logger.warn("Could not stat current directory:", getErrorMessage(diskStatError));
    }

    // Network information
    const networkInterfaces = os.networkInterfaces();
    const activeInterfaces = Object.keys(networkInterfaces).filter((name) =>
      networkInterfaces[name]?.some((iface) => !iface.internal),
    ).length;

    // Determine overall status based on resource usage
    let status: "healthy" | "degraded" | "unhealthy";
    let issues = [];

    // Check for resource issues
    if (systemMemory.usagePercent > 90) {
      issues.push("Critical system memory usage");
    } else if (systemMemory.usagePercent > 80) {
      issues.push("High system memory usage");
    }

    if (processMemoryMB.heapUsagePercent > 90) {
      issues.push("Critical process heap usage");
    } else if (processMemoryMB.heapUsagePercent > 80) {
      issues.push("High process heap usage");
    }

    if (cpuInfo.loadAverage[0] > cpuInfo.cores * 2) {
      issues.push("High CPU load average");
    }

    if (diskInfo.usagePercent > 95) {
      issues.push("Critical disk space");
    } else if (diskInfo.usagePercent > 85) {
      issues.push("Low disk space");
    }

    if (uptime < 10) {
      issues.push("Application recently started");
    }

    // Determine status
    const criticalIssues = issues.filter(
      (issue) =>
        issue.includes("Critical") || issue.includes("recently started"),
    );

    if (criticalIssues.length > 0) {
      status = criticalIssues.some((issue) => issue.includes("Critical"))
        ? "unhealthy"
        : "degraded";
    } else if (issues.length > 0) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    const message =
      issues.length > 0
        ? `System resources: ${issues.join(", ")}`
        : `System resources healthy - uptime ${Math.round(uptime)}s on ${platform}/${arch}`;

    return {
      name: checkName,
      status,
      responseTime: Date.now() - startTime,
      message,
      details: {
        application: {
          uptime: Math.round(uptime),
          nodeVersion,
          platform,
          architecture: arch,
          environment: config.env,
          processId: process.pid,
        },
        cpu: cpuInfo,
        memory: {
          system: systemMemory,
          process: processMemoryMB,
        },
        disk: diskInfo,
        network: {
          activeInterfaces,
          hostname: os.hostname(),
        },
        thresholds: {
          memoryWarning: "80%",
          memoryCritical: "90%",
          diskWarning: "85%",
          diskCritical: "95%",
          cpuLoadWarning: `${cpuInfo.cores * 2} (2x cores)`,
        },
        issues: issues.length > 0 ? issues : undefined,
      },
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    return {
      name: checkName,
      status: "unhealthy",
      responseTime: Date.now() - startTime,
      message: `System resources check failed: ${getErrorMessage(error)}`,
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Get dynamic TTL based on check type and performance characteristics
 */
function getDynamicTTL(checkName: string, responseTime: number): number {
  // Expensive checks (AI connectivity) get longer cache times
  if (checkName === "ai_services" || checkName === "external_dependencies") {
    return CACHE_TTL_SLOW;
  }

  // Fast checks get shorter cache times for more frequent updates
  if (checkName === "memory" || checkName === "system_resources") {
    return CACHE_TTL_FAST;
  }

  // Adaptive TTL based on response time
  if (responseTime > 2000) {
    return CACHE_TTL_SLOW; // Slow checks get cached longer
  } else if (responseTime < 100) {
    return CACHE_TTL_FAST; // Very fast checks can be cached shorter
  }

  return CACHE_TTL; // Default TTL
}

/**
 * Update performance statistics
 */
function updatePerformanceStats(
  checkName: string,
  responseTime: number,
  wasCache: boolean,
): void {
  performanceStats.totalRequests++;

  if (wasCache) {
    performanceStats.cacheHits++;
  } else {
    performanceStats.cacheMisses++;

    // Track check-specific performance
    const checkStats = performanceStats.checksPerformed.get(checkName) || {
      count: 0,
      totalTime: 0,
    };
    checkStats.count++;
    checkStats.totalTime += responseTime;
    performanceStats.checksPerformed.set(checkName, checkStats);

    // Update fastest/slowest check tracking
    if (
      !performanceStats.slowestCheck ||
      responseTime > performanceStats.slowestCheck.time
    ) {
      performanceStats.slowestCheck = { name: checkName, time: responseTime };
    }

    if (
      !performanceStats.fastestCheck ||
      responseTime < performanceStats.fastestCheck.time
    ) {
      performanceStats.fastestCheck = { name: checkName, time: responseTime };
    }

    // Update average response time
    const totalResponseTime = Array.from(
      performanceStats.checksPerformed.values(),
    ).reduce((sum, stats) => sum + stats.totalTime, 0);
    const totalChecks = Array.from(
      performanceStats.checksPerformed.values(),
    ).reduce((sum, stats) => sum + stats.count, 0);
    performanceStats.averageResponseTime =
      totalChecks > 0 ? Math.round(totalResponseTime / totalChecks) : 0;
  }
}

/**
 * Get cached health check result or run the check with enhanced performance tracking
 */
async function getCachedHealthCheck(
  name: string,
  checkFn: HealthCheckFunction,
): Promise<HealthCheckResult> {
  const cached = healthCache.get(name);
  const now = Date.now();

  // Return cached result if still valid
  if (cached && now < cached.expires) {
    cached.hitCount++;
    cached.lastAccessed = now;
    updatePerformanceStats(name, cached.result.responseTime, true);

    // Add cache metadata to result
    const cachedResult = {
      ...cached.result,
      metadata: {
        ...cached.result.details?.metadata,
        cached: true,
        cacheAge: Math.round((now - cached.createdAt) / 1000),
        hitCount: cached.hitCount,
      },
    };

    return cachedResult;
  }

  // Run the health check with timeout to prevent hanging
  const startTime = Date.now();
  try {
    const timeoutMs = 10000; // 10 second timeout for any health check
    const result = await Promise.race([
      checkFn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), timeoutMs),
      ),
    ]);

    const responseTime = Date.now() - startTime;
    const ttl = getDynamicTTL(name, responseTime);

    // Cache the result with enhanced metadata
    healthCache.set(name, {
      result,
      expires: now + ttl,
      createdAt: now,
      hitCount: 0,
      lastAccessed: now,
    });

    updatePerformanceStats(name, responseTime, false);

    // Add performance metadata to result
    const enhancedResult = {
      ...result,
      metadata: {
        ...result.details?.metadata,
        cached: false,
        ttl: Math.round(ttl / 1000),
        performanceCategory:
          responseTime > 2000 ? "slow" : responseTime < 100 ? "fast" : "normal",
      },
    };

    return enhancedResult;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    updatePerformanceStats(name, responseTime, false);

    // Return error result with timeout information
    const errorResult: HealthCheckResult = {
      name,
      status: "unhealthy",
      responseTime,
      message: getErrorMessage(error).includes("timeout")
        ? `Health check timed out after ${Math.round(responseTime / 1000)}s`
        : `Health check failed: ${getErrorMessage(error)}`,
      lastChecked: new Date().toISOString(),
      details: {
        error: getErrorMessage(error),
        timeout: getErrorMessage(error).includes("timeout"),
        responseTime,
      },
    };

    return errorResult;
  }
}

/**
 * Run all health checks
 */
async function runAllHealthChecks(): Promise<HealthCheckResult[]> {
  // Default health checks
  const defaultChecks = [
    { name: "database", fn: checkDatabase },
    { name: "memory", fn: checkMemoryUsage },
    { name: "ai_services", fn: checkAIServices },
    { name: "firebase_auth", fn: checkFirebaseAuth },
    { name: "file_system", fn: checkFileSystem },
    { name: "system_resources", fn: checkSystemResources },
    { name: "external_dependencies", fn: checkExternalDependencies },
  ];

  // Combine default checks with registered checks
  const allChecks = [
    ...defaultChecks,
    ...Array.from(healthChecks.entries()).map(([name, fn]) => ({ name, fn })),
  ];

  // Run all checks in parallel
  const results = await Promise.all(
    allChecks.map(({ name, fn }) => getCachedHealthCheck(name, fn)),
  );

  return results;
}

/**
 * Determine overall health status
 */
function determineOverallStatus(
  checks: HealthCheckResult[],
): "healthy" | "degraded" | "unhealthy" {
  const unhealthyCount = checks.filter((c) => c.status === "unhealthy").length;
  const degradedCount = checks.filter((c) => c.status === "degraded").length;

  if (unhealthyCount > 0) {
    return "unhealthy";
  } else if (degradedCount > 0) {
    return "degraded";
  } else {
    return "healthy";
  }
}

/**
 * Check if a health check is considered critical for system operation
 */
function isCriticalCheck(checkName: string): boolean {
  const criticalChecks = ["database", "memory", "system_resources"];
  return criticalChecks.includes(checkName);
}

/**
 * Calculate comprehensive cache performance metrics
 */
function calculateCacheHitRate(): number {
  if (performanceStats.totalRequests === 0) return 0;
  return Math.round(
    (performanceStats.cacheHits / performanceStats.totalRequests) * 100,
  );
}

/**
 * Get comprehensive performance metrics
 */
function getPerformanceMetrics() {
  const now = Date.now();
  const validCacheEntries = Array.from(healthCache.values()).filter(
    (entry) => now < entry.expires,
  ).length;

  const checkPerformance = Array.from(
    performanceStats.checksPerformed.entries(),
  )
    .map(([name, stats]) => ({
      name,
      averageTime: Math.round(stats.totalTime / stats.count),
      executionCount: stats.count,
      totalTime: stats.totalTime,
    }))
    .sort((a, b) => b.averageTime - a.averageTime);

  return {
    cache: {
      hitRate: calculateCacheHitRate(),
      totalRequests: performanceStats.totalRequests,
      hits: performanceStats.cacheHits,
      misses: performanceStats.cacheMisses,
      validEntries: validCacheEntries,
      totalEntries: healthCache.size,
    },
    performance: {
      averageResponseTime: performanceStats.averageResponseTime,
      slowestCheck: performanceStats.slowestCheck,
      fastestCheck: performanceStats.fastestCheck,
      checkPerformance: checkPerformance.slice(0, 5), // Top 5 slowest
    },
    recommendations: generatePerformanceRecommendations(),
  };
}

/**
 * Generate performance optimization recommendations
 */
function generatePerformanceRecommendations(): string[] {
  const recommendations = [];

  if (calculateCacheHitRate() < 50) {
    recommendations.push(
      "Consider increasing cache TTL for frequently accessed health checks",
    );
  }

  if (performanceStats.averageResponseTime > 1000) {
    recommendations.push(
      "Health check response times are slow - consider optimizing check implementations",
    );
  }

  if (
    performanceStats.slowestCheck &&
    performanceStats.slowestCheck.time > 5000
  ) {
    recommendations.push(
      `Consider optimizing the '${performanceStats.slowestCheck.name}' health check - it's taking ${Math.round(performanceStats.slowestCheck.time / 1000)}s`,
    );
  }

  const aiServicesStats = performanceStats.checksPerformed.get("ai_services");
  if (
    aiServicesStats &&
    aiServicesStats.totalTime / aiServicesStats.count > 3000
  ) {
    recommendations.push(
      "AI services connectivity checks are slow - consider reducing test complexity or increasing cache TTL",
    );
  }

  return recommendations;
}

/**
 * Basic health check endpoint (fast) - optimized for load balancers
 */
export async function basicHealthCheck(
  req: Request,
  res: Response,
): Promise<void> {
  const startTime = Date.now();
  const requestId =
    req.headers["x-request-id"] ||
    `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Set response headers for caching and monitoring
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("X-Health-Check-Type", "basic");
  res.setHeader("X-Request-ID", requestId);

  try {
    // Run only essential checks for fast response
    const essentialChecks = await Promise.all([
      getCachedHealthCheck("database", checkDatabase),
      getCachedHealthCheck("memory", checkMemoryUsage),
    ]);

    const status = determineOverallStatus(essentialChecks);
    const responseTime = Date.now() - startTime;

    const response = {
      success: status !== "unhealthy",
      data: {
        status,
        uptime: Math.round(process.uptime()),
        version: process.env.npm_package_version || "1.0.0",
        environment: config.env,
        requestId,
        checks: essentialChecks.map((check) => ({
          name: check.name,
          status: check.status,
          responseTime: check.responseTime,
        })),
        metadata: {
          checkType: "basic",
          checksPerformed: essentialChecks.length,
          cacheHitRate: calculateCacheHitRate(),
        },
      },
      timestamp: new Date().toISOString(),
    };

    // Determine HTTP status code based on health status
    let httpStatus: number;
    switch (status) {
      case "healthy":
        httpStatus = 200; // OK
        break;
      case "degraded":
        httpStatus = 200; // OK but with warnings (for load balancer compatibility)
        res.setHeader("X-Health-Warning", "degraded");
        break;
      case "unhealthy":
        httpStatus = 503; // Service Unavailable
        res.setHeader("X-Health-Status", "unhealthy");
        break;
      default:
        httpStatus = 500; // Internal Server Error
    }

    res.status(httpStatus).json(response);

    // Log health check results for monitoring
    logger.info(
      {
        healthCheck: {
          type: "basic",
          status,
          responseTime,
          requestId,
          httpStatus,
          checksPerformed: essentialChecks.length,
        },
      },
      `Basic health check completed: ${status}`,
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error(
      {
        healthCheck: {
          type: "basic",
          status: "error",
          responseTime,
          requestId,
          error: getErrorMessage(error),
        },
      },
      "Basic health check failed",
    );

    res.status(503).json({
      success: false,
      error: "Health check system failure",
      message:
        config.env === "development"
          ? getErrorMessage(error)
          : "Internal health check error",
      code: "HEALTH_CHECK_ERROR",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Detailed health check endpoint (comprehensive) - for monitoring systems
 */
export async function detailedHealthCheck(
  req: Request,
  res: Response,
): Promise<void> {
  const startTime = Date.now();
  const requestId =
    req.headers["x-request-id"] ||
    `detailed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Set response headers
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("X-Health-Check-Type", "detailed");
  res.setHeader("X-Request-ID", requestId);

  try {
    // Run all health checks
    const checks = await runAllHealthChecks();
    const overallStatus = determineOverallStatus(checks);
    const responseTime = Date.now() - startTime;

    // Calculate comprehensive summary
    const summary = {
      total: checks.length,
      healthy: checks.filter((c) => c.status === "healthy").length,
      degraded: checks.filter((c) => c.status === "degraded").length,
      unhealthy: checks.filter((c) => c.status === "unhealthy").length,
      successRate: Math.round(
        (checks.filter((c) => c.status === "healthy").length / checks.length) *
          100,
      ),
      averageResponseTime: Math.round(
        checks.reduce((sum, check) => sum + check.responseTime, 0) /
          checks.length,
      ),
    };

    const performanceMetrics = getPerformanceMetrics();

    const response = {
      success: overallStatus !== "unhealthy",
      data: {
        status: overallStatus,
        uptime: Math.round(process.uptime()),
        version: process.env.npm_package_version || "1.0.0",
        environment: config.env,
        requestId,
        checks,
        summary: {
          ...summary,
          critical: checks.filter(
            (c) => isCriticalCheck(c.name) && c.status === "unhealthy",
          ).length,
          warnings: checks.filter((c) => c.status === "degraded").length,
        },
        performance: {
          responseTime,
          cacheHitRate: performanceMetrics.cache.hitRate,
          averageCheckTime: performanceMetrics.performance.averageResponseTime,
          slowestCheck: performanceMetrics.performance.slowestCheck,
          fastestCheck: performanceMetrics.performance.fastestCheck,
          totalRequests: performanceMetrics.cache.totalRequests,
          recommendations: performanceMetrics.recommendations,
        },
        metadata: {
          checkType: "detailed",
          responseTime,
          performanceThresholds: {
            responseTimeWarning: "2000ms",
            responseTimeCritical: "5000ms",
            successRateWarning: "95%",
            successRateCritical: "90%",
            cacheHitRateTarget: "70%",
          },
          nextScheduledCheck: new Date(Date.now() + CACHE_TTL).toISOString(),
          cacheStatistics: performanceMetrics.cache,
        },
      },
      timestamp: new Date().toISOString(),
    };

    // Determine HTTP status code with more granular logic
    let httpStatus: number;
    const criticalFailures = checks.filter(
      (c) => isCriticalCheck(c.name) && c.status === "unhealthy",
    ).length;

    if (criticalFailures > 0) {
      httpStatus = 503; // Service Unavailable - critical systems down
      res.setHeader("X-Health-Status", "critical-failure");
    } else if (overallStatus === "unhealthy") {
      httpStatus = 503; // Service Unavailable - multiple failures
      res.setHeader("X-Health-Status", "unhealthy");
    } else if (overallStatus === "degraded") {
      if (summary.successRate < 90) {
        httpStatus = 503; // Service Unavailable - too many degraded services
        res.setHeader("X-Health-Status", "degraded-critical");
      } else {
        httpStatus = 200; // OK but with warnings
        res.setHeader("X-Health-Warning", "degraded-performance");
      }
    } else {
      httpStatus = 200; // OK - all systems healthy
    }

    res.status(httpStatus).json(response);

    // Comprehensive logging for monitoring
    logger.info(
      {
        healthCheck: {
          type: "detailed",
          status: overallStatus,
          responseTime,
          requestId,
          httpStatus,
          summary,
          criticalFailures,
          unhealthyChecks: checks
            .filter((c) => c.status === "unhealthy")
            .map((c) => ({
              name: c.name,
              message: c.message,
              responseTime: c.responseTime,
            })),
          degradedChecks: checks
            .filter((c) => c.status === "degraded")
            .map((c) => c.name),
        },
      },
      `Detailed health check completed: ${overallStatus}`,
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error(
      {
        healthCheck: {
          type: "detailed",
          status: "error",
          responseTime,
          requestId,
          error: getErrorMessage(error),
          stack: config.env === "development" ? error instanceof Error ? error.stack : undefined : undefined,
        },
      },
      "Detailed health check failed",
    );

    res.status(503).json({
      success: false,
      error: "Health check system failure",
      message:
        config.env === "development"
          ? getErrorMessage(error)
          : "Internal health check error",
      code: "HEALTH_CHECK_ERROR",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Liveness probe (Kubernetes-style) - determines if app should be restarted
 */
export async function livenessProbe(
  req: Request,
  res: Response,
): Promise<void> {
  const startTime = Date.now();
  const requestId = req.headers["x-request-id"] || `live-${Date.now()}`;

  // Set Kubernetes-compatible headers
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("X-Probe-Type", "liveness");
  res.setHeader("X-Request-ID", requestId);

  try {
    const responseTime = Date.now() - startTime;
    const uptime = Math.round(process.uptime());
    const memoryUsage = process.memoryUsage();
    const heapUsagePercent = Math.round(
      (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
    );

    // Simple liveness checks - app is alive if it can respond and isn't critically broken
    let isAlive = true;
    let issues = [];
    let status = "alive";

    // Check for critical memory issues that would require restart
    if (heapUsagePercent > 95) {
      isAlive = false;
      issues.push("Critical memory exhaustion detected");
      status = "requires_restart";
    }

    // Check if response time is extremely slow (indicates hanging)
    if (responseTime > 10000) {
      isAlive = false;
      issues.push("Application response time critically slow");
      status = "requires_restart";
    }

    // Check uptime - if too short, might be in restart loop
    if (uptime < 5) {
      issues.push("Application recently restarted");
      status = uptime < 2 ? "starting" : "alive";
    }

    const httpStatus = isAlive ? 200 : 503;

    const response = {
      success: isAlive,
      data: {
        status,
        uptime,
        message: isAlive
          ? `Application is alive (uptime: ${uptime}s)`
          : "Application requires restart",
        details: {
          processId: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          memoryUsagePercent: heapUsagePercent,
          heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        },
        issues: issues.length > 0 ? issues : undefined,
        metadata: {
          probeType: "liveness",
          thresholds: {
            memoryWarning: "95%",
            responseTimeWarning: "10000ms",
            minimumUptime: "5s",
          },
        },
      },
      timestamp: new Date().toISOString(),
    };

    res.status(httpStatus).json(response);

    // Log liveness probe results
    logger.info(
      {
        probe: {
          type: "liveness",
          status,
          isAlive,
          responseTime,
          requestId,
          uptime,
          memoryUsagePercent: heapUsagePercent,
          issues: issues.length,
        },
      },
      `Liveness probe: ${status.toUpperCase()}`,
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error(
      {
        probe: {
          type: "liveness",
          status: "error",
          responseTime,
          requestId,
          error: getErrorMessage(error),
        },
      },
      "Liveness probe failed",
    );

    // If we can't even run the liveness check, the app is likely dead
    res.status(503).json({
      success: false,
      error: "Liveness probe system failure",
      message:
        config.env === "development"
          ? getErrorMessage(error)
          : "Unable to determine liveness status",
      code: "LIVENESS_PROBE_ERROR",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Readiness probe (Kubernetes-style) - determines if app can receive traffic
 */
export async function readinessProbe(
  req: Request,
  res: Response,
): Promise<void> {
  const startTime = Date.now();
  const requestId = req.headers["x-request-id"] || `ready-${Date.now()}`;

  // Set Kubernetes-compatible headers
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("X-Probe-Type", "readiness");
  res.setHeader("X-Request-ID", requestId);

  try {
    // Check critical dependencies that must be working for the app to serve traffic
    const criticalChecks = await Promise.all([
      getCachedHealthCheck("database", checkDatabase),
      getCachedHealthCheck("system_resources", checkSystemResources),
      getCachedHealthCheck("memory", checkMemoryUsage),
    ]);

    const responseTime = Date.now() - startTime;
    const uptime = Math.round(process.uptime());

    // Analyze critical check results
    const unhealthyChecks = criticalChecks.filter(
      (c) => c.status === "unhealthy",
    );
    const degradedChecks = criticalChecks.filter(
      (c) => c.status === "degraded",
    );
    const healthyChecks = criticalChecks.filter((c) => c.status === "healthy");

    // Determine readiness based on critical system status
    let isReady = true;
    let status = "ready";
    let message = "Application ready to serve requests";
    let recommendation = undefined;

    // Critical failures prevent readiness
    if (unhealthyChecks.length > 0) {
      isReady = false;
      status = "not_ready";
      message = `Critical systems unhealthy: ${unhealthyChecks.map((c) => c.name).join(", ")}`;
      recommendation =
        "Wait for critical systems to recover before routing traffic";
    }
    // Too many degraded systems also prevent readiness
    else if (degradedChecks.length >= criticalChecks.length * 0.5) {
      isReady = false;
      status = "not_ready";
      message = `Too many degraded systems: ${degradedChecks.map((c) => c.name).join(", ")}`;
      recommendation = "Wait for system performance to improve";
    }
    // Recent startup might indicate instability
    else if (uptime < 10) {
      isReady = false;
      status = "starting";
      message = `Application still starting up (${uptime}s uptime)`;
      recommendation = "Allow more time for full initialization";
    }
    // If we have degraded systems but not too many, still ready but with warnings
    else if (degradedChecks.length > 0) {
      status = "ready_with_warnings";
      message = `Ready but with degraded systems: ${degradedChecks.map((c) => c.name).join(", ")}`;
    }

    // Determine HTTP status code
    const httpStatus = isReady ? 200 : 503;

    const response = {
      success: isReady,
      data: {
        status,
        uptime,
        message,
        ready: isReady,
        checks: {
          critical: criticalChecks.map((check) => ({
            name: check.name,
            status: check.status,
            responseTime: check.responseTime,
            message: check.message,
          })),
          summary: {
            total: criticalChecks.length,
            healthy: healthyChecks.length,
            degraded: degradedChecks.length,
            unhealthy: unhealthyChecks.length,
          },
        },
        recommendation,
        metadata: {
          probeType: "readiness",
          criticalSystemsRequired: ["database", "system_resources", "memory"],
          thresholds: {
            minimumUptime: "10s",
            maxDegradedSystems: "50%",
            maxUnhealthySystems: "0",
          },
        },
      },
      timestamp: new Date().toISOString(),
    };

    res.status(httpStatus).json(response);

    // Log readiness probe results
    logger.info(
      {
        probe: {
          type: "readiness",
          status,
          ready: isReady,
          responseTime,
          requestId,
          uptime,
          unhealthyCount: unhealthyChecks.length,
          degradedCount: degradedChecks.length,
          unhealthyChecks: unhealthyChecks.map((c) => c.name),
          degradedChecks: degradedChecks.map((c) => c.name),
        },
      },
      `Readiness probe: ${status.toUpperCase()}`,
    );
  } catch (error) {
    const responseTime = Date.now() - startTime;

    logger.error(
      {
        probe: {
          type: "readiness",
          status: "error",
          responseTime,
          requestId,
          error: getErrorMessage(error),
        },
      },
      "Readiness probe failed",
    );

    res.status(503).json({
      success: false,
      error: "Readiness check system failure",
      message:
        config.env === "development"
          ? getErrorMessage(error)
          : "Unable to determine readiness status",
      code: "READINESS_PROBE_ERROR",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Initialize health check system with enhanced performance monitoring
 */
export function initializeHealthChecks(): void {
  logger.info("🏥 Health check system initialized with performance monitoring");

  // Clear expired cache entries and optimize cache periodically
  setInterval(() => {
    const now = Date.now();
    let deletedEntries = 0;

    for (const [key, value] of healthCache.entries()) {
      if (now >= value.expires) {
        healthCache.delete(key);
        deletedEntries++;
      }
    }

    if (deletedEntries > 0) {
      logger.debug(
        `Health check cache cleanup: removed ${deletedEntries} expired entries`,
      );
    }

    // Log performance metrics periodically (every 10 minutes)
    if (
      Math.floor(now / 600000) !== Math.floor((now - CACHE_TTL * 2) / 600000)
    ) {
      const metrics = getPerformanceMetrics();
      logger.info(
        {
          healthCheckMetrics: {
            cacheHitRate: metrics.cache.hitRate,
            averageResponseTime: metrics.performance.averageResponseTime,
            totalRequests: metrics.cache.totalRequests,
            slowestCheck: metrics.performance.slowestCheck?.name,
            recommendations: metrics.recommendations.length,
          },
        },
        "Health check performance metrics",
      );
    }
  }, CACHE_TTL);

  // Export performance metrics endpoint for monitoring
  registerHealthCheck("performance_metrics", async () => {
    const startTime = Date.now();
    const metrics = getPerformanceMetrics();

    return {
      name: "performance_metrics",
      status: "healthy",
      responseTime: Date.now() - startTime,
      message: `Health check system performance: ${metrics.cache.hitRate}% cache hit rate`,
      details: metrics,
      lastChecked: new Date().toISOString(),
    };
  });

  logger.info(
    "✅ Health check system ready with performance tracking and cache optimization",
  );
}
