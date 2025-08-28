/**
 * Tiered AI Providers with Advanced Circuit Breakers
 * 
 * Integrates circuit breaker pattern with memory pressure monitoring
 * for resilient AI provider calls with intelligent failover.
 */

import { CircuitBreaker } from '../circuit-breaker';
import { getMemoryPressure } from '../../observability/health-snapshot';

// Memory-aware force-open hook
const forceOpen = () => getMemoryPressure() === 'critical';

// Initialize circuit breakers for each provider
export const breakers = {
  groq: new CircuitBreaker('groq', { 
    shouldForceOpen: forceOpen,
    failureThreshold: 5,
    windowSize: 50,
    rtP95Ms: 6000,
    halfOpenAfterMs: 60_000,
    succToClose: 2
  }),
  openai: new CircuitBreaker('openai', { 
    shouldForceOpen: forceOpen,
    failureThreshold: 5,
    windowSize: 50,
    rtP95Ms: 8000,  // Slightly higher for OpenAI
    halfOpenAfterMs: 60_000,
    succToClose: 2
  }),
  anthropic: new CircuitBreaker('anthropic', { 
    shouldForceOpen: forceOpen,
    failureThreshold: 5,
    windowSize: 50,
    rtP95Ms: 10000, // Higher for Anthropic (slower but more accurate)
    halfOpenAfterMs: 60_000,
    succToClose: 2
  }),
};

import { logger } from "../logger";

/**
 * Circuit breaker wrapper for Groq calls
 */
export async function callGroq<T>(fn: () => Promise<T>): Promise<T> {
  return breakers.groq.exec(fn);
}

/**
 * Circuit breaker wrapper for OpenAI calls
 */
export async function callOpenAI<T>(fn: () => Promise<T>): Promise<T> {
  return breakers.openai.exec(fn);
}

/**
 * Circuit breaker wrapper for Anthropic calls
 */
export async function callAnthropic<T>(fn: () => Promise<T>): Promise<T> {
  return breakers.anthropic.exec(fn);
}

/**
 * Get all circuit breaker statuses for monitoring
 */
export function getBreakerStatuses() {
  return Object.fromEntries(
    Object.entries(breakers).map(([name, breaker]) => [name, breaker.status()])
  );
}

/**
 * Check if any providers are available
 */
export function hasAvailableProviders(): boolean {
  return Object.values(breakers).some(breaker => breaker.status().state !== 'open');
}

/**
 * Get count of healthy providers
 */
export function getHealthyProviderCount(): number {
  return Object.values(breakers).filter(breaker => breaker.status().state === 'closed').length;
}

/**
 * Force open all breakers (for testing or emergency situations)
 */
export function forceOpenAllBreakers(): void {
  Object.values(breakers).forEach(breaker => breaker.forceOpen());
  logger.warn('All circuit breakers forced open');
}

/**
 * Force close all breakers (for recovery)
 */
export function forceCloseAllBreakers(): void {
  Object.values(breakers).forEach(breaker => breaker.forceClose());
  logger.info('All circuit breakers forced closed');
}