import { Inject, Injectable } from '@nestjs/common';
import type { ListenerRequestStatus, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { OffersService } from './offers.service.js';

export interface RequestStatusView {
  requestId: string;
  status: ListenerRequestStatus;
  topic: string;
  emotion: string;
  attemptCount: number;
  /** Present while searching. Server-side deadline, not a client countdown. */
  offerExpiresAt: Date | null;
  /** Set once someone accepted. */
  roomId: string | null;
  /** Honest alternatives, present only when the search gave up (E10-T08). */
  alternatives?: Array<{ label: string; action: string }>;
  message?: string;
}

/**
 * Requester side of matching — E10-T04, E10-T08, DESIGN-REF §2.10.
 *
 * The failure path gets as much care as the happy one. TECH-SPEC §4.5 forbids
 * promising that a listener is available, so when the search gives up this
 * says so plainly and offers three real things to do instead — the worst
 * possible answer to "I need someone" is a spinner that never resolves.
 */
@Injectable()
export class ListenerRequestsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly offers: OffersService,
    private readonly rateLimit: RateLimitService,
    private readonly flags: FeatureFlagService,
  ) {}

  async create(
    requesterId: string,
    input: { topic: string; emotion: string; postId?: string | undefined },
  ): Promise<RequestStatusView> {
    if (!(await this.flags.isEnabled('listener.matching_enabled'))) {
      throw ApiException.unavailable(
        'SERVICE_UNAVAILABLE',
        'Cari Listener lagi tidak aktif sebentar. Kamu masih bisa ngobrol sama DONG AI.',
      );
    }

    await this.rateLimit.enforce(
      { bucket: 'listener:request', subject: requesterId, limit: 10, windowSeconds: 3_600 },
      { failClosed: false },
    );

    const active = await this.prisma.listenerRequest.findFirst({
      where: { requesterId, status: 'searching' },
    });

    if (active) {
      throw ApiException.conflict(
        'LISTENER_REQUEST_ALREADY_ACTIVE',
        'Kami masih nyariin orang buat kamu. Sabar sebentar ya.',
      );
    }

    if (input.postId) {
      const post = await this.prisma.curhatPost.findFirst({
        where: { id: input.postId, authorId: requesterId },
        select: { id: true },
      });
      if (!post) {
        throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada.');
      }
    }

    const request = await this.prisma.listenerRequest.create({
      data: {
        requesterId,
        topic: input.topic,
        emotion: input.emotion,
        ...(input.postId ? { postId: input.postId } : {}),
      },
    });

    await this.offers.offerNext(request.id);
    return this.status(requesterId, request.id);
  }

  /** The polling endpoint behind the searching screen. */
  async status(requesterId: string, requestId: string): Promise<RequestStatusView> {
    const request = await this.prisma.listenerRequest.findFirst({
      where: { id: requestId, requesterId },
      include: {
        matches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { session: { select: { roomId: true } } },
        },
      },
    });

    if (!request) throw ApiException.notFound('NOT_FOUND', 'Permintaan itu nggak ada.');

    const latest = request.matches[0];
    const searching = request.status === 'searching';

    return {
      requestId: request.id,
      status: request.status,
      topic: request.topic,
      emotion: request.emotion,
      attemptCount: request.attemptCount,
      offerExpiresAt: searching && latest?.status === 'offered' ? latest.expiresAt : null,
      roomId: latest?.session?.roomId ?? null,
      ...(request.status === 'failed' ? this.failureCopy() : {}),
    };
  }

  async current(requesterId: string): Promise<RequestStatusView | null> {
    const request = await this.prisma.listenerRequest.findFirst({
      where: { requesterId, status: { in: ['searching', 'matched'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    return request ? this.status(requesterId, request.id) : null;
  }

  async cancel(requesterId: string, requestId: string): Promise<{ status: 'cancelled' }> {
    const cancelled = await this.prisma.listenerRequest.updateMany({
      where: { id: requestId, requesterId, status: 'searching' },
      data: { status: 'cancelled', resolvedAt: new Date() },
    });

    if (cancelled.count === 0) {
      throw ApiException.notFound('NOT_FOUND', 'Permintaan itu sudah nggak aktif.');
    }

    await this.prisma.listenerMatch.updateMany({
      where: { requestId, status: 'offered' },
      data: { status: 'superseded' },
    });

    return { status: 'cancelled' };
  }

  /**
   * What we say when nobody is free.
   *
   * Honest about the situation, warm about the person, and concrete about what
   * they can do next. No "coba lagi nanti, mungkin ada yang online" — that is
   * a promise the system cannot keep.
   */
  private failureCopy(): { message: string; alternatives: Array<{ label: string; action: string }> } {
    return {
      message:
        'Belum ada yang siap mendengarkan sekarang. Bukan karena ceritamu kurang penting — ' +
        'listener kami manusia, dan lagi nggak ada yang available.',
      alternatives: [
        { label: 'Ngobrol sama DONG AI', action: 'open_ai' },
        { label: 'Posting ke Butuh Didengar', action: 'create_post' },
        { label: 'Coba cari lagi', action: 'retry' },
      ],
    };
  }
}
