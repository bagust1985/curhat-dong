import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { DevicesService } from './devices.service.js';
import { NotificationFanoutService } from './notification-fanout.service.js';
import { NotificationRealtimeService } from './notification-realtime.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PushDeliveryService } from './push-delivery.service.js';

/**
 * Device registry, push, quiet hours and in-app notifications — E12.
 * PRD §14; TECH-SPEC BAGIAN 6, §3.4, §3.5.
 *
 * This module imports nothing from chat or listener, and that is deliberate.
 * `NotificationRealtimeService` receives the `/rt` namespace by attachment
 * from the gateway, so the dependency runs `ChatModule → NotificationsModule`
 * in one direction and the graph stays acyclic. Listener nudges live in the
 * listener module for the same reason: they need capacity and cooldown state,
 * and pulling that in here would close the loop.
 *
 * The rule this module exists to keep is CLAUDE.md non-negotiable #3 — no
 * curhat, chat or AI content in a notification. It is enforced by the type of
 * `NotificationFanoutService.notify`, not by review.
 */
@Module({
  imports: [AuthModule, UsersModule],
  controllers: [NotificationsController],
  providers: [
    DevicesService,
    PushDeliveryService,
    NotificationRealtimeService,
    NotificationFanoutService,
    NotificationsService,
  ],
  exports: [
    DevicesService,
    NotificationFanoutService,
    NotificationRealtimeService,
    NotificationsService,
  ],
})
export class NotificationsModule {}
