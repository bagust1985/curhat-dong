import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { wibDayKey } from '../ai/wib-day.js';
import { AvailabilityService } from './availability.service.js';

export interface BurnoutState {
  activeSessions: number;
  maxConcurrent: number;
  sessionsToday: number;
  maxSessionsPerDay: number;
  /** Null when they are free to take a session now. */
  cooldownUntil: Date | null;
  /** True once the daily cap turned availability off for the day. */
  dailyCapReached: boolean;
  /** Gentle, dismissable banner — not a block (DESIGN-REF §2.20). */
  restReminder: boolean;
  /** Warm, appreciative copy. Never a warning. */
  message: string | null;
}

/**
 * Burnout protection — E10-T09, PRD §11.2, DESIGN-REF §2.20.
 *
 * Listeners are volunteers absorbing heavy stories. Every limit here is
 * enforced server-side rather than suggested in the UI, and none of them is
 * expressed as a penalty: there is no override button, no score reduction, and
 * no wording that treats stopping as a failure. A cap that feels like
 * punishment teaches people to route around it.
 */
@Injectable()
export class BurnoutService {
  private readonly logger = new Logger(BurnoutService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
    private readonly availability: AvailabilityService,
  ) {}

  async state(userId: string, at: Date = new Date()): Promise<BurnoutState> {
    const [profile, counter, activeSessions, limits] = await Promise.all([
      this.prisma.listenerProfile.findUnique({ where: { userId } }),
      this.prisma.listenerSessionCounter.findUnique({
        where: { userId_date: { userId, date: dayStamp(at) } },
      }),
      this.activeSessionCount(userId),
      this.limits(),
    ]);

    const maxConcurrent = profile?.maxConcurrent ?? limits.maxConcurrent;
    const sessionsToday = counter?.completedCount ?? 0;

    const cooldownUntil = counter?.lastSessionEndedAt
      ? new Date(counter.lastSessionEndedAt.getTime() + limits.cooldownMinutes * 60_000)
      : null;
    const inCooldown = cooldownUntil !== null && cooldownUntil.getTime() > at.getTime();

    const dailyCapReached = sessionsToday >= limits.maxSessionsPerDay;
    const restReminder =
      !dailyCapReached && sessionsToday >= limits.restReminderAfterSessions;

    return {
      activeSessions,
      maxConcurrent,
      sessionsToday,
      maxSessionsPerDay: limits.maxSessionsPerDay,
      cooldownUntil: inCooldown ? cooldownUntil : null,
      dailyCapReached,
      restReminder,
      message: messageFor({
        dailyCapReached,
        sessionsToday,
        inCooldown,
        restReminder,
        atConcurrencyLimit: activeSessions >= maxConcurrent,
      }),
    };
  }

  /** Open sessions right now. */
  async activeSessionCount(userId: string): Promise<number> {
    return this.prisma.listenerSession.count({ where: { listenerId: userId, endedAt: null } });
  }

  /**
   * Called when a session ends (E11-T07).
   *
   * Increments the day's counter, starts the cooldown, and — on reaching the
   * daily cap — turns availability off. Auto-off is the point: a tired
   * volunteer should not have to decide to stop while offers keep arriving.
   */
  async recordSessionEnd(userId: string, at: Date = new Date()): Promise<BurnoutState> {
    const date = dayStamp(at);

    await this.prisma.listenerSessionCounter.upsert({
      where: { userId_date: { userId, date } },
      update: { completedCount: { increment: 1 }, lastSessionEndedAt: at },
      create: { userId, date, completedCount: 1, lastSessionEndedAt: at },
    });

    const state = await this.state(userId, at);

    if (state.dailyCapReached) {
      await this.availability.set(userId, false).catch((error: unknown) => {
        this.logger.error(`failed to auto-disable availability for ${userId}`, error);
      });
    }

    return state;
  }

  private async limits() {
    const [
      maxConcurrent,
      maxSessionsPerDay,
      cooldownMinutes,
      restReminderAfterSessions,
      restReminderAfterMinutes,
    ] = await Promise.all([
      this.appConfig.getNumber('listener.max_concurrent'),
      this.appConfig.getNumber('listener.max_sessions_per_day'),
      this.appConfig.getNumber('listener.cooldown_minutes'),
      this.appConfig.getNumber('listener.rest_reminder_after_sessions'),
      this.appConfig.getNumber('listener.rest_reminder_after_minutes'),
    ]);

    return {
      maxConcurrent,
      maxSessionsPerDay,
      cooldownMinutes,
      restReminderAfterSessions,
      restReminderAfterMinutes,
    };
  }
}

/**
 * The local day a session counts against.
 *
 * WIB, like every other daily boundary in the product. PRD §11.2 says the
 * listener's own timezone; MVP is Indonesia-only (PRD §11), so this is that
 * timezone rather than a placeholder — when regional expansion lands, the
 * per-user offset replaces this one function.
 */
function dayStamp(at: Date): Date {
  return new Date(`${wibDayKey(at)}T00:00:00.000Z`);
}

function messageFor(state: {
  dailyCapReached: boolean;
  sessionsToday: number;
  inCooldown: boolean;
  restReminder: boolean;
  atConcurrencyLimit: boolean;
}): string | null {
  // Appreciative, never a warning — and never offering a way to push through
  // (DESIGN-REF §2.20).
  if (state.dailyCapReached) {
    return `Kamu udah dengerin ${state.sessionsToday} orang hari ini. Istirahat dulu ya 🤍`;
  }
  if (state.inCooldown) return 'Ambil napas dulu sebentar ya.';
  if (state.atConcurrencyLimit) {
    return 'Sesi kamu lagi penuh, jadi offer baru nggak masuk dulu.';
  }
  if (state.restReminder) return 'Udah beberapa sesi hari ini. Kalau capek, boleh berhenti dulu.';
  return null;
}
