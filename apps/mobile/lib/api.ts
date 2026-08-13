import type { ApiMeta, ApiResponse, ErrorCode } from '@curhat/types';

import { clearRefreshToken, readRefreshToken, writeRefreshToken } from './token-storage';

/**
 * API client for the app — E16-T03. TECH-SPEC §3, §5.1.
 *
 * Differs from the web client in exactly one way that matters: mobile identifies
 * itself with `X-Client-Platform: mobile`, which makes the API return the
 * refresh token in the response body instead of as a cookie
 * (`auth.controller.ts`). That token goes straight into SecureStore and is
 * never held anywhere else.
 *
 * `AUTH_REFRESH_REUSE_DETECTED` is handled as its own case. It means the token
 * family was revoked — usually because a stolen token was replayed — and the
 * only correct response is to wipe the stored token and make the person sign in
 * again, with a sentence that says what happened rather than a generic error.
 */

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export class NetworkError extends Error {
  constructor() {
    super('Koneksi lagi bermasalah.');
    this.name = 'NetworkError';
  }
}

/** Raised when the session is gone for good and the UI must return to login. */
export class SessionEndedError extends Error {
  readonly reason: 'reuse_detected' | 'expired';

  constructor(reason: 'reuse_detected' | 'expired') {
    super(
      reason === 'reuse_detected'
        ? 'Sesimu kami tutup karena ada yang mencurigakan. Masuk lagi ya.'
        : 'Sesimu udah habis. Masuk lagi ya.',
    );
    this.name = 'SessionEndedError';
    this.reason = reason;
  }
}

let accessToken: string | null = null;
let onSessionEnded: ((error: SessionEndedError) => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** The session provider registers here so any request can force a sign-out. */
export function setSessionEndedHandler(handler: ((error: SessionEndedError) => void) | null): void {
  onSessionEnded = handler;
}

export function apiBaseUrl(): string {
  // EXPO_PUBLIC_* only. Anything else would not reach the bundle, and anything
  // secret would be readable by unzipping the APK (TECH-SPEC §7.2).
  return process.env['EXPO_PUBLIC_API_URL'] ?? 'http://10.0.2.2:3101';
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

export interface ApiResult<T> {
  data: T;
  meta: ApiMeta;
}

function urlOf(path: string, query?: ApiRequest['query']): string {
  const url = new URL(`${apiBaseUrl()}/v1${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function once<T>(path: string, request: ApiRequest): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(urlOf(path, request.query), {
      method: request.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        'x-client-platform': 'mobile',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
  } catch {
    throw new NetworkError();
  }

  let payload: ApiResponse<T> | null;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.error) {
    const error = payload?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Ada yang nggak beres. Coba lagi sebentar lagi ya.',
      response.status,
    );
  }

  return { data: payload?.data as T, meta: payload?.meta ?? {} };
}

interface TokenPair {
  accessToken: string;
  refreshToken?: string;
}

/** Stores whatever the auth endpoints returned. Used by login and by refresh. */
export async function storeTokens(tokens: TokenPair): Promise<void> {
  setAccessToken(tokens.accessToken);
  if (tokens.refreshToken) await writeRefreshToken(tokens.refreshToken);
}

let inFlightRefresh: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  const refreshToken = await readRefreshToken();
  if (!refreshToken) return false;

  try {
    const { data } = await once<TokenPair>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      skipRefresh: true,
    });
    await storeTokens(data);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'AUTH_REFRESH_REUSE_DETECTED') {
      // The family was revoked. Keeping the token would retry forever against a
      // server that has already decided this session is compromised.
      await clearRefreshToken();
      setAccessToken(null);
      onSessionEnded?.(new SessionEndedError('reuse_detected'));
      return false;
    }
    if (error instanceof ApiError) {
      await clearRefreshToken();
      setAccessToken(null);
      onSessionEnded?.(new SessionEndedError('expired'));
    }
    return false;
  }
}

/**
 * One refresh at a time.
 *
 * The refresh token rotates (E03-T04): five concurrent requests with an expired
 * access token would rotate it five times, and reuse detection reads four of
 * those as a stolen token and revokes the whole family. This is the difference
 * between a slow screen and being logged out for opening the app too fast.
 */
function refreshOnce(): Promise<boolean> {
  inFlightRefresh ??= performRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

export async function restoreSession(): Promise<boolean> {
  return refreshOnce();
}

export async function api<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  try {
    return await once<T>(path, request);
  } catch (error) {
    const expired =
      error instanceof ApiError &&
      (error.code === 'AUTH_TOKEN_EXPIRED' || error.code === 'AUTH_TOKEN_INVALID');

    if (!expired || request.skipRefresh) throw error;

    const refreshed = await refreshOnce();
    if (!refreshed) throw error;

    return once<T>(path, request);
  }
}

export async function signOutLocally(): Promise<void> {
  setAccessToken(null);
  await clearRefreshToken();
}
