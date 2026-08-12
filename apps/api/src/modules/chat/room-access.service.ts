import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, RoomRole } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';

export interface RoomAccess {
  roomId: string;
  userId: string;
  role: RoomRole;
  counterpartId: string;
  status: 'open' | 'closed';
  sessionId: string | null;
}

/**
 * Membership, checked on every sensitive event — E11-T02, TECH-SPEC §3.5.
 *
 * The spec is explicit that the server must verify membership per event rather
 * than once at join, and this file is where that stops being a sentence. A
 * socket that joined legitimately can outlive the membership that justified
 * it: the session closes, someone blocks, someone leaves. Trusting the join
 * would mean a room that stays readable after the reason for reading it ended.
 *
 * One indexed lookup on a composite primary key is the price. It is worth it.
 */
@Injectable()
export class RoomAccessService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Resolves the caller's access, or throws.
   *
   * `requireOpen` separates reading from writing: history stays readable after
   * a session ends, but nothing new can be said into a closed room.
   */
  async require(
    userId: string,
    roomId: string,
    options: { requireOpen?: boolean } = {},
  ): Promise<RoomAccess> {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        status: true,
        members: { select: { userId: true, role: true, leftAt: true } },
        session: { select: { id: true } },
      },
    });

    const membership = room?.members.find((member) => member.userId === userId);

    // Everything unauthorised is a 404: a 403 would confirm that a room id is
    // real and that somebody is in it.
    if (!room || !membership) {
      throw ApiException.notFound('ROOM_NOT_MEMBER', 'Room itu nggak ada.');
    }

    if (membership.leftAt) {
      throw ApiException.forbidden('ROOM_NOT_MEMBER', 'Kamu sudah keluar dari room ini.');
    }

    const counterpart = room.members.find((member) => member.userId !== userId);
    if (!counterpart) {
      throw ApiException.notFound('ROOM_NOT_MEMBER', 'Room itu nggak ada.');
    }

    // A block ends the room for both sides, immediately and in both
    // directions (E03-T11).
    const blocked = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: counterpart.userId },
          { blockerId: counterpart.userId, blockedId: userId },
        ],
      },
      select: { blockerId: true },
    });

    if (blocked) {
      throw ApiException.forbidden('USER_BLOCKED', 'Room ini sudah ditutup.');
    }

    if (options.requireOpen && room.status !== 'open') {
      throw ApiException.forbidden('ROOM_CLOSED', 'Sesi ini sudah selesai.');
    }

    return {
      roomId: room.id,
      userId,
      role: membership.role,
      counterpartId: counterpart.userId,
      status: room.status,
      sessionId: room.session?.id ?? null,
    };
  }

  /** Non-throwing variant for socket handlers that must not crash a connection. */
  async check(
    userId: string,
    roomId: string,
    options: { requireOpen?: boolean } = {},
  ): Promise<{ ok: true; access: RoomAccess } | { ok: false; code: string; message: string }> {
    try {
      return { ok: true, access: await this.require(userId, roomId, options) };
    } catch (error) {
      if (error instanceof ApiException) {
        return { ok: false, code: error.code, message: error.message };
      }
      throw error;
    }
  }

  /** Rooms the user is currently in. */
  async roomIdsFor(userId: string): Promise<string[]> {
    const members = await this.prisma.roomMember.findMany({
      where: { userId, leftAt: null },
      select: { roomId: true },
    });

    return members.map((member) => member.roomId);
  }
}
