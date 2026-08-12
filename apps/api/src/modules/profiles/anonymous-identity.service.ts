import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import { randomBytes } from 'node:crypto';

import { PRISMA } from '../../common/prisma.service.js';

/**
 * Per-post anonymous identity — PRD §4.
 *
 * Each anonymous post gets its own code, e.g. `Anonymous #A7392`.
 *
 * The code is drawn at random rather than derived from the user id. A derived
 * code — even a hashed one — would be identical across that user's posts, so
 * anyone could group every anonymous post by the same person just by reading
 * the feed. That is exactly the harm anonymous mode exists to prevent.
 *
 * The `user_id` link stays in the database for moderation and legal
 * obligations and is never exposed through a public API.
 */
@Injectable()
export class AnonymousIdentityService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /** Random code in the shape `A7392`: one letter, four digits. */
  private generateCode(): string {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I and O omitted — they read as 1 and 0
    const bytes = randomBytes(3);
    const letter = letters[(bytes[0] as number) % letters.length] as string;
    const digits = (((bytes[1] as number) << 8) | (bytes[2] as number)) % 10_000;
    return `${letter}${digits.toString().padStart(4, '0')}`;
  }

  async createForPost(userId: string, postId: string): Promise<string> {
    const displayCode = this.generateCode();

    await this.prisma.anonymousIdentity.create({
      data: { userId, postId, displayCode },
    });

    return displayCode;
  }

  /** Display label for a post, or null when the post is not anonymous. */
  async displayCodeForPost(postId: string): Promise<string | null> {
    const identity = await this.prisma.anonymousIdentity.findUnique({
      where: { postId },
      select: { displayCode: true },
    });

    return identity ? `Anonymous #${identity.displayCode}` : null;
  }

  /**
   * Resolves an anonymous post back to its author.
   *
   * Moderation and legal use only. Callers are responsible for writing the
   * audit log entry (PRD §25.6) — this method deliberately does not do it
   * itself, so an unaudited call site stands out in review.
   */
  async authorIdForModeration(postId: string): Promise<string | null> {
    const identity = await this.prisma.anonymousIdentity.findUnique({
      where: { postId },
      select: { userId: true },
    });

    return identity?.userId ?? null;
  }
}
