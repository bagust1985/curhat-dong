import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppealStatus, PrismaClient } from '@curhat/database';
import type { AdminRole } from '@curhat/types';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { AppealsService } from '../moderation/appeals.service.js';
import { NotificationFanoutService } from '../notifications/notification-fanout.service.js';
import { AuditService } from './audit.service.js';

export interface AppealDetail {
  appealId: string;
  status: AppealStatus;
  /** The user's own words. Their appeal, so their text is the point. */
  reason: string;
  submittedAt: Date;
  slaDueAt: Date;
  expiresAt: Date;

  originalAction: {
    actionId: string;
    action: string;
    /** The moderator's stated reason — what the reviewer is checking. */
    reason: string;
    durationHours: number | null;
    decidedAt: Date;
  };

  /** Public content the action was about; null when private (E14-T04). */
  content: string | null;
  requiresPrivateAccess: boolean;

  /**
   * True when this reviewer decided the original action.
   *
   * Should never be true for a moderator — the queue excludes those. Carried so
   * the panel can explain why a Super Admin is seeing one anyway.
   */
  isOwnDecision: boolean;
}

export interface OverturnRateRow {
  action: string;
  total: number;
  overturned: number;
  rate: number;
  /**
   * Deep link into AI config for calibration.
   *
   * PRD §15.4: a category overturned often means the threshold is wrong, not
   * that users are wrong. The link exists so that reading is one click from
   * acting on it rather than a note somebody writes down and forgets.
   */
  calibrationLink: string;
}

/**
 * Appeal review — E14-T07. PRD §15.4, TECH-SPEC §19.3, DESIGN-REF §3.13.
 *
 * The fairness rule — an appeal is never reviewed by the person whose decision
 * it contests — is enforced at three layers, and this is the outermost one:
 *
 *  1. the database has a CHECK constraint that `reviewer_id <> decider_id`
 *     (E02-T06), so the row cannot exist;
 *  2. `AppealsService.decide` refuses it (E07-T12);
 *  3. the queue query *hides* it, which is this file's contribution.
 *
 * Layer 3 matters because the first two produce an error at the end of the
 * work. Hiding it means the moderator never opens the case, never forms a view,
 * and never has to set one aside. Relying on their honesty is not the same as
 * relying on the system.
 */
@Injectable()
export class AppealReviewService {
  private readonly logger = new Logger(AppealReviewService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appeals: AppealsService,
    private readonly notifications: NotificationFanoutService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * The reviewer's queue.
   *
   * Delegates the filtering to `AppealsService.queueFor`, which is also what
   * the fairness test exercises — two implementations of "hide my own
   * decisions" would eventually disagree.
   */
  async queue(reviewerId: string, role: AdminRole) {
    return this.appeals.queueFor(reviewerId, role === 'super_admin');
  }

  /**
   * Appeals that no moderator other than the decider could review.
   *
   * PRD §15.4 requires these to escalate to Super Admin rather than sit
   * forever. "No other reviewer exists" is a staffing fact, so it is computed
   * from the number of active moderators rather than configured — a count that
   * drifts out of date would strand appeals silently.
   */
  async needingSuperAdmin(): Promise<string[]> {
    const moderatorCount = await this.prisma.user.count({
      where: { adminRole: 'moderator', status: 'active' },
    });

    // With two or more moderators there is always somebody else to review.
    if (moderatorCount > 1) return [];

    const stranded = await this.prisma.moderationAppeal.findMany({
      where: { status: { in: ['pending', 'under_review'] } },
      select: { id: true },
    });

    return stranded.map((appeal) => appeal.id);
  }

  async detail(appealId: string, reviewerId: string): Promise<AppealDetail> {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: appealId },
      include: {
        action: {
          select: {
            id: true,
            action: true,
            reason: true,
            durationHours: true,
            createdAt: true,
            caseId: true,
          },
        },
      },
    });

    if (!appeal) {
      throw ApiException.notFound('NOT_FOUND', 'Banding itu nggak ditemukan.');
    }

    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id: appeal.action.caseId },
      select: { targetType: true, targetId: true },
    });

    const slaDays = await this.appConfig.getNumber('appeal.sla_days');

    await this.audit.record({
      actorId: reviewerId,
      action: 'admin.appeal.viewed',
      targetType: 'moderation_appeal',
      targetId: appealId,
      caseId: appeal.action.caseId,
    });

    return {
      appealId: appeal.id,
      status: appeal.status,
      reason: appeal.reason,
      submittedAt: appeal.createdAt,
      slaDueAt: new Date(appeal.createdAt.getTime() + slaDays * 86_400_000),
      expiresAt: appeal.expiresAt,
      originalAction: {
        actionId: appeal.action.id,
        action: appeal.action.action,
        reason: appeal.action.reason,
        durationHours: appeal.action.durationHours,
        decidedAt: appeal.action.createdAt,
      },
      content: moderationCase
        ? await this.publicContent(moderationCase.targetType, moderationCase.targetId)
        : null,
      requiresPrivateAccess: moderationCase?.targetType === 'message',
      isOwnDecision: appeal.deciderId === reviewerId,
    };
  }

  /**
   * Records a decision and tells the user.
   *
   * `AppealsService.decide` does the state change, the restoration and the
   * audit entry. What is added here is the notification — PRD §15.4 requires
   * the outcome to reach the user in human language, and an appeal decided in
   * silence is indistinguishable from one nobody read.
   */
  async decide(input: {
    appealId: string;
    reviewerId: string;
    status: Extract<AppealStatus, 'upheld' | 'overturned' | 'reduced'>;
    note: string;
    reducedDurationHours?: number | undefined;
  }): Promise<{ status: AppealStatus }> {
    const note = input.note.trim();

    if (note.length < 10) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Keputusan banding wajib punya alasan yang bisa dibaca user.',
      );
    }

    if (input.status === 'reduced' && !input.reducedDurationHours) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Keputusan "dikurangi" wajib menyebut durasi barunya.',
      );
    }

    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: input.appealId },
      select: { userId: true, actionId: true },
    });

    if (!appeal) {
      throw ApiException.notFound('NOT_FOUND', 'Banding itu nggak ditemukan.');
    }

    await this.appeals.decide({
      appealId: input.appealId,
      reviewerId: input.reviewerId,
      status: input.status,
      note,
      ...(input.reducedDurationHours !== undefined
        ? { reducedDurationHours: input.reducedDurationHours }
        : {}),
    });

    await this.notifyOutcome(appeal.userId, appeal.actionId);

    return { status: input.status };
  }

  /**
   * Overturn rates, each linked to the threshold that produced them.
   *
   * This is the widget DESIGN-REF §3.13 asks for. The link is the point: a
   * number that says "we are wrong about scam 40% of the time" is only useful
   * if the next click is the place to fix it.
   */
  async overturnRates(): Promise<OverturnRateRow[]> {
    const rates = await this.appeals.overturnRates();

    return rates.map((row) => ({
      ...row,
      calibrationLink: `/ai-config?calibrate=${encodeURIComponent(row.action)}`,
    }));
  }

  /**
   * Never throws.
   *
   * The decision is already recorded and the account already restored; failing
   * the request now would invite the reviewer to decide again, and a second
   * `decide` on the same appeal is refused — leaving them convinced it did not
   * work.
   */
  private async notifyOutcome(userId: string, actionId: string): Promise<void> {
    try {
      await this.notifications.notify({
        userId,
        template: 'account.appeal_result',
        // Points at the same page the moderation action does, where the user
        // can read the decision note in full. The notification itself stays
        // generic (E12-T04).
        targetId: actionId,
        dedupeKey: `appeal_result:${actionId}`,
      });
    } catch (error) {
      this.logger.warn(`failed to notify appeal outcome for action ${actionId}`, error);
    }
  }

  private async publicContent(
    targetType: string,
    targetId: string,
  ): Promise<string | null> {
    if (targetType === 'post') {
      const post = await this.prisma.curhatPost.findUnique({
        where: { id: targetId },
        select: { title: true, body: true },
      });
      if (!post) return null;
      return post.title ? `${post.title}\n\n${post.body}` : post.body;
    }

    if (targetType === 'comment') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: targetId },
        select: { body: true },
      });
      return comment?.body ?? null;
    }

    return null;
  }
}
