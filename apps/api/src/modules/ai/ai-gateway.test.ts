import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AiProviderError,
  DEFAULT_ROUTING,
  type AIProvider,
  type AiCallOptions,
  type AiProviderName,
  type AiResult,
  type ChatChunk,
  type ChatInput,
  type EmotionResult,
  type IntentResult,
  type ModerationResult,
  type ProviderResolver,
  type RiskResult,
  type SummaryResult,
} from '@curhat/ai';
import type { ServerEnv } from '@curhat/config/env/server';
import { createPrismaClient, type PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';
import { ENV } from '../../config/env.config.js';
import { ClassifierUnavailableError } from '../safety/safety-classifier.port.js';
import { AiBudgetService } from './ai-budget.service.js';
import { AI_PROVIDER_RESOLVER, AiGatewayService } from './ai-gateway.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { PromptRegistryService } from './prompt-registry.service.js';
import { GatewaySafetyClassifier } from './safety-classifier.adapter.js';
import { wibDayKey } from './wib-day.js';

config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'];
const describeIntegration = databaseUrl && redisUrl ? describe : describe.skip;

const DAILY_BUDGET = 10;

interface RecordedCall {
  operation: string;
  model: string;
  promptVersion: number;
  promptTemplate: string;
}

/** A provider that answers exactly what the test tells it to. */
class ScriptedProvider implements AIProvider {
  readonly name: AiProviderName = 'local';

  calls: RecordedCall[] = [];
  risk: RiskResult = { riskScores: { self_harm: 0.05 }, ambiguous: false };
  failClassificationWith: AiProviderError | null = null;
  failChatWith: AiProviderError | null = null;

  assessRisk(_input: string, options: AiCallOptions): Promise<AiResult<RiskResult>> {
    return this.answer('assess_risk', options, this.risk);
  }

  moderate(_input: string, options: AiCallOptions): Promise<AiResult<ModerationResult>> {
    return this.answer('moderate', options, { flagged: false, categories: {} });
  }

  classifyEmotion(_input: string, options: AiCallOptions): Promise<AiResult<EmotionResult>> {
    return this.answer('classify_emotion', options, { emotion: 'sedih', confidence: 0.8 });
  }

  detectIntent(_input: string, options: AiCallOptions): Promise<AiResult<IntentResult>> {
    return this.answer('detect_intent', options, { intent: 'mau_cerita', confidence: 0.7 });
  }

  summarize(_input: string, options: AiCallOptions): Promise<AiResult<SummaryResult>> {
    return this.answer('summarize', options, { summary: 'ringkasan uji' });
  }

  async *chat(_input: ChatInput, options: AiCallOptions): AsyncIterable<ChatChunk> {
    this.record('chat', options);
    if (this.failChatWith) throw this.failChatWith;

    yield { text: 'Aku di sini.' };
    yield { text: '', done: true, usage: { tokensIn: 40, tokensOut: 8 } };
  }

  private answer<T>(
    operation: string,
    options: AiCallOptions,
    value: T,
  ): Promise<AiResult<T>> {
    this.record(operation, options);
    if (this.failClassificationWith) return Promise.reject(this.failClassificationWith);

    return Promise.resolve({
      value,
      meta: {
        provider: this.name,
        model: options.model,
        usage: { tokensIn: 100, tokensOut: 20 },
        latencyMs: 3,
      },
    });
  }

  private record(operation: string, options: AiCallOptions): void {
    this.calls.push({
      operation,
      model: options.model,
      promptVersion: options.prompt.version,
      promptTemplate: options.prompt.template,
    });
  }
}

describeIntegration('AI gateway (E08)', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let gateway: AiGatewayService;
  let budget: AiBudgetService;
  let quota: AiQuotaService;
  let prompts: PromptRegistryService;
  let classifier: GatewaySafetyClassifier;
  let provider: ScriptedProvider;

  const startedAt = new Date();

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    redis = new Redis(redisUrl as string, { maxRetriesPerRequest: 2 });
    provider = new ScriptedProvider();

    const resolver: ProviderResolver = {
      get: () => provider,
      order: () => ['local'],
    };

    const env = {
      AI_DAILY_BUDGET: DAILY_BUDGET,
      AI_DEFAULT_PROVIDER: 'local',
    } as ServerEnv;

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PRISMA, useValue: prisma },
        { provide: REDIS, useValue: redis },
        { provide: ENV, useValue: env },
        { provide: AI_PROVIDER_RESOLVER, useValue: resolver },
        AppConfigService,
        PromptRegistryService,
        AiUsageService,
        AiBudgetService,
        AiQuotaService,
        AiGatewayService,
        GatewaySafetyClassifier,
      ],
    }).compile();

    gateway = moduleRef.get(AiGatewayService);
    budget = moduleRef.get(AiBudgetService);
    quota = moduleRef.get(AiQuotaService);
    prompts = moduleRef.get(PromptRegistryService);
    classifier = moduleRef.get(GatewaySafetyClassifier);
  });

  afterAll(async () => {
    await prisma.aiUsageEvent.deleteMany({ where: { createdAt: { gte: startedAt } } });
    await prisma.aiPromptVersion.deleteMany({ where: { key: 'safety.assess_risk' } });
    await prisma.aiPrompt.deleteMany({ where: { key: 'safety.assess_risk' } });
    await redis.del(`ai:spend:${wibDayKey()}`);
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(async () => {
    provider.calls = [];
    provider.risk = { riskScores: { self_harm: 0.05 }, ambiguous: false };
    provider.failClassificationWith = null;
    provider.failChatWith = null;
    prompts.invalidate();
    gateway.resetBreakers();
    await redis.del(`ai:spend:${wibDayKey()}`);
  });

  // -------------------------------------------------------------------------
  // E08-T05 — usage logging
  // -------------------------------------------------------------------------

  it('records exactly one usage event, carrying no message content', async () => {
    const before = new Date();
    await gateway.assessRisk('aku lagi capek sama kerjaan');

    const events = await prisma.aiUsageEvent.findMany({ where: { createdAt: { gte: before } } });

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.operation).toBe('assess_risk');
    expect(event.status).toBe('ok');
    expect(event.tokensIn).toBe(100);
    expect(event.routingTier).toBe('cheap');
    expect(event.promptVersion).toBe('safety.assess_risk@v1');
    // The row simply has nowhere to put content — verified rather than assumed.
    expect(JSON.stringify(event)).not.toContain('capek');
  });

  it('records a failed call too, so a silent provider outage still shows up', async () => {
    const before = new Date();
    provider.failClassificationWith = new AiProviderError('timeout', 'local');

    await expect(gateway.assessRisk('halo')).rejects.toBeInstanceOf(AiProviderError);

    const events = await prisma.aiUsageEvent.findMany({ where: { createdAt: { gte: before } } });
    expect(events.every((event) => event.status === 'timeout')).toBe(true);
    expect(events.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // E08-T03 — routing
  // -------------------------------------------------------------------------

  it('escalates an ambiguous verdict to the advanced model', async () => {
    provider.risk = { riskScores: { self_harm: 0.5 }, ambiguous: false };

    const result = await gateway.assessRisk('...');

    expect(provider.calls.map((call) => call.model)).toEqual([
      DEFAULT_ROUTING.models.local.cheap,
      DEFAULT_ROUTING.models.local.advanced,
    ]);
    expect(result.meta.tier).toBe('advanced');
  });

  it('leaves a clear-cut verdict on the cheap model', async () => {
    await gateway.assessRisk('...');

    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.model).toBe(DEFAULT_ROUTING.models.local.cheap);
  });

  // -------------------------------------------------------------------------
  // E08-T06 — budget guard. This is CLAUDE.md non-negotiable #1.
  // -------------------------------------------------------------------------

  describe('with the daily budget exhausted', () => {
    beforeEach(async () => {
      await redis.set(`ai:spend:${wibDayKey()}`, String(DAILY_BUDGET));
    });

    it('stops DONG AI conversation with warm copy', async () => {
      const status = await budget.status();
      expect(status.chatStopped).toBe(true);

      const consume = async (): Promise<void> => {
        for await (const _chunk of gateway.chat(
          { messages: [{ role: 'user', content: 'halo' }] },
          { userId: randomUUID() },
        )) {
          // drained on purpose
        }
      };

      await expect(consume()).rejects.toMatchObject({ code: 'AI_BUDGET_EXCEEDED' });
    });

    it('keeps risk classification on its normal path', async () => {
      const result = await gateway.assessRisk('aku capek');

      expect(result.meta.degraded).toBe(false);
      expect(provider.calls[0]?.model).toBe(DEFAULT_ROUTING.models.local.cheap);
    });

    it('still escalates ambiguous safety input to the advanced model', async () => {
      // The expensive path stays open for safety even with no budget left.
      // Cost pressure must never reach this decision (PRD §10).
      provider.risk = { riskScores: { threat: 0.6 }, ambiguous: true };

      const result = await gateway.assessRisk('...');

      expect(result.meta.tier).toBe('advanced');
      expect(provider.calls.at(-1)?.model).toBe(DEFAULT_ROUTING.models.local.advanced);
    });
  });

  // -------------------------------------------------------------------------
  // E08-T07 — per-user quota
  // -------------------------------------------------------------------------

  describe('daily quota', () => {
    it('refuses the message after the limit with a CTA, not a raw error', async () => {
      const userId = randomUUID();
      const limit = (await quota.status(userId)).limit;
      await redis.set(`ai:quota:${userId}:${wibDayKey()}`, String(limit));

      const error = await quota.consume(userId).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).code).toBe('AI_QUOTA_EXCEEDED');
      expect((error as ApiException).message).toContain('Cari Listener');

      await redis.del(`ai:quota:${userId}:${wibDayKey()}`);
    });

    it('exposes the remaining count for the UI', async () => {
      const userId = randomUUID();

      const status = await quota.consume(userId);

      expect(status.used).toBe(1);
      expect(status.remaining).toBe(status.limit - 1);

      await redis.del(`ai:quota:${userId}:${wibDayKey()}`);
    });

    it('resets at WIB midnight, not UTC midnight', async () => {
      const userId = randomUUID();
      const lateNightWib = new Date('2026-08-12T16:59:00Z'); // 23:59 WIB, 12 Aug
      const justAfterMidnightWib = new Date('2026-08-12T17:01:00Z'); // 00:01 WIB, 13 Aug

      await quota.consume(userId, lateNightWib);

      expect((await quota.status(userId, lateNightWib)).used).toBe(1);
      expect((await quota.status(userId, justAfterMidnightWib)).used).toBe(0);

      await redis.del(`ai:quota:${userId}:${wibDayKey(lateNightWib)}`);
    });
  });

  // -------------------------------------------------------------------------
  // E08-T04 — prompt versioning
  // -------------------------------------------------------------------------

  describe('prompt versioning', () => {
    it('uses a newly published prompt and can roll back without a deploy', async () => {
      expect(await prompts.activeLabel('safety.assess_risk')).toBe('safety.assess_risk@v1');

      const v2 = await prompts.publish({
        key: 'safety.assess_risk',
        template: 'VERSION TWO INSTRUCTIONS',
        changeNote: 'tighten self_harm calibration',
      });
      expect(v2.version).toBe(2);

      prompts.invalidate();
      await gateway.assessRisk('...');
      expect(provider.calls.at(-1)?.promptTemplate).toBe('VERSION TWO INSTRUCTIONS');
      expect(provider.calls.at(-1)?.promptVersion).toBe(2);

      const v3 = await prompts.publish({
        key: 'safety.assess_risk',
        template: 'VERSION THREE INSTRUCTIONS',
      });
      expect(v3.version).toBe(3);

      const rolledBack = await prompts.rollback({ key: 'safety.assess_risk', version: 2 });
      expect(rolledBack.version).toBe(2);

      prompts.invalidate();
      provider.calls = [];
      await gateway.assessRisk('...');
      expect(provider.calls.at(-1)?.promptTemplate).toBe('VERSION TWO INSTRUCTIONS');
    });

    it('writes an audit trail for every prompt change', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { targetType: 'ai_prompt', createdAt: { gte: startedAt } },
        orderBy: { createdAt: 'asc' },
      });

      expect(logs.map((log) => log.action)).toContain('ai_prompt.publish');
      expect(logs.map((log) => log.action)).toContain('ai_prompt.rollback');
    });

    it('keeps a readable history with the active version marked', async () => {
      const history = await prompts.history('safety.assess_risk');

      expect(history.map((entry) => entry.version)).toEqual([3, 2]);
      expect(history.find((entry) => entry.isActive)?.version).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // E08-T09 — safety classification is independent of the conversation model
  // -------------------------------------------------------------------------

  describe('safety classifier independence', () => {
    it('classifies risk even when the conversation model is dead', async () => {
      provider.failChatWith = new AiProviderError('server_error', 'local');

      const result = await classifier.classify('aku capek banget');

      expect(result.riskScores).toEqual({ self_harm: 0.05 });
      // Whatever prompt is live, the verdict is traceable to it.
      expect(result.promptVersion).toBe(await prompts.activeLabel('safety.assess_risk'));
      // No chat call took place: risk assessment is its own request, not a
      // by-product of generating a reply (TECH-SPEC §4.3).
      expect(provider.calls.some((call) => call.operation === 'chat')).toBe(false);
    });

    it('reports a classifier timeout as unavailable rather than as "no risk"', async () => {
      provider.failClassificationWith = new AiProviderError('timeout', 'local');

      const error = await classifier
        .classify('...')
        .then(() => null)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ClassifierUnavailableError);
      expect((error as ClassifierUnavailableError).reason).toBe('timeout');
    });
  });
});
