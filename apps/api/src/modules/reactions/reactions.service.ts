import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, ReactionTarget, ReactionType } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { UsersService } from '../users/users.service.js';

export interface ReactionSummary {
  counts: Record<string, number>;
  /** Which reactions the viewer left, so the UI can show them as active. */
  mine: string[];
}

/**
 * Emotional reactions — PRD §9.
 *
 * Six empathy words, not likes. No reaction outranks another and there is no
 * single "approve" button, because the point is to say something to the person
 * rather than to score their post.
 *
 * Reactions deliberately do NOT increment `responseCount`. That counter drives
 * the "Butuh Didengar" tab, and a post with twelve taps and no words has not
 * been answered — treating it as answered would bury exactly the posts that
 * still need a human reply.
 */
@Injectable()
export class ReactionsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly users: UsersService,
  ) {}

  async set(
    userId: string,
    targetType: ReactionTarget,
    targetId: string,
    type: ReactionType,
  ): Promise<ReactionSummary> {
    await this.assertTargetVisible(userId, targetType, targetId);

    // Idempotent: tapping an already-active reaction should not be an error
    // the user has to think about.
    await this.prisma.reaction.upsert({
      where: {
        targetType_targetId_userId_type: { targetType, targetId, userId, type },
      },
      update: {},
      create: { targetType, targetId, userId, type },
    });

    return this.summarise(userId, targetType, targetId);
  }

  async unset(
    userId: string,
    targetType: ReactionTarget,
    targetId: string,
    type: ReactionType,
  ): Promise<ReactionSummary> {
    await this.prisma.reaction.deleteMany({
      where: { targetType, targetId, userId, type },
    });

    return this.summarise(userId, targetType, targetId);
  }

  async summarise(
    userId: string,
    targetType: ReactionTarget,
    targetId: string,
  ): Promise<ReactionSummary> {
    const [grouped, mine] = await Promise.all([
      this.prisma.reaction.groupBy({
        by: ['type'],
        where: { targetType, targetId },
        _count: { type: true },
      }),
      this.prisma.reaction.findMany({
        where: { targetType, targetId, userId },
        select: { type: true },
      }),
    ]);

    return {
      counts: Object.fromEntries(grouped.map((row) => [row.type, row._count.type])),
      mine: mine.map((row) => row.type),
    };
  }

  /**
   * Refuses a reaction on something the user should not be able to see.
   *
   * Without this, reacting becomes a way to confirm that a held or blocked
   * post exists.
   */
  private async assertTargetVisible(
    userId: string,
    targetType: ReactionTarget,
    targetId: string,
  ): Promise<void> {
    if (targetType === 'post') {
      const post = await this.prisma.curhatPost.findUnique({
        where: { id: targetId },
        select: { authorId: true, status: true },
      });

      if (!post || post.status !== 'published') {
        throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
      }

      if (await this.users.isBlockedEitherWay(userId, post.authorId)) {
        throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
      }

      return;
    }

    const comment = await this.prisma.comment.findUnique({
      where: { id: targetId },
      select: { authorId: true, status: true },
    });

    if (!comment || comment.status !== 'published') {
      throw ApiException.notFound('NOT_FOUND', 'Komentar itu nggak ada atau sudah dihapus.');
    }

    if (await this.users.isBlockedEitherWay(userId, comment.authorId)) {
      throw ApiException.notFound('NOT_FOUND', 'Komentar itu nggak ada atau sudah dihapus.');
    }
  }
}
