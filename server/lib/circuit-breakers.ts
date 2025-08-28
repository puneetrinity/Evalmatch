/**
 * Singleton Circuit Breaker Registry
 * 
 * Provides global circuit breaker instances with Redis persistence
 * for cross-replica state synchronization and observability.
 */

import { CircuitBreaker } from './circuit-breaker';
import { redis } from '../core/redis';
import { logger } from './logger';

type ProviderName = 'groq' | 'openai' | 'anthropic';

// Global registry stored in globalThis to survive module reloads
const registry: Map<string, CircuitBreaker> = 
  (globalThis as any).__cbRegistry ?? ((globalThis as any).__cbRegistry = new Map());

/**
 * Get or create a circuit breaker for a provider
 */
export function getBreaker(name: ProviderName, options?: any): CircuitBreaker {
  if (!registry.has(name)) {
    const breaker = new CircuitBreaker(name, options);
    registry.set(name, breaker);
    logger.info(`Circuit breaker initialized: ${name}`);
  }
  return registry.get(name)!;
}

/**
 * List all registered circuit breakers
 */
export function listBreakers(): [string, CircuitBreaker][] {
  return Array.from(registry.entries());
}

/**
 * Get circuit breaker statuses from all instances
 */
export function getBreakerStatuses() {
  const statuses: Record<string, any> = {};
  for (const [name, breaker] of registry) {
    statuses[name] = breaker.status();
  }
  return statuses;
}

/**
 * Persist circuit breaker state to Redis for cross-replica visibility
 * Called internally when breaker state changes
 */
export async function persistBreakerState(name: string, state: any): Promise<void> {
  try {
    await redis.hset(`cb:${name}`, {
      state: state.state,
      failCount: state.fails,
      p95ms: state.p95,
      openedAt: state.openedAt || 0,
      updatedAt: Date.now(),
      replica: process.env.RAILWAY_REPLICA_ID || 'unknown'
    });
  } catch (error) {
    logger.warn(`Failed to persist circuit breaker state for ${name}:`, error);
  }
}

/**
 * Load circuit breaker states from Redis (for admin dashboard)
 */
export async function loadBreakerStatesFromRedis(): Promise<Record<string, any>> {
  try {
    const keys = await redis.keys('cb:*');
    const states: Record<string, any> = {};
    
    for (const key of keys) {
      const providerName = key.replace('cb:', '');
      const data = await redis.hgetall(key);
      if (Object.keys(data).length > 0) {
        states[providerName] = {
          ...data,
          p95ms: parseInt(data.p95ms) || 0,
          failCount: parseInt(data.failCount) || 0,
          openedAt: parseInt(data.openedAt) || 0,
          updatedAt: parseInt(data.updatedAt) || 0
        };
      }
    }
    
    return states;
  } catch (error) {
    logger.warn('Failed to load circuit breaker states from Redis:', error);
    return {};
  }
}