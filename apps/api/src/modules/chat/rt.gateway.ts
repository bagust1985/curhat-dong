import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { verifyAccessToken } from '@curhat/auth';
import type { ServerEnv } from '@curhat/config/env/server';
import type { Namespace, Socket } from 'socket.io';

import { ENV } from '../../config/env.config.js';
import { SessionService } from '../auth/session.service.js';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service.js';
import { MessageSafetyService } from './message-safety.service.js';
import { PresenceService } from './presence.service.js';
import { RoomAccessService } from './room-access.service.js';
import { RoomEventsService, roomChannel, userChannel } from './room-events.service.js';
import { RoomMessagesService } from './room-messages.service.js';

interface SocketData {
  userId: string;
  sessionId: string;
  token: string;
}

type AuthedSocket = Socket & { data: SocketData };

/**
 * Realtime namespace `/rt` — E11-T01 to T05, TECH-SPEC §3.5.
 *
 * Two rules shape everything here.
 *
 * First, the handshake authenticates and every sensitive event re-checks:
 * the token is re-verified (cheap, no I/O) and membership is re-read from the
 * database (E11-T02). A socket outlives the reason it was allowed to exist —
 * sessions close, people block each other — so "it joined successfully" is not
 * an authorisation.
 *
 * Second, a message is persisted before it is broadcast, and classified after.
 * Delivery stays under the 2s target (TECH-SPEC §8.3) and no verdict can
 * withhold it (PRD §15.5).
 */
@WebSocketGateway({
  namespace: '/rt',
  // The browser client connects cross-origin from the web app.
  cors: { origin: true, credentials: true },
})
export class RtGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RtGateway.name);

  constructor(
    @Inject(ENV) private readonly env: ServerEnv,
    private readonly sessions: SessionService,
    private readonly access: RoomAccessService,
    private readonly messages: RoomMessagesService,
    private readonly safety: MessageSafetyService,
    private readonly presence: PresenceService,
    private readonly events: RoomEventsService,
    private readonly notificationRealtime: NotificationRealtimeService,
  ) {}

  /**
   * Installs handshake authentication and hands the namespace to
   * `RoomEventsService` so services can broadcast.
   *
   * Authentication is middleware rather than `handleConnection` on purpose.
   * `connect` fires on the client as soon as the transport is up, and a fast
   * client emits immediately — before a `handleConnection` doing database work
   * has finished deciding who it is. Middleware runs *before* the connection
   * completes, so an event can never arrive on a socket whose identity is
   * still being resolved.
   *
   * The Redis backplane is installed on the server itself (`RedisIoAdapter`),
   * not swapped in here — see that file for why late swapping breaks rooms.
   */
  afterInit(server: Namespace): void {
    this.events.attach(server);
    // Notifications reach a connected user over this same namespace (E12-T08).
    // Handed over rather than imported so the module graph stays acyclic.
    this.notificationRealtime.attach(server);

    server.use((socket, next) => {
      void this.authenticate(socket)
        .then((error) => next(error ?? undefined))
        .catch((error: unknown) => {
          this.logger.error('handshake failed', error);
          next(handshakeError('INTERNAL_ERROR', 'Ada gangguan sebentar. Coba lagi ya.'));
        });
    });
  }

  /** Returns an error to refuse the handshake, or null to let it through. */
  private async authenticate(socket: Socket): Promise<Error | null> {
    const token = extractToken(socket);
    if (!token) return handshakeError('UNAUTHORIZED', 'Kamu perlu masuk dulu.');

    const result = await verifyAccessToken(token, this.env.JWT_ACCESS_SECRET);
    if (!result.ok) {
      return handshakeError(
        result.reason === 'expired' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
        'Sesi kamu sudah lewat. Masuk lagi ya.',
      );
    }

    // A signature is not enough: the session may have been revoked by
    // logout-all or a ban while the token is still inside its 15 minutes.
    if (!(await this.sessions.isSessionActive(result.claims.sid))) {
      return handshakeError('AUTH_TOKEN_INVALID', 'Sesi sudah berakhir. Masuk lagi ya.');
    }

    socket.data = { userId: result.claims.sub, sessionId: result.claims.sid, token };
    return null;
  }

  async handleConnection(socket: Socket): Promise<void> {
    const data = socket.data as Partial<SocketData>;
    if (!data.userId) return;

    // A personal channel, so a warning meant for one side of a room does not
    // reach the other.
    await socket.join(userChannel(data.userId));
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const data = socket.data as Partial<SocketData>;
    if (!data.userId) return;

    for (const channel of socket.rooms) {
      if (!channel.startsWith('room:')) continue;
      const roomId = channel.slice('room:'.length);

      await this.presence.leave(roomId, data.userId);
      this.events.emit(roomId, 'room:presence', { userId: data.userId, online: false });
    }
  }

  @SubscribeMessage('room:join')
  async onJoin(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ): Promise<{ ok: boolean; code?: string; message?: string }> {
    const guard = await this.guard(socket, body?.roomId);
    if (!guard.ok) return guard;

    await socket.join(roomChannel(guard.roomId));
    await this.presence.touch(guard.roomId, socket.data.userId);

    this.events.emit(guard.roomId, 'room:presence', {
      userId: socket.data.userId,
      online: true,
    });

    return { ok: true };
  }

  @SubscribeMessage('room:leave')
  async onLeave(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ): Promise<{ ok: boolean }> {
    const roomId = body?.roomId;
    if (!roomId || !socket.data?.userId) return { ok: false };

    await socket.leave(roomChannel(roomId));
    await this.presence.leave(roomId, socket.data.userId);
    this.events.emit(roomId, 'room:presence', { userId: socket.data.userId, online: false });

    return { ok: true };
  }

  @SubscribeMessage('room:typing')
  async onTyping(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { roomId?: string },
  ): Promise<{ ok: boolean; code?: string; message?: string }> {
    const guard = await this.guard(socket, body?.roomId, { requireOpen: true });
    if (!guard.ok) return guard;

    await this.presence.touch(guard.roomId, socket.data.userId);

    // Throttled: a per-keystroke stream would flood the socket and say nothing
    // "still typing" has not already said.
    if (await this.presence.allowTyping(guard.roomId, socket.data.userId)) {
      socket
        .to(roomChannel(guard.roomId))
        .emit('room:typing', { userId: socket.data.userId });
    }

    return { ok: true };
  }

  @SubscribeMessage('room:message')
  async onMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { roomId?: string; body?: string; clientMessageId?: string },
  ): Promise<{ ok: boolean; code?: string; message?: string; messageId?: string }> {
    const guard = await this.guard(socket, body?.roomId, { requireOpen: true });
    if (!guard.ok) return guard;

    const text = (body?.body ?? '').trim();
    if (text.length === 0 || text.length > 4_000) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Pesannya kosong atau kepanjangan.' };
    }

    const { message, duplicate } = await this.messages.create({
      userId: socket.data.userId,
      roomId: guard.roomId,
      body: text,
      clientMessageId: body?.clientMessageId,
    });

    // Persisted first, so what both people see is what a refresh will show.
    if (!duplicate) {
      this.events.emit(guard.roomId, 'room:message', message);
      await this.presence.touch(guard.roomId, socket.data.userId);
      this.classifyInBackground(guard.roomId, message.id, socket.data.userId, text);
    }

    return { ok: true, messageId: message.id };
  }

  /**
   * Classification runs after delivery and never blocks it.
   *
   * Actions are additive at every level: resources, a warning, a moderation
   * case. Nothing here can retract the message or close the room — including
   * at L3, where doing so would cut off the person who needs it most
   * (PRD §15.5).
   */
  private classifyInBackground(
    roomId: string,
    messageId: string,
    senderId: string,
    text: string,
  ): void {
    void this.safety
      .assess({ messageId, senderId, text })
      .then((verdict) => {
        if (verdict.level === 'L3' && verdict.intervention) {
          this.events.emit(roomId, 'room:safety', {
            level: 'support',
            intervention: verdict.intervention,
          });
          return;
        }

        if (verdict.targetDirected) {
          // The sender is told; the other person is handed the buttons.
          this.events.emitToUser(senderId, 'room:safety', {
            level: 'warning',
            message:
              'Pesan tadi kelihatan menyerang lawan bicaramu. Tetap jaga cara ngomongmu ya.',
          });
          this.events.emit(roomId, 'room:safety', {
            level: 'report_offered',
            actions: ['report', 'block'],
          });
        }
      })
      .catch((error: unknown) => {
        // Reason logged, message content never (non-negotiable #3).
        this.logger.error(`room message classification failed for ${messageId}`, error);
      });
  }

  /**
   * Re-authenticates and re-authorises one event.
   *
   * The token check is a local HMAC verify, so it costs nothing and catches a
   * token that expired while the socket stayed open. Membership is re-read
   * because that is what TECH-SPEC §3.5 asks for, and because it is the part
   * that actually changes underneath a live connection.
   */
  private async guard(
    socket: AuthedSocket,
    roomId: string | undefined,
    options: { requireOpen?: boolean } = {},
  ): Promise<
    { ok: true; roomId: string } | { ok: false; code: string; message: string }
  > {
    if (!socket.data?.userId) {
      socket.disconnect(true);
      return { ok: false, code: 'UNAUTHORIZED', message: 'Kamu perlu masuk dulu.' };
    }

    if (!roomId) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Room-nya mana?' };
    }

    const token = await verifyAccessToken(socket.data.token, this.env.JWT_ACCESS_SECRET);
    if (!token.ok) {
      socket.emit('auth:expired', {
        code: token.reason === 'expired' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
        message: 'Sesi kamu sudah lewat. Masuk lagi ya.',
      });
      socket.disconnect(true);
      return { ok: false, code: 'AUTH_TOKEN_EXPIRED', message: 'Sesi kamu sudah lewat.' };
    }

    const access = await this.access.check(socket.data.userId, roomId, options);
    if (!access.ok) return { ok: false, code: access.code, message: access.message };

    return { ok: true, roomId };
  }

}

/**
 * A refusal the client can branch on.
 *
 * socket.io-client surfaces `data` on the `connect_error` it raises, so the
 * client sees a stable code rather than having to match on Indonesian copy.
 */
function handshakeError(code: string, message: string): Error {
  return Object.assign(new Error(message), { data: { code, message } });
}

function extractToken(socket: Socket): string | null {
  const fromAuth = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);

  return null;
}
