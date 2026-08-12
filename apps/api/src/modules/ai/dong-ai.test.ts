import { Test } from '@nestjs/testing';
import { config } from 'dotenv';
import { join } from 'node:path';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AiProviderError,
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
import { SessionService } from '../auth/session.service.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { ModerationService } from '../moderation/moderation.service.js';
import { LocalRulesService } from '../safety/local-rules.service.js';
import { SupportResourcesService } from '../safety/support-resources.service.js';
import { AiBudgetService } from './ai-budget.service.js';
import { AiChatService, type ChatEvent } from './ai-chat.service.js';
import { AI_PROVIDER_RESOLVER, AiGatewayService } from './ai-gateway.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { ChatSafetyService } from './chat-safety.service.js';
import { ContextBuilderService } from './context-builder.service.js';
import { ConversationsService } from './conversations.service.js';
import { PromptRegistryService } from './prompt-registry.service.js';
import { wibDayKey } from './wib-day.js';

config({ path: join(process.cwd(), '../../.env') });

const databaseUrl = process.env['DATABASE_URL'];
const redisUrl = process.env['REDIS_URL'];
const describeIntegration = databaseUrl && redisUrl ? describe : describe.skip;

/** A provider that answers whatever the test scripts. */
class ScriptedProvider implements AIProvider {
  readonly name: AiProviderName = 'local';

  risk: RiskResult = { riskScores: { self_harm: 0.02 }, ambiguous: false };
  reply = ['Aku ', 'di sini.'];
  systemSuffixes: string[] = [];
  failRiskWith: AiProviderError | null = null;
  chatCalls = 0;

  assessRisk(_input: string, options: AiCallOptions): Promise<AiResult<RiskResult>> {
    if (this.failRiskWith) return Promise.reject(this.failRiskWith);
    return this.answer(options, this.risk);
  }

  moderate(_input: string, options: AiCallOptions): Promise<AiResult<ModerationResult>> {
    return this.answer(options, { flagged: false, categories: {} });
  }

  classifyEmotion(_input: string, options: AiCallOptions): Promise<AiResult<EmotionResult>> {
    return this.answer(options, { emotion: 'sedih', confidence: 0.8 });
  }

  detectIntent(_input: string, options: AiCallOptions): Promise<AiResult<IntentResult>> {
    return this.answer(options, { intent: 'mau_cerita', confidence: 0.7 });
  }

  summarize(_input: string, options: AiCallOptions): Promise<AiResult<SummaryResult>> {
    return this.answer(options, { summary: 'dia bercerita soal harinya' });
  }

  async *chat(input: ChatInput, options: AiCallOptions): AsyncIterable<ChatChunk> {
    this.chatCalls += 1;
    this.systemSuffixes.push(`${options.prompt.template}\n\n${input.systemSuffix ?? ''}`);

    for (const piece of this.reply) {
      yield { text: piece };
    }
    yield { text: '', done: true, usage: { tokensIn: 30, tokensOut: 6 } };
  }

  private answer<T>(options: AiCallOptions, value: T): Promise<AiResult<T>> {
    return Promise.resolve({
      value,
      meta: {
        provider: this.name,
        model: options.model,
        usage: { tokensIn: 50, tokensOut: 10 },
        latencyMs: 2,
      },
    });
  }
}

describeIntegration('DONG AI (E09)', () => {
  let prisma: PrismaClient;
  let redis: Redis;
  let chat: AiChatService;
  let conversations: ConversationsService;
  let quota: AiQuotaService;
  let flags: FeatureFlagService;
  let provider: ScriptedProvider;

  const startedAt = new Date();
  const createdUserIds: string[] = [];

  async function makeUser(): Promise<string> {
    const user = await prisma.user.create({ data: {} });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function drain(
    userId: string,
    conversationId: string,
    text: string,
  ): Promise<ChatEvent[]> {
    const events: ChatEvent[] = [];
    for await (const event of chat.send({ userId, conversationId, text })) {
      events.push(event);
    }
    return events;
  }

  function textOf(events: ChatEvent[]): string {
    return events
      .filter((event): event is Extract<ChatEvent, { type: 'message.delta' }> =>
        event.type === 'message.delta',
      )
      .map((event) => event.data.text)
      .join('');
  }

  beforeAll(async () => {
    prisma = createPrismaClient(databaseUrl as string);
    redis = new Redis(redisUrl as string, { maxRetriesPerRequest: 2 });
    provider = new ScriptedProvider();

    const resolver: ProviderResolver = { get: () => provider, order: () => ['local'] };
    const env = { AI_DAILY_BUDGET: 1_000, AI_DEFAULT_PROVIDER: 'local' } as ServerEnv;

    const moduleRef = await Test.createTestingModule({
      providers: [
        { provide: PRISMA, useValue: prisma },
        { provide: REDIS, useValue: redis },
        { provide: ENV, useValue: env },
        { provide: AI_PROVIDER_RESOLVER, useValue: resolver },
        AppConfigService,
        FeatureFlagService,
        SessionService,
        LocalRulesService,
        SupportResourcesService,
        ModerationService,
        PromptRegistryService,
        AiUsageService,
        AiBudgetService,
        AiQuotaService,
        AiGatewayService,
        ChatSafetyService,
        ContextBuilderService,
        ConversationsService,
        AiChatService,
      ],
    }).compile();

    chat = moduleRef.get(AiChatService);
    conversations = moduleRef.get(ConversationsService);
    quota = moduleRef.get(AiQuotaService);
    flags = moduleRef.get(FeatureFlagService);
  });

  afterAll(async () => {
    await prisma.aiUsageEvent.deleteMany({ where: { createdAt: { gte: startedAt } } });
    for (const userId of createdUserIds) {
      await redis.del(`ai:quota:${userId}:${wibDayKey()}`);
    }
    // Conversations, messages, classifications and safety events cascade.
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await redis.del(`ai:spend:${wibDayKey()}`);
    await prisma.$disconnect();
    redis.disconnect();
  });

  beforeEach(() => {
    provider.risk = { riskScores: { self_harm: 0.02 }, ambiguous: false };
    provider.reply = ['Aku ', 'di sini.'];
    provider.systemSuffixes = [];
    provider.failRiskWith = null;
    provider.chatCalls = 0;
    flags.invalidate();
  });

  // -------------------------------------------------------------------------
  // E09-T01 — isolation and history
  // -------------------------------------------------------------------------

  describe('conversation isolation', () => {
    it('hides another user’s conversation completely', async () => {
      const owner = await makeUser();
      const stranger = await makeUser();
      const conversation = await conversations.create(owner);

      const read = await conversations
        .messages(stranger, conversation.id)
        .catch((error: unknown) => error);
      expect(read).toBeInstanceOf(ApiException);
      // 404, not 403: a 403 would confirm the id is real and belongs to someone.
      expect((read as ApiException).code).toBe('NOT_FOUND');

      const send = await chat
        .preflight(stranger, conversation.id)
        .catch((error: unknown) => error);
      expect((send as ApiException).code).toBe('NOT_FOUND');

      const list = await conversations.list(stranger);
      expect(list.items).toHaveLength(0);
    });

    it('titles a conversation without quoting it', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);
      provider.risk = { riskScores: {}, ambiguous: false, topic: 'work' };

      await drain(userId, conversation.id, 'bosku ngomong kasar terus tiap rapat');

      const stored = await prisma.aiConversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(stored.title).toBe('Obrolan soal kerjaan');
      expect(stored.title).not.toContain('bos');
    });

    it('pages history newest-first with a cursor', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      await drain(userId, conversation.id, 'satu');
      await drain(userId, conversation.id, 'dua');

      const firstPage = await conversations.messages(userId, conversation.id, undefined, 2);
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await conversations.messages(
        userId,
        conversation.id,
        firstPage.nextCursor ?? undefined,
        2,
      );
      expect(secondPage.items).toHaveLength(2);
      expect(secondPage.items.map((item) => item.id)).not.toEqual(
        firstPage.items.map((item) => item.id),
      );
    });
  });

  // -------------------------------------------------------------------------
  // E09-T02 — personality modes
  // -------------------------------------------------------------------------

  describe('personality modes', () => {
    it('keeps history when the mode changes mid-chat', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId, 'pendengar');

      await drain(userId, conversation.id, 'halo');
      await conversations.setMode(userId, conversation.id, 'teman_santai');
      await drain(userId, conversation.id, 'lanjut ya');

      const messages = await prisma.aiMessage.count({
        where: { conversationId: conversation.id },
      });
      expect(messages).toBe(4);

      const lastPrompt = provider.systemSuffixes.at(-1) ?? '';
      expect(lastPrompt).toContain('Mode: Teman Santai');
    });

    it('keeps the AI rules in force under every mode', async () => {
      const userId = await makeUser();

      for (const mode of ['pendengar', 'pemikir', 'teman_hangat', 'teman_santai'] as const) {
        const conversation = await conversations.create(userId, mode);
        await drain(userId, conversation.id, 'halo');

        const prompt = provider.systemSuffixes.at(-1) ?? '';
        expect(prompt).toContain('mengaku dokter, psikolog, atau manusia');
        expect(prompt).toContain('diagnosis medis');
        expect(prompt).toContain('jangan menolak membahasnya');
      }
    });

    it('keeps Journal Companion behind its flag', async () => {
      const userId = await makeUser();

      await prisma.featureFlag.upsert({
        where: { key: 'ai.personality.journal_companion' },
        update: { value: false },
        create: { key: 'ai.personality.journal_companion', value: false },
      });
      flags.invalidate();

      await expect(conversations.create(userId, 'journal_companion')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });

      await prisma.featureFlag.update({
        where: { key: 'ai.personality.journal_companion' },
        data: { value: true },
      });
      flags.invalidate();

      const conversation = await conversations.create(userId, 'journal_companion');
      expect(conversation.personalityMode).toBe('journal_companion');

      await prisma.featureFlag.update({
        where: { key: 'ai.personality.journal_companion' },
        data: { value: false },
      });
      flags.invalidate();
    });
  });

  // -------------------------------------------------------------------------
  // E09-T03 — streaming
  // -------------------------------------------------------------------------

  describe('streaming a turn', () => {
    it('emits start, deltas and complete in order', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      const events = await drain(userId, conversation.id, 'halo');
      const types = events.map((event) => event.type);

      expect(types[0]).toBe('message.start');
      expect(types.at(-1)).toBe('message.complete');
      expect(types.filter((type) => type === 'message.delta')).toHaveLength(2);
      expect(textOf(events)).toBe('Aku di sini.');
    });

    it('stores the reply under the id announced at the start', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      const events = await drain(userId, conversation.id, 'halo');
      const start = events[0] as Extract<ChatEvent, { type: 'message.start' }>;

      const stored = await prisma.aiMessage.findUniqueOrThrow({
        where: { id: start.data.messageId },
      });
      expect(stored.role).toBe('assistant');
      expect(stored.body).toBe('Aku di sini.');
      expect(stored.tokensOut).toBe(6);
      expect(stored.model).toBeTruthy();
    });

    it('leaves no half-written reply behind when the client disconnects', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);
      provider.reply = ['Aku ', 'akan ', 'terus ', 'bicara'];

      const stream = chat.send({ userId, conversationId: conversation.id, text: 'halo' });
      let seen = 0;
      for await (const event of stream) {
        if (event.type === 'message.delta' && ++seen === 2) break; // client gone
      }

      const assistant = await prisma.aiMessage.findMany({
        where: { conversationId: conversation.id, role: 'assistant' },
      });
      // The user's message is kept — they did send it. The truncated reply is
      // not, because a fragment stored as final is worse than no reply.
      expect(assistant).toHaveLength(0);
      expect(
        await prisma.aiMessage.count({ where: { conversationId: conversation.id, role: 'user' } }),
      ).toBe(1);
    });

    it('records one usage event per turn', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);
      const before = new Date();

      await drain(userId, conversation.id, 'halo');

      const chatEvents = await prisma.aiUsageEvent.findMany({
        where: { createdAt: { gte: before }, operation: 'chat' },
      });
      expect(chatEvents).toHaveLength(1);
      expect(chatEvents[0]?.status).toBe('ok');
    });
  });

  // -------------------------------------------------------------------------
  // E09-T05 — in-chat safety. PRD §15.5.
  // -------------------------------------------------------------------------

  describe('safety inside a conversation', () => {
    beforeEach(() => {
      provider.risk = { riskScores: { self_harm: 0.9 }, ambiguous: false, topic: 'loneliness' };
    });

    it('keeps talking and adds resources instead of refusing', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      const events = await drain(userId, conversation.id, 'aku ngerasa capek banget sama semuanya');

      // The reply happened. This is the whole rule: nobody gets cut off.
      expect(textOf(events)).toBe('Aku di sini.');
      expect(events.some((event) => event.type === 'safety.intervention')).toBe(true);

      const intervention = events.find(
        (event): event is Extract<ChatEvent, { type: 'safety.intervention' }> =>
          event.type === 'safety.intervention',
      );
      // No score, no level, no warning — ever (non-negotiable #2).
      const serialized = JSON.stringify(intervention?.data);
      expect(serialized).not.toContain('L3');
      expect(serialized).not.toContain('0.9');
      expect(intervention?.data.alternatives.some((option) => option.action === 'find_listener'))
        .toBe(true);
    });

    it('opens a Critical case and punishes nobody', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      await drain(userId, conversation.id, 'rasanya pengin berhenti aja');

      const message = await prisma.aiMessage.findFirstOrThrow({
        where: { conversationId: conversation.id, role: 'user' },
      });
      expect(message.safetyLevel).toBe('L3');

      const moderationCase = await prisma.moderationCase.findFirst({
        where: { targetType: 'ai_message', targetId: message.id },
      });
      expect(moderationCase?.queue).toBe('critical');

      // Nothing punitive was applied to the account.
      const actions = await prisma.moderationAction.count({ where: { targetUserId: userId } });
      expect(actions).toBe(0);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.status).toBe('active');
    });

    it('shows the bridge to a human on a high-risk turn', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      const events = await drain(userId, conversation.id, 'aku capek banget');
      const complete = events.at(-1) as Extract<ChatEvent, { type: 'message.complete' }>;

      expect(complete.data.bridge?.action).toBe('find_listener');
      expect(complete.data.bridge?.prefill.topic).toBe('loneliness');
    });

    it('still replies, and still surfaces resources, when the classifier is down', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);
      provider.failRiskWith = new AiProviderError('timeout', 'local');

      // Wording the local rule engine recognises without any model.
      const events = await drain(userId, conversation.id, 'aku mau bunuh diri malam ini');

      expect(textOf(events)).toBe('Aku di sini.');
      expect(events.some((event) => event.type === 'safety.intervention')).toBe(true);

      const message = await prisma.aiMessage.findFirstOrThrow({
        where: { conversationId: conversation.id, role: 'user' },
      });
      expect(message.safetyLevel).toBe('L3');
    });

    it('carries the earlier signal into the next turn’s instructions', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      await drain(userId, conversation.id, 'aku capek banget');
      provider.risk = { riskScores: { self_harm: 0.01 }, ambiguous: false };
      await drain(userId, conversation.id, 'oke');

      const lastPrompt = provider.systemSuffixes.at(-1) ?? '';
      expect(lastPrompt).toContain('Tetap hadir dan hangat');
      expect(lastPrompt).toContain('jangan menolak membahasnya');
    });
  });

  // -------------------------------------------------------------------------
  // E09-T04 — context window
  // -------------------------------------------------------------------------

  describe('context window', () => {
    it('stays inside the token budget on a long conversation', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      // 60 turns of chunky messages — well past the window.
      const long = 'a'.repeat(600);
      for (let i = 0; i < 30; i += 1) {
        await prisma.aiMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'user',
            body: `${long} ${i}`,
            safetyLevel: 'L0',
          },
        });
        await prisma.aiMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            body: long,
            safetyLevel: 'L0',
          },
        });
      }

      await drain(userId, conversation.id, 'terakhir');

      const sent = provider.systemSuffixes.at(-1) ?? '';
      // Older turns were compacted rather than dropped silently.
      expect(sent).toContain('Konteks percakapan sebelumnya');

      const stored = await prisma.aiConversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
      expect(stored.contextSummary).toBe('dia bercerita soal harinya');
      expect(stored.summarizedThroughId).not.toBeNull();
    });

    it('never loses an earlier safety signal in the summary', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      // An old, high-risk message far outside the window.
      await prisma.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          body: 'a'.repeat(600),
          safetyLevel: 'L3',
        },
      });
      // Enough newer traffic to push that message out of the window entirely.
      for (let i = 0; i < 30; i += 1) {
        await prisma.aiMessage.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            body: 'b'.repeat(600),
            safetyLevel: 'L0',
          },
        });
      }

      await drain(userId, conversation.id, 'halo lagi');

      const sent = provider.systemSuffixes.at(-1) ?? '';
      // Computed from stored levels, not recalled by the summariser — a model
      // that forgets to mention it cannot drop it.
      expect(sent).toContain('Catatan penting');
    });
  });

  // -------------------------------------------------------------------------
  // E09-T08 — quota
  // -------------------------------------------------------------------------

  describe('daily quota', () => {
    it('refuses before the stream opens, with copy and a CTA', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);
      const limit = (await quota.status(userId)).limit;
      await redis.set(`ai:quota:${userId}:${wibDayKey()}`, String(limit));

      const error = await chat
        .preflight(userId, conversation.id)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ApiException);
      expect((error as ApiException).code).toBe('AI_QUOTA_EXCEEDED');
      expect((error as ApiException).message).toContain('Cari Listener');
      expect((error as ApiException).message).not.toMatch(/error|gagal/i);
    });

    it('reports what is left after each turn', async () => {
      const userId = await makeUser();
      const conversation = await conversations.create(userId);

      const events = await drain(userId, conversation.id, 'halo');
      const complete = events.at(-1) as Extract<ChatEvent, { type: 'message.complete' }>;

      expect(complete.data.quota.limit).toBeGreaterThan(0);
      expect(complete.data.quota.remaining).toBe(complete.data.quota.limit - 1);
    });
  });
});
