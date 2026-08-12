import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { UsersService } from '../users/users.service.js';
import { buildTsQuery } from './indonesian-query.js';
import type { SearchQueryDto, SearchTab } from './search.dto.js';

export interface PostResult {
  id: string;
  title: string | null;
  /** Truncated for the card, exactly as the feed does. Never the whole post. */
  excerpt: string;
  mood: string;
  intent: string;
  categorySlug: string;
  authorAlias: string;
  isAnonymous: boolean;
  responseCount: number;
  createdAt: Date;
}

/**
 * A listener as a stranger may see them.
 *
 * The same allow-list as `PublicProfile` (PRD §16) plus availability. No
 * internal id, no trust score, no session counts — search must not become the
 * one endpoint that says more than the profile page (non-negotiable #4).
 */
export interface ListenerResult {
  alias: string;
  avatar: string | null;
  bio: string | null;
  topics: string[];
  isAvailable: boolean;
  helpfulCount: number;
  joinedAt: Date;
}

export interface TopicResult {
  slug: string;
  name: string;
  icon: string | null;
  activePosts: number;
}

export interface SearchResults {
  tab: SearchTab;
  query: string;
  posts: PostResult[];
  listeners: ListenerResult[];
  topics: TopicResult[];
  nextCursor: string | null;
}

const EXCERPT_LENGTH = 280;

interface PostRow {
  id: string;
  title: string | null;
  body: string;
  mood: string;
  intent: string;
  response_count: number;
  created_at: Date;
  category_slug: string;
  anonymous_code: string | null;
  author_alias: string | null;
  rank: number;
}

/**
 * Internal full-text search — E13. PRD §13; TECH-SPEC §2.4, §3.2.
 *
 * Postgres only: TECH-SPEC §2.4 rules Elasticsearch out of Phase 1, and the
 * `tsvector` column plus GIN index landed with E02-T08.
 *
 * Two properties matter more here than anywhere else in the product, because
 * search is the natural place to try to get at things you were not shown:
 *
 *  - it reads `curhat_posts`, `user_profiles` and `post_categories`. Nothing
 *    else. Private room messages and DONG AI conversations are not indexed,
 *    not joined, and not reachable from this file (E13-T03);
 *  - the GIN index is partial on `status = 'published'`, so held and removed
 *    content cannot surface even if a query forgot to filter for it. The
 *    filter is written out anyway — defence in depth is cheap here.
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly users: UsersService,
    private readonly rateLimit: RateLimitService,
    private readonly appConfig: AppConfigService,
  ) {}

  async search(viewerId: string, query: SearchQueryDto): Promise<SearchResults> {
    const perMinute = await this.appConfig.getNumber('rate_limit.search_per_minute');

    // Scraping the feed one query at a time is the cheapest way to build a
    // corpus of other people's curhat. Fails open like every other content
    // endpoint (E05): a Redis outage must not take search down.
    await this.rateLimit.enforce(
      { bucket: 'search', subject: viewerId, limit: perMinute, windowSeconds: 60 },
      { failClosed: false },
    );

    const empty: SearchResults = {
      tab: query.tab,
      query: query.q,
      posts: [],
      listeners: [],
      topics: [],
      nextCursor: null,
    };

    const tsQuery = buildTsQuery(query.q);
    if (!tsQuery) return empty;

    switch (query.tab) {
      case 'curhat':
        return { ...empty, ...(await this.searchPosts(viewerId, tsQuery, query)) };
      case 'listener':
        return { ...empty, listeners: await this.searchListeners(viewerId, query) };
      case 'topik':
        return { ...empty, topics: await this.searchTopics(query) };
    }
  }

  /**
   * Full-text search over published curhat.
   *
   * Raw SQL because Prisma cannot express `@@`, `ts_rank` or a `tsvector`
   * column — the same reason E02-T08 wrote the migration by hand. Every value
   * is a bound parameter; the tsquery itself is assembled from tokens that
   * have already been reduced to `[a-z0-9]`, so no user input reaches
   * `to_tsquery` as syntax.
   */
  private async searchPosts(
    viewerId: string,
    tsQuery: string,
    query: SearchQueryDto,
  ): Promise<{ posts: PostResult[]; nextCursor: string | null }> {
    const blockedIds = await this.users.blockedUserIdsFor(viewerId);
    const cursor = decodeCursor(query.cursor);
    const take = query.limit + 1;

    // A cursor-less first page uses sentinels that pass every row: rank is
    // bounded above by 1, and the maximum uuid sorts last.
    const cursorRank = cursor?.rank ?? Number.MAX_SAFE_INTEGER;
    const cursorId = cursor?.id ?? 'ffffffff-ffff-ffff-ffff-ffffffffffff';

    const rows = await this.prisma.$queryRaw<PostRow[]>`
      SELECT * FROM (
        SELECT
          p.id,
          p.title,
          p.body,
          p.mood::text AS mood,
          p.intent::text AS intent,
          p.response_count,
          p.created_at,
          c.slug AS category_slug,
          ai.display_code AS anonymous_code,
          up.alias AS author_alias,
          ts_rank(p.search_vector, q.query) AS rank
        FROM curhat_posts p
        CROSS JOIN (SELECT to_tsquery('simple', ${tsQuery}) AS query) q
        JOIN post_categories c ON c.id = p.category_id
        LEFT JOIN anonymous_identities ai ON ai.post_id = p.id
        LEFT JOIN user_profiles up ON up.user_id = p.author_id
        WHERE p.status = 'published'
          AND p.deleted_at IS NULL
          AND p.search_vector @@ q.query
          AND NOT (p.author_id = ANY(${blockedIds}::uuid[]))
      ) matches
      WHERE matches.rank < ${cursorRank}::float4
         OR (matches.rank = ${cursorRank}::float4 AND matches.id < ${cursorId}::uuid)
      ORDER BY matches.rank DESC, matches.id DESC
      LIMIT ${take}
    `;

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    return {
      posts: page.map(toPostResult),
      nextCursor: hasMore && last ? encodeCursor(last.rank, last.id) : null,
    };
  }

  /**
   * Listener search by alias.
   *
   * Deliberately not full-text over the bio: a bio is where people write
   * something personal about why they listen, and making it keyword-searchable
   * turns it into a surface for finding people rather than a note on a profile
   * someone chose to open.
   */
  private async searchListeners(
    viewerId: string,
    query: SearchQueryDto,
  ): Promise<ListenerResult[]> {
    const blockedIds = await this.users.blockedUserIdsFor(viewerId);

    const profiles = await this.prisma.userProfile.findMany({
      where: {
        isListener: true,
        aliasLower: { contains: query.q.toLowerCase() },
        userId: {
          // The blocked pair is invisible in both directions (PRD §15), and
          // the viewer never appears in their own listener search.
          notIn: [...blockedIds, viewerId],
        },
        user: { status: 'active', listenerProfile: { safetyStatus: 'ok' } },
      },
      orderBy: [{ helpfulCount: 'desc' }, { alias: 'asc' }],
      take: query.limit,
      select: {
        alias: true,
        avatar: true,
        bio: true,
        joinedAt: true,
        helpfulCount: true,
        user: {
          select: {
            listenerProfile: { select: { topics: true } },
            listenerAvailability: { select: { isAvailable: true } },
          },
        },
      },
    });

    return profiles.map((profile) => ({
      alias: profile.alias,
      avatar: profile.avatar,
      bio: profile.bio,
      topics: profile.user.listenerProfile?.topics ?? [],
      isAvailable: profile.user.listenerAvailability?.isAvailable ?? false,
      helpfulCount: profile.helpfulCount,
      joinedAt: profile.joinedAt,
    }));
  }

  private async searchTopics(query: SearchQueryDto): Promise<TopicResult[]> {
    const categories = await this.prisma.postCategory.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { slug: { contains: query.q.toLowerCase() } },
        ],
      },
      orderBy: { displayOrder: 'asc' },
      take: query.limit,
      select: {
        slug: true,
        name: true,
        icon: true,
        _count: { select: { posts: { where: { status: 'published' } } } },
      },
    });

    return categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      activePosts: category._count.posts,
    }));
  }
}

function toPostResult(row: PostRow): PostResult {
  return {
    id: row.id,
    title: row.title,
    excerpt:
      row.body.length > EXCERPT_LENGTH
        ? `${row.body.slice(0, EXCERPT_LENGTH).trimEnd()}…`
        : row.body,
    mood: row.mood,
    intent: row.intent,
    categorySlug: row.category_slug,
    // An anonymous post shows its per-post code and never the author's alias.
    // The code is random per post (E04-T04), so two anonymous results cannot
    // be tied back to one account (E13-T03).
    authorAlias: row.anonymous_code
      ? `Anonymous #${row.anonymous_code}`
      : (row.author_alias ?? 'Seseorang'),
    isAnonymous: row.anonymous_code !== null,
    responseCount: row.response_count,
    createdAt: row.created_at,
  };
}

function encodeCursor(rank: number, id: string): string {
  return Buffer.from(`${rank}|${id}`).toString('base64url');
}

/**
 * Ranked cursor: relevance first, id to break ties.
 *
 * Rank alone is not unique — two posts matching the same single word usually
 * score identically — so paging on rank alone would loop on the same rows.
 * A malformed cursor restarts from the top rather than erroring, as elsewhere.
 */
function decodeCursor(cursor?: string): { rank: number; id: string } | null {
  if (!cursor) return null;

  try {
    const [rankPart, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!rankPart || !id || !UUID_PATTERN.test(id)) return null;

    const rank = Number.parseFloat(rankPart);
    return Number.isFinite(rank) ? { rank, id } : null;
  } catch {
    return null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
