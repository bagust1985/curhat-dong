import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import type { Redis } from 'ioredis';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { secondsUntilWibMidnight, wibDayKey } from '../ai/wib-day.js';
import { NotificationFanoutService } from '../notifications/notification-fanout.service.js';
import { AvailabilityService } from './availability.service.js';
import { BurnoutService } from './burnout.service.js';

export interface NudgeResult {
  /** Listeners that actually received a nudge. */
  notified: number;
  /** Eligible-looking listeners skipped, by reason — for ops, never per-user. */
  skipped: Record<string, number>;
}

/**
 * Listener nudge — E12-T09. PRD §14, §23; DESIGN-REF §2.4.
 *
 * Lives in the listener module rather than the notification module because
 * every decision it makes is about listener state: availability, cooldown,
 * daily cap. Notifications are the last step, not the subject.
 *
 * The design constraint that shaped this is not technical. Cold start (PRD
 * §23) creates real pressure to nudge harder, and over-nudging is the fastest
 * way to lose a listener — and a listener lost is not replaced by sending more
 * notifications. So every limit below is a limit on *us*, and none of them has
 * an override:
 *
 *  - never to someone unavailable, on cooldown, or at their daily cap;
 *  - at most `notification.nudge_max_per_day` per listener per day;
 *  - at least `notification.nudge_cooldown_minutes` apart;
 *  - subject to quiet hours, because a nudge is not a safety notification
 *    (PRD §14 is explicit that this is *not* an exception).
 *
 * The payload is the catalogue's `listener.nudge` — "Ada seseorang yang sedang
 * butuh didengar." It names no post, no topic and no person, so a nudge on a
 * lock screen reveals nothing about who needed help.
 */
@Injectable()
export class ListenerNudgeService {
  private readonly logger = new Logger(ListenerNudgeService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly availability: AvailabilityService,
    private readonly burnout: BurnoutService,
    private readonly fanout: NotificationFanoutService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Nudges available listeners that someone is waiting.
   *
   * `dedupeKey` carries the originating event, so the same post or request
   * nudging twice — a retried job, a double trigger — produces one
   * notification per listener, not two (E12-T06).
   */
  async nudgeForWaitingRequester(options: {
    /** Post or request id the nudge originated from. Never sent to the client. */
    sourceId: string;
    /** Do not nudge the person who is waiting. */
    excludeUserId?: string;
    topic?: string | null;
    limit?: number;
  }): Promise<NudgeResult> {
    const result: NudgeResult = { notified: 0, skipped: {} };

    const [maxPerDay, cooldownMinutes] = await Promise.all([
      this.appConfig.getNumber('notification.nudge_max_per_day'),
      this.appConfig.getNumber('notification.nudge_cooldown_minutes'),
    ]);

    const candidates = await this.eligibleListeners(options.topic ?? null, options.excludeUserId);

    for (const listenerId of candidates.slice(0, options.limit ?? 20)) {
      const state = await this.burnout.state(listenerId);

      // The burnout caps are not advisory. A listener who has already heard
      // eight people today, or who is inside their ten-minute breather, is not
      // "available with a caveat" — they are done for now (PRD §11.2).
      if (state.dailyCapReached) {
        count(result, 'daily_cap');
        continue;
      }
      if (state.cooldownUntil && state.cooldownUntil > new Date()) {
        count(result, 'cooldown');
        continue;
      }
      if (state.activeSessions >= state.maxConcurrent) {
        count(result, 'at_capacity');
        continue;
      }

      const allowance = await this.claimNudgeSlot(listenerId, maxPerDay, cooldownMinutes);
      if (allowance !== 'allowed') {
        count(result, allowance);
        continue;
      }

      const outcome = await this.fanout.notify({
        userId: listenerId,
        template: 'listener.nudge',
        dedupeKey: `nudge:${options.sourceId}:${listenerId}`,
      });

      if (outcome.status === 'duplicate') {
        count(result, 'duplicate');
        continue;
      }
      result.notified += 1;
    }

    return result;
  }

  /**
   * Rate control, claimed before sending rather than checked after.
   *
   * Both counters are Redis-side and atomic: two triggers firing at once would
   * otherwise both read "3 today" and both send. A listener noticing they were
   * nudged five times when the limit says four will not file a bug — they will
   * just turn availability off.
   *
   * Redis being unavailable fails *closed* here. Everywhere else in this
   * codebase a counter outage fails open so people are not punished for our
   * operational problem; a nudge is the exception, because the failure mode of
   * failing open is spamming the very people the limit protects, and nobody is
   * harmed by a nudge that does not arrive.
   */
  private async claimNudgeSlot(
    listenerId: string,
    maxPerDay: number,
    cooldownMinutes: number,
  ): Promise<'allowed' | 'rate_limited' | 'nudge_cooldown' | 'counter_unavailable'> {
    const dayKey = `nudge:day:${listenerId}:${wibDayKey()}`;
    const cooldownKey = `nudge:cooldown:${listenerId}`;

    try {
      // SET NX is the cooldown: it succeeds exactly once per window.
      const claimed = await this.redis.set(cooldownKey, '1', 'EX', cooldownMinutes * 60, 'NX');
      if (claimed !== 'OK') return 'nudge_cooldown';

      const used = await this.redis.incr(dayKey);
      if (used === 1) {
        await this.redis.expire(dayKey, secondsUntilWibMidnight());
      }

      if (used > maxPerDay) {
        // Over the cap: give the cooldown slot back so it does not silently
        // eat the next window once the day rolls over.
        await this.redis.del(cooldownKey);
        return 'rate_limited';
      }

      return 'allowed';
    } catch (error) {
      this.logger.warn('nudge counter unavailable; not nudging', error);
      return 'counter_unavailable';
    }
  }

  /**
   * Available listeners, optionally preferring those who opted into the topic.
   *
   * An empty topic list means "anything" (E10-T02), so those listeners are
   * included rather than excluded — a listener who never picked topics is open
   * to all of them, not to none.
   */
  private async eligibleListeners(topic: string | null, exclude?: string): Promise<string[]> {
    const availableIds = await this.availability.availableListenerIds();
    const candidates = availableIds.filter((id) => id !== exclude);
    if (candidates.length === 0) return [];

    const profiles = await this.prisma.listenerProfile.findMany({
      where: { userId: { in: candidates }, safetyStatus: 'ok' },
      select: { userId: true, topics: true },
    });

    return profiles
      .filter((profile) => {
        if (!topic || profile.topics.length === 0) return true;
        return profile.topics.includes(topic);
      })
      .map((profile) => profile.userId);
  }
}

function count(result: NudgeResult, reason: string): void {
  result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
}
