/**
 * Expo Push Service adapter — E12-T02. TECH-SPEC §6.1 (MVP default).
 *
 * Written on `fetch` rather than `expo-server-sdk`, for the same reason the AI
 * adapters avoid vendor SDKs: the only place that may know a provider's wire
 * format is its adapter, and pulling in an SDK puts a third-party dependency
 * exactly behind the boundary whose purpose is to be replaceable.
 */

import type { NotificationPayload } from '../payload.js';
import {
  batched,
  pushData,
  type PushProvider,
  type PushResult,
  type PushTarget,
} from './provider.js';

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const EXPO_BATCH_SIZE = 100;

/**
 * Expo's way of saying the app is gone. The device row is disabled on this,
 * never retried.
 */
const DEAD_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

interface ExpoTicket {
  status?: string;
  message?: string;
  details?: { error?: string };
}

export interface ExpoProviderOptions {
  /** Optional; Expo accepts unauthenticated sends but rate-limits them harder. */
  accessToken?: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createExpoPushProvider(options: ExpoProviderOptions = {}): PushProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function sendBatch(
    targets: readonly PushTarget[],
    payload: NotificationPayload,
  ): Promise<PushResult[]> {
    const messages = targets.map((target) => ({
      to: target.token,
      title: payload.title,
      body: payload.body,
      data: pushData(payload),
      // Android channel + sound stay neutral: this product's notifications
      // should never feel like an alarm.
      channelId: 'default',
      sound: null,
      priority: payload.category === 'safety' ? 'high' : 'normal',
    }));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await doFetch(EXPO_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify(messages),
        signal: controller.signal,
      });

      if (!response.ok) {
        // 429 and 5xx are worth another attempt; a 4xx means the request
        // itself is wrong and repeating it changes nothing.
        const status =
          response.status === 429 || response.status >= 500 ? 'retryable_error' : 'permanent_error';
        return targets.map((target) => ({
          deviceId: target.deviceId,
          status,
          detail: `http_${response.status}`,
        }));
      }

      const parsed = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = parsed.data ?? [];

      return targets.map((target, index) => {
        const ticket = tickets[index];
        if (!ticket) {
          return {
            deviceId: target.deviceId,
            status: 'retryable_error' as const,
            detail: 'missing_ticket',
          };
        }
        if (ticket.status === 'ok') {
          return { deviceId: target.deviceId, status: 'sent' as const };
        }

        const error = ticket.details?.error ?? 'unknown';
        return {
          deviceId: target.deviceId,
          status: DEAD_TOKEN_ERRORS.has(error)
            ? ('invalid_token' as const)
            : ('retryable_error' as const),
          detail: error,
        };
      });
    } catch (error) {
      const detail = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network';
      return targets.map((target) => ({
        deviceId: target.deviceId,
        status: 'retryable_error' as const,
        detail,
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'expo',
    configured: true,
    batchSize: EXPO_BATCH_SIZE,

    async send(targets, payload) {
      const results: PushResult[] = [];
      for (const batch of batched(targets, EXPO_BATCH_SIZE)) {
        results.push(...(await sendBatch(batch, payload)));
      }
      return results;
    },
  };
}
