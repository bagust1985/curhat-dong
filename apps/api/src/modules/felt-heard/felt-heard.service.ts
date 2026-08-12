import { Inject, Injectable, Logger } from '@nestjs/common';
import type { FeltHeardAnswer, FeltHeardTarget, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';

export interface PendingPrompt {
  promptId: string;
  targetType: FeltHeardTarget;
  targetId: string;
  question: string;
}

export interface FeltHeardRate {
  /** null when nobody has answered yet — not zero. */
  rate: number | null;
  answered: number;
  dismissed: number;
  breakdown: Record<FeltHeardAnswer, number>;
}

/**
 * Felt Heard — PRD §9, §19.1. The North Star Metric.
 *
 * Two rules keep this honest, and both are easy to get wrong:
 *
 * 1. Anti-fatigue. Asked too often, the prompt drives people away AND poisons
 *    the metric with rushed answers. Capped per target, per day, and delayed
 *    after the first response so the author has had time to read it.
 *
 * 2. A dismissal is not a "no". Dismissed prompts are excluded from the
 *    denominator entirely. Counting them as negative would make the North Star
 *    measure annoyance rather than whether anyone felt heard — and it would
 *    quietly get worse every time the prompt appeared at a bad moment.
 */
@Injectable()
export class FeltHeardService {
  private readonly logger = new Logger(FeltHeardService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Called when a post receives a human response.
   *
   * Creates a prompt only if every anti-fatigue rule allows it. Silent when it
   * does not — the caller does not need to care.
   */
  async onHumanResponse(authorId: string, postId: string): Promise<void> {
    await this.maybeCreatePrompt(authorId, 'post', postId);
  }

  /** Called when a listener session ends (E11-T08). */
  async onSessionEnded(requesterId: string, sessionId: string): Promise<void> {
    await this.maybeCreatePrompt(requesterId, 'session', sessionId);
  }

  /**
   * Creates a prompt if every anti-fatigue rule allows it.
   *
   * Never throws. This is a side effect of someone leaving a comment, and a
   * failure here must not fail their comment — a user who writes a reply,
   * sees an error, and cannot tell whether it saved is a worse outcome than a
   * missing prompt.
   */
  private async maybeCreatePrompt(
    userId: string,
    targetType: FeltHeardTarget,
    targetId: string,
  ): Promise<void> {
    try {
      const settings = await this.prisma.notificationSetting.findUnique({
        where: { userId },
        select: { feltHeardPromptEnabled: true },
      });

      // Switched off permanently from Settings (PRD §9).
      if (settings && !settings.feltHeardPromptEnabled) return;

      const existing = await this.prisma.feltHeardPrompt.findUnique({
        where: { userId_targetType_targetId: { userId, targetType, targetId } },
        select: { id: true },
      });

      // One prompt per target, ever. Asking twice about the same post is the
      // fastest way to make the answer meaningless.
      if (existing) return;

      const maxPerDay = await this.appConfig.getNumber('felt_heard.max_per_day');

      const since = new Date(Date.now() - 86_400_000);
      const todayCount = await this.prisma.feltHeardPrompt.count({
        where: { userId, shownAt: { gte: since } },
      });

      if (todayCount >= maxPerDay) return;

      // Several replies can land at once, so two callers can both pass the
      // check above. `createMany` with skipDuplicates lets the unique index
      // settle it — the desired end state is one prompt either way, and losing
      // that race is not an error.
      await this.prisma.feltHeardPrompt.createMany({
        data: [{ userId, targetType, targetId }],
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(
        `could not create Felt Heard prompt for ${targetType} ${targetId}: ${
          (error as Error).message
        }`,
      );
    }
  }

  /**
   * Prompts ready to show.
   *
   * The delay is applied on read rather than by a scheduler: it costs nothing,
   * and it means a client that polls at the wrong moment still respects it.
   */
  async pending(userId: string): Promise<PendingPrompt[]> {
    const delayMinutes = await this.appConfig.getNumber('felt_heard.delay_minutes');
    const readyBefore = new Date(Date.now() - delayMinutes * 60_000);

    const prompts = await this.prisma.feltHeardPrompt.findMany({
      where: {
        userId,
        answeredAt: null,
        dismissed: false,
        shownAt: { lte: readyBefore },
      },
      orderBy: { shownAt: 'asc' },
      take: 3,
    });

    return prompts.map((prompt) => ({
      promptId: prompt.id,
      targetType: prompt.targetType,
      targetId: prompt.targetId,
      question:
        prompt.targetType === 'session'
          ? 'Kamu merasa didengar?'
          : 'Kamu merasa sedikit lebih baik setelah cerita?',
    }));
  }

  async answer(userId: string, promptId: string, answer: FeltHeardAnswer): Promise<void> {
    const prompt = await this.prisma.feltHeardPrompt.findUnique({
      where: { id: promptId },
      select: { userId: true, targetType: true, targetId: true, answeredAt: true, dismissed: true },
    });

    if (!prompt || prompt.userId !== userId) {
      throw ApiException.notFound('NOT_FOUND', 'Pertanyaan itu nggak ada.');
    }

    if (prompt.dismissed) {
      throw ApiException.conflict('CONFLICT', 'Pertanyaan itu sudah ditutup.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.feltHeardPrompt.update({
        where: { id: promptId },
        data: { answer, answeredAt: new Date() },
      });

      await tx.feltHeardFeedback.create({
        data: {
          userId,
          answer,
          ...(prompt.targetType === 'post'
            ? { postId: prompt.targetId }
            : { sessionId: prompt.targetId }),
        },
      });
    });
  }

  /**
   * Dismisses a prompt.
   *
   * Recorded as `dismissed`, never as an answer. "I do not want to answer this
   * right now" is not the same statement as "no, I do not feel heard", and
   * conflating them corrupts the one metric this product is steered by.
   */
  async dismiss(userId: string, promptId: string): Promise<void> {
    const prompt = await this.prisma.feltHeardPrompt.findUnique({
      where: { id: promptId },
      select: { userId: true, answeredAt: true },
    });

    if (!prompt || prompt.userId !== userId) {
      throw ApiException.notFound('NOT_FOUND', 'Pertanyaan itu nggak ada.');
    }

    if (prompt.answeredAt) {
      throw ApiException.conflict('CONFLICT', 'Pertanyaan itu sudah dijawab.');
    }

    await this.prisma.feltHeardPrompt.update({
      where: { id: promptId },
      data: { dismissed: true },
    });
  }

  /**
   * Felt Heard Rate — PRD §19.1.
   *
   *   rate = (yes + somewhat) / answered
   *
   * `dismissed` is reported alongside but never enters the calculation. It is
   * returned so a rising dismissal count is visible: that is a signal the
   * prompt is being shown at the wrong moments, not that people feel unheard.
   */
  async rate(options: { since?: Date; until?: Date } = {}): Promise<FeltHeardRate> {
    const where = {
      answeredAt: { not: null },
      ...(options.since || options.until
        ? {
            shownAt: {
              ...(options.since ? { gte: options.since } : {}),
              ...(options.until ? { lte: options.until } : {}),
            },
          }
        : {}),
    };

    const [grouped, dismissed] = await Promise.all([
      this.prisma.feltHeardPrompt.groupBy({
        by: ['answer'],
        where,
        _count: { answer: true },
      }),
      this.prisma.feltHeardPrompt.count({
        where: {
          dismissed: true,
          ...(options.since ? { shownAt: { gte: options.since } } : {}),
        },
      }),
    ]);

    const breakdown: Record<FeltHeardAnswer, number> = { yes: 0, somewhat: 0, no: 0 };
    for (const row of grouped) {
      if (row.answer) breakdown[row.answer] = row._count.answer;
    }

    const answered = breakdown.yes + breakdown.somewhat + breakdown.no;

    return {
      // null rather than 0 when nobody has answered: "no data" and "nobody
      // felt heard" are very different things to show on a dashboard.
      rate: answered === 0 ? null : (breakdown.yes + breakdown.somewhat) / answered,
      answered,
      dismissed,
      breakdown,
    };
  }
}
