/**
 * Memory-Aware Circuit Breaker
 * 
 * Provides resilient provider calls with intelligent failure detection.
 * Integrates with memory pressure monitoring to force-open during critical conditions.
 */

type State = 'closed' | 'open' | 'half-open';

interface CircuitBreakerOptions {
  failureThreshold: number;
  windowSize: number;
  rtP95Ms: number;
  halfOpenAfterMs: number;
  succToClose: number;
  shouldForceOpen: () => boolean;
}

export class CircuitBreaker {
  private state: State = 'closed';
  private openedAt = 0;
  private succHalfOpen = 0;
  private fails = 0;
  private rts: number[] = [];

  constructor(
    public readonly name: string,
    private readonly opts: CircuitBreakerOptions = {
      failureThreshold: 5,
      windowSize: 50,
      rtP95Ms: 6000,
      halfOpenAfterMs: 60_000,
      succToClose: 2,
      shouldForceOpen: () => false
    }
  ) {}

  private p95(): number {
    if (!this.rts.length) return 0;
    const a = [...this.rts].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
  }

  private record(rt: number, ok: boolean): void {
    this.rts.push(rt);
    if (this.rts.length > this.opts.windowSize) this.rts.shift();
    this.fails = ok ? Math.max(0, this.fails - 1) : this.fails + 1;
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    
    // Check if we should force-open due to external conditions (memory pressure)
    if (this.opts.shouldForceOpen()) {
      this.state = 'open';
      this.openedAt = now;
      throw new Error(`ERR_BREAKER_OPEN:${this.name}`);
    }

    // Standard circuit breaker logic
    if (this.state === 'open' && now - this.openedAt < this.opts.halfOpenAfterMs) {
      throw new Error(`ERR_BREAKER_OPEN:${this.name}`);
    }
    
    if (this.state === 'open') {
      this.state = 'half-open';
      this.succHalfOpen = 0;
    }

    const t0 = now;
    try {
      const res = await fn();
      this.record(Date.now() - t0, true);
      
      if (this.state === 'half-open' && ++this.succHalfOpen >= this.opts.succToClose) {
        this.state = 'closed';
        this.fails = 0;
      }
      
      if (this.p95() < this.opts.rtP95Ms && this.fails < this.opts.failureThreshold) {
        this.state = 'closed';
      }
      
      return res;
    } catch (e) {
      this.record(Date.now() - t0, false);
      
      if (this.fails >= this.opts.failureThreshold || this.p95() > this.opts.rtP95Ms) {
        this.state = 'open';
        this.openedAt = Date.now();
      }
      
      throw e;
    }
  }

  status() {
    return {
      name: this.name,
      state: this.state,
      p95: Math.round(this.p95()),
      fails: this.fails,
      openedAt: this.openedAt,
      windowSize: this.rts.length,
      lastRt: this.rts[this.rts.length - 1] || 0
    };
  }

  // Force open the circuit breaker (for testing or emergency situations)
  forceOpen(): void {
    this.state = 'open';
    this.openedAt = Date.now();
  }

  // Force close the circuit breaker (for testing or recovery)
  forceClose(): void {
    this.state = 'closed';
    this.fails = 0;
    this.succHalfOpen = 0;
  }
}