import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { FeltHeardService } from '../felt-heard/felt-heard.service.js';
import { LocalRulesService } from '../safety/local-rules.service.js';
import { UsersService } from '../users/users.service.js';

export interface CommentView {
  id: string;
  body: string;
  authorAlias: string;
  isOwn: boolean;
  isMarkedHelpful: boolean;
  parentId: string | null;
  createdAt: Date;
  replies: CommentView[];
}

export interface CommentPage {
  items: CommentView[];
  nextCursor: string | null;
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly users: UsersService,
    private readonly rateLimit: RateLimitService,
    private readonly appConfig: AppConfigService,
    private readonly localRules: LocalRulesService,
    private readonly feltHeard: FeltHeardService,
  ) {}

  /**
   * Adds a comment or a reply — PRD §9.
   *
   * Replies nest exactly one level. The database enforces it with a trigger as
   * well; this check exists so the user gets a clear Indonesian message rather
   * than a constraint violation.
   */
  async create(
    userId: string,
    postId: string,
    body: string,
    parentId?: string,
  ): Promise<CommentView> {
    const perHour = await this.appConfig.getNumber('rate_limit.comment_per_hour');

    await this.rateLimit.enforce(
      { bucket: 'comment:create', subject: userId, limit: perHour, windowSeconds: 3600 },
      { failClosed: false },
    );

    const post = await this.prisma.curhatPost.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, status: true, allowComments: true },
    });

    if (!post || post.status !== 'published') {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    if (!post.allowComments) {
      throw ApiException.forbidden('COMMENTS_LOCKED', 'Komentar untuk curhat ini ditutup.');
    }

    if (await this.users.isBlockedEitherWay(userId, post.authorId)) {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    if (parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: parentId },
        select: { postId: true, parentId: true, status: true },
      });

      if (!parent || parent.postId !== postId || parent.status !== 'published') {
        throw ApiException.notFound('NOT_FOUND', 'Komentar itu nggak ada atau sudah dihapus.');
      }

      if (parent.parentId !== null) {
        throw ApiException.badRequest(
          'COMMENT_NESTING_TOO_DEEP',
          'Balasan cuma bisa satu tingkat. Balas ke komentar utamanya ya.',
        );
      }
    }

    // Comments go through the same local rules as posts. A crisis signal in a
    // reply is no less urgent than one in a post.
    const rules = this.localRules.evaluate(body);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          postId,
          authorId: userId,
          body,
          ...(parentId ? { parentId } : {}),
          status: 'published',
          safetyLevel: rules.highRisk ? 'pending' : 'L1',
        },
        include: { author: { select: { profile: { select: { alias: true } } } } },
      });

      // Atomic increment, not read-modify-write: fifty concurrent comments
      // must produce a count of fifty. This counter decides which posts appear
      // in "Butuh Didengar", so drift there means answered posts keep asking
      // for help.
      //
      // Only counted when the author is someone else — replying to yourself is
      // not being heard.
      if (userId !== post.authorId) {
        await tx.curhatPost.update({
          where: { id: postId },
          data: { responseCount: { increment: 1 } },
        });
      }

      return created;
    });

    if (rules.highRisk) {
      await this.holdForModeration(userId, comment.id);
    }

    // A human answered, so the author may be asked whether it helped — subject
    // to the anti-fatigue rules (PRD §9).
    if (userId !== post.authorId) {
      await this.feltHeard.onHumanResponse(post.authorId, postId);
    }

    return {
      id: comment.id,
      body: comment.body,
      authorAlias: comment.author.profile?.alias ?? 'Seseorang',
      isOwn: true,
      isMarkedHelpful: false,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      replies: [],
    };
  }

  async list(
    viewerId: string,
    postId: string,
    cursor?: string,
    limit = 20,
  ): Promise<CommentPage> {
    const blockedIds = await this.users.blockedUserIdsFor(viewerId);

    const post = await this.prisma.curhatPost.findUnique({
      where: { id: postId },
      select: { authorId: true, status: true },
    });

    if (!post || post.status !== 'published') {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    const decoded = this.decodeCursor(cursor);

    const roots = await this.prisma.comment.findMany({
      where: {
        postId,
        parentId: null,
        status: 'published',
        ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}),
        ...(decoded
          ? {
              OR: [
                { createdAt: { gt: decoded.createdAt } },
                { createdAt: decoded.createdAt, id: { gt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: {
        author: { select: { profile: { select: { alias: true } } } },
        replies: {
          where: {
            status: 'published',
            ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}),
          },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { profile: { select: { alias: true } } } } },
        },
      },
    });

    const hasMore = roots.length > limit;
    const page = hasMore ? roots.slice(0, limit) : roots;

    const items: CommentView[] = page.map((comment) => ({
      id: comment.id,
      body: comment.body,
      authorAlias: comment.author.profile?.alias ?? 'Seseorang',
      isOwn: comment.authorId === viewerId,
      isMarkedHelpful: comment.isMarkedHelpful,
      parentId: null,
      createdAt: comment.createdAt,
      replies: comment.replies.map((reply) => ({
        id: reply.id,
        body: reply.body,
        authorAlias: reply.author.profile?.alias ?? 'Seseorang',
        isOwn: reply.authorId === viewerId,
        isMarkedHelpful: reply.isMarkedHelpful,
        parentId: reply.parentId,
        createdAt: reply.createdAt,
        replies: [],
      })),
    }));

    const last = page.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? this.encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Marks a comment as helpful — PRD §9, author only.
   *
   * Feeds recommendation signals and a listener's helpful score. Toggling is
   * allowed: the author changing their mind is not a data problem.
   */
  async markHelpful(userId: string, commentId: string, helpful: boolean): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, post: { select: { authorId: true } } },
    });

    if (!comment) {
      throw ApiException.notFound('NOT_FOUND', 'Komentar itu nggak ada atau sudah dihapus.');
    }

    if (comment.post.authorId !== userId) {
      throw ApiException.forbidden(
        'FORBIDDEN',
        'Cuma yang punya curhat yang bisa menandai jawaban ini membantu.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { isMarkedHelpful: helpful },
      });

      // The commenter's public "helpful" tally, shown on their profile.
      await tx.userProfile.updateMany({
        where: { userId: comment.authorId },
        data: { helpfulCount: { increment: helpful ? 1 : -1 } },
      });
    });
  }

  async deleteOwn(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true, postId: true, status: true, post: { select: { authorId: true } } },
    });

    if (!comment || comment.status === 'deleted') {
      throw ApiException.notFound('NOT_FOUND', 'Komentar itu nggak ada atau sudah dihapus.');
    }

    if (comment.authorId !== userId) {
      throw ApiException.forbidden('FORBIDDEN', 'Ini bukan komentar kamu.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { status: 'deleted', deletedAt: new Date() },
      });

      // Keep the counter honest — a deleted reply is no longer a response, and
      // the post may need to reappear in "Butuh Didengar".
      if (comment.authorId !== comment.post.authorId) {
        await tx.curhatPost.update({
          where: { id: comment.postId },
          data: { responseCount: { decrement: 1 } },
        });
      }
    });
  }

  private async holdForModeration(userId: string, commentId: string): Promise<void> {
    await this.prisma.safetyEvent.create({
      data: {
        userId,
        targetType: 'comment',
        targetId: commentId,
        level: 'pending',
        actionTaken: 'flagged_local_high_risk_ai_unavailable',
      },
    });

    await this.prisma.moderationCase.create({
      data: {
        source: 'system',
        queue: 'critical',
        targetType: 'comment',
        targetId: commentId,
        slaDueAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  }

  private encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
  }

  private decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
    if (!cursor) return null;
    try {
      const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (!iso || !id) return null;
      const createdAt = new Date(iso);
      return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
    } catch {
      return null;
    }
  }
}
