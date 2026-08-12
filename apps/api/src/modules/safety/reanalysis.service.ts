import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';
import { ContentAnalyzerService } from './content-analyzer.service.js';
import { ModerationService } from '../moderation/moderation.service.js';

export interface ReanalysisReport {
  examined: number;
  reclassified: number;
  nowHeld: number;
  stillPending: number;
}

/**
 * Re-analysis of content classified while the AI was unavailable —
 * TECH-SPEC §4.2, E07-T03.
 *
 * Everything published during an outage carries `needsReanalysis = true`. This
 * is what settles that debt. Without it, an outage would leave a permanent band
 * of never-classified content and nobody would know which posts were affected.
 *
 * Runs as a repeatable BullMQ job in the worker (E17). Exposed as a service so
 * it can be triggered from admin and driven directly by tests.
 */
@Injectable()
export class ReanalysisService {
  private readonly logger = new Logger(ReanalysisService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly analyzer: ContentAnalyzerService,
    private readonly moderation: ModerationService,
  ) {}

  async runBatch(limit = 50): Promise<ReanalysisReport> {
    const pending = await this.prisma.curhatPost.findMany({
      where: { needsReanalysis: true, status: { in: ['published', 'held'] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, authorId: true, title: true, body: true, status: true },
    });

    const report: ReanalysisReport = {
      examined: pending.length,
      reclassified: 0,
      nowHeld: 0,
      stillPending: 0,
    };

    for (const post of pending) {
      const outcome = await this.analyzer.analyze({
        targetType: 'post',
        targetId: post.id,
        userId: post.authorId,
        text: `${post.title ?? ''}\n${post.body}`,
      });

      if (outcome.usedFallback) {
        // The classifier is still unavailable. Leave the flag set and try
        // again later rather than treating a second failure as a verdict.
        report.stillPending += 1;
        continue;
      }

      await this.prisma.curhatPost.update({
        where: { id: post.id },
        data: {
          status: outcome.status,
          safetyLevel: outcome.level,
          needsReanalysis: false,
          ...(outcome.status === 'published' && post.status !== 'published'
            ? { publishedAt: new Date() }
            : {}),
        },
      });

      report.reclassified += 1;

      if (outcome.status === 'held') {
        report.nowHeld += 1;

        await this.moderation.openCase({
          source: 'ai',
          queue: outcome.queue ?? 'high',
          targetType: 'post',
          targetId: post.id,
        });

        await this.prisma.safetyEvent.create({
          data: {
            userId: post.authorId,
            targetType: 'post',
            targetId: post.id,
            level: outcome.level,
            actionTaken: 'held_on_reanalysis',
          },
        });
      }
    }

    if (report.examined > 0) {
      this.logger.log(
        `re-analysis: examined=${report.examined} reclassified=${report.reclassified} ` +
          `nowHeld=${report.nowHeld} stillPending=${report.stillPending}`,
      );
    }

    return report;
  }

  /**
   * How much unclassified content is outstanding.
   *
   * Surfaced on the admin dashboard: a backlog that only grows means the
   * classifier has been down longer than anyone noticed.
   */
  async backlog(): Promise<{ posts: number; oldest: Date | null }> {
    const [posts, oldest] = await Promise.all([
      this.prisma.curhatPost.count({ where: { needsReanalysis: true } }),
      this.prisma.curhatPost.findFirst({
        where: { needsReanalysis: true },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    return { posts, oldest: oldest?.createdAt ?? null };
  }
}
