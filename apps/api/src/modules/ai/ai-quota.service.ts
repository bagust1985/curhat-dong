import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { REDIS } from '../../common/redis.service.js';
import { AiBudgetService } from './ai-budget.service.js';
import { secondsUntilWibMidnight, wibDayKey } from './wib-day.js';

export interface QuotaStatus {
  limit: number;
  used: number;
  remaining: number;
  /** True when the lower degraded limit is in force (PRD §10). */
  degraded: boolean;
}

/**
 * Per-user daily AI quota — E08-T07, TECH-SPEC §4.7, DESIGN-REF §2.8c.
 *
 * 50 messages a day, 25 while the budget guard is degrading. The limits come
 * from `app_configs` so they can be tuned during an incident without a deploy.
 */
@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly appConfig: AppConfigService,
    private readonly budget: AiBudgetService,
  ) {}

  async status(userId: string, at: Date = new Date()): Promise<QuotaStatus> {
    const [limit, degraded] = await this.limitAndMode();
    const used = await this.usedToday(userId, at);

    return { limit, used, remaining: Math.max(0, limit - used), degraded };
  }

  /**
   * Consumes one message.
   *
   * The copy on refusal is warm and points somewhere useful, because "kuota
   * habis" at the moment someone reached out is the worst possible time to
   * sound like a vending machine (PRD §10).
   */
  async consume(userId: string, at: Date = new Date()): Promise<QuotaStatus> {
    const [limit, degraded] = await this.limitAndMode();
    const key = this.key(userId, at);

    let used: number;
    try {
      used = await this.redis.incr(key);
      if (used === 1) await this.redis.expire(key, secondsUntilWibMidnight(at));
    } catch (error) {
      // Fail open: a dead counter must not silence DONG AI for everyone. The
      // daily budget guard still caps the blast radius in money terms.
      this.logger.error('AI quota counter unavailable; allowing the request', error);
      return { limit, used: 0, remaining: limit, degraded };
    }

    if (used > limit) {
      throw ApiException.tooManyRequests(
        'AI_QUOTA_EXCEEDED',
        'Kuota harian habis — besok kita lanjut ya. Kalau butuh didengar sekarang, coba Cari Listener.',
      );
    }

    return { limit, used, remaining: Math.max(0, limit - used), degraded };
  }

  /**
   * Pre-flight check that consumes nothing.
   *
   * Used before an SSE response opens: once headers are written a 429 can no
   * longer be sent, and a quota message delivered as a stream error would land
   * as a red event instead of the warm copy it is meant to be.
   */
  async assertAvailable(userId: string, at: Date = new Date()): Promise<QuotaStatus> {
    const status = await this.status(userId, at);

    if (status.remaining <= 0) {
      throw ApiException.tooManyRequests(
        'AI_QUOTA_EXCEEDED',
        'Kuota harian habis — besok kita lanjut ya. Kalau butuh didengar sekarang, coba Cari Listener.',
      );
    }

    return status;
  }

  /** Gives a consumed message back when the call failed before producing anything. */
  async refund(userId: string, at: Date = new Date()): Promise<void> {
    await this.redis.decr(this.key(userId, at)).catch(() => undefined);
  }

  private async limitAndMode(): Promise<[number, boolean]> {
    const degraded = await this.budget.isDegraded();
    const limit = await this.appConfig.getNumber(
      degraded ? 'ai.messages_per_day_degraded' : 'ai.messages_per_day',
    );

    return [limit, degraded];
  }

  private async usedToday(userId: string, at: Date): Promise<number> {
    try {
      const value = await this.redis.get(this.key(userId, at));
      return value ? Number(value) : 0;
    } catch (error) {
      this.logger.warn('AI quota counter unreadable', error);
      return 0;
    }
  }

  private key(userId: string, at: Date): string {
    return `ai:quota:${userId}:${wibDayKey(at)}`;
  }
}
