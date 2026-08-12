import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppealStatus, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';

/**
 * Moderation appeals — PRD §15.4, TECH-SPEC BAGIAN 19.
 *
 * v1.0 of the PRD had seven punitive actions and no way to contest any of them.
 * A platform that removes content and bans accounts needs a correction path;
 * without one, every classifier mistake is permanent.
 *
 * The rule that matters most: an appeal is never reviewed by the moderator who
 * made the decision. It is enforced here, and again by a CHECK constraint in
 * the database, because it is a fairness guarantee rather than a UI convention.
 */
@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
  ) {}

  async submit(userId: string, actionId: string, reason: string): Promise<{ appealId: string }> {
    const action = await this.prisma.moderationAction.findUnique({
      where: { id: actionId },
      select: {
        id: true,
        targetUserId: true,
        moderatorId: true,
        isAppealable: true,
        appealed: true,
        createdAt: true,
      },
    });

    if (!action || action.targetUserId !== userId) {
      throw ApiException.notFound('NOT_FOUND', 'Tindakan itu nggak ditemukan.');
    }

    if (!action.isAppealable) {
      throw ApiException.badRequest(
        'APPEAL_ACTION_NOT_APPEALABLE',
        'Tindakan ini nggak bisa dibanding.',
      );
    }

    if (action.appealed) {
      throw ApiException.conflict(
        'APPEAL_ALREADY_SUBMITTED',
        'Kamu sudah pernah mengajukan banding untuk tindakan ini.',
      );
    }

    const windowDays = await this.appConfig.getNumber('appeal.window_days');
    const deadline = new Date(action.createdAt.getTime() + windowDays * 86_400_000);

    if (deadline < new Date()) {
      throw ApiException.badRequest(
        'APPEAL_WINDOW_EXPIRED',
        `Masa banding sudah lewat (${windowDays} hari).`,
      );
    }

    const appeal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.moderationAppeal.create({
        data: {
          actionId,
          userId,
          reason,
          // Copied so the "reviewer must differ" rule can be a database
          // constraint — a CHECK cannot read another table.
          deciderId: action.moderatorId,
          expiresAt: deadline,
        },
      });

      await tx.moderationAction.update({ where: { id: actionId }, data: { appealed: true } });

      return created;
    });

    return { appealId: appeal.id };
  }

  async statusFor(userId: string, appealId: string) {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: appealId },
      include: { action: { select: { action: true, reason: true } } },
    });

    if (!appeal || appeal.userId !== userId) {
      throw ApiException.notFound('NOT_FOUND', 'Banding itu nggak ditemukan.');
    }

    const slaDays = await this.appConfig.getNumber('appeal.sla_days');

    return {
      appealId: appeal.id,
      status: appeal.status,
      submittedAt: appeal.createdAt,
      decidedAt: appeal.decidedAt,
      // Human wording, not a status code (PRD §15.4).
      message: this.humanMessage(appeal.status, appeal.decisionNote),
      expectedBy: new Date(appeal.createdAt.getTime() + slaDays * 86_400_000),
      action: appeal.action,
    };
  }

  /**
   * The queue a given reviewer may act on.
   *
   * Appeals against that reviewer's own decisions are filtered out by the
   * query, so the separation is enforced by the system rather than left to the
   * reviewer's discretion.
   */
  async queueFor(reviewerId: string, isSuperAdmin: boolean) {
    const appeals = await this.prisma.moderationAppeal.findMany({
      where: {
        status: { in: ['pending', 'under_review'] },
        // A Super Admin is the escalation path when no other reviewer exists,
        // and may see everything — including, unavoidably, their own. That is
        // a staffing limit, not a loophole, and it stays visible in the audit
        // log.
        ...(isSuperAdmin ? {} : { deciderId: { not: reviewerId } }),
      },
      orderBy: { createdAt: 'asc' },
      include: { action: { select: { action: true, reason: true, createdAt: true } } },
    });

    const slaDays = await this.appConfig.getNumber('appeal.sla_days');

    return appeals.map((appeal) => ({
      appealId: appeal.id,
      reason: appeal.reason,
      status: appeal.status,
      submittedAt: appeal.createdAt,
      slaDueAt: new Date(appeal.createdAt.getTime() + slaDays * 86_400_000),
      originalAction: appeal.action,
    }));
  }

  /**
   * Decides an appeal.
   *
   * `overturned` restores the content or the account; `reduced` shortens the
   * penalty; `upheld` leaves it. All three are audited and reported to the
   * user in plain language.
   */
  async decide(input: {
    appealId: string;
    reviewerId: string;
    status: Extract<AppealStatus, 'upheld' | 'overturned' | 'reduced'>;
    note: string;
    reducedDurationHours?: number;
  }): Promise<void> {
    const appeal = await this.prisma.moderationAppeal.findUnique({
      where: { id: input.appealId },
      include: { action: true },
    });

    if (!appeal) {
      throw ApiException.notFound('NOT_FOUND', 'Banding itu nggak ditemukan.');
    }

    if (appeal.decidedAt) {
      throw ApiException.conflict('CONFLICT', 'Banding itu sudah diputus.');
    }

    if (appeal.deciderId === input.reviewerId) {
      throw ApiException.forbidden(
        'APPEAL_REVIEWER_CONFLICT',
        'Banding atas keputusanmu sendiri harus ditinjau orang lain.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.moderationAppeal.update({
        where: { id: input.appealId },
        data: {
          status: input.status,
          reviewerId: input.reviewerId,
          decidedAt: new Date(),
          decisionNote: input.note,
        },
      });

      if (input.status === 'overturned') {
        await this.restore(tx, appeal.action.targetUserId, appeal.action.action, appeal.action.caseId);
      }

      if (input.status === 'reduced' && input.reducedDurationHours !== undefined) {
        await tx.moderationAction.update({
          where: { id: appeal.actionId },
          data: { durationHours: input.reducedDurationHours },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: input.reviewerId,
          action: `appeal.${input.status}`,
          targetType: 'moderation_appeal',
          targetId: input.appealId,
          diff: { status: input.status, note: input.note },
        },
      });
    });

    this.logger.warn(`appeal ${input.appealId} ${input.status} by reviewer ${input.reviewerId}`);
  }

  private async restore(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    targetUserId: string,
    action: string,
    caseId: string,
  ): Promise<void> {
    if (action === 'mute' || action === 'suspend' || action === 'ban') {
      await tx.user.update({ where: { id: targetUserId }, data: { status: 'active' } });
    }

    if (action === 'remove') {
      const moderationCase = await tx.moderationCase.findUnique({
        where: { id: caseId },
        select: { targetType: true, targetId: true },
      });

      if (moderationCase?.targetType === 'post') {
        await tx.curhatPost.updateMany({
          where: { id: moderationCase.targetId },
          data: { status: 'published' },
        });
      } else if (moderationCase?.targetType === 'comment') {
        await tx.comment.updateMany({
          where: { id: moderationCase.targetId },
          data: { status: 'published' },
        });
      }
    }
  }

  /**
   * Overturn rate per risk category.
   *
   * A category that is overturned often means the threshold is wrong, not that
   * users are wrong. This is the input to threshold calibration in
   * `/admin/ai-config` (PRD §15.4).
   */
  async overturnRates(): Promise<Array<{ action: string; total: number; overturned: number; rate: number }>> {
    const appeals = await this.prisma.moderationAppeal.findMany({
      where: { decidedAt: { not: null } },
      include: { action: { select: { action: true } } },
    });

    const byAction = new Map<string, { total: number; overturned: number }>();

    for (const appeal of appeals) {
      const key = appeal.action.action;
      const entry = byAction.get(key) ?? { total: 0, overturned: 0 };
      entry.total += 1;
      if (appeal.status === 'overturned') entry.overturned += 1;
      byAction.set(key, entry);
    }

    return [...byAction.entries()].map(([action, counts]) => ({
      action,
      total: counts.total,
      overturned: counts.overturned,
      rate: counts.total === 0 ? 0 : counts.overturned / counts.total,
    }));
  }

  private humanMessage(status: AppealStatus, note: string | null): string {
    switch (status) {
      case 'pending':
      case 'under_review':
        return 'Bandingmu sedang kami tinjau. Kami kabari secepatnya ya.';
      case 'overturned':
        return `Setelah ditinjau ulang, kami keliru. Tindakannya sudah kami batalkan.${
          note ? ` ${note}` : ''
        }`;
      case 'reduced':
        return `Setelah ditinjau ulang, tindakannya kami peringan.${note ? ` ${note}` : ''}`;
      case 'upheld':
        return `Setelah ditinjau orang yang berbeda, tindakannya tetap berlaku.${
          note ? ` ${note}` : ''
        }`;
    }
  }
}
