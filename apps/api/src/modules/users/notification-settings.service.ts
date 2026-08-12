import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@curhat/database';
import {
  decideQuietHours,
  localHourIn,
  type NotificationCategory,
  type QuietHoursDecision,
} from '@curhat/notifications';

import { PRISMA } from '../../common/prisma.service.js';
import type { NotificationSettingsDto } from './users.dto.js';

export interface ChannelToggle {
  push: boolean;
  inApp: boolean;
}

const DEFAULT_TOGGLES: Record<NotificationCategory, ChannelToggle> = {
  social: { push: true, inApp: true },
  response: { push: true, inApp: true },
  listener: { push: true, inApp: true },
  ai: { push: false, inApp: true },
  safety: { push: true, inApp: true },
  account: { push: true, inApp: true },
};

export interface NotificationPreferences {
  perTypeToggles: Record<NotificationCategory, ChannelToggle>;
  quietHoursEnabled: boolean;
  feltHeardPromptEnabled: boolean;
}

@Injectable()
export class NotificationSettingsService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async get(userId: string): Promise<NotificationPreferences> {
    const settings = await this.prisma.notificationSetting.findUnique({ where: { userId } });

    const stored = (settings?.perTypeToggles ?? {}) as Partial<
      Record<NotificationCategory, ChannelToggle>
    >;

    const perTypeToggles = Object.fromEntries(
      (Object.keys(DEFAULT_TOGGLES) as NotificationCategory[]).map((category) => [
        category,
        stored[category] ?? DEFAULT_TOGGLES[category],
      ]),
    ) as Record<NotificationCategory, ChannelToggle>;

    return {
      perTypeToggles,
      quietHoursEnabled: settings?.quietHoursEnabled ?? true,
      feltHeardPromptEnabled: settings?.feltHeardPromptEnabled ?? true,
    };
  }

  async update(userId: string, input: NotificationSettingsDto): Promise<void> {
    const current = await this.get(userId);
    // Prisma's Json input type does not accept a nominal Record, so the merged
    // toggles are widened once here rather than cast at each use site.
    const mergedToggles = {
      ...current.perTypeToggles,
      ...(input.perTypeToggles ?? {}),
    } as Record<string, { push: boolean; inApp: boolean }>;

    await this.prisma.notificationSetting.upsert({
      where: { userId },
      update: {
        ...(input.perTypeToggles ? { perTypeToggles: mergedToggles } : {}),
        ...(input.quietHoursEnabled !== undefined
          ? { quietHoursEnabled: input.quietHoursEnabled }
          : {}),
        ...(input.feltHeardPromptEnabled !== undefined
          ? { feltHeardPromptEnabled: input.feltHeardPromptEnabled }
          : {}),
      },
      create: {
        userId,
        perTypeToggles: mergedToggles,
        quietHoursEnabled: input.quietHoursEnabled ?? true,
        feltHeardPromptEnabled: input.feltHeardPromptEnabled ?? true,
      },
    });
  }

  /**
   * Decides whether a push may be delivered right now.
   *
   * Combines the per-type toggle with quiet hours. Quiet hours are evaluated
   * in the device's timezone, not the server's — 20:00 UTC is the middle of
   * the night in Jakarta.
   */
  async pushDecision(
    userId: string,
    category: NotificationCategory,
    options: { perishable?: boolean } = {},
  ): Promise<QuietHoursDecision> {
    const settings = await this.get(userId);

    if (!settings.perTypeToggles[category].push) return 'drop';

    const device = await this.prisma.userDevice.findFirst({
      where: { userId },
      orderBy: { lastSeen: 'desc' },
      select: { timezone: true, quietHoursStart: true, quietHoursEnd: true },
    });

    return decideQuietHours({
      category,
      localHour: localHourIn(device?.timezone ?? 'Asia/Jakarta'),
      startHour: device?.quietHoursStart ?? 22,
      endHour: device?.quietHoursEnd ?? 7,
      enabled: settings.quietHoursEnabled,
      ...(options.perishable !== undefined ? { perishable: options.perishable } : {}),
    });
  }
}
