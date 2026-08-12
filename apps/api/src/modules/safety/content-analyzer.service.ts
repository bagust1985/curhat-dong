import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { ClassificationTarget, PrismaClient, SafetyLevel } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';
import { LocalRulesService } from './local-rules.service.js';
import {
  ClassifierUnavailableError,
  SAFETY_CLASSIFIER,
  UnconfiguredSafetyClassifier,
  type SafetyClassifier,
} from './safety-classifier.port.js';
import {
  actionForLevel,
  fallbackDecision,
  mapRiskToSafetyLevel,
} from './safety-mapping.js';
import { SafetyThresholdsService } from './safety-thresholds.service.js';

export interface AnalysisOutcome {
  level: SafetyLevel;
  status: 'published' | 'held';
  needsReanalysis: boolean;
  showIntervention: boolean;
  /** Set when a moderation case should be opened. */
  queue?: 'critical' | 'high' | 'medium';
  triggeredBy: string[];
  /** True when the verdict came from the fallback rather than the classifier. */
  usedFallback: boolean;
}

/**
 * The single place a piece of content becomes a safety verdict — TECH-SPEC
 * §4.1, §4.2.
 *
 * Order matters:
 *   1. local rules run first and always, producing the high-risk signal;
 *   2. the classifier is consulted;
 *   3. if it cannot answer, the fallback uses the signal from step 1.
 *
 * Running the local rules first is what makes an outage survivable. If they
 * only ran when the classifier failed, a slow provider would leave nothing to
 * fall back on.
 */
@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);
  private readonly classifier: SafetyClassifier;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly localRules: LocalRulesService,
    // Live thresholds (E14-T12), not the built-in constants: a Super Admin can
    // recalibrate from the overturn rates without a deploy.
    private readonly thresholds: SafetyThresholdsService,
    @Optional() @Inject(SAFETY_CLASSIFIER) classifier?: SafetyClassifier,
  ) {
    // No provider bound yet (E08). The stand-in always reports unavailable, so
    // content takes the documented fail-safe path instead of a permissive one.
    this.classifier = classifier ?? new UnconfiguredSafetyClassifier();
  }

  async analyze(input: {
    targetType: ClassificationTarget;
    targetId: string;
    userId: string;
    text: string;
  }): Promise<AnalysisOutcome> {
    const rules = this.localRules.evaluate(input.text);

    try {
      const classification = await this.classifier.classify(input.text);
      const mapping = mapRiskToSafetyLevel(classification.riskScores, await this.thresholds.current());

      await this.prisma.aiClassification.create({
        data: {
          targetType: input.targetType,
          targetId: input.targetId,
          ...(classification.emotion ? { emotion: classification.emotion } : {}),
          ...(classification.topic ? { topic: classification.topic } : {}),
          ...(classification.intent ? { intent: classification.intent } : {}),
          ...(classification.urgency ? { urgency: classification.urgency } : {}),
          // Widened once here: Prisma's Json input type does not accept a
          // nominal interface.
          riskScores: { ...classification.riskScores } as Record<string, number>,
          safetyLevel: mapping.level,
          provider: classification.provider,
          model: classification.model,
          promptVersion: classification.promptVersion,
        },
      });

      // The local rules can still override upwards. A classifier that misses
      // an explicit statement of intent must not be the last word.
      const level: SafetyLevel =
        rules.highRisk && mapping.level !== 'L3' ? 'L3' : mapping.level;

      const action = actionForLevel(level);

      return {
        level,
        status: action.kind === 'publish' ? 'published' : 'held',
        needsReanalysis: false,
        showIntervention: action.kind === 'intervene',
        ...(action.kind === 'hold' ? { queue: action.queue } : {}),
        ...(action.kind === 'intervene' ? { queue: 'critical' as const } : {}),
        triggeredBy: rules.highRisk
          ? [...mapping.triggeredBy, ...rules.signals]
          : mapping.triggeredBy,
        usedFallback: false,
      };
    } catch (error) {
      if (!(error instanceof ClassifierUnavailableError)) throw error;

      // Reason logged, content never (non-negotiable #3).
      this.logger.warn(
        `classifier unavailable (${error.reason}) for ${input.targetType} ${input.targetId}; ` +
          `falling back (localHighRisk=${rules.highRisk})`,
      );

      const decision = fallbackDecision(rules.highRisk);

      return {
        level: decision.level,
        status: decision.status,
        needsReanalysis: decision.needsReanalysis,
        showIntervention: decision.showIntervention,
        ...(decision.queue ? { queue: decision.queue } : {}),
        triggeredBy: rules.signals,
        usedFallback: true,
      };
    }
  }

  /** Anti-doxxing pre-submit check (PRD §15). Informs, never blocks. */
  detectPersonalData(text: string): { found: boolean; warning: string } {
    const rules = this.localRules.evaluate(text);
    return { found: rules.containsPersonalData, warning: this.localRules.personalDataWarning() };
  }
}
