import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  BroadcastSegment,
  BroadcastStatus,
  BroadcastType,
  PrismaClient,
} from '@curhat/database';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { NotificationSettingsService } from '../users/notification-settings.service.js';
import { AuditService } from './audit.service.js';

export interface BroadcastView {
  id: string;
  type: BroadcastType;
  status: BroadcastStatus;
  segment: BroadcastSegment;
  title: string;
  body: string;
  estimatedRecipients: number;
  sentCount: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  /** True for `safety` only — the one type exempt from quiet hours (PRD §14). */
  ignoresQuietHours: boolean;
}

export interface RecipientEstimate {
  segment: BroadcastSegment;
  count: number;
  /**
   * Shown at the confirmation step.
   *
   * A broadcast cannot be recalled, so the number has to be in front of the
   * admin *before* they commit — not in a success toast afterwards.
   */
  confirmation: string;
}

/** How many notifications one pass of the sender creates. */
const BATCH_SIZE = 200;

/** Pause between batches, so a large send does not flood the push provider. */
const BATCH_PAUSE_MS = 250;

/** Considered "active" if they have signed in within this window. */
const ACTIVE_WINDOW_DAYS = 30;

/**
 * Broadcast CMS — E14-T15. PRD §18, DESIGN-REF §3.9.
 *
 * This is the one place in the product where a human writes push copy. Every
 * other notification comes from the closed catalogue (E12-T04), because
 * per-event copy is where curhat content leaks. A maintenance notice cannot be
 * a fixed string, so the text is authored — and the rules that replace the
 * catalogue's guarantee are:
 *
 *  - the copy is stored once and sent to everyone unchanged. There is no
 *    interpolation, no `{alias}`, no per-recipient anything, so a broadcast
 *    cannot contain a fact about the person receiving it;
 *  - the recipient count is snapshotted at confirmation and the send is
 *    measured against it. A broadcast that cannot be recalled must not be
 *    approved against one number and sent against another;
 *  - only `safety` bypasses quiet hours. An announcement at 2am is exactly what
 *    PRD §14 exists to prevent.
 */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly settings: NotificationSettingsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * How many people a segment reaches, right now.
   *
   * Called before creating a draft so the admin sees the number while writing,
   * and again at send time to detect drift.
   */
  async estimate(segment: BroadcastSegment): Promise<RecipientEstimate> {
    const count = await this.countSegment(segment);

    return {
      segment,
      count,
      confirmation:
        `Broadcast ini akan dikirim ke ${count.toLocaleString('id-ID')} akun. ` +
        'Kiriman yang sudah jalan tidak bisa ditarik kembali.',
    };
  }

  async create(input: {
    adminId: string;
    type: BroadcastType;
    segment: BroadcastSegment;
    title: string;
    body: string;
    scheduledFor?: Date | undefined;
  }): Promise<BroadcastView> {
    assertNoUserData(input.title, input.body);

    const estimatedRecipients = await this.countSegment(input.segment);

    const created = await this.prisma.broadcast.create({
      data: {
        type: input.type,
        segment: input.segment,
        title: input.title.trim(),
        body: input.body.trim(),
        estimatedRecipients,
        status: input.scheduledFor ? 'scheduled' : 'draft',
        ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
        createdBy: input.adminId,
      },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.broadcast.created',
      targetType: 'broadcast',
      targetId: created.id,
      diff: {
        type: created.type,
        segment: created.segment,
        estimatedRecipients,
        scheduled: created.scheduledFor?.toISOString() ?? null,
      },
    });

    return toView(created);
  }

  async list(limit = 50): Promise<BroadcastView[]> {
    const rows = await this.prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toView);
  }

  /**
   * Sends a broadcast.
   *
   * `confirmedRecipients` is required and must match the snapshot. That is the
   * acceptance criterion made mechanical: an admin who saw "1,200 accounts",
   * went for coffee, and came back to a segment that had grown to 40,000 gets a
   * refusal rather than a send. Re-confirming is one click; un-sending is not
   * possible at all.
   */
  async send(input: {
    adminId: string;
    id: string;
    confirmedRecipients: number;
  }): Promise<{ status: BroadcastStatus; sentCount: number }> {
    const broadcast = await this.require(input.id);

    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      throw ApiException.conflict(
        'CONFLICT',
        'Broadcast ini sudah dikirim atau dibatalkan.',
      );
    }

    if (input.confirmedRecipients !== broadcast.estimatedRecipients) {
      throw ApiException.conflict(
        'CONFLICT',
        `Kamu mengonfirmasi ${input.confirmedRecipients} penerima, tapi broadcast ` +
          `ini tercatat ${broadcast.estimatedRecipients}. Tinjau ulang lalu konfirmasi lagi.`,
      );
    }

    const recipients = await this.resolveSegment(broadcast.segment);

    // Drift check against the live segment, not just the confirmed number.
    if (recipients.length !== broadcast.estimatedRecipients) {
      await this.prisma.broadcast.update({
        where: { id: input.id },
        data: { estimatedRecipients: recipients.length },
      });

      throw ApiException.conflict(
        'CONFLICT',
        `Jumlah penerima sekarang ${recipients.length}, bukan ` +
          `${broadcast.estimatedRecipients}. Konfirmasi ulang dengan angka baru.`,
      );
    }

    await this.prisma.broadcast.update({
      where: { id: input.id },
      data: { status: 'sending', startedAt: new Date() },
    });

    let sentCount = 0;

    try {
      for (let offset = 0; offset < recipients.length; offset += BATCH_SIZE) {
        const batch = recipients.slice(offset, offset + BATCH_SIZE);
        sentCount += await this.sendBatch(broadcast.id, broadcast, batch);

        // Rate control (E14-T15): a hundred thousand notifications inserted as
        // fast as the database allows would be handed to the push provider at
        // the same rate, and the provider would start rejecting them.
        if (offset + BATCH_SIZE < recipients.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
        }
      }

      await this.prisma.broadcast.update({
        where: { id: input.id },
        data: { status: 'sent', sentCount, finishedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(`broadcast ${input.id} failed after ${sentCount} sends`, error);

      await this.prisma.broadcast.update({
        where: { id: input.id },
        data: { status: 'failed', sentCount, finishedAt: new Date() },
      });

      throw ApiException.unavailable(
        'SERVICE_UNAVAILABLE',
        `Broadcast berhenti setelah ${sentCount} kiriman. Cek log sebelum mencoba lagi.`,
      );
    }

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.broadcast.sent',
      targetType: 'broadcast',
      targetId: input.id,
      diff: { type: broadcast.type, segment: broadcast.segment, sentCount },
    });

    return { status: 'sent', sentCount };
  }

  async cancel(input: { adminId: string; id: string }): Promise<{ status: BroadcastStatus }> {
    const broadcast = await this.require(input.id);

    if (broadcast.status === 'sent' || broadcast.status === 'sending') {
      // Honest refusal rather than a cancel button that does nothing: once
      // notifications exist, they exist.
      throw ApiException.conflict(
        'CONFLICT',
        'Broadcast yang sudah jalan tidak bisa dibatalkan.',
      );
    }

    await this.prisma.broadcast.update({
      where: { id: input.id },
      data: { status: 'cancelled' },
    });

    await this.audit.record({
      actorId: input.adminId,
      action: 'admin.broadcast.cancelled',
      targetType: 'broadcast',
      targetId: input.id,
    });

    return { status: 'cancelled' };
  }

  /**
   * Creates the in-app notifications for one batch.
   *
   * Written directly rather than through `NotificationFanoutService`: that
   * service builds its payload from the closed catalogue, which is exactly what
   * a broadcast cannot use. The trade is explicit — this path carries authored
   * copy, so `assertNoUserData` guards it at creation and the copy is identical
   * for every recipient.
   *
   * `createMany` with `skipDuplicates` makes a retried batch idempotent: the
   * dedupe key is per broadcast per user, so the same batch twice produces one
   * notification each.
   */
  private async sendBatch(
    broadcastId: string,
    broadcast: { type: BroadcastType; title: string; body: string },
    userIds: string[],
  ): Promise<number> {
    const type = broadcast.type === 'safety' ? 'safety' : 'account';

    const eligible: string[] = [];
    for (const userId of userIds) {
      // Safety broadcasts ignore preferences and quiet hours (PRD §14). Every
      // other type respects the per-type toggle.
      if (broadcast.type === 'safety') {
        eligible.push(userId);
        continue;
      }

      const preferences = await this.settings.get(userId);
      if (preferences.perTypeToggles[type].inApp) eligible.push(userId);
    }

    if (eligible.length === 0) return 0;

    const { count } = await this.prisma.notification.createMany({
      data: eligible.map((userId) => ({
        userId,
        type,
        payload: {
          template: 'account.moderation_action',
          broadcastId,
          title: broadcast.title,
          body: broadcast.body,
          deepLink: '/notifications',
          isBroadcast: true,
        },
        dedupeKey: `broadcast:${broadcastId}`,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  private async countSegment(segment: BroadcastSegment): Promise<number> {
    if (segment === 'all') {
      return this.prisma.user.count({ where: { deletedAt: null, status: 'active' } });
    }

    if (segment === 'listeners') {
      return this.prisma.listenerProfile.count({
        where: { user: { deletedAt: null, status: 'active' } },
      });
    }

    const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000);
    const active = await this.prisma.userSession.findMany({
      where: { createdAt: { gte: since }, user: { deletedAt: null, status: 'active' } },
      distinct: ['userId'],
      select: { userId: true },
    });

    if (segment === 'active_users') return active.length;

    const total = await this.prisma.user.count({ where: { deletedAt: null, status: 'active' } });
    return Math.max(0, total - active.length);
  }

  private async resolveSegment(segment: BroadcastSegment): Promise<string[]> {
    if (segment === 'all') {
      const users = await this.prisma.user.findMany({
        where: { deletedAt: null, status: 'active' },
        select: { id: true },
      });
      return users.map((user) => user.id);
    }

    if (segment === 'listeners') {
      const profiles = await this.prisma.listenerProfile.findMany({
        where: { user: { deletedAt: null, status: 'active' } },
        select: { userId: true },
      });
      return profiles.map((profile) => profile.userId);
    }

    const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000);
    const activeSessions = await this.prisma.userSession.findMany({
      where: { createdAt: { gte: since }, user: { deletedAt: null, status: 'active' } },
      distinct: ['userId'],
      select: { userId: true },
    });
    const activeIds = new Set(activeSessions.map((session) => session.userId));

    if (segment === 'active_users') return [...activeIds];

    const all = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'active' },
      select: { id: true },
    });
    return all.map((user) => user.id).filter((id) => !activeIds.has(id));
  }

  private async require(id: string) {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!broadcast) {
      throw ApiException.notFound('NOT_FOUND', 'Broadcast itu tidak ditemukan.');
    }
    return broadcast;
  }
}

/**
 * Refuses copy that looks like it was built from somebody's data.
 *
 * A broadcast is the same text for everyone, so a placeholder is the tell that
 * somebody intended otherwise. Catching `{alias}` here is cheap; discovering it
 * after forty thousand people received a half-rendered template is not.
 */
export function assertNoUserData(title: string, body: string): void {
  const combined = `${title}\n${body}`;

  // Template syntax of any flavour: {x}, {{x}}, ${x}, %x%, :x.
  if (/\{\{?[a-z_]+\}?\}|\$\{[a-z_]+\}|%[a-z_]+%/i.test(combined)) {
    throw ApiException.badRequest(
      'VALIDATION_ERROR',
      'Broadcast tidak boleh memuat placeholder — teksnya sama untuk semua penerima.',
    );
  }

  // An email or a phone number in broadcast copy is somebody's data, whether
  // it arrived by paste or by accident.
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(combined) || /\b0\d{9,12}\b/.test(combined)) {
    throw ApiException.badRequest(
      'VALIDATION_ERROR',
      'Broadcast tidak boleh memuat email atau nomor telepon.',
    );
  }
}

function toView(row: {
  id: string;
  type: BroadcastType;
  status: BroadcastStatus;
  segment: BroadcastSegment;
  title: string;
  body: string;
  estimatedRecipients: number;
  sentCount: number;
  scheduledFor: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}): BroadcastView {
  return { ...row, ignoresQuietHours: row.type === 'safety' };
}
