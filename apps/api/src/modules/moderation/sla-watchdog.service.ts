import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import type { PrismaClient } from '@curhat/database';
import { Redis } from 'ioredis';

import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ENV } from '../../config/env.config.js';

export interface SlaBreach {
  caseId: string;
  queue: string;
  overdueByMinutes: number;
}

/**
 * Watches for cases that blew their SLA — PRD §15.3, TECH-SPEC §18.7.
 *
 * A Critical case quietly ageing in a queue is the failure this exists to
 * prevent: nobody is refreshing the moderation dashboard at 3am, which is
 * exactly when these cases arrive.
 */
@Injectable()
export class SlaWatchdogService {
  private readonly logger = new Logger(SlaWatchdogService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  async findBreaches(): Promise<SlaBreach[]> {
    const now = new Date();

    const overdue = await this.prisma.moderationCase.findMany({
      where: { status: { in: ['open', 'in_review'] }, slaDueAt: { lt: now } },
      orderBy: { slaDueAt: 'asc' },
      select: { id: true, queue: true, slaDueAt: true },
    });

    return overdue.map((row) => ({
      caseId: row.id,
      queue: row.queue,
      overdueByMinutes: Math.round((now.getTime() - row.slaDueAt.getTime()) / 60_000),
    }));
  }

  /**
   * Alerts ops about breaches, once per case.
   *
   * Deduplicated through Redis: an alert that repeats every minute gets muted
   * within the hour, and then nothing gets noticed at all.
   */
  async alertOnBreaches(): Promise<{ alerted: number }> {
    const breaches = await this.findBreaches();
    let alerted = 0;

    for (const breach of breaches) {
      const key = `sla:alerted:${breach.caseId}`;
      const isNew = await this.redis.set(key, '1', 'EX', 6 * 3600, 'NX').catch(() => null);
      if (!isNew) continue;

      await this.sendAlert(breach);
      alerted += 1;
    }

    return { alerted };
  }

  /**
   * Sends the alert.
   *
   * Carries the case id, queue and how late it is — never the content
   * (CLAUDE.md non-negotiable #3). An ops channel is not a place for somebody's
   * curhat.
   */
  private async sendAlert(breach: SlaBreach): Promise<void> {
    const text =
      `⚠️ SLA terlewat — case ${breach.caseId} (${breach.queue}) ` +
      `telat ${breach.overdueByMinutes} menit.`;

    this.logger.error(text);

    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) return;

    try {
      await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: this.env.TELEGRAM_CHAT_ID, text }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      this.logger.error('failed to deliver SLA alert', error);
    }
  }

  /** SLA compliance for the admin dashboard (E14-T05). */
  async compliance(since: Date): Promise<Record<string, { total: number; met: number; rate: number }>> {
    const cases = await this.prisma.moderationCase.findMany({
      where: { createdAt: { gte: since }, resolvedAt: { not: null } },
      select: { queue: true, slaDueAt: true, resolvedAt: true },
    });

    const byQueue: Record<string, { total: number; met: number; rate: number }> = {};

    for (const row of cases) {
      const entry = (byQueue[row.queue] ??= { total: 0, met: 0, rate: 0 });
      entry.total += 1;
      if (row.resolvedAt && row.resolvedAt <= row.slaDueAt) entry.met += 1;
    }

    for (const entry of Object.values(byQueue)) {
      entry.rate = entry.total === 0 ? 0 : entry.met / entry.total;
    }

    return byQueue;
  }
}
