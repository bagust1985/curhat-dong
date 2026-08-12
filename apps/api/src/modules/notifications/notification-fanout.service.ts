import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import {
  buildNotificationPayload,
  categoryOf,
  decideQuietHours,
  localHourIn,
  nextDeliveryTime,
  rebuildNotificationPayload,
  templateFor,
  type NoFreeText,
  type NotificationPayload,
  type NotificationRequest,
  type NotificationTemplateKey,
} from '@curhat/notifications';

import { AppConfigService } from '../../common/app-config.service.js';
import { PRISMA } from '../../common/prisma.service.js';
import { NotificationSettingsService } from '../users/notification-settings.service.js';
import { UsersService } from '../users/users.service.js';
import { DevicesService } from './devices.service.js';
import { NotificationRealtimeService } from './notification-realtime.service.js';
import { PushDeliveryService } from './push-delivery.service.js';

/**
 * A notification to send. Note what it does not have: any field for text.
 *
 * `actorId` is the person whose action caused it — used to suppress
 * self-notifications and to honour blocks. It never reaches the payload.
 */
export interface FanoutRequest extends NotificationRequest {
  readonly userId: string;
  readonly actorId?: string | null;
}

/**
 * The bit of a notification row this service acts on.
 *
 * Structural rather than Prisma's generated model type: `@curhat/database`
 * exports the client and the enums, not the row shapes, and this is the whole
 * of what the delivery path reads.
 */
interface RecordedNotification {
  id: string;
  userId: string;
  createdAt: Date;
}

export type FanoutOutcome =
  | { status: 'sent'; notificationId: string; channel: 'push' | 'realtime' }
  | { status: 'held'; notificationId: string; deliverAfter: Date }
  | { status: 'in_app_only'; notificationId: string; reason: 'dropped' | 'skipped' }
  | { status: 'duplicate'; notificationId: string }
  | { status: 'suppressed'; reason: 'self' | 'blocked' };

/**
 * The one path a notification takes — E12-T05, T06, T08.
 *
 * Order matters and is not arbitrary:
 *
 *  1. suppress what should never have been sent (self, blocked);
 *  2. record the in-app notification — this is the durable artefact, and the
 *     unique `dedupeKey` is what makes a retried job idempotent;
 *  3. decide the push channel: user's per-type toggle, then quiet hours;
 *  4. if they are connected, emit over the socket *instead of* pushing —
 *     a push about something already on their screen is just noise.
 *
 * Step 2 before step 3 on purpose. If push fails, or is held, or the user has
 * every push toggle off, the notification still exists in the app. The list is
 * the source of truth; push is a way of finding out sooner.
 */
@Injectable()
export class NotificationFanoutService {
  private readonly logger = new Logger(NotificationFanoutService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly settings: NotificationSettingsService,
    private readonly devices: DevicesService,
    private readonly push: PushDeliveryService,
    private readonly realtime: NotificationRealtimeService,
    private readonly users: UsersService,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Queues and delivers one notification.
   *
   * `NoFreeText` is the compile-time half of non-negotiable #3: a caller who
   * tries to pass a comment body, an alias or a message preview does not
   * build. The runtime half is that nothing below reads anything from the
   * request except ids.
   */
  async notify<T extends FanoutRequest>(
    request: NoFreeText<T, FanoutRequest>,
  ): Promise<FanoutOutcome> {
    // Nobody needs telling about their own reply.
    if (request.actorId && request.actorId === request.userId) {
      return { status: 'suppressed', reason: 'self' };
    }

    if (request.actorId && (await this.users.isBlockedEitherWay(request.userId, request.actorId))) {
      // A block means mutually invisible (PRD §15). A notification is the one
      // way someone blocked could still reach into the other's evening.
      return { status: 'suppressed', reason: 'blocked' };
    }

    const payload = buildNotificationPayload({
      template: request.template,
      targetId: request.targetId ?? null,
    });

    const created = await this.record(request, payload);
    if (created.duplicate) {
      return { status: 'duplicate', notificationId: created.notification.id };
    }

    return this.dispatch(created.notification, payload);
  }

  /**
   * Writes the in-app row, or recognises that this event already has one.
   *
   * The unique index on `(user_id, dedupe_key)` does the work: a retried job
   * loses the insert and reads back its own earlier notification instead of
   * producing a second one. Checking first and then inserting would leave the
   * race open — two workers can both find nothing.
   */
  private async record(
    request: FanoutRequest,
    payload: NotificationPayload,
  ): Promise<{ notification: RecordedNotification; duplicate: boolean }> {
    const data = {
      userId: request.userId,
      type: categoryOf(request.template),
      payload: { ...payload },
      dedupeKey: request.dedupeKey ?? null,
    };

    try {
      return { notification: await this.prisma.notification.create({ data }), duplicate: false };
    } catch (error) {
      if (!isUniqueViolation(error) || !request.dedupeKey) throw error;

      const existing = await this.prisma.notification.findFirst({
        where: { userId: request.userId, dedupeKey: request.dedupeKey },
      });
      if (!existing) throw error;

      return { notification: existing, duplicate: true };
    }
  }

  /** Decides and performs the delivery for a freshly recorded notification. */
  private async dispatch(
    notification: RecordedNotification,
    payload: NotificationPayload,
  ): Promise<FanoutOutcome> {
    const template = templateFor(payload.template);
    const preferences = await this.settings.get(notification.userId);

    // Realtime first: if they are looking at the app, the socket already told
    // them, and a push would be the same news arriving twice (E12-T08).
    if (await this.realtime.hasLiveSocket(notification.userId)) {
      this.realtime.emitToUser(notification.userId, 'notification:new', {
        id: notification.id,
        ...payload,
        createdAt: notification.createdAt,
      });

      await this.mark(notification.id, 'skipped');
      return { status: 'sent', notificationId: notification.id, channel: 'realtime' };
    }

    if (!preferences.perTypeToggles[template.category].push) {
      await this.mark(notification.id, 'skipped');
      return { status: 'in_app_only', notificationId: notification.id, reason: 'skipped' };
    }

    const quiet = await this.devices.quietHoursContext(notification.userId);
    const decision = decideQuietHours({
      category: template.category,
      localHour: localHourIn(quiet.timezone),
      startHour: quiet.startHour,
      endHour: quiet.endHour,
      enabled: preferences.quietHoursEnabled,
      perishable: template.perishable,
    });

    if (decision === 'drop') {
      // Perishable and it is the middle of the night. Delivered at 07:00 it
      // would point at an offer that expired hours ago (PRD §14).
      await this.mark(notification.id, 'dropped');
      return { status: 'in_app_only', notificationId: notification.id, reason: 'dropped' };
    }

    if (decision === 'hold') {
      const deliverAfter = nextDeliveryTime(quiet.endHour, quiet.timezone);
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { pushStatus: 'held', deliverAfter },
      });
      return { status: 'held', notificationId: notification.id, deliverAfter };
    }

    await this.sendPush(notification.id, notification.userId, payload);
    return { status: 'sent', notificationId: notification.id, channel: 'push' };
  }

  /**
   * Delivers notifications whose quiet-hours window has ended — E12-T05.
   *
   * Anything that waited past its usefulness is dropped rather than delivered:
   * PRD §14 is explicit that held notifications must not pile up into a 07:00
   * flood. Logic and scheduling are separate on purpose — the BullMQ
   * repeatable job that calls this lands with the worker container in E17,
   * exactly like `expireOverdue()` from E10.
   */
  async deliverDue(now: Date = new Date()): Promise<{ delivered: number; dropped: number }> {
    const staleMinutes = await this.appConfig.getNumber('notification.stale_after_minutes');
    const staleBefore = new Date(now.getTime() - staleMinutes * 60_000);

    const due = await this.prisma.notification.findMany({
      where: { pushStatus: 'held', deliverAfter: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let delivered = 0;
    let dropped = 0;

    for (const notification of due) {
      if (notification.createdAt < staleBefore) {
        await this.mark(notification.id, 'dropped');
        dropped += 1;
        continue;
      }

      let payload: NotificationPayload;
      try {
        payload = rebuildNotificationPayload(notification.payload);
      } catch (error) {
        this.logger.warn(`held notification ${notification.id} has no valid template`, error);
        await this.mark(notification.id, 'failed');
        continue;
      }

      // They may have opened the app while the notification was held. Then the
      // socket is the right channel and a push would be the second copy.
      if (await this.realtime.hasLiveSocket(notification.userId)) {
        this.realtime.emitToUser(notification.userId, 'notification:new', {
          id: notification.id,
          ...payload,
          createdAt: notification.createdAt,
        });
        await this.mark(notification.id, 'skipped');
        delivered += 1;
        continue;
      }

      await this.sendPush(notification.id, notification.userId, payload);
      delivered += 1;
    }

    return { delivered, dropped };
  }

  private async sendPush(
    notificationId: string,
    userId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    const summary = await this.push.deliver(userId, payload);

    // "No device" is not a failure: plenty of users never grant permission,
    // and their notifications live perfectly well in the app.
    const status = summary.attempted === 0 ? 'skipped' : summary.sent > 0 ? 'sent' : 'failed';

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        pushStatus: status,
        ...(status === 'sent' ? { pushedAt: new Date() } : {}),
        deliverAfter: null,
      },
    });
  }

  private async mark(
    notificationId: string,
    status: 'skipped' | 'dropped' | 'failed',
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { pushStatus: status, deliverAfter: null },
    });
  }
}

/** Prisma's unique-constraint code. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export type { NotificationTemplateKey };
