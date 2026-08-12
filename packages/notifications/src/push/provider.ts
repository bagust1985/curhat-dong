/**
 * The push boundary — E12-T02. TECH-SPEC §6.1.
 *
 * Domain code never learns which service carried a notification. It hands a
 * catalogued payload and a list of targets to a `PushProvider` and reads back
 * a per-target verdict; whether that went through Expo, direct FCM or a
 * browser's push service is settled by configuration.
 *
 * That is the whole point of `push_provider` / `push_token_encrypted` in the
 * schema rather than a column called `fcm_token`. The migration path exists
 * because there is nothing above this interface to migrate.
 *
 * Note what `send` accepts: a `NotificationPayload`, which can only come out of
 * the template catalogue. A provider has no parameter to put curhat text in
 * either (CLAUDE.md non-negotiable #3).
 */

import type { NotificationPayload } from '../payload.js';

export type PushProviderName = 'expo' | 'fcm' | 'webpush';

export interface PushTarget {
  /** `user_devices.id` — the row to disable if the token turns out to be dead. */
  readonly deviceId: string;
  /** Decrypted push token. For `webpush`, the serialised subscription object. */
  readonly token: string;
}

/**
 * Outcomes a caller acts on differently.
 *
 * `invalid_token` is the one that matters most: it is not an error to retry
 * but a fact to record — the app was uninstalled, or the browser subscription
 * lapsed. Retrying it forever is how a push queue silently fills with ghosts.
 */
export type PushDeliveryStatus = 'sent' | 'invalid_token' | 'retryable_error' | 'permanent_error';

export interface PushResult {
  readonly deviceId: string;
  readonly status: PushDeliveryStatus;
  /** Provider-side reason, for logs. Never contains notification content. */
  readonly detail?: string;
}

export interface PushProvider {
  readonly name: PushProviderName;
  /**
   * False when credentials are absent.
   *
   * Reported rather than thrown at construction: a dev environment without
   * VAPID keys must still boot, and the honest consequence is that web push
   * reports itself unavailable instead of failing at the first send.
   */
  readonly configured: boolean;
  /** Largest number of targets one call may carry. */
  readonly batchSize: number;

  send(targets: readonly PushTarget[], payload: NotificationPayload): Promise<PushResult[]>;
}

/** Splits targets into provider-sized batches. */
export function batched<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) return [[...items]];

  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

/**
 * The data payload every provider attaches.
 *
 * Ids and a route only. A client uses this to navigate; there is nothing here
 * to render as text.
 */
export function pushData(payload: NotificationPayload): Record<string, string> {
  return {
    template: payload.template,
    category: payload.category,
    deepLink: payload.deepLink,
    ...(payload.targetId ? { targetId: payload.targetId } : {}),
  };
}

/** A provider that reports itself unconfigured and sends nothing. */
export function unavailableProvider(name: PushProviderName, reason: string): PushProvider {
  return {
    name,
    configured: false,
    batchSize: 1,
    send: (targets) =>
      Promise.resolve(
        targets.map((target) => ({
          deviceId: target.deviceId,
          status: 'permanent_error' as const,
          detail: reason,
        })),
      ),
  };
}
