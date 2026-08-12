import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ModerationActionType,
  ModerationQueue,
  PrismaClient,
  SafetyTarget,
} from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { SessionService } from '../auth/session.service.js';

/**
 * Which actions a user may contest — PRD §15.4.
 *
 * `approve` and `escalate` are not punitive, so there is nothing to appeal.
 * Level 3 never produces a punitive action at all, so nothing from the crisis
 * path can end up here.
 */
const APPEALABLE: ReadonlySet<ModerationActionType> = new Set([
  'remove',
  'warn',
  'mute',
  'suspend',
  'ban',
]);

export interface ApplyActionInput {
  caseId: string;
  moderatorId: string;
  targetUserId: string;
  action: ModerationActionType;
  reason: string;
  durationHours?: number;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Computes an SLA deadline — PRD §15.3.
   *
   * The night window is only slightly wider, not waived. Peak usage here is at
   * night, so the quietest moderator hours are the busiest crisis hours;
   * meeting this needs an on-call rota, not a longer number.
   */
  async slaDueAt(queue: ModerationQueue, now: Date = new Date()): Promise<Date> {
    const nightStart = await this.appConfig.getNumber('moderation.night_window_start');
    const nightEnd = await this.appConfig.getNumber('moderation.night_window_end');
    const hour = now.getHours();
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

    return new Date(now.getTime() + (await this.appConfig.getNumber(key)) * 60_000);
  }

  async openCase(input: {
    source: 'ai' | 'report' | 'system' | 'listener_escalate';
    queue: ModerationQueue;
    targetType: SafetyTarget;
    targetId: string;
  }): Promise<string> {
    // Deduplicated: repeat signals about one target raise the weight of the
    // open case instead of splitting the picture across several.
    const existing = await this.prisma.moderationCase.findFirst({
      where: {
        targetType: input.targetType,
        targetId: input.targetId,
        status: { in: ['open', 'in_review'] },
      },
    });

    if (existing) {
      const rank: Record<ModerationQueue, number> = { critical: 3, high: 2, medium: 1, low: 0 };
      const escalate = rank[input.queue] > rank[existing.queue];

      await this.prisma.moderationCase.update({
        where: { id: existing.id },
        data: {
          reportCount: { increment: 1 },
          ...(escalate
            ? { queue: input.queue, slaDueAt: await this.slaDueAt(input.queue) }
            : {}),
        },
      });

      return existing.id;
    }

    const created = await this.prisma.moderationCase.create({
      data: {
        source: input.source,
        queue: input.queue,
        targetType: input.targetType,
        targetId: input.targetId,
        slaDueAt: await this.slaDueAt(input.queue),
      },
    });

    return created.id;
  }

  /**
   * Applies a moderation decision — PRD §15.
   *
   * Every action carries a mandatory reason and produces an audit log entry.
   * An action nobody can explain cannot be reviewed on appeal, which makes the
   * appeal meaningless.
   */
  async applyAction(input: ApplyActionInput): Promise<{ actionId: string; appealable: boolean }> {
    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id: input.caseId },
      select: { id: true, status: true },
    });

    if (!moderationCase) {
      throw ApiException.notFound('NOT_FOUND', 'Case tidak ditemukan.');
    }

    if (!input.reason.trim()) {
      throw ApiException.badRequest('VALIDATION_ERROR', 'Alasan wajib diisi.');
    }

    const appealable = APPEALABLE.has(input.action);

    const action = await this.prisma.$transaction(async (tx) => {
      const created = await tx.moderationAction.create({
        data: {
          caseId: input.caseId,
          moderatorId: input.moderatorId,
          targetUserId: input.targetUserId,
          action: input.action,
          reason: input.reason,
          ...(input.durationHours ? { durationHours: input.durationHours } : {}),
          isAppealable: appealable,
        },
      });

      await this.applyEffect(tx, input);

      await tx.moderationCase.update({
        where: { id: input.caseId },
        data: {
          status: input.action === 'escalate' ? 'escalated' : 'resolved',
          resolvedAt: new Date(),
        },
      });

      // PRD §25.6: every moderation decision is auditable.
      await tx.auditLog.create({
        data: {
          actorId: input.moderatorId,
          action: `moderation.${input.action}`,
          targetType: 'user',
          targetId: input.targetUserId,
          diff: { action: input.action, reason: input.reason, caseId: input.caseId },
          caseId: input.caseId,
        },
      });

      return created;
    });

    // Suspension and ban must take effect now, not when the token happens to
    // expire.
    if (input.action === 'suspend' || input.action === 'ban') {
      await this.sessions.revokeAllForUser(input.targetUserId);
    }

    this.logger.warn(
      `moderation ${input.action} applied to user ${input.targetUserId} (case ${input.caseId})`,
    );

    return { actionId: action.id, appealable };
  }

  private async applyEffect(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    input: ApplyActionInput,
  ): Promise<void> {
    switch (input.action) {
      case 'remove': {
        const model = await this.resolveContentModel(tx, input.caseId);
        if (model === 'post') {
          await tx.curhatPost.updateMany({
            where: { id: await this.caseTargetId(tx, input.caseId) },
            data: { status: 'removed' },
          });
        } else if (model === 'comment') {
          await tx.comment.updateMany({
            where: { id: await this.caseTargetId(tx, input.caseId) },
            data: { status: 'removed' },
          });
        }
        break;
      }
      case 'mute':
        await tx.user.update({ where: { id: input.targetUserId }, data: { status: 'muted' } });
        break;
      case 'suspend':
        await tx.user.update({ where: { id: input.targetUserId }, data: { status: 'suspended' } });
        break;
      case 'ban':
        await tx.user.update({ where: { id: input.targetUserId }, data: { status: 'banned' } });
        break;
      case 'approve':
      case 'warn':
      case 'escalate':
        // A warning is recorded and shown to the user; it changes no state.
        break;
    }
  }

  private async caseTargetId(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    caseId: string,
  ): Promise<string> {
    const found = await tx.moderationCase.findUniqueOrThrow({
      where: { id: caseId },
      select: { targetId: true },
    });
    return found.targetId;
  }

  private async resolveContentModel(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    caseId: string,
  ): Promise<SafetyTarget> {
    const found = await tx.moderationCase.findUniqueOrThrow({
      where: { id: caseId },
      select: { targetType: true },
    });
    return found.targetType;
  }

  /** Actions taken against a user, with their appeal status (PRD §15.4). */
  async actionsAgainst(userId: string) {
    const actions = await this.prisma.moderationAction.findMany({
      where: { targetUserId: userId, action: { not: 'approve' } },
      orderBy: { createdAt: 'desc' },
      include: { appeal: { select: { id: true, status: true, decidedAt: true } } },
    });

    const windowDays = await this.appConfig.getNumber('appeal.window_days');

    return actions.map((action) => {
      const deadline = new Date(action.createdAt.getTime() + windowDays * 86_400_000);

      return {
        actionId: action.id,
        action: action.action,
        reason: action.reason,
        durationHours: action.durationHours,
        createdAt: action.createdAt,
        // Never the moderator's identity — that would invite retaliation.
        appealable: action.isAppealable && !action.appealed && deadline > new Date(),
        appealDeadline: action.isAppealable ? deadline : null,
        appeal: action.appeal,
      };
    });
  }
}
