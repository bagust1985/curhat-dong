import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DeletionMode, PrismaClient } from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { SessionService } from '../auth/session.service.js';

/** PRD §25.4 — a purged account keeps its content for a grace period. */
export const DELETE_GRACE_DAYS = 30;

export interface AccountExport {
  exportedAt: string;
  profile: unknown;
  posts: unknown[];
  comments: unknown[];
  reactions: unknown[];
  feltHeard: unknown[];
  aiConversations: unknown[];
  consents: unknown[];
  /** Explains why room messages are absent. */
  notes: string[];
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Builds the data export — PRD §25.2 (right to portability).
   *
   * Contains only what belongs to this user. Private room messages are
   * excluded even though the user sent some of them: a conversation is shared
   * between two people, and exporting one side would hand over the other
   * person's words without their say.
   */
  async buildExport(userId: string): Promise<AccountExport> {
    const [profile, posts, comments, reactions, feltHeard, aiConversations, consents] =
      await Promise.all([
        this.prisma.userProfile.findUnique({
          where: { userId },
          select: { alias: true, avatar: true, bio: true, joinedAt: true, topics: true },
        }),
        this.prisma.curhatPost.findMany({
          where: { authorId: userId },
          select: {
            title: true,
            body: true,
            mood: true,
            intent: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.comment.findMany({
          where: { authorId: userId },
          select: { body: true, createdAt: true, status: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.reaction.findMany({
          where: { userId },
          select: { type: true, targetType: true, createdAt: true },
        }),
        this.prisma.feltHeardFeedback.findMany({
          where: { userId },
          select: { answer: true, createdAt: true },
        }),
        this.prisma.aiConversation.findMany({
          where: { userId },
          select: {
            title: true,
            personalityMode: true,
            createdAt: true,
            messages: { select: { role: true, body: true, createdAt: true } },
          },
        }),
        this.prisma.consentRecord.findMany({
          where: { userId },
          select: {
            consentType: true,
            documentVersion: true,
            granted: true,
            grantedAt: true,
            revokedAt: true,
          },
        }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      profile,
      posts,
      comments,
      reactions,
      feltHeard,
      aiConversations,
      consents,
      notes: [
        'Pesan di private room tidak termasuk. Percakapan itu milik kamu berdua, ' +
          'dan mengekspornya berarti ikut menyerahkan kata-kata orang lain.',
        'Data internal moderasi dan audit log tidak termasuk.',
      ],
    };
  }

  async requestExport(userId: string): Promise<{ exportId: string; status: string }> {
    const pending = await this.prisma.dataExportRequest.findFirst({
      where: { userId, status: { in: ['pending', 'processing'] } },
    });

    if (pending) {
      return { exportId: pending.id, status: pending.status };
    }

    const created = await this.prisma.dataExportRequest.create({
      data: { userId, status: 'pending' },
    });

    return { exportId: created.id, status: created.status };
  }

  /**
   * Deletes an account — PRD §25.4, TECH-SPEC §18.3.
   *
   * `purge` marks the account and lets a scheduled job remove the content
   * after the grace period, so an account recovered from a compromise (or a
   * decision regretted overnight) can still be restored.
   *
   * `anonymize` severs the author link immediately and is irreversible — the
   * content survives with no way back to the person. The UI must state this
   * before the user confirms; there is no undo to fall back on.
   */
  async deleteAccount(userId: string, mode: DeletionMode): Promise<{ effectiveAt: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true },
    });

    if (!user) {
      throw ApiException.notFound('NOT_FOUND', 'Akun tidak ditemukan.');
    }

    if (user.deletedAt) {
      throw ApiException.conflict('CONFLICT', 'Akun ini sudah dalam proses penghapusan.');
    }

    const now = new Date();
    const effectiveAt =
      mode === 'purge' ? new Date(now.getTime() + DELETE_GRACE_DAYS * 86_400_000) : now;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { deletedAt: now, deletionMode: mode, status: 'deleted' },
      });

      // Stop the account participating immediately, whichever mode was chosen.
      await tx.listenerAvailability.updateMany({
        where: { userId },
        data: { isAvailable: false },
      });

      await tx.listenerMatch.updateMany({
        where: { listenerId: userId, status: 'offered' },
        data: { status: 'expired' },
      });

      await tx.listenerRequest.updateMany({
        where: { requesterId: userId, status: 'searching' },
        data: { status: 'cancelled', resolvedAt: now },
      });

      // Push tokens go now: a deleted account must not keep receiving
      // notifications while the grace period runs.
      await tx.userDevice.deleteMany({ where: { userId } });

      if (mode === 'anonymize') {
        await tx.userProfile.update({
          where: { userId },
          data: {
            alias: `Anonim-${userId.slice(0, 8)}`,
            aliasLower: `anonim-${userId.slice(0, 8)}`,
            avatar: null,
            bio: null,
          },
        });
      }
    });

    await this.sessions.revokeAllForUser(userId);

    this.logger.warn(`account ${userId} scheduled for deletion (mode=${mode})`);

    return { effectiveAt };
  }

  /**
   * What the user is told before confirming.
   *
   * Written plainly because each line is something people are surprised by
   * later: anonymize cannot be undone, the other person keeps their copy of a
   * shared conversation, and backups rotate rather than erase instantly.
   */
  deletionConsequences(mode: DeletionMode): string[] {
    const shared = [
      `Pesan di private room tidak hilang dari sisi lawan bicaramu sampai masa simpannya habis.`,
      `Salinan di backup baru benar-benar hilang setelah rotasi ${DELETE_GRACE_DAYS} hari.`,
      `Catatan moderasi dan audit log tetap disimpan sesuai kewajiban kepatuhan — isinya bukan curhatmu.`,
    ];

    if (mode === 'purge') {
      return [
        `Curhat, komentar, dan percakapan DONG AI kamu dihapus setelah ${DELETE_GRACE_DAYS} hari.`,
        `Selama masa itu kamu masih bisa membatalkan dengan masuk kembali.`,
        ...shared,
      ];
    }

    return [
      'Curhat dan komentar kamu tetap ada, tapi tidak lagi terhubung ke akunmu.',
      'Ini TIDAK BISA dibatalkan. Setelah kaitannya putus, kamu juga tidak bisa lagi menghapus tulisan itu.',
      ...shared,
    ];
  }
}
