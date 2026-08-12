import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { BurnoutService } from './burnout.service.js';
import { MatchingService } from './matching.service.js';

export interface OfferView {
  matchId: string;
  /** Everything the listener needs to decide, and nothing that identifies anyone. */
  topic: string;
  emotion: string;
  mood: string | null;
  expiresAt: Date;
}

export interface AcceptedSession {
  sessionId: string;
  roomId: string;
  startedAt: Date;
}

export type OfferOutcome =
  | { status: 'offered'; matchId: string; listenerId: string; expiresAt: Date }
  | { status: 'exhausted' };

/**
 * The offer lifecycle — E10-T07, TECH-SPEC §4.5.
 *
 * One candidate at a time, 60 seconds each, at most five attempts. Two things
 * are enforced here rather than trusted to the client: the deadline (a
 * countdown on screen is decoration) and the arbitration of a simultaneous
 * accept, which is settled on the *request* row so exactly one listener can
 * ever win it.
 */
@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
    private readonly matching: MatchingService,
    private readonly burnout: BurnoutService,
  ) {}

  /**
   * Offers the request to the next-best candidate.
   *
   * Returns `exhausted` when the attempt budget is spent or nobody is
   * eligible; the caller turns that into the honest failure screen (E10-T08)
   * rather than a promise that someone will turn up.
   */
  async offerNext(requestId: string): Promise<OfferOutcome> {
    const request = await this.prisma.listenerRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== 'searching') return { status: 'exhausted' };

    const [maxCandidates, ttlSeconds] = await Promise.all([
      this.appConfig.getNumber('matching.max_candidates'),
      this.appConfig.getNumber('matching.offer_ttl_seconds'),
    ]);

    if (request.attemptCount >= maxCandidates) {
      await this.markFailed(requestId);
      return { status: 'exhausted' };
    }

    const shortlist = await this.matching.shortlistFor({
      id: request.id,
      requesterId: request.requesterId,
      topic: request.topic,
    });

    const candidate = shortlist[0];
    if (!candidate) {
      await this.markFailed(requestId);
      return { status: 'exhausted' };
    }

    const expiresAt = new Date(Date.now() + ttlSeconds * 1_000);

    const match = await this.prisma.listenerMatch.create({
      data: {
        requestId: request.id,
        requesterId: request.requesterId,
        listenerId: candidate.listenerId,
        expiresAt,
      },
    });

    await this.prisma.listenerRequest.update({
      where: { id: request.id },
      data: { attemptCount: { increment: 1 } },
    });

    return {
      status: 'offered',
      matchId: match.id,
      listenerId: candidate.listenerId,
      expiresAt,
    };
  }

  /** Live offers for a listener. Carries no identity of the requester. */
  async pendingFor(listenerId: string): Promise<OfferView[]> {
    const matches = await this.prisma.listenerMatch.findMany({
      where: { listenerId, status: 'offered', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        expiresAt: true,
        request: {
          select: { topic: true, emotion: true, post: { select: { mood: true } } },
        },
      },
    });

    return matches.map((match) => ({
      matchId: match.id,
      topic: match.request.topic,
      emotion: match.request.emotion,
      mood: match.request.post?.mood ?? null,
      expiresAt: match.expiresAt,
    }));
  }

  /**
   * Accepts an offer and opens the room.
   *
   * The whole thing is one transaction so a lost race leaves nothing behind:
   * no half-created room, no request marked matched by the listener who came
   * second.
   */
  async accept(listenerId: string, matchId: string): Promise<AcceptedSession> {
    const now = new Date();

    const match = await this.prisma.listenerMatch.findUnique({
      where: { id: matchId },
      select: { id: true, listenerId: true, requestId: true, requesterId: true, status: true, expiresAt: true },
    });

    if (!match || match.listenerId !== listenerId) {
      throw ApiException.notFound('MATCH_NOT_FOUND', 'Tawaran itu nggak ada.');
    }
    if (match.status !== 'offered') {
      throw ApiException.conflict('MATCH_OFFER_ALREADY_TAKEN', 'Tawaran ini sudah nggak berlaku.');
    }
    if (match.expiresAt.getTime() <= now.getTime()) {
      throw ApiException.conflict('MATCH_OFFER_EXPIRED', 'Tawarannya sudah lewat waktunya.');
    }

    // Capacity is re-checked at accept time, not just at offer time: a listener
    // can fill up in the sixty seconds an offer is on screen.
    const state = await this.burnout.state(listenerId, now);
    if (state.activeSessions >= state.maxConcurrent) {
      throw ApiException.conflict(
        'LISTENER_CAPACITY_REACHED',
        'Sesi kamu lagi penuh. Selesaikan salah satu dulu ya.',
      );
    }
    if (state.dailyCapReached) {
      throw ApiException.conflict(
        'LISTENER_DAILY_CAP_REACHED',
        'Kamu udah dengerin banyak orang hari ini. Istirahat dulu ya 🤍',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // The request row is claimed first, and it is the only row two callers
      // ever contend for. Claiming the match first instead deadlocks: each
      // caller would hold its own match row while reaching for the shared
      // request, and then reach for the other's match row to supersede it —
      // a cycle Postgres resolves by killing one transaction with 40P01.
      const claimedRequest = await tx.listenerRequest.updateMany({
        where: { id: match.requestId, status: 'searching' },
        data: { status: 'matched', resolvedAt: now },
      });

      if (claimedRequest.count === 0) {
        throw ApiException.conflict(
          'MATCH_OFFER_ALREADY_TAKEN',
          'Orang lain sudah lebih dulu menerima. Makasih ya udah siap mendengarkan.',
        );
      }

      const claimedOffer = await tx.listenerMatch.updateMany({
        where: { id: matchId, status: 'offered', expiresAt: { gt: now } },
        data: { status: 'accepted', respondedAt: now },
      });

      // Expired in the moment between the check above and the claim: the
      // whole transaction rolls back, so the request goes back to searching
      // rather than being stranded as matched with nobody in the room.
      if (claimedOffer.count === 0) {
        throw ApiException.conflict(
          'MATCH_OFFER_ALREADY_TAKEN',
          'Tawaran ini sudah nggak berlaku.',
        );
      }

      await tx.listenerMatch.updateMany({
        where: { requestId: match.requestId, status: 'offered' },
        data: { status: 'superseded' },
      });

      const room = await tx.chatRoom.create({ data: { type: 'listener_session' } });

      await tx.roomMember.createMany({
        data: [
          { roomId: room.id, userId: match.requesterId, role: 'requester' },
          { roomId: room.id, userId: listenerId, role: 'listener' },
        ],
      });

      const session = await tx.listenerSession.create({
        data: {
          matchId: match.id,
          roomId: room.id,
          requesterId: match.requesterId,
          listenerId,
        },
      });

      await tx.listenerProfile.update({
        where: { userId: listenerId },
        data: { sessionCount: { increment: 1 } },
      });

      return { sessionId: session.id, roomId: room.id, startedAt: session.startedAt };
    });
  }

  /**
   * Declines an offer and moves on.
   *
   * Nothing is recorded against the listener. PRD §11.2 is explicit that
   * declining must not cost anything, so there is no counter here to
   * accidentally start ranking on later.
   */
  async decline(listenerId: string, matchId: string): Promise<{ status: 'declined' }> {
    const declined = await this.prisma.listenerMatch.updateMany({
      where: { id: matchId, listenerId, status: 'offered' },
      data: { status: 'declined', respondedAt: new Date() },
    });

    if (declined.count === 0) {
      throw ApiException.notFound('MATCH_NOT_FOUND', 'Tawaran itu sudah nggak ada.');
    }

    const match = await this.prisma.listenerMatch.findUniqueOrThrow({
      where: { id: matchId },
      select: { requestId: true },
    });

    await this.offerNext(match.requestId);
    return { status: 'declined' };
  }

  /**
   * Sweeps offers whose deadline passed and moves each request along.
   *
   * Server-side because the countdown on screen proves nothing: a client that
   * closes its laptop must not hold a request hostage (E10-T07).
   */
  async expireOverdue(now: Date = new Date()): Promise<{ expired: number }> {
    const overdue = await this.prisma.listenerMatch.findMany({
      where: { status: 'offered', expiresAt: { lte: now } },
      select: { id: true, requestId: true },
    });

    if (overdue.length === 0) return { expired: 0 };

    await this.prisma.listenerMatch.updateMany({
      where: { id: { in: overdue.map((match) => match.id) } },
      data: { status: 'expired', respondedAt: now },
    });

    for (const requestId of new Set(overdue.map((match) => match.requestId))) {
      await this.offerNext(requestId).catch((error: unknown) => {
        this.logger.error(`failed to re-offer request ${requestId}`, error);
      });
    }

    return { expired: overdue.length };
  }

  private async markFailed(requestId: string): Promise<void> {
    await this.prisma.listenerRequest.updateMany({
      where: { id: requestId, status: 'searching' },
      data: { status: 'failed', resolvedAt: new Date() },
    });
  }
}
