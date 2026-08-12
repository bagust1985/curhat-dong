import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';

export interface TrustFactors {
  accountAgeDays: number;
  publishedPosts: number;
  helpfulMarks: number;
  reportsAgainst: number;
  moderationActions: number;
  blocksReceived: number;
  heldContent: number;
}

/**
 * Internal trust score — PRD §15, CLAUDE.md non-negotiable #4.
 *
 * Used for adaptive rate limits and Turnstile triggers. Never for ranking
 * content or people: this product has no leaderboard, and a hidden score that
 * decided whose curhat gets seen would be one in everything but name.
 *
 * The score never leaves the server. `trust_scores` is a separate table from
 * `user_profiles` precisely so it cannot be selected by accident.
 */
@Injectable()
export class TrustScoreService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Recomputes from scratch rather than incrementally.
   *
   * Cheap enough at MVP scale, and it means a scoring bug is fixed by rerunning
   * the job instead of by unpicking a drifted counter.
   */
  async recompute(userId: string): Promise<{ score: number; factors: TrustFactors }> {
    const [user, publishedPosts, helpfulMarks, reportsAgainst, actions, blocksReceived, heldContent] =
      await Promise.all([
        this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { createdAt: true },
        }),
        this.prisma.curhatPost.count({ where: { authorId: userId, status: 'published' } }),
        this.prisma.comment.count({ where: { authorId: userId, isMarkedHelpful: true } }),
        this.prisma.report.count({ where: { targetType: 'user', targetId: userId } }),
        this.prisma.moderationAction.count({
          where: { targetUserId: userId, action: { in: ['warn', 'mute', 'suspend', 'ban'] } },
        }),
        this.prisma.blockedUser.count({ where: { blockedId: userId } }),
        this.prisma.curhatPost.count({ where: { authorId: userId, status: 'held' } }),
      ]);

    const factors: TrustFactors = {
      accountAgeDays: Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000),
      publishedPosts,
      helpfulMarks,
      reportsAgainst,
      moderationActions: actions,
      blocksReceived,
      heldContent,
    };

    const score = this.calculate(factors);

    await this.prisma.trustScore.upsert({
      where: { userId },
      update: { score, factors: { ...factors }, computedAt: new Date() },
      create: { userId, score, factors: { ...factors } },
    });

    return { score, factors };
  }

  /**
   * Scores 0–100, starting at a neutral 50.
   *
   * Positive signals are capped so an established account cannot buy immunity
   * with volume. Held content is weighted lightly: a post held for review is
   * often someone in distress, and holding that against them would penalise
   * exactly the people the product exists for.
   */
  calculate(factors: TrustFactors): number {
    let score = 50;

    score += Math.min(15, Math.floor(factors.accountAgeDays / 7) * 2);
    score += Math.min(15, factors.publishedPosts);
    score += Math.min(20, factors.helpfulMarks * 3);

    score -= Math.min(25, factors.reportsAgainst * 3);
    score -= Math.min(30, factors.moderationActions * 10);
    score -= Math.min(15, factors.blocksReceived * 2);
    score -= Math.min(5, factors.heldContent);

    return Math.max(0, Math.min(100, score));
  }

  async scoreFor(userId: string): Promise<number> {
    const row = await this.prisma.trustScore.findUnique({
      where: { userId },
      select: { score: true },
    });
    return row?.score ?? 50;
  }

  /**
   * Rate-limit multiplier derived from trust.
   *
   * A low score tightens limits rather than blocking outright — a wrong score
   * should slow someone down, not lock them out of a product they may need.
   */
  async rateLimitMultiplier(userId: string): Promise<number> {
    const score = await this.scoreFor(userId);
    if (score >= 70) return 1.5;
    if (score >= 40) return 1;
    if (score >= 20) return 0.5;
    return 0.25;
  }

  /** Whether this account should be challenged (TECH-SPEC §7.3). */
  async requiresChallenge(userId: string): Promise<boolean> {
    return (await this.scoreFor(userId)) < 25;
  }
}
