import { Injectable, Logger } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/**
 * The `/rt` socket, seen from the notification side — E12-T08, TECH-SPEC §3.5.
 *
 * Lives here rather than in the chat module, and receives the namespace by
 * attachment rather than by import, to keep the dependency graph acyclic:
 * `ChatModule → NotificationsModule` in one direction only. The gateway hands
 * its namespace over once at init; everything else in this module talks to
 * sockets through here.
 *
 * Every method is a no-op before that attachment, so a REST call during boot —
 * or a test with no socket server at all — still completes its real work.
 */
@Injectable()
export class NotificationRealtimeService {
  private readonly logger = new Logger(NotificationRealtimeService.name);
  private server: Namespace | null = null;

  attach(server: Namespace): void {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return;

    try {
      this.server.to(userChannel(userId)).emit(event, payload);
    } catch (error) {
      this.logger.warn(`failed to emit ${event} to user`, error);
    }
  }

  /**
   * True when the user has at least one socket connected right now.
   *
   * Used only to decide whether a push would be a second copy of something
   * already on screen (E12-T08). Deliberately *not* stored, exposed or
   * broadcast anywhere: E11 settled that this product has no "user is online"
   * signal, because in a product about private things nobody consented to
   * publishing their presence. This asks the transport a transient question
   * and forgets the answer.
   *
   * Fails to `false` — a doubled notification is a nuisance, a missing one is
   * the person never hearing that somebody replied.
   */
  async hasLiveSocket(userId: string): Promise<boolean> {
    if (!this.server) return false;

    try {
      // Goes through the adapter, so it sees sockets on other API instances
      // via the Redis backplane, not just this process.
      const sockets = await this.server.in(userChannel(userId)).fetchSockets();
      return sockets.length > 0;
    } catch (error) {
      this.logger.warn('presence check failed; assuming offline', error);
      return false;
    }
  }
}

export function userChannel(userId: string): string {
  return `user:${userId}`;
}
