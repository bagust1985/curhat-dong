import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { RoomEventsService } from './room-events.service.js';
import { RoomMessagesService, type RoomMessagePage } from './room-messages.service.js';
import {
  closeRoomSchema,
  feedbackSchema,
  roomMessageQuerySchema,
  sendMessageSchema,
  type CloseRoomDto,
  type FeedbackDto,
  type RoomMessageQueryDto,
  type SendMessageDto,
} from './rooms.dto.js';
import {
  RoomsService,
  type CloseResult,
  type RoomDetail,
  type RoomSummary,
} from './rooms.service.js';

/**
 * REST surface for rooms — TECH-SPEC §3.4.
 *
 * Realtime lives on the `/rt` socket; this is history, lifecycle and the
 * actions in the room header. The REST send endpoint exists as the fallback
 * for a client whose socket is down — the same persistence path, so a message
 * sent either way behaves identically.
 */
@Controller()
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly messages: RoomMessagesService,
    private readonly events: RoomEventsService,
  ) {}

  @Get('rooms')
  async list(@CurrentUser() user: AuthenticatedUser): Promise<RoomSummary[]> {
    return this.rooms.list(user.userId);
  }

  @Get('rooms/:id')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<RoomDetail> {
    return this.rooms.detail(user.userId, id);
  }

  @Post('rooms/:id/notice-ack')
  async acknowledgeNotice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'ok' }> {
    await this.rooms.acknowledgeNotice(user.userId, id);
    return { status: 'ok' };
  }

  @Get('rooms/:id/messages')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(roomMessageQuerySchema)) query: RoomMessageQueryDto,
  ): Promise<RoomMessagePage> {
    return this.messages.history(user.userId, id, query.cursor, query.limit);
  }

  @Post('rooms/:id/messages')
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(sendMessageSchema)) body: SendMessageDto,
  ) {
    const { message, duplicate } = await this.messages.create({
      userId: user.userId,
      roomId: id,
      body: body.body,
      clientMessageId: body.clientMessageId,
    });

    if (!duplicate) this.events.emit(id, 'room:message', message);
    return message;
  }

  @Post('rooms/:id/close')
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closeRoomSchema)) body: CloseRoomDto,
  ): Promise<CloseResult> {
    const result = await this.rooms.close(user.userId, id, body.reason);
    this.events.emit(id, 'room:closed', { roomId: id, endReason: result.endReason });
    return result;
  }

  @Post('rooms/:id/feedback')
  async feedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(feedbackSchema)) body: FeedbackDto,
  ): Promise<{ recorded: boolean; message: string }> {
    return this.rooms.feedback(user.userId, id, body);
  }

  @Post('rooms/:id/block')
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'blocked' }> {
    const result = await this.rooms.blockCounterpart(user.userId, id);
    this.events.emit(id, 'room:closed', { roomId: id, endReason: 'blocked' });
    return result;
  }
}
