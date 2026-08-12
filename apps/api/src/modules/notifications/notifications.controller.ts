import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/jwt-auth.guard.js';
import { DevicesService, type DeviceView } from './devices.service.js';
import {
  markReadSchema,
  notificationQuerySchema,
  registerDeviceSchema,
  type MarkReadDto,
  type NotificationQueryDto,
  type RegisterDeviceDto,
} from './notifications.dto.js';
import { NotificationsService, type NotificationPage } from './notifications.service.js';
import { PushDeliveryService } from './push-delivery.service.js';

/**
 * Devices and in-app notifications — TECH-SPEC §3.4, DESIGN-REF §2.14.
 */
@Controller()
export class NotificationsController {
  constructor(
    private readonly devices: DevicesService,
    private readonly notifications: NotificationsService,
    private readonly push: PushDeliveryService,
  ) {}

  @Post('devices')
  async registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(registerDeviceSchema)) body: RegisterDeviceDto,
  ): Promise<DeviceView> {
    return this.devices.register(user.userId, body);
  }

  @Get('devices')
  async listDevices(@CurrentUser() user: AuthenticatedUser): Promise<DeviceView[]> {
    return this.devices.list(user.userId);
  }

  @Delete('devices/:id')
  async unregisterDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: 'deleted' }> {
    await this.devices.unregister(user.userId, id);
    return { status: 'deleted' };
  }

  /**
   * The VAPID public key, for a browser about to subscribe (E12-T03).
   *
   * Served rather than baked into the web bundle so the key can be rotated
   * without a rebuild, and so a client can tell the difference between "web
   * push is off here" and "the subscribe call failed".
   */
  @Get('devices/webpush-key')
  webPushKey(): { publicKey: string | null } {
    return { publicKey: this.push.webPushPublicKey() };
  }

  @Get('notifications')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(notificationQuerySchema)) query: NotificationQueryDto,
  ): Promise<NotificationPage> {
    return this.notifications.list(user.userId, query.cursor, query.limit, query.unreadOnly);
  }

  @Get('notifications/unread-count')
  async unreadCount(@CurrentUser() user: AuthenticatedUser): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(user.userId) };
  }

  @Post('notifications/read')
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(markReadSchema)) body: MarkReadDto,
  ): Promise<{ updated: number }> {
    return this.notifications.markRead(user.userId, body.ids);
  }
}
