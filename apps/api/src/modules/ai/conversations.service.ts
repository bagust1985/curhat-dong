import { Inject, Injectable } from '@nestjs/common';
import type { AiPersonality, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { conversationTitle } from './conversation-title.js';

export interface ConversationView {
  id: string;
  title: string | null;
  personalityMode: AiPersonality;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationPage {
  items: ConversationView[];
  nextCursor: string | null;
}

export interface MessageView {
  id: string;
  role: 'user' | 'assistant' | 'system';
  body: string;
  createdAt: Date;
}

export interface MessagePage {
  items: MessageView[];
  nextCursor: string | null;
}

/** Phase 2, behind a flag (PRD §12). */
const FLAGGED_MODES: Partial<Record<AiPersonality, 'ai.personality.journal_companion'>> = {
  journal_companion: 'ai.personality.journal_companion',
};

/**
 * Conversations and history — E09-T01.
 *
 * Every read is scoped by `userId` in the query itself rather than fetched and
 * then checked. A leak here would be the worst privacy failure in the product:
 * these are the things people said when they were not ready to say them to
 * anyone.
 */
@Injectable()
export class ConversationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly flags: FeatureFlagService,
  ) {}

  async list(userId: string, cursor?: string, limit = 20): Promise<ConversationPage> {
    const take = Math.min(Math.max(limit, 1), 50);
    const decoded = decodeCursor(cursor);

    const rows = await this.prisma.aiConversation.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(decoded
          ? {
              OR: [
                { updatedAt: { lt: decoded.at } },
                { updatedAt: decoded.at, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: {
        id: true,
        title: true,
        personalityMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null,
    };
  }

  async create(userId: string, mode: AiPersonality = 'pendengar'): Promise<ConversationView> {
    await this.assertModeAvailable(mode);

    return this.prisma.aiConversation.create({
      data: { userId, personalityMode: mode },
      select: {
        id: true,
        title: true,
        personalityMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Throws 404 — not 403 — when the conversation belongs to somebody else. */
  async requireOwned(userId: string, conversationId: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, userId, deletedAt: null },
    });

    if (!conversation) {
      // Deliberately indistinguishable from "does not exist": a 403 would
      // confirm that a given conversation id is real and belongs to someone.
      throw ApiException.notFound('NOT_FOUND', 'Obrolan itu nggak ada.');
    }

    return conversation;
  }

  /**
   * Switches personality mid-chat.
   *
   * Only the mode changes — history stays, so the conversation continues in a
   * different voice rather than starting over.
   */
  async setMode(
    userId: string,
    conversationId: string,
    mode: AiPersonality,
  ): Promise<ConversationView> {
    await this.requireOwned(userId, conversationId);
    await this.assertModeAvailable(mode);

    return this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { personalityMode: mode },
      select: {
        id: true,
        title: true,
        personalityMode: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async messages(
    userId: string,
    conversationId: string,
    cursor?: string,
    limit = 30,
  ): Promise<MessagePage> {
    await this.requireOwned(userId, conversationId);

    const take = Math.min(Math.max(limit, 1), 100);
    const decoded = decodeCursor(cursor);

    const rows = await this.prisma.aiMessage.findMany({
      where: {
        conversationId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: decoded.at } },
                { createdAt: decoded.at, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      select: { id: true, role: true, body: true, createdAt: true },
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);

    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async remove(userId: string, conversationId: string): Promise<void> {
    await this.requireOwned(userId, conversationId);

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Names an untitled conversation.
   *
   * Called after the first exchange, with a topic label from the classifier —
   * never with the message body (see `conversation-title.ts`).
   */
  async ensureTitle(conversationId: string, topic?: string): Promise<void> {
    const conversation = await this.prisma.aiConversation.findUnique({
      where: { id: conversationId },
      select: { title: true, createdAt: true },
    });

    if (!conversation || conversation.title) return;

    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { title: conversationTitle({ topic, at: conversation.createdAt }) },
    });
  }

  private async assertModeAvailable(mode: AiPersonality): Promise<void> {
    const flag = FLAGGED_MODES[mode];
    if (!flag) return;

    if (!(await this.flags.isEnabled(flag))) {
      throw ApiException.forbidden('FORBIDDEN', 'Mode itu belum tersedia.');
    }
  }
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor?: string): { at: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? null : { at, id };
  } catch {
    return null;
  }
}
