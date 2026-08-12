import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { FeatureFlagService } from '../feature-flags/feature-flags.service.js';
import { AiChatService, type ChatEvent } from './ai-chat.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import {
  conversationQuerySchema,
  createConversationSchema,
  messageQuerySchema,
  sendMessageSchema,
  setModeSchema,
  type ConversationQueryDto,
  type CreateConversationDto,
  type MessageQueryDto,
  type SendMessageDto,
  type SetModeDto,
} from './ai.dto.js';
import {
  ConversationsService,
  type ConversationPage,
  type ConversationView,
  type MessagePage,
} from './conversations.service.js';
import { AI_DISCLAIMER, PERSONALITIES } from './personality.js';

/** Sent every 15s so proxies do not treat a thinking model as a dead socket. */
const HEARTBEAT_MS = 15_000;

@Controller('ai')
export class AiController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly chat: AiChatService,
    private readonly quota: AiQuotaService,
    private readonly flags: FeatureFlagService,
  ) {}

  /** Modes, the permanent disclaimer, and today's quota (DESIGN-REF §2.8b/c). */
  @Get('personalities')
  async personalities(@CurrentUser() user: AuthenticatedUser) {
    const modes = await Promise.all(
      PERSONALITIES.map(async (option) => ({
        mode: option.mode,
        label: option.label,
        description: option.description,
        available: option.flag ? await this.flags.isEnabled(option.flag) : true,
      })),
    );

    const quota = await this.quota.status(user.userId);

    return {
      modes,
      disclaimer: AI_DISCLAIMER,
      quota: { remaining: quota.remaining, limit: quota.limit },
    };
  }

  @Get('conversations')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(conversationQuerySchema)) query: ConversationQueryDto,
  ): Promise<ConversationPage> {
    return this.conversations.list(user.userId, query.cursor, query.limit);
  }

  @Post('conversations')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createConversationSchema)) body: CreateConversationDto,
  ): Promise<ConversationView> {
    return this.conversations.create(user.userId, body.personalityMode);
  }

  @Get('conversations/:id/messages')
  async messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(messageQuerySchema)) query: MessageQueryDto,
  ): Promise<MessagePage> {
    return this.conversations.messages(user.userId, id, query.cursor, query.limit);
  }

  @Put('conversations/:id/mode')
  async setMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setModeSchema)) body: SetModeDto,
  ): Promise<ConversationView> {
    return this.conversations.setMode(user.userId, id, body.personalityMode);
  }

  @Delete('conversations/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'deleted' }> {
    await this.conversations.remove(user.userId, id);
    return { status: 'deleted' };
  }

  /**
   * Streams a reply over SSE — TECH-SPEC §3.3.
   *
   * `@Res()` rather than Nest's `@Sse()`: the global response interceptor
   * would otherwise wrap every frame in the `{ data, meta, error }` envelope,
   * and a stream of envelopes is not what the event contract says.
   *
   * Ownership and quota are checked *before* the first byte, because once the
   * headers say 200 there is no way back to a 429 (E09-T08).
   */
  @Post('conversations/:id/messages')
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.chat.preflight(user.userId, id);

    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    // Tells nginx-style proxies not to buffer, which would hold the whole
    // reply back and defeat the point of streaming.
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    let clientGone = false;
    res.on('close', () => {
      clientGone = true;
    });

    const heartbeat = setInterval(() => {
      if (!clientGone) res.write(': ping\n\n');
    }, HEARTBEAT_MS);

    try {
      for await (const event of this.chat.send({
        userId: user.userId,
        conversationId: id,
        text: body.body,
      })) {
        // Breaking here runs the generator's cleanup, which is what stops the
        // provider stream and prevents a half reply being stored as final.
        if (clientGone) break;
        res.write(frame(event));
      }
    } finally {
      clearInterval(heartbeat);
      if (!clientGone) res.end();
    }
  }
}

function frame(event: ChatEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
