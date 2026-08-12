/**
 * Direct FCM adapter (HTTP v1) — E12-T02, TECH-SPEC §6.1.
 *
 * The migration path Expo exists to keep open. It is real code rather than a
 * documented intention, because "we can swap providers later" is only true if
 * someone has checked what the swap actually needs — here, OAuth2 with a
 * service account, which is the part that would have been the surprise.
 *
 * Switching is `PUSH_MOBILE_PROVIDER=fcm` plus credentials. No domain code
 * changes, no migration: `push_provider` already names the row's provider and
 * `push_token_encrypted` already holds whatever that provider issues.
 */

import { createSign } from 'node:crypto';

import type { NotificationPayload } from '../payload.js';
import {
  pushData,
  unavailableProvider,
  type PushProvider,
  type PushResult,
  type PushTarget,
} from './provider.js';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** FCM's way of saying the token is dead. */
const DEAD_TOKEN_CODES = new Set([
  'UNREGISTERED',
  'INVALID_ARGUMENT',
  'SENDER_ID_MISMATCH',
]);

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface FcmProviderOptions {
  /** Raw service-account JSON, as held in `FCM_SERVICE_ACCOUNT_JSON`. */
  serviceAccountJson?: string | undefined;
  projectId?: string | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

export function createFcmProvider(options: FcmProviderOptions): PushProvider {
  if (!options.serviceAccountJson) {
    return unavailableProvider('fcm', 'service_account_not_configured');
  }

  let account: ServiceAccount;
  try {
    account = JSON.parse(options.serviceAccountJson) as ServiceAccount;
  } catch {
    return unavailableProvider('fcm', 'service_account_malformed');
  }

  const projectId = options.projectId ?? account.project_id;
  if (!projectId || !account.client_email || !account.private_key) {
    return unavailableProvider('fcm', 'service_account_incomplete');
  }

  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  let cachedToken: { value: string; expiresAt: number } | null = null;

  /**
   * Google's OAuth2 access token, cached until shortly before it expires.
   *
   * Minted per send would cost an extra network round trip on every single
   * notification — the kind of thing that only shows up as latency once the
   * volume is real.
   */
  async function accessToken(): Promise<string | null> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: TOKEN_ENDPOINT,
        iat: now,
        exp: now + 3600,
      }),
    );

    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    const signature = base64url(signer.sign(account.private_key));

    const response = await doFetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`,
      }).toString(),
    });

    if (!response.ok) return null;

    const parsed = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!parsed.access_token) return null;

    cachedToken = {
      value: parsed.access_token,
      expiresAt: Date.now() + (parsed.expires_in ?? 3600) * 1000 - 60_000,
    };
    return cachedToken.value;
  }

  async function sendOne(
    target: PushTarget,
    payload: NotificationPayload,
    token: string,
  ): Promise<PushResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await doFetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: target.token,
              notification: { title: payload.title, body: payload.body },
              data: pushData(payload),
              android: {
                priority: payload.category === 'safety' ? 'HIGH' : 'NORMAL',
                notification: { channel_id: 'default' },
              },
            },
          }),
          signal: controller.signal,
        },
      );

      if (response.ok) return { deviceId: target.deviceId, status: 'sent' };

      const parsed = (await response.json().catch(() => ({}))) as {
        error?: { status?: string; details?: Array<{ errorCode?: string }> };
      };
      const code = parsed.error?.details?.[0]?.errorCode ?? parsed.error?.status ?? 'unknown';

      if (DEAD_TOKEN_CODES.has(code) || response.status === 404) {
        return { deviceId: target.deviceId, status: 'invalid_token', detail: code };
      }
      if (response.status === 429 || response.status >= 500) {
        return { deviceId: target.deviceId, status: 'retryable_error', detail: code };
      }
      return { deviceId: target.deviceId, status: 'permanent_error', detail: code };
    } catch (error) {
      const detail = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network';
      return { deviceId: target.deviceId, status: 'retryable_error', detail };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: 'fcm',
    configured: true,
    // HTTP v1 dropped multicast: one request per token. The batch size is how
    // many run concurrently, not how many share a request.
    batchSize: 50,

    async send(targets, payload) {
      const token = await accessToken().catch(() => null);
      if (!token) {
        return targets.map((target) => ({
          deviceId: target.deviceId,
          status: 'retryable_error' as const,
          detail: 'oauth_failed',
        }));
      }

      const results: PushResult[] = [];
      for (let i = 0; i < targets.length; i += 50) {
        const slice = targets.slice(i, i + 50);
        results.push(...(await Promise.all(slice.map((t) => sendOne(t, payload, token)))));
      }
      return results;
    },
  };
}
