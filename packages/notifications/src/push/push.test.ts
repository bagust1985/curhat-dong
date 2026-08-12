import { describe, expect, it, vi } from 'vitest';

import { buildNotificationPayload } from '../payload.js';
import { createExpoPushProvider } from './expo.provider.js';
import { createFcmProvider } from './fcm.provider.js';
import { createPushRegistry } from './registry.js';
import { batched, pushData, unavailableProvider, type PushTarget } from './provider.js';
import { createWebPushProvider, parseSubscription } from './webpush.provider.js';

const PAYLOAD = buildNotificationPayload({
  template: 'response.comment',
  targetId: 'post-1',
});

const TARGETS: PushTarget[] = [
  { deviceId: 'device-a', token: 'ExponentPushToken[aaa]' },
  { deviceId: 'device-b', token: 'ExponentPushToken[bbb]' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('push payload (non-negotiable #3)', () => {
  it('carries ids and a route, never text a client could render', () => {
    const data = pushData(PAYLOAD);

    expect(data).toEqual({
      template: 'response.comment',
      category: 'response',
      deepLink: '/post/post-1',
      targetId: 'post-1',
    });
  });
});

describe('Expo adapter (E12-T02)', () => {
  it('sends catalogued copy and reports each ticket', async () => {
    const sentBodies: string[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      sentBodies.push((init as { body: string }).body);
      return jsonResponse({ data: [{ status: 'ok', id: '1' }, { status: 'ok', id: '2' }] });
    });

    const provider = createExpoPushProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const results = await provider.send(TARGETS, PAYLOAD);

    expect(results.map((r) => r.status)).toEqual(['sent', 'sent']);

    const body = JSON.parse(sentBodies[0] as string) as Array<{
      title: string;
      body: string;
    }>;
    expect(body).toHaveLength(2);
    expect(body[0]?.body).toBe('Ada seseorang yang membalas curhatmu.');
  });

  it('marks a DeviceNotRegistered token invalid rather than retryable', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
          { status: 'ok', id: '2' },
        ],
      }),
    );

    const provider = createExpoPushProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const results = await provider.send(TARGETS, PAYLOAD);

    expect(results[0]).toMatchObject({ deviceId: 'device-a', status: 'invalid_token' });
    expect(results[1]).toMatchObject({ deviceId: 'device-b', status: 'sent' });
  });

  it('treats a message-level error that is not a dead token as retryable', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ status: 'error', details: { error: 'MessageRateExceeded' } }] }),
    );

    const provider = createExpoPushProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const [result] = await provider.send([TARGETS[0] as PushTarget], PAYLOAD);

    expect(result?.status).toBe('retryable_error');
  });

  it('separates a throttled response from a malformed request', async () => {
    const throttled = createExpoPushProvider({
      fetchImpl: (async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    });
    const rejected = createExpoPushProvider({
      fetchImpl: (async () => jsonResponse({}, 400)) as unknown as typeof fetch,
    });

    expect((await throttled.send(TARGETS, PAYLOAD))[0]?.status).toBe('retryable_error');
    expect((await rejected.send(TARGETS, PAYLOAD))[0]?.status).toBe('permanent_error');
  });

  it('does not lose a target when the provider returns fewer tickets than sent', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ status: 'ok', id: '1' }] }));
    const provider = createExpoPushProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const results = await provider.send(TARGETS, PAYLOAD);

    expect(results).toHaveLength(2);
    expect(results[1]?.status).toBe('retryable_error');
  });

  it('batches a mass send into requests the provider accepts', async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init: unknown) => {
      const messages = JSON.parse((init as { body: string }).body) as unknown[];
      return jsonResponse({ data: messages.map(() => ({ status: 'ok' })) });
    });

    const provider = createExpoPushProvider({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const many: PushTarget[] = Array.from({ length: 250 }, (_, i) => ({
      deviceId: `device-${i}`,
      token: `ExponentPushToken[${i}]`,
    }));

    const results = await provider.send(many, PAYLOAD);

    expect(results).toHaveLength(250);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('reports a network failure as retryable instead of throwing', async () => {
    const provider = createExpoPushProvider({
      fetchImpl: (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
    });

    const results = await provider.send(TARGETS, PAYLOAD);
    expect(results.every((r) => r.status === 'retryable_error')).toBe(true);
  });
});

describe('web push adapter (E12-T03)', () => {
  it('reports itself unconfigured without VAPID keys rather than failing at send', async () => {
    const provider = createWebPushProvider({});

    expect(provider.configured).toBe(false);
    const results = await provider.send(TARGETS, PAYLOAD);
    expect(results[0]).toMatchObject({ status: 'permanent_error', detail: 'vapid_not_configured' });
  });

  it('parses a stored subscription and rejects a malformed one', () => {
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'key', auth: 'auth' },
    };

    expect(parseSubscription(JSON.stringify(subscription))).toEqual(subscription);
    expect(parseSubscription('ExponentPushToken[aaa]')).toBeNull();
    expect(parseSubscription(JSON.stringify({ endpoint: 'https://x' }))).toBeNull();
  });
});

describe('FCM adapter — the migration path (E12-T02)', () => {
  it('is unavailable, not broken, without a service account', async () => {
    const provider = createFcmProvider({});

    expect(provider.configured).toBe(false);
    expect((await provider.send(TARGETS, PAYLOAD))[0]?.status).toBe('permanent_error');
  });

  it('reports a malformed service account instead of crashing at boot', () => {
    expect(createFcmProvider({ serviceAccountJson: 'not json' }).configured).toBe(false);
    expect(
      createFcmProvider({ serviceAccountJson: JSON.stringify({ project_id: 'p' }) }).configured,
    ).toBe(false);
  });
});

describe('registry', () => {
  it('resolves each provider name to an adapter', () => {
    const registry = createPushRegistry({ mobileProvider: 'expo' });

    expect(registry.get('expo').name).toBe('expo');
    expect(registry.get('fcm').name).toBe('fcm');
    expect(registry.get('webpush').name).toBe('webpush');
  });

  it('switches the mobile default to FCM by configuration alone', () => {
    // The whole reason `push_provider` exists instead of `fcm_token`
    // (TECH-SPEC §6.1): no domain code, no schema change.
    const registry = createPushRegistry({
      mobileProvider: 'fcm',
      fcmProjectId: 'curhat-dong',
      fcmServiceAccountJson: JSON.stringify({
        client_email: 'push@curhat.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----\n',
        project_id: 'curhat-dong',
      }),
    });

    expect(registry.mobileProvider).toBe('fcm');
    expect(registry.configuredNames()).toContain('fcm');
  });

  it('lists only providers that can actually send', () => {
    const registry = createPushRegistry({ mobileProvider: 'expo' });

    expect(registry.configuredNames()).toContain('expo');
    expect(registry.configuredNames()).not.toContain('webpush');
  });
});

describe('helpers', () => {
  it('splits into batches without dropping the tail', () => {
    expect(batched([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(batched([], 2)).toEqual([]);
    expect(batched([1, 2], 0)).toEqual([[1, 2]]);
  });

  it('reports every target when a provider is unavailable', async () => {
    const provider = unavailableProvider('webpush', 'nope');
    const results = await provider.send(TARGETS, PAYLOAD);

    expect(results.map((r) => r.deviceId)).toEqual(['device-a', 'device-b']);
  });
});
