import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiProviderError } from '@curhat/ai';
import type { PrismaClient, SafetyLevel } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { LocalRulesService } from '../safety/local-rules.service.js';
import {
  mapRiskToSafetyLevel,
} from '../safety/safety-mapping.js';
import { SafetyThresholdsService } from '../safety/safety-thresholds.service.js';
import {
  SupportResourcesService,
  type SupportiveIntervention,
} from '../safety/support-resources.service.js';
import { AiGatewayService } from './ai-gateway.service.js';

export interface InChatSafety {
  level: SafetyLevel;
  /** L3 — supportive intervention with resources (PRD §15.5). */
  showIntervention: boolean;
  /** L2 — AI redirects and offers resources; the reply still happens. */
  redirect: boolean;
  intervention?: SupportiveIntervention;
  /** Labels only. Used for the conversation title and the bridge prefill. */
  topic?: string;
  emotion?: string;
  usedFallback: boolean;
}

/**
 * Safety inside a DONG AI conversation — E09-T05, PRD §15.5, TECH-SPEC §4.3.1.
 *
 * Every action here is *additive*. There is no branch that withholds the
 * reply, ends the conversation, or punishes the user, because the rule that
 * governs this file is blunt: cutting off someone in crisis is a product
 * failure, not a mitigation. What high risk adds is resources, a moderation
 * case, and a warmer instruction — never a closed door.
 */
@Injectable()
export class ChatSafetyService {
  private readonly logger = new Logger(ChatSafetyService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly gateway: AiGatewayService,
    private readonly localRules: LocalRulesService,
    private readonly supportResources: SupportResourcesService,
    private readonly moderation: ModerationService,
    private readonly thresholds: SafetyThresholdsService,
  ) {}

  /**
   * Classifies a user message.
   *
   * Started before generation and awaited after it, so classification costs no
   * user-visible latency (TECH-SPEC §4.3). The caller keeps the promise; this
   * method never touches the reply stream.
   */
  async assess(input: {
    userId: string;
    messageId: string;
    text: string;
  }): Promise<InChatSafety> {
    // Local rules run first and always, exactly as for posts: if they only ran
    // when the classifier failed, a slow provider would leave nothing to fall
    // back on.
    const rules = this.localRules.evaluate(input.text);

    let level: SafetyLevel;
    let usedFallback = false;
    let topic: string | undefined;
    let emotion: string | undefined;
    let triggeredBy: string[] = rules.signals;

    try {
      const { value, meta } = await this.gateway.assessRisk(input.text, { userId: input.userId });
      const mapping = mapRiskToSafetyLevel(value.riskScores, await this.thresholds.current());

      level = rules.highRisk && mapping.level !== 'L3' ? 'L3' : mapping.level;
      topic = value.topic;
      emotion = value.emotion;
      triggeredBy = rules.highRisk ? [...mapping.triggeredBy, ...rules.signals] : mapping.triggeredBy;

      await this.prisma.aiClassification.create({
        data: {
          targetType: 'ai_message',
          targetId: input.messageId,
          ...(value.emotion ? { emotion: value.emotion } : {}),
          ...(value.topic ? { topic: value.topic } : {}),
          ...(value.intent ? { intent: value.intent } : {}),
          ...(value.urgency ? { urgency: value.urgency } : {}),
          riskScores: { ...value.riskScores } as Record<string, number>,
          safetyLevel: level,
          provider: meta.provider,
          model: meta.model,
          promptVersion: meta.promptVersion,
        },
      });
    } catch (error) {
      if (!(error instanceof AiProviderError) && !isClassifierUnavailable(error)) throw error;

      // Reason logged, message never (non-negotiable #3).
      this.logger.warn(
        `in-chat classification unavailable for message ${input.messageId}; ` +
          `falling back (localHighRisk=${rules.highRisk})`,
      );

      usedFallback = true;
      // The message was already delivered and the reply is already streaming,
      // so the post fallback's "hold" branch has no meaning here. What the
      // signal buys instead is the supportive path and a Critical case.
      level = rules.highRisk ? 'L3' : 'L1';
    }

    await this.prisma.aiMessage.update({
      where: { id: input.messageId },
      data: { safetyLevel: level },
    });

    await this.prisma.safetyEvent.create({
      data: {
        userId: input.userId,
        targetType: 'ai_message',
        targetId: input.messageId,
        level,
        // Never a punishment at L3 — the vocabulary here has no room for one.
        actionTaken: usedFallback ? `fallback_${level}` : `classified_${level}`,
        ...(triggeredBy.length > 0 ? { resourceShown: { signals: triggeredBy } } : {}),
      },
    });

    const queue = queueFor(level);
    if (queue) {
      await this.moderation.openCase({
        source: usedFallback ? 'system' : 'ai',
        queue,
        targetType: 'ai_message',
        targetId: input.messageId,
      });
    }

    const showIntervention = level === 'L3';

    return {
      level,
      showIntervention,
      redirect: level === 'L2',
      ...(showIntervention
        ? { intervention: await this.supportResources.buildIntervention() }
        : {}),
      ...(topic ? { topic } : {}),
      ...(emotion ? { emotion } : {}),
      usedFallback,
    };
  }

  /**
   * Extra instruction handed to the model when risk is already known.
   *
   * Only reachable when a previous turn was flagged, since this turn's own
   * classification runs in parallel with generation. It steers the reply
   * warmer — it never tells the model to decline (PRD §15.5).
   */
  static supportiveHint(level: SafetyLevel): string | undefined {
    if (level === 'L3') {
      return (
        'Dia sedang dalam kondisi berat. Tetap hadir dan hangat, jangan menolak membahasnya, ' +
        'jangan menceramahi, dan tawarkan bantuan manusia dengan lembut.'
      );
    }
    if (level === 'L2') {
      return 'Situasinya sensitif. Jaga nada tetap hati-hati, jangan menghakimi, dan tawarkan bantuan bila terasa pas.';
    }
    return undefined;
  }
}

/** L3 goes Critical, L2 High. L0/L1 open nothing. */
function queueFor(level: SafetyLevel): 'critical' | 'high' | null {
  if (level === 'L3') return 'critical';
  if (level === 'L2') return 'high';
  return null;
}

function isClassifierUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === 'ClassifierUnavailableError';
}
