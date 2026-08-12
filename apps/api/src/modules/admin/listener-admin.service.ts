import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ListenerSafetyStatus, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { AvailabilityService } from '../listener/availability.service.js';
import { RoomsService } from '../chat/rooms.service.js';
import { NotificationFanoutService } from '../notifications/notification-fanout.service.js';
import { AuditService } from './audit.service.js';

export interface ListenerSummary {
  userId: string;
  alias: string | null;
  safetyStatus: ListenerSafetyStatus;
  isAvailable: boolean;
  /**
   * Context, not a leaderboard (PRD §11).
   *
   * Rates over 0..1 rather than counts, for the same reason ranking uses them
   * (E10-T06): counts turn a support role into a contest and bury everyone who
   * started last month.
   */
  feltHeardRate: number;
  helpfulRate: number;
  sessionCount: number;
  activeSessions: number;
  reportsAgainst: number;
  joinedAt: Date | null;
}

/**
 * Listener management — E14-T10. PRD §18, DESIGN-REF §3.6.
 *
 * The distinction this service exists to keep: **suspending listener mode is
 * not banning the account**. Somebody who is struggling to hold other people's
 * stories is not somebody who did something wrong, and the most likely reason
 * to pull a listener is that they need to stop — which is a reason to protect
 * their account, not to end it.
 */
@Injectable()
export class ListenerAdminService {
  private readonly logger = new Logger(ListenerAdminService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly availability: AvailabilityService,
    private readonly rooms: RoomsService,
    private readonly notifications: NotificationFanoutService,
    private readonly audit: AuditService,
  ) {}

  async list(
    filter: { safetyStatus?: ListenerSafetyStatus | undefined; limit?: number } = {},
  ): Promise<ListenerSummary[]> {
    const profiles = await this.prisma.listenerProfile.findMany({
      where: { ...(filter.safetyStatus ? { safetyStatus: filter.safetyStatus } : {}) },
      orderBy: { createdAt: 'desc' },
      take: filter.limit ?? 50,
      include: {
        user: {
          select: {
            id: true,
            profile: { select: { alias: true, joinedAt: true } },
            listenerAvailability: { select: { isAvailable: true } },
          },
        },
      },
    });

    const userIds = profiles.map((profile) => profile.userId);

    const [activeByListener, reportsByUser] = await Promise.all([
      this.prisma.listenerSession.groupBy({
        by: ['listenerId'],
        where: { listenerId: { in: userIds }, endedAt: null },
        _count: { _all: true },
      }),
      this.prisma.report.groupBy({
        by: ['targetId'],
        where: { targetType: 'user', targetId: { in: userIds } },
        _count: { _all: true },
      }),
    ]);

    const activeMap = new Map(activeByListener.map((row) => [row.listenerId, row._count._all]));
    const reportMap = new Map(reportsByUser.map((row) => [row.targetId, row._count._all]));

    return profiles.map((profile) => ({
      userId: profile.userId,
      alias: profile.user.profile?.alias ?? null,
      safetyStatus: profile.safetyStatus,
      isAvailable: profile.user.listenerAvailability?.isAvailable ?? false,
      feltHeardRate: profile.feltHeardScore,
      helpfulRate: profile.helpfulScore,
      sessionCount: profile.sessionCount,
      activeSessions: activeMap.get(profile.userId) ?? 0,
      reportsAgainst: reportMap.get(profile.userId) ?? 0,
      joinedAt: profile.user.profile?.joinedAt ?? null,
    }));
  }

  /**
   * Suspends listener mode.
   *
   * Three things happen, in this order, and the order matters:
   *
   *  1. availability is switched off, so no new match can be offered;
   *  2. open sessions are closed *politely* — with a reason, through the same
   *     path a normal close takes, so the requester sees a closed room and a
   *     feedback prompt rather than a conversation that simply stopped;
   *  3. the profile is marked, which is what keeps them out of matching.
   *
   * The account itself is untouched: they can still post, comment, and ask for
   * a listener themselves. A person who has absorbed too much is not a person
   * to remove from a product about not being alone.
   */
  async suspendListenerMode(input: {
    userId: string;
    adminId: string;
    reason: string;
  }): Promise<{ safetyStatus: ListenerSafetyStatus; sessionsClosed: number }> {
    const reason = input.reason.trim();
    if (reason.length < 10) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Alasan wajib diisi dan cukup jelas.');
    }

    const profile = await this.prisma.listenerProfile.findUnique({
      where: { userId: input.userId },
      select: { safetyStatus: true },
    });

    if (!profile) {
      throw ApiException.notFound('NOT_FOUND', 'Akun ini bukan listener.');
    }

    await this.availability.set(input.userId, false).catch((error: unknown) => {
      // Availability lives in Redis with a Postgres mirror. If the write fails
      // the profile flag below still removes them from matching.
      this.logger.warn('failed to clear availability during suspension', error);
    });

    const open = await this.prisma.listenerSession.findMany({
      where: { listenerId: input.userId, endedAt: null },
      select: { roomId: true },
    });

    let sessionsClosed = 0;
    for (const session of open) {
      try {
        await this.rooms.close(input.userId, session.roomId, 'moderation');
        sessionsClosed += 1;
      } catch (error) {
        // One stuck room must not leave the listener half-suspended.
        this.logger.warn(`failed to close room ${session.roomId} on suspension`, error);
      }
    }

    await this.prisma.listenerProfile.update({
      where: { userId: input.userId },
      data: { safetyStatus: 'suspended' },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.listener.suspended',
      targetType: 'user',
      targetId: input.userId,
      diff: { reason, from: profile.safetyStatus, to: 'suspended', sessionsClosed },
    });

    await this.notifications
      .notify({
        userId: input.userId,
        template: 'account.moderation_action',
        dedupeKey: `listener_suspended:${input.userId}:${Date.now()}`,
      })
      .catch(() => undefined);

    return { safetyStatus: 'suspended', sessionsClosed };
  }

  /** Puts a listener back into rotation. Availability stays their choice. */
  async restoreListenerMode(input: {
    userId: string;
    adminId: string;
    reason: string;
  }): Promise<{ safetyStatus: ListenerSafetyStatus }> {
    const reason = input.reason.trim();
    if (reason.length < 10) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Alasan wajib diisi dan cukup jelas.');
    }

    const profile = await this.prisma.listenerProfile.findUnique({
      where: { userId: input.userId },
      select: { safetyStatus: true },
    });

    if (!profile) {
      throw ApiException.notFound('NOT_FOUND', 'Akun ini bukan listener.');
    }

    await this.prisma.listenerProfile.update({
      where: { userId: input.userId },
      data: { safetyStatus: 'ok' },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.listener.restored',
      targetType: 'user',
      targetId: input.userId,
      diff: { reason, from: profile.safetyStatus, to: 'ok' },
    });

    // Deliberately not switching availability back on. Coming back is theirs
    // to decide, and a listener silently made available again would start
    // receiving offers they never asked for.
    return { safetyStatus: 'ok' };
  }

  /** Marks a listener as under review without pulling them yet. */
  async markUnderReview(input: {
    userId: string;
    adminId: string;
    reason: string;
  }): Promise<{ safetyStatus: ListenerSafetyStatus }> {
    const reason = input.reason.trim();
    if (reason.length < 10) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Alasan wajib diisi dan cukup jelas.');
    }

    await this.prisma.listenerProfile.update({
      where: { userId: input.userId },
      data: { safetyStatus: 'under_review' },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.listener.under_review',
      targetType: 'user',
      targetId: input.userId,
      diff: { reason },
    });

    return { safetyStatus: 'under_review' };
  }
}
