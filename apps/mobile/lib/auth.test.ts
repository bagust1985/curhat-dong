import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real module talks to the Android Keystore; the backend is swapped below.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

import type { SessionEndedError } from './api';
import {
  ApiError,
  api,
  getAccessToken,
  restoreSession,
  setAccessToken,
  setSessionEndedHandler,
  signOutLocally,
  storeTokens,
} from './api';
import { STORAGE_KEYS, setSecureBackend } from './token-storage';

/** An in-memory stand-in for the keystore, with a record of every write. */
function fakeKeystore() {
  const values = new Map<string, string>();
  const writes: string[] = [];

  setSecureBackend({
    getItemAsync: async (key) => values.get(key) ?? null,
    setItemAsync: async (key, value) => {
      writes.push(key);
      values.set(key, value);
    },
    deleteItemAsync: async (key) => {
      values.delete(key);
    },
  });

  return { values, writes };
}

interface StubbedCall {
  status: number;
  body: unknown;
}

function stubFetch(handler: (url: string, init: RequestInit) => StubbedCall) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const result = handler(String(input), init ?? {});
    return {
      ok: result.status < 400,
      status: result.status,
      json: async () => result.body,
    } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const okBody = (data: unknown) => ({ data, meta: {}, error: null });
const errBody = (code: string) => ({ data: null, meta: {}, error: { code, message: 'gagal' } });

beforeEach(() => {
  setAccessToken(null);
  setSessionEndedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/**
 * Mobile auth — E16-T03. TECH-SPEC §5.1, §5.3.
 */
describe('what gets written to the device', () => {
  it('stores the refresh token in SecureStore and nothing else', async () => {
    const store = fakeKeystore();

    await storeTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(store.writes).toEqual([STORAGE_KEYS.refresh]);
    expect(store.values.get(STORAGE_KEYS.refresh)).toBe('refresh-1');
  });

  it('keeps the access token in memory only', async () => {
    const store = fakeKeystore();

    await storeTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    expect(getAccessToken()).toBe('access-1');
    // A 15-minute secret written to disk becomes a persistent one.
    expect([...store.values.values()]).not.toContain('access-1');
  });

  it('wipes the stored token on sign-out', async () => {
    const store = fakeKeystore();
    await storeTokens({ accessToken: 'a', refreshToken: 'r' });

    await signOutLocally();

    expect(store.values.size).toBe(0);
    expect(getAccessToken()).toBeNull();
  });
});

describe('coming back to a closed app', () => {
  it('restores the session from the stored refresh token', async () => {
    const store = fakeKeystore();
    store.values.set(STORAGE_KEYS.refresh, 'refresh-1');

    const spy = stubFetch(() => ({
      status: 200,
      body: okBody({ accessToken: 'access-2', refreshToken: 'refresh-2' }),
    }));

    expect(await restoreSession()).toBe(true);
    expect(getAccessToken()).toBe('access-2');
    // Rotated: the new token replaced the old one on disk.
    expect(store.values.get(STORAGE_KEYS.refresh)).toBe('refresh-2');
    expect(spy).toHaveBeenCalledOnce();
  });

  it('reports no session rather than failing when nothing is stored', async () => {
    fakeKeystore();
    const spy = stubFetch(() => ({ status: 200, body: okBody({}) }));

    expect(await restoreSession()).toBe(false);
    // Not even attempted — there is nothing to send.
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends the refresh token in the body, the way a mobile client must', async () => {
    const store = fakeKeystore();
    store.values.set(STORAGE_KEYS.refresh, 'refresh-1');

    const spy = stubFetch(() => ({ status: 200, body: okBody({ accessToken: 'a' }) }));
    await restoreSession();

    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ refreshToken: 'refresh-1' });
    // The header is what makes the API answer with a body token instead of a
    // cookie (auth.controller.ts).
    expect((init.headers as Record<string, string>)['x-client-platform']).toBe('mobile');
  });
});

describe('reuse detection', () => {
  it('signs the person out with a sentence that says what happened', async () => {
    const store = fakeKeystore();
    store.values.set(STORAGE_KEYS.refresh, 'stolen');

    const ended: SessionEndedError[] = [];
    setSessionEndedHandler((error) => ended.push(error));

    stubFetch(() => ({ status: 401, body: errBody('AUTH_REFRESH_REUSE_DETECTED') }));

    expect(await restoreSession()).toBe(false);
    expect(ended).toHaveLength(1);
    expect(ended[0]?.reason).toBe('reuse_detected');
    expect(ended[0]?.message).toMatch(/mencurigakan/i);
    // The revoked token is gone: retrying with it would loop forever against a
    // server that has already closed the family.
    expect(store.values.size).toBe(0);
  });
});

describe('token expiry mid-use', () => {
  it('refreshes once and retries the original request', async () => {
    const store = fakeKeystore();
    store.values.set(STORAGE_KEYS.refresh, 'refresh-1');
    setAccessToken('expired');

    let feedCalls = 0;
    const spy = stubFetch((url) => {
      if (url.includes('/auth/refresh')) {
        return { status: 200, body: okBody({ accessToken: 'fresh', refreshToken: 'refresh-2' }) };
      }
      feedCalls += 1;
      return feedCalls === 1
        ? { status: 401, body: errBody('AUTH_TOKEN_EXPIRED') }
        : { status: 200, body: okBody({ items: [] }) };
    });

    const { data } = await api<{ items: unknown[] }>('/feed');

    expect(data.items).toEqual([]);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(getAccessToken()).toBe('fresh');
  });

  it('rotates the refresh token exactly once for concurrent requests', async () => {
    const store = fakeKeystore();
    store.values.set(STORAGE_KEYS.refresh, 'refresh-1');
    setAccessToken('expired');

    let refreshCalls = 0;

    // Keyed off the token actually presented, the way the server decides:
    // every parallel call starts with the expired one.
    stubFetch((url, init) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return { status: 200, body: okBody({ accessToken: 'fresh', refreshToken: 'refresh-2' }) };
      }
      const auth = (init.headers as Record<string, string>)?.['authorization'];
      return auth === 'Bearer expired'
        ? { status: 401, body: errBody('AUTH_TOKEN_EXPIRED') }
        : { status: 200, body: okBody({}) };
    });

    await Promise.all([api('/feed'), api('/me'), api('/notifications')]);

    // Five rotations of a rotating token would look like a replay attack to the
    // server and revoke the family — logging someone out for opening the app
    // too quickly.
    expect(refreshCalls).toBe(1);
  });

  it('leaves other errors alone', async () => {
    fakeKeystore();
    setAccessToken('valid');
    stubFetch(() => ({ status: 429, body: errBody('RATE_LIMITED') }));

    await expect(api('/posts')).rejects.toBeInstanceOf(ApiError);
  });
});
