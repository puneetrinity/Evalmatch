/**
 * SURGICAL FIX: Singleton Redis Connection Management
 * 
 * Consolidates all Redis connections to prevent connection pool exhaustion
 * and reduce per-request connection overhead. This replaces scattered Redis
 * instantiation throughout the codebase with a single managed connection.
 */

import { logger } from "./logger";

interface RedisConnection {
  client: any; // Redis client instance
  connected: boolean;
  lastUsed: number;
  connectionCount: number;
}

interface RedisConfig {
  url?: string;
  maxRetries: number;
  retryDelay: number;
  connectTimeout: number;
  lazyConnect: boolean;
}

// Singleton Redis connection state
let redisConnection: RedisConnection | null = null;
let redisConfig: RedisConfig | null = null;

/**
 * Initialize the singleton Redis connection
 */
export async function initializeRedisConnection(config?: Partial<RedisConfig>): Promise<void> {
  if (redisConnection && redisConnection.connected) {
    logger.debug('Redis connection already initialized');
    return;
  }

  try {
    // Default Redis configuration
    redisConfig = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      maxRetries: 3,
      retryDelay: 1000,
      connectTimeout: 5000,
      lazyConnect: true, // Don't connect immediately
      ...config
    };

    // Only attempt Redis if we have a URL configured
    if (!redisConfig.url) {
      logger.info('Redis URL not configured, skipping Redis initialization');
      return;
    }

    // Dynamic import to avoid loading Redis if not needed
    const Redis = (await import('ioredis')).default;

    // Create singleton Redis client with optimized settings
    const client = new Redis(redisConfig.url, {
      maxRetriesPerRequest: redisConfig.maxRetries,
      retryDelayOnFailover: redisConfig.retryDelay,
      connectTimeout: redisConfig.connectTimeout,
      lazyConnect: redisConfig.lazyConnect,
      // Optimize for connection pooling
      enableReadyCheck: false,
      maxLoadingTimeout: 2000,
      // Reduce connection overhead
      keepAlive: 30000,
      // Error handling
      enableOfflineQueue: false,
    });

    // Set up event listeners
    client.on('connect', () => {
      logger.info('✅ Redis singleton connected');
      if (redisConnection) {
        redisConnection.connected = true;
        redisConnection.connectionCount++;
      }
    });

    client.on('error', (error) => {
      logger.warn('Redis connection error:', error.message);
      if (redisConnection) {
        redisConnection.connected = false;
      }
    });

    client.on('close', () => {
      logger.info('Redis connection closed');
      if (redisConnection) {
        redisConnection.connected = false;
      }
    });

    client.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    // Initialize connection state
    redisConnection = {
      client,
      connected: false,
      lastUsed: Date.now(),
      connectionCount: 0
    };

    // Don't await connection - use lazy connect
    logger.info('🔄 Redis singleton initialized (lazy connect mode)');

  } catch (error) {
    logger.error('Failed to initialize Redis singleton:', error);
    redisConnection = null;
  }
}

/**
 * Get the singleton Redis client
 * Automatically connects if not connected (lazy connection)
 */
export async function getRedisClient(): Promise<any | null> {
  if (!redisConnection) {
    logger.debug('Redis not initialized, attempting initialization');
    await initializeRedisConnection();
  }

  if (!redisConnection) {
    return null;
  }

  // Update last used timestamp
  redisConnection.lastUsed = Date.now();

  // Lazy connect if needed
  if (!redisConnection.connected) {
    try {
      await redisConnection.client.connect();
    } catch (error) {
      logger.warn('Redis lazy connect failed:', error);
      return null;
    }
  }

  return redisConnection.client;
}

/**
 * Check if Redis is available and connected
 */
export function isRedisAvailable(): boolean {
  return !!(redisConnection && redisConnection.connected);
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): {
  initialized: boolean;
  connected: boolean;
  lastUsed: number | null;
  connectionCount: number;
  uptime: number | null;
} {
  if (!redisConnection) {
    return {
      initialized: false,
      connected: false,
      lastUsed: null,
      connectionCount: 0,
      uptime: null
    };
  }

  return {
    initialized: true,
    connected: redisConnection.connected,
    lastUsed: redisConnection.lastUsed,
    connectionCount: redisConnection.connectionCount,
    uptime: redisConnection.connected ? Date.now() - redisConnection.lastUsed : null
  };
}

/**
 * Execute a Redis operation with automatic error handling
 * Returns null if Redis is unavailable instead of throwing
 */
export async function executeRedisOperation<T>(
  operation: (client: any) => Promise<T>,
  fallbackValue: T | null = null
): Promise<T | null> {
  try {
    const client = await getRedisClient();
    if (!client) {
      return fallbackValue;
    }

    const result = await operation(client);
    return result;
  } catch (error) {
    logger.warn('Redis operation failed, using fallback:', error.message);
    return fallbackValue;
  }
}

/**
 * Close the Redis connection gracefully
 */
export async function closeRedisConnection(): Promise<void> {
  if (!redisConnection || !redisConnection.client) {
    return;
  }

  try {
    logger.info('Closing Redis singleton connection...');
    await redisConnection.client.quit();
    redisConnection.connected = false;
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.warn('Error closing Redis connection:', error);
    // Force disconnect if quit fails
    redisConnection.client.disconnect();
  }
}

/**
 * Helper function to migrate existing Redis usage to singleton pattern
 * Use this to replace individual Redis client creations
 */
export async function getRedisClientForCache(): Promise<any | null> {
  return getRedisClient();
}

export async function getRedisClientForQueue(): Promise<any | null> {
  return getRedisClient();
}

export async function getRedisClientForSession(): Promise<any | null> {
  return getRedisClient();
}