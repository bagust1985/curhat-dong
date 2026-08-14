import type { ApiMeta, ApiResponse, ErrorCode } from '@curhat/types';

/**
 * Browser API client — E15-T06 onwards. TECH-SPEC §3, §5.1.
 *
 * Three decisions worth knowing before using this:
 *
 *  1. **The access token lives in a module variable, not storage.** TECH-SPEC
 *     §5.1 forbids localStorage for tokens, and the API deliberately refuses to
 *     send the refresh token to a browser at all — it arrives as an HttpOnly
 *     cookie the page cannot read. So a reload starts with no access token and
 *     asks `/auth/refresh` for one. That is the intended cost.
 *  2. **Callers branch on `code`, never on `message`.** Messages are Indonesian
 *     copy that changes; codes are the contract.
 *  3. **Nothing here logs a request or response body.** On this product the
 *     body is somebody's curhat (CLAUDE.md non-negotiable #3), so there is no
 *     debug logging to accidentally leave switched on.
 */

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, string[]> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * The network itself failed — offline, DNS, CORS, connection reset.
 *
 * Distinguished from `ApiError` because the UI reaction is different: an
 * offline banner and a retry, not an error message about what the user did.
 */
export class NetworkError extends Error {
  constructor() {
    super('Koneksi lagi bermasalah.');
    this.name = 'NetworkError';
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  // `??` alone is not enough. An unset GitHub Actions variable reaches the
  // build as an *empty string*, which sails straight past a nullish check and
  // bakes an empty origin into the browser bundle — every request then
  // resolves against the web host and 404s, while the deploy health gate
  // (which only asks the API) still goes green. Empty is missing.
  //
  // The real guard is at build time in .github/workflows/images.yml; this is
  // the second lock on the same door.
  return configured && configured.length > 0 ? configured : 'http://localhost:3101';
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Skip the refresh-and-retry dance — used by the refresh call itself. */
  skipRefresh?: boolean;
  signal?: AbortSignal;
}

export interface ApiResult<T> {
  data: T;
  meta: ApiMeta;
}

function urlOf(path: string, query?: ApiRequest['query']): string {
  const url = new URL(`${baseUrl()}/v1${path}`);
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
      // The refresh cookie is HttpOnly and scoped to the auth path; it rides
      // along only because of this.
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        // Tells the API this is a browser, which is what makes it withhold the
        // refresh token from the response body (auth.controller.ts).
        'x-client-platform': 'web',
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
    // A body that is not JSON at all — a proxy error page, most likely. There
    // is nothing to read; the status still tells us what happened.
    payload = null;
  }

  if (!response.ok || payload?.error) {
    const error = payload?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Ada yang nggak beres di sisi kami. Coba lagi sebentar lagi ya.',
      response.status,
      error?.details,
    );
  }

  return { data: payload?.data as T, meta: payload?.meta ?? {} };
}

/**
 * Exchanges the refresh cookie for a fresh access token.
 *
 * Returns false rather than throwing when there is no valid session: "not
 * logged in" is an ordinary state on first visit, not an error.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const { data } = await once<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: {},
      skipRefresh: true,
    });
    setAccessToken(data.accessToken);
    return true;
  } catch {
    setAccessToken(null);
    return false;
  }
}

/**
 * A single in-flight refresh, shared.
 *
 * Without this, a page that fires five requests on mount with an expired token
 * would run five rotations of a *rotating* refresh token (E03-T04) — and reuse
 * detection would read four of them as a stolen token and revoke the family.
 */
let inFlightRefresh: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  inFlightRefresh ??= refreshSession().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
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
