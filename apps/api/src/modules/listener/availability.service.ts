import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import { Redis } from 'ioredis';

import { PRISMA } from '../../common/prisma.service.js';
import { REDIS } from '../../common/redis.service.js';

const AVAILABLE_SET = 'listener:available';
/** Presence of this key means the set was built from Postgres recently. */
const SYNC_MARKER = 'listener:available:synced';
const SYNC_TTL_SECONDS = 300;

/**
 * Who is available right now — E10-T03, TECH-SPEC §4.5, §8.1.
 *
 * Postgres holds the truth; Redis holds a set for fast candidate lookup
 * (CLAUDE.md non-negotiable #5). The marker key is what makes that claim
 * testable rather than aspirational: an empty set and a lost set look
 * identical from Redis alone, so the mirror is rebuilt whenever the marker is
 * gone. A flushed cache costs one query, not a matching engine that quietly
 * believes nobody is listening.
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * Sets availability.
   *
   * A listener may go unavailable at any moment, including while an offer is
   * on screen (PRD §11.2). Nothing here checks for that, deliberately — the
   * offer simply stops being answerable, and no state can trap someone in the
   * pool.
   */
  async set(userId: string, isAvailable: boolean): Promise<{ isAvailable: boolean }> {
    await this.prisma.listenerAvailability.upsert({
      where: { userId },
      update: { isAvailable },
      create: { userId, isAvailable },
    });

    await this.mirror(userId, isAvailable);
    return { isAvailable };
  }

  async isAvailable(userId: string): Promise<boolean> {
    const row = await this.prisma.listenerAvailability.findUnique({ where: { userId } });
    return row?.isAvailable ?? false;
  }

  /** The candidate pool. Rebuilt from Postgres whenever the mirror is cold. */
  async availableListenerIds(): Promise<string[]> {
    try {
      const synced = await this.redis.get(SYNC_MARKER);
      if (synced) return await this.redis.smembers(AVAILABLE_SET);
    } catch (error) {
      this.logger.warn('availability mirror unreadable; using Postgres', error);
      return this.fromDatabase();
    }

    return this.rebuild();
  }

  /** Rebuilds the Redis mirror from Postgres and returns the fresh pool. */
  async rebuild(): Promise<string[]> {
    const ids = await this.fromDatabase();

    try {
      const pipeline = this.redis.multi().del(AVAILABLE_SET);
      if (ids.length > 0) pipeline.sadd(AVAILABLE_SET, ...ids);
      pipeline.set(SYNC_MARKER, '1', 'EX', SYNC_TTL_SECONDS);
      await pipeline.exec();
    } catch (error) {
      // The pool is still correct; only the cache is missing.
      this.logger.warn('failed to refresh availability mirror', error);
    }

    return ids;
  }

  private async fromDatabase(): Promise<string[]> {
    const rows = await this.prisma.listenerAvailability.findMany({
      where: { isAvailable: true },
      select: { userId: true },
    });

    return rows.map((row) => row.userId);
  }

  private async mirror(userId: string, isAvailable: boolean): Promise<void> {
    try {
      if (isAvailable) {
        await this.redis.sadd(AVAILABLE_SET, userId);
      } else {
        await this.redis.srem(AVAILABLE_SET, userId);
      }
    } catch (error) {
      // Postgres already has the truth, and the mirror self-heals on the next
      // rebuild — so this is a warning, not a failed request.
      this.logger.warn('failed to mirror availability into Redis', error);
    }
  }
}
