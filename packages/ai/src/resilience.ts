import { AiProviderError } from './errors.js';

/**
 * Retry, backoff and circuit breaking — E08-T08, TECH-SPEC §4.2.
 *
 * Clock and sleep are injected so the tests exercise the state machine rather
 * than the passage of time. A circuit breaker that is only ever verified by
 * waiting is a circuit breaker nobody verifies.
 */

export interface RetryPolicy {
  /** Total attempts, including the first. Bounded so retries cannot compound cost. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
};

/** Exponential backoff with full jitter. `attempt` is 1-based. */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
  return Math.round(exponential * random());
}

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerOptions {
  /** Consecutive failures before the circuit opens. */
  failureThreshold: number;
  /** How long the circuit stays open before a trial request is allowed. */
  cooldownMs: number;
  now?: () => number;
}

/**
 * One breaker per provider.
 *
 * Once open it fails fast, which matters for safety: the point is not to spare
 * the provider but to reach the fallback decision (E07-T05) quickly instead of
 * making every post wait out a full timeout.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private trialInFlight = false;
  private readonly now: () => number;

  constructor(private readonly options: BreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  state(): BreakerState {
    if (this.openedAt === null) return 'closed';
    if (this.now() - this.openedAt >= this.options.cooldownMs) return 'half_open';
    return 'open';
  }

  /** True when a request may be attempted. Half-open allows exactly one. */
  canAttempt(): boolean {
    const state = this.state();
    if (state === 'closed') return true;
    if (state === 'open') return false;
    if (this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.trialInFlight = false;
  }

  onFailure(): void {
    this.trialInFlight = false;
    this.failures += 1;
    if (this.failures >= this.options.failureThreshold) {
      this.openedAt = this.now();
    }
  }

  /** Test and admin seam. */
  reset(): void {
    this.onSuccess();
  }
}

export interface RunWithRetryOptions {
  policy: RetryPolicy;
  breaker?: CircuitBreaker;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Called before each retry — used to record that a retry happened. */
  onRetry?: (attempt: number, error: unknown) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error: unknown): boolean {
  return error instanceof AiProviderError && error.retryable;
}

/**
 * Runs `fn`, retrying transient failures within the attempt budget.
 *
 * A non-retryable error is rethrown immediately: retrying an auth failure or a
 * malformed response burns money and changes nothing.
 */
export async function runWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RunWithRetryOptions,
): Promise<T> {
  const { policy, breaker } = options;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (breaker && !breaker.canAttempt()) {
      throw new AiProviderError('circuit_open', 'gateway', 'Provider circuit is open');
    }

    try {
      const result = await fn(attempt);
      breaker?.onSuccess();
      return result;
    } catch (error) {
      lastError = error;
      breaker?.onFailure();

      if (!isRetryable(error) || attempt === policy.maxAttempts) throw error;

      options.onRetry?.(attempt, error);
      await sleep(backoffDelay(attempt, policy, options.random));
    }
  }

  throw lastError;
}
