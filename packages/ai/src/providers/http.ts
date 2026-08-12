import { AiProviderError, kindForStatus } from '../errors.js';
import type { AiProviderName } from '../types.js';

/**
 * Shared HTTP plumbing for the adapters.
 *
 * Deliberately built on `fetch` rather than a vendor SDK: the adapters are the
 * only place a provider's wire format is known, and pulling in one SDK per
 * provider would put a third-party dependency behind a boundary whose whole
 * purpose is to be swappable.
 */

/** Injection seam so the contract test can drive an adapter without a network. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpCallOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  provider: AiProviderName;
  fetchImpl: FetchLike;
}

export async function postJson(options: HttpCallOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await options.fetchImpl(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...options.headers },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The provider's error body can echo the prompt back; only the status is
      // carried forward (CLAUDE.md non-negotiable #3).
      throw new AiProviderError(
        kindForStatus(response.status),
        options.provider,
        `${options.provider} responded ${response.status}`,
        { status: response.status },
      );
    }

    return response;
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (isAbort(error)) {
      throw new AiProviderError('timeout', options.provider, 'Request aborted or timed out', {
        cause: error,
      });
    }
    throw new AiProviderError('server_error', options.provider, 'Network failure', {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
  );
}

/**
 * Yields the `data:` payloads of a Server-Sent Events stream.
 *
 * Buffers across chunk boundaries — a single SSE event routinely arrives split
 * across two TCP reads, and parsing per-chunk drops exactly those.
 */
export async function* readSseData(response: Response): AsyncGenerator<string> {
  const body = response.body;
  if (!body) return;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const data = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('');

        if (data) yield data;
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}
