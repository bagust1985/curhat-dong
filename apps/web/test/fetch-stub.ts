import { vi } from 'vitest';

import type { ErrorCode } from '@curhat/types';

/**
 * Shared `fetch` stub for page-level tests — E15-T06 onwards.
 *
 * Every response goes through the `{ data, meta, error }` envelope (TECH-SPEC
 * §3), so tests describe the payload and this builds the envelope.
 *
 * `ok()` and `err()` are explicit rather than inferred from the returned
 * object: an earlier version guessed the HTTP status by looking for a `status`
 * key, which quietly broke the moment a real endpoint answered
 * `{ status: 'sent' }` — a 200 body read as an HTTP status of "sent".
 */

export interface StubbedResponse {
  __http: number;
  body: unknown;
}

export function ok(data: unknown = {}, meta: Record<string, unknown> = {}): StubbedResponse {
  return { __http: 200, body: { data, meta, error: null } };
}

export function err(status: number, code: ErrorCode, message = 'gagal'): StubbedResponse {
  return { __http: status, body: { data: null, meta: {}, error: { code, message } } };
}

export type FetchHandler = (url: string, init: RequestInit) => StubbedResponse | undefined;

/** Installs the stub and returns the spy, for asserting what was requested. */
export function stubFetch(handler: FetchHandler) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const result = handler(url, init ?? {}) ?? ok({});
    return {
      ok: result.__http < 400,
      status: result.__http,
      json: async () => result.body,
    } as Response;
  });

  vi.stubGlobal('fetch', spy);
  return spy;
}

/** The requests a test made, as `METHOD /v1/path` strings. */
export function requestsOf(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map(([input, init]) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
    return `${method} ${new URL(String(input)).pathname}`;
  });
}

/** The JSON body of the first request matching `METHOD /v1/path`. */
export function bodyOf(spy: { mock: { calls: unknown[][] } }, target: string): unknown {
  const calls = requestsOf(spy);
  const index = calls.indexOf(target);
  if (index < 0) throw new Error(`tidak ada request ${target}; yang ada: ${calls.join(', ')}`);
  const init = spy.mock.calls[index]?.[1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}
