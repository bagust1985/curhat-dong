import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';

import { PRISMA } from '../../common/prisma.service.js';
import { RoomAccessService } from './room-access.service.js';

export interface RoomMessageView {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
  clientMessageId: string | null;
}

export interface RoomMessagePage {
  items: RoomMessageView[];
  nextCursor: string | null;
}

/**
 * Room messages — E11-T03, TECH-SPEC §3.5, §8.3.
 *
 * Persist first, broadcast second. The other order is faster and produces the
 * worst bug this feature can have: a message both people saw, discussed, and
 * then lost on refresh.
 */
@Injectable()
export class RoomMessagesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly access: RoomAccessService,
  ) {}

  /**
   * Stores a message.
   *
   * `clientMessageId` makes the write idempotent: a client that reconnects
   * mid-send retries, and a retry must not become a second message. Returning
   * the original row rather than erroring keeps that invisible to the sender.
   */
  async create(input: {
    userId: string;
    roomId: string;
    body: string;
    clientMessageId?: string | undefined;
  }): Promise<{ message: RoomMessageView; duplicate: boolean }> {
    await this.access.require(input.userId, input.roomId, { requireOpen: true });

    if (input.clientMessageId) {
      const existing = await this.prisma.message.findUnique({
        where: {
          roomId_clientMessageId: {
            roomId: input.roomId,
            clientMessageId: input.clientMessageId,
          },
        },
      });

      if (existing) return { message: toView(existing), duplicate: true };
    }

    try {
      const message = await this.prisma.message.create({
        data: {
          roomId: input.roomId,
          senderId: input.userId,
          body: input.body,
          ...(input.clientMessageId ? { clientMessageId: input.clientMessageId } : {}),
        },
      });

      return { message: toView(message), duplicate: false };
    } catch (error) {
      // Two retries in flight at once: the unique index settles it, and the
      // message that already exists is the right answer for both.
      if (isUniqueViolation(error) && input.clientMessageId) {
        const existing = await this.prisma.message.findUnique({
          where: {
            roomId_clientMessageId: {
              roomId: input.roomId,
              clientMessageId: input.clientMessageId,
            },
          },
        });
        if (existing) return { message: toView(existing), duplicate: true };
      }
      throw error;
    }
  }

  /** History stays readable after a session ends; only writing stops. */
  async history(
    userId: string,
    roomId: string,
    cursor?: string,
    limit = 50,
  ): Promise<RoomMessagePage> {
    await this.access.require(userId, roomId);

    const take = Math.min(Math.max(limit, 1), 100);
    const decoded = decodeCursor(cursor);

    const rows = await this.prisma.message.findMany({
      where: {
        roomId,
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
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    const last = items.at(-1);

    return {
      items: items.map(toView),
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  /** Last activity in a room, used by the idle sweep and the room list. */
  async lastActivityAt(roomId: string): Promise<Date | null> {
    const last = await this.prisma.message.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return last?.createdAt ?? null;
  }
}

function toView(message: {
  id: string;
  senderId: string;
  body: string;
  createdAt: Date;
  clientMessageId: string | null;
}): RoomMessageView {
  return {
    id: message.id,
    senderId: message.senderId,
    body: message.body,
    createdAt: message.createdAt,
    clientMessageId: message.clientMessageId,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
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
