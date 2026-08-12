import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/**
 * The one place anything is pushed into a room — TECH-SPEC §3.5.
 *
 * Exists to break a cycle: the gateway needs the services, and the services
 * (closing a session, surfacing a safety event) need to broadcast. The gateway
 * hands its server here once, and everyone else depends on this instead.
 *
 * Every method is a no-op before the gateway is initialised, so a REST call
 * that arrives during boot — or in a test with no socket server at all — still
 * completes its real work instead of failing on a missing broadcast.
 */
@Injectable()
export class RoomEventsService {
  private readonly logger = new Logger(RoomEventsService.name);
  private server: Namespace | null = null;

  attach(server: Namespace): void {
    this.server = server;
  }

  emit(roomId: string, event: string, payload: unknown): void {
    if (!this.server) return;

    try {
      this.server.to(roomChannel(roomId)).emit(event, payload);
    } catch (error) {
      this.logger.warn(`failed to emit ${event} to room ${roomId}`, error);
    }
  }

  /** Targets one member — used for a warning only the sender should see. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;

    try {
      this.server.to(userChannel(userId)).emit(event, payload);
    } catch (error) {
      this.logger.warn(`failed to emit ${event} to user`, error);
    }
  }
}

export function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function userChannel(userId: string): string {
  return `user:${userId}`;
}
