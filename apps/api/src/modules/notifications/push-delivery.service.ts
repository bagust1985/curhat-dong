import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ServerEnv } from '@curhat/config/env/server';
import {
  createPushRegistry,
  type NotificationPayload,
  type PushRegistry,
  type PushResult,
} from '@curhat/notifications';

import { ENV } from '../../config/env.config.js';
import { DevicesService } from './devices.service.js';

export interface DeliverySummary {
  attempted: number;
  sent: number;
  invalid: number;
  failed: number;
}

/**
 * Sends a built payload to every live device a user has — E12-T02.
 *
 * Two properties this layer owes its callers:
 *
 *  - one device's failure never becomes another's. Each provider is awaited
 *    inside its own try/catch, so a web-push outage does not stop the Android
 *    notification going out;
 *  - a token the provider says is dead is retired here, immediately. Leaving
 *    it in place means every future fan-out pays for a delivery that cannot
 *    happen, and the queue slowly fills with uninstalled apps.
 */
@Injectable()
export class PushDeliveryService {
  private readonly logger = new Logger(PushDeliveryService.name);
  private readonly registry: PushRegistry;
  /** Public by design — it is handed to browsers so they can subscribe. */
  private readonly vapidPublicKey: string | null;

  constructor(
    @Inject(ENV) env: ServerEnv,
    private readonly devices: DevicesService,
  ) {
    this.vapidPublicKey = env.VAPID_PUBLIC_KEY ?? null;
    this.registry = createPushRegistry({
      mobileProvider: env.PUSH_MOBILE_PROVIDER,
      expoAccessToken: env.EXPO_ACCESS_TOKEN,
      fcmProjectId: env.FCM_PROJECT_ID,
      fcmServiceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON,
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
      vapidPrivateKey: env.VAPID_PRIVATE_KEY,
      vapidSubject: env.VAPID_SUBJECT,
    });
  }

  /**
   * The VAPID public key a browser needs to subscribe (E12-T03).
   *
   * Returns null when web push is not configured, so the client can skip the
   * permission prompt entirely rather than asking for something the server
   * cannot honour.
   */
  webPushPublicKey(): string | null {
    return this.registry.get('webpush').configured ? this.vapidPublicKey : null;
  }

  async deliver(userId: string, payload: NotificationPayload): Promise<DeliverySummary> {
    const grouped = await this.devices.pushTargets(userId);
    const summary: DeliverySummary = { attempted: 0, sent: 0, invalid: 0, failed: 0 };

    for (const { provider: name, targets } of grouped) {
      const provider = this.registry.get(name);
      summary.attempted += targets.length;

      if (!provider.configured) {
        summary.failed += targets.length;
        this.logger.warn(`push provider ${name} is not configured; ${targets.length} skipped`);
        continue;
      }

      let results: PushResult[];
      try {
        results = await provider.send(targets, payload);
      } catch (error) {
        // A provider that throws instead of returning verdicts is a bug in the
        // adapter; it must not take the other providers down with it.
        this.logger.error(`push provider ${name} threw`, error);
        summary.failed += targets.length;
        continue;
      }

      for (const result of results) {
        if (result.status === 'sent') {
          summary.sent += 1;
          continue;
        }

        if (result.status === 'invalid_token') {
          summary.invalid += 1;
          await this.devices
            .disable(result.deviceId, result.detail ?? 'invalid_token')
            .catch((error: unknown) => this.logger.warn('failed to disable device', error));
          continue;
        }

        summary.failed += 1;
        this.logger.warn(`push to device ${result.deviceId} failed: ${result.detail ?? 'unknown'}`);
      }
    }

    return summary;
  }
}
