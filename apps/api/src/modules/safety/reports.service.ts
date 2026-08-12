import { Inject, Injectable } from '@nestjs/common';
import type {
  ModerationQueue,
  PrismaClient,
  ReportCategory,
  SafetyTarget,
} from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { RateLimitService } from '../../common/rate-limit.service.js';

/**
 * Report priority — PRD §15 ("Urgent report = priority").
 *
 * Threats and dangerous content go straight to Critical because the cost of
 * being slow is not the same across categories: spam that waits two days is an
 * annoyance, a credible threat that waits two days is a different kind of
 * failure entirely.
 */
const CATEGORY_PRIORITY: Readonly<Record<ReportCategory, ModerationQueue>> = {
  threat: 'critical',
  dangerous_content: 'critical',
  sexual: 'high',
  doxxing: 'high',
  harassment: 'high',
  hate: 'high',
  bullying: 'medium',
  scam: 'medium',
  spam: 'low',
  other: 'low',
};

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly rateLimit: RateLimitService,
    private readonly appConfig: AppConfigService,
  ) {}

  async submit(input: {
    reporterId: string;
    targetType: SafetyTarget;
    targetId: string;
    category: ReportCategory;
    note?: string | undefined;
  }): Promise<{ status: 'received' }> {
    const perDay = await this.appConfig.getNumber('rate_limit.report_per_day');

    await this.rateLimit.enforce(
      {
        bucket: 'report:create',
        subject: input.reporterId,
        limit: perDay,
        windowSeconds: 86_400,
      },
      { failClosed: false },
    );

    await this.assertTargetExists(input.targetType, input.targetId);

    const priority = CATEGORY_PRIORITY[input.category];

    // Repeat reports on the same target raise the weight of the existing case
    // rather than opening duplicates — ten reports about one post is one
    // problem, not ten.
    const existingCase = await this.prisma.moderationCase.findFirst({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
        status: { in: ['open', 'in_review'] },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const moderationCase = existingCase
        ? await tx.moderationCase.update({
            where: { id: existingCase.id },
            data: {
              reportCount: { increment: 1 },
              // A case only ever escalates. A later spam report must not
              // downgrade a case opened for a threat.
              ...(this.isHigherPriority(priority, existingCase.queue)
                ? { queue: priority, slaDueAt: await this.slaDueAt(priority) }
                : {}),
            },
          })
        : await tx.moderationCase.create({
            data: {
              source: 'report',
              queue: priority,
              targetType: input.targetType,
              targetId: input.targetId,
              reportCount: 1,
              slaDueAt: await this.slaDueAt(priority),
            },
          });

      await tx.report.create({
        data: {
          reporterId: input.reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          category: input.category,
          ...(input.note ? { note: input.note } : {}),
          priority,
          caseId: moderationCase.id,
        },
      });
    });

    // Deliberately uniform: the reporter is never told what happened to the
    // target. Confirming an outcome would let reports be used to probe whether
    // someone has been actioned.
    return { status: 'received' };
  }

  private isHigherPriority(next: ModerationQueue, current: ModerationQueue): boolean {
    const rank: Record<ModerationQueue, number> = { critical: 3, high: 2, medium: 1, low: 0 };
    return rank[next] > rank[current];
  }

  /**
   * SLA deadline — PRD §15.3.
   *
   * The night window (21:00–04:00) is slightly wider, not waived: peak usage
   * here is at night, so the quietest moderator hours are the busiest crisis
   * hours.
   */
  private async slaDueAt(queue: ModerationQueue, now: Date = new Date()): Promise<Date> {
    const hour = now.getHours();
    const nightStart = await this.appConfig.getNumber('moderation.night_window_start');
    const nightEnd = await this.appConfig.getNumber('moderation.night_window_end');
    const isNight = hour >= nightStart || hour < nightEnd;

    const key =
      queue === 'critical'
        ? isNight
          ? 'moderation.sla_minutes.critical_night'
          : 'moderation.sla_minutes.critical_day'
        : queue === 'high'
          ? isNight
            ? 'moderation.sla_minutes.high_night'
            : 'moderation.sla_minutes.high_day'
          : queue === 'medium'
            ? 'moderation.sla_minutes.medium'
            : 'moderation.sla_minutes.low';

    const minutes = await this.appConfig.getNumber(key);
    return new Date(now.getTime() + minutes * 60_000);
  }

  private async assertTargetExists(targetType: SafetyTarget, targetId: string): Promise<void> {
    const exists = await (async () => {
      switch (targetType) {
        case 'post':
          return this.prisma.curhatPost.findUnique({ where: { id: targetId }, select: { id: true } });
        case 'comment':
          return this.prisma.comment.findUnique({ where: { id: targetId }, select: { id: true } });
        case 'message':
          return this.prisma.message.findUnique({ where: { id: targetId }, select: { id: true } });
        case 'user':
          return this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        default:
          return null;
      }
    })();

    if (!exists) {
      throw ApiException.notFound('NOT_FOUND', 'Yang kamu laporkan nggak ditemukan.');
    }
  }
}
