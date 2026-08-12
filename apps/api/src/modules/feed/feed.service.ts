import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import { Redis } from 'ioredis';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { UsersService } from '../users/users.service.js';
import type { FeedQueryDto } from '../posts/posts.dto.js';

export interface FeedItem {
  id: string;
  title: string | null;
  /** Truncated for the card; the full text lives on the detail page. */
  excerpt: string;
  mood: string;
  intent: string;
  categorySlug: string;
  authorAlias: string;
  isAnonymous: boolean;
  responseCount: number;
  commentCount: number;
  createdAt: Date;
  /** True when the post qualifies for the "Butuh Didengar" highlight. */
  needsListener: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

const EXCERPT_LENGTH = 280;
const FIRST_PAGE_CACHE_TTL_SECONDS = 45;

/**
 * Feed — PRD §6, TECH-SPEC §3.2, §4.7.
 *
 * Cursor pagination everywhere (TECH-SPEC §8.2). Offset pagination drifts when
 * rows are inserted mid-scroll, which on a feed means the reader silently sees
 * a post twice or misses one entirely.
 */
@Injectable()
export class FeedService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly users: UsersService,
    private readonly appConfig: AppConfigService,
  ) {}

  async load(viewerId: string, query: FeedQueryDto): Promise<FeedPage> {
    const blockedIds = await this.users.blockedUserIdsFor(viewerId);

    // Only the first page of non-personalised tabs is cached, and the cache key
    // includes the viewer's block set. "Untuk Kamu" is never cached globally —
    // one user's personalised feed must not be served to another
    // (TECH-SPEC §8.1).
    const cacheable = !query.cursor && query.tab !== 'untuk-kamu' && blockedIds.length === 0;
    const cacheKey = `feed:${query.tab}:${query.category ?? 'all'}:${query.limit}`;

    if (cacheable) {
      const cached = await this.redis.get(cacheKey).catch(() => null);
      if (cached) return JSON.parse(cached) as FeedPage;
    }

    const page = await this.query(viewerId, query, blockedIds);

    if (cacheable) {
      await this.redis
        .set(cacheKey, JSON.stringify(page), 'EX', FIRST_PAGE_CACHE_TTL_SECONDS)
        .catch(() => undefined);
    }

    return page;
  }

  private async query(
    viewerId: string,
    query: FeedQueryDto,
    blockedIds: string[],
  ): Promise<FeedPage> {
    const maxResponses = await this.appConfig.getNumber('feed.butuh_didengar.max_responses');
    const maxAgeHours = await this.appConfig.getNumber('feed.butuh_didengar.max_age_hours');

    const where: Record<string, unknown> = {
      status: 'published',
      ...(blockedIds.length > 0 ? { authorId: { notIn: blockedIds } } : {}),
    };

    if (query.tab === 'butuh-didengar') {
      // TECH-SPEC §4.7: fewer than N human responses AND younger than 48 hours.
      // The age bound matters as much as the response bound — an unanswered
      // post from last month is not something a reader can still help with.
      where['responseCount'] = { lt: maxResponses };
      where['createdAt'] = { gte: new Date(Date.now() - maxAgeHours * 3_600_000) };
    }

    if (query.tab === 'topik' && query.category) {
      where['category'] = { slug: query.category };
    }

    if (query.tab === 'untuk-kamu') {
      const topics = await this.topicsFor(viewerId);
      if (topics.length > 0) {
        where['category'] = { slug: { in: topics } };
      }
      // Safety over virality (PRD §20): sensitive content is not promoted, so
      // the personalised tab draws only from L0.
      where['safetyLevel'] = 'L0';
    }

    // Cursor on createdAt + id: createdAt alone is not unique, and two posts
    // sharing a millisecond would make one of them unreachable.
    const cursor = this.decodeCursor(query.cursor);
    if (cursor) {
      where['OR'] = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.curhatPost.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        category: { select: { slug: true } },
        anonymousIdentity: { select: { displayCode: true } },
        author: { select: { profile: { select: { alias: true } } } },
        _count: { select: { comments: true } },
      },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const items: FeedItem[] = page.map((post) => ({
      id: post.id,
      title: post.title,
      excerpt:
        post.body.length > EXCERPT_LENGTH
          ? `${post.body.slice(0, EXCERPT_LENGTH).trimEnd()}…`
          : post.body,
      mood: post.mood,
      intent: post.intent,
      categorySlug: post.category.slug,
      authorAlias: post.anonymousIdentity
        ? `Anonymous #${post.anonymousIdentity.displayCode}`
        : (post.author.profile?.alias ?? 'Seseorang'),
      isAnonymous: post.anonymousIdentity !== null,
      responseCount: post.responseCount,
      commentCount: post._count.comments,
      createdAt: post.createdAt,
      needsListener:
        post.responseCount < maxResponses &&
        post.createdAt.getTime() > Date.now() - maxAgeHours * 3_600_000,
    }));

    const last = page.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? this.encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Topics the viewer picked during onboarding.
   *
   * "Untuk Kamu" in MVP is topic affinity plus freshness, deliberately not a
   * learned ranker — recommendation ML is explicitly out of scope for Phase 1
   * (TECH-SPEC BAGIAN 14), and an opaque ranker on emotional content is the
   * wrong first thing to build.
   */
  private async topicsFor(userId: string): Promise<string[]> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { topics: true },
    });
    return profile?.topics ?? [];
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
      if (Number.isNaN(createdAt.getTime())) return null;

      return { createdAt, id };
    } catch {
      // A malformed cursor restarts from the top rather than erroring: it is
      // almost always a stale link, not an attack.
      return null;
    }
  }

  /** Category list with live post counts, for Explore (DESIGN-REF §2.12). */
  async explore(): Promise<Array<{ slug: string; name: string; icon: string | null; activePosts: number }>> {
    const cacheKey = 'feed:explore';
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      return JSON.parse(cached) as Array<{
        slug: string;
        name: string;
        icon: string | null;
        activePosts: number;
      }>;
    }

    const categories = await this.prisma.postCategory.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        slug: true,
        name: true,
        icon: true,
        _count: { select: { posts: { where: { status: 'published' } } } },
      },
    });

    const result = categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      activePosts: category._count.posts,
    }));

    // Counted periodically rather than per request: an exact number is not
    // worth a COUNT(*) across the table on every Explore open.
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 120).catch(() => undefined);

    return result;
  }
}
