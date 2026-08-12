/**
 * Web Push adapter — E12-T03. TECH-SPEC §1.1, §6.1.
 *
 * Uses the `web-push` library rather than `fetch`, unlike the other adapters.
 * The reason is not convenience: a Web Push message is encrypted end-to-end to
 * the browser (ECDH P-256 + HKDF + AES-128-GCM, RFC 8291) and signed with a
 * VAPID JWT (RFC 8292). Hand-rolling that produces notifications no browser
 * can decrypt, and the failure is silent.
 *
 * The payload it encrypts is still the catalogued one — the same generic copy
 * the mobile push carries. A browser notification lands on a locked laptop
 * screen just as a phone notification lands on a lock screen.
 */

import webpush, { type PushSubscription, WebPushError } from 'web-push';

import type { NotificationPayload } from '../payload.js';
import {
  pushData,
  unavailableProvider,
  type PushProvider,
  type PushResult,
  type PushTarget,
} from './provider.js';

export interface WebPushOptions {
  publicKey?: string | undefined;
  privateKey?: string | undefined;
  /** `mailto:` the push service can use to reach us. */
  subject?: string | undefined;
  ttlSeconds?: number;
}

/**
 * Parses the stored token back into a subscription.
 *
 * The device row keeps the whole subscription object as its "token" so the
 * schema stays provider-agnostic — there is no `endpoint` column, because a
 * column named after one provider's wire format is exactly what TECH-SPEC §6.1
 * rules out.
 */
export function parseSubscription(token: string): PushSubscription | null {
  try {
    const parsed = JSON.parse(token) as Partial<PushSubscription>;
    if (typeof parsed.endpoint !== 'string') return null;
    if (typeof parsed.keys?.p256dh !== 'string' || typeof parsed.keys?.auth !== 'string') {
      return null;
    }
    return { endpoint: parsed.endpoint, keys: parsed.keys };
  } catch {
    return null;
  }
}

export function createWebPushProvider(options: WebPushOptions): PushProvider {
  if (!options.publicKey || !options.privateKey) {
    return unavailableProvider('webpush', 'vapid_not_configured');
  }

  const publicKey = options.publicKey;
  const privateKey = options.privateKey;
  const subject = options.subject ?? 'mailto:ops@curhatdong.com';
  const ttl = options.ttlSeconds ?? 3_600;

  async function sendOne(target: PushTarget, body: string): Promise<PushResult> {
    const subscription = parseSubscription(target.token);
    if (!subscription) {
      return { deviceId: target.deviceId, status: 'invalid_token', detail: 'malformed_subscription' };
    }

    try {
      await webpush.sendNotification(subscription, body, {
        vapidDetails: { subject, publicKey, privateKey },
        TTL: ttl,
      });
      return { deviceId: target.deviceId, status: 'sent' };
    } catch (error) {
      if (error instanceof WebPushError) {
        // 404/410 is the push service telling us the subscription is gone —
        // the user cleared site data or revoked permission. Nothing to retry.
        if (error.statusCode === 404 || error.statusCode === 410) {
          return { deviceId: target.deviceId, status: 'invalid_token', detail: 'gone' };
        }
        if (error.statusCode === 429 || error.statusCode >= 500) {
          return {
            deviceId: target.deviceId,
            status: 'retryable_error',
            detail: `http_${error.statusCode}`,
          };
        }
        return {
          deviceId: target.deviceId,
          status: 'permanent_error',
          detail: `http_${error.statusCode}`,
        };
      }

      return { deviceId: target.deviceId, status: 'retryable_error', detail: 'network' };
    }
  }

  return {
    name: 'webpush',
    configured: true,
    // No server-side fan-out: each subscription is encrypted with its own key,
    // so "batching" here only means how many are in flight at once.
    batchSize: 20,

    async send(targets, payload: NotificationPayload) {
      const body = JSON.stringify({
        title: payload.title,
        body: payload.body,
        data: pushData(payload),
      });

      const results: PushResult[] = [];
      for (let i = 0; i < targets.length; i += 20) {
        const slice = targets.slice(i, i + 20);
        results.push(...(await Promise.all(slice.map((target) => sendOne(target, body)))));
      }
      return results;
    },
  };
}
