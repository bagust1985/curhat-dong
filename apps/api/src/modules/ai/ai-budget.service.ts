import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import { Redis } from 'ioredis';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ENV } from '../../config/env.config.js';
import { AiUsageService } from './ai-usage.service.js';
import { secondsUntilWibMidnight, wibDayKey, wibDayStart } from './wib-day.js';

export interface BudgetStatus {
  /** USD ceiling for the day. */
  budget: number;
  spent: number;
  /** 0..100+ */
  percentUsed: number;
  /** At or past the critical threshold: non-safety routing drops to cheap. */
  degraded: boolean;
  /** Budget exhausted: DONG AI conversation stops. Safety analysis does not. */
  chatStopped: boolean;
}

/**
 * AI cost guard — E08-T06, PRD §10.
 *
 * The rule this exists to enforce is narrow and absolute: cost pressure may
 * slow down or stop *conversation*, and may never touch *classification*.
 * Nothing in this service is consulted by the safety path — `degraded` reaches
 * routing only through the non-safety branch (see `resolveTier`), and
 * `assertChatAllowed` is called by the chat endpoint alone.
 */
@Injectable()
export class AiBudgetService {
  private readonly logger = new Logger(AiBudgetService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly appConfig: AppConfigService,
    private readonly usage: AiUsageService,
  ) {}

  async status(at: Date = new Date()): Promise<BudgetStatus> {
    const budget = this.env.AI_DAILY_BUDGET;
    const spent = await this.spentToday(at);
    const percentUsed = budget > 0 ? (spent / budget) * 100 : 0;

    const [criticalPct, stopPct] = await Promise.all([
      this.appConfig.getNumber('ai.budget_alert_critical_pct'),
      this.appConfig.getNumber('ai.budget_stop_pct'),
    ]);

    return {
      budget,
      spent,
      percentUsed,
      degraded: percentUsed >= criticalPct,
      chatStopped: percentUsed >= stopPct,
    };
  }

  /** Cheap check used on every routed call. */
  async isDegraded(): Promise<boolean> {
    try {
      return (await this.status()).degraded;
    } catch (error) {
      // Failing open here is deliberate: an unreadable budget must not stop
      // the product. Overspend is a billing problem; a dead gateway is a user
      // in the dark.
      this.logger.error('budget status unavailable; continuing undegraded', error);
      return false;
    }
  }

  /**
   * Blocks DONG AI conversation once the budget is gone.
   *
   * This is the *only* thing that stops when money runs out. `analyze-post`
   * and `analyze-message` never call it.
   */
  async assertChatAllowed(): Promise<void> {
    const status = await this.status().catch(() => null);
    if (!status?.chatStopped) return;

    throw ApiException.unavailable(
      'AI_BUDGET_EXCEEDED',
      'DONG AI lagi istirahat sebentar. Kamu masih bisa cerita lewat curhat atau ngobrol sama listener.',
    );
  }

  /** Adds the cost of one call and fires ops alerts as thresholds are crossed. */
  async addSpend(cost: number, at: Date = new Date()): Promise<void> {
    if (cost <= 0) return;

    let spent: number;
    try {
      const key = this.spendKey(at);
      spent = Number(await this.redis.incrbyfloat(key, cost));
      await this.redis.expire(key, secondsUntilWibMidnight(at) + 3_600);
    } catch (error) {
      this.logger.error('failed to accumulate AI spend in Redis', error);
      return;
    }

    await this.checkThresholds(spent, at);
  }

  /**
   * Spend so far today.
   *
   * Redis holds the running counter, Postgres holds the truth (rule #5). A
   * cold or flushed counter is rebuilt by summing today's usage events rather
   * than silently restarting the day at zero.
   */
  private async spentToday(at: Date): Promise<number> {
    const key = this.spendKey(at);

    try {
      const cached = await this.redis.get(key);
      if (cached !== null) return Number(cached);
    } catch (error) {
      this.logger.warn('spend counter unreadable; falling back to Postgres', error);
      return this.usage.spendSince(wibDayStart(at));
    }

    const actual = await this.usage.spendSince(wibDayStart(at));
    await this.redis
      .set(key, actual.toString(), 'EX', secondsUntilWibMidnight(at) + 3_600)
      .catch(() => undefined);

    return actual;
  }

  private async checkThresholds(spent: number, at: Date): Promise<void> {
    const budget = this.env.AI_DAILY_BUDGET;
    if (budget <= 0) return;

    const percentUsed = (spent / budget) * 100;
    const [warnPct, criticalPct] = await Promise.all([
      this.appConfig.getNumber('ai.budget_alert_warn_pct'),
      this.appConfig.getNumber('ai.budget_alert_critical_pct'),
    ]);

    for (const threshold of [criticalPct, warnPct]) {
      if (percentUsed < threshold) continue;

      // One alert per threshold per day. An alert that repeats every call gets
      // muted within the hour, and then nothing gets noticed at all.
      const marker = `ai:budget:alerted:${wibDayKey(at)}:${threshold}`;
      const isNew = await this.redis
        .set(marker, '1', 'EX', secondsUntilWibMidnight(at) + 3_600, 'NX')
        .catch(() => null);

      if (isNew) {
        await this.alertOps(threshold, percentUsed, spent, budget);
      }
      break;
    }
  }

  /** Ops alert. Carries numbers only — never a fragment of a conversation. */
  private async alertOps(
    threshold: number,
    percentUsed: number,
    spent: number,
    budget: number,
  ): Promise<void> {
    const text =
      `⚠️ Budget AI ${percentUsed.toFixed(0)}% (ambang ${threshold}%) — ` +
      `USD ${spent.toFixed(2)} dari ${budget.toFixed(2)}. ` +
      `Routing non-safety turun ke cheap model saat ≥ ambang kritis; klasifikasi safety tidak berubah.`;

    this.logger.warn(text);

    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) return;

    try {
      await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: this.env.TELEGRAM_CHAT_ID, text }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      this.logger.error('failed to deliver AI budget alert', error);
    }
  }

  private spendKey(at: Date): string {
    return `ai:spend:${wibDayKey(at)}`;
  }
}
