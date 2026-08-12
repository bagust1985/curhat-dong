import { Inject, Injectable } from '@nestjs/common';
import type { PostStatus, PrismaClient, SafetyLevel } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { AuditService } from './audit.service.js';

export interface PostAdminSummary {
  postId: string;
  title: string | null;
  excerpt: string;
  authorId: string;
  authorAlias: string | null;
  isAnonymous: boolean;
  status: PostStatus;
  safetyLevel: SafetyLevel;
  allowComments: boolean;
  responseCount: number;
  commentCount: number;
  reportCount: number;
  createdAt: Date;
}

export interface PostAdminPage {
  items: PostAdminSummary[];
  nextCursor: string | null;
}

const EXCERPT_LENGTH = 200;

/**
 * Statuses a post can be restored *to*.
 *
 * `restore` puts a post back where it was before moderation touched it, and
 * "before" is always `published` — a post is only removable once it is live.
 * Restoring to `pending_analysis` would re-run the safety pipeline and could
 * hold it again, which reads to the author as the appeal not having worked.
 */
const RESTORE_STATUS: PostStatus = 'published';

/**
 * Content management — E14-T09. PRD §18, DESIGN-REF §3.5.
 *
 * Everything here works on public content: posts and their comments. Private
 * conversation is not reachable from this service at all — it needs the case
 * gate (E14-T04).
 */
@Injectable()
export class ContentAdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(
    filter: {
      status?: PostStatus | undefined;
      safetyLevel?: SafetyLevel | undefined;
      categorySlug?: string | undefined;
      reportedOnly?: boolean | undefined;
      cursor?: string | undefined;
      limit?: number | undefined;
    } = {},
  ): Promise<PostAdminPage> {
    const limit = filter.limit ?? 25;
    const cursor = decodeCursor(filter.cursor);

    // "Reported" is a property of the reports table, so it is resolved to a
    // set of ids first rather than expressed as a join filter.
    let reportedIds: string[] | null = null;
    if (filter.reportedOnly) {
      const reports = await this.prisma.report.findMany({
        where: { targetType: 'post' },
        select: { targetId: true },
        distinct: ['targetId'],
        take: 500,
      });
      reportedIds = reports.map((report) => report.targetId);
    }

    const rows = await this.prisma.curhatPost.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.safetyLevel ? { safetyLevel: filter.safetyLevel } : {}),
        ...(filter.categorySlug ? { category: { slug: filter.categorySlug } } : {}),
        ...(reportedIds ? { id: { in: reportedIds } } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        author: { select: { id: true, profile: { select: { alias: true } } } },
        anonymousIdentity: { select: { displayCode: true } },
        _count: { select: { comments: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    const reportCounts = await this.reportCounts(page.map((post) => post.id));

    return {
      items: page.map((post) => ({
        postId: post.id,
        title: post.title,
        excerpt:
          post.body.length > EXCERPT_LENGTH
            ? `${post.body.slice(0, EXCERPT_LENGTH).trimEnd()}…`
            : post.body,
        // The author id is shown here and only here: a moderator acting on
        // content has to be able to act on the account behind it. It never
        // reaches a public response (non-negotiable #4).
        authorId: post.author.id,
        authorAlias: post.anonymousIdentity ? null : (post.author.profile?.alias ?? null),
        isAnonymous: post.anonymousIdentity !== null,
        status: post.status,
        safetyLevel: post.safetyLevel,
        allowComments: post.allowComments,
        responseCount: post.responseCount,
        commentCount: post._count.comments,
        reportCount: reportCounts.get(post.id) ?? 0,
        createdAt: post.createdAt,
      })),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /** Removes a post from circulation. Comments are left intact. */
  async remove(postId: string, adminId: string, reason: string): Promise<{ status: PostStatus }> {
    const post = await this.requirePost(postId);
    this.requireReason(reason);

    await this.prisma.curhatPost.update({
      where: { id: postId },
      data: { status: 'removed' },
    });

    await this.audit.record({
      actorId: adminId,
      action: 'admin.content.removed',
      targetType: 'post',
      targetId: postId,
      diff: { reason, from: post.status, to: 'removed' },
    });

    return { status: 'removed' };
  }

  /**
   * Puts a removed post back.
   *
   * Comments were never deleted by `remove`, so they come back with it — which
   * is the point of the acceptance criterion. A removal that destroyed the
   * thread would make "restore" a word for something that cannot happen.
   */
  async restore(postId: string, adminId: string, reason: string): Promise<{ status: PostStatus }> {
    const post = await this.requirePost(postId);
    this.requireReason(reason);

    if (post.status !== 'removed' && post.status !== 'held') {
      throw ApiException.conflict('CONFLICT', 'Post ini tidak sedang ditahan atau dihapus.');
    }

    await this.prisma.curhatPost.update({
      where: { id: postId },
      data: {
        status: RESTORE_STATUS,
        // A post that was held before analysis finished has no publish date.
        ...(post.publishedAt ? {} : { publishedAt: new Date() }),
      },
    });

    await this.audit.record({
      actorId: adminId,
      action: 'admin.content.restored',
      targetType: 'post',
      targetId: postId,
      diff: { reason, from: post.status, to: RESTORE_STATUS },
    });

    return { status: RESTORE_STATUS };
  }

  /**
   * Closes or reopens a comment thread.
   *
   * Existing comments stay visible. Locking is "no more of this", not "none of
   * this happened" — deleting a thread would remove the replies of people who
   * did nothing wrong, and for the author it would erase the support they got.
   */
  async setComments(
    postId: string,
    adminId: string,
    allow: boolean,
    reason: string,
  ): Promise<{ allowComments: boolean; commentsKept: number }> {
    await this.requirePost(postId);
    this.requireReason(reason);

    const [, commentsKept] = await Promise.all([
      this.prisma.curhatPost.update({
        where: { id: postId },
        data: { allowComments: allow },
      }),
      this.prisma.comment.count({ where: { postId, status: 'published' } }),
    ]);

    await this.audit.record({
      actorId: adminId,
      action: allow ? 'admin.content.comments_unlocked' : 'admin.content.comments_locked',
      targetType: 'post',
      targetId: postId,
      diff: { reason, allowComments: allow, commentsKept },
    });

    return { allowComments: allow, commentsKept };
  }

  private async reportCounts(postIds: string[]): Promise<Map<string, number>> {
    if (postIds.length === 0) return new Map();

    const grouped = await this.prisma.report.groupBy({
      by: ['targetId'],
      where: { targetType: 'post', targetId: { in: postIds } },
      _count: { _all: true },
    });

    return new Map(grouped.map((row) => [row.targetId, row._count._all]));
  }

  private async requirePost(postId: string) {
    const post = await this.prisma.curhatPost.findUnique({
      where: { id: postId },
      select: { id: true, status: true, publishedAt: true, authorId: true },
    });

    if (!post) {
      throw ApiException.notFound('NOT_FOUND', 'Post itu tidak ditemukan.');
    }
    return post;
  }

  private requireReason(reason: string): void {
    if (reason.trim().length < 10) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Alasan wajib diisi dan cukup jelas untuk ditinjau nanti.',
      );
    }
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;

  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id || !UUID_PATTERN.test(id)) return null;

    const createdAt = new Date(iso);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
  } catch {
    return null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
