/**
 * Intelligent Provider Chooser
 * 
 * Selects optimal AI provider based on:
 * - Circuit breaker health status
 * - Queue backpressure (cached queue depths) 
 * - Request preference (fast/accurate/fallback)
 * - Memory pressure awareness
 */

import { breakers } from './providers/tieredAI';
import { getCounts } from './queue-depth-cache';
import { getMemoryPressure } from '../observability/health-snapshot';
import { logger } from './logger';

export type ProviderPreference = 'fast' | 'accurate' | 'fallback';

interface ProviderSelectionResult {
  provider: string | null;
  reason: string;
  alternativesConsidered: string[];
  queueDepths?: Record<string, number>;
  breakerStates?: Record<string, string>;
  memoryPressure?: string;
}

/**
 * Select optimal provider based on health, queues, and preference
 */
export async function pickProvider(preference: ProviderPreference): Promise<ProviderSelectionResult> {
  const memoryPressure = getMemoryPressure();
  
  // Provider order based on preference
  const providerOrders = {
    accurate: ['anthropic', 'openai', 'groq'],    // Quality first
    fast: ['openai', 'anthropic', 'groq'],       // Balanced speed/quality
    fallback: ['groq', 'openai', 'anthropic']    // Speed first
  };
  
  const order = providerOrders[preference];
  const candidates: string[] = [];
  const rejectedReasons: Record<string, string> = {};
  const breakerStates: Record<string, string> = {};
  const queueDepths: Record<string, number> = {};
  
  // Get queue cap from environment
  const DEFAULT_QUEUE_CAP = 200;
  const queueCaps = {
    groq: Number(process.env.GROQ_QUEUE_CAP ?? 300),      // Fast, can handle more
    openai: Number(process.env.OPENAI_QUEUE_CAP ?? DEFAULT_QUEUE_CAP),
    anthropic: Number(process.env.ANTHROPIC_QUEUE_CAP ?? 150) // Slower, more careful
  };
  
  // Evaluate each provider in preference order
  for (const provider of order) {
    try {
      // Check circuit breaker status
      const breakerStatus = breakers[provider as keyof typeof breakers]?.status();
      if (!breakerStatus) {
        rejectedReasons[provider] = 'no_breaker';
        continue;
      }
      
      breakerStates[provider] = breakerStatus.state;
      
      // Skip if circuit breaker is open
      if (breakerStatus.state === 'open') {
        rejectedReasons[provider] = `breaker_open (${breakerStatus.fails} failures)`;
        continue;
      }
      
      // Check queue depth
      const queueCounts = await getCounts(provider);
      const queueCap = queueCaps[provider as keyof typeof queueCaps] || DEFAULT_QUEUE_CAP;
      queueDepths[provider] = queueCounts.waiting;
      
      // Skip if queue is too deep
      if (queueCounts.waiting > queueCap) {
        rejectedReasons[provider] = `queue_full (${queueCounts.waiting}/${queueCap})`;
        continue;
      }
      
      // Additional checks for half-open breakers
      if (breakerStatus.state === 'half-open') {
        // Be more cautious with half-open breakers
        const halfOpenQueueCap = Math.floor(queueCap * 0.5);
        if (queueCounts.waiting > halfOpenQueueCap) {
          rejectedReasons[provider] = `half_open_queue_limit (${queueCounts.waiting}/${halfOpenQueueCap})`;
          continue;
        }
      }
      
      candidates.push(provider);
      
    } catch (error) {
      rejectedReasons[provider] = `error: ${error instanceof Error ? error.message : String(error)}`;
      logger.warn('Provider evaluation failed', { provider, error });
    }
  }
  
  // Select the best candidate
  const selectedProvider = candidates[0] || null;
  
  // Determine reason for selection/rejection
  let reason: string;
  if (selectedProvider) {
    const breakerState = breakerStates[selectedProvider];
    const queueDepth = queueDepths[selectedProvider];
    reason = `selected ${selectedProvider} (${breakerState}, queue: ${queueDepth}, preference: ${preference})`;
  } else if (memoryPressure === 'critical') {
    reason = 'no_providers_available (critical memory pressure)';
  } else {
    const rejections = Object.entries(rejectedReasons)
      .map(([p, r]) => `${p}: ${r}`)
      .join(', ');
    reason = `no_providers_available (${rejections})`;
  }
  
  // Log selection for monitoring
  if (selectedProvider) {
    logger.debug('Provider selected', {
      provider: selectedProvider,
      preference,
      candidates: candidates.length,
      memoryPressure,
      queueDepth: queueDepths[selectedProvider],
      breakerState: breakerStates[selectedProvider]
    });
  } else {
    logger.warn('No providers available', {
      preference,
      memoryPressure,
      rejectedReasons,
      breakerStates,
      queueDepths
    });
  }
  
  return {
    provider: selectedProvider,
    reason,
    alternativesConsidered: order,
    queueDepths,
    breakerStates,
    memoryPressure
  };
}

/**
 * Quick health check - returns true if any provider is available
 */
export async function hasHealthyProvider(): Promise<boolean> {
  const result = await pickProvider('fast');
  return result.provider !== null;
}

/**
 * Get detailed provider health summary
 */
export async function getProviderHealthSummary() {
  const results = await Promise.all([
    pickProvider('fast'),
    pickProvider('accurate'), 
    pickProvider('fallback')
  ]);
  
  return {
    fast: results[0],
    accurate: results[1], 
    fallback: results[2],
    healthyCount: results.filter(r => r.provider !== null).length,
    totalProviders: Object.keys(breakers).length,
    memoryPressure: getMemoryPressure()
  };
}