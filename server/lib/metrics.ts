/**
 * Lightweight Metrics Emitter for Analysis Tracking
 * 
 * Tracks analysis outcomes without PII exposure.
 * Provides abstain rate monitoring and performance metrics.
 */

type AnalysisStatus = 'SUCCESS' | 'LOW_CONFIDENCE' | 'INSUFFICIENT_EVIDENCE';

interface AnalysisMetricsOptions {
  status: AnalysisStatus;
  score: number | null;
  confidence: number;
  timings?: {
    totalMs: number;
    mlMs?: number;
    llmMs?: number;
    escoMs?: number;
  };
  provider?: string;
  model?: string;
  userId?: string; // Hashed for privacy
  batchId?: string;
}

// In-memory counters for quick access
const counters = {
  total: 0,
  success: 0,
  lowConf: 0,
  abstain: 0,
  avgResponseMs: 0,
  p95ResponseMs: 0,
};

// Response time tracking for percentiles
const responseTimes: number[] = [];
const MAX_RESPONSE_TIME_SAMPLES = 1000;

/**
 * Emit analysis metrics for monitoring
 * Call this at the end of each analysis pipeline
 */
export function emitAnalysisMetrics(opts: AnalysisMetricsOptions): void {
  // Update counters
  counters.total++;
  
  if (opts.status === 'INSUFFICIENT_EVIDENCE') {
    counters.abstain++;
  } else if (opts.status === 'LOW_CONFIDENCE') {
    counters.lowConf++;
  } else {
    counters.success++;
  }
  
  // Track response times
  if (opts.timings?.totalMs) {
    responseTimes.push(opts.timings.totalMs);
    if (responseTimes.length > MAX_RESPONSE_TIME_SAMPLES) {
      responseTimes.shift(); // Remove oldest
    }
    
    // Update average
    counters.avgResponseMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    // Calculate P95
    const sorted = [...responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    counters.p95ResponseMs = sorted[p95Index] || 0;
  }
  
  const abstainRate = counters.total > 0 ? counters.abstain / counters.total : 0;
  const successRate = counters.total > 0 ? counters.success / counters.total : 0;
  
  // Structured log - PII-free
  console.info(JSON.stringify({
    kind: 'analysis_metrics',
    status: opts.status,
    score: opts.score,
    confidence: opts.confidence,
    provider: opts.provider,
    model: opts.model,
    abstainRate: Math.round(abstainRate * 1000) / 1000,
    successRate: Math.round(successRate * 1000) / 1000,
    timings: opts.timings,
    totals: {
      total: counters.total,
      success: counters.success,
      lowConf: counters.lowConf,
      abstain: counters.abstain,
    },
    performance: {
      avgResponseMs: Math.round(counters.avgResponseMs),
      p95ResponseMs: Math.round(counters.p95ResponseMs),
    },
    ts: new Date().toISOString(),
  }));
}

/**
 * Get current metrics snapshot for dashboards
 */
export function getMetricsSnapshot() {
  const abstainRate = counters.total > 0 ? counters.abstain / counters.total : 0;
  const successRate = counters.total > 0 ? counters.success / counters.total : 0;
  const lowConfRate = counters.total > 0 ? counters.lowConf / counters.total : 0;
  
  return {
    ...counters,
    abstainRate: Math.round(abstainRate * 1000) / 1000,
    successRate: Math.round(successRate * 1000) / 1000,
    lowConfRate: Math.round(lowConfRate * 1000) / 1000,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  counters.total = 0;
  counters.success = 0;
  counters.lowConf = 0;
  counters.abstain = 0;
  counters.avgResponseMs = 0;
  counters.p95ResponseMs = 0;
  responseTimes.length = 0;
}

/**
 * Export metrics in Prometheus format (optional)
 */
export function getPrometheusMetrics(): string {
  const snapshot = getMetricsSnapshot();
  return `
# HELP evalmatch_analyses_total Total number of analyses performed
# TYPE evalmatch_analyses_total counter
evalmatch_analyses_total ${snapshot.total}

# HELP evalmatch_analyses_success Successful analyses
# TYPE evalmatch_analyses_success counter
evalmatch_analyses_success ${snapshot.success}

# HELP evalmatch_analyses_abstain Abstained analyses due to insufficient evidence
# TYPE evalmatch_analyses_abstain counter
evalmatch_analyses_abstain ${snapshot.abstain}

# HELP evalmatch_abstain_rate Current abstain rate
# TYPE evalmatch_abstain_rate gauge
evalmatch_abstain_rate ${snapshot.abstainRate}

# HELP evalmatch_response_time_avg Average response time in milliseconds
# TYPE evalmatch_response_time_avg gauge
evalmatch_response_time_avg ${snapshot.avgResponseMs}

# HELP evalmatch_response_time_p95 95th percentile response time in milliseconds
# TYPE evalmatch_response_time_p95 gauge
evalmatch_response_time_p95 ${snapshot.p95ResponseMs}
`.trim();
}