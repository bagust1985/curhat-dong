import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChatMessage } from '@curhat/ai';
import type { PrismaClient, SafetyLevel } from '@curhat/database';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { AiGatewayService } from './ai-gateway.service.js';

const RISKY_LEVELS: SafetyLevel[] = ['L2', 'L3'];

export interface BuiltContext {
  /** The window sent to the model, oldest first. */
  messages: ChatMessage[];
  /** Summary of everything older than the window, or null when it all fits. */
  summary: string | null;
  estimatedTokens: number;
}

/**
 * Rough token estimate.
 *
 * Deliberately provider-agnostic and deliberately pessimistic: an exact count
 * needs the provider's tokenizer, which would put a vendor detail on a hot
 * path whose whole job is to be vendor-neutral. Four characters per token is
 * close enough for Indonesian text to keep a budget honest.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Builds the conversation window — E09-T04.
 *
 * Two things this must never do: exceed the token budget (a long conversation
 * would otherwise get more expensive every turn, forever), and lose an earlier
 * safety signal in the compaction. The second is handled without trusting the
 * summariser: the note is recomputed from stored message levels on every
 * build, so a model that forgets to mention it cannot drop it.
 */
@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly appConfig: AppConfigService,
    private readonly gateway: AiGatewayService,
  ) {}

  async build(conversationId: string, userId: string): Promise<BuiltContext> {
    const [maxMessages, tokenBudget] = await Promise.all([
      this.appConfig.getNumber('ai.context_max_messages'),
      this.appConfig.getNumber('ai.context_token_budget'),
    ]);

    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: { contextSummary: true, summarizedThroughId: true },
    });

    const recent = await this.prisma.aiMessage.findMany({
      where: { conversationId, role: { in: ['user', 'assistant'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: maxMessages,
      select: { id: true, role: true, body: true, createdAt: true, safetyLevel: true },
    });
    recent.reverse();

    // Trim oldest-first until the window fits.
    const window: typeof recent = [];
    let tokens = 0;
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const message = recent[i]!;
      const cost = estimateTokens(message.body);
      if (tokens + cost > tokenBudget && window.length > 0) break;
      window.unshift(message);
      tokens += cost;
    }

    const oldest = window[0];
    const droppedSomething = window.length < recent.length;

    let summary = conversation?.contextSummary ?? null;

    if (droppedSomething && oldest) {
      summary = await this.compact(conversationId, userId, oldest.createdAt, summary);
    }

    const safetyNote = await this.safetyNote(conversationId, oldest?.createdAt ?? null);
    const composed = [summary, safetyNote].filter(Boolean).join('\n\n') || null;

    return {
      messages: window.map((message) => ({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.body,
      })),
      summary: composed,
      estimatedTokens: tokens + estimateTokens(composed ?? ''),
    };
  }

  /**
   * Summarises everything older than the window and stores it.
   *
   * A failure here is not fatal: the turn continues with the window alone and
   * whatever summary already existed. Losing some context is a worse answer;
   * refusing to reply is a worse product.
   */
  private async compact(
    conversationId: string,
    userId: string,
    before: Date,
    existing: string | null,
  ): Promise<string | null> {
    const older = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        role: { in: ['user', 'assistant'] },
        createdAt: { lt: before },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
      select: { id: true, role: true, body: true },
    });

    if (older.length === 0) return existing;

    const transcript = older
      .map((message) => `${message.role === 'assistant' ? 'DONG AI' : 'Dia'}: ${message.body}`)
      .join('\n');

    try {
      const { value } = await this.gateway.summarize(transcript, { userId });

      await this.prisma.aiConversation.update({
        where: { id: conversationId },
        data: {
          contextSummary: value.summary,
          summarizedThroughId: older.at(-1)?.id ?? null,
        },
      });

      return value.summary;
    } catch (error) {
      this.logger.warn(`history compaction failed for conversation ${conversationId}`, error);
      return existing;
    }
  }

  /**
   * The safety signal from compacted history, computed rather than recalled.
   *
   * Carries the level only — never the sentence that produced it. The model
   * needs to know the ground was shaky earlier; it does not need the words
   * back (CLAUDE.md non-negotiable #3 in spirit).
   */
  private async safetyNote(conversationId: string, before: Date | null): Promise<string | null> {
    if (!before) return null;

    const risky = await this.prisma.aiMessage.findFirst({
      where: {
        conversationId,
        role: 'user',
        createdAt: { lt: before },
        safetyLevel: { in: RISKY_LEVELS },
      },
      // The enum is declared L0 → L3, so descending puts the worst first.
      orderBy: { safetyLevel: 'desc' },
      select: { safetyLevel: true },
    });

    if (!risky) return null;

    return risky.safetyLevel === 'L3'
      ? 'Catatan penting: di bagian percakapan yang lebih awal ada tanda dia sedang dalam kondisi berat. Tetap hangat, tetap hadir, dan tawarkan bantuan manusia bila terasa pas.'
      : 'Catatan: di bagian percakapan yang lebih awal ada tanda situasinya sensitif. Jaga nada tetap hati-hati dan hangat.';
  }
}
