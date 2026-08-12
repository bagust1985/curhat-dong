import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  estimateCost,
  mergePricing,
  type AiOperation,
  type AiProviderName,
  type ModelTier,
  type TokenUsage,
} from '@curhat/ai';
import { AI_JSON_CONFIG_KEYS, type PrismaClient } from '@curhat/database';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';

/**
 * What a single AI call cost and how it went.
 *
 * There is deliberately no field for the text that was sent or the answer that
 * came back. Cost observability must not become a second, quieter copy of
 * everybody's curhat (TECH-SPEC §10.3, CLAUDE.md non-negotiable #3) — so the
 * type makes logging content impossible rather than merely discouraged.
 */
export interface UsageEventInput {
  userId?: string | undefined;
  operation: AiOperation;
  provider: AiProviderName;
  model: string;
  tier: ModelTier;
  usage: TokenUsage;
  latencyMs: number;
  /** ok | timeout | rate_limit | invalid_response | ... */
  status: string;
  fallbackUsed: boolean;
  degraded: boolean;
  promptVersion?: string | undefined;
}

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  private readonly unpricedModelsWarned = new Set<string>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Writes exactly one usage event and returns its cost estimate.
   *
   * Never throws: a failure to record what a call cost must not fail the call
   * itself. A user in the middle of a conversation should not lose it because
   * an analytics insert deadlocked.
   */
  async record(input: UsageEventInput): Promise<number> {
    let cost = 0;

    try {
      const pricing = mergePricing(await this.appConfig.getJson(AI_JSON_CONFIG_KEYS.pricing, null));
      const estimate = estimateCost(input.model, input.usage, pricing);
      cost = estimate.cost;

      if (!estimate.priced && !this.unpricedModelsWarned.has(input.model)) {
        // Silence here would look like a free model rather than an unpriced
        // one, and the budget guard would happily let it run all day.
        this.unpricedModelsWarned.add(input.model);
        this.logger.error(
          `no price row for model "${input.model}" — its spend is invisible to the budget guard`,
        );
      }

      await this.prisma.aiUsageEvent.create({
        data: {
          ...(input.userId ? { userId: input.userId } : {}),
          operation: input.operation,
          provider: input.provider,
          model: input.model,
          tokensIn: input.usage.tokensIn,
          tokensOut: input.usage.tokensOut,
          costEstimate: cost,
          latencyMs: input.latencyMs,
          status: input.status,
          fallbackUsed: input.fallbackUsed,
          degraded: input.degraded,
          routingTier: input.tier,
          ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
        },
      });
    } catch (error) {
      this.logger.error(`failed to record AI usage for ${input.operation}`, error);
    }

    return cost;
  }

  /** Spend since a point in time. Postgres is the source of truth (rule #5). */
  async spendSince(since: Date): Promise<number> {
    const result = await this.prisma.aiUsageEvent.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { costEstimate: true },
    });

    return result._sum.costEstimate ?? 0;
  }
}
