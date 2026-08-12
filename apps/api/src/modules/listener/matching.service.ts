import { Inject, Injectable } from '@nestjs/common';
import { MATCHING_JSON_CONFIG_KEYS, type PrismaClient } from '@curhat/database';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { wibDayKey } from '../ai/wib-day.js';
import { UsersService } from '../users/users.service.js';
import { AvailabilityService } from './availability.service.js';
import {
  mergeRankWeights,
  selectCandidates,
  type CandidateSnapshot,
  type MatchCriteria,
} from './matching.js';

/**
 * Turns the database into candidate snapshots and hands them to the pure
 * matching functions — E10-T05, E10-T06, TECH-SPEC §4.5.
 *
 * All the I/O lives here so `matching.ts` can stay pure and fully unit-tested.
 * That split matters more than usual: the filter is the only thing standing
 * between a blocked pair and a private room.
 */
@Injectable()
export class MatchingService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
    private readonly availability: AvailabilityService,
    private readonly users: UsersService,
  ) {}

  /** Ranked shortlist for a request, already capped to the attempt budget. */
  async shortlistFor(request: {
    id: string;
    requesterId: string;
    topic: string;
    language?: string;
  }): Promise<CandidateSnapshot[]> {
    const availableIds = await this.availability.availableListenerIds();
    if (availableIds.length === 0) return [];

    const [
      profiles,
      blockedIds,
      activeSessions,
      counters,
      topicExperience,
      previousPositiveIds,
      alreadyOffered,
      weightsRaw,
      maxSessionsPerDay,
      cooldownMinutes,
      maxCandidates,
    ] = await Promise.all([
      this.prisma.listenerProfile.findMany({ where: { userId: { in: availableIds } } }),
      this.users.blockedUserIdsFor(request.requesterId),
      this.prisma.listenerSession.groupBy({
        by: ['listenerId'],
        where: { listenerId: { in: availableIds }, endedAt: null },
        _count: { _all: true },
      }),
      this.prisma.listenerSessionCounter.findMany({
        where: { userId: { in: availableIds }, date: dayStamp(new Date()) },
      }),
      this.prisma.listenerSession.groupBy({
        by: ['listenerId'],
        where: {
          listenerId: { in: availableIds },
          endedAt: { not: null },
          match: { request: { topic: request.topic } },
        },
        _count: { _all: true },
      }),
      this.previousPositiveListeners(request.requesterId, availableIds),
      this.prisma.listenerMatch.findMany({
        where: { requestId: request.id },
        select: { listenerId: true },
      }),
      this.appConfig.getJson<unknown>(MATCHING_JSON_CONFIG_KEYS.rankWeights, null),
      this.appConfig.getNumber('listener.max_sessions_per_day'),
      this.appConfig.getNumber('listener.cooldown_minutes'),
      this.appConfig.getNumber('matching.max_candidates'),
    ]);

    const activeByListener = new Map(
      activeSessions.map((row) => [row.listenerId, row._count._all]),
    );
    const experienceByListener = new Map(
      topicExperience.map((row) => [row.listenerId, row._count._all]),
    );
    const counterByListener = new Map(counters.map((row) => [row.userId, row]));

    const snapshots: CandidateSnapshot[] = profiles.map((profile) => ({
      listenerId: profile.userId,
      topics: profile.topics,
      languages: profile.languages,
      safetyStatus: profile.safetyStatus,
      guidelinesAccepted: Boolean(profile.guidelinesVersionAccepted),
      isAvailable: true,
      maxConcurrent: profile.maxConcurrent,
      activeSessions: activeByListener.get(profile.userId) ?? 0,
      sessionsToday: counterByListener.get(profile.userId)?.completedCount ?? 0,
      lastSessionEndedAt: counterByListener.get(profile.userId)?.lastSessionEndedAt ?? null,
      helpfulScore: profile.helpfulScore,
      feltHeardScore: profile.feltHeardScore,
      topicExperience: experienceByListener.get(profile.userId) ?? 0,
      previousPositive: previousPositiveIds.has(profile.userId),
    }));

    const criteria: MatchCriteria = {
      requesterId: request.requesterId,
      topic: request.topic,
      language: request.language ?? 'id',
      blockedUserIds: new Set(blockedIds),
      alreadyOfferedIds: new Set(alreadyOffered.map((row) => row.listenerId)),
      maxSessionsPerDay,
      cooldownMinutes,
      now: new Date(),
    };

    return selectCandidates(snapshots, criteria, mergeRankWeights(weightsRaw), maxCandidates);
  }

  /**
   * Listeners this requester has been with before and rated positively.
   *
   * Uses the requester's own Felt Heard answer rather than an activity count —
   * "did this help me" is the only judgement that belongs in a rematch.
   */
  private async previousPositiveListeners(
    requesterId: string,
    listenerIds: string[],
  ): Promise<Set<string>> {
    const feedback = await this.prisma.feltHeardFeedback.findMany({
      where: {
        userId: requesterId,
        answer: { in: ['yes', 'somewhat'] },
        session: { listenerId: { in: listenerIds } },
      },
      select: { session: { select: { listenerId: true } } },
    });

    return new Set(
      feedback
        .map((row) => row.session?.listenerId)
        .filter((id): id is string => typeof id === 'string'),
    );
  }
}

function dayStamp(at: Date): Date {
  return new Date(`${wibDayKey(at)}T00:00:00.000Z`);
}
