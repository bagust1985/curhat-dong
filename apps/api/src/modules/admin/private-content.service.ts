import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient, SafetyTarget } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { AuditService } from './audit.service.js';

/**
 * The banner an admin sees *before* the content opens, never after.
 *
 * Served from the API so the web panel cannot quietly soften it, and worded to
 * say the one thing that changes behaviour: this is attributable to you, by
 * name, permanently.
 */
export const PRIVATE_ACCESS_NOTICE =
  'Kamu akan membuka isi percakapan privat. Akses ini dicatat permanen bersama ' +
  'namamu dan nomor case-nya, dan bisa ditinjau kapan saja. Buka hanya sebatas ' +
  'yang diperlukan untuk menangani case ini.';

export interface PrivateContentRequest {
  adminId: string;
  caseId: string;
  targetType: SafetyTarget;
  targetId: string;
  ipHash?: string | undefined;
}

export interface PrivateMessageView {
  id: string;
  /** Sender's role in the room, never their alias or id. */
  senderRole: 'requester' | 'listener' | 'unknown';
  body: string;
  safetyLevel: string;
  createdAt: Date;
}

export interface PrivateRoomView {
  roomId: string;
  status: string;
  messages: PrivateMessageView[];
  caseId: string;
  /** Repeated in the payload so a client cannot render the content without it. */
  notice: string;
}

/**
 * Case-gated access to private conversation — E14-T04. PRD §15, §25.6.
 *
 * The rule is "no active case, no access", and the way it is kept is that
 * *this service is the only way in*. There is no admin endpoint that reads a
 * room message by id, no listing that includes message bodies, and no debug
 * route. Anything that wants private content comes through `openRoom`, which
 * cannot be called without a case id and cannot complete without writing an
 * audit row.
 *
 * The audit write happens **before** the content is returned, and is awaited.
 * Writing it afterwards would mean a crash, a timeout or a disconnect between
 * the two leaves an access with no record — and the accesses worth hiding are
 * exactly the ones someone would be willing to interrupt.
 */
@Injectable()
export class PrivateContentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
  ) {}

  /** The confirmation text, fetched before the admin commits to opening. */
  notice(): { notice: string } {
    return { notice: PRIVATE_ACCESS_NOTICE };
  }

  /**
   * Opens a private room for a case.
   *
   * Four things must hold, and each is checked here rather than trusted to the
   * caller: the case exists, it is still open, it points at this room, and the
   * access gets logged.
   *
   * The "points at this room" check is the one that is easy to omit and the
   * one that matters most — without it, any open case anywhere becomes a
   * skeleton key for every private conversation on the platform.
   */
  async openRoom(request: PrivateContentRequest): Promise<PrivateRoomView> {
    const moderationCase = await this.prisma.moderationCase.findUnique({
      where: { id: request.caseId },
      select: { id: true, status: true, targetType: true, targetId: true },
    });

    if (!moderationCase) {
      await this.recordDenied(request, 'case_not_found');
      throw ApiException.forbidden('ADMIN_CASE_REQUIRED', 'Akses konten privat butuh case aktif.');
    }

    if (moderationCase.status === 'resolved') {
      // A closed case is not a standing licence to keep reading.
      await this.recordDenied(request, 'case_closed');
      throw ApiException.forbidden('ADMIN_CASE_REQUIRED', 'Case ini sudah ditutup.');
    }

    const roomId = await this.roomForCase(moderationCase.targetType, moderationCase.targetId);

    if (!roomId || roomId !== request.targetId) {
      await this.recordDenied(request, 'case_target_mismatch');
      throw ApiException.forbidden(
        'ADMIN_CASE_REQUIRED',
        'Case ini tidak menunjuk ke percakapan tersebut.',
      );
    }

    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        status: true,
        members: { select: { userId: true, role: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, senderId: true, body: true, safetyLevel: true, createdAt: true },
        },
      },
    });

    if (!room) {
      await this.recordDenied(request, 'room_not_found');
      throw ApiException.notFound('NOT_FOUND', 'Percakapan itu sudah tidak ada.');
    }

    // Awaited before the content is returned — see the class comment.
    await this.audit.record({
      actorId: request.adminId,
      action: 'admin.private_content.opened',
      targetType: 'chat_room',
      targetId: room.id,
      caseId: request.caseId,
      ipHash: request.ipHash ?? null,
      diff: { messageCount: room.messages.length },
    });

    const roleOf = new Map(room.members.map((member) => [member.userId, member.role]));

    return {
      roomId: room.id,
      status: room.status,
      caseId: request.caseId,
      notice: PRIVATE_ACCESS_NOTICE,
      messages: room.messages.map((message) => ({
        id: message.id,
        // Role, not identity: a moderator needs to know who said what to whom,
        // not which account it was. The user id stays server-side.
        senderRole: (roleOf.get(message.senderId) as 'requester' | 'listener') ?? 'unknown',
        body: message.body,
        safetyLevel: message.safetyLevel,
        createdAt: message.createdAt,
      })),
    };
  }

  /**
   * A refused attempt is logged too.
   *
   * The task asks for it explicitly, and the reason is that a pattern of
   * denied attempts is a stronger signal than a successful access — somebody
   * probing for a way in leaves no trace at all if only successes are
   * recorded.
   */
  private async recordDenied(request: PrivateContentRequest, reason: string): Promise<void> {
    await this.audit.record({
      actorId: request.adminId,
      action: 'admin.private_content.denied',
      targetType: request.targetType,
      targetId: request.targetId,
      caseId: request.caseId,
      ipHash: request.ipHash ?? null,
      diff: { reason },
    });
  }

  /** Resolves the room a case is about, whatever kind of target it names. */
  private async roomForCase(targetType: SafetyTarget, targetId: string): Promise<string | null> {
    if (targetType === 'message') {
      const message = await this.prisma.message.findUnique({
        where: { id: targetId },
        select: { roomId: true },
      });
      return message?.roomId ?? null;
    }

    if (targetType === 'user') {
      // A case about a person does not license reading every room they are in.
      // Opening a specific conversation needs a case about that conversation.
      return null;
    }

    return null;
  }
}
