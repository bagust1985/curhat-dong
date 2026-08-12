import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiProviderError } from '@curhat/ai';
import type { PrismaClient, SafetyLevel } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';
import { AiGatewayService } from '../ai/ai-gateway.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { LocalRulesService } from '../safety/local-rules.service.js';
import { DEFAULT_THRESHOLDS, mapRiskToSafetyLevel } from '../safety/safety-mapping.js';
import {
  SupportResourcesService,
  type SupportiveIntervention,
} from '../safety/support-resources.service.js';

/** Categories that mean the harm points at the other person, not at oneself. */
const TARGET_DIRECTED = new Set(['harassment', 'threat', 'doxxing']);

export interface RoomMessageSafety {
  level: SafetyLevel;
  /** L3 — resources go to both people in the room (PRD §15.5). */
  intervention?: SupportiveIntervention;
  /** L2 aimed at the other person: warn the sender, offer report/block. */
  targetDirected: boolean;
  usedFallback: boolean;
}

/**
 * Safety for private room messages — E11-T05, PRD §15.5, TECH-SPEC §4.3.1.
 *
 * Runs after the message is delivered, never before it. That ordering is the
 * design: classification is asynchronous so delivery stays under the 2s target
 * (TECH-SPEC §8.3), and every action at every level is *additive* — resources,
 * a case, an offer to report — so no verdict can withhold a message or close a
 * room.
 *
 * The one distinction that matters is direction. Someone in pain gets support;
 * someone attacking the person in front of them gets a warning and gives the
 * other side the report and block buttons. Suffering is not an offence
 * (CLAUDE.md non-negotiable #2); aiming harm at someone is.
 */
@Injectable()
export class MessageSafetyService {
  private readonly logger = new Logger(MessageSafetyService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly gateway: AiGatewayService,
    private readonly localRules: LocalRulesService,
    private readonly supportResources: SupportResourcesService,
    private readonly moderation: ModerationService,
  ) {}

  async assess(input: {
    messageId: string;
    senderId: string;
    text: string;
  }): Promise<RoomMessageSafety> {
    const rules = this.localRules.evaluate(input.text);

    let level: SafetyLevel;
    let triggeredBy: string[] = rules.signals;
    let usedFallback = false;

    try {
      const { value, meta } = await this.gateway.assessRisk(input.text, { userId: input.senderId });
      const mapping = mapRiskToSafetyLevel(value.riskScores, DEFAULT_THRESHOLDS);

      level = rules.highRisk && mapping.level !== 'L3' ? 'L3' : mapping.level;
      triggeredBy = rules.highRisk
        ? [...mapping.triggeredBy, ...rules.signals]
        : mapping.triggeredBy;

      await this.prisma.aiClassification.create({
        data: {
          targetType: 'message',
          targetId: input.messageId,
          ...(value.emotion ? { emotion: value.emotion } : {}),
          ...(value.topic ? { topic: value.topic } : {}),
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
        `room message classification unavailable for ${input.messageId}; ` +
          `falling back (localHighRisk=${rules.highRisk})`,
      );

      usedFallback = true;
      // The message is already delivered, so "hold" has no meaning here. What
      // the local signal buys is the supportive path and a Critical case.
      level = rules.highRisk ? 'L3' : 'L1';
    }

    await this.prisma.message.update({
      where: { id: input.messageId },
      data: { safetyLevel: level, needsReanalysis: usedFallback },
    });

    const targetDirected =
      level === 'L2' && triggeredBy.some((category) => TARGET_DIRECTED.has(category));

    await this.prisma.safetyEvent.create({
      data: {
        userId: input.senderId,
        targetType: 'message',
        targetId: input.messageId,
        level,
        actionTaken: usedFallback ? `fallback_${level}` : `classified_${level}`,
        ...(triggeredBy.length > 0 ? { resourceShown: { signals: triggeredBy } } : {}),
      },
    });

    const queue = queueFor(level, targetDirected);
    if (queue) {
      await this.moderation.openCase({
        source: usedFallback ? 'system' : 'ai',
        queue,
        targetType: 'message',
        targetId: input.messageId,
      });
    }

    return {
      level,
      targetDirected,
      usedFallback,
      ...(level === 'L3'
        ? { intervention: await this.supportResources.buildIntervention() }
        : {}),
    };
  }
}

/**
 * L3 is always Critical. L2 aimed at the other person is High; L2 that is
 * someone struggling is Medium — the queue reflects who is at risk, not how
 * loud the message was.
 */
function queueFor(level: SafetyLevel, targetDirected: boolean): 'critical' | 'high' | 'medium' | null {
  if (level === 'L3') return 'critical';
  if (level === 'L2') return targetDirected ? 'high' : 'medium';
  return null;
}

function isClassifierUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === 'ClassifierUnavailableError';
}
