import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { AnonymousIdentityService } from '../profiles/anonymous-identity.service.js';
import { ContentAnalyzerService } from '../safety/content-analyzer.service.js';
import {
  SupportResourcesService,
  type SupportiveIntervention,
} from '../safety/support-resources.service.js';
import { ListenerNudgeService } from '../listener/listener-nudge.service.js';
import { UsersService } from '../users/users.service.js';
import { CategoriesService } from './categories.service.js';
import type { CreatePostDto } from './posts.dto.js';

/**
 * A post as seen by a reader.
 *
 * `authorAlias` is either the user's alias or an anonymous per-post code. The
 * internal author id is never part of this shape — that is the whole point of
 * anonymous mode (PRD §4).
 */
export interface PostView {
  id: string;
  title: string | null;
  body: string;
  mood: string;
  intent: string;
  categorySlug: string;
  categoryName: string;
  authorAlias: string;
  isAnonymous: boolean;
  allowComments: boolean;
  responseCount: number;
  reactionCounts: Record<string, number>;
  commentCount: number;
  createdAt: Date;
  isOwn: boolean;
  /** Only ever set for the author's own held post. */
  status?: string;
}

export interface CreatePostResult {
  postId: string;
  status: 'published' | 'held';
  /** Present when the content triggered a supportive intervention (PRD §8). */
  intervention?: SupportiveIntervention;
  /** Set when personal data was detected and not yet acknowledged. */
  personalDataWarning?: string;
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly categories: CategoriesService,
    private readonly analyzer: ContentAnalyzerService,
    private readonly moderation: ModerationService,
    private readonly supportResources: SupportResourcesService,
    private readonly anonymousIdentities: AnonymousIdentityService,
    private readonly users: UsersService,
    private readonly rateLimit: RateLimitService,
    private readonly appConfig: AppConfigService,
    private readonly nudge: ListenerNudgeService,
  ) {}

  async create(userId: string, input: CreatePostDto): Promise<CreatePostResult> {
    const perDay = await this.appConfig.getNumber('rate_limit.post_per_day');

    // Content endpoints fail open when Redis is down: refusing every post
    // because a cache is unavailable punishes users for an operational
    // problem. Auth endpoints make the opposite choice.
    await this.rateLimit.enforce(
      { bucket: 'post:create', subject: userId, limit: perDay, windowSeconds: 86_400 },
      { failClosed: false },
    );

    const category = await this.categories.requireBySlug(input.categorySlug);
    const text = `${input.title ?? ''}\n${input.body}`;

    // Anti-doxxing warning happens before anything is written (PRD §15). It
    // informs rather than blocks — sharing your own number is your choice, and
    // the product's job is only to make sure you noticed.
    const personalData = this.analyzer.detectPersonalData(text);
    if (personalData.found && !input.acknowledgedPersonalDataWarning) {
      return { postId: '', status: 'held', personalDataWarning: personalData.warning };
    }

    const post = await this.prisma.curhatPost.create({
      data: {
        authorId: userId,
        categoryId: category.id,
        ...(input.title ? { title: input.title } : {}),
        body: input.body,
        mood: input.mood,
        intent: input.intent,
        anonymityMode: input.anonymityMode,
        allowComments: input.allowComments,
        requestListener: input.requestListener,
        status: 'pending_analysis',
        safetyLevel: 'pending',
      },
    });

    if (input.anonymityMode === 'anonymous') {
      await this.anonymousIdentities.createForPost(userId, post.id);
    }

    // One decision point for every piece of content. Two code paths that both
    // decide safety is how they end up disagreeing.
    const outcome = await this.analyzer.analyze({
      targetType: 'post',
      targetId: post.id,
      userId,
      text,
    });

    await this.prisma.curhatPost.update({
      where: { id: post.id },
      data: {
        status: outcome.status,
        safetyLevel: outcome.level,
        needsReanalysis: outcome.needsReanalysis,
        ...(outcome.status === 'published' ? { publishedAt: new Date() } : {}),
      },
    });

    await this.prisma.safetyEvent.create({
      data: {
        userId,
        targetType: 'post',
        targetId: post.id,
        level: outcome.level,
        actionTaken: outcome.usedFallback
          ? `fallback_${outcome.status}`
          : `classified_${outcome.status}`,
        ...(outcome.triggeredBy.length > 0
          ? { resourceShown: { signals: outcome.triggeredBy } }
          : {}),
      },
    });

    if (outcome.queue) {
      await this.moderation.openCase({
        source: outcome.usedFallback ? 'system' : 'ai',
        queue: outcome.queue,
        targetType: 'post',
        targetId: post.id,
      });
    }

    // Cold start (PRD §23): a post that explicitly asked for a listener is the
    // clearest "somebody is waiting" signal the product has. Held posts are
    // never nudged about — sending listeners to something under review would
    // hand them a page they cannot open.
    //
    // Only when the author asked. Nudging on every post would burn through the
    // per-listener daily cap on curhat nobody requested help with, and the cap
    // exists to protect listeners, not to ration a firehose.
    if (outcome.status === 'published' && input.requestListener) {
      await this.nudge
        .nudgeForWaitingRequester({
          sourceId: post.id,
          excludeUserId: userId,
          topic: category.slug,
        })
        .catch((error: unknown) => this.logger.warn('listener nudge failed', error));
    }

    return {
      postId: post.id,
      status: outcome.status,
      // Support resources are looked up per region and never include a stale
      // entry (PRD §15.2). No score and no level ever reach the client.
      ...(outcome.showIntervention
        ? { intervention: await this.supportResources.buildIntervention() }
        : {}),
    };
  }

  async findById(postId: string, viewerId: string): Promise<PostView> {
    const post = await this.prisma.curhatPost.findUnique({
      where: { id: postId },
      include: {
        category: { select: { slug: true, name: true } },
        anonymousIdentity: { select: { displayCode: true } },
        author: { select: { id: true, profile: { select: { alias: true } } } },
      },
    });

    if (!post || post.status === 'deleted') {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    const isOwn = post.authorId === viewerId;

    // A held post is visible only to its author, who sees "sedang ditinjau"
    // rather than silence (PRD §8). Everyone else gets a 404: telling a reader
    // that a post exists but is withheld is information they are not owed.
    if (!isOwn && post.status !== 'published') {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    if (!isOwn && (await this.users.isBlockedEitherWay(viewerId, post.authorId))) {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    const [reactions, commentCount] = await Promise.all([
      this.prisma.reaction.groupBy({
        by: ['type'],
        where: { targetType: 'post', targetId: postId },
        _count: { type: true },
      }),
      this.prisma.comment.count({ where: { postId, status: 'published' } }),
    ]);

    return {
      id: post.id,
      title: post.title,
      body: post.body,
      mood: post.mood,
      intent: post.intent,
      categorySlug: post.category.slug,
      categoryName: post.category.name,
      authorAlias: post.anonymousIdentity
        ? `Anonymous #${post.anonymousIdentity.displayCode}`
        : (post.author.profile?.alias ?? 'Seseorang'),
      isAnonymous: post.anonymousIdentity !== null,
      allowComments: post.allowComments,
      responseCount: post.responseCount,
      reactionCounts: Object.fromEntries(
        reactions.map((row) => [row.type, row._count.type]),
      ),
      commentCount,
      createdAt: post.createdAt,
      isOwn,
      ...(isOwn && post.status !== 'published' ? { status: post.status } : {}),
    };
  }

  /** Soft delete — moderation history must survive the author changing their mind. */
  async deleteOwn(postId: string, userId: string): Promise<void> {
    const post = await this.prisma.curhatPost.findUnique({
      where: { id: postId },
      select: { authorId: true, status: true },
    });

    if (!post || post.status === 'deleted') {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    if (post.authorId !== userId) {
      throw ApiException.forbidden('FORBIDDEN', 'Ini bukan curhat kamu.');
    }

    await this.prisma.curhatPost.update({
      where: { id: postId },
      data: { status: 'deleted', deletedAt: new Date() },
    });
  }

  async setAllowComments(postId: string, userId: string, allowComments: boolean): Promise<void> {
    const post = await this.prisma.curhatPost.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) {
      throw ApiException.notFound('NOT_FOUND', 'Curhat itu nggak ada atau sudah dihapus.');
    }

    if (post.authorId !== userId) {
      throw ApiException.forbidden('FORBIDDEN', 'Ini bukan curhat kamu.');
    }

    // Existing comments stay: locking stops new replies, it does not erase the
    // people who already responded.
    await this.prisma.curhatPost.update({ where: { id: postId }, data: { allowComments } });
  }
}
