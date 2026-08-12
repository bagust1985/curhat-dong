import { Inject, Injectable, Logger } from '@nestjs/common';
import { encrypt, decrypt, hashToken } from '@curhat/auth';
import type { ServerEnv } from '@curhat/config/env/server';
import type { Platform, PrismaClient, PushProvider } from '@curhat/database';
import type { PushTarget } from '@curhat/notifications';

import { ApiException } from '../../common/api-error.js';
import { PRISMA } from '../../common/prisma.service.js';
import { ENV } from '../../config/env.config.js';
import type { RegisterDeviceDto } from './notifications.dto.js';

export interface DeviceView {
  id: string;
  deviceId: string;
  platform: Platform;
  pushProvider: PushProvider;
  timezone: string;
  lastSeen: Date;
}

/** A device ready to receive, grouped by the provider that will carry it. */
export interface ProviderTargets {
  provider: PushProvider;
  targets: PushTarget[];
}

/**
 * The device registry — E12-T01. TECH-SPEC §6.1, §7.5.
 *
 * Nothing here knows what a push token means. It stores an opaque string for a
 * named provider, which is the whole reason a move from Expo Push to direct
 * FCM is a configuration change rather than a migration.
 *
 * The token is encrypted at rest and hashed for lookup — the same split as
 * email in `@curhat/auth`, for the same reason: we must be able to read it
 * back to send, but a database dump alone must not yield a list of addressable
 * devices.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  /**
   * Registers or refreshes a device.
   *
   * Two kinds of duplicate are resolved here, and they are not the same
   * problem:
   *
   *  - the *same* device registering again — an upsert on `(userId, deviceId)`,
   *    so a token refresh updates one row rather than accumulating them;
   *  - the same *token* arriving under a different identity — a shared phone,
   *    or a re-login. That row is removed first. A push token addresses a
   *    device, not an account, and leaving the old row would keep delivering
   *    one person's notifications to whoever holds the handset now.
   */
  async register(userId: string, input: RegisterDeviceDto): Promise<DeviceView> {
    const tokenHash = hashToken(input.pushToken, this.env.TOKEN_ENCRYPTION_KEY);
    const pushTokenEncrypted = encrypt(input.pushToken, this.env.TOKEN_ENCRYPTION_KEY);

    const device = await this.prisma.$transaction(async (tx) => {
      await tx.userDevice.deleteMany({
        where: {
          pushTokenHash: tokenHash,
          NOT: { userId, deviceId: input.deviceId },
        },
      });

      const common = {
        platform: input.platform,
        pushProvider: input.pushProvider,
        pushTokenEncrypted,
        pushTokenHash: tokenHash,
        timezone: input.timezone,
        ...(input.quietHoursStart !== undefined ? { quietHoursStart: input.quietHoursStart } : {}),
        ...(input.quietHoursEnd !== undefined ? { quietHoursEnd: input.quietHoursEnd } : {}),
        lastSeen: new Date(),
        // Re-registering revives a device the provider had previously
        // rejected: a reinstall issues a fresh token and the app is back.
        disabledAt: null,
        disabledReason: null,
      };

      return tx.userDevice.upsert({
        where: { userId_deviceId: { userId, deviceId: input.deviceId } },
        update: common,
        create: { userId, deviceId: input.deviceId, ...common },
      });
    });

    return toView(device);
  }

  /**
   * Unregisters a device — logout on this handset, or the user switching push
   * off from the OS.
   *
   * Accepts either the row id returned by registration or the client's own
   * `device_id`. Both are unique within a user, and the client knows the
   * second one without having to remember the first.
   */
  async unregister(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.userDevice.deleteMany({
      where: { userId, OR: [{ id }, { deviceId: id }] },
    });

    if (count === 0) {
      throw ApiException.notFound('NOT_FOUND', 'Perangkat itu nggak terdaftar.');
    }
  }

  async list(userId: string): Promise<DeviceView[]> {
    const devices = await this.prisma.userDevice.findMany({
      where: { userId, disabledAt: null },
      orderBy: { lastSeen: 'desc' },
    });
    return devices.map(toView);
  }

  /**
   * Live push targets for a user, grouped by provider.
   *
   * Decryption happens here and nowhere else. A device whose stored token
   * cannot be decrypted — a rotated encryption key, a corrupted row — is
   * skipped and logged rather than throwing: one unreadable row must not stop
   * the other devices from being notified.
   */
  async pushTargets(userId: string): Promise<ProviderTargets[]> {
    const devices = await this.prisma.userDevice.findMany({
      where: { userId, disabledAt: null },
      select: { id: true, pushProvider: true, pushTokenEncrypted: true },
    });

    const grouped = new Map<PushProvider, PushTarget[]>();

    for (const device of devices) {
      let token: string;
      try {
        token = decrypt(device.pushTokenEncrypted, this.env.TOKEN_ENCRYPTION_KEY);
      } catch {
        this.logger.warn(`unreadable push token on device ${device.id}`);
        continue;
      }

      const list = grouped.get(device.pushProvider) ?? [];
      list.push({ deviceId: device.id, token });
      grouped.set(device.pushProvider, list);
    }

    return [...grouped.entries()].map(([provider, targets]) => ({ provider, targets }));
  }

  /**
   * Takes a device out of rotation after the provider says the token is gone
   * (E12-T02).
   *
   * Disabled, not deleted: the row is the record that this device was
   * registered, and `register` revives it when the app comes back.
   */
  async disable(deviceRowId: string, reason: string): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { id: deviceRowId, disabledAt: null },
      data: { disabledAt: new Date(), disabledReason: reason },
    });
  }

  /** Quiet-hours context for the recipient — their zone, not the server's. */
  async quietHoursContext(
    userId: string,
  ): Promise<{ timezone: string; startHour: number; endHour: number }> {
    const device = await this.prisma.userDevice.findFirst({
      where: { userId, disabledAt: null },
      orderBy: { lastSeen: 'desc' },
      select: { timezone: true, quietHoursStart: true, quietHoursEnd: true },
    });

    return {
      timezone: device?.timezone ?? 'Asia/Jakarta',
      startHour: device?.quietHoursStart ?? 22,
      endHour: device?.quietHoursEnd ?? 7,
    };
  }

  async touch(userId: string, deviceId: string): Promise<void> {
    await this.prisma.userDevice.updateMany({
      where: { userId, deviceId },
      data: { lastSeen: new Date() },
    });
  }
}

function toView(device: {
  id: string;
  deviceId: string;
  platform: Platform;
  pushProvider: PushProvider;
  timezone: string;
  lastSeen: Date;
}): DeviceView {
  // Deliberately partial: the token — encrypted or not — never leaves the
  // server (CLAUDE.md non-negotiable #4).
  return {
    id: device.id,
    deviceId: device.deviceId,
    platform: device.platform,
    pushProvider: device.pushProvider,
    timezone: device.timezone,
    lastSeen: device.lastSeen,
  };
}
