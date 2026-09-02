import { type RedisClientType } from 'redis';
import redis, { isRedisAvailable } from './redis.js';

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerOptions {
  failureThreshold: number; // Max consecutive failures before tripping open
  resetTimeoutMs: number; // Time to stay OPEN before attempting a trial call
}

/*
  IMPORTANT — fail-open vs fail-closed:
  `fallbackValue` is returned whenever the circuit is open or a call
  fails, WITHOUT ever touching Redis. What that value should be depends
  entirely on what the wrapped operation protects:
    - Caching / non-critical reads: fine to fail OPEN (proceed without
      Redis, e.g. return null and let the caller skip the cache).
    - Security-relevant checks (rate limiting, session/auth lookups):
      MUST fail CLOSED (deny/restrict), never "allow". If a rate
      limiter's Redis call is wrapped here with a fallback that means
      "allow the request," an attacker can deliberately overload Redis
      to trip this circuit and disable rate limiting entirely at the
      exact moment it's needed most.
  This class does not and cannot know which case applies — that
  decision belongs to whoever calls `.execute()`, at the call site.
*/
export class RedisCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private nextAttempt: number = Date.now();
  private options: CircuitBreakerOptions;

  // Half-open must allow only ONE trial call through at a time. Without
  // this, every concurrent request arriving the instant the circuit
  // flips to HALF_OPEN would all attempt a real Redis call
  // simultaneously — flooding a Redis instance that's still recovering
  // and defeating the entire point of a controlled health probe.
  private halfOpenTrialInFlight = false;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeoutMs: options.resetTimeoutMs ?? 30000, // 30 seconds
    };
  }

  public getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Executes a Redis operation within the circuit breaker shell.
   * If the circuit is OPEN (or a half-open trial is already in
   * flight), returns the fallback value immediately without touching
   * the network.
   */
  public async execute<T>(
    operation: (client: RedisClientType) => Promise<T>,
    fallbackValue: T | null = null,
  ): Promise<T | null> {
    this.checkStateTransition();

    if (this.state === CircuitState.OPEN) {
      return fallbackValue;
    }

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenTrialInFlight) {
        return fallbackValue;
      }
      this.halfOpenTrialInFlight = true;
    }

    // Double-check basic client availability
    if (!isRedisAvailable()) {
      if (this.state === CircuitState.HALF_OPEN) this.halfOpenTrialInFlight = false;
      return fallbackValue;
    }

    try {
      const result = await operation(redis);
      this.onSuccess();
      return result;
    } catch {
      this.onFailure();
      return fallbackValue;
    } finally {
      this.halfOpenTrialInFlight = false;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    if (
      this.failureCount >= this.options.failureThreshold ||
      this.state === CircuitState.HALF_OPEN
    ) {
      this.tripOpen();
    }
  }

  private tripOpen(): void {
    this.state = CircuitState.OPEN;
    // Up to 20% randomized jitter — without it, multiple server
    // instances that all tripped open at roughly the same time would
    // all retry Redis at the exact same millisecond, recreating the
    // thundering-herd problem this breaker exists to prevent.
    const jitterMs = Math.floor(Math.random() * 0.2 * this.options.resetTimeoutMs);
    const totalDelayMs = this.options.resetTimeoutMs + jitterMs;
    this.nextAttempt = Date.now() + totalDelayMs;

    logCircuitEvent(
      'warn',
      `Redis circuit TRIPPED OPEN. Bypassing Redis for ~${Math.round(totalDelayMs / 1000)}s`,
      {
        failureCount: this.failureCount,
      },
    );
  }

  private checkStateTransition(): void {
    if (this.state === CircuitState.OPEN && Date.now() >= this.nextAttempt) {
      this.state = CircuitState.HALF_OPEN;
      logCircuitEvent('info', 'Redis circuit entering HALF-OPEN state (testing health)...');
    }
  }
}

// Structured JSON logging, matching the {level, msg, ts} shape used
// throughout the rest of this codebase (config/redis.ts, app.ts,
// errorHandler.ts) — plain console.warn strings here would be
// inconsistent with, and likely mis-parsed by, the same log pipeline.
function logCircuitEvent(
  level: 'warn' | 'info',
  msg: string,
  meta?: Record<string, unknown>,
): void {
  const line = JSON.stringify({
    level,
    msg: `[RedisCircuitBreaker] ${msg}`,
    ts: new Date().toISOString(),
    ...meta,
  });
  if (level === 'warn') console.warn(line);
  else console.info(line);
}

// Global Singleton Instance
export const redisCircuitBreaker = new RedisCircuitBreaker({
  failureThreshold: 3, // Trip open after 3 consecutive errors
  resetTimeoutMs: 15000, // Retry Redis after ~15s (plus jitter)
});
