import { Inject, Injectable } from '@nestjs/common';
import type { NotificationType, PrismaClient } from '@curhat/database';
import { rebuildNotificationPayload, type NotificationTemplateKey } from '@curhat/notifications';

import { PRISMA } from '../../common/prisma.service.js';
import { NotificationSettingsService } from '../users/notification-settings.service.js';

export interface NotificationView {
  id: string;
  type: NotificationType;
  template: NotificationTemplateKey;
  title: string;
  body: string;
  targetId: string | null;
  deepLink: string;
  /**
   * False when the thing the notification points at is gone. The client still
   * gets a working row and shows the friendly note instead of following a
   * link into an error (E12-T07).
   */
  targetAvailable: boolean;
  /** Set only when the target is gone — served so web and mobile agree. */
  unavailableMessage?: string;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPage {
  items: NotificationView[];
  nextCursor: string | null;
  unreadCount: number;
}

/** Shown in place of the target when it no longer exists. */
export const DELETED_TARGET_MESSAGE = 'Yang dituju notifikasi ini sudah nggak ada.';

/**
 * In-app notification list — E12-T07. TECH-SPEC §3.4, DESIGN-REF §2.14.
 *
 * The copy served here is rebuilt from the template catalogue rather than read
 * out of the stored row. The list and the push therefore say exactly the same
 * generic thing, and a row written by an older version of this code cannot
 * surface text the catalogue no longer allows (non-negotiable #3).
 */
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly settings: NotificationSettingsService,
  ) {}

  /**
   * A page of notifications, newest first.
   *
   * Cursor is `createdAt + id`, the same composite the feed uses (E05-T05):
   * `createdAt` alone is not unique, and two notifications sharing a
   * millisecond would make one of them permanently unreachable.
   *
   * Categories whose in-app channel the user switched off are filtered here
   * rather than at write time. The row stays — it is the delivery ledger and
   * the idempotency anchor — and switching the type back on restores the
   * history instead of leaving a hole in it.
   */
  async list(
    userId: string,
    cursor?: string,
    limit = 20,
    unreadOnly = false,
  ): Promise<NotificationPage> {
    const visibleTypes = await this.visibleTypes(userId);
    const decoded = decodeCursor(cursor);

    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        type: { in: visibleTypes },
        ...(unreadOnly ? { readAt: null } : {}),
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: decoded.createdAt } },
                { createdAt: decoded.createdAt, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const page = rows.slice(0, limit);
    const last = page.at(-1);

    const items = await Promise.all(page.map((row) => this.toView(row)));

    return {
      items,
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt, last.id) : null,
      unreadCount: await this.countUnread(userId, visibleTypes),
    };
  }

  /**
   * Unread badge.
   *
   * A count query against `(user_id, read_at, created_at)` — the index E02-T08
   * put there for exactly this. Loading the rows to count them would make the
   * cheapest, most frequent call on the screen the most expensive.
   */
  async unreadCount(userId: string): Promise<number> {
    return this.countUnread(userId, await this.visibleTypes(userId));
  }

  private async countUnread(userId: string, visibleTypes: NotificationType[]): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null, type: { in: visibleTypes } },
    });
  }

  /** Categories whose in-app channel the user has left switched on. */
  private async visibleTypes(userId: string): Promise<NotificationType[]> {
    const preferences = await this.settings.get(userId);

    return (Object.keys(preferences.perTypeToggles) as NotificationType[]).filter(
      (category) => preferences.perTypeToggles[category].inApp,
    );
  }

  /** Marks the given notifications read, or all of them when no ids are given. */
  async markRead(userId: string, ids?: string[]): Promise<{ updated: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && ids.length > 0 ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });

    return { updated: count };
  }

  /**
   * Builds the view, checking that the deep-link target still exists.
   *
   * Curhat gets deleted, rooms get closed and purged, accounts get removed.
   * Following a notification into a 404 at the moment someone hoped to read a
   * reply is a small cruelty that costs one query to avoid.
   */
  private async toView(row: {
    id: string;
    type: NotificationType;
    payload: unknown;
    readAt: Date | null;
    createdAt: Date;
  }): Promise<NotificationView> {
    const payload = rebuildNotificationPayload(row.payload);
    const targetAvailable = await this.targetExists(payload.template, payload.targetId);

    return {
      id: row.id,
      type: row.type,
      template: payload.template,
      title: payload.title,
      body: payload.body,
      targetId: payload.targetId,
      deepLink: payload.deepLink,
      targetAvailable,
      ...(targetAvailable ? {} : { unavailableMessage: DELETED_TARGET_MESSAGE }),
      readAt: row.readAt,
      createdAt: row.createdAt,
    };
  }

  private async targetExists(
    template: NotificationTemplateKey,
    targetId: string | null,
  ): Promise<boolean> {
    // Templates that point at a page rather than a record always resolve.
    if (!targetId) return true;

    // Every real target id is a uuid column. Querying one with anything else
    // makes Postgres raise `invalid input syntax for type uuid`, which would
    // turn one malformed row into a 500 for the whole notification list.
    if (!UUID_PATTERN.test(targetId)) return false;

    if (template.startsWith('response.') || template.startsWith('social.')) {
      const post = await this.prisma.curhatPost.findFirst({
        where: { id: targetId, deletedAt: null, status: 'published' },
        select: { id: true },
      });
      return post !== null;
    }

    if (template === 'listener.matched' || template.startsWith('listener.room')) {
      const room = await this.prisma.chatRoom.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      return room !== null;
    }

    return true;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

/**
 * Decodes a cursor, treating a broken one as "start from the top".
 *
 * A malformed cursor is almost always a stale link, not an attack, and an
 * error screen is a worse answer than the first page.
 */
function decodeCursor(cursor?: string): { createdAt: Date; id: string } | null {
  if (!cursor) return null;

  try {
    const [timestamp, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    // The id half is compared against a uuid column. Anything else would reach
    // Postgres as a type error rather than as an empty page.
    if (!timestamp || !id || !UUID_PATTERN.test(id)) return null;

    const createdAt = new Date(timestamp);
    return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
  } catch {
    return null;
  }
}
