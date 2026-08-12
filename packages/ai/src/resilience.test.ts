import { describe, expect, it, vi } from 'vitest';

import { AiProviderError } from './errors.js';
import { CircuitBreaker, DEFAULT_RETRY_POLICY, backoffDelay, runWithRetry } from './resilience.js';

const noSleep = (): Promise<void> => Promise.resolve();

describe('retry and backoff (E08-T08)', () => {
  it('retries a timeout and succeeds', async () => {
    const attempts: number[] = [];

    const result = await runWithRetry(
      (attempt) => {
        attempts.push(attempt);
        if (attempt < 2) throw new AiProviderError('timeout', 'anthropic');
        return Promise.resolve('ok');
      },
      { policy: DEFAULT_RETRY_POLICY, sleep: noSleep },
    );

    expect(result).toBe('ok');
    expect(attempts).toEqual([1, 2]);
  });

  it('stops at the attempt limit rather than multiplying cost', async () => {
    const fn = vi.fn(() => Promise.reject(new AiProviderError('timeout', 'anthropic')));

    await expect(
      runWithRetry(fn, { policy: { ...DEFAULT_RETRY_POLICY, maxAttempts: 3 }, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: 'timeout' });

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable failure', async () => {
    const fn = vi.fn(() => Promise.reject(new AiProviderError('invalid_response', 'anthropic')));

    await expect(
      runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: 'invalid_response' });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('grows the delay and keeps it under the ceiling', () => {
    const policy = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 500 };

    expect(backoffDelay(1, policy, () => 1)).toBe(100);
    expect(backoffDelay(2, policy, () => 1)).toBe(200);
    expect(backoffDelay(4, policy, () => 1)).toBe(500);
    expect(backoffDelay(3, policy, () => 0.5)).toBe(200);
  });
});

describe('circuit breaker (E08-T08)', () => {
  function makeClock(): { now: () => number; advance: (ms: number) => void } {
    let time = 1_000;
    return { now: () => time, advance: (ms) => (time += ms) };
  }

  it('opens after the failure threshold and closes again after a good trial', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 5_000,
      now: clock.now,
    });

    expect(breaker.state()).toBe('closed');

    breaker.onFailure();
    expect(breaker.state()).toBe('closed');

    breaker.onFailure();
    expect(breaker.state()).toBe('open');
    expect(breaker.canAttempt()).toBe(false);

    clock.advance(5_000);
    expect(breaker.state()).toBe('half_open');
    // Exactly one trial request gets through.
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.canAttempt()).toBe(false);

    breaker.onSuccess();
    expect(breaker.state()).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('re-opens when the trial request fails', () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 1_000,
      now: clock.now,
    });

    breaker.onFailure();
    clock.advance(1_000);
    expect(breaker.canAttempt()).toBe(true);

    breaker.onFailure();
    expect(breaker.state()).toBe('open');
  });

  it('fails fast while open so the safety fallback is reached quickly', async () => {
    const clock = makeClock();
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 10_000,
      now: clock.now,
    });
    breaker.onFailure();

    const fn = vi.fn(() => Promise.resolve('never runs'));

    await expect(
      runWithRetry(fn, { policy: DEFAULT_RETRY_POLICY, breaker, sleep: noSleep }),
    ).rejects.toMatchObject({ kind: 'circuit_open' });

    expect(fn).not.toHaveBeenCalled();
  });
});
