import { Inject, Injectable } from '@nestjs/common';
import type { ListenerSafetyStatus, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { AvailabilityService } from './availability.service.js';
import { BurnoutService, type BurnoutState } from './burnout.service.js';
import {
  LISTENER_GUIDELINES,
  LISTENER_GUIDELINES_VERSION,
  type GuidelineSection,
} from './listener-guidelines.js';

export interface ListenerProfileView {
  topics: string[];
  languages: string[];
  maxConcurrent: number;
  isAvailable: boolean;
  safetyStatus: ListenerSafetyStatus;
  guidelinesVersionAccepted: string | null;
  /** True when the accepted version is behind the current one (E10-T01). */
  needsGuidelinesAcceptance: boolean;
}

export interface ListenerStats {
  sessionCount: number;
  /** Share of answered prompts where the answer was "yes". 0..1. */
  feltHeardScore: number;
  /** Share where the answer was "yes" or "somewhat". 0..1. */
  helpfulScore: number;
  safetyStatus: ListenerSafetyStatus;
  burnout: BurnoutState;
  recentSessions: Array<{ startedAt: Date; endedAt: Date | null; minutes: number | null }>;
}

/**
 * Listener activation, preferences and stats — E10-T01, T02, T10.
 *
 * PRD §11 asks for a listener profile with scores and no leaderboard. The
 * split here is the whole answer: your own numbers are feedback you can see,
 * and nobody else's are visible anywhere — there is no endpoint that ranks
 * listeners against each other, by design rather than by omission.
 */
@Injectable()
export class ListenerService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
    private readonly availability: AvailabilityService,
    private readonly burnout: BurnoutService,
  ) {}

  guidelines(): { version: string; sections: readonly GuidelineSection[] } {
    return { version: LISTENER_GUIDELINES_VERSION, sections: LISTENER_GUIDELINES };
  }

  /**
   * Turns listener mode on.
   *
   * Refuses without the current guidelines version. Enforced here rather than
   * in the UI because "the screen made them scroll" is not something anyone
   * can audit six months later — the accepted version and timestamp are
   * (PRD §11.1).
   */
  async activate(
    userId: string,
    input: {
      guidelinesVersion: string;
      topics?: string[] | undefined;
      languages?: string[] | undefined;
    },
  ): Promise<ListenerProfileView> {
    if (input.guidelinesVersion !== LISTENER_GUIDELINES_VERSION) {
      throw ApiException.badRequest(
        'LISTENER_GUIDELINES_NOT_ACCEPTED',
        'Panduan listener sudah diperbarui. Baca sebentar lagi ya, terus setujui.',
      );
    }

    const maxConcurrent = await this.appConfig.getNumber('listener.max_concurrent');

    await this.prisma.listenerProfile.upsert({
      where: { userId },
      update: {
        guidelinesVersionAccepted: LISTENER_GUIDELINES_VERSION,
        guidelinesAcceptedAt: new Date(),
        ...(input.topics ? { topics: input.topics } : {}),
        ...(input.languages ? { languages: input.languages } : {}),
      },
      create: {
        userId,
        guidelinesVersionAccepted: LISTENER_GUIDELINES_VERSION,
        guidelinesAcceptedAt: new Date(),
        topics: input.topics ?? [],
        languages: input.languages ?? ['id'],
        maxConcurrent,
      },
    });

    return this.profile(userId);
  }

  async profile(userId: string): Promise<ListenerProfileView> {
    const profile = await this.requireProfile(userId);
    const isAvailable = await this.availability.isAvailable(userId);

    return {
      topics: profile.topics,
      languages: profile.languages,
      maxConcurrent: profile.maxConcurrent,
      isAvailable,
      safetyStatus: profile.safetyStatus,
      guidelinesVersionAccepted: profile.guidelinesVersionAccepted,
      needsGuidelinesAcceptance:
        profile.guidelinesVersionAccepted !== LISTENER_GUIDELINES_VERSION,
    };
  }

  /**
   * Updates preferences.
   *
   * `maxConcurrent` may only go down (PRD §11.2). Someone can decide they can
   * hold less; nobody — including themselves at 2am — gets to decide they can
   * hold more than the product thinks is safe.
   */
  async updateProfile(
    userId: string,
    input: {
      topics?: string[] | undefined;
      languages?: string[] | undefined;
      maxConcurrent?: number | undefined;
    },
  ): Promise<ListenerProfileView> {
    await this.requireProfile(userId);
    const ceiling = await this.appConfig.getNumber('listener.max_concurrent');

    if (input.maxConcurrent !== undefined && input.maxConcurrent > ceiling) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        `Maksimal ${ceiling} sesi berbarengan. Kamu boleh menurunkannya, bukan menaikkan.`,
      );
    }

    await this.prisma.listenerProfile.update({
      where: { userId },
      data: {
        ...(input.topics ? { topics: input.topics } : {}),
        ...(input.languages ? { languages: input.languages } : {}),
        ...(input.maxConcurrent === undefined ? {} : { maxConcurrent: input.maxConcurrent }),
      },
    });

    return this.profile(userId);
  }

  /**
   * The listener's own numbers — E10-T10.
   *
   * Session history carries timings only: no message content, and nothing
   * identifying the person on the other side.
   */
  async stats(userId: string): Promise<ListenerStats> {
    const profile = await this.requireProfile(userId);
    const scores = await this.refreshScores(userId);

    const sessions = await this.prisma.listenerSession.findMany({
      where: { listenerId: userId },
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: { startedAt: true, endedAt: true },
    });

    return {
      sessionCount: profile.sessionCount,
      feltHeardScore: scores.feltHeardScore,
      helpfulScore: scores.helpfulScore,
      safetyStatus: profile.safetyStatus,
      burnout: await this.burnout.state(userId),
      recentSessions: sessions.map((session) => ({
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        minutes: session.endedAt
          ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 60_000)
          : null,
      })),
    };
  }

  /**
   * Recomputes the two rates from the requesters' own answers.
   *
   * Rates, never counts: a count would reward whoever started first and make
   * ranking a popularity contest (PRD §11). Dismissed prompts are not in
   * `felt_heard_feedback` at all, so silence never counts as a "no".
   */
  async refreshScores(userId: string): Promise<{ feltHeardScore: number; helpfulScore: number }> {
    const feedback = await this.prisma.feltHeardFeedback.findMany({
      where: { session: { listenerId: userId } },
      select: { answer: true },
    });

    const total = feedback.length;
    const yes = feedback.filter((row) => row.answer === 'yes').length;
    const anyHelp = feedback.filter((row) => row.answer !== 'no').length;

    const feltHeardScore = total === 0 ? 0 : yes / total;
    const helpfulScore = total === 0 ? 0 : anyHelp / total;

    await this.prisma.listenerProfile.update({
      where: { userId },
      data: { feltHeardScore, helpfulScore },
    });

    return { feltHeardScore, helpfulScore };
  }

  /** Public view — alias and topics only, never internal scores (E10-T02). */
  async publicProfile(listenerId: string) {
    const profile = await this.prisma.listenerProfile.findUnique({
      where: { userId: listenerId },
      select: {
        topics: true,
        languages: true,
        sessionCount: true,
        user: { select: { profile: { select: { alias: true } } } },
      },
    });

    if (!profile) throw ApiException.notFound('NOT_FOUND', 'Listener itu nggak ada.');

    return {
      alias: profile.user.profile?.alias ?? null,
      topics: profile.topics,
      languages: profile.languages,
      sessionCount: profile.sessionCount,
    };
  }

  private async requireProfile(userId: string) {
    const profile = await this.prisma.listenerProfile.findUnique({ where: { userId } });

    if (!profile?.guidelinesVersionAccepted) {
      throw ApiException.forbidden(
        'LISTENER_GUIDELINES_NOT_ACCEPTED',
        'Baca dan setujui panduan listener dulu ya.',
      );
    }

    return profile;
  }
}
