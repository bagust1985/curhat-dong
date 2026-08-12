import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FeltHeardAnswer, PrismaClient, SessionEndReason } from '@curhat/database';
import { Redis } from 'ioredis';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { FeltHeardService } from '../felt-heard/felt-heard.service.js';
import { BurnoutService } from '../listener/burnout.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { RoomAccessService } from './room-access.service.js';

export interface RoomSummary {
  roomId: string;
  role: 'requester' | 'listener';
  status: 'open' | 'closed';
  counterpartAlias: string | null;
  lastActivityAt: Date;
  /** Deliberately absent: no message preview anywhere (E11-T09). */
}

export interface RoomDetail extends RoomSummary {
  sessionId: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  showSafetyNotice: boolean;
  safetyNotice: string;
}

/**
 * The room notice — E11-T06, PRD §15, DESIGN-REF §2.11.
 *
 * Says what actually happens and stops there. PRD §15 forbids promising that
 * screenshots are impossible, because they are not: FLAG_SECURE helps on
 * Android and nothing helps against a second phone pointed at the screen.
 * Telling someone their words are safe when they might not be is worse than
 * telling them the truth.
 */
export const ROOM_SAFETY_NOTICE =
  'Percakapan ini dipantau sistem keamanan otomatis. Jaga privasimu — kami membantu ' +
  'mencegah tangkapan layar di perangkat yang mendukung, tapi tidak bisa menjaminnya.';

export interface CloseResult {
  status: 'closed';
  endReason: SessionEndReason;
}

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly access: RoomAccessService,
    private readonly appConfig: AppConfigService,
    private readonly burnout: BurnoutService,
    private readonly feltHeard: FeltHeardService,
    private readonly moderation: ModerationService,
  ) {}

  /** Room list — timings and who, never a snippet of what was said. */
  async list(userId: string): Promise<RoomSummary[]> {
    const memberships = await this.prisma.roomMember.findMany({
      where: { userId, leftAt: null },
      select: {
        role: true,
        room: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            members: {
              where: { userId: { not: userId } },
              select: { user: { select: { profile: { select: { alias: true } } } } },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              // Only the timestamp. Selecting `body` here is exactly how a
              // "last message" preview sneaks into a list screen later.
              select: { createdAt: true },
            },
          },
        },
      },
    });

    return memberships
      .map((membership) => ({
        roomId: membership.room.id,
        role: membership.role,
        status: membership.room.status,
        counterpartAlias: membership.room.members[0]?.user.profile?.alias ?? null,
        lastActivityAt: membership.room.messages[0]?.createdAt ?? membership.room.createdAt,
      }))
      .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }

  async detail(userId: string, roomId: string): Promise<RoomDetail> {
    const access = await this.access.require(userId, roomId);

    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      select: {
        createdAt: true,
        session: { select: { id: true, startedAt: true, endedAt: true } },
        members: {
          where: { userId: { not: userId } },
          select: { user: { select: { profile: { select: { alias: true } } } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    });

    return {
      roomId,
      role: access.role,
      status: access.status,
      counterpartAlias: room.members[0]?.user.profile?.alias ?? null,
      lastActivityAt: room.messages[0]?.createdAt ?? room.createdAt,
      sessionId: room.session?.id ?? null,
      startedAt: room.session?.startedAt ?? null,
      endedAt: room.session?.endedAt ?? null,
      showSafetyNotice: !(await this.hasSeenNotice(roomId, userId)),
      safetyNotice: ROOM_SAFETY_NOTICE,
    };
  }

  /**
   * Marks the notice as seen.
   *
   * Kept in Redis with a long expiry. Losing it means someone sees the notice
   * twice, which is a smaller problem than a schema column and a migration for
   * a piece of UI state.
   */
  async acknowledgeNotice(userId: string, roomId: string): Promise<void> {
    await this.access.require(userId, roomId);
    await this.redis
      .set(`room:notice:${roomId}:${userId}`, '1', 'EX', 30 * 86_400)
      .catch((error: unknown) => this.logger.warn('notice ack write failed', error));
  }

  /**
   * Ends a session — E11-T07.
   *
   * Either person may end it at any time, with no confirmation gauntlet. The
   * listener's daily counter and cooldown start here (E10-T09): without this
   * call the burnout caps would never advance in production.
   */
  async close(
    userId: string,
    roomId: string,
    endReason: SessionEndReason = 'requester_ended',
  ): Promise<CloseResult> {
    const access = await this.access.require(userId, roomId, { requireOpen: true });
    const reason: SessionEndReason =
      endReason === 'idle_timeout' || endReason === 'moderation' || endReason === 'blocked'
        ? endReason
        : access.role === 'listener'
          ? 'listener_ended'
          : 'requester_ended';

    return this.finalise(roomId, reason);
  }

  /**
   * The close path shared by the API, the block action and the idle sweep.
   *
   * Idempotent: a room already closed returns quietly rather than
   * double-counting a listener's session.
   */
  async finalise(roomId: string, endReason: SessionEndReason): Promise<CloseResult> {
    const closed = await this.prisma.chatRoom.updateMany({
      where: { id: roomId, status: 'open' },
      data: { status: 'closed', closedAt: new Date() },
    });

    if (closed.count === 0) return { status: 'closed', endReason };

    const session = await this.prisma.listenerSession.findFirst({
      where: { roomId, endedAt: null },
      select: { id: true, listenerId: true, requesterId: true },
    });

    if (!session) return { status: 'closed', endReason };

    const endedAt = new Date();
    await this.prisma.listenerSession.update({
      where: { id: session.id },
      data: { endedAt, endReason },
    });

    // Burnout counters advance here and nowhere else (E10-T09).
    await this.burnout.recordSessionEnd(session.listenerId, endedAt).catch((error: unknown) => {
      this.logger.error(`failed to record session end for ${session.listenerId}`, error);
    });

    // Felt Heard applies its own anti-fatigue rules and never throws (E06).
    await this.feltHeard.onSessionEnded(session.requesterId, session.id);

    return { status: 'closed', endReason };
  }

  /**
   * Closes rooms nobody has spoken in for a while — E11-T07.
   *
   * A session that just goes quiet leaves a listener's concurrency slot
   * occupied forever. Closing it politely is better than leaving both people
   * in a room that has already ended in every sense but the database's.
   */
  async closeIdleRooms(now: Date = new Date()): Promise<{ closed: number }> {
    const idleMinutes = await this.appConfig.getNumber('room.idle_timeout_minutes');
    const cutoff = new Date(now.getTime() - idleMinutes * 60_000);

    const candidates = await this.prisma.chatRoom.findMany({
      where: { status: 'open', createdAt: { lt: cutoff } },
      select: {
        id: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
    });

    let closed = 0;
    for (const room of candidates) {
      const lastActivity = room.messages[0]?.createdAt;
      if (lastActivity && lastActivity.getTime() > cutoff.getTime()) continue;

      await this.finalise(room.id, 'idle_timeout');
      closed += 1;
    }

    return { closed };
  }

  /**
   * Two-way session feedback — E11-T08.
   *
   * The requester's answer goes through the Felt Heard service so the North
   * Star metric has exactly one path into it, anti-fatigue rules and all. The
   * listener's answer is a safety signal: "no" opens a review.
   */
  async feedback(
    userId: string,
    roomId: string,
    input: {
      feltHeard?: FeltHeardAnswer | undefined;
      feltSafe?: boolean | undefined;
      note?: string | undefined;
    },
  ): Promise<{ recorded: boolean; message: string }> {
    const access = await this.access.require(userId, roomId);

    const session = await this.prisma.listenerSession.findFirst({
      where: { roomId },
      select: { id: true, listenerId: true, requesterId: true },
    });

    if (!session) throw ApiException.notFound('NOT_FOUND', 'Sesi itu nggak ada.');

    if (access.role === 'requester') {
      if (!input.feltHeard) {
        throw ApiException.badRequest('VALIDATION_ERROR', 'Pilih salah satu jawabannya ya.');
      }

      const prompt = await this.prisma.feltHeardPrompt.findUnique({
        where: {
          userId_targetType_targetId: {
            userId,
            targetType: 'session',
            targetId: session.id,
          },
        },
        select: { id: true, answeredAt: true, dismissed: true },
      });

      // No prompt means the anti-fatigue rules or the user's own settings
      // declined to ask. Recording the answer anyway would route around the
      // rules that keep the metric honest.
      if (!prompt || prompt.answeredAt || prompt.dismissed) {
        return { recorded: false, message: 'Makasih ya 🤍' };
      }

      await this.feltHeard.answer(userId, prompt.id, input.feltHeard);
      return { recorded: true, message: 'Makasih ya 🤍' };
    }

    if (input.feltSafe === undefined) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Pilih salah satu jawabannya ya.');
    }

    await this.prisma.listenerSession.update({
      where: { id: session.id },
      data: {
        listenerFeltSafe: input.feltSafe,
        ...(input.note ? { listenerNote: input.note } : {}),
      },
    });

    if (!input.feltSafe) {
      // A listener saying the conversation did not feel safe is a first-hand
      // report from the only person who was there.
      await this.moderation.openCase({
        source: 'listener_escalate',
        queue: 'high',
        targetType: 'user',
        targetId: session.requesterId,
      });
    }

    return { recorded: true, message: 'Makasih udah mau dengerin 🤍' };
  }

  /**
   * Block from inside the room — E11-T09.
   *
   * Ends the session immediately and, because the matching filter honours
   * blocks in both directions, permanently keeps these two apart (E10-T05).
   */
  async blockCounterpart(userId: string, roomId: string): Promise<{ status: 'blocked' }> {
    const access = await this.access.require(userId, roomId);

    await this.prisma.blockedUser.upsert({
      where: {
        blockerId_blockedId: { blockerId: userId, blockedId: access.counterpartId },
      },
      update: {},
      create: { blockerId: userId, blockedId: access.counterpartId },
    });

    await this.finalise(roomId, 'blocked');
    return { status: 'blocked' };
  }

  private async hasSeenNotice(roomId: string, userId: string): Promise<boolean> {
    try {
      return (await this.redis.exists(`room:notice:${roomId}:${userId}`)) === 1;
    } catch {
      // Show it again rather than risk never showing it.
      return false;
    }
  }
}
