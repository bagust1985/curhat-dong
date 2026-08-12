import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AiProviderError, composeSystemPrompt } from '@curhat/ai';
import type { AiPersonality, PrismaClient, SafetyLevel } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import type { SupportiveIntervention } from '../safety/support-resources.service.js';
import { AiGatewayService } from './ai-gateway.service.js';
import { AiQuotaService, type QuotaStatus } from './ai-quota.service.js';
import { decideBridge, type BridgeCard } from './ai-bridge.js';
import { ChatSafetyService, type InChatSafety } from './chat-safety.service.js';
import { ContextBuilderService } from './context-builder.service.js';
import { ConversationsService } from './conversations.service.js';
import { PromptRegistryService } from './prompt-registry.service.js';
import { PERSONA_PROMPT_KEYS } from './personality.js';

export type ChatEvent =
  | { type: 'message.start'; data: { conversationId: string; messageId: string } }
  | { type: 'message.delta'; data: { text: string } }
  | { type: 'safety.intervention'; data: SupportiveIntervention }
  | {
      type: 'message.complete';
      data: {
        messageId: string;
        bridge: BridgeCard | null;
        quota: { remaining: number; limit: number };
      };
    }
  | { type: 'error'; data: { code: string; message: string } };

/**
 * One DONG AI turn, from user message to persisted reply — E09-T03.
 *
 * The order below is the design:
 *
 *   1. persist what the user said (they said it; that is a fact);
 *   2. start risk classification and *do not wait for it*;
 *   3. stream the reply;
 *   4. fold the classification result in once it lands.
 *
 * Step 2 is why safety costs no latency here (TECH-SPEC §4.3), and step 3
 * never consults it — DONG AI does not go quiet because a score came back
 * high (PRD §15.5).
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly conversations: ConversationsService,
    private readonly context: ContextBuilderService,
    private readonly prompts: PromptRegistryService,
    private readonly gateway: AiGatewayService,
    private readonly quota: AiQuotaService,
    private readonly safety: ChatSafetyService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Everything that must fail as a normal HTTP error.
   *
   * Runs before the controller writes SSE headers, because after that the
   * status code is already 200 and a quota message would arrive as an error
   * event rather than the warm copy it is meant to be (E09-T08).
   */
  async preflight(userId: string, conversationId: string): Promise<QuotaStatus> {
    await this.conversations.requireOwned(userId, conversationId);
    return this.quota.assertAvailable(userId);
  }

  async *send(input: {
    userId: string;
    conversationId: string;
    text: string;
  }): AsyncGenerator<ChatEvent> {
    const conversation = await this.conversations.requireOwned(
      input.userId,
      input.conversationId,
    );

    const userMessage = await this.prisma.aiMessage.create({
      data: {
        conversationId: input.conversationId,
        role: 'user',
        body: input.text,
        safetyLevel: 'pending',
      },
      select: { id: true },
    });

    // Started here, awaited after the stream. Anything that throws inside is
    // captured now so an unhandled rejection cannot take the process down
    // while the reply is still streaming.
    const safetyPromise = this.safety
      .assess({ userId: input.userId, messageId: userMessage.id, text: input.text })
      .catch((error: unknown) => {
        this.logger.error('in-chat safety assessment failed outright', error);
        return null;
      });

    const assistantMessageId = randomUUID();
    yield {
      type: 'message.start',
      data: { conversationId: input.conversationId, messageId: assistantMessageId },
    };

    let reply = '';
    let provider: string | undefined;
    let model: string | undefined;
    let tokensIn = 0;
    let tokensOut = 0;

    try {
      // Built once per turn: compaction is itself a paid model call, so a
      // second build would quietly double the cost of every long conversation.
      const history = await this.context.build(input.conversationId, input.userId);
      const systemSuffix = await this.buildSystemSuffix({
        conversationId: input.conversationId,
        mode: conversation.personalityMode,
        summary: history.summary,
        excludeMessageId: userMessage.id,
      });

      const stream = this.gateway.chat(
        {
          messages: [...history.messages, { role: 'user', content: input.text }],
          systemSuffix,
        },
        { userId: input.userId },
      );

      for await (const chunk of stream) {
        if (chunk.text) {
          reply += chunk.text;
          yield { type: 'message.delta', data: { text: chunk.text } };
        }
        if (chunk.done) {
          provider = chunk.provider;
          model = chunk.model;
          tokensIn = chunk.usage?.tokensIn ?? 0;
          tokensOut = chunk.usage?.tokensOut ?? 0;
        }
      }
    } catch (error) {
      const safety = await safetyPromise;
      if (safety?.showIntervention && safety.intervention) {
        // The reply failed; the resources still go out. A provider outage must
        // not be the reason someone in crisis sees nothing.
        yield { type: 'safety.intervention', data: safety.intervention };
      }

      yield { type: 'error', data: describeFailure(error) };
      this.logger.error('DONG AI turn failed', error);
      return;
    }

    // Reaching here means the stream finished cleanly: a failure returns from
    // the catch above, and a disconnected client stops the generator at a
    // `yield`, so nothing below ever runs for a half-delivered reply.
    const safety = await safetyPromise;

    if (safety?.showIntervention && safety.intervention) {
      yield { type: 'safety.intervention', data: safety.intervention };
    }

    // Persisted only after a clean finish. A half-delivered reply that was cut
    // off by a dropped connection must not be stored as if it were the whole
    // answer (E09-T03).
    await this.prisma.aiMessage.create({
      data: {
        id: assistantMessageId,
        conversationId: input.conversationId,
        role: 'assistant',
        body: reply,
        safetyLevel: 'L0',
        tokensIn,
        tokensOut,
        ...(model ? { model } : {}),
        ...(provider ? { provider: provider as 'anthropic' | 'openai' | 'local' } : {}),
      },
    });

    await this.prisma.aiConversation.update({
      where: { id: input.conversationId },
      data: { updatedAt: new Date() },
    });

    await this.conversations.ensureTitle(input.conversationId, safety?.topic);

    const bridge = await this.bridgeFor(input.conversationId, safety);
    const quota = await this.quota.status(input.userId);

    yield {
      type: 'message.complete',
      data: {
        messageId: assistantMessageId,
        bridge,
        quota: { remaining: quota.remaining, limit: quota.limit },
      },
    };
  }

  /**
   * Base rules + persona + recalled context, in that order.
   *
   * The supportive hint comes from the *previous* turn's level, since this
   * turn's classification is still running. That is the trade the parallel
   * design makes: a turn of delay on tone, no delay on the reply.
   */
  private async buildSystemSuffix(input: {
    conversationId: string;
    mode: AiPersonality;
    summary: string | null;
    excludeMessageId: string;
  }): Promise<string> {
    const [persona, priorLevel] = await Promise.all([
      this.prompts.active(PERSONA_PROMPT_KEYS[input.mode]),
      this.lastAssessedLevel(input.conversationId, input.excludeMessageId),
    ]);

    const hint = ChatSafetyService.supportiveHint(priorLevel);
    const parts = [persona.template, ...(hint ? [hint] : [])].join('\n\n');

    // `chat.system` is applied by the gateway as the versioned base prompt;
    // everything here is layered after it and can never replace it.
    return composeSystemPrompt({ base: parts, context: input.summary ?? undefined });
  }

  /**
   * The level of the newest *earlier* message.
   *
   * The current message is excluded by id rather than by its `pending` level:
   * its own classification runs in parallel and can land first, in which case
   * "the previous level" would silently become "this one's level" — and a turn
   * that just came back clean would erase the caution earned by the turn
   * before it.
   */
  private async lastAssessedLevel(
    conversationId: string,
    excludeMessageId: string,
  ): Promise<SafetyLevel> {
    const last = await this.prisma.aiMessage.findFirst({
      where: {
        conversationId,
        role: 'user',
        id: { not: excludeMessageId },
        safetyLevel: { not: 'pending' },
      },
      orderBy: { createdAt: 'desc' },
      select: { safetyLevel: true },
    });

    return last?.safetyLevel ?? 'L0';
  }

  private async bridgeFor(
    conversationId: string,
    safety: InChatSafety | null,
  ): Promise<BridgeCard | null> {
    const [minTurns, cooldownTurns] = await Promise.all([
      this.appConfig.getNumber('ai.bridge_min_turns'),
      this.appConfig.getNumber('ai.bridge_cooldown_turns'),
    ]);

    const assistantTurns = await this.prisma.aiMessage.count({
      where: { conversationId, role: 'assistant' },
    });

    const decision = decideBridge({
      level: safety?.level ?? 'L0',
      assistantTurns,
      minTurns,
      cooldownTurns,
      topic: safety?.topic,
      emotion: safety?.emotion,
    });

    return decision.card ?? null;
  }
}

function describeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ApiException) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof AiProviderError) {
    return {
      code: 'AI_PROVIDER_UNAVAILABLE',
      message: 'DONG AI lagi tidak bisa dihubungi. Coba lagi sebentar lagi ya.',
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'Ada gangguan sebentar. Coba lagi ya.',
  };
}
