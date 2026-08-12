import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient, SafetyLevel } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';
import { LocalRulesService, type LocalRuleResult } from './local-rules.service.js';

export interface SafetyOutcome {
  status: 'published' | 'held';
  safetyLevel: SafetyLevel;
  needsReanalysis: boolean;
  /** True when the client should show the supportive intervention (PRD §8). */
  showIntervention: boolean;
}

/**
 * Applies the safety decision to a post — TECH-SPEC §4.1, §4.2.
 *
 * INTERIM: the AI Gateway (E08) and the full analyse-post worker (E07-T03) do
 * not exist yet, so every post currently takes the "AI unavailable" branch
 * that TECH-SPEC §4.2 already specifies:
 *
 *   local rules quiet     → published at L1, flagged for re-analysis
 *   local high-risk signal → HELD at `pending`, Critical moderation case
 *
 * This is the documented fail-safe, not a shortcut around it. Posts published
 * this way carry `needsReanalysis = true`, so when E07 lands they are queued
 * and reclassified rather than silently trusted.
 *
 * What must NOT happen is publishing everything at L0 because the classifier
 * is missing — that turns an outage into a safety bypass, which
 * CLAUDE.md non-negotiable #1 forbids.
 */
@Injectable()
export class PostSafetyService {
  private readonly logger = new Logger(PostSafetyService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly localRules: LocalRulesService,
  ) {}

  evaluate(text: string): LocalRuleResult {
    return this.localRules.evaluate(text);
  }

  /**
   * Decides the outcome for a newly submitted post and records the safety
   * event. Returns what the client should be told.
   */
  async decide(input: {
    userId: string;
    postId: string;
    text: string;
  }): Promise<SafetyOutcome> {
    const rules = this.localRules.evaluate(input.text);

    if (rules.highRisk) {
      await this.holdForReview(input.userId, input.postId, rules);

      return {
        status: 'held',
        safetyLevel: 'pending',
        needsReanalysis: true,
        // The user sees support resources, never a punishment and never a
        // score (PRD §8, non-negotiable #2).
        showIntervention: true,
      };
    }

    await this.prisma.safetyEvent.create({
      data: {
        userId: input.userId,
        targetType: 'post',
        targetId: input.postId,
        level: 'L1',
        actionTaken: 'published_pending_reanalysis',
      },
    });

    return {
      status: 'published',
      safetyLevel: 'L1',
      needsReanalysis: true,
      showIntervention: false,
    };
  }

  private async holdForReview(
    userId: string,
    postId: string,
    rules: LocalRuleResult,
  ): Promise<void> {
    const slaDueAt = await this.criticalSlaDueAt();

    await this.prisma.$transaction(async (tx) => {
      await tx.safetyEvent.create({
        data: {
          userId,
          targetType: 'post',
          targetId: postId,
          level: 'pending',
          actionTaken: 'held_local_high_risk_ai_unavailable',
          resourceShown: { signals: rules.signals },
        },
      });

      await tx.moderationCase.create({
        data: {
          source: 'system',
          queue: 'critical',
          targetType: 'post',
          targetId: postId,
          slaDueAt,
        },
      });
    });

    // Signals only — never the post body (non-negotiable #3).
    this.logger.warn(`post ${postId} held: local high-risk signal (${rules.signals.join(', ')})`);
  }

  /**
   * Critical SLA deadline — PRD §15.3.
   *
   * The night window is only slightly wider, not waived: peak usage here is at
   * night, so the quietest moderator hours are the busiest crisis hours.
   */
  private async criticalSlaDueAt(now: Date = new Date()): Promise<Date> {
    const hour = now.getHours();
    const isNight = hour >= 21 || hour < 4;
    const minutes = isNight ? 30 : 15;
    return new Date(now.getTime() + minutes * 60_000);
  }
}
