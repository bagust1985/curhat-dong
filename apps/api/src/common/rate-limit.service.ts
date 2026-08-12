import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ApiException } from './api-error.js';
import { REDIS } from './redis.service.js';

export interface RateLimitRule {
  /** Namespaced counter key, e.g. `otp:request`. */
  bucket: string;
  /** Identity being limited: ip hash, user id or email hash. */
  subject: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Distributed rate limiting — TECH-SPEC §4.7, §7.3.
 *
 * Fixed-window counters in Redis. A sliding window would be more precise, but
 * the limits here are abuse ceilings rather than billing meters, and the extra
 * cost is not worth it for MVP.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async check(rule: RateLimitRule): Promise<RateLimitResult> {
    const key = `ratelimit:${rule.bucket}:${rule.subject}`;

    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, rule.windowSeconds);
      }

      const ttl = await this.redis.ttl(key);

      return {
        allowed: count <= rule.limit,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
      };
    } catch (error) {
      this.logger.error(`rate limit backend unavailable for bucket ${rule.bucket}`, error);
      throw new RateLimitBackendUnavailable();
    }
  }

  /**
   * Enforces a rule, choosing what to do when Redis itself is down.
   *
   * `failClosed` exists because the safe default is not the same everywhere:
   * for OTP and auth, losing the counter must block the request, since an
   * unlimited OTP endpoint is an open door. For ordinary content endpoints,
   * refusing every write because a cache is down punishes users for an
   * operational problem, so those fail open and are logged.
   */
  async enforce(rule: RateLimitRule, options: { failClosed: boolean }): Promise<void> {
    let result: RateLimitResult;

    try {
      result = await this.check(rule);
    } catch (error) {
      if (error instanceof RateLimitBackendUnavailable && !options.failClosed) {
        this.logger.warn(`rate limit skipped for ${rule.bucket}: backend unavailable`);
        return;
      }
      throw ApiException.unavailable(
        'SERVICE_UNAVAILABLE',
        'Lagi ada gangguan sebentar. Coba lagi ya.',
      );
    }

    if (!result.allowed) {
      throw ApiException.tooManyRequests(
        'RATE_LIMITED',
        'Kebanyakan percobaan. Coba lagi nanti ya.',
      );
    }
  }

  /** Clears a counter — used after a successful verification. */
  async reset(bucket: string, subject: string): Promise<void> {
    await this.redis.del(`ratelimit:${bucket}:${subject}`).catch(() => undefined);
  }
}

export class RateLimitBackendUnavailable extends Error {
  constructor() {
    super('Rate limit backend unavailable');
    this.name = 'RateLimitBackendUnavailable';
  }
}
