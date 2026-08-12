import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigService } from '../../common/app-config.service.js';
import { REDIS } from '../../common/redis.service.js';

/**
 * Presence and typing — E11-T04, TECH-SPEC §3.5.
 *
 * Scoped to one room and nothing else: there is no "is this person online"
 * anywhere in the product, only "is the person you are talking to still here".
 * A global presence signal would leak when someone is on the app, which on a
 * product about private struggles is information nobody agreed to publish.
 *
 * Entries expire rather than being deleted on disconnect. A dropped connection
 * never gets to run cleanup, and an "online" that lies is worse than no
 * presence at all.
 */
@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly appConfig: AppConfigService,
  ) {}

  /** Marks the user present and refreshes the expiry. Called on join and heartbeat. */
  async touch(roomId: string, userId: string): Promise<void> {
    const ttl = await this.appConfig.getNumber('room.presence_ttl_seconds');

    await this.redis
      .set(this.key(roomId, userId), '1', 'EX', ttl)
      .catch((error: unknown) => this.logger.warn('presence write failed', error));
  }

  async leave(roomId: string, userId: string): Promise<void> {
    await this.redis.del(this.key(roomId, userId)).catch(() => undefined);
  }

  async isOnline(roomId: string, userId: string): Promise<boolean> {
    try {
      return (await this.redis.exists(this.key(roomId, userId))) === 1;
    } catch (error) {
      // Unknown, so say offline: claiming someone is there when we cannot tell
      // is the answer that misleads.
      this.logger.warn('presence read failed', error);
      return false;
    }
  }

  /**
   * Allows a typing broadcast at most once per throttle window.
   *
   * A keystroke-per-event stream would flood the socket and tell the other
   * person nothing more than "still typing" already does.
   */
  async allowTyping(roomId: string, userId: string): Promise<boolean> {
    const seconds = await this.appConfig.getNumber('room.typing_throttle_seconds');

    try {
      const set = await this.redis.set(
        `typing:${roomId}:${userId}`,
        '1',
        'EX',
        Math.max(1, seconds),
        'NX',
      );
      return set !== null;
    } catch (error) {
      // Throttling is a courtesy to the connection, not a safety control.
      this.logger.warn('typing throttle unavailable; allowing', error);
      return true;
    }
  }

  private key(roomId: string, userId: string): string {
    return `presence:${roomId}:${userId}`;
  }
}
