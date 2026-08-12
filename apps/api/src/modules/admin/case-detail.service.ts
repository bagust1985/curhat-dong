import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ModerationActionType,
  ModerationQueue,
  PrismaClient,
  SafetyLevel,
  SafetyTarget,
} from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { NotificationFanoutService } from '../notifications/notification-fanout.service.js';
import { AuditService } from './audit.service.js';

export interface CaseDetail {
  caseId: string;
  queue: ModerationQueue;
  status: string;
  source: string;
  targetType: SafetyTarget;
  targetId: string;
  /** The account the case is about, when one can be determined. */
  targetUserId: string | null;
  reportCount: number;
  slaDueAt: Date;
  createdAt: Date;

  /** Public content in full; null for private targets (E14-T04). */
  content: string | null;
  requiresPrivateAccess: boolean;

  /** AI verdict for this target: level and per-category scores. */
  classification: {
    level: SafetyLevel;
    scores: Record<string, number>;
    model: string;
    promptVersion: string;
    /** True when a fallback provider or the local rules decided this. */
    fallbackUsed: boolean;
  } | null;

  /** The subject's safety history — levels and dates, never other content. */
  safetyHistory: Array<{ level: SafetyLevel; actionTaken: string | null; createdAt: Date }>;

  /** Reports filed against this target. Reporters are never named. */
  reports: Array<{ category: string; note: string | null; createdAt: Date }>;

  /** Actions already applied on this case. */
  actions: Array<{
    action: ModerationActionType;
    reason: string;
    createdAt: Date;
    appealed: boolean;
  }>;

  /** Internal only, never exposed to a public API (non-negotiable #4). */
  trustScore: number | null;
}

export interface ApplyActionRequest {
  caseId: string;
  moderatorId: string;
  action: ModerationActionType;
  reason: string;
  durationHours?: number | undefined;
}

/**
 * Actions that need a duration to mean anything.
 *
 * A mute with no end is a ban that nobody called a ban, and it would never
 * appear in a review of bans.
 */
const NEEDS_DURATION: ReadonlySet<ModerationActionType> = new Set(['mute', 'suspend']);

/** Minimum reason length. Enough to stop "ok" counting as an explanation. */
const MIN_REASON_LENGTH = 10;

/**
 * Case detail and the seven moderation actions — E14-T06. PRD §15.
 *
 * The domain logic already exists in `ModerationService` (E07-T10). This is the
 * admin-facing layer: assembling what a moderator needs to decide, refusing an
 * action that is not explained, restricting bulk work to the queue where it is
 * safe, and telling the user afterwards.
 *
 * What this deliberately does **not** offer is any way to punish someone for a
 * Level 3 signal (CLAUDE.md non-negotiable #2). There is no endpoint that takes
 * a safety level, and L3 never produces a punitive action in the first place —
 * so the UI has nothing to render even if somebody wanted to.
 */
@Injectable()
export class CaseDetailService {
  private readonly logger = new Logger(CaseDetailService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationFanoutService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
  ) {}

  async detail(caseId: string, adminId: string): Promise<CaseDetail> {
    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id: caseId },
      include: {
        reports: {
          orderBy: { createdAt: 'desc' },
          select: { category: true, note: true, createdAt: true },
        },
        actions: {
          orderBy: { createdAt: 'desc' },
          select: { action: true, reason: true, createdAt: true, appealed: true },
        },
      },
    });

    if (!moderationCase) {
      throw ApiException.notFound('NOT_FOUND', 'Case tidak ditemukan.');
    }

    const targetUserId = await this.resolveTargetUser(
      moderationCase.targetType,
      moderationCase.targetId,
    );

    const [content, classification, safetyHistory, trustScore] = await Promise.all([
      this.publicContent(moderationCase.targetType, moderationCase.targetId),
      this.classification(moderationCase.targetType, moderationCase.targetId),
      targetUserId ? this.safetyHistory(targetUserId) : Promise.resolve([]),
      targetUserId ? this.trustScore(targetUserId) : Promise.resolve(null),
    ]);

    // Opening a case detail is itself worth recording: it is the step before
    // every action, and "who looked at this" is a question incident reviews ask.
    await this.audit.record({
      actorId: adminId,
      action: 'admin.case.viewed',
      targetType: 'moderation_case',
      targetId: caseId,
      caseId,
    });

    return {
      caseId: moderationCase.id,
      queue: moderationCase.queue,
      status: moderationCase.status,
      source: moderationCase.source,
      targetType: moderationCase.targetType,
      targetId: moderationCase.targetId,
      targetUserId,
      reportCount: moderationCase.reportCount,
      slaDueAt: moderationCase.slaDueAt,
      createdAt: moderationCase.createdAt,
      content,
      requiresPrivateAccess: moderationCase.targetType === 'message',
      classification,
      safetyHistory,
      // Reporters are never named. Telling a moderator who reported whom
      // invites the question being passed on, and report is not a public act.
      reports: moderationCase.reports,
      actions: moderationCase.actions,
      trustScore,
    };
  }

  /**
   * Applies one action.
   *
   * The reason requirement is enforced here as a length, not just as
   * "non-empty": PRD §15.4 makes every punitive action appealable, and an
   * appeal reviewer reading "spam" cannot tell whether the original call was
   * right.
   */
  async apply(request: ApplyActionRequest): Promise<{ actionId: string; appealable: boolean }> {
    const reason = request.reason.trim();

    if (reason.length < MIN_REASON_LENGTH) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Alasan wajib diisi dan cukup jelas untuk ditinjau saat banding.',
      );
    }

    if (NEEDS_DURATION.has(request.action) && !request.durationHours) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Mute dan suspend wajib punya durasi.',
      );
    }

    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id: request.caseId },
      select: { targetType: true, targetId: true, status: true },
    });

    if (!moderationCase) {
      throw ApiException.notFound('NOT_FOUND', 'Case tidak ditemukan.');
    }

    const targetUserId = await this.resolveTargetUser(
      moderationCase.targetType,
      moderationCase.targetId,
    );

    if (!targetUserId) {
      throw ApiException.badRequest(
        'VALIDATION_ERROR',
        'Case ini tidak menunjuk ke akun mana pun.',
      );
    }

    const result = await this.moderation.applyAction({
      caseId: request.caseId,
      moderatorId: request.moderatorId,
      targetUserId,
      action: request.action,
      reason,
      ...(request.durationHours !== undefined ? { durationHours: request.durationHours } : {}),
    });

    await this.notifyTarget(targetUserId, result.actionId, request.action);

    return result;
  }

  /**
   * Bulk action, for the Low queue only.
   *
   * The restriction is in the task and the reason is worth stating: bulk is how
   * a hundred spam reports get cleared in one pass, and also how a hundred
   * accounts get suspended by a mis-click. In Low the worst case is a hundred
   * dismissed spam reports; in Critical it is a hundred people in crisis
   * handled without anyone reading a word.
   */
  async applyBulk(request: {
    caseIds: string[];
    moderatorId: string;
    action: Extract<ModerationActionType, 'approve' | 'remove'>;
    reason: string;
  }): Promise<{ applied: number; skipped: Array<{ caseId: string; reason: string }> }> {
    const cases = await this.prisma.moderationCase.findMany({
      where: { id: { in: request.caseIds } },
      select: { id: true, queue: true, status: true },
    });

    const skipped: Array<{ caseId: string; reason: string }> = [];
    let applied = 0;

    for (const caseId of request.caseIds) {
      const found = cases.find((row) => row.id === caseId);

      if (!found) {
        skipped.push({ caseId, reason: 'not_found' });
        continue;
      }
      if (found.queue !== 'low') {
        skipped.push({ caseId, reason: 'bulk_only_for_low_queue' });
        continue;
      }
      if (found.status === 'resolved') {
        skipped.push({ caseId, reason: 'already_resolved' });
        continue;
      }

      try {
        await this.apply({
          caseId,
          moderatorId: request.moderatorId,
          action: request.action,
          reason: request.reason,
        });
        applied += 1;
      } catch (error) {
        // One bad case must not abandon the rest half-done. The moderator gets
        // told exactly which ones did not go through.
        this.logger.warn(`bulk action failed for case ${caseId}`, error);
        skipped.push({ caseId, reason: 'failed' });
      }
    }

    await this.audit.record({
      actorId: request.moderatorId,
      action: 'admin.case.bulk_action',
      targetType: 'moderation_case',
      diff: { action: request.action, requested: request.caseIds.length, applied },
    });

    return { applied, skipped };
  }

  /**
   * Tells the user something happened to their account, and where to appeal.
   *
   * The notification is the catalogued generic one (E12-T04) — it names no
   * content and quotes no reason. The reason and the appeal button live behind
   * the deep link, on a page only that user can open. A push that summarised
   * the moderator's reasoning would put it on a lock screen.
   *
   * Never throws: an action that already took effect must not appear to fail
   * because a notification did.
   */
  private async notifyTarget(
    userId: string,
    actionId: string,
    action: ModerationActionType,
  ): Promise<void> {
    // `approve` means nothing happened to them. Telling somebody their curhat
    // was reviewed and cleared invites worry about a thing that is over.
    if (action === 'approve') return;

    try {
      await this.notifications.notify({
        userId,
        template: 'account.moderation_action',
        targetId: actionId,
        dedupeKey: `moderation_action:${actionId}`,
      });
    } catch (error) {
      this.logger.warn(`failed to notify user about action ${actionId}`, error);
    }
  }

  /** The account behind a target, whatever kind it is. */
  private async resolveTargetUser(
    targetType: SafetyTarget,
    targetId: string,
  ): Promise<string | null> {
    switch (targetType) {
      case 'user':
        return targetId;
      case 'post': {
        const post = await this.prisma.curhatPost.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        });
        return post?.authorId ?? null;
      }
      case 'comment': {
        const comment = await this.prisma.comment.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        });
        return comment?.authorId ?? null;
      }
      case 'message': {
        const message = await this.prisma.message.findUnique({
          where: { id: targetId },
          select: { senderId: true },
        });
        return message?.senderId ?? null;
      }
      case 'ai_message':
        // A DONG AI message has no other party to act against, and PRD §15.5
        // forbids punishing anyone for what they told the AI. Cases on this
        // target exist to surface a crisis, not to find someone to sanction.
        return null;
    }
  }

  /** Full text for public content. Private targets return null. */
  private async publicContent(
    targetType: SafetyTarget,
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

  /**
   * The AI verdict, with the prompt version that produced it.
   *
   * The version matters as much as the score: E08-T04 made prompts immutable
   * and versioned precisely so a threshold argument can distinguish "the model
   * was wrong" from "the instructions changed underneath us".
   *
   * `message` and `user` are not classification targets, so those return null
   * rather than querying for a row that cannot exist.
   */
  private async classification(targetType: SafetyTarget, targetId: string) {
    if (
      targetType !== 'post' &&
      targetType !== 'comment' &&
      targetType !== 'message' &&
      targetType !== 'ai_message'
    ) {
      return null;
    }

    const row = await this.prisma.aiClassification.findFirst({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) return null;

    return {
      level: row.safetyLevel,
      scores: (row.riskScores as Record<string, number> | null) ?? {},
      model: row.model,
      promptVersion: row.promptVersion,
      fallbackUsed: row.fallbackUsed,
    };
  }

  /**
   * Safety levels over time — never the content that produced them.
   *
   * A pattern matters to a decision ("third L2 this week"); re-reading three
   * old posts to establish it does not, and would be three more intrusions.
   */
  private async safetyHistory(userId: string) {
    return this.prisma.safetyEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { level: true, actionTaken: true, createdAt: true },
    });
  }

  private async trustScore(userId: string): Promise<number | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trustScoreInternal: true },
    });
    return user?.trustScoreInternal ?? null;
  }

  /** Appeal window, so the panel can say how long the user has. */
  async appealWindowDays(): Promise<number> {
    return this.appConfig.getNumber('appeal.window_days');
  }
}
